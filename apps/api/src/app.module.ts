import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth';
import { PrismaService } from './prisma.service';
import { AdminController } from './controllers/admin.controller';
import { AuthController } from './controllers/auth.controller';
import { CatalogController } from './controllers/catalog.controller';
import { HealthController } from './controllers/health.controller';
import { ListingController } from './controllers/listing.controller';
import { NotificationController } from './controllers/notification.controller';
import { PurchaseController } from './controllers/purchase.controller';
import { SearchController } from './controllers/search.controller';
import { SettingsController } from './controllers/settings.controller';
import { TelegramController } from './controllers/telegram.controller';
import { TemplateController } from './controllers/template.controller';
import { UsersController } from './controllers/users.controller';

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
