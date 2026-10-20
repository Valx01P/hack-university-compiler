// The single-file program hu/java's build compiles and runs against the boot
// profile, the way the spring recipe does (outlines/spring.md 3.1).
package app;

import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.stereotype.Service;

@SpringBootApplication
public class Main implements CommandLineRunner {
  private final Greeter greeter;

  Main(Greeter greeter) {
    this.greeter = greeter;
  }

  public static void main(String[] args) {
    SpringApplication.run(Main.class, args);
  }

  @Override
  public void run(String... args) {
    System.out.println(greeter.greet("profile"));
  }
}

@Service
class Greeter {
  String greet(String name) {
    return "hu-" + name + "-ready";
  }
}
