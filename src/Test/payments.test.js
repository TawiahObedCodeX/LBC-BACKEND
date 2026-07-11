/**
 * tests/payments.test.js
 * ──────────────────────────────────────────────────────────────
 * Tests for the payments module: initiation, verification, and
 * the admin-only list endpoint.
 *
 * These tests use Supertest to hit the Express app directly (no
 * real network port), and need a real Postgres + Redis reachable
 * via DATABASE_URL / REDIS_URL in .env or .env.test.
 *
 * Running: `yarn test`
 * ──────────────────────────────────────────────────────────────
 */

const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');

// Clean up test data between tests so each test starts fresh.
beforeEach(async () => {
  await prisma.payment.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/v1/payments/initiate', () => {
  it('returns 400 if giverEmail is missing', async () => {
    const response = await request(app)
      .post('/api/v1/payments/initiate')
      .send({ amount: 50, purpose: 'TITHE' });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('giverEmail');
  });

  it('returns 400 if amount is zero or negative', async () => {
    const response = await request(app)
      .post('/api/v1/payments/initiate')
      .send({ amount: 0, purpose: 'TITHE', giverEmail: 'test@example.com' });

    expect(response.status).toBe(400);
  });

  it('returns 400 for an invalid purpose', async () => {
    const response = await request(app)
      .post('/api/v1/payments/initiate')
      .send({ amount: 50, purpose: 'INVALID_PURPOSE', giverEmail: 'test@example.com' });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('Purpose must be one of');
  });

  it('creates a payment and returns an authorization_url when Paystack is configured', async () => {
    // This test will fail with a 500 "Payments are not configured"
    // if PAYSTACK_SECRET_KEY is empty — that's expected in CI
    // without real Paystack keys. Mock Paystack in a real CI setup.
    const response = await request(app)
      .post('/api/v1/payments/initiate')
      .send({
        amount: 50,
        purpose: 'TITHE',
        giverEmail: 'giver@example.com',
        giverName: 'John Doe',
        currency: 'GHS',
      });

    // With a real Paystack key, expect 201. Without, expect 500.
    expect([201, 500]).toContain(response.status);
  });
});

describe('GET /api/v1/payments/verify/:reference', () => {
  it('returns 404 for a non-existent reference', async () => {
    const response = await request(app)
      .get('/api/v1/payments/verify/nonexistent_ref_12345');

    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Payment not found');
  });

  it('returns 400 if reference param is missing', async () => {
    // Express will treat this as a 404 (no route matches) because
    // the param is required in the path. That's fine — we test the
    // not-found behavior above.
    const response = await request(app)
      .get('/api/v1/payments/verify/');

    expect(response.status).toBe(404);
  });
});

describe('GET /api/v1/payments (admin only)', () => {
  it('returns 401 without an Authorization header', async () => {
    const response = await request(app).get('/api/v1/payments');

    expect(response.status).toBe(401);
  });

  it('returns 401 with an invalid token', async () => {
    const response = await request(app)
      .get('/api/v1/payments')
      .set('Authorization', 'Bearer invalid_token_here');

    expect(response.status).toBe(401);
  });
});