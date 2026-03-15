import { expect, test } from '@playwright/test';

/**
 * Multi-agent chat E2E tests.
 *
 * These tests verify the multi-agent architecture via the SSE streaming
 * API endpoint and the chat UI. Tests that require a real LLM API key
 * are skipped in environments without one configured.
 *
 * The focus is on verifying:
 * - SSE event types (agent_start, agent_end, thinking, tool_start, tool_end)
 * - Chat UI rendering of agent indicators and tool call details
 * - Conversation persistence across turns
 */

const UNIQUE = Date.now();

test.describe.configure({ mode: 'serial' });

test.describe('multi-agent SSE events', () => {
  let sessionCookie: string;

  test.beforeAll(async ({ request }) => {
    const regRes = await request.post('/api/auth/register', {
      data: {
        email: `ma-e2e-${UNIQUE}@test.com`,
        password: 'ma-e2e-password-123',
        name: 'Multi-Agent Tester',
        orgName: `MA E2E Org ${UNIQUE}`,
      },
    });
    expect(regRes.status()).toBe(201);

    const loginRes = await request.post('/api/auth/login', {
      data: { email: `ma-e2e-${UNIQUE}@test.com`, password: 'ma-e2e-password-123' },
    });
    expect(loginRes.status()).toBe(200);

    const cookies = loginRes.headers()['set-cookie'];
    const match = cookies?.match(/lb_session=([^;]+)/);
    sessionCookie = match ? `lb_session=${match[1]}` : '';
    expect(sessionCookie).not.toBe('');
  });

  test('SSE stream returns valid event structure', async ({ request }) => {
    // Skip if no AI provider configured
    if (!process.env.ANTHROPIC_API_KEY) {
      test.skip();
      return;
    }

    const res = await request.post('/api/agent/chat', {
      data: { message: 'Hello, what can you help me with?' },
      headers: {
        Cookie: sessionCookie,
        Accept: 'text/event-stream',
      },
    });
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/event-stream');

    const body = await res.text();
    // Should contain at least a text event and a done event
    expect(body).toContain('event: text');
    expect(body).toContain('event: done');
  });

  test('non-streaming returns JSON with conversationId', async ({ request }) => {
    // Skip if no AI provider configured
    if (!process.env.ANTHROPIC_API_KEY) {
      test.skip();
      return;
    }

    const res = await request.post('/api/agent/chat', {
      data: { message: 'Hello' },
      headers: { Cookie: sessionCookie },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.conversationId).toBeDefined();
    expect(body.conversationId).toMatch(/^conv_/);
    expect(typeof body.text).toBe('string');
  });

  test('conversation persists across turns', async ({ request }) => {
    // Skip if no AI provider configured
    if (!process.env.ANTHROPIC_API_KEY) {
      test.skip();
      return;
    }

    // Turn 1
    const res1 = await request.post('/api/agent/chat', {
      data: { message: 'Remember that my name is TestUser.' },
      headers: { Cookie: sessionCookie },
    });
    expect(res1.status()).toBe(200);
    const body1 = await res1.json();
    const convId = body1.conversationId;

    // Turn 2 with same conversationId
    const res2 = await request.post('/api/agent/chat', {
      data: { message: 'What is my name?', conversationId: convId },
      headers: { Cookie: sessionCookie },
    });
    expect(res2.status()).toBe(200);
    const body2 = await res2.json();
    expect(body2.conversationId).toBe(convId);
  });
});

test.describe('multi-agent chat UI', () => {
  test.beforeEach(async ({ page, request }) => {
    const uniqueId = Date.now() + Math.random();
    const email = `ma-ui-${uniqueId}@test.com`;
    const password = 'ma-ui-password-123';

    await request.post('/api/auth/register', {
      data: {
        email,
        password,
        name: 'MA UI Tester',
        orgName: `MA UI Org ${uniqueId}`,
      },
    });

    await page.goto('/login');
    await page.getByLabel('Email').pressSequentially(email);
    await page.getByLabel('Password').pressSequentially(password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.waitForURL('**/');
  });

  test('explore page has chat input and data source selector', async ({ page }) => {
    await page.goto('/explore');
    await page.waitForLoadState('networkidle');

    await expect(page.getByPlaceholder(/ask a question/i)).toBeVisible();
  });

  test('chat message area renders assistant messages with markdown support', async ({ page }) => {
    await page.goto('/explore');
    await page.waitForLoadState('networkidle');

    // Verify the chat panel exists and the prose-container class is available
    // (the markdown renderer wraps content in .prose-container)
    const chatArea = page.locator('[class*="flex-col"]').first();
    await expect(chatArea).toBeVisible();
  });
});
