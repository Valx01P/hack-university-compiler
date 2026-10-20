package hu.bake;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.assertj.MockMvcTester;

@WebMvcTest(HelloController.class)
class HelloControllerTest {
  @Autowired MockMvcTester mvc;

  @Test
  @WithMockUser
  void saysHello() {
    assertThat(mvc.get().uri("/hello")).hasStatusOk().hasBodyTextEqualTo("hello");
  }
}
