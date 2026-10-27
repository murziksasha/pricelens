import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth';
import { PrismaService } from './prisma.service';
import {
  AdminController,
  AuthController,
  CatalogController,
  HealthController,
  ListingController,
  NotificationController,
  PurchaseController,
  SearchController,
  SettingsController,
  TelegramController,
  TemplateController,
  UsersController,
} from './routes';

@Module({
  controllers: [
    HealthController,
    AuthController,
    UsersController,
    CatalogController,
    SearchController,
    ListingController,
    PurchaseController,
    TemplateController,
    NotificationController,
    TelegramController,
    SettingsController,
    AdminController,
  ],
  providers: [PrismaService, AuthGuard, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
