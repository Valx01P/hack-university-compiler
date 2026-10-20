package dev.hackuniversity.playground.hello;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.servlet.assertj.MockMvcTester;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * A web slice test: only HelloController and Spring MVC start, with no server and no database,
 * and MockMvcTester sends requests straight to the controller.
 */
@WebMvcTest(HelloController.class)
class HelloControllerTest {

    @Autowired
    MockMvcTester mvc;

    @Test
    void greetsByName() {
        assertThat(mvc.get().uri("/api/hello").param("name", "Ana"))
                .hasStatusOk()
                .bodyJson().extractingPath("$.message").isEqualTo("Hello, Ana!");
    }

    @Test
    void greetsTheWorldWithoutAName() {
        assertThat(mvc.get().uri("/api/hello"))
                .hasStatusOk()
                .bodyJson().isEqualTo("""
                        {"message": "Hello, World!"}
                        """);
    }

    @Test
    void rejectsANameLongerThan40Characters() {
        assertThat(mvc.get().uri("/api/hello").param("name", "a".repeat(41)))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson().extractingPath("$.title").isEqualTo("Bad Request");
    }
}
