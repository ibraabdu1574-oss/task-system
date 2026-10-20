import { ValidationPipe, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadConfig } from './config/config';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: config.nodeEnv === 'production' ? ['error', 'warn', 'log'] : ['error', 'warn', 'log', 'debug'],
  });

  // المنفذ منشور على 127.0.0.1 فلا يصل إليه إلا nginx (عبر جسر docker) — نثق بـ X-Forwarded-* منه
  app.set('trust proxy', true);
  app.disable('x-powered-by');

  app.use(helmet({ contentSecurityPolicy: false })); // CSP تُدار في الواجهة/nginx
  app.enableCors({ origin: config.publicUrl, credentials: true });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();

  if (config.swaggerEnabled) {
    const doc = new DocumentBuilder()
      .setTitle('نظام إدارة المهام — API')
      .setVersion('1.0 (المرحلة 1)')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/v1/docs', app, SwaggerModule.createDocument(app, doc));
  }

  await app.listen(config.port, '0.0.0.0');
  new Logger('Bootstrap').log(`API تعمل على المنفذ ${config.port} (${config.nodeEnv})`);
}

bootstrap().catch((err) => {
  // فشل الإقلاع يجب أن يكون صريحًا ليظهر في: task logs api
  console.error('✗ فشل إقلاع الـ API:', err?.message || err);
  process.exit(1);
});
