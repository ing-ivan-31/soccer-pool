import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiSuccessResponse, PaginationMeta } from '../interfaces/api-response.interface';

interface HandlerResult {
  message?: string;
  data?: unknown;
  meta?: PaginationMeta;
  [key: string]: unknown;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiSuccessResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiSuccessResponse<T>> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse<{ statusCode: number }>();

    return next.handle().pipe(
      map((result: HandlerResult | T) => {
        const statusCode = response.statusCode;

        if (
          result !== null &&
          typeof result === 'object' &&
          'data' in result &&
          'message' in result
        ) {
          const { message, data, meta, ...rest } = result as HandlerResult;
          return {
            success: true as const,
            statusCode,
            message: message ?? 'OK',
            data: (data ?? rest) as T,
            ...(meta ? { meta } : {}),
          };
        }

        return {
          success: true as const,
          statusCode,
          message: 'OK',
          data: result as T,
        };
      }),
    );
  }
}