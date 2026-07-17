import type { Role } from '@presspass/shared';

/** Payload signed into every access token. */
export interface JwtPayload {
  /** User id. */
  sub: number;
  email: string;
  role: Role;
  /** Editorial an EDITORIAL_ADMIN is bound to (absent/null otherwise). */
  editorialId?: number | null;
  /** Incremented on logout/password reset so previously issued JWTs stop working. */
  tokenVersion?: number;
}
