// Database helper. One global pool for the whole app.
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Thin wrapper so every query gets logged while we debug. Pass a callback for the old
// callback-style routes, or leave it off to get a promise back.
function query(text, params, cb) {
  console.log('[db]', text.replace(/\s+/g, ' ').trim(), 'params=', JSON.stringify(params));
  if (cb) {
    return pool.query(text, params, cb);
  }
  return pool.query(text, params);
}

module.exports = { pool, query };
