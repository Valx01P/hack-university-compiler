package dev.hackuniversity.shopfront.order;

import dev.hackuniversity.shopfront.auth.TokenResponse;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.jdbc.Sql;
import org.springframework.test.web.servlet.client.RestTestClient;

/**
 * An end-to-end test: the whole app starts on a random port against the real database, and
 * RestTestClient sends real HTTP requests, the way a client would. The server commits its own
 * transactions, so nothing rolls back by itself: @Sql removes the test's rows before and after
 * each test.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
@Sql({"/sql/order-flow-cleanup.sql", "/sql/order-flow-data.sql"})
@Sql(scripts = "/sql/order-flow-cleanup.sql", executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
class OrderFlowTest {

    @Autowired
    RestTestClient client;

    @Autowired
    Clock clock;

    @Test
    void aCustomerLogsInPlacesAnOrderAndFindsItInTheirList() {
        String token = logIn("flow@example.com", "flow-pass-123");

        client.post().uri("/api/orders")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("lines", List.of(Map.of("sku", "ZZ-001", "quantity", 2))))
                .exchange()
                .expectStatus().isCreated()
                .expectHeader().valueMatches(HttpHeaders.LOCATION, "/api/orders/\\d+")
                .expectBody()
                .jsonPath("$.status").isEqualTo("PLACED")
                .jsonPath("$.lines[0].unitPriceCents").isEqualTo(1000)
                .jsonPath("$.subtotalCents").isEqualTo(2000)
                .jsonPath("$.taxCents").isEqualTo(165)
                .jsonPath("$.totalCents").isEqualTo(2165)
                .jsonPath("$.placedAt").isEqualTo(clock.instant().toString());

        client.get().uri("/api/orders")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.content.length()").isEqualTo(1)
                .jsonPath("$.content[0].totalCents").isEqualTo(2165)
                .jsonPath("$.page.totalElements").isEqualTo(1);

        client.get().uri("/api/products/ZZ-001")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.stock").isEqualTo(3);
    }

    @Test
    void orderingMoreThanTheStockAnswers409AndLeavesTheStockAlone() {
        String token = logIn("flow@example.com", "flow-pass-123");

        client.post().uri("/api/orders")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("lines", List.of(Map.of("sku", "ZZ-001", "quantity", 6))))
                .exchange()
                .expectStatus().isEqualTo(409)
                .expectBody()
                .jsonPath("$.title").isEqualTo("Out of stock")
                .jsonPath("$.sku").isEqualTo("ZZ-001");

        client.get().uri("/api/products/ZZ-001")
                .exchange()
                .expectBody()
                .jsonPath("$.stock").isEqualTo(5);
    }

    @Test
    void aWrongPasswordAnswers401() {
        client.post().uri("/api/auth/token")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("email", "flow@example.com", "password", "not-the-password"))
                .exchange()
                .expectStatus().isUnauthorized()
                .expectBody()
                .jsonPath("$.detail").isEqualTo("Wrong email or password.");
    }

    @Test
    void ordersNeedAToken() {
        client.get().uri("/api/orders")
                .exchange()
                .expectStatus().isUnauthorized()
                .expectHeader().valueMatches(HttpHeaders.WWW_AUTHENTICATE, "Bearer.*");
    }

    private String logIn(String email, String password) {
        return client.post().uri("/api/auth/token")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("email", email, "password", password))
                .exchange()
                .expectStatus().isOk()
                .returnResult(TokenResponse.class)
                .getResponseBody()
                .token();
    }
}
