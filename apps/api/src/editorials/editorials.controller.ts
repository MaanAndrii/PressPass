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
import type { Editorial } from '@presspass/shared';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { JwtPayload } from '../auth/auth.types';
import { logoMulterOptions } from '../common/branding-upload';
import { assertImageBytes } from '../common/secure-image';
import { CreateEditorialDto } from './dto/create-editorial.dto';
import { UpdateEditorialDto } from './dto/update-editorial.dto';
import { EditorialsService } from './editorials.service';

@ApiTags('admin/editorials')
@ApiBearerAuth()
@Roles('ADMIN', 'EDITORIAL_ADMIN')
@Controller('admin/editorials')
export class EditorialsController {
  constructor(private readonly editorials: EditorialsService) {}

  @Get()
  @ApiOperation({ summary: 'List issuing companies (editorial admins: their own only)' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Headers('x-unlock-token') unlock?: string,
  ): Promise<Editorial[]> {
    return this.editorials.findAll(user, unlock);
  }

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create an issuing company (system admin only)' })
  create(
    @Body() dto: CreateEditorialDto,
    @CurrentUser() user: JwtPayload,
    @Headers('x-unlock-token') unlock?: string,
  ): Promise<Editorial> {
    return this.editorials.create(dto, user, unlock);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an issuing company (editorial admins: their own only)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEditorialDto,
    @CurrentUser() user: JwtPayload,
    @Headers('x-unlock-token') unlock?: string,
  ): Promise<Editorial> {
    return this.editorials.update(id, dto, user, unlock);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete an issuing company (system admin only)' })
  remove(@Param('id', ParseIntPipe) id: number): Promise<{ success: boolean }> {
    return this.editorials.remove(id);
  }

  @Post(':id/logo')
  @ApiOperation({ summary: 'Upload the company logo (PNG/WebP/JPEG, ≤2 MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { logo: { type: 'string', format: 'binary' } },
      required: ['logo'],
    },
  })
  @UseInterceptors(FileInterceptor('logo', logoMulterOptions))
  uploadLogo(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file?: Express.Multer.File,
    @Headers('x-unlock-token') unlock?: string,
  ): Promise<Editorial> {
    if (!file) {
      throw new BadRequestException('Logo file is required (multipart field "logo")');
    }
    assertImageBytes(file.buffer, file.mimetype);
    return this.editorials.setLogo(id, file.buffer, file.mimetype, user, unlock);
  }
}
