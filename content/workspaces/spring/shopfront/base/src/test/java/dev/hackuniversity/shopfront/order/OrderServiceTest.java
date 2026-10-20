package dev.hackuniversity.shopfront.order;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;
import static org.mockito.Mockito.never;

import dev.hackuniversity.shopfront.auth.CurrentUser;
import dev.hackuniversity.shopfront.catalog.Category;
import dev.hackuniversity.shopfront.catalog.Product;
import dev.hackuniversity.shopfront.catalog.ProductRepository;
import dev.hackuniversity.shopfront.common.ConflictException;
import dev.hackuniversity.shopfront.common.NotFoundException;
import dev.hackuniversity.shopfront.common.UnprocessableException;
import dev.hackuniversity.shopfront.config.ShopProperties;
import dev.hackuniversity.shopfront.customer.Customer;
import dev.hackuniversity.shopfront.customer.CustomerRepository;
import dev.hackuniversity.shopfront.customer.Role;
import dev.hackuniversity.shopfront.order.dto.LineRequest;
import dev.hackuniversity.shopfront.order.dto.OrderResponse;
import dev.hackuniversity.shopfront.order.dto.PlaceOrderRequest;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Unit tests for the checkout rules: no Spring, no database. The repositories are Mockito
 * mocks, the settings and the Clock are real objects, and the clock is fixed, so "24 hours
 * ago" means the same thing on every run.
 */
@ExtendWith(MockitoExtension.class)
class OrderServiceTest {

    private static final Instant NOW = Instant.parse("2026-03-31T12:00:00Z");

    @Mock
    OrderRepository orders;

    @Mock
    ProductRepository products;

    @Mock
    CustomerRepository customers;

    OrderService service;

    final Customer ana = new Customer("ana@example.com", "Ana Lima", "{noop}unused", Role.CUSTOMER, NOW);
    final Category kitchen = new Category("Kitchen", "kitchen");
    final Product knife = new Product("KT-001", "Chef's Knife", "", 7999, 20, kitchen);
    final Product board = new Product("KT-005", "Bamboo Cutting Board", "", 2499, 28, kitchen);

