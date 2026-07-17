import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marks a route as accessible without a JWT (login, verification). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
