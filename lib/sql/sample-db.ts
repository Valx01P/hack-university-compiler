/**
 * The SQL playground's starting database: a small company and its store.
 * Employees report to managers (for joins on the same table and recursive
 * queries), and orders tie customers to products (for joins and aggregates).
 * Reset the playground to get it back exactly.
 */
export const SAMPLE_DB_SQL = `
CREATE TABLE departments (
  id     integer PRIMARY KEY,
  name   text NOT NULL UNIQUE,
  budget numeric(12, 2) NOT NULL
);

INSERT INTO departments (id, name, budget) VALUES
  (1, 'Engineering', 1500000),
  (2, 'Sales', 600000),
  (3, 'Marketing', 400000),
  (4, 'Support', 250000),
  (5, 'Research', 800000);

CREATE TABLE employees (
  id            integer PRIMARY KEY,
  name          text NOT NULL,
  email         text UNIQUE,
  department_id integer REFERENCES departments (id),
  manager_id    integer REFERENCES employees (id),
  salary        integer NOT NULL CHECK (salary > 0),
  hired_on      date NOT NULL
);

INSERT INTO employees (id, name, email, department_id, manager_id, salary, hired_on) VALUES
  (1, 'Ada Lovelace', 'ada@example.com', 1, NULL, 185000, '2016-02-01'),
  (2, 'Grace Hopper', 'grace@example.com', 1, 1, 160000, '2017-06-12'),
  (3, 'Alan Turing', 'alan@example.com', 5, 1, 170000, '2017-09-01'),
  (4, 'Linus Pauling', NULL, 1, 2, 132000, '2019-03-18'),
  (5, 'Margaret Hamilton', 'margaret@example.com', 1, 2, 145000, '2018-11-05'),
  (6, 'Dennis Ritchie', 'dennis@example.com', 1, 2, 128000, '2020-01-13'),
  (7, 'Katherine Johnson', 'katherine@example.com', 5, 3, 138000, '2019-07-22'),
  (8, 'Hedy Lamarr', 'hedy@example.com', 5, 3, 121000, '2021-05-03'),
  (9, 'Steve Wozniak', 'woz@example.com', 2, 1, 150000, '2018-04-09'),
  (10, 'Mary Jackson', 'mary@example.com', 2, 9, 98000, '2021-10-25'),
  (11, 'Barbara Liskov', 'barbara@example.com', 2, 9, 102000, '2020-08-17'),
  (12, 'Frances Allen', NULL, 3, 1, 115000, '2019-01-28'),
  (13, 'Radia Perlman', 'radia@example.com', 3, 12, 87000, '2022-06-06'),
  (14, 'John Backus', 'john@example.com', 4, 1, 99000, '2020-03-02'),
  (15, 'Annie Easley', 'annie@example.com', 4, 14, 72000, '2023-02-14'),
  (16, 'Ken Thompson', 'ken@example.com', NULL, 1, 140000, '2024-01-08');

CREATE TABLE customers (
  id        integer PRIMARY KEY,
  name      text NOT NULL,
  city      text NOT NULL,
  signed_up date NOT NULL
);

INSERT INTO customers (id, name, city, signed_up) VALUES
  (1, 'Acme Corp', 'Austin', '2022-01-15'),
  (2, 'Blue Owl Books', 'Boston', '2022-03-02'),
  (3, 'Cedar Cafe', 'Austin', '2022-05-20'),
  (4, 'Delta Dental', 'Denver', '2022-08-11'),
  (5, 'Echo Studios', 'Boston', '2023-01-09'),
  (6, 'Fern Florist', 'Chicago', '2023-04-27'),
  (7, 'Granite Gym', 'Denver', '2023-07-14'),
  (8, 'Harbor Hotel', 'Chicago', '2024-02-03');

CREATE TABLE products (
  id       integer PRIMARY KEY,
  name     text NOT NULL,
  category text NOT NULL,
  price    numeric(8, 2) NOT NULL,
  stock    integer NOT NULL DEFAULT 0
);

INSERT INTO products (id, name, category, price, stock) VALUES
  (1, 'Laptop', 'Electronics', 1299.00, 14),
  (2, 'Monitor', 'Electronics', 329.99, 30),
  (3, 'Keyboard', 'Accessories', 79.50, 120),
  (4, 'Mouse', 'Accessories', 29.99, 200),
  (5, 'Desk', 'Furniture', 449.00, 8),
  (6, 'Chair', 'Furniture', 289.00, 0),
  (7, 'Headphones', 'Electronics', 199.95, 45),
  (8, 'Webcam', 'Electronics', 89.00, 60),
  (9, 'Lamp', 'Furniture', 59.00, 25),
  (10, 'USB Cable', 'Accessories', 9.99, 500);

CREATE TABLE orders (
  id          integer PRIMARY KEY,
  customer_id integer NOT NULL REFERENCES customers (id),
  ordered_on  date NOT NULL,
  status      text NOT NULL CHECK (status IN ('pending', 'shipped', 'delivered', 'cancelled'))
);

INSERT INTO orders (id, customer_id, ordered_on, status) VALUES
  (1, 1, '2024-01-05', 'delivered'),
  (2, 2, '2024-01-19', 'delivered'),
  (3, 1, '2024-02-02', 'delivered'),
  (4, 3, '2024-02-14', 'cancelled'),
  (5, 4, '2024-03-01', 'delivered'),
  (6, 5, '2024-03-22', 'shipped'),
  (7, 1, '2024-04-10', 'shipped'),
  (8, 6, '2024-04-18', 'pending'),
  (9, 2, '2024-05-03', 'pending'),
  (10, 7, '2024-05-21', 'delivered'),
  (11, 4, '2024-06-09', 'shipped'),
  (12, 3, '2024-06-30', 'pending');

CREATE TABLE order_items (
  order_id   integer REFERENCES orders (id),
  product_id integer REFERENCES products (id),
  quantity   integer NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (order_id, product_id)
);

INSERT INTO order_items (order_id, product_id, quantity) VALUES
  (1, 1, 2), (1, 3, 2), (1, 4, 2),
  (2, 7, 1), (2, 10, 3),
  (3, 2, 4), (3, 5, 2),
  (4, 6, 6),
  (5, 1, 1), (5, 2, 1), (5, 8, 1),
  (6, 7, 5), (6, 9, 2),
  (7, 3, 10), (7, 4, 10), (7, 10, 20),
  (8, 5, 1), (8, 9, 1),
  (9, 2, 2),
  (10, 8, 3), (10, 10, 6),
  (11, 1, 3),
  (12, 4, 1);
`;
