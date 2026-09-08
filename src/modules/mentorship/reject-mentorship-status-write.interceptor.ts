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
export class RejectMentorshipStatusWriteInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const body: unknown = request.body;

    if (
      body !== null &&
      typeof body === 'object' &&
      ('mentorStatus' in body || 'status' in body)
    ) {
      throw new BadRequestException(
        'mentorStatus and status are derived read-only fields',
      );
    }

    return next.handle();
  }
}
