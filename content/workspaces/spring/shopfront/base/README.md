# Shopfront

The API behind a small online store: a catalog of products in categories, customer
accounts, and orders. Shoppers browse without logging in, log in for a token, and place and
cancel orders. Admins edit the catalog. It is the same domain as the SQL course's sample
database (customers, products, orders, order lines), built the way a Spring team would
build it: Spring Boot 4.1 on Java 25, layered by feature, PostgreSQL 18 through JPA and
Flyway, stateless JWT security, OpenAPI docs, and tests at every layer.

## Run it

| Command | What it does |
| --- | --- |
| `./mvnw spring-boot:run` | Starts the app with the `dev` profile, which loads the sample shop. Run starts this |
| `./mvnw test` | Runs all 31 tests: unit, web slice, data slice, end to end, and the architecture rules |
| `./mvnw test -Dtest=OrderServiceTest` | Runs one test class |
| `./mvnw -q compile` | Compiles only. While the app runs, DevTools restarts it about a second later |
| `./mvnw package` | Builds `target/shopfront-0.0.1-SNAPSHOT.jar`, which `java -jar` runs anywhere |

The app prints the port it listens on (`Tomcat started on port 23017`), the workspace's
`PORT`. `requests.http` has a ready request for every endpoint, in an order that tells the
story: browse, log in, order, cancel, and edit the catalog as the admin. Swagger UI draws
the same API at `/swagger-ui.html`, and the OpenAPI document is at `/v3/api-docs`.

## Accounts

The `dev` profile seeds these (`src/main/resources/db/seed/afterMigrate.sql`):

| Email | Password | Role | Orders |
| --- | --- | --- | --- |
| `ana@example.com` | `ana-pass-123` | CUSTOMER | 4 |
| `bob@example.com` | `bob-pass-123` | CUSTOMER | 4 |
| `cy@example.com` | `cy-pass-123` | CUSTOMER | 2 |
| `admin@example.com` | `admin-pass-123` | ADMIN | none |

Anyone can sign up with `POST /api/customers`, and new accounts are always customers.

## Get a token

```bash
TOKEN=$(curl -s "localhost:$PORT/api/auth/token" -H 'Content-Type: application/json' \
  -d '{"email":"ana@example.com","password":"ana-pass-123"}' | jq -r .token)
curl -s "localhost:$PORT/api/orders" -H "Authorization: Bearer $TOKEN" | jq
```

The token is a JWT signed with HS256. Its claims are the issuer (`shopfront`), the subject
(the email), `iat`, `exp` (an hour later), and `roles` (`["ROLE_CUSTOMER"]`). Paste one into
a JWT decoder to see them. The server keeps no session: every request carries its token.

## Endpoints

| Method and path | Who | What it does |
| --- | --- | --- |
| `POST /api/auth/token` | anyone | `{email, password}` gives `{token, tokenType, expiresIn}`. A wrong pair is 401 |
| `POST /api/customers` | anyone | Signs up `{email, name, password}`. A taken email is 409 |
| `GET /api/customers/me` | any token | Your own account |
| `GET /api/categories` | anyone | The categories, by name |
| `GET /api/products` | anyone | Active products, paged: `?q=` (name or description), `&category=kitchen`, `&inStock=true`, `&page=0&size=20&sort=priceCents,desc` |
| `GET /api/products/{sku}` | anyone | One active product |
| `POST /api/products` | ADMIN | Adds a product. 201 with a `Location` header |
| `PUT /api/products/{sku}` | ADMIN | Replaces a product's fields (and can put a deactivated one back on sale) |
| `DELETE /api/products/{sku}` | ADMIN | Takes a product off sale (204). The row stays, because orders point at it |
| `POST /api/products/{sku}/stock` | ADMIN | `{change: 5}` adds stock, a negative change removes it |
| `POST /api/orders` | CUSTOMER | Places `{lines: [{sku, quantity}]}`. 201 with a `Location` header |
| `GET /api/orders` | CUSTOMER, ADMIN | Your own orders, newest first, paged |
| `GET /api/orders/{id}` | CUSTOMER, ADMIN | One order. Someone else's is 404 (admins see all) |
| `POST /api/orders/{id}/cancel` | CUSTOMER, ADMIN | Cancels a placed or paid order within 24 hours, and puts its stock back |
| `GET /actuator/health`, `/actuator/info` | anyone | Health (`{"status":"UP"}`) and app info |
| `GET /actuator/metrics/{name}` | ADMIN | Micrometer metrics, such as `http.server.requests` |

Errors are RFC 9457 problems (`application/problem+json`) with `title`, `status`, `detail`,
and `instance`:

| Status | When | Extra fields |
| --- | --- | --- |
| 400 | A field has the wrong shape, or a sort property does not exist | `errors`, one message per field path: `{"lines[0].quantity": "must be greater than 0"}` |
| 401 | No token, a bad token, or a wrong password | The `WWW-Authenticate: Bearer` header |
| 403 | The token's role is not allowed here | |
| 404 | No such product, or no such order that you may see | |
| 409 | The state says no: out of stock, a taken email or SKU, an order that shipped, two changes at once | `sku` when one product caused it |
| 422 | The request is well formed but names something the shop cannot use: an unknown SKU or category | `sku` or `category` |

## How the code is laid out

Packaged by feature: everything about orders lives in `order/`. Inside each feature, the
classes split into layers.

