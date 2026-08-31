import * as Joi from 'joi';

export const MAX_SAFE_JWT_TTL_SECONDS = Math.floor(
  Number.MAX_SAFE_INTEGER / 1000,
);

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3001),
  CORS_ORIGIN: Joi.string().uri().default('http://localhost:4200'),
  DATABASE_URL: Joi.string().required(),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_TTL_SECONDS: Joi.number()
    .integer()
    .positive()
    .max(MAX_SAFE_JWT_TTL_SECONDS)
    .default(3600),
  BOOTCAMP_INITIAL_PASSWORD: Joi.string().min(8).optional(),
  // Story 1.16 / Epic 13 — TimeTracker external API (docs/api-external-openapi.json).
  // Optional at bootstrap: used by `TimetrackerService` for leave/project sync (Epic 13),
  // not by the bundled bootcamp seed manifest (Aug 2026 pivot).
  TIMETRACKER_BASE_URL: Joi.string()
    .uri()
    .default('https://tt-bootcamp.dev.altexsoft.dev/'),
  TIMETRACKER_ACCOUNTING_API_KEY: Joi.string().optional(),
  TIMETRACKER_TALENTS_API_KEY: Joi.string().optional(),
  // Story 1.3 — open `DepartmentHistory.value` treated as HR for PP HR-line walk.
  HR_DEPARTMENT_VALUE: Joi.string().default('HR'),
});
