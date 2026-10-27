import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const en = JSON.parse(readFileSync(new URL('../../../packages/shared/src/i18n/en.json', import.meta.url), 'utf8'));
const ru = JSON.parse(readFileSync(new URL('../../../packages/shared/src/i18n/ru.json', import.meta.url), 'utf8'));
const uk = JSON.parse(readFileSync(new URL('../../../packages/shared/src/i18n/uk.json', import.meta.url), 'utf8'));

test.describe('PriceLens UI flow', () => {
  test('click through full user and admin lifecycle', async ({ page }) => {
    // 1. Bad password stays on login card and shows auth error
    await page.goto('/login');
    await page.fill('[data-testid="login"]', 'admin');
    await page.fill('[data-testid="password"]', 'wrong-password-here');
    await page.click('button[type="submit"]');
    await expect(page.locator('.error')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    // 2. Find server button
    await page.click('[data-testid="find-server"]');
    await expect(page.locator('[data-testid="server"]')).toHaveValue('http://127.0.0.1:3000');

    // 3. Test connection against http://127.0.0.1:3000/health
    await page.fill('[data-testid="server"]', 'http://127.0.0.1:3000');
    await page.click('[data-testid="test-server"]');
    await expect(page.getByText(en['login.ok'])).toBeVisible();

    // 4. Login with seeded admin (admin / changeme)
    await page.fill('[data-testid="login"]', 'admin');
    await page.fill('[data-testid="password"]', 'changeme');
    await page.click('button[type="submit"]');

    // Lands on search, see query field and at least one site checkbox
    await expect(page).toHaveURL('http://127.0.0.1:4173/');
    await expect(page.locator('[data-testid="search"]')).toBeVisible();
    await expect(page.locator('input[type="checkbox"]').first()).toBeVisible();

    // 5. Open History, Templates, Purchases. Each route renders its heading.
    await page.click('nav a[href="/history"]');
    await expect(page).toHaveURL(/\/history/);
    await expect(page.locator('h1')).toHaveText(en['search.history']);

    await page.click('nav a[href="/templates"]');
    await expect(page).toHaveURL(/\/templates/);
    await expect(page.locator('h1')).toHaveText(en['templates.title']);

    await page.click('nav a[href="/purchases"]');
    await expect(page).toHaveURL(/\/purchases/);
    await expect(page.locator('h1')).toHaveText(en['purchase.page']);

    // 6. Switch language en -> ru -> uk and theme light -> dark
    await page.selectOption('[data-testid="lang-switch"]', 'ru');
    await expect(page.locator('h1')).toHaveText(ru['purchase.page']);

    await page.selectOption('[data-testid="lang-switch"]', 'uk');
    await expect(page.locator('h1')).toHaveText(uk['purchase.page']);

    await page.selectOption('[data-testid="lang-switch"]', 'en');
    await expect(page.locator('h1')).toHaveText(en['purchase.page']);

    await page.selectOption('[data-testid="theme-switch"]', 'light');
    await expect(page.locator('[data-testid="theme-switch"]')).toHaveValue('light');
    await page.selectOption('[data-testid="theme-switch"]', 'dark');
    await expect(page.locator('[data-testid="theme-switch"]')).toHaveValue('dark');

    // 7. Admin opens Users
    await page.click('[data-testid="admin-nav"]');
    await expect(page).toHaveURL(/\/admin\/users/);
    await expect(page.locator('h1')).toHaveText(en['users.title']);

    // Create a non-admin session
    const nonAdminUser = `clerk_${Date.now()}`;
    await page.fill('[data-testid="new-login"]', nonAdminUser);
    await page.fill('[data-testid="new-password"]', 'clerkpass123');
    await page.click(`button:has-text("${en['users.create']}")`);
    await expect(page.getByText(nonAdminUser)).toBeVisible();

    // 8. SMTP fields in admin settings: empty save, secret not echoed back
    const settingsReady = page.waitForResponse(
      (response) => response.url().includes('/api/admin/settings') && response.request().method() === 'GET' && response.ok(),
    );
    await page.click('a[href="/admin/settings"]');
    await settingsReady;
    await expect(page).toHaveURL(/\/admin\/settings/);
    await expect(page.locator('h1')).toHaveText(en['settings.title']);

    await page.fill('[data-testid="smtp-host"]', 'smtp.e2e.test');
    await page.fill('[data-testid="smtp-password"]', 'supersecretpass');
    await page.click('button[type="submit"]');
    await expect(page.getByText(en['settings.saved'])).toBeVisible();

    // Check secret not echoed back
    await expect(page.locator('[data-testid="smtp-password"]')).toHaveValue('***');

    // Empty save: keep secret as *** or empty, save again
    await page.click('button[type="submit"]');
    await expect(page.getByText(en['settings.saved'])).toBeVisible();
    await expect(page.locator('[data-testid="smtp-password"]')).toHaveValue('***');

    // 9. Log out and land on /login
    await page.click(`button:has-text("${en['nav.logout']}")`);
    await expect(page).toHaveURL(/\/login/);

    // 10. Log in as the non-admin user
    await page.fill('[data-testid="login"]', nonAdminUser);
    await page.fill('[data-testid="password"]', 'clerkpass123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('http://127.0.0.1:4173/');

    // Try to access /admin/users as non-admin -> sent away from /admin/users
    await page.goto('/admin/users');
    await expect(page).not.toHaveURL(/\/admin\/users/);
    await expect(page).toHaveURL('http://127.0.0.1:4173/');

    // 11. Log out again and land on /login
    await page.click(`button:has-text("${en['nav.logout']}")`);
    await expect(page).toHaveURL(/\/login/);
  });
});
