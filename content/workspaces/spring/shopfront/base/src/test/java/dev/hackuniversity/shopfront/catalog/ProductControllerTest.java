package dev.hackuniversity.shopfront.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;

import dev.hackuniversity.shopfront.catalog.dto.ProductRequest;
import dev.hackuniversity.shopfront.catalog.dto.ProductResponse;
import dev.hackuniversity.shopfront.common.NotFoundException;
import dev.hackuniversity.shopfront.config.SecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.JwtRequestPostProcessor;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/**
 * A web slice test: ProductController, Spring MVC, ApiExceptionHandler, and the real
 * SecurityConfig start, with CatalogService replaced by a mock and no database at all.
 * jwt() hands a request an already-checked token with the authorities a test chooses.
 */
@WebMvcTest(ProductController.class)
@Import(SecurityConfig.class)
class ProductControllerTest {

    private static final String NEW_PRODUCT = """
            {"sku": "KT-007", "name": "Salad Spinner", "priceCents": 2299, "stock": 12, "category": "kitchen"}
            """;

    private static final ProductResponse SALAD_SPINNER =
            new ProductResponse("KT-007", "Salad Spinner", "", 2299, 12, "kitchen", true);

    @Autowired
    MockMvcTester mvc;

    @MockitoBean
    CatalogService catalog;

    // The resource server needs a JwtDecoder to start. jwt() skips decoding, so a mock is enough.
    @MockitoBean
    JwtDecoder jwtDecoder;

    @Test
    void anyoneCanReadAProduct() {
        given(catalog.get("KT-007")).willReturn(SALAD_SPINNER);

        assertThat(mvc.get().uri("/api/products/KT-007"))
                .hasStatusOk()
                .bodyJson().extractingPath("$.name").isEqualTo("Salad Spinner");
    }

    @Test
    void anUnknownSkuAnswers404AsAProblem() {
        given(catalog.get("ZZ-999")).willThrow(new NotFoundException("Product not found", "No product with SKU ZZ-999."));

        assertThat(mvc.get().uri("/api/products/ZZ-999"))
                .hasStatus(HttpStatus.NOT_FOUND)
                .hasContentType(MediaType.APPLICATION_PROBLEM_JSON)
                .bodyJson().extractingPath("$.title").isEqualTo("Product not found");
    }

    @Test
    void creatingWithoutATokenAnswers401() {
        MvcTestResult result = mvc.post().uri("/api/products")
                .contentType(MediaType.APPLICATION_JSON).content(NEW_PRODUCT).exchange();

        assertThat(result).hasStatus(HttpStatus.UNAUTHORIZED);
        assertThat(result.getResponse().getHeader("WWW-Authenticate")).startsWith("Bearer");
        then(catalog).shouldHaveNoInteractions();
    }

    @Test
    void aCustomerCannotCreateProducts() {
        assertThat(mvc.post().uri("/api/products").with(tokenWithRole("ROLE_CUSTOMER"))
                .contentType(MediaType.APPLICATION_JSON).content(NEW_PRODUCT))
                .hasStatus(HttpStatus.FORBIDDEN);
        then(catalog).shouldHaveNoInteractions();
    }

    @Test
    void anAdminCreatesAProduct() {
        given(catalog.create(any(ProductRequest.class))).willReturn(SALAD_SPINNER);

        assertThat(mvc.post().uri("/api/products").with(tokenWithRole("ROLE_ADMIN"))
                .contentType(MediaType.APPLICATION_JSON).content(NEW_PRODUCT))
                .hasStatus(HttpStatus.CREATED)
                .hasHeader("Location", "/api/products/KT-007")
                .bodyJson().extractingPath("$.sku").isEqualTo("KT-007");
    }

    @Test
    void invalidFieldsAnswer400WithOneErrorPerField() {
        assertThat(mvc.post().uri("/api/products").with(tokenWithRole("ROLE_ADMIN"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"sku": "kt7", "name": " ", "priceCents": 0, "category": "kitchen"}
                        """))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson().isLenientlyEqualTo("""
                        {
                          "title": "Bad Request",
                          "errors": {
                            "name": "must not be blank",
                            "priceCents": "must be greater than 0",
                            "sku": "must look like AB-123",
                            "stock": "must not be null"
                          }
                        }
                        """);
        then(catalog).shouldHaveNoInteractions();
    }

    private static JwtRequestPostProcessor tokenWithRole(String role) {
        return jwt().authorities(new SimpleGrantedAuthority(role));
    }
}
