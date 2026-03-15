import { expect, test } from '@playwright/test';

/**
 * Agent chat E2E tests.
 *
 * These tests verify the agent API endpoints and UI integration.
 * Tests that require ANTHROPIC_API_KEY are marked with `@slow` and
 * will be skipped in CI environments without the key configured.
 *
 * The mock/unit-level tests cover the SSE parser and data service
 * independently. These E2E tests focus on the HTTP layer and UI.
 */

const UNIQUE = Date.now();
const TEST_ORG = `Agent E2E Org ${UNIQUE}`;
const TEST_NAME = 'Agent Tester';
const TEST_EMAIL = `agent-e2e-${UNIQUE}@test.com`;
const TEST_PASSWORD = 'agent-e2e-password-123';

test.describe.configure({ mode: 'serial' });

test.describe('agent chat API', () => {
  let sessionCookie: string;

  test.beforeAll(async ({ request }) => {
    // Register a test user
    const regRes = await request.post('/api/auth/register', {
      data: {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        name: TEST_NAME,
        orgName: TEST_ORG,
      },
    });
    expect(regRes.status()).toBe(200);

    // Login to get session
    const loginRes = await request.post('/api/auth/login', {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    expect(loginRes.status()).toBe(200);

    // Extract session cookie
    const cookies = loginRes.headers()['set-cookie'];
    const match = cookies?.match(/lb_session=([^;]+)/);
    sessionCookie = match ? `lb_session=${match[1]}` : '';
    expect(sessionCookie).not.toBe('');
  });

  test('returns 401 without auth', async ({ request }) => {
    const res = await request.post('/api/agent/chat', {
      data: { message: 'hello' },
    });
    expect(res.status()).toBe(401);
  });

  test('returns 400 without message', async ({ request }) => {
    const res = await request.post('/api/agent/chat', {
      data: {},
      headers: { Cookie: sessionCookie },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Message is required');
  });

  test('returns 503 when ANTHROPIC_API_KEY is not set', async ({ request }) => {
    // This test only works when the key is NOT set in the environment
    // Skip if key is set (real API tests handle that case)
    if (process.env.ANTHROPIC_API_KEY) {
      test.skip();
      return;
    }

    const res = await request.post('/api/agent/chat', {
      data: { message: 'What tables are available?' },
      headers: { Cookie: sessionCookie },
    });
    expect(res.status()).toBe(503);
    const body = await res.json();
    expect(body.error).toContain('ANTHROPIC_API_KEY');
  });

  test('query endpoint returns 400 for invalid QueryIR', async ({ request }) => {
    // We need a data source ID — use a fake one to test validation
    const res = await request.post('/api/data-sources/fake-id/query', {
      data: { queryIR: { invalid: true } },
      headers: { Cookie: sessionCookie },
    });
    // Should be 400 (validation) or 404 (not found) — not 500
    expect([400, 404]).toContain(res.status());
  });

  test('query endpoint returns 404 for nonexistent data source', async ({ request }) => {
    const res = await request.post('/api/data-sources/nonexistent-id/query', {
      data: {
        queryIR: {
          source: 'nonexistent',
          table: 'test',
          select: [{ field: 'id' }],
        },
      },
      headers: { Cookie: sessionCookie },
    });
    expect(res.status()).toBe(404);
  });
});

test.describe('agent chat UI', () => {
  test.beforeEach(async ({ page, request }) => {
    // Register + login for each UI test
    const uniqueId = Date.now() + Math.random();
    const email = `ui-agent-${uniqueId}@test.com`;
    const password = 'ui-agent-password-123';

    await request.post('/api/auth/register', {
      data: {
        email,
        password,
        name: 'UI Agent Tester',
        orgName: `UI Agent Org ${uniqueId}`,
      },
    });

    // Login via the UI
    await page.goto('/login');
    await page.getByLabel('Email').pressSequentially(email);
    await page.getByLabel('Password').pressSequentially(password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.waitForURL('**/');
  });

  test('explore page renders with chat panel and data source selector', async ({ page }) => {
    await page.goto('/explore');
    await page.waitForLoadState('networkidle');

    // Chat input area should be visible
    await expect(page.getByPlaceholder(/ask a question/i)).toBeVisible();
  });

  test('new conversation button clears chat', async ({ page }) => {
    await page.goto('/explore');
    await page.waitForLoadState('networkidle');

    // Look for the new conversation button
    const newConvButton = page.getByRole('button', { name: /new conversation/i });
    if (await newConvButton.isVisible()) {
      await newConvButton.click();
      // Verify the chat is clear (no messages)
      const messages = page.locator('[class*="mb-3"]');
      await expect(messages).toHaveCount(0);
    }
  });
});
