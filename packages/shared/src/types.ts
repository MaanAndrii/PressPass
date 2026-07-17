/**
 * API contract types shared between the NestJS backend and the Next.js frontend.
 * The backend is the source of truth; the frontend must not add business logic.
 */

export const ROLES = ['ADMIN', 'EDITORIAL_ADMIN', 'JOURNALIST'] as const;
export type Role = (typeof ROLES)[number];

/** True for either admin tier (system admin or editorial-bound admin). */
export function isAdminRole(role: Role): boolean {
  return role === 'ADMIN' || role === 'EDITORIAL_ADMIN';
}

export const CARD_STATUSES = ['ACTIVE', 'BLOCKED', 'EXPIRED'] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

/** GET /auth/config — which optional sign-in methods are enabled. */
export interface AuthConfig {
  googleEnabled: boolean;
}

/** GET /admin/settings — runtime settings (secrets are masked, never returned). */
export interface AppSettings {
  /** Whether a Resend API key is configured (via panel or env). */
  resendConfigured: boolean;
  /** Masked preview of the stored key, e.g. "re_…a1b2", or null. */
  resendKeyPreview: string | null;
  mailFrom: string;
  /** Uploaded NSZHU logo path (shown on union members' cards), or null. */
  nszhuLogoPath: string | null;
}

/** GET /branding — public branding assets needed to render a card. */
export interface BrandingInfo {
  /** NSZHU logo path shown for union members, or null when not uploaded. */
  nszhuLogoPath: string | null;
}

/** GET /admin/admins — administrator accounts of the system. */
export interface AdminAccount {
  id: number;
  email: string;
  emailVerified: boolean;
  /** ADMIN (system-wide) or EDITORIAL_ADMIN (bound to one editorial). */
  role: Role;
  /** Editorial an EDITORIAL_ADMIN is bound to (null for a system admin). */
  editorialId: number | null;
  editorialName: string | null;
  /** ISO date the account was created. */
  createdAt: string;
}

/**
 * POST /admin/admins body. `role` defaults to EDITORIAL_ADMIN (which requires
 * `editorialId`); pass role "ADMIN" to create another system administrator.
 */
export interface CreateAdminInput {
  email: string;
  password: string;
  encryptionPassphrase: string;
  role?: 'ADMIN' | 'EDITORIAL_ADMIN';
  editorialId?: number;
}

/** PUT /admin/settings body. Omitted fields are left unchanged. */
export interface UpdateSettingsInput {
  /** New Resend API key; empty string clears it (falls back to env). */
  resendApiKey?: string;
  mailFrom?: string;
}

/** A catalogue journalist position (Ukrainian + English name). */
export interface Position {
  id: number;
  nameUk: string;
  nameEn: string;
}

/** POST /admin/positions body. */
export interface PositionInput {
  nameUk: string;
  nameEn?: string;
}

/** An issuing company ("редакція") managed by the admin. */
export interface Editorial {
  id: number;
  name: string;
  /** Display name shown on the card (Ukrainian side); falls back to `name`. */
  displayNameUk: string;
  /** Display name shown on the card's English side; falls back to `name`. */
  displayNameEn: string;
  /** State media identifier, e.g. "R40-02551" (mask ***-*****); optional. */
  mediaId: string;
  /** Ukrainian company registration code (ЄДРПОУ). */
  edrpou: string;
  /** Official site — the public registry of issued credentials. */
  website: string;
  logoPath: string | null;
  director: string;
  email: string;
  address: string;
  phone: string;
  /** Editorial-specific prefix used by the card-number template (unique). */
  cardNumberPrefix: string;
  /** Card-number pattern, e.g. "{prefix}-{year}-{seq:6}" (yearly sequence). */
  cardNumberTemplate: string;
}

/** POST/PUT /admin/editorials body. Only the name is required. */
export interface EditorialInput {
  name: string;
  displayNameUk?: string;
  displayNameEn?: string;
  mediaId?: string;
  edrpou?: string;
  website?: string;
  director?: string;
  email?: string;
  address?: string;
  phone?: string;
  cardNumberPrefix?: string;
  cardNumberTemplate?: string;
}

/** Compact editorial shown on a card / verify page (name, logo, registry link). */
export interface CardEditorial {
  id: number;
  name: string;
  /** Card display names (fall back to `name` when empty). */
  displayNameUk: string;
  displayNameEn: string;
  /** State media identifier shown on the card when set. */
  mediaId: string;
  website: string;
  logoPath: string | null;
}

/** POST /auth/login and POST /auth/verify-email response. */
export interface LoginResponse {
  accessToken: string;
  user: UserProfile;
  /** Opaque short-lived API unlock token; never contains encryption key material. */
  unlockToken?: string;
  unlockExpiresAt?: string;
  /** Google-only accounts must enroll a separate encryption passphrase. */
  encryptionEnrollmentRequired?: boolean;
}

/** POST /auth/register and /auth/resend-code response. */
export interface RegisterResponse {
  success: boolean;
  message: string;
}

/** A media a journalist belongs to (shown in their cabinet). */
export interface MembershipInfo {
  id: number;
  name: string;
}

