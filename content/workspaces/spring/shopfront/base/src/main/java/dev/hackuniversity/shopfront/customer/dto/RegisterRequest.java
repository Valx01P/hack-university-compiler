package dev.hackuniversity.shopfront.customer.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** The body of POST /api/customers. BCrypt reads at most 72 bytes, hence the upper limit. */
public record RegisterRequest(
        @NotBlank @Email @Size(max = 254) String email,
        @NotBlank @Size(max = 100) String name,
        @NotNull @Size(min = 10, max = 72) String password) {

    @Override
    public String toString() {
        return "RegisterRequest[email=" + email + ", name=" + name + ", password=<hidden>]";
    }
}
