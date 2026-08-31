export interface AuthenticatedUser {
  userId: string;
}

export interface JwtPayload {
  sub: string;
}
