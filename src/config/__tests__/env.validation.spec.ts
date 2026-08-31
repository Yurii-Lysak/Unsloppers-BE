import {
  envValidationSchema,
  MAX_SAFE_JWT_TTL_SECONDS,
} from '../env.validation';

const requiredConfig = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/app',
  JWT_SECRET: 'test-only-jwt-secret-at-least-32-characters',
};

describe('environment validation', () => {
  it('does not require the seed password for normal application startup', () => {
    const result = envValidationSchema.validate(requiredConfig);

    expect(result.error).toBeUndefined();
    expect(result.value).not.toHaveProperty('BOOTCAMP_INITIAL_PASSWORD');
  });

  it('accepts the largest safely convertible JWT lifetime', () => {
    const result = envValidationSchema.validate({
      ...requiredConfig,
      JWT_TTL_SECONDS: MAX_SAFE_JWT_TTL_SECONDS,
    });

    expect(result.error).toBeUndefined();
  });

  it.each([0, -1, 1.5, MAX_SAFE_JWT_TTL_SECONDS + 1])(
    'rejects unsafe JWT lifetime %p',
    (JWT_TTL_SECONDS) => {
      const result = envValidationSchema.validate({
        ...requiredConfig,
        JWT_TTL_SECONDS,
      });

      expect(result.error).toBeDefined();
    },
  );
});
