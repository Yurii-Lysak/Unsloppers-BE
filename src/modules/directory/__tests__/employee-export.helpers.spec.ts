import {
  buildExportFilename,
  dedupeColumnIds,
  formatExportCellValue,
  sanitizeSpreadsheetString,
} from '../employee-export.helpers';

describe('employee-export.helpers', () => {
  describe('dedupeColumnIds', () => {
    it('preserves first-seen order when deduplicating', () => {
      expect(
        dedupeColumnIds(['name', 'grade', 'name', 'grade', 'email']),
      ).toEqual(['name', 'grade', 'email']);
    });
  });

  describe('sanitizeSpreadsheetString', () => {
    it('prefixes formula-like strings', () => {
      expect(sanitizeSpreadsheetString('=1+1')).toBe("'=1+1");
      expect(sanitizeSpreadsheetString('+123')).toBe("'+123");
      expect(sanitizeSpreadsheetString('-value')).toBe("'-value");
      expect(sanitizeSpreadsheetString('@sum')).toBe("'@sum");
    });

    it('leaves safe strings unchanged', () => {
      expect(sanitizeSpreadsheetString('Engineer')).toBe('Engineer');
    });
  });

  describe('formatExportCellValue', () => {
    it('maps booleans to TRUE/FALSE', () => {
      expect(formatExportCellValue(true)).toBe('TRUE');
      expect(formatExportCellValue(false)).toBe('FALSE');
    });

    it('joins multi-select values and sanitizes each entry', () => {
      expect(formatExportCellValue(['A', '=B'])).toBe("A, '=B");
    });

    it('returns empty string for missing values', () => {
      expect(formatExportCellValue(undefined)).toBe('');
      expect(formatExportCellValue(null)).toBe('');
    });
  });

  describe('buildExportFilename', () => {
    it('uses UTC date in the filename', () => {
      expect(buildExportFilename(new Date('2026-09-08T15:30:00.000Z'))).toBe(
        'employees-export-2026-09-08.xlsx',
      );
    });
  });
});
