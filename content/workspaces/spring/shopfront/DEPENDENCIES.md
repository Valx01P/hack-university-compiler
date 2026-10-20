# Shopfront: Maven dependencies

Every library and Maven plugin this template's builds use, for the `hu/java` image's
read-only Maven repository (architecture 2.4 and 4.4, outlines/spring.md 9.2). Workspaces have
no network, so `./mvnw` runs offline and finds only what that repository holds.

## Toolchain

| Item | Version | Notes |
| --- | --- | --- |
| JDK | Temurin 25.0.4.1+1 (`eclipse-temurin:25-jdk`, Ubuntu 26.04, arm64) | Tested image. `java.version` is 25 in `pom.xml` |
| Maven | 3.10.0 | Through Maven Wrapper 3.3.4 (`distributionType=only-script`) |
| Maven Wrapper home | `$MAVEN_USER_HOME/wrapper/dists/apache-maven-3.10.0/dae9a06d/` | `dae9a06d` is the wrapper's hash of the `distributionUrl` in `.mvn/wrapper/maven-wrapper.properties`. Unpack `apache-maven-3.10.0-bin` there (a read-only `MAVEN_USER_HOME=/opt/hu/m2` works) |
| PostgreSQL | 18.6 (`postgres:18.6-alpine`) | JDBC driver 42.7.13 |

## Direct dependencies

Versions come from the Spring Boot 4.1.1 parent's BOM unless the pom names one.

