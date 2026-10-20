package hu.bake;

import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class RunApplication implements CommandLineRunner {
  public static void main(String[] args) {
    SpringApplication.run(RunApplication.class, args);
  }

  @Override
  public void run(String... args) {
    System.out.println("hu-run-ready");
  }
}
