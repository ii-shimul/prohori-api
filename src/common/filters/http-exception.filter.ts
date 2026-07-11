import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';

interface ErrorResponseBody {
  code?: string;
  fieldErrors?: Record<string, string[]>;
  message?: string | string[];
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<FastifyReply>();
    const request = context.getRequest<FastifyRequest>();
    const { status, body } = this.getErrorDetails(exception);

    response.status(status).send({
      code: body.code ?? HttpStatus[status] ?? 'INTERNAL_SERVER_ERROR',
      correlationId: this.getCorrelationId(request),
      fieldErrors: body.fieldErrors ?? {},
      message: this.getMessage(body.message, status),
    });
  }

  private getErrorDetails(exception: unknown): {
    status: number;
    body: ErrorResponseBody;
  } {
    if (!(exception instanceof HttpException)) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        body: {},
      };
    }

    const response = exception.getResponse();
    if (typeof response === 'string') {
      return {
        status: exception.getStatus(),
        body: { message: response },
      };
    }

    return {
      status: exception.getStatus(),
      body: response,
    };
  }

  private getMessage(
    message: string | string[] | undefined,
    status: number,
  ): string {
    if (Array.isArray(message)) {
      return message.join(', ');
    }

    return message ?? HttpStatus[status] ?? 'Internal server error';
  }

  private getCorrelationId(request: FastifyRequest): string {
    const header = request.headers['x-correlation-id'];

    return Array.isArray(header) ? header[0] : (header ?? 'unavailable');
  }
}
