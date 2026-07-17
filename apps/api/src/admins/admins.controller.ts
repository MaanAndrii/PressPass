import { Body, Controller, Delete, Get, Headers, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AdminAccount } from '@presspass/shared';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { JwtPayload } from '../auth/auth.types';
import { AdminsService } from './admins.service';
import { CreateAdminDto } from './dto/create-admin.dto';

@ApiTags('admin/admins')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/admins')
export class AdminsController {
  constructor(private readonly admins: AdminsService) {}

  @Get()
  @ApiOperation({ summary: 'List administrator accounts (system + editorial)' })
  findAll(): Promise<AdminAccount[]> {
    return this.admins.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Create an editorial-bound administrator' })
  create(
    @Body() dto: CreateAdminDto,
    @CurrentUser() user: JwtPayload,
    @Headers('x-unlock-token') unlock?: string,
  ): Promise<AdminAccount> {
    return this.admins.create(dto, user, unlock);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an editorial-bound administrator' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ success: boolean }> {
    return this.admins.remove(id, user.sub);
  }
}
