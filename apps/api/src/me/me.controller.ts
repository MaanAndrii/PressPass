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
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CardQr, CardResponse, JoinRequestInfo, UserProfile } from '@presspass/shared';
import type { Request } from 'express';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/auth.types';
import { photoMulterOptions } from '../common/photo-upload';
import { requestBaseUrl } from '../common/request-url';
import { assertImageBytes } from '../common/secure-image';
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
  getMe(
    @CurrentUser() user: JwtPayload,
    @Headers('x-unlock-token') unlock?: string,
  ): Promise<UserProfile> {
    return this.meService.getProfile(user.sub, unlock);
  }

  @Put('profile')
  @ApiOperation({ summary: 'Fill in / update the questionnaire (all fields required)' })
  updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateProfileDto,
    @Headers('x-unlock-token') unlock?: string,
  ): Promise<UserProfile> {
    return this.meService.updateProfile(user.sub, dto, unlock);
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
    @Headers('x-unlock-token') unlock?: string,
  ): Promise<UserProfile> {
    if (!file) {
      throw new BadRequestException('Photo file is required (multipart field "photo")');
    }
    assertImageBytes(file.buffer, file.mimetype);
    return this.meService.setOwnPhoto(user.sub, file.buffer, file.mimetype, unlock);
  }

  @Get('card')
  @ApiOperation({ summary: "Authenticated journalist's current (primary) card" })
  getCard(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Headers('x-unlock-token') unlock?: string,
  ): Promise<CardResponse> {
    return this.meService.getCard(
      user.sub,
      requestBaseUrl(req, this.meService.verifyBaseUrl),
      unlock,
    );
  }

  @Delete('me/account')
  @ApiOperation({ summary: 'Delete your own account (only when you belong to no editorial)' })
  deleteOwnAccount(@CurrentUser() user: JwtPayload): Promise<{ success: boolean }> {
    return this.meService.deleteOwnAccount(user.sub);
  }

  @Put('me/password')
  @ApiOperation({ summary: 'Change your own password' })
  changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ success: boolean }> {
    return this.meService.changePassword(user.sub, dto.currentPassword, dto.newPassword);
  }

  @Get('me/join-requests')
  @ApiOperation({ summary: 'Pending editorial join requests to confirm/reject' })
  joinRequests(@CurrentUser() user: JwtPayload): Promise<JoinRequestInfo[]> {
    return this.meService.listJoinRequests(user.sub);
  }

  @Post('me/join-requests/:id/accept')
  @ApiOperation({ summary: 'Confirm joining an editorial (creates membership + grant)' })
  acceptJoinRequest(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-unlock-token') unlock?: string,
  ): Promise<JoinRequestInfo[]> {
    return this.meService.respondToJoinRequest(user.sub, id, true, unlock);
  }

  @Post('me/join-requests/:id/reject')
  @ApiOperation({ summary: 'Reject an editorial join request' })
  rejectJoinRequest(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<JoinRequestInfo[]> {
    return this.meService.respondToJoinRequest(user.sub, id, false);
  }

  @Get('cards')
  @ApiOperation({ summary: 'All cards the journalist holds (primary first)' })
  getCards(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Headers('x-unlock-token') unlock?: string,
  ): Promise<CardResponse[]> {
    return this.meService.getCards(
      user.sub,
      requestBaseUrl(req, this.meService.verifyBaseUrl),
      unlock,
    );
  }

  @Put('card/primary')
  @ApiOperation({ summary: 'Choose which card is primary' })
  setPrimary(
    @CurrentUser() user: JwtPayload,
    @Body() body: SetPrimaryCardDto,
    @Req() req: Request,
    @Headers('x-unlock-token') unlock?: string,
  ): Promise<CardResponse[]> {
    return this.meService.setPrimaryCard(
      user.sub,
      body.cardId,
      requestBaseUrl(req, this.meService.verifyBaseUrl),
      unlock,
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
    @Headers('x-unlock-token') unlock?: string,
  ): Promise<CardQr> {
    return this.meService.getCardQr(
      user.sub,
      requestBaseUrl(req, this.meService.verifyBaseUrl),
      cardId ? Number(cardId) : undefined,
      unlock,
    );
  }
}
