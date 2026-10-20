package hu.bake;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.importer.ClassFileImporter;
import org.junit.jupiter.api.Test;

class LayersTest {
  @Test
  void controllersDoNotUseJdbc() {
    noClasses().that().haveSimpleNameEndingWith("Controller")
        .should().dependOnClassesThat().resideInAPackage("java.sql..")
        .check(new ClassFileImporter().importPackages("hu.bake"));
  }
}
