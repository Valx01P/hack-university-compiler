package dev.hackuniversity.shopfront.catalog.dto;

import dev.hackuniversity.shopfront.catalog.Product;

/** One product in full, for GET /api/products/{sku} and the admin endpoints. category is the slug. */
public record ProductResponse(String sku, String name, String description, long priceCents, int stock,
        String category, boolean active) {

    public static ProductResponse from(Product product) {
        return new ProductResponse(product.getSku(), product.getName(), product.getDescription(),
                product.getPriceCents(), product.getStock(), product.getCategory().getSlug(), product.isActive());
    }
}
