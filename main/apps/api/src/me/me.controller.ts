import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CardQr, CardResponse, UserProfile } from '@presspass/shared';
import type { Request } from 'express';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/auth.types';
import { photoMulterOptions } from '../common/photo-upload';
import { requestBaseUrl } from '../common/request-url';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SetPrimaryCardDto } from './dto/set-primary-card.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { MeService } from './me.service';

@ApiTags('me')
@ApiBearerAuth()
@Controller()
export class MeController {
  constructor(private readonly meService: MeService) {}

  @Get('me')
  @ApiOperation({ summary: 'Profile of the authenticated user' })
  getMe(@CurrentUser() user: JwtPayload): Promise<UserProfile> {
    return this.meService.getProfile(user.sub);
  }

  @Put('profile')
  @ApiOperation({ summary: 'Fill in / update the questionnaire (all fields required)' })
  updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserProfile> {
    return this.meService.updateProfile(user.sub, dto);
  }

  @Post('profile/photo')
  @ApiOperation({ summary: 'Upload own photo (JPEG/PNG/WebP, ≤5 MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { photo: { type: 'string', format: 'binary' } },
      required: ['photo'],
    },
  })
  @UseInterceptors(FileInterceptor('photo', photoMulterOptions))
  uploadOwnPhoto(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<UserProfile> {
    if (!file) {
      throw new BadRequestException('Photo file is required (multipart field "photo")');
    }
    return this.meService.setOwnPhoto(user.sub, `/uploads/photos/${file.filename}`);
  }

  @Get('card')
  @ApiOperation({ summary: "Authenticated journalist's current (primary) card" })
  getCard(@CurrentUser() user: JwtPayload, @Req() req: Request): Promise<CardResponse> {
    return this.meService.getCard(user.sub, requestBaseUrl(req, this.meService.verifyBaseUrl));
  }

  @Put('me/password')
  @ApiOperation({ summary: 'Change your own password' })
  changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ success: boolean }> {
    return this.meService.changePassword(user.sub, dto.currentPassword, dto.newPassword);
  }

  @Get('cards')
  @ApiOperation({ summary: 'All cards the journalist holds (primary first)' })
  getCards(@CurrentUser() user: JwtPayload, @Req() req: Request): Promise<CardResponse[]> {
    return this.meService.getCards(user.sub, requestBaseUrl(req, this.meService.verifyBaseUrl));
  }

  @Put('card/primary')
  @ApiOperation({ summary: 'Choose which card is primary' })
  setPrimary(
    @CurrentUser() user: JwtPayload,
    @Body() body: SetPrimaryCardDto,
    @Req() req: Request,
  ): Promise<CardResponse[]> {
    return this.meService.setPrimaryCard(
      user.sub,
      body.cardId,
      requestBaseUrl(req, this.meService.verifyBaseUrl),
    );
  }

  @Get('card/qr')
  @ApiOperation({
    summary: 'Fresh dynamic QR payload (short-lived signed verify URL)',
    description: 'The client refreshes this every ~30 s; old QR codes stop verifying.',
  })
  getCardQr(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Query('cardId') cardId?: string,
  ): Promise<CardQr> {
    return this.meService.getCardQr(
      user.sub,
      requestBaseUrl(req, this.meService.verifyBaseUrl),
      cardId ? Number(cardId) : undefined,
    );
  }
}
