package dev.hackuniversity.shopfront;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.methods;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import com.tngtech.archunit.library.GeneralCodingRules;
import jakarta.persistence.Entity;
import org.springframework.data.repository.Repository;
import org.springframework.web.bind.annotation.RestController;

/**
 * The layer rules from docs/architecture.md, checked on the compiled classes. A change that
 * breaks one fails the build with the class and line that broke it.
 */
@AnalyzeClasses(packages = "dev.hackuniversity.shopfront", importOptions = ImportOption.DoNotIncludeTests.class)
class ArchitectureTest {

    @ArchTest
    static final ArchRule controllersNeverUseRepositories = noClasses()
            .that().areAnnotatedWith(RestController.class)
            .should().dependOnClassesThat().areAssignableTo(Repository.class)
            .because("controllers call services, and only services reach the database");

    @ArchTest
    static final ArchRule controllersNeverReturnEntities = methods()
            .that().areDeclaredInClassesThat().areAnnotatedWith(RestController.class)
            .and().arePublic()
            .should(returnNoEntity())
            .because("an entity in a response leaks columns like password_hash and loads lazy data while JSON is written");

    @ArchTest
    static final ArchRule noFieldInjection = GeneralCodingRules.NO_CLASSES_SHOULD_USE_FIELD_INJECTION
            .because("constructor injection makes dependencies visible and lets plain unit tests build the class");

    // Looks inside generic types too, so List<Product> and ResponseEntity<Order> count as returning an entity.
    private static ArchCondition<JavaMethod> returnNoEntity() {
        return new ArchCondition<>("return no @Entity, not even inside a List, Page, or ResponseEntity") {
            @Override
            public void check(JavaMethod method, ConditionEvents events) {
                for (JavaClass type : method.getReturnType().getAllInvolvedRawTypes()) {
                    if (type.isAnnotatedWith(Entity.class)) {
                        events.add(SimpleConditionEvent.violated(method,
                                "%s returns the entity %s".formatted(method.getFullName(), type.getSimpleName())));
                    }
                }
            }
        };
    }
}
