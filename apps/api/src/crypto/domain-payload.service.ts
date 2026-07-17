import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ProtectedDataService } from './protected-data.service';

@Injectable()
export class DomainPayloadService {
  constructor(private readonly protectedData: ProtectedDataService) {}
  encrypt(
    entity: string,
    entityId: string | number,
    ownerId: string,
    data: object,
    key: Buffer,
  ): Prisma.InputJsonValue {
    return JSON.parse(
      JSON.stringify(
        this.protectedData.encrypt(data, key, {
          entity,
          entityId: String(entityId),
          field: 'payload',
          ownerId,
        }),
      ),
    ) as Prisma.InputJsonValue;
  }
  decrypt<T>(
    entity: string,
    entityId: string | number,
    ownerId: string,
    payload: unknown,
    key: Buffer,
  ): T {
    return this.protectedData.decrypt<T>(payload, key, {
      entity,
      entityId: String(entityId),
      field: 'payload',
      ownerId,
    });
  }
}
