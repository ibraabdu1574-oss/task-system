import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { SessionUser } from '@task/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Require } from '../../common/decorators/require.decorator';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto, LogoutDto, RefreshDto } from './dto/login.dto';

const metaOf = (req: Request) => ({ ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null });

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'تسجيل الدخول — يعيد access + refresh' })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto.identifier, dto.password, metaOf(req));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'تدوير رمز التحديث' })
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, metaOf(req));
  }

  @Post('logout')
  @HttpCode(200)
  @Require('self')
  @ApiBearerAuth()
  logout(@CurrentUser() user: SessionUser, @Body() dto: LogoutDto, @Req() req: Request) {
    return this.auth.logout(user, dto.refreshToken, metaOf(req));
  }

  @Get('me')
  @Require('self')
  @ApiBearerAuth()
  me(@CurrentUser() user: SessionUser): SessionUser {
    return user;
  }

  @Post('change-password')
  @HttpCode(200)
  @Require('self')
  @ApiBearerAuth()
  changePassword(@CurrentUser() user: SessionUser, @Body() dto: ChangePasswordDto, @Req() req: Request) {
    return this.auth.changePassword(user, dto.currentPassword, dto.newPassword, metaOf(req));
  }
}
