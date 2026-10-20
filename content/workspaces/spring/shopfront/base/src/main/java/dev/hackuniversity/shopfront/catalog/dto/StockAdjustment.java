package dev.hackuniversity.shopfront.catalog.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/** The body of POST /api/products/{sku}/stock: how many arrived (positive) or left (negative). */
public record StockAdjustment(@NotNull @Min(-10_000) @Max(10_000) Integer change) {
}
