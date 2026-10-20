package dev.hackuniversity.shopfront.catalog.dto;

import dev.hackuniversity.shopfront.catalog.Product;

/** A product in a list: enough to draw a card, with whether it is in stock and ships free on its own. */
public record ProductCard(String sku, String name, long priceCents, String category, boolean inStock,
        boolean freeShipping) {

    public static ProductCard from(Product product, long freeShippingOverCents) {
        return new ProductCard(product.getSku(), product.getName(), product.getPriceCents(),
                product.getCategory().getSlug(), product.getStock() > 0,
                product.getPriceCents() >= freeShippingOverCents);
    }
}
