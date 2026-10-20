package dev.hackuniversity.shopfront.order;

import dev.hackuniversity.shopfront.auth.CurrentUser;
import dev.hackuniversity.shopfront.catalog.Product;
import dev.hackuniversity.shopfront.catalog.ProductRepository;
import dev.hackuniversity.shopfront.common.NotFoundException;
import dev.hackuniversity.shopfront.common.UnprocessableException;
import dev.hackuniversity.shopfront.config.ShopProperties;
import dev.hackuniversity.shopfront.customer.Customer;
import dev.hackuniversity.shopfront.customer.CustomerRepository;
import dev.hackuniversity.shopfront.order.dto.LineRequest;
import dev.hackuniversity.shopfront.order.dto.OrderResponse;
import dev.hackuniversity.shopfront.order.dto.OrderSummary;
import dev.hackuniversity.shopfront.order.dto.PlaceOrderRequest;
import java.time.Clock;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Service layer: checkout and order history. Placing an order is one transaction: check every
 * line, take the stock, copy each price into the order, add up the totals, and save. If any
 * step throws, all of it rolls back, stock included.
 */
@Service
@Transactional(readOnly = true)
public class OrderService {

    private static final Sort NEWEST_FIRST = Sort.by(Sort.Direction.DESC, "placedAt", "id");

    private final OrderRepository orders;
    private final ProductRepository products;
    private final CustomerRepository customers;
    private final ShopProperties shop;
    private final Clock clock;

    public OrderService(OrderRepository orders, ProductRepository products, CustomerRepository customers,
            ShopProperties shop, Clock clock) {
        this.orders = orders;
        this.products = products;
        this.customers = customers;
        this.shop = shop;
        this.clock = clock;
    }

    @Transactional
    public OrderResponse placeOrder(String email, PlaceOrderRequest request) {
        Customer customer = customers.findByEmail(email)
                .orElseThrow(() -> new NotFoundException("Customer not found", "No account for " + email + "."));
        List<String> skus = request.lines().stream().map(LineRequest::sku).toList();
        Map<String, Product> productsBySku = products.findBySkuIn(skus).stream()
                .collect(Collectors.toMap(Product::getSku, Function.identity()));

        Order order = new Order(customer, shop.currency(), shop.taxRateBasisPoints());
        Set<String> seen = new HashSet<>();
        for (LineRequest line : request.lines()) {
            if (!seen.add(line.sku())) {
                throw new UnprocessableException("Duplicate SKU",
                        "%s appears on more than one line. Order it once with the total quantity.".formatted(line.sku()),
                        Map.of("sku", line.sku()));
            }
            Product product = productsBySku.get(line.sku());
            if (product == null || !product.isActive()) {
                throw new UnprocessableException("Unknown product",
                        "No product with SKU %s is for sale.".formatted(line.sku()), Map.of("sku", line.sku()));
            }
            product.removeStock(line.quantity());
            order.addLine(product, line.quantity());
        }
        applyTotals(order);
        return OrderResponse.from(orders.save(order));
    }

    public Page<OrderSummary> listFor(String email, Pageable pageable) {
        Pageable newestFirst = PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(), NEWEST_FIRST);
        return orders.findByCustomerEmail(email, newestFirst).map(OrderSummary::from);
    }

    public OrderResponse get(long id, CurrentUser user) {
        return OrderResponse.from(requireVisible(id, user));
    }

    @Transactional
    public OrderResponse cancel(long id, CurrentUser user) {
        Order order = requireVisible(id, user);
        order.cancel(Instant.now(clock));
        order.getLines().forEach(line -> line.getProduct().addStock(line.getQuantity()));
        return OrderResponse.from(order);
    }

    /** Tax in whole cents: subtotal times the rate in basis points over 10,000, half a cent rounding up. */
    static long taxOn(long subtotalCents, int taxRateBasisPoints) {
        return (subtotalCents * taxRateBasisPoints + 5_000) / 10_000;
    }

    private void applyTotals(Order order) {
        long subtotal = order.getLines().stream().mapToLong(OrderLine::lineTotalCents).sum();
        order.applyTotals(subtotal, taxOn(subtotal, order.getTaxRateBasisPoints()));
    }

    // Someone else's order answers 404, not 403, so order ids do not reveal which orders exist.
    private Order requireVisible(long id, CurrentUser user) {
        return orders.findWithLinesById(id)
                .filter(order -> user.admin() || order.isPlacedBy(user.email()))
                .orElseThrow(() -> new NotFoundException("Order not found", "No order with id %d.".formatted(id)));
    }
}
