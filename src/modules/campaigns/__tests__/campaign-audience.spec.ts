import {
  normalizeAudienceDefinition,
  resolveAudienceIds,
} from '../campaign-audience';

describe('campaign-audience', () => {
  describe('resolveAudienceIds', () => {
    it('returns filter matches minus exclusions plus adds', () => {
      const result = resolveAudienceIds(['a', 'b', 'c'], {
        filters: [],
        addedEmployeeIds: ['d'],
        excludedEmployeeIds: ['b'],
      });

      expect(result).toEqual(['a', 'c', 'd']);
    });

    it('deduplicates when an added id also matches filters', () => {
      const result = resolveAudienceIds(['a', 'b'], {
        filters: [],
        addedEmployeeIds: ['a'],
        excludedEmployeeIds: [],
      });

      expect(result).toEqual(['a', 'b']);
    });
  });

  describe('normalizeAudienceDefinition', () => {
    it('drops ids present in both add and exclude lists', () => {
      const result = normalizeAudienceDefinition({
        filters: [],
        addedEmployeeIds: ['a', 'b'],
        excludedEmployeeIds: ['b'],
      });

      expect(result.addedEmployeeIds).toEqual(['a']);
      expect(result.excludedEmployeeIds).toEqual(['b']);
    });
  });
});
