import { Controller, Get, Inject } from '@nestjs/common';
import { readSettings } from '@pricelens/pipeline';
import { Public } from '../auth';
import { PrismaService } from '../prisma.service';

@Controller('settings')
export class SettingsController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Public()
  @Get('public')
  async publicSettings() {
    const settings = await readSettings(this.prisma);
    return {
      deal_green_threshold: settings.deal_green_threshold,
      deal_yellow_threshold: settings.deal_yellow_threshold,
      min_margin_uah: settings.min_margin_uah,
      cost_delivery: settings.cost_delivery,
      cost_repair: settings.cost_repair,
      default_language: settings.default_language,
      default_currency: settings.default_currency,
    };
  }
}
