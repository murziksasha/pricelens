import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth';

@Controller()
export class HealthController {
  @Public()
  @Get('health')
  health() {
    return { ok: true };
  }
}
