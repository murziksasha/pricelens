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
      searches, user_site_selection, site_health, health_runs, site_config_versions, site_group_members,
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

  it('locks down tokens, CORS, the LAN check and login limits', async () => {
    resetLoginLimits();
    const server = app.getHttpServer();
    const admin = await request(server).post('/api/auth/login').send({ login: 'admin', password: 'test-password-123' });
    expect(admin.headers['set-cookie']?.[0]).toMatch(/SameSite=Strict/i);
    const viaQuery = await request(server).get(`/api/auth/me?access_token=${admin.body.token}`);
    expect(viaQuery.status).toBe(401);

    const evil = await request(server).get('/api/health').set('origin', 'http://evil.example');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
    const desktop = await request(server).get('/health').set('origin', 'http://tauri.localhost');
    expect(desktop.headers['access-control-allow-origin']).toBe('http://tauri.localhost');

    process.env.LAN_ONLY = 'true';
    try {
      const spoofedPublic = await request(server).get('/health').set('x-forwarded-for', '8.8.8.8');
      expect(spoofedPublic.status).toBe(403);
      const lan = await request(server).get('/health').set('x-forwarded-for', '192.168.1.20');
      expect(lan.status).toBe(200);
    } finally {
      process.env.LAN_ONLY = 'false';
    }

    for (let i = 0; i < 3; i += 1) {
      await request(server).post('/api/auth/login').set('x-forwarded-for', '192.168.1.30').send({ login: 'admin', password: 'nope-nope' });
    }
    const blocked = await request(server)
      .post('/api/auth/login')
      .set('x-forwarded-for', '192.168.1.30')
      .send({ login: 'admin', password: 'test-password-123' });
    expect(blocked.status).toBe(429);
    const otherMachine = await request(server)
      .post('/api/auth/login')
      .set('x-forwarded-for', '192.168.1.31')
      .send({ login: 'admin', password: 'test-password-123' });
    expect(otherMachine.status).toBe(201);
    resetLoginLimits();
  });

  it('rejects invalid bodies and rolls back complete site configs', async () => {
    resetLoginLimits();
    const server = app.getHttpServer();
    const admin = await request(server).post('/api/auth/login').send({ login: 'admin', password: 'test-password-123' });
    const auth = { authorization: `Bearer ${admin.body.token}` };
    const olx = await prisma.site.findFirstOrThrow({ where: { key: 'olx' } });

    expect((await request(server).post('/api/site-groups').set(auth).send({ siteIds: ['nope'] })).status).toBe(400);
    expect((await request(server).post('/api/site-groups').set(auth).send({ name: 'Main', siteIds: [olx.id] })).status).toBe(201);
    expect((await request(server).post(`/api/sites/${olx.id}/rollback`).set(auth).send({ version: 'x' })).status).toBe(400);

    const missingGroup = '00000000-0000-4000-8000-000000000000';
    expect((await request(server).patch(`/api/groups/${missingGroup}`).set(auth).send({ minMargin: -5 })).status).toBe(400);
    expect((await request(server).patch(`/api/groups/${missingGroup}`).set(auth).send({ evil: true })).status).toBe(400);
    expect((await request(server).patch(`/api/groups/${missingGroup}`).set(auth).send({ minMargin: 500 })).status).toBe(404);

    const before = await prisma.site.findUniqueOrThrow({ where: { id: olx.id } });
    const partial = await request(server).patch(`/api/sites/${olx.id}`).set(auth).send({ priority: 7 });
    expect(partial.status).toBe(200);
    expect(partial.body.name).toBe(before.name);
    const version = await prisma.siteConfigVersion.findFirstOrThrow({ where: { siteId: olx.id, version: partial.body.currentVersion } });
    expect((version.config as { domain?: string }).domain).toBe(before.domain);
    await request(server).patch(`/api/sites/${olx.id}`).set(auth).send({ priority: 9, minDelayMs: 5000 });
    const rolled = await request(server).post(`/api/sites/${olx.id}/rollback`).set(auth).send({ version: partial.body.currentVersion });
    expect(rolled.status).toBe(201);
    expect(rolled.body.priority).toBe(7);
    expect(rolled.body.minDelayMs).toBe(before.minDelayMs);
  });

  it('refuses internal URLs in the constructor (SSRF)', async () => {
    resetLoginLimits();
    const server = app.getHttpServer();
    const admin = await request(server).post('/api/auth/login').send({ login: 'admin', password: 'test-password-123' });
    const auth = { authorization: `Bearer ${admin.body.token}` };
    for (const url of ['http://postgres:5432/', 'http://127.0.0.1:3000/api/users', 'file:///etc/passwd', 'http://169.254.169.254/']) {
      const shot = await request(server).post('/api/admin/constructor/screenshot').set(auth).send({ url });
      expect(shot.status, url).toBe(400);
      const preview = await request(server).post('/api/admin/constructor/preview').set(auth).send({ url });
      expect(preview.body.error, url).toBe('blocked_url');
    }
  });

  it('shares searches with the team but not with anonymous or inactive users', async () => {
    resetLoginLimits();
    const server = app.getHttpServer();
    const admin = await request(server).post('/api/auth/login').send({ login: 'admin', password: 'test-password-123' });
    const auth = { authorization: `Bearer ${admin.body.token}` };
    await request(server).post('/api/users').set(auth).send({ login: 'teammate', password: 'teammate-pass-1', role: 'user' });
    const teammate = await request(server).post('/api/auth/login').send({ login: 'teammate', password: 'teammate-pass-1' });
    const mate = { authorization: `Bearer ${teammate.body.token}` };
    const olx = await prisma.site.findFirstOrThrow({ where: { key: 'olx' } });
    const created = await request(server).post('/api/searches').set(auth).send({ query: 'team', siteIds: [olx.id], filters: {} });

    expect((await request(server).get(`/api/searches/${created.body.id}`).set(mate)).status).toBe(200);
    expect((await request(server).get(`/api/searches/${created.body.id}/export.csv`).set(mate)).status).toBe(200);
    expect((await request(server).get(`/api/searches/${created.body.id}`)).status).toBe(401);
    const own = await request(server).get('/api/searches').set(mate);
    expect(own.body.some((row: { id: string }) => row.id === created.body.id)).toBe(false);
    const team = await request(server).get('/api/searches?scope=team').set(mate);
    const shared = team.body.find((row: { id: string }) => row.id === created.body.id);
    expect(shared.user).toEqual({ login: 'admin' });

    const user = await prisma.user.findUniqueOrThrow({ where: { login: 'teammate' } });
    await request(server).patch(`/api/users/${user.id}`).set(auth).send({ isActive: false });
    expect((await request(server).get(`/api/searches/${created.body.id}`).set(mate)).status).toBe(403);
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

  it('enqueues a health run and returns current run status', async () => {
    const admin = await request(app.getHttpServer()).post('/api/auth/login').send({ login: 'admin', password: 'test-password-123' });
    const runRes = await request(app.getHttpServer())
      .post('/api/admin/health/run')
      .set('authorization', `Bearer ${admin.body.token}`);
    expect(runRes.status).toBe(201);
    expect(['queued', 'running']).toContain(runRes.body.status);
    expect(typeof runRes.body.done).toBe('number');
    expect(typeof runRes.body.id).toBe('string');
    expect(runRes.body.total).toBeGreaterThan(0);

    // Repeated call returns the in-progress run
    const secondRes = await request(app.getHttpServer())
      .post('/api/admin/health/run')
      .set('authorization', `Bearer ${admin.body.token}`);
    expect(secondRes.status).toBe(201);
    expect(secondRes.body.id).toBe(runRes.body.id);

    // GET /api/admin/health returns sites and latest run
    const getRes = await request(app.getHttpServer())
      .get('/api/admin/health')
      .set('authorization', `Bearer ${admin.body.token}`);
    expect(getRes.status).toBe(200);
    expect(Array.isArray(getRes.body.sites)).toBe(true);
    expect(['queued', 'running']).toContain(getRes.body.run?.status);
  });

  it('covers role change, password login, delete self rejected, last admin rejected, other user deleted, and purchase row preserved', async () => {
    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ login: 'admin', password: 'test-password-123' });
    const adminToken = adminLogin.body.token;

    // Create a new user
    const createRes = await request(app.getHttpServer())
      .post('/api/users')
      .set('authorization', `Bearer ${adminToken}`)
      .send({ login: 'member', password: 'initial-password-123', role: 'user' });
    expect(createRes.status).toBe(201);
    const memberId = createRes.body.id;

    // Role change to admin
    const roleRes = await request(app.getHttpServer())
      .patch(`/api/users/${memberId}`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ role: 'admin' });
    expect(roleRes.status).toBe(200);
    expect(roleRes.body.role).toBe('admin');

    // Change member password and verify password login
    const passRes = await request(app.getHttpServer())
      .patch(`/api/users/${memberId}`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ password: 'new-secure-password-456' });
    expect(passRes.status).toBe(200);

    const memberLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ login: 'member', password: 'new-secure-password-456' });
    expect(memberLogin.status).toBe(201);
    const memberToken = memberLogin.body.token;

    // Demote member back to user
    await request(app.getHttpServer())
      .patch(`/api/users/${memberId}`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ role: 'user' });

    // Delete self rejected
    const meRes = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('authorization', `Bearer ${adminToken}`);
    const adminId = meRes.body.id;

    const delSelfRes = await request(app.getHttpServer())
      .delete(`/api/users/${adminId}`)
      .set('authorization', `Bearer ${adminToken}`);
    expect(delSelfRes.status).toBe(400);
    expect(delSelfRes.body.error).toBe('cannot_delete_self');

    // Last admin rejected (demote by role)
    const demoteLastAdminRes = await request(app.getHttpServer())
      .patch(`/api/users/${adminId}`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ role: 'user' });
    expect(demoteLastAdminRes.status).toBe(400);
    expect(demoteLastAdminRes.body.error).toBe('last_admin');

    // Last admin rejected (deactivate)
    const deactLastAdminRes = await request(app.getHttpServer())
      .patch(`/api/users/${adminId}`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });
    expect(deactLastAdminRes.status).toBe(400);
    expect(deactLastAdminRes.body.error).toBe('last_admin');

    // Create admin2, and admin deletes admin2 cleanly
    const admin2Res = await request(app.getHttpServer())
      .post('/api/users')
      .set('authorization', `Bearer ${adminToken}`)
      .send({ login: 'admin2', password: 'password-12345', role: 'admin' });
    const admin2Id = admin2Res.body.id;

    const delAdmin2Res = await request(app.getHttpServer())
      .delete(`/api/users/${admin2Id}`)
      .set('authorization', `Bearer ${adminToken}`);
    expect(delAdmin2Res.status).toBe(200);

    // Now test member data preservation and deletion
    const listing = await prisma.listing.findFirstOrThrow();

    // 1. Member creates purchase
    const purchaseRes = await request(app.getHttpServer())
      .post('/api/purchases')
      .set('authorization', `Bearer ${memberToken}`)
      .send({
        listingId: listing.id,
        price: 1500,
        currency: 'UAH',
        qty: 1,
        purchasedAt: new Date().toISOString(),
      });
    expect(purchaseRes.status).toBe(201);

    // 2. Member creates shared template and personal template
    const olx = await prisma.site.findUniqueOrThrow({ where: { key: 'olx' } });
    const sharedTpl = await prisma.searchTemplate.create({
      data: {
        ownerId: memberId,
        name: 'Shared Tpl',
        query: 'laptop',
        siteIds: [olx.id],
        filters: {},
        shared: true,
      },
    });
    const personalTpl = await prisma.searchTemplate.create({
      data: {
        ownerId: memberId,
        name: 'Personal Tpl',
        query: 'laptop',
        siteIds: [olx.id],
        filters: {},
        shared: false,
      },
    });

    // 3. Member creates shared note and private note
    await request(app.getHttpServer())
      .post(`/api/listings/${listing.id}/visit`)
      .set('authorization', `Bearer ${memberToken}`);
    await request(app.getHttpServer())
      .post(`/api/listings/${listing.id}/notes`)
      .set('authorization', `Bearer ${memberToken}`)
      .send({ body: 'shared note from member', shared: true });
    await request(app.getHttpServer())
      .post(`/api/listings/${listing.id}/notes`)
      .set('authorization', `Bearer ${memberToken}`)
      .send({ body: 'private note from member', shared: false });

    // 4. Admin deletes member
    const delMemberRes = await request(app.getHttpServer())
      .delete(`/api/users/${memberId}`)
      .set('authorization', `Bearer ${adminToken}`);
    expect(delMemberRes.status).toBe(200);

    // Verify member is gone
    const memberInDb = await prisma.user.findUnique({ where: { id: memberId } });
    expect(memberInDb).toBeNull();

    // Verify audit log has user.delete with login: member
    const auditRecord = await prisma.auditLog.findFirst({
      where: { action: 'user.delete', entityId: memberId },
    });
    expect(auditRecord).toBeDefined();
    expect(auditRecord?.payload).toMatchObject({ login: 'member' });

    // Verify shared template reassigned to acting admin
    const reassignedTpl = await prisma.searchTemplate.findUnique({ where: { id: sharedTpl.id } });
    expect(reassignedTpl?.ownerId).toBe(adminId);

    // Verify personal template deleted
    const personalInDb = await prisma.searchTemplate.findUnique({ where: { id: personalTpl.id } });
    expect(personalInDb).toBeNull();

    // Verify private note deleted
    const privateNotes = await prisma.listingNote.findMany({ where: { body: 'private note from member' } });
    expect(privateNotes.length).toBe(0);

    // Verify shared note remains with userId = null
    const sharedNotes = await prisma.listingNote.findMany({ where: { body: 'shared note from member' } });
    expect(sharedNotes.length).toBe(1);
    expect(sharedNotes[0].userId).toBeNull();

    // Verify purchase row is still listed with deleted-account buyer (buyer is null)
    const purchasesRes = await request(app.getHttpServer())
      .get('/api/purchases')
      .set('authorization', `Bearer ${adminToken}`);
    expect(purchasesRes.status).toBe(200);
    const preservedPurchase = purchasesRes.body.items.find(
      (item: any) => item.id === purchaseRes.body.id,
    );
    expect(preservedPurchase).toBeDefined();
    expect(preservedPurchase.buyer).toBeNull();
  });
});
