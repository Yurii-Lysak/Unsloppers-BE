import { Injectable } from '@nestjs/common';
import {
  AccessResolver,
  ResolvedAudience,
  SectionId,
} from '../access-resolver.contract';

const ALL_SECTIONS_DENIED: Record<SectionId, 'none'> = {
  S1: 'none',
  S2: 'none',
  S3: 'none',
  S4: 'none',
  S5: 'none',
  S6: 'none',
  S7: 'none',
  S8: 'none',
  S9: 'none',
  S10: 'none',
  S11: 'none',
  S12: 'none',
  S13: 'none',
  S14: 'none',
  S15: 'none',
  S16: 'none',
};

/**
 * Wave-0 stub — security-relevant, deny-by-default. Always resolves to the
 * Colleague role with every section denied; grants nothing. A real
 * implementation swaps in via DI with zero consumer-code change.
 */
@Injectable()
export class AccessResolverStub extends AccessResolver {
  resolveAudience(): Promise<ResolvedAudience> {
    return Promise.resolve({
      role: 'Colleague',
      sections: { ...ALL_SECTIONS_DENIED },
    });
  }
}
