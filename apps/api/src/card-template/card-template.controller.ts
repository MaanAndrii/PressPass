import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { BrandingInfo, CardTemplate } from '@presspass/shared';

import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SettingsService } from '../settings/settings.service';
import { CardTemplateService } from './card-template.service';

/** Parses an optional editorialId query value into a positive number or null. */
function parseEditorialId(value?: string): number | null {
  if (value === undefined || value === '') {
    return null;
  }
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

@ApiTags('card-template')
@Controller()
export class CardTemplateController {
  constructor(
    private readonly service: CardTemplateService,
    private readonly settings: SettingsService,
  ) {}

  @Public()
  @Get('card-template')
  @ApiOperation({ summary: 'Active card design for an editorial (branding only, public)' })
  @ApiQuery({ name: 'editorialId', required: false })
  get(@Query('editorialId') editorialId?: string): Promise<CardTemplate> {
    return this.service.get(parseEditorialId(editorialId));
  }

  @Public()
  @Get('branding')
  @ApiOperation({ summary: 'Public branding assets needed to render a card (NSZHU logo)' })
  async branding(): Promise<BrandingInfo> {
    return { nszhuLogoPath: await this.settings.nszhuLogoPath() };
  }

  @Put('admin/card-template')
  @Roles('ADMIN', 'EDITORIAL_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a card design (own editorial, or system default for ADMIN)' })
  @ApiQuery({ name: 'editorialId', required: false })
  update(
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
    @Query('editorialId') editorialId?: string,
    @Headers('x-unlock-token') unlock?: string,
  ): Promise<CardTemplate> {
    return this.service.update(
      body,
      this.resolveTarget(user, parseEditorialId(editorialId)),
      user.sub,
      unlock,
    );
  }

  @Post('admin/card-template/reset')
  @Roles('ADMIN', 'EDITORIAL_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reset a card design (own editorial, or system default for ADMIN)' })
  @ApiQuery({ name: 'editorialId', required: false })
  reset(
    @CurrentUser() user: JwtPayload,
    @Query('editorialId') editorialId?: string,
    @Headers('x-unlock-token') unlock?: string,
  ): Promise<CardTemplate> {
    return this.service.reset(
      this.resolveTarget(user, parseEditorialId(editorialId)),
      user.sub,
      unlock,
    );
  }

  /**
   * Decides which template an actor may edit: a system admin edits any editorial
   * (or the system default when none given); an editorial admin is forced onto
   * their own editorial and may never touch the system default or another's.
   */
  private resolveTarget(user: JwtPayload, requested: number | null): number | null {
    if (user.role === 'EDITORIAL_ADMIN') {
      if (!user.editorialId) {
        throw new ForbiddenException('Редакційний адміністратор не привʼязаний до редакції');
      }
      if (requested !== null && requested !== user.editorialId) {
        throw new ForbiddenException('Можна редагувати дизайн лише власної редакції');
      }
      return user.editorialId;
    }
    return requested;
  }
}
