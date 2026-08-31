/**
 * Loads .env into every worker before any test module is imported.
 *
 * The application gets its configuration through `ConfigModule`, but the test
 * harness reads `DATABASE_URL` while wiring the schema-scoped client, which can
 * happen before Nest has read anything.
 */
import 'dotenv/config';

process.env.JWT_SECRET ??= 'test-only-jwt-secret-that-is-at-least-32-chars';
process.env.JWT_TTL_SECONDS ??= '3600';
