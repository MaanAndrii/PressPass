import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Position } from '@presspass/shared';

import { Roles } from '../auth/decorators/roles.decorator';
import { CreatePositionDto } from './dto/create-position.dto';
import { PositionsService } from './positions.service';

@ApiTags('admin/positions')
@ApiBearerAuth()
@Controller('admin/positions')
export class PositionsController {
  constructor(private readonly positions: PositionsService) {}

  @Get()
  @Roles('ADMIN', 'EDITORIAL_ADMIN')
  @ApiOperation({ summary: 'List positions (for the issuance dropdown)' })
  findAll(): Promise<Position[]> {
    return this.positions.findAll();
  }

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create a position (system admin only)' })
  create(@Body() dto: CreatePositionDto): Promise<Position> {
    return this.positions.create(dto);
  }

  @Put(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update a position (system admin only)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: CreatePositionDto): Promise<Position> {
    return this.positions.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete a position (system admin only)' })
  remove(@Param('id', ParseIntPipe) id: number): Promise<{ success: boolean }> {
    return this.positions.remove(id);
  }
}
