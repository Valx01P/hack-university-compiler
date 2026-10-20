package dev.hackuniversity.shopfront.customer;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Data access for customers. Spring Data writes each query from its method name. */
public interface CustomerRepository extends JpaRepository<Customer, Long> {

    Optional<Customer> findByEmail(String email);

    boolean existsByEmail(String email);
}
