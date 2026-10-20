package hu.bake;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@SpringBootApplication
public class BakeApplication {
  public static void main(String[] args) {
    SpringApplication.run(BakeApplication.class, args);
  }
}

@RestController
class HelloController {
  @GetMapping("/hello")
  String hello() {
    return "hello";
  }
}
