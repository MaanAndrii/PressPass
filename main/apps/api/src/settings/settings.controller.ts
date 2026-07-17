import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AppSettings } from '@presspass/shared';

import { Roles } from '../auth/decorators/roles.decorator';
import { logoMulterOptions } from '../common/branding-upload';
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
  get(): Promise<AppSettings> {
    return this.settings.getPublic();
  }

  @Put()
  @ApiOperation({ summary: 'Update runtime settings (Resend API key, sender)' })
  update(@Body() dto: UpdateSettingsDto): Promise<AppSettings> {
    return this.settings.update(dto);
  }

  @Post('nszhu-logo')
  @ApiOperation({ summary: 'Upload the NSZHU logo (SVG/PNG/WebP/JPEG, ≤2 MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { logo: { type: 'string', format: 'binary' } },
      required: ['logo'],
    },
  })
  @UseInterceptors(FileInterceptor('logo', logoMulterOptions))
  uploadNszhuLogo(@UploadedFile() file?: Express.Multer.File): Promise<AppSettings> {
    if (!file) {
      throw new BadRequestException('Logo file is required (multipart field "logo")');
    }
    return this.settings.setNszhuLogo(`/uploads/branding/${file.filename}`);
  }

  @Delete('nszhu-logo')
  @ApiOperation({ summary: 'Remove the uploaded NSZHU logo' })
  removeNszhuLogo(): Promise<AppSettings> {
    return this.settings.setNszhuLogo(null);
  }
}
