import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { VerifyResponse } from '@presspass/shared';

import { Public } from '../auth/decorators/public.decorator';
import { VerifyService } from './verify.service';

@ApiTags('verify')
@Controller('verify')
export class VerifyController {
  constructor(private readonly verifyService: VerifyService) {}

  @Public()
  // Public endpoint — keep the limit tight to discourage scraping.
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Get(':uuid')
  @ApiOperation({
    summary: 'Public verification of a card (URL from the dynamic QR code)',
    description:
      'Card data is returned only when the short-lived signed token `t` is valid. ' +
      'An expired or missing token yields valid:false without any personal data.',
  })
  @ApiParam({ name: 'uuid', description: 'Card UUID (UUIDv7)', format: 'uuid' })
  @ApiQuery({ name: 't', required: false, description: 'Signed short-lived QR token' })
  verify(
    @Param('uuid', new ParseUUIDPipe()) uuid: string,
    @Query('t') token?: string,
  ): Promise<VerifyResponse> {
    return this.verifyService.verify(uuid, token);
  }
}
