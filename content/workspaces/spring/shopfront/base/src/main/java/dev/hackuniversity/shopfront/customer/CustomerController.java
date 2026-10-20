package dev.hackuniversity.shopfront.customer;

import dev.hackuniversity.shopfront.customer.dto.CustomerResponse;
import dev.hackuniversity.shopfront.customer.dto.RegisterRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Web layer: sign up (open to anyone) and read your own account (any valid token). */
@RestController
@RequestMapping("/api/customers")
public class CustomerController {

    private final CustomerService customers;

    public CustomerController(CustomerService customers) {
        this.customers = customers;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CustomerResponse register(@Valid @RequestBody RegisterRequest request) {
        return customers.register(request);
    }

    // Authentication.getName() is the token's subject, the email it was issued for.
    @GetMapping("/me")
    public CustomerResponse me(Authentication user) {
        return customers.me(user.getName());
    }
}
