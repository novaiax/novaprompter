'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { getJwtSecret, getDatabaseTls } = require('./security-config');

test('missing, short, malformed and legacy fallback secrets are rejected', () => {
  for (const JWT_SECRET of [undefined, '', 42, 'short', ' '.repeat(64), 'novaprompter-dev-secret-CHANGE-IN-PROD']) {
    assert.throws(() => getJwtSecret({ JWT_SECRET }), /JWT_SECRET/);
  }
  assert.throws(() => getJwtSecret(null), /JWT_SECRET/);
});

test('a configured signing secret is preserved verbatim', () => {
  const secret = 'test-only-strong-secret-0123456789abcdef';
  assert.equal(getJwtSecret({ JWT_SECRET: secret }), secret);
});

test('production database TLS verifies the certificate', () => {
  assert.deepEqual(getDatabaseTls('postgres://example/db', { NODE_ENV: 'production' }), { rejectUnauthorized: true });
  assert.deepEqual(getDatabaseTls('postgres://host.railway.app/db', {}), { rejectUnauthorized: true });
});

test('plain local PostgreSQL is an explicit deployment choice', () => {
  assert.equal(getDatabaseTls('postgres://localhost/db', {}), false);
  assert.equal(getDatabaseTls('postgres://private-db/db', { NODE_ENV: 'production', PGSSLMODE: 'disable' }), false);
});
