package dev.hackuniversity.shopfront.catalog.dto;

import dev.hackuniversity.shopfront.catalog.Category;

/** A category as clients see it. The slug is what ?category= takes. */
public record CategoryResponse(String slug, String name) {

    public static CategoryResponse from(Category category) {
        return new CategoryResponse(category.getSlug(), category.getName());
    }
}
