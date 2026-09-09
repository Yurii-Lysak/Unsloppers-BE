import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';

@Injectable()
export class RejectIdpCompletedAtWriteInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const body: unknown = request.body;

    if (body !== null && typeof body === 'object' && 'completedAt' in body) {
      throw new BadRequestException(
        'completedAt is set only by the complete endpoint',
      );
    }

    return next.handle();
  }
}
