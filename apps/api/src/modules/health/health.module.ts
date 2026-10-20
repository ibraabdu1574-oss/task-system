import { Controller, Get, Module } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** صحة الخدمة وقاعدة البيانات — تستخدمه healthcheck في compose و verify.sh */
  @Public()
  @Get()
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', db: 'ok', time: new Date().toISOString() };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
