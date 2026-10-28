import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './filter';
import { isPrivateIp } from './session';

const TAURI_ORIGINS = ['http://tauri.localhost', 'https://tauri.localhost', 'tauri://localhost'];
const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

/** Origins allowed to call the API cross-origin: WEB_ORIGIN (comma list), the desktop app, and Vite in dev. */
export function allowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const configured = (env.WEB_ORIGIN || '')
    .split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return [...configured, ...TAURI_ORIGINS, ...(env.NODE_ENV === 'production' ? [] : DEV_ORIGINS)];
}

export async function createApp() {
  const app = await NestFactory.create(AppModule, { bodyParser: false, logger: ['error', 'warn'] });
  // Trust X-Forwarded-For only from loopback/private-range proxies (the nginx container), so req.ip
  // is the real client for the LAN check and the login rate limit, and public clients cannot spoof it.
  app.getHttpAdapter().getInstance().set('trust proxy', ['loopback', 'uniquelocal']);
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('x-frame-options', 'SAMEORIGIN');
    res.setHeader('referrer-policy', 'no-referrer');
    if (process.env.LAN_ONLY === 'false') return next();
    const ip = String(req.ip || req.socket.remoteAddress || '').replace('::ffff:', '');
    if (isPrivateIp(ip)) return next();
    res.status(403).json({ error: 'lan_only' });
    return undefined;
  });
  app.use('/api/admin/backups/upload', express.raw({ type: () => true, limit: '200mb' }));
  app.use(express.json({ limit: '8mb' }));
  app.use(cookieParser());
  const origins = allowedOrigins();
  app.enableCors({ origin: (origin, done) => done(null, !origin || origins.includes(origin)), credentials: true });
  app.setGlobalPrefix('api', { exclude: [{ path: 'health', method: RequestMethod.GET }] });
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.init();
  return app;
}
