package dev.hackuniversity.shopfront.auth;

import jakarta.validation.constraints.NotBlank;

/** The body of POST /api/auth/token. */
public record LoginRequest(@NotBlank String email, @NotBlank String password) {

    // Records print every field by default, and a password must never reach a log.
    @Override
    public String toString() {
        return "LoginRequest[email=" + email + ", password=<hidden>]";
    }
}
