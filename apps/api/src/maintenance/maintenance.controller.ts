import { Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../auth/decorators/roles.decorator';
import { MaintenanceService } from './maintenance.service';

@ApiTags('admin/maintenance')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/maintenance')
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Post('purge')
  @ApiOperation({
    summary: 'Run the expired-soft-delete purge now (also runs hourly on a schedule)',
  })
  purge(): Promise<{ accounts: number; memberships: number }> {
    return this.maintenance.purgeExpiredSoftDeletes();
  }
}
