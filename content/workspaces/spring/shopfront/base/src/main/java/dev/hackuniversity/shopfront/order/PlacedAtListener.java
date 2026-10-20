package dev.hackuniversity.shopfront.order;

import jakarta.persistence.PrePersist;
import java.time.Clock;
import java.time.Instant;
import org.springframework.stereotype.Component;

/**
 * A pre-database hook: JPA calls stamp() for every new order just before the INSERT, so no
 * code path can save an order without a placedAt. Spring Boot creates entity listeners as
 * beans, which is how this one receives the shop's Clock through its constructor.
 */
@Component
public class PlacedAtListener {

    private final Clock clock;

    public PlacedAtListener(Clock clock) {
        this.clock = clock;
    }

    @PrePersist
    void stamp(Order order) {
        order.stampPlacedAt(Instant.now(clock));
    }
}
