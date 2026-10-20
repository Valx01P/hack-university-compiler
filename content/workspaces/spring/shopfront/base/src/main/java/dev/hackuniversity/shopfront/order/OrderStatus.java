package dev.hackuniversity.shopfront.order;

/** Where an order is in its life. Stored by name in orders.status. */
public enum OrderStatus {
    PLACED,
    PAID,
    SHIPPED,
    CANCELLED
}
