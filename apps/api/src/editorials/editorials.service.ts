import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Editorial } from '@presspass/shared';

import type { JwtPayload } from '../auth/auth.types';
import { mapEditorial } from '../common/editorial.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { UnlockSessionService } from '../crypto/unlock-session.service';
import { DomainPayloadService } from '../crypto/domain-payload.service';
import { KeyHierarchyService } from '../crypto/key-hierarchy.service';
import { BlindIndexService } from '../crypto/blind-index.service';
import { EncryptedFileService } from '../crypto/encrypted-file.service';
import { PublicMediaCacheService } from '../crypto/public-media-cache.service';
import type { CreateEditorialDto } from './dto/create-editorial.dto';
import type { UpdateEditorialDto } from './dto/update-editorial.dto';

/** CRUD for issuing companies ("редакції"). */
@Injectable()
export class EditorialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: UnlockSessionService,
    private readonly payloads: DomainPayloadService,
    private readonly hierarchy: KeyHierarchyService,
    private readonly blind: BlindIndexService,
    private readonly files: EncryptedFileService,
    private readonly publicMedia: PublicMediaCacheService,
  ) {}

  /** System admins see all; an editorial admin sees only their own editorial. */
  async findAll(actor: JwtPayload, token?: string): Promise<Editorial[]> {
    const editorials = await this.prisma.editorial.findMany({
      where: actor.role === 'EDITORIAL_ADMIN' ? { id: actor.editorialId ?? -1 } : undefined,
      orderBy: { name: 'asc' },
    });
    return Promise.all(
      editorials.map(async (editorial) =>
        mapEditorial(await this.hydrate(editorial, actor, token)),
      ),
    );
  }

  async create(dto: CreateEditorialDto, actor: JwtPayload, token?: string): Promise<Editorial> {
    const cardNumberPrefix = dto.cardNumberPrefix?.trim().toUpperCase() ?? '';
    await this.assertPrefixFree(cardNumberPrefix, null);
    const adminKey = this.key(token, actor.sub, 'admin');
    const editorial = await this.prisma.editorial.create({
      data: {
        name: dto.name.trim(),
        displayNameUk: dto.displayNameUk ?? '',
        displayNameEn: dto.displayNameEn ?? '',
        mediaId: dto.mediaId?.toUpperCase() ?? '',
        edrpou: dto.edrpou ?? '',
        website: dto.website ?? '',
        director: dto.director ?? '',
        email: dto.email ?? '',
        address: dto.address ?? '',
        phone: dto.phone ?? '',
        cardNumberPrefix,
        ...(dto.cardNumberTemplate?.trim()
          ? { cardNumberTemplate: dto.cardNumberTemplate.trim() }
          : {}),
      },
    });
    const editorialKey = await this.hierarchy.provisionEditorial(editorial.id, actor.sub, adminKey);
    adminKey.fill(0);
    try {
      await this.hierarchy.wrapOwnerForRecovery('editorial', String(editorial.id), editorialKey);
      const encryptedData = this.payloads.encrypt(
        'editorial',
        editorial.id,
        `editorial:${editorial.id}`,
        this.data(dto, cardNumberPrefix),
        editorialKey,
      );
      const secured = await this.prisma.editorial.update({
        where: { id: editorial.id },
        data: {
          encryptedData,
          cardNumberPrefixBlindIndex: cardNumberPrefix
            ? this.blind.value('card-prefix', cardNumberPrefix)
            : null,
          name: '',
          displayNameUk: '',
          displayNameEn: '',
          mediaId: '',
          cardNumberPrefix: '',
          cardNumberTemplate: '{prefix}-{year}-{seq:6}',
          edrpou: '',
          website: '',
          logoPath: null,
          director: '',
          email: '',
          address: '',
          phone: '',
        },
      });
      return mapEditorial(await this.hydrate(secured, actor, token, editorialKey));
    } finally {
      editorialKey.fill(0);
    }
  }

  async update(
    id: number,
    dto: UpdateEditorialDto,
    actor: JwtPayload,
    token?: string,
  ): Promise<Editorial> {
    this.assertManages(id, actor);
    await this.ensureExists(id);
    const cardNumberPrefix =
      dto.cardNumberPrefix !== undefined ? dto.cardNumberPrefix.trim().toUpperCase() : undefined;
    if (cardNumberPrefix !== undefined) {
      await this.assertPrefixFree(cardNumberPrefix, id);
    }
    const existing = await this.ensureExists(id);
    const key = this.key(token, actor.sub, `editorial:${id}`);
    try {
      const current = existing.encryptedData
        ? this.payloads.decrypt<Record<string, unknown>>(
            'editorial',
            id,
            `editorial:${id}`,
            existing.encryptedData,
            key,
          )
        : this.legacy(existing);
      const next = {
        ...current,
        ...Object.fromEntries(Object.entries(dto).filter(([, value]) => value !== undefined)),
        ...(cardNumberPrefix !== undefined ? { cardNumberPrefix } : {}),
      };
      const editorial = await this.prisma.editorial.update({
        where: { id },
        data: {
          encryptedData: this.payloads.encrypt('editorial', id, `editorial:${id}`, next, key),
          ...(cardNumberPrefix !== undefined
            ? {
                cardNumberPrefixBlindIndex: cardNumberPrefix
                  ? this.blind.value('card-prefix', cardNumberPrefix)
                  : null,
              }
            : {}),
        },
      });
      return mapEditorial(await this.hydrate(editorial, actor, token, key));
    } finally {
      key.fill(0);
    }
  }

  /** A non-empty number prefix must be unique across editorials. */
  private async assertPrefixFree(prefix: string, selfId: number | null): Promise<void> {
    if (!prefix) {
      return;
    }
    const owner = await this.prisma.editorial.findFirst({
      where: {
        OR: [
          { cardNumberPrefixBlindIndex: this.blind.value('card-prefix', prefix) },
          { cardNumberPrefix: prefix },
        ],
      },
    });
    if (owner && owner.id !== selfId) {
      throw new ConflictException(`Префікс «${prefix}» уже використовує інша редакція`);
    }
  }

  /** Removes the editorial; issued cards keep their history (editorial_id → NULL). */
  async remove(id: number): Promise<{ success: boolean }> {
    await this.ensureExists(id);
    const journalists = await this.prisma.editorialMembership.count({ where: { editorialId: id } });
    if (journalists > 0) {
      throw new ConflictException(
        `У редакції ${journalists} журналіст(ів) — спершу приберіть їх, тоді видаляйте`,
      );
    }
    await this.files.removeOwner('editorial', String(id));
    await this.prisma.editorial.delete({ where: { id } });
    return { success: true };
  }

  /** Encrypts a logo with the editorial key before durable storage. */
  async setLogo(
    id: number,
    bytes: Buffer,
    mimeType: string,
    actor: JwtPayload,
    token?: string,
  ): Promise<Editorial> {
    this.assertManages(id, actor);
    const editorial = await this.ensureExists(id);
    const key = this.key(token, actor.sub, `editorial:${id}`);
    try {
      const fileId = await this.files.store({
        ownerType: 'editorial',
        ownerId: String(id),
        editorialId: id,
        purpose: 'logo',
        mimeType,
        bytes,
        ownerKey: key,
      });
      const current = editorial.encryptedData
        ? this.payloads.decrypt<Record<string, unknown>>(
            'editorial',
            id,
            `editorial:${id}`,
            editorial.encryptedData,
            key,
          )
        : this.legacy(editorial);
      const updated = await this.prisma.editorial.update({
        where: { id },
        data: {
          logoPath: null,
          encryptedData: this.payloads.encrypt(
            'editorial',
            id,
            `editorial:${id}`,
            { ...current, logoPath: `/media/${fileId}` },
            key,
          ),
        },
      });
      await this.files.cleanupReplaced('editorial', String(id), 'logo', fileId);
      return mapEditorial(await this.hydrate(updated, actor, token, key));
    } finally {
      key.fill(0);
    }
  }

  /** An editorial admin may only touch their own editorial. */
  private assertManages(id: number, actor: JwtPayload): void {
    if (actor.role === 'EDITORIAL_ADMIN' && actor.editorialId !== id) {
      throw new ForbiddenException('Можна редагувати лише власну редакцію');
    }
  }

  private async ensureExists(id: number) {
    const editorial = await this.prisma.editorial.findUnique({ where: { id } });
    if (!editorial) {
      throw new NotFoundException('Editorial not found');
    }
    return editorial;
  }
  private key(token: string | undefined, userId: number, name: string): Buffer {
    if (!token) throw new BadRequestException('Encryption unlock required');
    try {
      return this.sessions.key(token, userId, name);
    } catch {
      throw new BadRequestException('Encryption unlock required');
    }
  }
  private async hydrate<T extends { id: number; encryptedData: unknown; logoPath?: string | null }>(
    editorial: T,
    actor: JwtPayload,
    token?: string,
    supplied?: Buffer,
  ): Promise<T> {
    if (!editorial.encryptedData) return editorial;
    const key = supplied
      ? Buffer.from(supplied)
      : this.key(token, actor.sub, `editorial:${editorial.id}`);
    try {
      let hydrated = {
        ...editorial,
        ...this.payloads.decrypt<object>(
          'editorial',
          editorial.id,
          `editorial:${editorial.id}`,
          editorial.encryptedData,
          key,
        ),
      } as T;
      const fileId = hydrated.logoPath?.match(/^\/media\/([0-9a-f-]+)$/i)?.[1];
      if (fileId) {
        const logo = await this.files.read(fileId, key);
        hydrated = {
          ...hydrated,
          logoPath: `/public-media/${this.publicMedia.put(logo.bytes, logo.mimeType, 900)}`,
        };
      }
      return hydrated;
    } finally {
      key.fill(0);
    }
  }
  private data(dto: CreateEditorialDto, prefix: string): Record<string, unknown> {
    return {
      name: dto.name.trim(),
      displayNameUk: dto.displayNameUk ?? '',
      displayNameEn: dto.displayNameEn ?? '',
      mediaId: dto.mediaId?.toUpperCase() ?? '',
      edrpou: dto.edrpou ?? '',
      website: dto.website ?? '',
      logoPath: null,
      director: dto.director ?? '',
      email: dto.email ?? '',
      address: dto.address ?? '',
      phone: dto.phone ?? '',
      cardNumberPrefix: prefix,
      cardNumberTemplate: dto.cardNumberTemplate?.trim() || '{prefix}-{year}-{seq:6}',
    };
  }
  private legacy(editorial: Record<string, unknown>): Record<string, unknown> {
    const { encryptedData: _encryptedData, ...data } = editorial;
    return data;
  }
}
