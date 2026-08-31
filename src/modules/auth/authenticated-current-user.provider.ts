import { Injectable, UnauthorizedException } from '@nestjs/common';
import {
  CurrentUserDto,
  CurrentUserProvider,
} from '../contracts/current-user-provider.contract';
import { AuthenticatedUser } from './auth.types';

interface RequestWithUser {
  user?: AuthenticatedUser;
}

@Injectable()
export class AuthenticatedCurrentUserProvider extends CurrentUserProvider {
  getCurrentUser(request: unknown): CurrentUserDto {
    const user = (request as RequestWithUser | null)?.user;
    if (!user?.userId) {
      throw new UnauthorizedException();
    }
    return { userId: user.userId };
  }
}
