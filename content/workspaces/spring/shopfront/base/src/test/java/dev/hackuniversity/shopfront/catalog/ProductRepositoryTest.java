package dev.hackuniversity.shopfront.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import dev.hackuniversity.shopfront.config.ClockConfig;
import java.util.List;
import org.hibernate.Hibernate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;

/**
 * A data slice test on the real PostgreSQL: JPA, Flyway, and the repositories start, nothing
 * else. Each test runs in a transaction that rolls back afterwards, so the rows saved here
 * never outlive the test. They use their own category, so other rows never get in the way.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
// Entity listeners are beans: PlacedAtListener needs the Clock, which the JPA slice does not load by itself.
@Import(ClockConfig.class)
class ProductRepositoryTest {

    @Autowired
    TestEntityManager entityManager;

    @Autowired
    ProductRepository products;

    @BeforeEach
    void saveATestCategory() {
        Category gadgets = entityManager.persist(new Category("Test Gadgets", "test-gadgets"));
        entityManager.persist(new Product("TG-001", "Pocket Torch", "A small LED torch.", 1500, 10, gadgets));
        entityManager.persist(new Product("TG-002", "Torch Batteries", "Four AA batteries.", 600, 0, gadgets));
        Product retired = new Product("TG-003", "Old Torch", "Replaced by TG-001.", 900, 5, gadgets);
        retired.deactivate();
        entityManager.persist(retired);
        entityManager.persist(new Product("TG-004", "Pocket Knife", "Seven tools that fold away.", 2400, 3, gadgets));
        // Write the rows and forget them, so the queries below really read from PostgreSQL.
        entityManager.flush();
        entityManager.clear();
    }

    @Test
    void findBySkuLoadsTheCategoryInTheSameQuery() {
        Product torch = products.findBySku("TG-001").orElseThrow();

        assertThat(Hibernate.isInitialized(torch.getCategory())).isTrue();
        assertThat(torch.getCategory().getSlug()).isEqualTo("test-gadgets");
    }

    @Test
    void searchMatchesNameOrDescriptionIgnoringCaseAndSkipsInactiveProducts() {
        List<String> skus = search(ProductRepository.nameOrDescriptionContains("TORCH"));

        assertThat(skus).containsExactly("TG-001", "TG-002");
    }

    @Test
    void inStockLeavesOutSoldOutProducts() {
        List<String> skus = search(ProductRepository.inStock());

        assertThat(skus).containsExactly("TG-001", "TG-004");
    }

    @Test
    void percentAndUnderscoreInASearchAreMatchedLiterally() {
        assertThat(search(ProductRepository.nameOrDescriptionContains("%"))).isEmpty();
    }

    @Test
    void savingAChangeBumpsTheVersion() {
        Product torch = products.findBySku("TG-001").orElseThrow();
        long versionBefore = torch.getVersion();

        torch.removeStock(1);
        products.saveAndFlush(torch);

        assertThat(torch.getVersion()).isEqualTo(versionBefore + 1);
    }

    private List<String> search(Specification<Product> filter) {
        Specification<Product> activeInTestGadgets = Specification.allOf(
                ProductRepository.isActive(), ProductRepository.inCategory("test-gadgets"), filter);
        return products.findAll(activeInTestGadgets, PageRequest.of(0, 10, Sort.by("sku")))
                .map(Product::getSku)
                .getContent();
    }
}
