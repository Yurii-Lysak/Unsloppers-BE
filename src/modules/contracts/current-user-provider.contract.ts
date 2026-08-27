/**
 * C7 — CurrentUserProvider
 *
 * The only sanctioned way any module learns the current authenticated user
 * (AD-1 forbids importing `auth` directly; AD-9 keeps auth's session
 * mechanics out of every other module's knowledge).
 *
 * CROSS-STORY COORDINATION: this is the handoff point to Story 1.18
 * (Authentication), which implements this contract for real against a JWT
 * session. This signature is NOT to be treated as an interchangeable 1-of-8
 * contract file — coordinate any change with whoever picks up 1.18 before
 * treating it as frozen.
 */

export interface CurrentUserDto {
  userId: string;
}

export abstract class CurrentUserProvider {
  abstract getCurrentUser(
    request: unknown,
  ): Promise<CurrentUserDto> | CurrentUserDto;
}
