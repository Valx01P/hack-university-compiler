// Little helpers from the original build.

function money(x) {
  return parseFloat(x).toFixed(2);
}

function paginate(page, limit) {
  page = parseInt(page, 10) || 0;
  limit = parseInt(limit, 10) || 10;
  return { limit: limit, offset: page * limit + 1 };
}

function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

module.exports = { money, paginate, slugify };
