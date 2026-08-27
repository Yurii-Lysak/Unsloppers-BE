/**
 * dependency-cruiser config — enforces AD-1's module dependency direction.
 *
 * A feature module (anything under src/modules/<name>/, other than
 * `contracts` and `registry`) may depend only on `contracts` and `registry`.
 * It may never import another feature module directly. Separately,
 * `contracts` and `registry` themselves may never import any feature module
 * (Story 1.19 review resolution) — otherwise a Wave-0 stub could reintroduce
 * exactly the feature coupling this rule exists to prevent.
 *
 * See: _bmad-output/implementation-artifacts/spec-1-19-backend-substrate-contracts-and-provider-registry-modules.md
 * See: ARCHITECTURE-SPINE.md AD-1 / AD-2
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-cross-feature-module-imports',
      severity: 'error',
      comment:
        'A feature module may depend only on contracts and registry (AD-1). ' +
        'Direct feature-to-feature imports are forbidden — cross-module data ' +
        'needs go through a contracts-declared interface, consumed via the ' +
        'registry or direct DI token instead.',
      from: {
        path: '^src/modules/(?!contracts/|registry/)([^/]+)/',
      },
      to: {
        path: '^src/modules/(?!contracts/|registry/)([^/]+)/',
        pathNot: '^src/modules/$1/',
      },
    },
    {
      name: 'contracts-registry-no-feature-imports',
      severity: 'error',
      comment:
        'contracts and registry must never import any feature module (AD-2 / ' +
        'AD-3) — this closes the path for a Wave-0 stub to reintroduce ' +
        'feature-to-feature coupling through the back door.',
      from: {
        path: '^src/modules/(contracts|registry)/',
      },
      to: {
        path: '^src/modules/',
        pathNot: '^src/modules/(contracts|registry)/',
      },
    },
    {
      name: 'contracts-no-prisma-imports',
      severity: 'error',
      comment:
        'C1-C8 contracts (and their Wave-0 stubs) must have zero Prisma ' +
        'imports (AD-2) — this is an "Always" invariant of the substrate, ' +
        'not just a style preference at authoring time.',
      from: {
        path: '^src/modules/contracts/',
      },
      to: {
        path: '^src/(prisma/|generated/prisma/)',
      },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
