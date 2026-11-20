-- PostgreSQL in your browser. The sample database has departments,
-- employees, customers, products, orders, and order_items.
SELECT d.name AS department, count(*) AS people, round(avg(e.salary)) AS avg_salary
FROM employees e
JOIN departments d ON d.id = e.department_id
GROUP BY d.name
ORDER BY people DESC, department;
