import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Role } from '@presspass/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/auth.types';
import { EncryptionPassphraseDto } from './dto/encryption-passphrase.dto';
import { EncryptionAccessService } from './encryption-access.service';
import { RecoverySlotsDto } from './dto/recovery-slots.dto';
import { RecoverOwnerDto } from './dto/recover-owner.dto';
import { ChangeEncryptionPassphraseDto } from './dto/change-encryption-passphrase.dto';

@ApiTags('encryption')
@ApiBearerAuth()
@Controller('encryption')
export class EncryptionAccessController {
  constructor(private readonly access: EncryptionAccessService) {}
  @Post('enroll')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Enroll a distinct encryption passphrase' })
  enroll(
    @CurrentUser() user: JwtPayload,
    @Body() dto: EncryptionPassphraseDto,
    @Headers('x-unlock-token') existing?: string,
  ) {
    return this.access.enroll(user.sub, user.role as Role, dto.passphrase, user.email, existing);
  }
  @Post('unlock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a short-lived in-memory key session' })
  unlock(
    @CurrentUser() user: JwtPayload,
    @Body() dto: EncryptionPassphraseDto,
    @Headers('x-unlock-token') existing?: string,
  ) {
    return this.access.unlock(user.sub, user.role as Role, dto.passphrase, existing);
  }
  @Post('editorials/:editorialId/claim')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Wrap an independently unlocked editorial key for the current Superadmin',
  })
  claim(
    @CurrentUser() user: JwtPayload,
    @Param('editorialId', ParseIntPipe) editorialId: number,
    @Headers('x-unlock-token') token?: string,
  ) {
    return this.access.claimEditorial(user.sub, user.role as Role, editorialId, token);
  }
  @Post('editorial-grants/:editorialId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Wrap the unlocked profile key for an independently unlocked editorial',
  })
  grant(
    @CurrentUser() user: JwtPayload,
    @Param('editorialId', ParseIntPipe) editorialId: number,
    @Headers('x-unlock-token') token?: string,
  ) {
    return this.access.grantEditorial(user.sub, editorialId, token);
  }
  @Post('recovery-slots')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create two independent one-time offline Superadmin recovery kits' })
  recovery(
    @CurrentUser() user: JwtPayload,
    @Headers('x-unlock-token') token: string | undefined,
    @Body() dto: RecoverySlotsDto,
  ) {
    return this.access.createRecoverySlots(user.sub, user.role as Role, token, dto);
  }
  @Post('change-passphrase')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rewrap the same owner key with a new encryption passphrase' })
  change(@CurrentUser() user: JwtPayload, @Body() dto: ChangeEncryptionPassphraseDto) {
    return this.access.changePassphrase(
      user.sub,
      user.role as Role,
      dto.currentPassphrase,
      dto.newPassphrase,
    );
  }
  @Post('recover-user')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Use an offline Superadmin kit to rewrap a user DEK' })
  recoverUser(@CurrentUser() user: JwtPayload, @Body() dto: RecoverOwnerDto) {
    return this.access.recoverUser(user.role as Role, dto);
  }
  @Post('lock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Destroy every in-memory key session for the account' })
  lock(@CurrentUser() user: JwtPayload) {
    return this.access.lock(user.sub);
  }
}
