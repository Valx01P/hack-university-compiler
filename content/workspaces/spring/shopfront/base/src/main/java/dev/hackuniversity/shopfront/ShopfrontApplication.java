package dev.hackuniversity.shopfront;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/**
 * The entry point. Component scanning starts in this package, so every feature package
 * (auth, catalog, customer, order) and the shared ones (config, common) sit below it.
 */
@SpringBootApplication
@ConfigurationPropertiesScan
public class ShopfrontApplication {

    public static void main(String[] args) {
        SpringApplication.run(ShopfrontApplication.class, args);
    }
}
