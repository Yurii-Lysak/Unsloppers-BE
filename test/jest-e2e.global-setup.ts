// The app reads .env through ConfigModule, but setup runs before any app does.
import 'dotenv/config';
import { provisionSchemas } from './support/schema-provisioning';
import { testSchemaNames } from './support/test-schema';
import {
  resetDeniedCoverage,
  resetMatrixCoverage,
} from './support/matrix-coverage-collector';

interface JestGlobalConfig {
  readonly maxWorkers?: number;
}

/**
 * Creates and migrates one schema per Jest worker before the e2e suite starts.
 * Runs once in the main process, so it provisions for every worker id Jest is
 * going to hand out rather than for "this" worker.
 */
export default async function setupTestSchemas(
  globalConfig: JestGlobalConfig,
): Promise<void> {
  resetDeniedCoverage();
  resetMatrixCoverage();
  await provisionSchemas(testSchemaNames(globalConfig.maxWorkers ?? 1));
}
