package dev.hackuniversity.shopfront.auth;

import dev.hackuniversity.shopfront.config.JwtConfig;
import dev.hackuniversity.shopfront.config.ShopProperties;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

/**
 * Service layer: checks an email and password, then issues the signed JWT the caller sends
 * on every later request. Spring Security's AuthenticationManager does the password check
 * (CustomerUserDetailsService loads the account), so this class never compares hashes itself.
 */
@Service
public class TokenService {

    private final AuthenticationManager authenticationManager;
    private final JwtEncoder jwtEncoder;
    private final ShopProperties shop;
    private final Clock clock;

    public TokenService(AuthenticationManager authenticationManager, JwtEncoder jwtEncoder, ShopProperties shop, Clock clock) {
        this.authenticationManager = authenticationManager;
        this.jwtEncoder = jwtEncoder;
        this.shop = shop;
        this.clock = clock;
    }

    /** Throws BadCredentialsException (answered as 401) for an unknown email or a wrong password. */
    public TokenResponse login(LoginRequest login) {
        Authentication account = authenticationManager.authenticate(
                UsernamePasswordAuthenticationToken.unauthenticated(login.email(), login.password()));
        return issueFor(account);
    }

    TokenResponse issueFor(Authentication account) {
        Instant now = Instant.now(clock);
        Duration ttl = shop.jwt().ttl();
        // Spring Security 7 also grants FACTOR_PASSWORD after a password login. Only roles go in the token.
        List<String> roles = account.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .filter(authority -> authority.startsWith("ROLE_"))
                .sorted()
                .toList();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(JwtConfig.ISSUER)
                .subject(account.getName())
                .issuedAt(now)
                .expiresAt(now.plus(ttl))
                .claim("roles", roles)
                .build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        String token = jwtEncoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
        return new TokenResponse(token, "Bearer", ttl.toSeconds());
    }
}
