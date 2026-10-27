import { execSync } from 'node:child_process';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/create-app';
import { setPageLoader } from '../src/loader';
import { resetLoginLimits } from '../src/auth';

const run = process.env.SKIP_INTEGRATION !== '1';
const url = process.env.DATABASE_URL || 'postgresql://pricelens:pricelens@127.0.0.1:5432/pricelens';

async function reset(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      browser_shots, heal_proposals, audit_log, telegram_codes, telegram_links,
      notifications, purchases, duplicates, listing_notes, listing_marks, visits,
      search_results, product_listings, products, listing_prices, listings,
      schedule_runs, template_schedules, search_templates, search_cache, search_site_runs,
      searches, user_site_selection, site_health, site_config_versions, site_group_members,
      site_groups, sessions, settings, sites, users
    RESTART IDENTITY CASCADE
  `);
}

describe.skipIf(!run)('API integration', () => {
  let app: INestApplication;
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const html = readFileSync(path.join(__dirname, '../../../packages/adapters/snapshots/olx.html'), 'utf8');

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.ADMIN_LOGIN = 'admin';
    process.env.ADMIN_PASSWORD = 'test-password-123';
    process.env.LAN_ONLY = 'false';
    process.env.INLINE_SEARCH = '1';
    process.env.LOGIN_MAX_FAILS = '3';
    execSync('pnpm exec prisma migrate deploy', {
      cwd: path.join(__dirname, '../../../packages/db'),
      env: process.env,
      stdio: 'inherit',
    });
    await reset(prisma);
    const { seed } = await import('@pricelens/db');
    await seed(prisma, process.env);
    setPageLoader(async (site) => {
      if (site.key === 'broken') throw new Error('boom');
      return html.replaceAll('https://www.olx.ua', `https://${site.key}.test`);
    });
    app = await createApp();
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it('covers the auth matrix and audit log', async () => {
    resetLoginLimits();
    const bad = await request(app.getHttpServer()).post('/api/auth/login').send({ login: 'admin', password: 'wrong-pass' });
    expect(bad.status).toBe(401);
    expect(bad.body.error).toBe('invalid_credentials');
    const admin = await request(app.getHttpServer()).post('/api/auth/login').send({ login: 'admin', password: 'test-password-123' });
    expect(admin.status).toBe(201);
    const token = admin.body.token as string;
    const created = await request(app.getHttpServer())
      .post('/api/users')
      .set('authorization', `Bearer ${token}`)
      .send({ login: 'clerk', password: 'clerk-pass-1', role: 'user' });
    expect(created.status).toBe(201);
    const clerk = await request(app.getHttpServer()).post('/api/auth/login').send({ login: 'clerk', password: 'clerk-pass-1' });
    const denied = await request(app.getHttpServer())
      .get('/api/users')
      .set('authorization', `Bearer ${clerk.body.token}`);
    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe('forbidden');
    const audit = await request(app.getHttpServer()).get('/api/admin/audit').set('authorization', `Bearer ${token}`);
    expect(audit.body.some((row: { action: string }) => row.action === 'user.create')).toBe(true);

    const patchMe = await request(app.getHttpServer())
      .patch('/api/auth/me')
      .set('authorization', `Bearer ${token}`)
      .send({ email: 'admin@pricelens.lan', emailOptIn: true });
    expect(patchMe.status).toBe(200);
    expect(patchMe.body.email).toBe('admin@pricelens.lan');
    expect(patchMe.body.emailOptIn).toBe(true);

    const getMe = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('authorization', `Bearer ${token}`);
    expect(getMe.body.email).toBe('admin@pricelens.lan');
    expect(getMe.body.emailOptIn).toBe(true);

    await request(app.getHttpServer())
      .put('/api/admin/settings')
      .set('authorization', `Bearer ${token}`)
      .send({ smtp_password: 'super-secret-smtp', smtp_host: 'mail.test' });
    const settingsRes = await request(app.getHttpServer())
      .get('/api/admin/settings')
      .set('authorization', `Bearer ${token}`);
    expect(settingsRes.body.smtp_password).toBe('***');
    expect(settingsRes.body.smtp_host).toBe('mail.test');

    await request(app.getHttpServer())
      .patch(`/api/users/${created.body.id}`)
      .set('authorization', `Bearer ${token}`)
      .send({ isActive: false });
    const inactive = await request(app.getHttpServer()).post('/api/auth/login').send({ login: 'clerk', password: 'clerk-pass-1' });
    expect(inactive.body.error).toBe('inactive_user');
  });

  it('versions a site and returns partial search results', async () => {
    const admin = await request(app.getHttpServer()).post('/api/auth/login').send({ login: 'admin', password: 'test-password-123' });
    const token = admin.body.token as string;
    const made = await request(app.getHttpServer())
      .post('/api/sites')
      .set('authorization', `Bearer ${token}`)
      .send({ key: 'broken', name: 'Broken', domain: 'broken.test', mode: 'native', urlTemplate: 'https://broken.test/?q={query}' });
    expect(made.status).toBe(201);
    const patched = await request(app.getHttpServer())
      .patch(`/api/sites/${made.body.id}`)
      .set('authorization', `Bearer ${token}`)
      .send({ name: 'Broken 2', domain: 'broken.test', mode: 'native', urlTemplate: 'https://broken.test/?q={query}' });
    expect(patched.body.currentVersion).toBe(2);
    const rolled = await request(app.getHttpServer())
      .post(`/api/sites/${made.body.id}/rollback`)
      .set('authorization', `Bearer ${token}`)
      .send({ version: 1 });
    expect(rolled.body.name).toBe('Broken');
    const sites = await prisma.site.findMany({ where: { enabled: true, NOT: { key: 'broken' } } });
    const search = await request(app.getHttpServer())
      .post('/api/searches')
      .set('authorization', `Bearer ${token}`)
      .send({ query: 'laptop', siteIds: [...sites.map((site) => site.id), made.body.id], filters: { priceMin: 10000, priceMax: 15000 } });
    expect(search.status).toBe(201);
    const view = await request(app.getHttpServer()).get(`/api/searches/${search.body.id}`).set('authorization', `Bearer ${token}`);
    expect(view.body.done).toBe(true);
    expect(view.body.runs.some((run: { error: string | null }) => run.error === 'boom')).toBe(true);
    expect(view.body.rows.length).toBeGreaterThan(0);
    expect(view.body.rows.every((row: { price: number }) => row.price >= 10000 && row.price <= 15000)).toBe(true);
    const again = await request(app.getHttpServer())
      .post('/api/searches')
      .set('authorization', `Bearer ${token}`)
      .send({ query: 'laptop', siteIds: [sites.find((site) => site.key === 'olx')!.id], filters: { priceMin: 10000, priceMax: 15000 } });
    const second = await request(app.getHttpServer()).get(`/api/searches/${again.body.id}`).set('authorization', `Bearer ${token}`);
    expect(second.body.runs[0].fromCache).toBe(true);
  });

  it('hides a private note from the other user and keeps a manual merge', async () => {
    const admin = await request(app.getHttpServer()).post('/api/auth/login').send({ login: 'admin', password: 'test-password-123' });
    await request(app.getHttpServer())
      .post('/api/users')
      .set('authorization', `Bearer ${admin.body.token}`)
      .send({ login: 'viewer', password: 'viewer-pass-1', role: 'user' });
    const viewer = await request(app.getHttpServer()).post('/api/auth/login').send({ login: 'viewer', password: 'viewer-pass-1' });
    const olx = await prisma.site.findFirstOrThrow({ where: { key: 'olx' } });
    const searched = await request(app.getHttpServer())
      .post('/api/searches')
      .set('authorization', `Bearer ${admin.body.token}`)
      .send({ query: 'privacy', siteIds: [olx.id], filters: {} });
    const found = await request(app.getHttpServer())
      .get(`/api/searches/${searched.body.id}`)
      .set('authorization', `Bearer ${admin.body.token}`);
    const listing = { id: found.body.rows[0].listingId as string };
    await request(app.getHttpServer())
      .post(`/api/listings/${listing.id}/visit`)
      .set('authorization', `Bearer ${admin.body.token}`);
    await request(app.getHttpServer())
      .post(`/api/listings/${listing.id}/notes`)
      .set('authorization', `Bearer ${admin.body.token}`)
      .send({ body: 'secret note', shared: false });
    const notes = await request(app.getHttpServer())
      .get(`/api/listings/${listing.id}/notes`)
      .set('authorization', `Bearer ${viewer.body.token}`);
    expect(notes.body).toEqual([]);
    const link = await prisma.searchResult.findFirstOrThrow({ where: { listingId: listing.id } });
    const rows = await request(app.getHttpServer()).get(`/api/searches/${link.searchId}`).set('authorization', `Bearer ${viewer.body.token}`);
    expect(rows.body.rows.some((row: { visited: { login: string } | null }) => row.visited?.login === 'admin')).toBe(true);
  });
});
