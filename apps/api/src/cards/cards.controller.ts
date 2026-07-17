import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CardQr, CardResponse } from '@presspass/shared';
import type { Request } from 'express';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { JwtPayload } from '../auth/auth.types';
import { requestBaseUrl } from '../common/request-url';
import { CardsService } from './cards.service';
import { BlockCardDto, RenewCardDto } from './dto/card-action.dto';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';

@ApiTags('admin/cards')
@ApiBearerAuth()
@Roles('ADMIN', 'EDITORIAL_ADMIN')
@Controller('admin/cards')
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  @Get()
  @ApiOperation({ summary: 'List cards (editorial admins: their own editorial only)' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Headers('x-unlock-token') unlock?: string,
  ): Promise<CardResponse[]> {
    return this.cardsService.findAll(
      user,
      requestBaseUrl(req, this.cardsService.verifyBaseUrl),
      unlock,
    );
  }

  @Get(':id/qr')
  @ApiOperation({ summary: 'Fresh dynamic verification URL for a card (short-lived token)' })
  getQr(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Headers('x-unlock-token') unlock?: string,
  ): Promise<CardQr> {
    return this.cardsService.getQr(
      id,
      user,
      requestBaseUrl(req, this.cardsService.verifyBaseUrl),
      unlock,
    );
  }

  @Post()
  @ApiOperation({ summary: 'Issue a new card (UUIDv7 is generated server-side)' })
  create(
    @Body() dto: CreateCardDto,
    @CurrentUser() user: JwtPayload,
    @Headers('x-unlock-token') unlock?: string,
  ): Promise<CardResponse> {
    return this.cardsService.create(dto, user, unlock);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update card fields' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCardDto,
    @CurrentUser() user: JwtPayload,
    @Headers('x-unlock-token') unlock?: string,
  ): Promise<CardResponse> {
    return this.cardsService.update(id, dto, user, unlock);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an issued card (editorial admins: their own only)' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ success: boolean }> {
    return this.cardsService.remove(id, user);
  }

  @Post('block')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Block (revoke) a card' })
  block(
    @Body() dto: BlockCardDto,
    @CurrentUser() user: JwtPayload,
    @Headers('x-unlock-token') unlock?: string,
  ): Promise<CardResponse> {
    return this.cardsService.block(dto, user, unlock);
  }

  @Post('renew')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renew a card: extend expiration and reactivate' })
  renew(
    @Body() dto: RenewCardDto,
    @CurrentUser() user: JwtPayload,
    @Headers('x-unlock-token') unlock?: string,
  ): Promise<CardResponse> {
    return this.cardsService.renew(dto, user, unlock);
  }
}
