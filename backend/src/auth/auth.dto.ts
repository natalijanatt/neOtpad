import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import type { AppUlogaKorisnika } from '../database/generated/schema';

export class LoginDto {
  @ApiProperty({ description: 'Staff email address.', example: 'dispecer@example.test' })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ description: 'Staff password.', example: 'example-password-only', minLength: 12, maxLength: 128 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}

export class StaffDto {
  @ApiProperty({ description: 'Staff identifier.', example: '11111111-1111-4111-8111-111111111111', format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Staff display name.', example: 'Dispecer' })
  ime!: string;

  @ApiProperty({ description: 'Current role.', enum: ['admin', 'dispecer', 'vozac'], example: 'dispecer' })
  uloga!: AppUlogaKorisnika;
}

export class TokenDto {
  @ApiProperty({ description: 'Bearer access token.', example: 'eyJhbGciOiJIUzI1NiJ9.example.signature' })
  accessToken!: string;

  @ApiProperty({ description: 'Token lifetime in seconds. Login again after expiry.', example: 1800 })
  expiresIn!: number;
}
