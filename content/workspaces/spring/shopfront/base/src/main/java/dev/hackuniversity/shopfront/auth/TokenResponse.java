package dev.hackuniversity.shopfront.auth;

/** The answer to a login: the JWT to send as "Authorization: Bearer <token>", and its lifetime in seconds. */
public record TokenResponse(String token, String tokenType, long expiresIn) {
}