| Dependency | Scope | Resolved version |
| --- | --- | --- |
| `spring-boot-starter-parent` | parent | 4.1.1 (Spring Framework 7.0.9) |
| `spring-boot-starter-webmvc` | compile | 4.1.1 (Tomcat 11.0.24, Jackson 3.1.5) |
| `spring-boot-starter-validation` | compile | 4.1.1 (Hibernate Validator 9.1.3.Final) |
| `spring-boot-starter-data-jpa` | compile | 4.1.1 (Spring Data JPA 4.1.1, Hibernate ORM 7.4.5.Final, HikariCP 7.0.2) |
| `spring-boot-starter-flyway` and `flyway-database-postgresql` | compile | 4.1.1 and Flyway 12.4.0 |
| `spring-boot-starter-actuator` | compile | 4.1.1 (Micrometer 1.17.1) |
| `postgresql` | runtime | 42.7.13 |
| `spring-boot-devtools` | runtime, optional | 4.1.1 |
| `spring-boot-starter-webmvc-test`, `spring-boot-starter-data-jpa-test` | test | 4.1.1 (JUnit Jupiter 6.0.3, AssertJ 3.27.7, Mockito 5.23.0) |
| `spring-boot-starter-security` | compile | 4.1.1 (Spring Security 7.1.1) |
| `spring-boot-starter-security-oauth2-resource-server` | compile | 4.1.1 (Nimbus JOSE+JWT 10.9.1) |
| `org.springdoc:springdoc-openapi-starter-webmvc-ui` | compile | 3.1.1 (swagger-ui 5.32.14, and Jackson 2.21.5 for swagger-core) |
| `spring-boot-starter-security-test` | test | 4.1.1 |
| `spring-boot-resttestclient` | test | 4.1.1 |
| `com.tngtech.archunit:archunit-junit5` | test | 1.5.1 |
| Plugins | build | spring-boot-maven-plugin 4.1.1, compiler 3.15.0, surefire 3.5.6 (with `surefire-junit-platform` 3.5.6), resources 3.5.0, jar 3.5.1, dependency 3.10.0 (its `properties` goal finds Mockito's jar for `-javaagent`) |

## Filling the repository (online, once, while the image is built)

```sh
./mvnw -B verify "-Dtest=ProductControllerTest,OrderServiceTest,ArchitectureTest" -Dsurefire.failIfNoSpecifiedTests=false
```

`verify` resolves everything the workspace tasks use: compile, the tests (and Surefire's JUnit
Platform provider, which is only resolved when tests run), `package`, `spring-boot:run`, and
`dependency:tree`. The `-Dtest` filter runs only the tests that need no database, which is enough to resolve every test dependency, so the image build needs no PostgreSQL.

Verified on 2026-10-19: a fresh, empty repository filled this way (273 jars, 136 MB with
POMs and metadata), then mounted read-only as Maven's tail
(`-Dmaven.repo.local.tail=/opt/hu/m2/repository`), with `<offline>true</offline>` in
`settings.xml`, as uid 1000, on an internal Docker network with only PostgreSQL on it. Every
task in `template.json`, the template database build, and `./mvnw test` passed, and Maven
wrote nothing to the writable local repository.

## What the image and the runner need

- Offline mode, from `settings.xml` or `-o`. Without it, Maven 3.10 looks for
  `/.meta/prefixes.txt` on the nine remote repositories that dependency POMs declare (Maven
  Central twice, Sonatype snapshots, Gradle, Redshift, Flyway community, Red Gate, Apache
  snapshots, OW2), and prints a warning for each after a DNS timeout.
- `settings.xml` must sit in the home directory that `/etc/passwd` gives uid 1000, because the
  JVM's `user.home` comes from there, not from `$HOME`.
- `DB_URL` in JDBC form (`jdbc:postgresql://db:5432/ws_<id>`) with `DB_USER` and `DB_PASSWORD`.
  The PostgreSQL JDBC driver cannot read a `postgres://user:password@host/db` URL.
- `PORT`, and `HU_FIXED_TIME` from `template.json` (read as `app.clock.fixed`).
- For the tests, `TEST_DB_URL`, `TEST_DB_USER`, and `TEST_DB_PASSWORD` for the workspace's
  test database (`"databases": ["dev", "test"]`). Without them the tests use the app's own
  database: they still pass and clean up after themselves, but identity sequences move on,
  so the ids `requests.http` expects (order 11) only hold after Reset database.

## Runtime notes (measured 2026-10-19, Temurin 25 on arm64, 2 CPUs, postgres:18.6-alpine)

- `./mvnw spring-boot:run` starts in 2.4 to 2.9 s and holds 520 to 560 MiB (Maven's JVM plus
  the app's). After `./mvnw -q compile` (about 2.6 s), DevTools restarts the app in 0.67 s.
- `./mvnw test` takes 11 s with a 948 MiB peak on its own. Run while the dev server runs, with
  `MAVEN_OPTS="-Xmx384m -XX:TieredStopAtLevel=1 -XX:+UseSerialGC"`, the workspace peaked at
  1268 MiB, inside the 1.5 GiB limit, and used at most 9 of the role's 20 connections.
- Hikari's pool is capped at 5 for the app and at 3 (1 idle) per cached test context. With
  Hikari's default of 10, the dev server and the two test contexts Spring caches needed 30
  connections, and the workspace role's `CONNECTION LIMIT 20` refused the third pool.
- The template database build (`services.postgres.build`) migrates, seeds, and exits in 6 to
  8 s without binding a port (`spring.context.exit=onRefresh`, DevTools restart off), and exits
  non-zero on failure. Run twice, it changes nothing (the seed is idempotent).
- The packaged jar is 67 MB and starts with the default profile (no seed).
- Spring Security sends `X-Frame-Options: DENY`, so Swagger UI cannot load in a framed
  preview. Open `/swagger-ui.html` in a new tab (it redirects to `/swagger-ui/index.html`).
- Spring Security 7.1 adds `resource_metadata="http://<host>/.well-known/oauth-protected-resource"`
  (RFC 9728) to `WWW-Authenticate` on 401s, and serves that document.
- In the dev profile DevTools logs each handled 4xx as `WARN ... Resolved [...]`, as expected.
- In `requests.http`, `###` lines separate requests and `# @name` lines name them. They look
  like comments but are syntax, so the Code comments switch should leave them visible.

## Every artifact (273 jars, groupId:artifactId:version)

```text
ch.qos.logback:logback-classic:1.5.38
ch.qos.logback:logback-core:1.5.38
com.fasterxml:classmate:1.7.3
com.fasterxml.jackson.core:jackson-annotations:2.21
com.fasterxml.jackson.core:jackson-core:2.21.5
com.fasterxml.jackson.core:jackson-databind:2.21.5
com.fasterxml.jackson.dataformat:jackson-dataformat-yaml:2.21.5
com.fasterxml.jackson.datatype:jackson-datatype-jsr310:2.21.5
com.github.cliftonlabs:json-simple:3.0.2
com.github.luben:zstd-jni:1.5.7-6
com.github.luben:zstd-jni:1.5.7-9
com.google.code.findbugs:jsr305:3.0.2
com.jayway.jsonpath:json-path:2.10.0
commons-beanutils:commons-beanutils:1.9.4
commons-codec:commons-codec:1.17.1
commons-codec:commons-codec:1.19.0
commons-collections:commons-collections:3.2.2
commons-io:commons-io:2.11.0
commons-io:commons-io:2.16.1
commons-io:commons-io:2.21.0
commons-io:commons-io:2.22.0
commons-logging:commons-logging:1.2
commons-logging:commons-logging:1.3.5
commons-logging:commons-logging:1.3.6
com.nimbusds:nimbus-jose-jwt:10.9.1
com.sun.istack:istack-commons-runtime:4.1.2
com.thoughtworks.qdox:qdox:2.2.0
com.tngtech.archunit:archunit:1.5.1
com.tngtech.archunit:archunit-junit5:1.5.1
com.tngtech.archunit:archunit-junit5-api:1.5.1
com.tngtech.archunit:archunit-junit5-engine:1.5.1
com.tngtech.archunit:archunit-junit5-engine-api:1.5.1
com.vaadin.external.google:android-json:0.0.20131108.vaadin1
com.zaxxer:HikariCP:7.0.2
io.micrometer:micrometer-commons:1.16.7
io.micrometer:micrometer-commons:1.17.1
io.micrometer:micrometer-core:1.17.1
io.micrometer:micrometer-jakarta9:1.17.1
io.micrometer:micrometer-observation:1.16.7
io.micrometer:micrometer-observation:1.17.1
io.swagger.core.v3:swagger-annotations-jakarta:2.2.55
io.swagger.core.v3:swagger-core-jakarta:2.2.55
io.swagger.core.v3:swagger-models-jakarta:2.2.55
jakarta.activation:jakarta.activation-api:2.1.4
jakarta.annotation:jakarta.annotation-api:3.0.0
jakarta.inject:jakarta.inject-api:2.0.1
jakarta.persistence:jakarta.persistence-api:3.2.0
jakarta.transaction:jakarta.transaction-api:2.0.1
jakarta.validation:jakarta.validation-api:3.1.1
jakarta.xml.bind:jakarta.xml.bind-api:4.0.5
javax.inject:javax.inject:1
net.bytebuddy:byte-buddy:1.18.11
net.bytebuddy:byte-buddy-agent:1.18.11
net.java.dev.jna:jna:5.17.0
net.java.dev.jna:jna-platform:5.17.0
net.minidev:accessors-smart:2.6.0
net.minidev:json-smart:2.6.0
org.antlr:antlr4-runtime:4.13.2
org.antlr:antlr4-runtime:4.7.2
org.apache.commons:commons-compress:1.27.1
org.apache.commons:commons-compress:1.28.0
org.apache.commons:commons-digester3:3.2
org.apache.commons:commons-lang3:3.16.0
org.apache.commons:commons-lang3:3.18.0
org.apache.commons:commons-lang3:3.20.0
org.apache.commons:commons-text:1.12.0
org.apache.httpcomponents.client5:httpclient5:5.6.4
org.apache.httpcomponents.core5:httpcore5:5.4.3
org.apache.httpcomponents.core5:httpcore5-h2:5.4.3
org.apache.logging.log4j:log4j-api:2.25.5
org.apache.logging.log4j:log4j-to-slf4j:2.25.5
org.apache.maven.doxia:doxia-core:2.0.0
org.apache.maven.doxia:doxia-integration-tools:2.0.0
org.apache.maven.doxia:doxia-module-apt:2.0.0
org.apache.maven.doxia:doxia-module-xdoc:2.0.0
org.apache.maven.doxia:doxia-module-xhtml5:2.0.0
org.apache.maven.doxia:doxia-sink-api:2.0.0
org.apache.maven.doxia:doxia-site-model:2.0.0
org.apache.maven.doxia:doxia-site-renderer:2.0.0
org.apache.maven.doxia:doxia-skin-model:2.0.0
org.apache.maven:maven-archiver:3.6.2
org.apache.maven:maven-archiver:3.6.6
org.apache.maven.plugins:maven-compiler-plugin:3.15.0
org.apache.maven.plugins:maven-dependency-plugin:3.10.0
org.apache.maven.plugins:maven-jar-plugin:3.5.1
org.apache.maven.plugins:maven-resources-plugin:3.5.0
org.apache.maven.plugins:maven-shade-plugin:3.6.0
org.apache.maven.plugins:maven-surefire-plugin:3.5.6
org.apache.maven.reporting:maven-reporting-api:4.0.0
org.apache.maven.reporting:maven-reporting-impl:4.0.0
org.apache.maven.resolver:maven-resolver-api:1.4.1
org.apache.maven.resolver:maven-resolver-util:1.4.1
org.apache.maven.resolver:maven-resolver-util:1.9.25
org.apache.maven.shared:file-management:3.2.0
org.apache.maven.shared:maven-artifact-transfer:0.13.1
org.apache.maven.shared:maven-common-artifact-filters:3.4.0
org.apache.maven.shared:maven-dependency-analyzer:1.17.0
org.apache.maven.shared:maven-dependency-tree:3.3.0
org.apache.maven.shared:maven-filtering:3.5.0
org.apache.maven.shared:maven-shared-incremental:1.1
org.apache.maven.shared:maven-shared-utils:3.4.2
org.apache.maven.surefire:common-java5:3.5.6
org.apache.maven.surefire:maven-surefire-common:3.5.6
org.apache.maven.surefire:surefire-api:3.5.6
org.apache.maven.surefire:surefire-booter:3.5.6
org.apache.maven.surefire:surefire-extensions-api:3.5.6
org.apache.maven.surefire:surefire-extensions-spi:3.5.6
org.apache.maven.surefire:surefire-junit-platform:3.5.6
org.apache.maven.surefire:surefire-logger-api:3.5.6
org.apache.maven.surefire:surefire-shared-utils:3.5.6
org.apache.tomcat.embed:tomcat-embed-core:11.0.24
org.apache.tomcat.embed:tomcat-embed-el:11.0.24
org.apache.tomcat.embed:tomcat-embed-websocket:11.0.24
org.apache.velocity.tools:velocity-tools-generic:3.1
org.apache.velocity:velocity-engine-core:2.4.1
org.apiguardian:apiguardian-api:1.1.2
org.aspectj:aspectjweaver:1.9.25.1
org.assertj:assertj-core:3.27.7
org.awaitility:awaitility:4.3.0
org.checkerframework:checker-qual:3.55.1
org.codehaus.plexus:plexus-archiver:4.11.0
org.codehaus.plexus:plexus-archiver:4.12.0
org.codehaus.plexus:plexus-build-api:1.2.0
org.codehaus.plexus:plexus-classworlds:2.6.0
org.codehaus.plexus:plexus-compiler-api:2.16.2
org.codehaus.plexus:plexus-compiler-javac:2.16.2
org.codehaus.plexus:plexus-compiler-manager:2.16.2
org.codehaus.plexus:plexus-component-annotations:2.0.0
org.codehaus.plexus:plexus-i18n:1.1.0
org.codehaus.plexus:plexus-interpolation:1.27
org.codehaus.plexus:plexus-interpolation:1.29
org.codehaus.plexus:plexus-io:3.6.0
org.codehaus.plexus:plexus-java:1.5.2
org.codehaus.plexus:plexus-utils:3.5.1
org.codehaus.plexus:plexus-utils:3.6.0
org.codehaus.plexus:plexus-utils:4.0.2
org.codehaus.plexus:plexus-utils:4.0.3
org.codehaus.plexus:plexus-velocity:2.2.0
org.codehaus.plexus:plexus-xml:3.0.1
org.eclipse.angus:angus-activation:2.0.3
org.eclipse.sisu:org.eclipse.sisu.inject:0.9.0.M4
org.eclipse.sisu:org.eclipse.sisu.plexus:0.9.0.M4
org.flywaydb:flyway-core:12.4.0
org.flywaydb:flyway-database-postgresql:12.4.0
org.glassfish.jaxb:jaxb-core:4.0.9
org.glassfish.jaxb:jaxb-runtime:4.0.9
org.glassfish.jaxb:txw2:4.0.9
org.hamcrest:hamcrest:3.0
org.hdrhistogram:HdrHistogram:2.2.2
org.hibernate.models:hibernate-models:1.1.1
org.hibernate.orm:hibernate-core:7.4.5.Final
org.hibernate.validator:hibernate-validator:9.1.3.Final
org.jboss.logging:jboss-logging:3.6.3.Final
org.jdom:jdom2:2.0.6.1
org.jspecify:jspecify:1.0.0
org.jspecify:jspecify:1.0.1
org.junit.jupiter:junit-jupiter:6.0.3
org.junit.jupiter:junit-jupiter-api:6.0.3
org.junit.jupiter:junit-jupiter-engine:6.0.3
org.junit.jupiter:junit-jupiter-params:6.0.3
org.junit.platform:junit-platform-commons:1.12.2
org.junit.platform:junit-platform-commons:6.0.3
org.junit.platform:junit-platform-engine:1.12.2
org.junit.platform:junit-platform-engine:6.0.3
org.junit.platform:junit-platform-launcher:1.12.2
org.junit.platform:junit-platform-launcher:6.0.3
org.mockito:mockito-core:5.23.0
org.mockito:mockito-junit-jupiter:5.23.0
org.objenesis:objenesis:3.3
org.opentest4j:opentest4j:1.3.0
org.ow2.asm:asm:9.7
org.ow2.asm:asm:9.7.1
org.ow2.asm:asm:9.9.1
org.ow2.asm:asm-commons:9.7
org.ow2.asm:asm-tree:9.7
org.postgresql:postgresql:42.7.13
org.skyscreamer:jsonassert:1.5.3
org.slf4j:jul-to-slf4j:2.0.18
org.slf4j:slf4j-api:1.7.36
org.slf4j:slf4j-api:2.0.18
org.sonatype.plexus:plexus-build-api:0.0.7
org.springdoc:springdoc-openapi-starter-common:3.1.1
org.springdoc:springdoc-openapi-starter-webmvc-api:3.1.1
org.springdoc:springdoc-openapi-starter-webmvc-ui:3.1.1
org.springframework.boot:spring-boot:4.1.1
org.springframework.boot:spring-boot-actuator:4.1.1
org.springframework.boot:spring-boot-actuator-autoconfigure:4.1.1
org.springframework.boot:spring-boot-autoconfigure:4.1.1
org.springframework.boot:spring-boot-buildpack-platform:4.1.1
org.springframework.boot:spring-boot-data-commons:4.1.1
org.springframework.boot:spring-boot-data-jpa:4.1.1
org.springframework.boot:spring-boot-data-jpa-test:4.1.1
org.springframework.boot:spring-boot-devtools:4.1.1
org.springframework.boot:spring-boot-flyway:4.1.1
org.springframework.boot:spring-boot-health:4.1.1
org.springframework.boot:spring-boot-hibernate:4.1.1
org.springframework.boot:spring-boot-http-converter:4.1.1
org.springframework.boot:spring-boot-jackson:4.1.1
org.springframework.boot:spring-boot-jdbc:4.1.1
org.springframework.boot:spring-boot-jdbc-test:4.1.1
org.springframework.boot:spring-boot-jpa:4.1.1
org.springframework.boot:spring-boot-jpa-test:4.1.1
org.springframework.boot:spring-boot-loader-tools:4.1.1
org.springframework.boot:spring-boot-maven-plugin:4.1.1
org.springframework.boot:spring-boot-micrometer-metrics:4.1.1
org.springframework.boot:spring-boot-micrometer-observation:4.1.1
org.springframework.boot:spring-boot-persistence:4.1.1
org.springframework.boot:spring-boot-resttestclient:4.1.1
org.springframework.boot:spring-boot-security:4.1.1
org.springframework.boot:spring-boot-security-oauth2-resource-server:4.1.1
org.springframework.boot:spring-boot-security-test:4.1.1
org.springframework.boot:spring-boot-servlet:4.1.1
org.springframework.boot:spring-boot-sql:4.1.1
org.springframework.boot:spring-boot-starter:4.1.1
org.springframework.boot:spring-boot-starter-actuator:4.1.1
org.springframework.boot:spring-boot-starter-data-jpa:4.1.1
org.springframework.boot:spring-boot-starter-data-jpa-test:4.1.1
org.springframework.boot:spring-boot-starter-flyway:4.1.1
org.springframework.boot:spring-boot-starter-jackson:4.1.1
org.springframework.boot:spring-boot-starter-jackson-test:4.1.1
org.springframework.boot:spring-boot-starter-jdbc:4.1.1
org.springframework.boot:spring-boot-starter-jdbc-test:4.1.1
org.springframework.boot:spring-boot-starter-logging:4.1.1
org.springframework.boot:spring-boot-starter-micrometer-metrics:4.1.1
org.springframework.boot:spring-boot-starter-security:4.1.1
org.springframework.boot:spring-boot-starter-security-oauth2-resource-server:4.1.1
org.springframework.boot:spring-boot-starter-security-test:4.1.1
org.springframework.boot:spring-boot-starter-test:4.1.1
org.springframework.boot:spring-boot-starter-tomcat:4.1.1
org.springframework.boot:spring-boot-starter-tomcat-runtime:4.1.1
org.springframework.boot:spring-boot-starter-validation:4.1.1
org.springframework.boot:spring-boot-starter-webmvc:4.1.1
org.springframework.boot:spring-boot-starter-webmvc-test:4.1.1
org.springframework.boot:spring-boot-test:4.1.1
org.springframework.boot:spring-boot-test-autoconfigure:4.1.1
org.springframework.boot:spring-boot-tomcat:4.1.1
org.springframework.boot:spring-boot-transaction:4.1.1
org.springframework.boot:spring-boot-validation:4.1.1
org.springframework.boot:spring-boot-webmvc:4.1.1
org.springframework.boot:spring-boot-webmvc-test:4.1.1
org.springframework.boot:spring-boot-web-server:4.1.1
org.springframework.data:spring-data-commons:4.1.1
org.springframework.data:spring-data-jpa:4.1.1
org.springframework.security:spring-security-config:7.1.1
org.springframework.security:spring-security-core:7.1.1
org.springframework.security:spring-security-crypto:7.1.1
org.springframework.security:spring-security-oauth2-core:7.1.1
org.springframework.security:spring-security-oauth2-jose:7.1.1
org.springframework.security:spring-security-oauth2-resource-server:7.1.1
org.springframework.security:spring-security-test:7.1.1
org.springframework.security:spring-security-web:7.1.1
org.springframework:spring-aop:7.0.9
org.springframework:spring-aspects:7.0.9
org.springframework:spring-beans:7.0.9
org.springframework:spring-context:7.0.9
org.springframework:spring-core:7.0.9
org.springframework:spring-expression:7.0.9
org.springframework:spring-jdbc:7.0.9
org.springframework:spring-orm:7.0.9
org.springframework:spring-test:7.0.9
org.springframework:spring-tx:7.0.9
org.springframework:spring-web:7.0.9
org.springframework:spring-webmvc:7.0.9
org.tomlj:tomlj:1.0.0
org.tukaani:xz:1.11
org.tukaani:xz:1.12
org.vafer:jdependency:2.10
org.webjars:swagger-ui:5.32.14
org.webjars:webjars-locator-lite:1.1.4
org.xmlunit:xmlunit-core:2.11.0
org.yaml:snakeyaml:2.6
tools.jackson.core:jackson-core:3.1.5
tools.jackson.core:jackson-databind:3.1.5
```
