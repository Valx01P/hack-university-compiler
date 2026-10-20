package dev.hackuniversity.shopfront.order.dto;

import dev.hackuniversity.shopfront.order.Order;
import dev.hackuniversity.shopfront.order.OrderLine;
import dev.hackuniversity.shopfront.order.OrderStatus;
import java.time.Instant;
import java.util.List;

/** One order in full: its lines with the prices paid, and the totals in cents. */
public record OrderResponse(long id, OrderStatus status, List<Line> lines, String currency, long subtotalCents,
        long taxCents, long totalCents, Instant placedAt, Instant cancelledAt) {

    public record Line(String sku, String name, int quantity, long unitPriceCents, long lineTotalCents) {

        static Line from(OrderLine line) {
            return new Line(line.getProduct().getSku(), line.getProduct().getName(), line.getQuantity(),
                    line.getUnitPriceCents(), line.lineTotalCents());
        }
    }

    public static OrderResponse from(Order order) {
        return new OrderResponse(order.getId(), order.getStatus(), order.getLines().stream().map(Line::from).toList(),
                order.getCurrency(), order.getSubtotalCents(), order.getTaxCents(), order.getTotalCents(),
                order.getPlacedAt(), order.getCancelledAt());
    }
}
