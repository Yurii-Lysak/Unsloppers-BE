import { Injectable } from '@nestjs/common';
import { PermissionChecker } from '../permission-checker.contract';

/** Wave-0 stub — security-relevant, deny-by-default. Never grants a permission. */
@Injectable()
export class PermissionCheckerStub extends PermissionChecker {
  hasPermission(): Promise<boolean> {
    return Promise.resolve(false);
  }

  getGrantedPermissions(): Promise<readonly string[]> {
    return Promise.resolve([]);
  }
}
