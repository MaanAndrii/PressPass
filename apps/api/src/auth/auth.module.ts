import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';

import { CryptoModule } from '../crypto/crypto.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google.service';
import { RefreshTokenService } from './refresh-token.service';
import { RegistrationService } from './registration.service';

@Module({
  imports: [
    CryptoModule,
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('JWT_SECRET environment variable is required');
        }
        // Short-lived access token: the client silently rotates it via the
        // refresh cookie, so a leaked token is only briefly useful.
        const expiresIn = config.get<string>('JWT_EXPIRES_IN', '15m');
        return {
          secret,
          signOptions: {
            expiresIn: expiresIn as NonNullable<JwtModuleOptions['signOptions']>['expiresIn'],
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, RegistrationService, GoogleAuthService, RefreshTokenService],
})
export class AuthModule {}
