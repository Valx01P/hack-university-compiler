package dev.hackuniversity.shopfront.catalog;

import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

/**
 * Data access for products. Simple lookups are derived from method names. The catalog search
 * combines optional filters, each one a Specification (a reusable WHERE condition), and
 * runs them with findAll(spec, pageable).
 */
public interface ProductRepository extends JpaRepository<Product, Long>, JpaSpecificationExecutor<Product> {

    // The entity graph fetches the category in the same query, so reading product.getCategory()
    // afterwards costs nothing.
    @EntityGraph(attributePaths = "category")
    Optional<Product> findBySku(String sku);

    boolean existsBySku(String sku);

    List<Product> findBySkuIn(Collection<String> skus);

    // One query for the page with every product's category, plus one count query, however many rows.
    @Override
    @EntityGraph(attributePaths = "category")
    Page<Product> findAll(Specification<Product> filter, Pageable pageable);

    static Specification<Product> isActive() {
        return (product, query, cb) -> cb.isTrue(product.get("active"));
    }

    static Specification<Product> nameOrDescriptionContains(String text) {
        String pattern = "%" + escapeLikeWildcards(text.toLowerCase(Locale.ROOT)) + "%";
        return (product, query, cb) -> cb.or(
                cb.like(cb.lower(product.get("name")), pattern, '\\'),
                cb.like(cb.lower(product.get("description")), pattern, '\\'));
    }

    static Specification<Product> inCategory(String slug) {
        return (product, query, cb) -> cb.equal(product.get("category").get("slug"), slug);
    }

    static Specification<Product> inStock() {
        return (product, query, cb) -> cb.greaterThan(product.get("stock"), 0);
    }

    // A search for "50%" should match the characters 50%, not "50 followed by anything".
    private static String escapeLikeWildcards(String text) {
        return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
