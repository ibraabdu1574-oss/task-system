import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { AppConfig } from '../../config/config';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AUTH_STRATEGY } from './strategies/auth-strategy.interface';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LdapStrategy } from './strategies/ldap.strategy';
import { LocalStrategy } from './strategies/local.strategy';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' }), JwtModule.register({}), UsersModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    LocalStrategy,
    LdapStrategy,
    {
      // مصدر الهوية يُختار من الإعدادات — بلا تغيير في بقية الكود عند تفعيل LDAP لاحقًا
      provide: AUTH_STRATEGY,
      inject: [ConfigService, LocalStrategy, LdapStrategy],
      useFactory: (config: ConfigService, local: LocalStrategy, ldap: LdapStrategy) =>
        config.get<AppConfig>('app')!.authSource === 'ldap' ? ldap : local,
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