    @BeforeEach
    void createService() {
        ShopProperties shop = new ShopProperties("USD", new BigDecimal("0.0825"), 5000,
                new ShopProperties.Jwt("a-test-secret-that-is-at-least-32-bytes", Duration.ofHours(1)));
        service = new OrderService(orders, products, customers, shop, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void placingAnOrderCopiesPricesTakesStockAndAddsTax() {
        given(customers.findByEmail("ana@example.com")).willReturn(Optional.of(ana));
        given(products.findBySkuIn(List.of("KT-001", "KT-005"))).willReturn(List.of(knife, board));
        given(orders.save(any(Order.class))).willAnswer(call -> withId(call.getArgument(0), 11L));

        OrderResponse order = service.placeOrder("ana@example.com", orderOf(line("KT-001", 1), line("KT-005", 2)));

        assertThat(order.lines()).extracting(OrderResponse.Line::unitPriceCents).containsExactly(7999L, 2499L);
        assertThat(order.subtotalCents()).isEqualTo(12_997);
        assertThat(order.taxCents()).isEqualTo(1_072);
        assertThat(order.totalCents()).isEqualTo(14_069);
        assertThat(order.currency()).isEqualTo("USD");
        assertThat(knife.getStock()).isEqualTo(19);
        assertThat(board.getStock()).isEqualTo(26);
    }

    @ParameterizedTest(name = "{0} cents at 8.25% is {1} cents of tax")
    @CsvSource({
            "0, 0",
            "1000, 83",
            "1212, 100",
            "7998, 660",
            "12997, 1072",
            "47899, 3952"
    })
    void taxIsRoundedToTheNearestCentWithHalvesRoundingUp(long subtotalCents, long taxCents) {
        assertThat(OrderService.taxOn(subtotalCents, 825)).isEqualTo(taxCents);
    }

    @Test
    void orderingMoreThanTheStockIsAConflictAndSavesNothing() {
        given(customers.findByEmail("ana@example.com")).willReturn(Optional.of(ana));
        given(products.findBySkuIn(List.of("KT-001"))).willReturn(List.of(knife));

        assertThatThrownBy(() -> service.placeOrder("ana@example.com", orderOf(line("KT-001", 21))))
                .isInstanceOf(ConflictException.class)
                .hasMessage("Only 20 left of KT-001, not 21.");
        then(orders).should(never()).save(any());
    }

    @Test
    void anUnknownSkuIsUnprocessable() {
        given(customers.findByEmail("ana@example.com")).willReturn(Optional.of(ana));
        given(products.findBySkuIn(List.of("KT-999"))).willReturn(List.of());

        assertThatThrownBy(() -> service.placeOrder("ana@example.com", orderOf(line("KT-999", 1))))
                .isInstanceOf(UnprocessableException.class)
                .hasMessage("No product with SKU KT-999 is for sale.");
    }

    @Test
    void theSameSkuOnTwoLinesIsUnprocessable() {
        given(customers.findByEmail("ana@example.com")).willReturn(Optional.of(ana));
        given(products.findBySkuIn(List.of("KT-001", "KT-001"))).willReturn(List.of(knife));

        assertThatThrownBy(() -> service.placeOrder("ana@example.com", orderOf(line("KT-001", 1), line("KT-001", 2))))
                .isInstanceOf(UnprocessableException.class)
                .hasMessageStartingWith("KT-001 appears on more than one line.");
        then(orders).should(never()).save(any());
    }

    @Test
    void cancellingWithin24HoursCancelsAndPutsTheStockBack() {
        Order order = placedOrder(NOW.minus(Duration.ofHours(23)));
        given(orders.findWithLinesById(7L)).willReturn(Optional.of(order));

        OrderResponse cancelled = service.cancel(7L, new CurrentUser("ana@example.com", false));

        assertThat(cancelled.status()).isEqualTo(OrderStatus.CANCELLED);
        assertThat(cancelled.cancelledAt()).isEqualTo(NOW);
        assertThat(knife.getStock()).isEqualTo(22);
    }

    @Test
    void cancellingAfter24HoursIsAConflict() {
        Order order = placedOrder(NOW.minus(Duration.ofHours(25)));
        given(orders.findWithLinesById(7L)).willReturn(Optional.of(order));

        assertThatThrownBy(() -> service.cancel(7L, new CurrentUser("ana@example.com", false)))
                .isInstanceOf(ConflictException.class)
                .hasFieldOrPropertyWithValue("title", "Cancellation window closed");
        assertThat(knife.getStock()).isEqualTo(20);
    }

    @Test
    void anotherCustomersOrderIsNotFoundButAnAdminSeesIt() {
        Order order = placedOrder(NOW.minus(Duration.ofHours(1)));
        given(orders.findWithLinesById(7L)).willReturn(Optional.of(order));

        assertThatThrownBy(() -> service.get(7L, new CurrentUser("bob@example.com", false)))
                .isInstanceOf(NotFoundException.class);
        assertThat(service.get(7L, new CurrentUser("admin@example.com", true)).id()).isEqualTo(7L);
    }

    private Order placedOrder(Instant placedAt) {
        Order order = new Order(ana, "USD", 825);
        order.addLine(knife, 2);
        order.stampPlacedAt(placedAt);
        return withId(order, 7L);
    }

    // The database assigns ids, and these tests have no database, so they set one directly.
    private static Order withId(Order order, long id) {
        ReflectionTestUtils.setField(order, "id", id);
        return order;
    }

    private static PlaceOrderRequest orderOf(LineRequest... lines) {
        return new PlaceOrderRequest(List.of(lines));
    }

    private static LineRequest line(String sku, int quantity) {
        return new LineRequest(sku, quantity);
    }
}
