import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { EditorialKeyGrantService } from '../crypto/editorial-key-grant.service';
import { EncryptedFileService } from '../crypto/encrypted-file.service';
import { PrismaService } from '../prisma/prisma.service';
import { SOFT_DELETE_GRACE_MS } from '../common/soft-delete';

/**
 * Background housekeeping. Once a soft-deleted account or membership is older
 * than the grace window it is removed for good: a deleted account's user row is
 * dropped (cascading its journalist, cards, memberships and grants — which
 * cancels every credential and frees the email), and a removed membership is
 * deleted after its editorial key grant is revoked.
 */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly files: EncryptedFileService,
    private readonly grants: EditorialKeyGrantService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async purgeExpiredSoftDeletes(): Promise<{ accounts: number; memberships: number }> {
    const cutoff = new Date(Date.now() - SOFT_DELETE_GRACE_MS);

    // Memberships first: revoke the editorial's decryption grant, then drop the row.
    const memberships = await this.prisma.editorialMembership.findMany({
      where: { deletedAt: { not: null, lt: cutoff } },
      include: { journalist: { select: { userId: true } } },
    });
    for (const membership of memberships) {
      await this.grants
        .revoke(membership.journalist.userId, membership.editorialId)
        .catch((error) => this.logger.warn(`grant revoke failed: ${(error as Error).message}`));
      await this.prisma.editorialMembership.delete({ where: { id: membership.id } });
    }

    // Whole accounts: remove owned encrypted files, then delete the user (cascade
    // removes the journalist, all cards and grants, and releases the email).
    const users = await this.prisma.user.findMany({
      where: { deletedAt: { not: null, lt: cutoff } },
      select: { id: true },
    });
    for (const user of users) {
      await this.files
        .removeOwner('user', String(user.id))
        .catch((error) => this.logger.warn(`file cleanup failed: ${(error as Error).message}`));
      await this.prisma.user.delete({ where: { id: user.id } });
    }

    if (users.length || memberships.length)
      this.logger.log(
        `Purged ${users.length} expired account(s) and ${memberships.length} membership(s).`,
      );
    return { accounts: users.length, memberships: memberships.length };
  }
}
