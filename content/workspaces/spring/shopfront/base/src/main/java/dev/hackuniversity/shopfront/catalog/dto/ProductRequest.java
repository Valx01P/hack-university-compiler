package dev.hackuniversity.shopfront.catalog.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/**
 * The body of POST /api/products and PUT /api/products/{sku}. Numbers are wrapper types, so a
 * missing field arrives as null and fails @NotNull with a clear message, instead of failing
 * to parse (Jackson 3 refuses to put null into a primitive).
 */
public record ProductRequest(
        @NotNull @Pattern(regexp = "[A-Z]{2}-\\d{3}", message = "must look like AB-123") String sku,
        @NotBlank @Size(max = 120) String name,
        @Size(max = 2000) String description,
        @NotNull @Positive @Max(10_000_000) Long priceCents,
        @NotNull @PositiveOrZero @Max(100_000) Integer stock,
        @NotBlank String category,
        Boolean active) {

    // Optional fields get their defaults here, before validation runs.
    public ProductRequest {
        description = description == null ? "" : description.strip();
        active = active == null ? Boolean.TRUE : active;
    }
}
