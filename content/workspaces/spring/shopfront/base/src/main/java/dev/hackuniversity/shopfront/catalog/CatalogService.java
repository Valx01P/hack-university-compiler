package dev.hackuniversity.shopfront.catalog;

import dev.hackuniversity.shopfront.catalog.dto.CategoryResponse;
import dev.hackuniversity.shopfront.catalog.dto.ProductCard;
import dev.hackuniversity.shopfront.catalog.dto.ProductRequest;
import dev.hackuniversity.shopfront.catalog.dto.ProductResponse;
import dev.hackuniversity.shopfront.common.ConflictException;
import dev.hackuniversity.shopfront.common.NotFoundException;
import dev.hackuniversity.shopfront.common.UnprocessableException;
import dev.hackuniversity.shopfront.config.ShopProperties;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Service layer: the catalog's rules. Shoppers see active products only. Admins create,
 * edit, deactivate, and restock them. Each method runs in one transaction and returns
 * response records, which are built while the transaction is still open.
 */
@Service
@Transactional(readOnly = true)
public class CatalogService {

    private final ProductRepository products;
    private final CategoryRepository categories;
    private final ShopProperties shop;

    public CatalogService(ProductRepository products, CategoryRepository categories, ShopProperties shop) {
        this.products = products;
        this.categories = categories;
        this.shop = shop;
    }

    public Page<ProductCard> search(String text, String categorySlug, boolean inStockOnly, Pageable pageable) {
        List<Specification<Product>> filters = new ArrayList<>();
        filters.add(ProductRepository.isActive());
        if (text != null && !text.isBlank()) {
            filters.add(ProductRepository.nameOrDescriptionContains(text.strip()));
        }
        if (categorySlug != null && !categorySlug.isBlank()) {
            filters.add(ProductRepository.inCategory(categorySlug));
        }
        if (inStockOnly) {
            filters.add(ProductRepository.inStock());
        }
        return products.findAll(Specification.allOf(filters), withIdTieBreaker(pageable))
                .map(product -> ProductCard.from(product, shop.freeShippingOverCents()));
    }

    public ProductResponse get(String sku) {
        return products.findBySku(sku)
                .filter(Product::isActive)
                .map(ProductResponse::from)
                .orElseThrow(() -> productNotFound(sku));
    }

    public List<CategoryResponse> categories() {
        return categories.findAll(Sort.by("name")).stream().map(CategoryResponse::from).toList();
    }

    @Transactional
    public ProductResponse create(ProductRequest request) {
        if (products.existsBySku(request.sku())) {
            throw new ConflictException("SKU already exists", "A product with SKU %s already exists.".formatted(request.sku()));
        }
        Product product = new Product(request.sku(), request.name(), request.description(), request.priceCents(),
                request.stock(), requireCategory(request.category()));
        if (!request.active()) {
            product.deactivate();
        }
        return ProductResponse.from(products.save(product));
    }

    // Admins edit inactive products too, which is how a deactivated product comes back.
    @Transactional
    public ProductResponse update(String sku, ProductRequest request) {
        if (!sku.equals(request.sku())) {
            throw new UnprocessableException("SKU mismatch",
                    "The body's SKU %s does not match %s in the path.".formatted(request.sku(), sku),
                    Map.of("sku", request.sku()));
        }
        Product product = requireProduct(sku);
        product.update(request.name(), request.description(), request.priceCents(), request.stock(),
                requireCategory(request.category()), request.active());
        return ProductResponse.from(product);
    }

    @Transactional
    public void deactivate(String sku) {
        requireProduct(sku).deactivate();
    }

    @Transactional
    public ProductResponse adjustStock(String sku, int change) {
        Product product = requireProduct(sku);
        if (change < 0) {
            product.removeStock(-change);
        } else {
            product.addStock(change);
        }
        return ProductResponse.from(product);
    }

    private Product requireProduct(String sku) {
        return products.findBySku(sku).orElseThrow(() -> productNotFound(sku));
    }

    private Category requireCategory(String slug) {
        return categories.findBySlug(slug).orElseThrow(() -> new UnprocessableException("Unknown category",
                "There is no category '%s'.".formatted(slug), Map.of("category", slug)));
    }

    private static NotFoundException productNotFound(String sku) {
        return new NotFoundException("Product not found", "No product with SKU %s.".formatted(sku));
    }

    // Rows that tie on the requested sort (two products named alike) need a final, unique key,
    // or the database may return them in a different order on each page and repeat or skip one.
    private static Pageable withIdTieBreaker(Pageable pageable) {
        Sort sort = pageable.getSort();
        if (sort.getOrderFor("id") == null) {
            sort = sort.and(Sort.by("id"));
        }
        return PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(), sort);
    }
}
