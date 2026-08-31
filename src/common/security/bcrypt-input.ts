export const BCRYPT_MAX_INPUT_BYTES = 72;

export const isBcryptInputWithinLimit = (value: string): boolean =>
  Buffer.byteLength(value, 'utf8') <= BCRYPT_MAX_INPUT_BYTES;
