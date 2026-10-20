package dev.hackuniversity.shopfront.auth;

import org.springframework.security.core.Authentication;

/**
 * Who is calling, in the terms services care about: their email (the token's subject) and
 * whether they are an admin. Controllers build it from Spring Security's Authentication, so
 * services never read tokens or HTTP requests themselves.
 */
public record CurrentUser(String email, boolean admin) {

    public static CurrentUser of(Authentication authentication) {
        boolean admin = authentication.getAuthorities().stream()
                .anyMatch(authority -> "ROLE_ADMIN".equals(authority.getAuthority()));
        return new CurrentUser(authentication.getName(), admin);
    }
}
