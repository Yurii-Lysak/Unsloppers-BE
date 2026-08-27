import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../app.module';
import { HistoryTableWriteRejectedError } from '../extensions/temporal-history.extension';
import { PrismaService } from '../prisma.service';

/**
 * Story 1.20 — DI-audit: proves there is no second/unextended `PrismaClient`
 * reachable through Nest's DI container, and that the exported
 * `PrismaService` singleton keeps firing its lifecycle hooks (`onModuleInit`
 * connects, `onModuleDestroy` disconnects) once it's the temporal-history-
 * extended client rather than the raw `PrismaClient` subclass.
 *
 * Built against the full production `AppModule` graph (not a hand-picked
 * subset of modules) so this genuinely reflects what the app wires.
 */
describe('PrismaModule (DI audit + lifecycle)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('the PrismaService token resolves to the extended client everywhere it is injected', () => {
    const fromModuleRef = moduleRef.get(PrismaService);
    const fromApp = app.get(PrismaService);
    // @Global() singleton: every resolution path must yield the identical
    // instance — there is no separate, unextended client hiding behind a
    // different provider/token.
    expect(fromApp).toBe(fromModuleRef);
  });

  it('the resolved PrismaService enforces the extension (proves it is NOT a bare PrismaClient)', async () => {
    const prisma = app.get(PrismaService);

    await expect(
      (
        prisma as unknown as Record<
          string,
          { update: (a: unknown) => Promise<unknown> }
        >
      ).gradeHistory.update({
        where: { id: 'does-not-matter' },
        data: { value: 'x' },
      }),
    ).rejects.toThrow(HistoryTableWriteRejectedError);
  });

  // The two tests below spy directly on `PrismaService.prototype.onModuleInit`
  // / `onModuleDestroy` rather than inferring firing from query success or
  // `close()` resolving — Prisma's driver adapter connects lazily on first
  // query regardless of whether any lifecycle hook ever ran, so the previous
  // "a query succeeds" / "close() resolves" assertions passed even with the
  // `prisma.module.ts` reattachment deleted entirely (confirmed empirically
  // by the verification-gap reviewer). Each spy is installed BEFORE its own
  // fresh `TestingModule` is compiled, so it's in place before
  // `PrismaModule`'s factory does `raw.onModuleInit.bind(raw)` — the bound
  // function still calls through to this exact spy no matter which object
  // (`raw` or the reattached extended client) Nest ultimately invokes it on.

  it('onModuleInit is invoked via the reattached hook when the app initializes', async () => {
    const onModuleInitSpy = jest.spyOn(PrismaService.prototype, 'onModuleInit');

    const isolatedModuleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const isolatedApp = isolatedModuleRef.createNestApplication();

    expect(onModuleInitSpy).not.toHaveBeenCalled();
    await isolatedApp.init();
    expect(onModuleInitSpy).toHaveBeenCalled();

    await isolatedApp.close();
    onModuleInitSpy.mockRestore();
  });

  it('onModuleDestroy is invoked via the reattached hook when the app shuts down', async () => {
    const onModuleDestroySpy = jest.spyOn(
      PrismaService.prototype,
      'onModuleDestroy',
    );

    const isolatedModuleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const isolatedApp = isolatedModuleRef.createNestApplication();
    await isolatedApp.init();

    expect(onModuleDestroySpy).not.toHaveBeenCalled();
    await isolatedApp.close();
    expect(onModuleDestroySpy).toHaveBeenCalled();

    onModuleDestroySpy.mockRestore();
  });
});
