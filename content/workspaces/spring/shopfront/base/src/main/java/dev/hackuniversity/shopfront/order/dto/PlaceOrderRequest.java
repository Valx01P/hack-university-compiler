package dev.hackuniversity.shopfront.order.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

/** The body of POST /api/orders. @Valid on the element type checks every line too. */
public record PlaceOrderRequest(@NotEmpty @Size(max = 20) List<@Valid @NotNull LineRequest> lines) {
}
