/**
 * Loads .env into every worker before any test module is imported.
 *
 * The application gets its configuration through `ConfigModule`, but the test
 * harness reads `DATABASE_URL` while wiring the schema-scoped client, which can
 * happen before Nest has read anything.
 */
import 'dotenv/config';
