package dev.hackuniversity.shopfront.catalog;

import dev.hackuniversity.shopfront.catalog.dto.CategoryResponse;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Web layer: GET /api/categories lists the shop's categories by name. Public. */
@RestController
@RequestMapping("/api/categories")
public class CategoryController {

    private final CatalogService catalog;

    public CategoryController(CatalogService catalog) {
        this.catalog = catalog;
    }

    @GetMapping
    public List<CategoryResponse> list() {
        return catalog.categories();
    }
}
