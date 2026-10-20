# Spring Boot playground

A blank Spring Boot 4.1 project on Java 25, the kind start.spring.io gives you, with one
endpoint and one table. Use it to try anything from the course: add a controller, map the
`notes` table with JPA, write a migration, break something on purpose and read the error.
Reset puts every file back the way it started, and Reset database gives you an empty
database again.

## Run it

| Command | What it does |
| --- | --- |
| `./mvnw spring-boot:run` | Compiles and starts the app with the `dev` profile. Run starts this |
| `./mvnw test` | Compiles and runs the tests (no database needed for the one that is here) |
| `./mvnw -q compile` | Compiles only, which also makes DevTools restart a running app |
| `./mvnw package` | Builds `target/playground-0.0.1-SNAPSHOT.jar`, which `java -jar` runs anywhere |
| `./mvnw dependency:tree` | Shows every library the starters bring in |

The app prints the port it listens on (`Tomcat started on port 23017`), which is the
workspace's `PORT`. Try it from the terminal:

```bash
curl -s "localhost:$PORT/api/hello?name=Ana"
curl -s "localhost:$PORT/actuator/health"
```

`requests.http` holds the same requests for the HTTP panel. While the app runs, DevTools
restarts it about a second after a class changes, so save, compile, and send the request
again.

## What is here

```text
pom.xml                                  the build: Spring Boot 4.1.1 parent, Java 25, the starters
mvnw, .mvn/wrapper/                      the Maven Wrapper, pinned to Maven 3.10.0
requests.http                            ready requests for the HTTP panel
src/main/java/dev/hackuniversity/playground
  PlaygroundApplication.java             the entry point (@SpringBootApplication)
  hello/HelloController.java             GET /api/hello?name=Ana answers {"message":"Hello, Ana!"}
src/main/resources
  application.yml                        settings: port, database, JPA, error format, actuator
  db/migration/V1__create_notes.sql      the notes table, created by Flyway at startup
src/test/java/dev/hackuniversity/playground
  hello/HelloControllerTest.java         a @WebMvcTest with MockMvcTester
```

Put new code in packages under `dev.hackuniversity.playground` (for example `notes/`), so
component scanning finds it. A feature usually grows a controller, a service, a repository,
an entity, and request and response records, all in its own package.

## Settings

`application.yml` reads everything that changes between machines from the environment:

| Setting | Environment variable | In the workspace |
| --- | --- | --- |
| `server.port` | `PORT` | a free port the workspace leases |
| `spring.datasource.url` | `DB_URL` | this workspace's own PostgreSQL 18 database |
| `spring.datasource.username`, `password` | `DB_USER`, `DB_PASSWORD` | its own role |

The app listens on every interface of the container (Spring Boot's default), so the HTTP
panel, a browser tab, and `curl` all reach it. `./mvnw spring-boot:run` turns on the `dev`
profile (set in `pom.xml`), so an `application-dev.yml` you add applies there. Tests run with
the `test` profile instead, so an `application-test.yml` applies to them.

## The database

Flyway runs the migrations in `src/main/resources/db/migration` when the app starts, in
version order, once each. To change the schema, add the next file (`V2__add_note_title.sql`)
instead of editing one that already ran. Hibernate then checks that your entities match the
tables (`ddl-auto: validate`), and stops the app with a clear message when they do not.

Look around in the Database panel, or with `psql` in the terminal. `DB_URL` is a JDBC
address, so drop its `jdbc:` prefix and pass the role in `PGUSER` and `PGPASSWORD`:

```bash
PGUSER="$DB_USER" PGPASSWORD="$DB_PASSWORD" psql "${DB_URL#jdbc:}" -c '\d notes'
```

## Map the notes table

A first exercise: create `notes/Note.java` as an `@Entity` with `id`, `body`, and
`createdAt` (an `Instant`), a `NoteRepository extends JpaRepository<Note, Long>`, and a
controller with `GET /api/notes` and `POST /api/notes`. The table already exists, so no
migration is needed until you add a column.
