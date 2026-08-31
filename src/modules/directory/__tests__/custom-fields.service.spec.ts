import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../../app.module';
import { PermissionCheckerService } from '../../access/permission-checker.service';
import { PermissionChecker } from '../../contracts/permission-checker.contract';
import { MANAGE_CUSTOM_FIELDS_PERMISSION, PERMISSION_KEYS } from '../directory.constants';

/**
 * Story 1.4 — directory is a C8 consumer (`manage_custom_fields`). Confirms the
 * real `PermissionCheckerService` is bound when `AccessModule` is loaded, not
 * the retired Wave-0 stub.
 */
describe('Directory C8 consumer wiring', () => {
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
  });

  afterAll(async () => {
    await module.close();
  });

  it('re-exports manage_custom_fields from the permission catalog', () => {
    expect(MANAGE_CUSTOM_FIELDS_PERMISSION).toBe(
      PERMISSION_KEYS.MANAGE_CUSTOM_FIELDS,
    );
  });

  it('resolves C8 to PermissionCheckerService for directory consumers', () => {
    const checker = module.get(PermissionChecker);
    expect(checker).toBeInstanceOf(PermissionCheckerService);
  });
});
