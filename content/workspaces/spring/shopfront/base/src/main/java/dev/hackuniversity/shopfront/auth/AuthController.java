package dev.hackuniversity.shopfront.auth;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Web layer: POST /api/auth/token trades an email and password for a JWT. */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final TokenService tokens;

    public AuthController(TokenService tokens) {
        this.tokens = tokens;
    }

    @PostMapping("/token")
    public TokenResponse token(@Valid @RequestBody LoginRequest login) {
        return tokens.login(login);
    }
}
