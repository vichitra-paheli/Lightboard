import { expect, test } from '@playwright/test';

const UNIQUE = Date.now();
const TEST_ORG = `E2E Test Org ${UNIQUE}`;
const TEST_NAME = 'E2E Tester';
const TEST_EMAIL = `e2e-${UNIQUE}@test.com`;
const TEST_PASSWORD = 'e2e-password-123';

test.describe.configure({ mode: 'serial' });

test.describe('auth flows', () => {
  test.beforeAll(async ({ request }) => {
    // Clean up any stale test data by registering a throwaway to confirm DB is reachable
    const health = await request.get('/api/auth/me');
    expect([401, 200]).toContain(health.status());
  });

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });

  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login');
    // Sigil replaces the former "Log in" heading — it's the identity on both
    // auth pages now. The card drops in at 2200ms; auto-waiting on the
    // visibility of the Username input keeps the assertion honest.
    await expect(page.locator('svg[aria-label="Lightboard"]')).toBeVisible();
    await expect(
      page.getByText('The thinking surface for your data.'),
    ).toBeVisible();
    await expect(page.getByLabel('Username')).toBeVisible();
    // `getByLabel('Password')` in strict mode is ambiguous — both the password
    // input and the Show/Hide toggle carry the word "Password". Pin to the
    // `textbox` role so the assertion matches the input unambiguously.
    await expect(
      page.getByRole('textbox', { name: 'Password' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Create one' }),
    ).toBeVisible();
  });

  test('register page renders correctly', async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('svg[aria-label="Lightboard"]')).toBeVisible();
    await expect(page.getByLabel('Organization name')).toBeVisible();
    await expect(page.getByLabel('Full name')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(
      page.getByRole('textbox', { name: 'Password' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Create account' }),
    ).toBeVisible();
  });

  test('navigate between login and register', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Create one' }).click();
    await expect(page).toHaveURL(/\/register/);

    await page.getByRole('link', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('API returns 401 without session', async ({ request }) => {
    const response = await request.get('/api/auth/me');
    expect(response.status()).toBe(401);
  });

  test('register with short password returns 400', async ({ request }) => {
    const response = await request.post('/api/auth/register', {
      data: {
        orgName: 'Short Org',
        name: 'Short User',
        email: `short-${UNIQUE}@test.com`,
        password: 'short',
      },
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Password must be at least 8 characters');
  });

  test('register creates account and sets session', async ({ request }) => {
    const response = await request.post('/api/auth/register', {
      data: {
        orgName: TEST_ORG,
        name: TEST_NAME,
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      },
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.user.email).toBe(TEST_EMAIL);
    expect(body.user.role).toBe('admin');
  });

  test('authenticated user can access dashboard', async ({ page }) => {
    // Login via API to set cookie
    const loginRes = await page.request.post('/api/auth/login', {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    expect(loginRes.ok()).toBeTruthy();

    await page.goto('/');
    await expect(page).toHaveURL('/');
    await expect(page.getByText('Welcome to Lightboard')).toBeVisible();
  });

  test('register with duplicate email returns 409', async ({ request }) => {
    const response = await request.post('/api/auth/register', {
      data: {
        orgName: 'Dup Org',
        name: 'Dup User',
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      },
    });
    expect(response.status()).toBe(409);
    const body = await response.json();
    expect(body.error).toBe('Email already in use');
  });

  test('login with wrong password shows error', async ({ page }) => {
    await page.goto('/login');
    // Wait for the card to drop in before typing (animation lands at 2200ms).
    await expect(page.getByLabel('Username')).toBeVisible();
    await page.getByLabel('Username').pressSequentially(TEST_EMAIL);
    await page
      .getByRole('textbox', { name: 'Password' })
      .pressSequentially('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText('Invalid email or password')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('login with valid credentials redirects to dashboard', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel('Username')).toBeVisible();
    await page.getByLabel('Username').pressSequentially(TEST_EMAIL);
    await page
      .getByRole('textbox', { name: 'Password' })
      .pressSequentially(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/', { timeout: 15000 });
    await expect(page.getByText('Welcome to Lightboard')).toBeVisible();
  });

  test('logout redirects to login', async ({ page }) => {
    // Login via API
    const loginRes = await page.request.post('/api/auth/login', {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    expect(loginRes.ok()).toBeTruthy();

    await page.goto('/');
    await expect(page.getByText('Welcome to Lightboard')).toBeVisible();

    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });

  test('authenticated user navigates between dashboard pages', async ({ page }) => {
    // Login via API
    const loginRes = await page.request.post('/api/auth/login', {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    expect(loginRes.ok()).toBeTruthy();

    await page.goto('/');
    await expect(page.getByText('Welcome to Lightboard')).toBeVisible();

    await page.getByRole('link', { name: 'Explore' }).click();
    await expect(page).toHaveURL(/\/explore/);
    await expect(page.getByText('Ask a question about your data').first()).toBeVisible();

    await page.getByRole('link', { name: 'Data Sources' }).click();
    await expect(page).toHaveURL(/\/data-sources/);

    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/settings/);
  });
});
