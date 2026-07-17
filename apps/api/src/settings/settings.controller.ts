import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AppSettings } from '@presspass/shared';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { logoMulterOptions } from '../common/branding-upload';
import { assertImageBytes } from '../common/secure-image';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { SettingsService } from './settings.service';

@ApiTags('admin/settings')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Runtime settings (Resend key masked)' })
  get(
    @CurrentUser() user: JwtPayload,
    @Headers('x-unlock-token') unlock?: string,
  ): Promise<AppSettings> {
    return this.settings.getPublic(user.sub, unlock);
  }

  @Put()
  @ApiOperation({ summary: 'Update runtime settings (Resend API key, sender)' })
  update(
    @Body() dto: UpdateSettingsDto,
    @CurrentUser() user: JwtPayload,
    @Headers('x-unlock-token') unlock?: string,
  ): Promise<AppSettings> {
    return this.settings.update(dto, user.sub, unlock);
  }

  @Post('nszhu-logo')
  @ApiOperation({ summary: 'Upload the NSZHU logo (PNG/WebP/JPEG, ≤2 MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { logo: { type: 'string', format: 'binary' } },
      required: ['logo'],
    },
  })
  @UseInterceptors(FileInterceptor('logo', logoMulterOptions))
  uploadNszhuLogo(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file?: Express.Multer.File,
    @Headers('x-unlock-token') unlock?: string,
  ): Promise<AppSettings> {
    if (!file) {
      throw new BadRequestException('Logo file is required (multipart field "logo")');
    }
    assertImageBytes(file.buffer, file.mimetype);
    return this.settings.setNszhuLogo(file.buffer, file.mimetype, user.sub, unlock);
  }

  @Delete('nszhu-logo')
  @ApiOperation({ summary: 'Remove the uploaded NSZHU logo' })
  removeNszhuLogo(
    @CurrentUser() user: JwtPayload,
    @Headers('x-unlock-token') unlock?: string,
  ): Promise<AppSettings> {
    return this.settings.setNszhuLogo(null, null, user.sub, unlock);
  }
}
