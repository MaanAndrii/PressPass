import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { UserKeyMaterialService } from './user-key-material.service';

@Injectable()
export class EditorialKeyGrantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userKeys: UserKeyMaterialService,
  ) {}

  async sync(userId: number, editorialIds: number[], dataKey: Buffer): Promise<void> {
    const uniqueIds = [...new Set(editorialIds)];
    await this.prisma.$transaction(async (tx) => {
      await tx.editorialDataKeyGrant.deleteMany({
        where: { userId, ...(uniqueIds.length ? { editorialId: { notIn: uniqueIds } } : {}) },
      });
      for (const editorialId of uniqueIds) {
        await tx.editorialDataKeyGrant.upsert({
          where: { userId_editorialId: { userId, editorialId } },
          create: {
            userId,
            editorialId,
            keyEnvelope: this.userKeys.createEditorialGrant(userId, editorialId, dataKey),
          },
          update: {},
        });
      }
    });
  }

  async syncFromRecovery(userId: number): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        recoveryKeyEnvelope: true,
        journalist: { select: { memberships: { select: { editorialId: true } } } },
      },
    });
    if (!user?.recoveryKeyEnvelope) {
      return;
    }
    const dataKey = this.userKeys.recover(userId, user.recoveryKeyEnvelope);
    try {
      await this.sync(
        userId,
        user.journalist?.memberships.map((membership) => membership.editorialId) ?? [],
        dataKey,
      );
    } finally {
      dataKey.fill(0);
    }
  }

  revoke(userId: number, editorialId: number): Promise<{ count: number }> {
    return this.prisma.editorialDataKeyGrant.deleteMany({ where: { userId, editorialId } });
  }
}
