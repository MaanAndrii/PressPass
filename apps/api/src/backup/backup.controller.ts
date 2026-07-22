import { Body, Controller, Headers, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { BackupService } from './backup.service';
import { CreateBackupDto } from './dto/create-backup.dto';

@ApiTags('admin/backup')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/backup')
export class BackupController {
  constructor(private readonly backup: BackupService) {}

  @Post()
  @ApiOperation({
    summary: 'Download a full, age-encrypted disaster-recovery backup (Superadmin only)',
  })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateBackupDto,
    @Res() res: Response,
    @Headers('x-unlock-token') unlock?: string,
  ): Promise<void> {
    this.backup.assertUnlocked(user.sub, unlock);
    const { filename, stream } = await this.backup.createBackup(dto.passphrase);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    stream.on('error', () => {
      if (!res.headersSent) res.status(500);
      res.end();
    });
    stream.pipe(res);
  }
}
