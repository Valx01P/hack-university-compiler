package dev.hackuniversity.shopfront.config;

import java.time.Duration;
import java.util.List;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.server.resource.web.BearerTokenAuthenticationEntryPoint;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.servlet.HandlerExceptionResolver;

/**
 * Configuration: who may call what. The API is stateless: every request proves who it is with
 * the bearer token from POST /api/auth/token, so there are no sessions, no login form, and no
 * CSRF tokens. The rules run top to bottom and the first match wins, so narrow rules go first.
 */
@Configuration(proxyBeanMethods = false)
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain apiSecurity(HttpSecurity http,
            @Qualifier("handlerExceptionResolver") HandlerExceptionResolver exceptionResolver) throws Exception {
        // 401 and 403 answers go through ApiExceptionHandler too, so they are problems like every
        // other error. The bearer entry point first adds the WWW-Authenticate header clients expect.
        BearerTokenAuthenticationEntryPoint bearer = new BearerTokenAuthenticationEntryPoint();
        AuthenticationEntryPoint unauthorized = (request, response, failure) -> {
            bearer.commence(request, response, failure);
            exceptionResolver.resolveException(request, response, null, failure);
        };
        AccessDeniedHandler forbidden = (request, response, failure) ->
                exceptionResolver.resolveException(request, response, null, failure);

        http
                .authorizeHttpRequests(requests -> requests
                        .requestMatchers(HttpMethod.POST, "/api/auth/token", "/api/customers").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/products/**", "/api/categories").permitAll()
                        .requestMatchers("/api/products/**", "/api/admin/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/orders").hasRole("CUSTOMER")
                        .requestMatchers("/api/orders/**").hasAnyRole("CUSTOMER", "ADMIN")
                        .requestMatchers("/actuator/health/**", "/actuator/info").permitAll()
                        .requestMatchers("/actuator/**").hasRole("ADMIN")
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        .requestMatchers("/error").permitAll()
                        .anyRequest().authenticated())
                .oauth2ResourceServer(resourceServer -> resourceServer
                        .jwt(Customizer.withDefaults())
                        .authenticationEntryPoint(unauthorized)
                        .accessDeniedHandler(forbidden))
                .exceptionHandling(failures -> failures
                        .authenticationEntryPoint(unauthorized)
                        .accessDeniedHandler(forbidden))
                .sessionManagement(sessions -> sessions.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                // CSRF attacks ride on cookies the browser sends by itself. Bearer tokens are never sent that way.
                .csrf(AbstractHttpConfigurer::disable)
                .cors(Customizer.withDefaults());
        return http.build();
    }

    // Hashes like {bcrypt}$2a$10$...: the prefix names the algorithm, so it can change later.
    @Bean
    PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }

    // Built by Spring Security from the one UserDetailsService bean and the PasswordEncoder.
    // TokenService uses it to check an email and password.
    @Bean
    AuthenticationManager authenticationManager(AuthenticationConfiguration authentication) throws Exception {
        return authentication.getAuthenticationManager();
    }

    // The storefront web app runs on http://localhost:5173 and calls this API from the browser.
    @Bean
    CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration storefront = new CorsConfiguration();
        storefront.setAllowedOrigins(List.of("http://localhost:5173"));
        storefront.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE"));
        storefront.setAllowedHeaders(List.of("Authorization", "Content-Type"));
        storefront.setExposedHeaders(List.of("Location"));
        storefront.setMaxAge(Duration.ofHours(1));
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", storefront);
        return source;
    }
}
