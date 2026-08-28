import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3001),
  CORS_ORIGIN: Joi.string().uri().default('http://localhost:4200'),
  DATABASE_URL: Joi.string().required(),
  // Story 1.16 / Epic 13 — TimeTracker external API (docs/api-external-openapi.json).
  // Optional at bootstrap: used by `TimetrackerService` for leave/project sync (Epic 13),
  // not by the bundled bootcamp seed manifest (Aug 2026 pivot).
  TIMETRACKER_BASE_URL: Joi.string()
    .uri()
    .default('https://tt-bootcamp.dev.altexsoft.dev/'),
  TIMETRACKER_ACCOUNTING_API_KEY: Joi.string().optional(),
  TIMETRACKER_TALENTS_API_KEY: Joi.string().optional(),
});
