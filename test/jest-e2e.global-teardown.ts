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
 *
 * The drop runs in `finally` so a thrown coverage assertion (e.g. from a
 * filtered or partially-failing run) can never skip cleanup — a schema left
 * behind here previously poisoned an unrelated unit test that queries
 * `pg_indexes` without a schema filter (see `known-red-diagnosis.md`).
 */
export default async function teardownTestSchemas(
  globalConfig: JestGlobalConfig,
): Promise<void> {
  if (process.env.TEA_KEEP_TEST_SCHEMAS === '1') {
    return;
  }

  try {
    if (process.env.TEA_SKIP_MATRIX_COVERAGE_ASSERT !== '1') {
      assertMatrixCoverage(getRecordedMatrixPairs());
    }
  } finally {
    await dropSchemas(testSchemaNames(globalConfig.maxWorkers ?? 1));
  }
}
