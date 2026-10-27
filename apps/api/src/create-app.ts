import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './filter';
import { isPrivateIp } from './session';

export async function createApp() {
  const app = await NestFactory.create(AppModule, { bodyParser: false, logger: ['error', 'warn'] });
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('x-frame-options', 'SAMEORIGIN');
    res.setHeader('referrer-policy', 'no-referrer');
    if (process.env.LAN_ONLY === 'false') return next();
    const ip = String(req.socket.remoteAddress || '').replace('::ffff:', '');
    if (isPrivateIp(ip)) return next();
    res.status(403).json({ error: 'lan_only' });
    return undefined;
  });
  app.use('/api/admin/backups/upload', express.raw({ type: () => true, limit: '200mb' }));
  app.use(express.json({ limit: '8mb' }));
  app.use(cookieParser());
  app.enableCors({ origin: true, credentials: true });
  app.setGlobalPrefix('api', { exclude: [{ path: 'health', method: RequestMethod.GET }] });
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.init();
  return app;
}
