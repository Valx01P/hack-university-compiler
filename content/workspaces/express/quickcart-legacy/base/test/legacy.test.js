const { test } = require('node:test');

// TODO: this test has been skipped since 2021. It needs the database to be mocked before it can
// run in CI. For now `npm test` passes because the only test is skipped.
test('checkout applies the coupon', { skip: 'until the DB is mocked' }, () => {
  throw new Error('not implemented');
});