/** GET /me response. */
export interface UserProfile {
  id: number;
  email: string;
  role: Role;
  emailVerified: boolean;
  /** For an EDITORIAL_ADMIN, the editorial they are bound to (else null). */
  editorialId: number | null;
  journalist: JournalistProfile | null;
  /** Media the journalist belongs to (empty until an admin adds them). */
  memberships: MembershipInfo[];
}

export interface JournalistProfile {
  id: number;
  /** Short code the journalist gives an admin to be added to a media. */
  publicId: string;
  fullName: string;
  /** Latinised full name for the bilingual card (optional). */
  fullNameEn: string;
  position: string;
  /** English position for the card's English side (optional). */
  positionEn: string;
  organization: string;
  /** English organization for the card's English side (optional). */
  organizationEn: string;
  photoPath: string | null;
  birthDate: string | null;
  passportData: string | null;
  taxNumber: string | null;
  phone: string | null;
  /** Member of the National Union of Journalists of Ukraine (НСЖУ). */
  nszhuMember: boolean;
  selfRegistered: boolean;
  /** Questionnaire fully filled in (incl. photo) — required before a card is issued. */
  profileComplete: boolean;
}

/**
 * Questionnaire fields the user fills in after registration (PUT /profile).
 * Position and organization are NOT here — they are set by the issuing
 * editorial at card issuance, not by the journalist.
 */
export interface ProfileInput {
  fullName: string;
  fullNameEn?: string;
  birthDate: string;
  passportData: string;
  taxNumber: string;
  phone: string;
}

/** GET /card and admin card responses. */
export interface CardResponse {
  id: number;
  uuid: string;
  cardNumber: string;
  issueDate: string;
  expireDate: string;
  status: CardStatus;
  /** Position set by the issuing editorial (per card, both languages). */
  position: string;
  positionEn: string;
  /** URL embedded in the QR code: {VERIFY_BASE_URL}/verify/{uuid}. */
  verifyUrl: string;
  journalist: JournalistProfile;
  /** Issuing company chosen at issuance; its name/logo appear on the card. */
  editorial: CardEditorial | null;
  /** True when this is the journalist's chosen primary card (GET /cards). */
  isPrimary?: boolean;
}

/**
 * GET /card/qr and GET /admin/cards/:id/qr — short-lived tokenized QR payload.
 * The QR must be re-generated every ~30 s; the token expires server-side.
 */
export interface CardQr {
  /** {VERIFY_BASE_URL}/verify/{uuid}?t={signed token} */
  verifyUrl: string;
  /** Token lifetime; the client refreshes the QR well before it elapses. */
  expiresInSeconds: number;
}

/** Result of validating the QR token that accompanied a verification request. */
export type QrTokenStatus = 'VALID' | 'EXPIRED' | 'MISSING' | 'INVALID';

/**
 * GET /verify/:uuid?t=... response — public data only (no passport/tax/phone!).
 * Card data is returned ONLY when the QR token is valid: a screenshot of an
 * old QR (or a guessed UUID) reveals nothing and verifies as invalid.
 */
export interface VerifyResponse {
  valid: boolean;
  qrStatus: QrTokenStatus;
  status?: CardStatus;
  cardNumber?: string;
  expireDate?: string;
  fullName?: string;
  fullNameEn?: string;
  position?: string;
  organization?: string;
  photoPath?: string | null;
  /** Issuing company (name + public registry link + logo). */
  editorial?: CardEditorial | null;
  /** Whether the journalist is an НСЖУ member. */
  nszhuMember?: boolean;
  /** NSZHU logo path (only present/shown for members). */
  nszhuLogoPath?: string | null;
}

/** POST /admin/journalists/attach — add a journalist to a media by public id. */
export interface AttachJournalistInput {
  publicId: string;
  /** Target editorial (required for a system admin; forced for editorial admin). */
  editorialId?: number;
}

/** Admin list item for journalists. */
export interface AdminJournalist {
  id: number;
  userId: number;
  /** Short code to add this journalist to a media. */
  publicId: string;
  email: string;
  emailVerified: boolean;
  fullName: string;
  fullNameEn: string;
  position: string;
  positionEn: string;
  organization: string;
  organizationEn: string;
  photoPath: string | null;
  birthDate: string | null;
  passportData: string | null;
  taxNumber: string | null;
  phone: string | null;
  /** Member of the National Union of Journalists of Ukraine (НСЖУ). */
  nszhuMember: boolean;
  selfRegistered: boolean;
  profileComplete: boolean;
  cardsCount: number;
  /** Media this journalist belongs to. */
  memberships: MembershipInfo[];
  /**
   * True when the viewer holds no key to decrypt this journalist's protected
   * fields (e.g. a self-registered journalist with no editorial grant). The
   * row is listed so it is not silently hidden, but personal fields are blank.
   */
  encrypted?: boolean;
}

/** Shared rule: when the self-registration questionnaire counts as complete. */
export function isProfileComplete(journalist: {
  fullName: string;
  photoPath: string | null;
  birthDate: Date | string | null;
  passportData: string | null;
  taxNumber: string | null;
  phone: string | null;
}): boolean {
  return Boolean(
    journalist.fullName &&
    journalist.photoPath &&
    journalist.birthDate &&
    journalist.passportData &&
    journalist.taxNumber &&
    journalist.phone,
  );
}
