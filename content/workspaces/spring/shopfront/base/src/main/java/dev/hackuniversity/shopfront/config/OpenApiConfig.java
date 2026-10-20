package dev.hackuniversity.shopfront.config;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.enums.SecuritySchemeType;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.security.SecurityScheme;
import org.springframework.context.annotation.Configuration;

/**
 * Configuration: the title and version of the generated OpenAPI document (/v3/api-docs), and
 * the bearer scheme that gives Swagger UI (/swagger-ui.html) its Authorize button. An endpoint
 * that needs a token says so with @SecurityRequirement(name = "bearer").
 */
@Configuration(proxyBeanMethods = false)
@OpenAPIDefinition(info = @Info(
        title = "Shopfront API",
        version = "v1",
        description = "Browse the catalog, register, log in for a token, and place and cancel orders."))
@SecurityScheme(name = "bearer", type = SecuritySchemeType.HTTP, scheme = "bearer", bearerFormat = "JWT")
public class OpenApiConfig {
}
