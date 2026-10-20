package dev.hackuniversity.shopfront.customer;

import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

/**
 * Loads an account for Spring Security at login: the email, the stored hash, and the role.
 * Spring Security compares the password with the hash. An unknown email becomes the same
 * "wrong email or password" answer as a wrong password, so logins do not reveal who has an account.
 */
@Service
public class CustomerUserDetailsService implements UserDetailsService {

    private final CustomerRepository customers;

    public CustomerUserDetailsService(CustomerRepository customers) {
        this.customers = customers;
    }

    @Override
    public UserDetails loadUserByUsername(String email) {
        return customers.findByEmail(email)
                .map(customer -> User.withUsername(customer.getEmail())
                        .password(customer.getPasswordHash())
                        .roles(customer.getRole().name())
                        .build())
                .orElseThrow(() -> new UsernameNotFoundException("No account for " + email));
    }
}
