import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const error =
        typeof body === 'object' && body && 'error' in body ? String((body as { error: string }).error) : 'http_error';
      response.status(exception.getStatus()).json({ error });
      return;
    }
    const code = typeof exception === 'object' && exception && 'code' in exception ? String((exception as { code: string }).code) : '';
    if (code === 'P2002') {
      response.status(409).json({ error: 'conflict' });
      return;
    }
    if (code === 'not_found') {
      response.status(404).json({ error: code });
      return;
    }
    if (['invalid_backup', 'manual_exceeds_total', 'last_position', 'unsupported_format'].includes(code)) {
      response.status(400).json({ error: code });
      return;
    }
    console.error(exception);
    response.status(500).json({ error: 'internal_error' });
  }
}
