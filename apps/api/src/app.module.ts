import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { loadConfig } from './config/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { UsersModule } from './modules/users/users.module';
import { OrgModule } from './modules/org/org.module';
import { CapacityModule } from './modules/capacity/capacity.module';
import { AuditModule } from './modules/audit/audit.module';
import { HealthModule } from './modules/health/health.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [() => ({ app: loadConfig() })] }),
    PrismaModule,
    AuditModule,
    RbacModule,
    AuthModule,
    UsersModule,
    OrgModule,
    CapacityModule,
    TasksModule,
    HealthModule,
  ],
  providers: [
    // الترتيب مهم: المصادقة أولًا ثم الصلاحيات — وكلاهما على كل مسار ما لم يُعلَّم @Public()
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
