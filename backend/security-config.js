'use strict';

/** Require an explicit signing secret, so a missing environment variable fails closed. */
function getJwtSecret(environment = process.env) {
  const secret = environment?.JWT_SECRET;
  if (typeof secret !== 'string' || secret.trim().length < 32 || /CHANGE.IN.PROD/i.test(secret)) {
    throw new Error('JWT_SECRET doit contenir au moins 32 caracteres et etre configure explicitement.');
  }
  return secret;
}

/** Preserve certificate verification when PostgreSQL TLS is enabled. */
function getDatabaseTls(databaseUrl, environment = process.env) {
  if (environment.PGSSLMODE === 'disable') return false;
  const secure = environment.NODE_ENV === 'production' || /railway|render|heroku/i.test(databaseUrl || '');
  return secure ? { rejectUnauthorized: true } : false;
}

module.exports = { getJwtSecret, getDatabaseTls };
