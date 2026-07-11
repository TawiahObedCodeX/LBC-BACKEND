/**
 * tests/newsletter.test.js
 * ──────────────────────────────────────────────────────────────
 * Tests for the newsletter module: subscribe, confirm,
 * unsubscribe, and admin-only send/list/campaign endpoints.
 *
 * These tests use Supertest and need a real Postgres + Redis.
 * ──────────────────────────────────────────────────────────────
 */

const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');

beforeEach(async () => {
  // Clean up in the correct order: subscribers first (because
  // campaigns don't have foreign keys to subscribers in this
  // schema, but it's still good practice).
  await prisma.campaign.deleteMany();
  await prisma.subscriber.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/v1/newsletter/subscribe', () => {
  it('returns 400 for an invalid email', async () => {
    const response = await request(app)
      .post('/api/v1/newsletter/subscribe')
      .send({ email: 'not-an-email' });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('email');
  });

  it('creates a new PENDING subscriber for a valid email', async () => {
    const response = await request(app)
      .post('/api/v1/newsletter/subscribe')
      .send({ email: 'newsubscriber@example.com' });

    expect(response.status).toBe(201);
    expect(response.body.data.email).toBe('newsubscriber@example.com');
    expect(response.body.data.status).toBe('PENDING');
  });

  it('normalizes email to lowercase', async () => {
    const response = await request(app)
      .post('/api/v1/newsletter/subscribe')
      .send({ email: 'MixedCase@Example.com' });

    expect(response.status).toBe(201);
    expect(response.body.data.email).toBe('mixedcase@example.com');
  });

  it('returns the existing subscriber if already subscribed', async () => {
    // First subscribe
    await request(app)
      .post('/api/v1/newsletter/subscribe')
      .send({ email: 'existing@example.com' });

    // Second subscribe — same email
    const response = await request(app)
      .post('/api/v1/newsletter/subscribe')
      .send({ email: 'existing@example.com' });

    expect(response.status).toBe(201);
    expect(response.body.message).toContain('already');
  });
});

describe('POST /api/v1/newsletter/unsubscribe', () => {
  it('returns 404 for an invalid token', async () => {
    const response = await request(app)
      .post('/api/v1/newsletter/unsubscribe')
      .send({ token: 'invalid-token-12345' });

    expect(response.status).toBe(404);
  });

  it('unsubscribes a subscriber with a valid token', async () => {
    // Create a subscriber first
    const subscribeResponse = await request(app)
      .post('/api/v1/newsletter/subscribe')
      .send({ email: 'unsub-test@example.com' });

    // Fetch the subscriber directly from the DB to get the
    // unsubscribeToken (the subscribe endpoint doesn't return it
    // for security — it's only in emails).
    const subscriber = await prisma.subscriber.findUnique({
      where: { email: 'unsub-test@example.com' },
    });

    const response = await request(app)
      .post('/api/v1/newsletter/unsubscribe')
      .send({ token: subscriber.unsubscribeToken });

    expect(response.status).toBe(200);
    expect(response.body.message).toContain('unsubscribed');
  });
});

describe('POST /api/v1/newsletter/send (admin only)', () => {
  it('returns 401 without an Authorization header', async () => {
    const response = await request(app)
      .post('/api/v1/newsletter/send')
      .send({ subject: 'Test', bodyHtml: '<p>Hello</p>' });

    expect(response.status).toBe(401);
  });
});

describe('GET /api/v1/newsletter/subscribers (admin only)', () => {
  it('returns 401 without an Authorization header', async () => {
    const response = await request(app).get('/api/v1/newsletter/subscribers');

    expect(response.status).toBe(401);
  });
});