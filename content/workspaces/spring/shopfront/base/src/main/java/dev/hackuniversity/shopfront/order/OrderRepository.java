package dev.hackuniversity.shopfront.order;

import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

/** Data access for orders. */
public interface OrderRepository extends JpaRepository<Order, Long> {

    // Derived from the name: orders whose customer's email matches, one page at a time.
    Page<Order> findByCustomerEmail(String email, Pageable pageable);

    // join fetch loads the customer, the lines, and each line's product in this one query,
    // instead of one more query per line while the response is built.
    @Query("""
            select o from Order o
            join fetch o.customer
            left join fetch o.lines line
            left join fetch line.product
            where o.id = :id
            """)
    Optional<Order> findWithLinesById(long id);
}
