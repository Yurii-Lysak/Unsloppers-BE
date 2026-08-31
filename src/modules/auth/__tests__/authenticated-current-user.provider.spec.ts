import { UnauthorizedException } from '@nestjs/common';
import { AuthenticatedCurrentUserProvider } from '../authenticated-current-user.provider';

describe('AuthenticatedCurrentUserProvider', () => {
  const provider = new AuthenticatedCurrentUserProvider();

  it('returns only the authenticated user id', () => {
    expect(
      provider.getCurrentUser({ user: { userId: 'authenticated-user' } }),
    ).toEqual({ userId: 'authenticated-user' });
  });

  it('rejects requests without an authenticated user', () => {
    expect(() => provider.getCurrentUser({})).toThrow(UnauthorizedException);
  });
});
