package dev.hackuniversity.shopfront.customer;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * Domain model: one account, a row of the customers table. Shoppers and admins are both
 * customers here, told apart by role. passwordHash holds a {bcrypt} hash, and no response
 * record ever includes it.
 */
@Entity
@Table(name = "customers")
public class Customer {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String email;

    private String name;

    private String passwordHash;

    @Enumerated(EnumType.STRING)
    private Role role;

    private Instant createdAt;

    protected Customer() {
        // for JPA
    }

    public Customer(String email, String name, String passwordHash, Role role, Instant createdAt) {
        this.email = email;
        this.name = name;
        this.passwordHash = passwordHash;
        this.role = role;
        this.createdAt = createdAt;
    }

    public Long getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public String getName() {
        return name;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public Role getRole() {
        return role;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
