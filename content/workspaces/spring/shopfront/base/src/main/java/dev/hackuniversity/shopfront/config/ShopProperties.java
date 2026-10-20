package dev.hackuniversity.shopfront.config;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * Configuration: every shop.* setting in application.yml, bound into one record and validated
 * at startup. A bad value stops the app with a message naming the setting, long before the
 * first order would have failed on it.
 */
@Validated
@ConfigurationProperties("shop")
public record ShopProperties(
        @NotBlank @Pattern(regexp = "[A-Z]{3}") String currency,
        @NotNull @DecimalMin("0.0") @DecimalMax("0.5") @Digits(integer = 1, fraction = 4) BigDecimal taxRate,
        @PositiveOrZero long freeShippingOverCents,
        @Valid @NotNull Jwt jwt) {

    public record Jwt(@NotBlank @Size(min = 32) String secret, @NotNull Duration ttl) {}

    /** The tax rate in basis points (hundredths of a percent): 0.0825 is 825. */
    public int taxRateBasisPoints() {
        return taxRate.movePointRight(4).intValueExact();
    }
}
