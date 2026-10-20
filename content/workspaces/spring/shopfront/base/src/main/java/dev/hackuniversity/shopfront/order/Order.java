package dev.hackuniversity.shopfront.order;

import dev.hackuniversity.shopfront.catalog.Product;
import dev.hackuniversity.shopfront.common.ConflictException;
import dev.hackuniversity.shopfront.customer.Customer;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Domain model: an order and its lines, saved together (a JPA aggregate). The table is
 * "orders" because ORDER is an SQL keyword. The order keeps its own currency and tax rate,
 * so its totals still add up after the shop's settings change. placedAt is set by
 * PlacedAtListener just before the first insert.
 */
@Entity
@Table(name = "orders")
@EntityListeners(PlacedAtListener.class)
public class Order {

    static final Duration CANCEL_WINDOW = Duration.ofHours(24);

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "customer_id")
    private Customer customer;

    @Enumerated(EnumType.STRING)
    private OrderStatus status;

    private String currency;

    private int taxRateBasisPoints;

    private long subtotalCents;

    private long taxCents;

    private long totalCents;

    private Instant placedAt;

    private Instant cancelledAt;

    // Lines live and die with their order: saving the order inserts them (cascade), and a line
    // removed from this list is deleted (orphanRemoval).
    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id")
    private List<OrderLine> lines = new ArrayList<>();

    protected Order() {
        // for JPA
    }

    public Order(Customer customer, String currency, int taxRateBasisPoints) {
        this.customer = customer;
        this.currency = currency;
        this.taxRateBasisPoints = taxRateBasisPoints;
        this.status = OrderStatus.PLACED;
    }

    public void addLine(Product product, int quantity) {
        lines.add(new OrderLine(this, product, quantity, product.getPriceCents()));
    }

    public void applyTotals(long subtotalCents, long taxCents) {
        this.subtotalCents = subtotalCents;
        this.taxCents = taxCents;
        this.totalCents = subtotalCents + taxCents;
    }

    public boolean isPlacedBy(String email) {
        return customer.getEmail().equals(email);
    }

    /** Placed and paid orders can be cancelled within 24 hours of being placed. Shipped ones cannot. */
    public void cancel(Instant now) {
        switch (status) {
            case CANCELLED -> throw new ConflictException("Order already cancelled",
                    "Order %d was cancelled at %s.".formatted(id, cancelledAt));
            case SHIPPED -> throw new ConflictException("Order already shipped",
                    "Order %d has shipped and can no longer be cancelled.".formatted(id));
            case PLACED, PAID -> {
                if (now.isAfter(placedAt.plus(CANCEL_WINDOW))) {
                    throw new ConflictException("Cancellation window closed",
                            "Order %d was placed at %s, more than 24 hours ago.".formatted(id, placedAt));
                }
                status = OrderStatus.CANCELLED;
                cancelledAt = now;
            }
        }
    }

    void stampPlacedAt(Instant instant) {
        this.placedAt = instant;
    }

    public Long getId() {
        return id;
    }

    public Customer getCustomer() {
        return customer;
    }

    public OrderStatus getStatus() {
        return status;
    }

    public String getCurrency() {
        return currency;
    }

    public int getTaxRateBasisPoints() {
        return taxRateBasisPoints;
    }

    public long getSubtotalCents() {
        return subtotalCents;
    }

    public long getTaxCents() {
        return taxCents;
    }

    public long getTotalCents() {
        return totalCents;
    }

    public Instant getPlacedAt() {
        return placedAt;
    }

    public Instant getCancelledAt() {
        return cancelledAt;
    }

    public List<OrderLine> getLines() {
        return Collections.unmodifiableList(lines);
    }
}
