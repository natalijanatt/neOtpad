import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { StaffGuard } from './auth.guard';
import { RateLimitGuard, RateLimitService } from './rate-limit';

@Module({
  imports: [JwtModule.registerAsync({
    inject: [ConfigService],
    useFactory: (config: ConfigService) => ({
      secret: config.getOrThrow<string>('JWT_SECRET'),
      signOptions: { algorithm: 'HS256', expiresIn: 1800, issuer: 'pirot-api', audience: 'pirot-staff' },
      verifyOptions: { algorithms: ['HS256'], issuer: 'pirot-api', audience: 'pirot-staff' },
    }),
  })],
  controllers: [AuthController],
  providers: [AuthRepository, AuthService, StaffGuard, RateLimitGuard, RateLimitService],
  exports: [StaffGuard, RateLimitGuard, RateLimitService, AuthService, JwtModule],
})
export class AuthModule {}
