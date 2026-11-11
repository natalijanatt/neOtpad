import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthRepository } from './auth.repository';
import { verifyPassword } from './password';
import { RateLimitService } from './rate-limit';
import type { LoginDto, StaffDto, TokenDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(private readonly repository: AuthRepository, private readonly jwt: JwtService, private readonly limits: RateLimitService) {}

  async login(input: LoginDto): Promise<TokenDto> {
    await this.limits.consume(input.email, { scope: 'login-account', count: 10, seconds: 900 });
    const user = await this.repository.findByEmail(input.email);
    const valid = await verifyPassword(input.password, user?.lozinka_hash ?? '');
    if (!user?.aktivan || !valid) throw new UnauthorizedException('Invalid credentials');
    return { accessToken: await this.jwt.signAsync({ sub: user.id }), expiresIn: 1800 };
  }

  async identity(id: string): Promise<StaffDto> {
    const user = await this.repository.findById(id);
    if (!user?.aktivan) throw new UnauthorizedException('Inactive or unknown staff account');
    return { id: user.id, ime: user.ime, uloga: user.uloga };
  }
}
