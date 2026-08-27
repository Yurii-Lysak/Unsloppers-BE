/**
 * C8 — PermissionChecker
 *
 * The single enforcement point for functional-role feature gates
 * (`access-model.md` §2.2-2.3) — never conflated with section-visibility
 * checks (C1 AccessResolver) and never invoked from ProfileAssemblerService
 * or the registry layer. This is the other security-relevant contract in
 * this module (with C1) — a real implementation must never default to a
 * permissive grant, and neither may any stub standing in for it.
 *
 * Owner (real implementation): `access` module.
 */
export abstract class PermissionChecker {
  abstract hasPermission(
    userId: string,
    permissionKey: string,
  ): Promise<boolean>;
}
