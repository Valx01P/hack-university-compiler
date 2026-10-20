package dev.hackuniversity.shopfront.config;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Configuration: the one Clock that every class asks for the time. Nothing in the shop calls
 * Instant.now() without it, so fixing the clock (app.clock.fixed, read from HU_FIXED_TIME)
 * makes orders, tokens, and the 24-hour cancel window come out the same on every run.
 */
@Configuration(proxyBeanMethods = false)
public class ClockConfig {

    @Bean
    Clock clock(@Value("${app.clock.fixed:}") String fixedInstant) {
        if (fixedInstant.isBlank()) {
            return Clock.systemUTC();
        }
        return Clock.fixed(Instant.parse(fixedInstant), ZoneOffset.UTC);
    }
}
