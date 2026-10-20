package dev.hackuniversity.shopfront.catalog;

import dev.hackuniversity.shopfront.catalog.dto.ProductCard;
import dev.hackuniversity.shopfront.catalog.dto.ProductRequest;
import dev.hackuniversity.shopfront.catalog.dto.ProductResponse;
import dev.hackuniversity.shopfront.catalog.dto.StockAdjustment;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.net.URI;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.data.web.PagedModel;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Web layer: the catalog over HTTP. GETs are public, and every write needs an ADMIN token
 * (SecurityConfig decides that, not this class). It reads the request, calls CatalogService,
 * and picks the status code. It never touches a repository or returns an entity.
 */
@RestController
@RequestMapping("/api/products")
public class ProductController {

    private final CatalogService catalog;

    public ProductController(CatalogService catalog) {
        this.catalog = catalog;
    }

    // GET /api/products?q=torch&category=outdoors&inStock=true&page=0&size=20&sort=priceCents,desc
    @GetMapping
    public PagedModel<ProductCard> search(
            @RequestParam(required = false) @Size(max = 100) String q,
            @RequestParam(required = false) String category,
            @RequestParam(defaultValue = "false") boolean inStock,
            @PageableDefault(size = 20, sort = "name") Pageable pageable) {
        return new PagedModel<>(catalog.search(q, category, inStock, pageable));
    }

    @GetMapping("/{sku}")
    public ProductResponse get(@PathVariable String sku) {
        return catalog.get(sku);
    }

    @PostMapping
    public ResponseEntity<ProductResponse> create(@Valid @RequestBody ProductRequest request) {
        ProductResponse product = catalog.create(request);
        return ResponseEntity.created(URI.create("/api/products/" + product.sku())).body(product);
    }

    @PutMapping("/{sku}")
    public ProductResponse update(@PathVariable String sku, @Valid @RequestBody ProductRequest request) {
        return catalog.update(sku, request);
    }

    // Deleting keeps the row (orders point at it) and takes the product off sale.
    @DeleteMapping("/{sku}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String sku) {
        catalog.deactivate(sku);
    }

    @PostMapping("/{sku}/stock")
    public ProductResponse adjustStock(@PathVariable String sku, @Valid @RequestBody StockAdjustment adjustment) {
        return catalog.adjustStock(sku, adjustment.change());
    }
}