```text
src/main/java/dev/hackuniversity/shopfront
  ShopfrontApplication.java     the entry point
  config/                       SecurityConfig (who may call what), JwtConfig (signing and checking
                                tokens), ShopProperties (shop.* settings), ClockConfig, OpenApiConfig
  auth/                         AuthController, TokenService (log in, issue the JWT), CurrentUser
  customer/                     Customer (entity), Role, CustomerRepository, CustomerService,
                                CustomerController, CustomerUserDetailsService (loads logins), dto/
  catalog/                      Category and Product (entities), their repositories, CatalogService,
                                ProductController, CategoryController, dto/
  order/                        Order and OrderLine (entities), OrderStatus, PlacedAtListener (a JPA
                                hook), OrderRepository, OrderService, OrderController, dto/
  common/                       ApiExceptionHandler (errors as problems), ShopException and its
                                NotFound, Conflict, and Unprocessable subclasses
src/main/resources
  application.yml               settings for every run, application-dev.yml for the dev profile
  db/migration/                 V1__customers.sql to V4__indexes.sql, run by Flyway at startup
  db/seed/afterMigrate.sql      the sample shop, dev profile only
src/test/java/dev/hackuniversity/shopfront
  catalog/ProductControllerTest.java   @WebMvcTest: the web layer and security, service mocked
  catalog/ProductRepositoryTest.java   @DataJpaTest: queries and @Version on real PostgreSQL
  order/OrderServiceTest.java          plain JUnit and Mockito: the checkout rules
  order/OrderFlowTest.java             @SpringBootTest on a random port with RestTestClient
  ArchitectureTest.java                ArchUnit: the layer rules in docs/architecture.md
docs/architecture.md            the layer rules, and why each one exists
```

A controller reads HTTP and calls one service method. A service holds the rules, runs the
transaction, and returns response records. Repositories are the only classes that touch the
database. `docs/architecture.md` explains the rules, and `ArchitectureTest` fails the build
when code breaks one.

## One request through every layer

`POST /api/orders` with `{"lines":[{"sku":"BK-004","quantity":2}]}` and ana's token:

1. Spring Security's bearer filter checks the token's signature, issuer, and expiry
   (`JwtConfig.jwtDecoder`), and turns its `roles` claim into authorities.
2. `SecurityConfig` sees `POST /api/orders` needs `ROLE_CUSTOMER`. Ana has it.
3. `OrderController.place` reads the body into a `PlaceOrderRequest` record. `@Valid` checks
   its shape first, and a bad field stops here with 400.
4. `OrderService.placeOrder` opens a transaction, loads ana and the products by SKU, and for
   each line checks the product is for sale, takes the stock (`Product.removeStock`), and
   copies its price into a new `OrderLine`. It then adds up the subtotal and the tax.
5. `orders.save(order)` inserts the order. Just before the INSERT, JPA calls
   `PlacedAtListener`, which stamps `placedAt` from the shop's `Clock`. The lines go in with
   it (cascade).
6. The transaction commits. Hibernate's update of each product checks its `@Version`, so if
   another order took the same stock a moment ago, this one fails with 409 instead of selling
   it twice.
7. The service maps the order to an `OrderResponse` record, and the controller answers 201
   with `Location: /api/orders/11`.

## Data

The `dev` profile adds `classpath:db/seed` to Flyway's locations, so `afterMigrate.sql` runs
after every migrate. It skips rows that exist, so restarts never duplicate them, and Reset
database brings them all back. The sample shop: the four accounts above, four categories
(Books, Electronics, Kitchen, Outdoors), and 24 products, six per category, `BK-001` to
`OD-006`, priced from 499 to 129,900 cents. Stock runs from 0 to 40: `BK-005` and `KT-003` are
sold out, and `KT-004` (a stand mixer) has exactly one left. Ten orders from February and
March 2026 cover every status. Order 10 was placed at 09:30 on the workspace's "today".

Money is whole cents in `long` fields and `bigint` columns, never floating point. Tax is
8.25% of the subtotal (`shop.tax-rate`), worked out in basis points with integer math and
rounded half up to the cent. Each order stores its own tax rate and currency. Product cards
in the catalog say `freeShipping: true` when the price alone reaches
`shop.free-shipping-over-cents` (5000).

The workspace's clock is fixed at 2026-03-31T12:00:00Z (`HU_FIXED_TIME`, read as
`app.clock.fixed`), so new orders get that time, tokens expire an hour after it, and the
24-hour cancel window always measures from the same moment. Without the variable, the app
uses the real time.

## Settings

| Setting | Environment variable | Default, and what the workspace passes |
| --- | --- | --- |
| `server.port` | `PORT` | 8080. The workspace leases a free port |
| `spring.datasource.url`, `username`, `password` | `DB_URL`, `DB_USER`, `DB_PASSWORD` | A local `shopfront` database. The workspace passes its own |
| tests' datasource | `TEST_DB_URL`, `TEST_DB_USER`, `TEST_DB_PASSWORD` | The workspace's test database, or the app's when there is none |
| `app.clock.fixed` | `HU_FIXED_TIME` | Empty, meaning the real time |
| `shop.jwt.secret` | `SHOP_JWT_SECRET` | A development secret. Set a real one anywhere real |
| `shop.currency`, `shop.tax-rate`, `shop.free-shipping-over-cents`, `shop.jwt.ttl` | | `USD`, `0.0825`, `5000`, `1h` |

The app listens on every interface in the container (Spring Boot's default), so the HTTP
panel, a browser tab, and `curl` all reach it. CORS allows the storefront web app at
`http://localhost:5173`.

## Tests

`./mvnw test` runs with the `test` profile: a fixed clock and the migrations without the
seed, so each test makes the rows it needs. Data slice tests roll back, and the end-to-end
test deletes its rows with `@Sql` before and after each test, so the suite runs as often as
you like on the same database.

Slice tests start only part of the app. A `@WebMvcTest` that needs the real security rules
imports `SecurityConfig` and mocks `JwtDecoder`. A `@DataJpaTest` imports `ClockConfig`,
because Hibernate builds `PlacedAtListener` as a bean and it needs the `Clock`.
