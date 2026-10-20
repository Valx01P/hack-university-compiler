# Architecture

How Shopfront is put together, the rules that keep it that way, and why each rule exists.
`src/test/java/dev/hackuniversity/shopfront/ArchitectureTest.java` checks the first three
rules on every `./mvnw test`, so a change that breaks one fails the build and names the class.

## Packages by feature, layers inside

```text
auth/       logging in and issuing tokens
customer/   accounts
catalog/    categories and products
order/      orders and their lines
config/     wiring that belongs to no feature: security, JWT, settings, the clock, API docs
common/     what every feature shares: the exceptions and the one handler that answers them
```

A feature package holds every layer of that feature, so a change to orders stays in
`order/`. Request and response records sit in each feature's `dto/` package.

| Layer | Classes | Does | Never does |
| --- | --- | --- | --- |
| Web | `*Controller`, `ApiExceptionHandler` | Reads paths, parameters, and bodies, validates their shape with `@Valid`, calls one service method, picks the status code | Touches a repository, holds a business rule, returns an entity |
| Service | `*Service` | Holds the rules, runs each method in one transaction, turns entities into response records | Reads HTTP requests or tokens, builds HTTP responses |
| Data | `*Repository` | Queries and saves entities | Holds rules |
| Model | `Customer`, `Category`, `Product`, `Order`, `OrderLine` | Keeps its own data valid (`Product.removeStock`, `Order.cancel`) | Calls services or repositories |

## The rules ArchitectureTest checks

1. **Controllers never use repositories.** A controller that reaches the database skips the
   service, which is where the rules and the transaction live. The next person to add a rule
   to the service would miss that path.
2. **Controllers never return entities.** An entity in a response leaks every column, so a
   `Customer` would send its `passwordHash`. Serializing it can also touch lazy relations
   after the transaction has closed (`spring.jpa.open-in-view` is off), which fails, or loads
   one row at a time. Response records decide exactly what clients see, and the schema can
   change without changing the API.
3. **No field injection.** Every class takes its dependencies in its constructor. They are
   visible in one place, they can be `final`, and a unit test builds the class with `new`
   (`OrderServiceTest` does) without starting Spring.

## Conventions the code follows

- **Transactions belong to services.** Each service class is `@Transactional(readOnly = true)`,
  and each method that writes says `@Transactional`. A rule that throws rolls back everything
  the method did, stock included.
- **Responses are built inside the transaction.** Services return records, so every lazy
  relation a response needs is read while the persistence context is still open. Queries
  fetch what the response needs up front (`@EntityGraph`, `join fetch`), so a page of results
  costs a fixed number of SQL statements, not one per row.
- **Errors are thrown, and answered in one place.** Services throw `NotFoundException`,
  `ConflictException`, or `UnprocessableException`. `ApiExceptionHandler` turns them, and
  Spring's own errors, into RFC 9457 problems. Shape problems (a missing field, a malformed
  SKU) are 400 from validation, and meaning problems (an unknown SKU) are 422 from a service.
- **Security is decided before the controller runs.** `SecurityConfig` maps paths and methods
  to roles. Ownership ("is this your order?") needs the data, so the service checks it, and
  answers 404 for someone else's order so ids reveal nothing.
- **Time comes from the `Clock` bean.** Nothing calls `Instant.now()` without it, so a fixed
  clock (`HU_FIXED_TIME`) makes every run repeatable, tests included.
- **The database has the last word.** Flyway migrations own the schema, Hibernate only
  validates it, and constraints (`UNIQUE`, `CHECK`, foreign keys) catch what slips past the code.
- **Pre-database hooks set what must always be set.** `PlacedAtListener` stamps `placedAt` on
  every new order just before the INSERT, whichever code path saved it.
