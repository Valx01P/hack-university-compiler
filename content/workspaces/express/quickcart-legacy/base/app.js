// QuickCart API. One file, every route. Written in 2018, still in production. The dependency
// bot bumped Express to 5 last week.
const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { pool, query } = require('./db');
const { signToken, authMiddleware, adminOnly } = require('./auth');
const { paginate, slugify } = require('./utils');

const app = express();
app.use(express.json());
const upload = multer({ dest: 'uploads/' });

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ---- auth ----

app.post('/signup', (req, res) => {
  console.log('new signup', req.body);
  const email = req.body.email;
  const password = req.body.password;
  const name = req.body.name;
  const hash = bcrypt.hashSync(password, 4);
  query('INSERT INTO users (email, password, name) VALUES ($1, $2, $3) RETURNING id, email, is_admin', [email, hash, name])
    .then((r) => {
      const user = r.rows[0];
      res.status(201).json({ token: signToken(user), user: user });
    })
    .catch((err) => res.status(400).json({ error: err.message }));
});

app.post('/login', (req, res) => {
  const email = req.body.email;
  const password = req.body.password;
  query('SELECT * FROM users WHERE email = $1', [email])
    .then((r) => {
      if (r.rows.length === 0) {
        return res.status(404).json({ error: 'no account with that email' });
      }
      const user = r.rows[0];
      if (!bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ error: 'wrong password' });
      }
      res.json({ token: signToken(user) });
    })
    .catch((err) => res.status(500).json({ error: err.message }));
});

// ---- products ----

app.get('/products', (req, res) => {
  const search = req.query.search || '';
  const sort = req.query.sort || 'id';
  const page = paginate(req.query.page, req.query.limit);
  let sql = "SELECT * FROM products WHERE name ILIKE '%" + search + "%' ORDER BY " + sort;
  sql += ' LIMIT ' + page.limit + ' OFFSET ' + page.offset;
  query(sql)
    .then((r) => res.json(r.rows))
    .catch((err) => res.status(500).json({ error: err.message }));
});

app.get('/products/:id', (req, res) => {
  query('SELECT * FROM products WHERE id = $1', [req.params.id]).then((r) => {
    if (!r.rows[0]) {
      return res.status(404).json({ error: 'not found' });
    }
    res.json(r.rows[0]);
  });
});

// ---- cart ----

app.post('/cart/items', authMiddleware, async (req, res) => {
  const userId = req.user ? req.user.id : null;
  if (!userId) {
    return res.status(401).json({ error: 'login required' });
  }
  let cr = await query('SELECT * FROM carts WHERE user_id = $1', [userId]);
  let cart = cr.rows[0];
  if (!cart) {
    cr = await query('INSERT INTO carts (user_id) VALUES ($1) RETURNING *', [userId]);
    cart = cr.rows[0];
  }
  await query('INSERT INTO cart_items (cart_id, product_id, quantity) VALUES ($1, $2, $3)', [cart.id, req.body.product_id, req.body.quantity]);
  res.status(201).json({ cart_id: cart.id });
});

app.get('/cart', authMiddleware, (req, res) => {
  const userId = req.user ? req.user.id : 0;
  const sql =
    'SELECT ci.product_id, ci.quantity, p.name, p.price FROM cart_items ci ' +
    'JOIN carts c ON c.id = ci.cart_id JOIN products p ON p.id = ci.product_id WHERE c.user_id = $1';
  query(sql, [userId], (err, result) => {
    if (err) {
      console.log('cart query error', err.message);
    }
    const items = result.rows;
    res.json({ items: items });
  });
});

// ---- checkout ----

app.post('/checkout', authMiddleware, async (req, res) => {
  const items = req.body.items;
  const code = req.body.coupon;
  if (!items || items.length === 0) {
    res.status(400).json({ error: 'cart is empty' });
  }
  const userId = req.user ? req.user.id : null;
  const created = await query('INSERT INTO orders (user_id, total, coupon_code) VALUES ($1, $2, $3) RETURNING id', [userId, 0, code || null]);
  const orderId = created.rows[0].id;
  let total = 0;
  for (const item of items) {
    const pr = await query('SELECT * FROM products WHERE id = $1', [item.product_id]);
    const product = pr.rows[0];
    if (product.stock < item.quantity) {
      return res.status(409).json({ error: 'out of stock: ' + product.name });
    }
    await query('UPDATE products SET stock = stock - $1 WHERE id = $2', [item.quantity, product.id]);
    await query('INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)', [orderId, product.id, item.quantity, product.price]);
    total += parseFloat(product.price) * item.quantity;
  }
  if (code) {
    const cr = await query('SELECT * FROM coupons WHERE code = $1', [code]);
    const coupon = cr.rows[0];
    if (coupon) {
      if (coupon.percent) {
        total = total - (total * coupon.percent) / 100;
      } else if (coupon.amount) {
        total = total - parseFloat(coupon.amount);
      }
    }
  }
  await query('UPDATE orders SET total = $1 WHERE id = $2', [total, orderId]);
  res.status(201).json({ order_id: orderId, total: total });
});

// ---- orders ----

app.get('/orders', authMiddleware, async (req, res) => {
  const userId = req.user ? req.user.id : null;
  const r = await query('SELECT * FROM orders WHERE user_id = $1 ORDER BY id DESC', [userId]);
  const orders = r.rows;
  for (const order of orders) {
    const ir = await query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
    order.items = ir.rows;
  }
  res.json(orders);
});

app.get('/orders/:id', authMiddleware, async (req, res) => {
  const r = await query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
  if (!r.rows[0]) {
    return res.status(404).json({ error: 'not found' });
  }
  const ir = await query('SELECT * FROM order_items WHERE order_id = $1', [req.params.id]);
  const order = r.rows[0];
  order.items = ir.rows;
  res.json(order);
});

// ---- admin ----

app.post('/admin/products', authMiddleware, adminOnly, async (req, res) => {
  const name = req.body.name;
  const r = await query('INSERT INTO products (name, slug, price, stock) VALUES ($1, $2, $3, $4) RETURNING *', [name, slugify(name), req.body.price, req.body.stock || 0]);
  res.status(201).json(r.rows[0]);
});

app.post('/admin/products/:id/image', authMiddleware, adminOnly, upload.single('image'), (req, res) => {
  res.json({ ok: true, file: req.file ? req.file.filename : null });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('QuickCart listening on http://localhost:' + PORT);
});

module.exports = { app, pool };
