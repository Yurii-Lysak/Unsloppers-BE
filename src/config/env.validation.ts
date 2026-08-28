import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3001),
  CORS_ORIGIN: Joi.string().uri().default('http://localhost:4200'),
  DATABASE_URL: Joi.string().required(),
  // Story 1.16 — TimeTracker external API (docs/api-external-openapi.json).
  // Base URL has a sane default (the documented dev server). The two API
  // keys are deliberately `.optional()` here, diverging from this file's
  // usual "required() otherwise" rule: they are consumed only by
  // `TimetrackerService`, itself only ever invoked from `prisma/seed.ts` —
  // never by the running app. Making them Joi-required would fail
  // `ConfigModule` validation (and therefore ALL app bootstrap: `start:dev`,
  // e2e/integration tests, any test importing `AppModule`) for every
  // developer who isn't actively seeding, since `.env.example` ships them
  // empty. `TimetrackerService` already enforces presence at the point of
  // actual use via `ConfigService.getOrThrow` (spec's own "Always" bullet),
  // which is the correct place for a seed-only credential to fail loudly.
  TIMETRACKER_BASE_URL: Joi.string()
    .uri()
    .default('https://tt-bootcamp.dev.altexsoft.dev/'),
  TIMETRACKER_ACCOUNTING_API_KEY: Joi.string().optional(),
  TIMETRACKER_TALENTS_API_KEY: Joi.string().optional(),
});
