import { Test, TestingModule } from '@nestjs/testing';
import { RegistryModule } from '../registry.module';
import { ProviderRegistryService } from '../provider-registry.service';

describe('RegistryModule', () => {
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [RegistryModule],
    }).compile();
    await module.init();
  });

  afterAll(async () => {
    await module.close();
  });

  it('resolves ProviderRegistryService through the real module wiring (not a hand-built test module)', () => {
    expect(module.get(ProviderRegistryService)).toBeInstanceOf(
      ProviderRegistryService,
    );
  });

  it('bootstraps cleanly with zero decorated providers present', () => {
    const result = module
      .get(ProviderRegistryService)
      .get('section', 'anything');
    expect(result).toEqual({ status: 'unavailable' });
  });
});
