import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AdminsModule } from './admins/admins.module';
import { AuthModule } from './auth/auth.module';
import { BackupModule } from './backup/backup.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { CardTemplateModule } from './card-template/card-template.module';
import { CardsModule } from './cards/cards.module';
import { EditorialsModule } from './editorials/editorials.module';
import { JournalistsModule } from './journalists/journalists.module';
import { MailModule } from './mail/mail.module';
import { PositionsModule } from './positions/positions.module';
import { MeModule } from './me/me.module';
import { PrismaModule } from './prisma/prisma.module';
import { QrTokenModule } from './qr/qr-token.module';
import { SettingsModule } from './settings/settings.module';
import { VerifyModule } from './verify/verify.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    // Global rate limiting: 100 requests per minute per IP.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    SettingsModule,
    MailModule,
    QrTokenModule,
    AuthModule,
    MeModule,
    VerifyModule,
    JournalistsModule,
    CardsModule,
    CardTemplateModule,
    EditorialsModule,
    AdminsModule,
    PositionsModule,
    BackupModule,
    MaintenanceModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
