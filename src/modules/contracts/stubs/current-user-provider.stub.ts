import { Injectable } from '@nestjs/common';
import {
  CurrentUserProvider,
  CurrentUserDto,
} from '../current-user-provider.contract';

/**
 * Wave-0 stub — returns a fixed dev/test user id. Story 1.18 (Authentication)
 * provides the real implementation backed by the JWT session.
 */
@Injectable()
export class CurrentUserProviderStub extends CurrentUserProvider {
  getCurrentUser(): CurrentUserDto {
    return { userId: 'wave-0-stub-user' };
  }
}
