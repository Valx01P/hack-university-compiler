package dev.hackuniversity.shopfront.order.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;

/** One line of a new order: which product and how many. */
public record LineRequest(
        @NotNull @Pattern(regexp = "[A-Z]{2}-\\d{3}", message = "must look like AB-123") String sku,
        @NotNull @Positive @Max(50) Integer quantity) {
}
