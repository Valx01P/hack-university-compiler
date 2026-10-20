package dev.hackuniversity.playground.hello;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Web layer: turns GET /api/hello into a JSON greeting. A controller only speaks HTTP,
 * so anything bigger than a greeting belongs in a service it calls.
 */
@RestController
@RequestMapping("/api/hello")
public class HelloController {

    public record Greeting(String message) {}

    // A missing or empty ?name= falls back to the default. The constraints answer 400 for the rest.
    @GetMapping
    public Greeting hello(@RequestParam(defaultValue = "World") @NotBlank @Size(max = 40) String name) {
        return new Greeting("Hello, World!");
    }
}
