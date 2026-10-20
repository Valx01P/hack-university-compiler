package dev.hackuniversity.shopfront.customer;

import dev.hackuniversity.shopfront.common.ConflictException;
import dev.hackuniversity.shopfront.common.NotFoundException;
import dev.hackuniversity.shopfront.customer.dto.CustomerResponse;
import dev.hackuniversity.shopfront.customer.dto.RegisterRequest;
import java.time.Clock;
import java.time.Instant;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Service layer: the rules for accounts. Every new account is a CUSTOMER with a hashed
 * password, and an email can belong to one account only. It returns response records, never
 * entities, and knows nothing about HTTP.
 */
@Service
@Transactional(readOnly = true)
public class CustomerService {

    private final CustomerRepository customers;
    private final PasswordEncoder passwordEncoder;
    private final Clock clock;

    public CustomerService(CustomerRepository customers, PasswordEncoder passwordEncoder, Clock clock) {
        this.customers = customers;
        this.passwordEncoder = passwordEncoder;
        this.clock = clock;
    }

    @Transactional
    public CustomerResponse register(RegisterRequest request) {
        if (customers.existsByEmail(request.email())) {
            throw new ConflictException("Email already registered",
                    "An account with %s already exists.".formatted(request.email()));
        }
        Customer customer = new Customer(request.email(), request.name(),
                passwordEncoder.encode(request.password()), Role.CUSTOMER, Instant.now(clock));
        return CustomerResponse.from(customers.save(customer));
    }

    public CustomerResponse me(String email) {
        return customers.findByEmail(email)
                .map(CustomerResponse::from)
                .orElseThrow(() -> new NotFoundException("Customer not found", "No account for " + email + "."));
    }
}
