import { Body, Controller, Get, Header, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiOkResponse, ApiOperation, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { LoginDto, StaffDto, TokenDto } from './auth.dto';
import { CurrentStaff, StaffGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { RateLimit, RateLimitGuard } from './rate-limit';

@ApiTags('auth')
@ApiUnauthorizedResponse({ description: 'Invalid credentials, inactive account or expired token.' })
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(RateLimitGuard)
  @RateLimit('login-ip', 20, 900)
  @ApiOperation({ operationId: 'loginStaff', summary: 'Authenticate utility staff', description: 'Verifies credentials and returns a 30-minute bearer token. Limits attempts by IP and normalized email.' })
  @ApiOkResponse({ description: 'Short-lived access token.', type: TokenDto })
  @ApiBadRequestResponse({ description: 'Invalid email or password shape.' })
  @ApiResponse({ status: 429, description: 'Login attempt limit exceeded.' })
  login(@Body() input: LoginDto): Promise<TokenDto> { return this.auth.login(input); }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  @UseGuards(StaffGuard)
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'getCurrentStaff', summary: 'Read current staff identity', description: 'Checks current account activation and returns the current role without credentials.' })
  @ApiOkResponse({ description: 'Active staff identity and current role.', type: StaffDto })
  me(@CurrentStaff() staff: StaffDto): StaffDto { return staff; }
}
