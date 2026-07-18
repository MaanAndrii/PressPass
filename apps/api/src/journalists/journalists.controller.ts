import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AdminJournalist, AttachResult } from '@presspass/shared';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { photoMulterOptions } from '../common/photo-upload';
import { assertImageBytes } from '../common/secure-image';
import { AttachJournalistDto } from './dto/attach-journalist.dto';
import { CreateJournalistDto } from './dto/create-journalist.dto';
import { UpdateJournalistDto } from './dto/update-journalist.dto';
import { JournalistsService } from './journalists.service';

@ApiTags('admin/journalists')
@ApiBearerAuth()
@Roles('ADMIN', 'EDITORIAL_ADMIN')
@Controller('admin/journalists')
export class JournalistsController {
  constructor(private readonly journalistsService: JournalistsService) {}

  @Get()
  @ApiOperation({ summary: 'List journalists (editorial admin: only their members)' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Headers('x-unlock-token') unlock?: string,
  ): Promise<AdminJournalist[]> {
    return this.journalistsService.findAll(user, unlock);
  }

  @Post()
  @ApiOperation({ summary: 'Create a journalist together with a login account' })
  create(
    @Body() dto: CreateJournalistDto,
    @CurrentUser() user: JwtPayload,
    @Headers('x-unlock-token') unlock?: string,
  ): Promise<AdminJournalist> {
    return this.journalistsService.create(dto, user, unlock);
  }

  @Post('attach')
  @ApiOperation({ summary: 'Add an existing journalist to a media by their public id' })
  attach(
    @Body() dto: AttachJournalistDto,
    @CurrentUser() user: JwtPayload,
    @Headers('x-unlock-token') unlock?: string,
  ): Promise<AttachResult> {
    return this.journalistsService.attach(dto, user, unlock);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update journalist profile and/or credentials' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateJournalistDto,
    @CurrentUser() user: JwtPayload,
    @Headers('x-unlock-token') unlock?: string,
  ): Promise<AdminJournalist> {
    return this.journalistsService.update(id, dto, user, unlock);
  }

  @Delete(':id/membership')
  @ApiOperation({ summary: "Remove a journalist from the editorial admin's media" })
  detach(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
    @Headers('x-unlock-token') unlock?: string,
  ): Promise<AdminJournalist> {
    return this.journalistsService.detach(id, user, unlock);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete a journalist, their account and cards (system admin only)' })
  remove(@Param('id', ParseIntPipe) id: number): Promise<{ success: boolean }> {
    return this.journalistsService.remove(id);
  }

  @Post(':id/photo')
  @ApiOperation({ summary: 'Upload a journalist photo (JPEG/PNG/WebP, ≤5 MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { photo: { type: 'string', format: 'binary' } },
      required: ['photo'],
    },
  })
  @UseInterceptors(FileInterceptor('photo', photoMulterOptions))
  uploadPhoto(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file?: Express.Multer.File,
    @Headers('x-unlock-token') unlock?: string,
  ): Promise<AdminJournalist> {
    if (!file) {
      throw new BadRequestException('Photo file is required (multipart field "photo")');
    }
    assertImageBytes(file.buffer, file.mimetype);
    return this.journalistsService.setPhoto(id, file.buffer, file.mimetype, user, unlock);
  }
}
