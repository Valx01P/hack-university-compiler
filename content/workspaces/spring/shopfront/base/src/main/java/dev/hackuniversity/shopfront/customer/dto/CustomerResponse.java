package dev.hackuniversity.shopfront.customer.dto;

import dev.hackuniversity.shopfront.customer.Customer;
import dev.hackuniversity.shopfront.customer.Role;
import java.time.Instant;

/** An account as clients see it. The password hash stays behind. */
public record CustomerResponse(long id, String email, String name, Role role, Instant createdAt) {

    public static CustomerResponse from(Customer customer) {
        return new CustomerResponse(customer.getId(), customer.getEmail(), customer.getName(),
                customer.getRole(), customer.getCreatedAt());
    }
}
