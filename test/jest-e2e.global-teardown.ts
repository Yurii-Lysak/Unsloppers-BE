import 'dotenv/config';
import { dropSchemas } from './support/schema-provisioning';
import { testSchemaNames } from './support/test-schema';
import { assertMatrixCoverage } from './support/access-matrix';
import { getRecordedMatrixPairs } from './support/matrix-coverage-collector';

interface JestGlobalConfig {
  readonly maxWorkers?: number;
}

/**
 * Drops the per-worker schemas once the e2e suite finishes. Set
 * `TEA_KEEP_TEST_SCHEMAS=1` to leave them behind and inspect the data a failing
 * run left in place.
 */
export default async function teardownTestSchemas(
  globalConfig: JestGlobalConfig,
): Promise<void> {
  if (process.env.TEA_KEEP_TEST_SCHEMAS === '1') {
    return;
  }

  if (process.env.TEA_SKIP_MATRIX_COVERAGE_ASSERT !== '1') {
    assertMatrixCoverage(getRecordedMatrixPairs());
  }

  await dropSchemas(testSchemaNames(globalConfig.maxWorkers ?? 1));
}
