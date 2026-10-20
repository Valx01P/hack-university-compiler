package dev.hackuniversity.shopfront.order.dto;

import dev.hackuniversity.shopfront.order.Order;
import dev.hackuniversity.shopfront.order.OrderStatus;
import java.time.Instant;

/** An order in a list. Built from the order row alone, so a page of them needs no extra queries. */
public record OrderSummary(long id, OrderStatus status, long totalCents, String currency, Instant placedAt) {

    public static OrderSummary from(Order order) {
        return new OrderSummary(order.getId(), order.getStatus(), order.getTotalCents(), order.getCurrency(),
                order.getPlacedAt());
    }
}
