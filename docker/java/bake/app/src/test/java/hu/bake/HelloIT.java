package hu.bake;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class HelloIT {
  @Test
  void runsUnderFailsafe() {
    assertThat(new HelloController().hello()).isEqualTo("hello");
  }
}
