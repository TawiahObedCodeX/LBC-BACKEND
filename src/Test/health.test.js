/**
 * tests/health.test.js
 * ──────────────────────────────────────────────────────────────
 * WHAT THIS FILE TESTS
 * These tests hit the Express `app` object directly through
 * Supertest — no real network port is opened, and no real
 * server.js startup sequence runs. This is why app.js and
 * server.js are kept separate: app.js is fully testable in
 * isolation.
 *
 * HOW TO RUN
 *   yarn test
 *
 * These tests need a real Postgres + Redis reachable via the
 * DATABASE_URL / REDIS_URL in your .env (or .env.test) — the health
 * check genuinely pings both, which is the point: it proves the
 * whole chain works, not just that Express is wired up.
 * ──────────────────────────────────────────────────────────────
 */

const request = require('supertest');
const app = require('../src/app');

describe('GET /api/v1/health', () => {
  it('returns 200 and reports both database and redis as healthy', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.checks.database).toBe(true);
    expect(response.body.data.checks.redis).toBe(true);
  });
});

describe('Unknown routes', () => {
  it('returns a consistent 404 JSON shape instead of Express default HTML', async () => {
    const response = await request(app).get('/api/v1/this-route-does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      message: expect.stringContaining('Route not found'),
      data: null,
    });
  });
});

describe('Security headers', () => {
  it('sets Helmet security headers on every response', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBeDefined();
  });
});

describe('CORS', () => {
  it('allows a whitelisted origin', async () => {
    const response = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'http://localhost:3000');

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it('does not echo back a non-whitelisted origin', async () => {
    const response = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'https://not-allowed.example.com');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('Body size limit', () => {
  it('rejects a JSON payload larger than 10kb with 413', async () => {
    const oversizedPayload = { data: 'a'.repeat(20_000) };

    const response = await request(app).post('/api/v1/health').send(oversizedPayload);

    expect(response.status).toBe(413);
  });
});
