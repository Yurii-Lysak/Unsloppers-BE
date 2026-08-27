import { Injectable, Scope } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { ProviderRegistryService } from '../provider-registry.service';
import {
  RegisterProvider,
  REGISTER_PROVIDER_FAMILY,
} from '../register-provider.decorator';

@Injectable()
@RegisterProvider('section', 'S1')
class FakeSectionProviderS1 {
  getSection(): string {
    return 'S1 payload';
  }
}

@Injectable()
@RegisterProvider('field', 'S1')
class FakeFieldProviderS1 {
  getFilterableFields(): string[] {
    return ['field-a'];
  }
}

@Injectable()
@RegisterProvider('section', 'S6')
class FakeSectionProviderS6First {}

@Injectable()
@RegisterProvider('section', 'S6')
class FakeSectionProviderS6Second {}

@Injectable()
@RegisterProvider('section', 'S6')
class FakeSectionProviderS6Third {}

@Injectable()
@RegisterProvider('section', 'PAIR')
class FakeSectionProviderPairFirst {}

@Injectable()
@RegisterProvider('section', 'PAIR')
class FakeSectionProviderPairSecond {}

@Injectable()
class UndecoratedProvider {}

@Injectable()
@RegisterProvider('section', '')
class InvalidEmptyIdProvider {}

@Injectable({ scope: Scope.REQUEST })
@RegisterProvider('section', 'REQ-SCOPED')
class RequestScopedProvider {}

@Injectable()
@RegisterProvider('section', 'SUB-BASE')
class BaseProvider {}

@Injectable()
class SubclassProvider extends BaseProvider {}

describe('ProviderRegistryService', () => {
  describe('discovery and lookup', () => {
    let moduleRef: TestingModule;
    let service: ProviderRegistryService;

    beforeAll(async () => {
      moduleRef = await Test.createTestingModule({
        imports: [DiscoveryModule],
        providers: [
          ProviderRegistryService,
          FakeSectionProviderS1,
          FakeFieldProviderS1,
          UndecoratedProvider,
        ],
      }).compile();

      service = moduleRef.get(ProviderRegistryService);
      await moduleRef.init();
    });

    afterAll(async () => {
      await moduleRef.close();
    });

    it('discovers and indexes a decorated provider by (family, id)', () => {
      const result = service.get('section', 'S1');
      expect(result.status).toBe('available');
      if (result.status === 'available') {
        expect(result.provider).toBeInstanceOf(FakeSectionProviderS1);
      }
    });

    it('scopes (family, id) uniqueness per family — same id, different family, both resolve', () => {
      const sectionResult = service.get('section', 'S1');
      const fieldResult = service.get('field', 'S1');
      expect(sectionResult.status).toBe('available');
      expect(fieldResult.status).toBe('available');
      if (
        sectionResult.status === 'available' &&
        fieldResult.status === 'available'
      ) {
        expect(sectionResult.provider).toBeInstanceOf(FakeSectionProviderS1);
        expect(fieldResult.provider).toBeInstanceOf(FakeFieldProviderS1);
      }
    });

    it('returns {status: "unavailable"} for an id never registered, never undefined', () => {
      const result = service.get('section', 'never-registered');
      expect(result).toEqual({ status: 'unavailable' });
      expect(result).not.toBeUndefined();
    });

    it('excludes an undecorated provider from the index without throwing', () => {
      // UndecoratedProvider carries no @RegisterProvider metadata at all, so
      // bootstrap must skip it silently rather than throw — verified two
      // ways: no own metadata is reachable on it, and the module still
      // initialized and serves unrelated decorated providers correctly.
      expect(
        Reflect.getOwnMetadata(REGISTER_PROVIDER_FAMILY, UndecoratedProvider),
      ).toBeUndefined();
      expect(service.get('section', 'S1').status).toBe('available');
    });
  });

  describe('collision handling', () => {
    it('throws at bootstrap when exactly two providers share a (family, id)', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [DiscoveryModule],
        providers: [
          ProviderRegistryService,
          FakeSectionProviderPairFirst,
          FakeSectionProviderPairSecond,
        ],
      }).compile();

      await expect(moduleRef.init()).rejects.toThrow(
        /FakeSectionProviderPairFirst.*FakeSectionProviderPairSecond/s,
      );
    });

    it('throws at bootstrap, naming every colliding provider when 3+ share a (family, id)', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [DiscoveryModule],
        providers: [
          ProviderRegistryService,
          FakeSectionProviderS6First,
          FakeSectionProviderS6Second,
          FakeSectionProviderS6Third,
        ],
      }).compile();

      await expect(moduleRef.init()).rejects.toThrow(
        /FakeSectionProviderS6First.*FakeSectionProviderS6Second.*FakeSectionProviderS6Third/s,
      );

      // moduleRef never finished initializing, so close() would re-await
      // (and re-reject on) the same failed init promise — nothing to tear
      // down here.
    });
  });

  describe('invalid registrations fail loudly, never silently', () => {
    it('throws at bootstrap for an empty-string id instead of silently skipping', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [DiscoveryModule],
        providers: [ProviderRegistryService, InvalidEmptyIdProvider],
      }).compile();

      await expect(moduleRef.init()).rejects.toThrow(
        /InvalidEmptyIdProvider.*invalid \(family, id\) pair/s,
      );
    });

    it('throws at bootstrap for a REQUEST-scoped decorated provider instead of silently dropping it', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [DiscoveryModule],
        providers: [ProviderRegistryService, RequestScopedProvider],
      }).compile();

      await expect(moduleRef.init()).rejects.toThrow(
        /RequestScopedProvider.*not DEFAULT-scoped/s,
      );
    });
  });

  describe('metadata inheritance', () => {
    it('does not let an undecorated subclass inherit its parent (family, id) and falsely collide', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [DiscoveryModule],
        providers: [ProviderRegistryService, BaseProvider, SubclassProvider],
      }).compile();

      // Must NOT throw: if Reflect metadata inheritance leaked SubclassProvider
      // into 'SUB-BASE' too, this would be a (false) collision.
      await expect(moduleRef.init()).resolves.toBeDefined();

      const service = moduleRef.get(ProviderRegistryService);
      const result = service.get('section', 'SUB-BASE');
      expect(result.status).toBe('available');
      if (result.status === 'available') {
        expect(result.provider).toBeInstanceOf(BaseProvider);
        expect(result.provider).not.toBeInstanceOf(SubclassProvider);
      }

      await moduleRef.close();
    });
  });
});
