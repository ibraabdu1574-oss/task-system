import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

/** ردود أخطاء موحّدة: { statusCode, error, message } — بلا تسريب تفاصيل داخلية */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'خطأ داخلي في الخادم';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const b = body as { message?: string | string[]; error?: string };
        message = b.message ?? message;
        error = b.error ?? exception.name;
      }
    } else {
      this.logger.error(`${req.method} ${req.url} — ${(exception as Error)?.message}`, (exception as Error)?.stack);
    }

    res.status(status).json({ statusCode: status, error, message });
  }
}
