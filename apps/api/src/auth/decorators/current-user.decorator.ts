import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { JwtPayload } from '../auth.types';

/** Injects the JWT payload of the authenticated user into a handler parameter. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
  return request.user;
});
