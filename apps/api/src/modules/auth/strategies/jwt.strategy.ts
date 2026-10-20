import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { SessionUser } from '@task/shared';
import type { AppConfig } from '../../../config/config';
import { UsersService } from '../../users/users.service';

export interface AccessPayload {
  sub: string; // user id
  role: string;
  typ: 'access';
}

/** يتحقق من access token (Bearer) ويحمّل المستخدم الحالي من قاعدة البيانات في كل طلب */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService, private readonly users: UsersService) {
    const app = config.get<AppConfig>('app')!;
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: app.jwt.accessSecret,
    });
  }

  async validate(payload: AccessPayload): Promise<SessionUser> {
    if (payload.typ !== 'access') throw new UnauthorizedException('رمز غير صالح');
    const user = await this.users.findSession(payload.sub);
    if (!user || !user.isActive) throw new UnauthorizedException('الحساب غير متاح');
    return user;
  }
}
