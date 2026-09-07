/** Defaults mirror `env.validation.ts`; overridable via env at process start. */
export const LOGIN_THROTTLE_LIMIT = Number(
  process.env.THROTTLE_LOGIN_LIMIT ?? 100,
);
export const LOGIN_THROTTLE_TTL_MS = Number(
  process.env.THROTTLE_LOGIN_TTL_MS ?? 60_000,
);

export const SHARED_LINK_THROTTLE_LIMIT = Number(
  process.env.THROTTLE_SHARED_LINK_LIMIT ?? 30,
);
export const SHARED_LINK_THROTTLE_TTL_MS = Number(
  process.env.THROTTLE_SHARED_LINK_TTL_MS ?? 60_000,
);
