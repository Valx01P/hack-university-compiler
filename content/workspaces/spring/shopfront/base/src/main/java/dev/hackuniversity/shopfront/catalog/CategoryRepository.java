package dev.hackuniversity.shopfront.catalog;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Data access for categories. */
public interface CategoryRepository extends JpaRepository<Category, Long> {

    Optional<Category> findBySlug(String slug);
}
