import { BUILTIN_FIELD_IDS } from '../../contracts/field-registry.contract';
import {
  EXPORT_CELL_UNAVAILABLE,
  formatExportCellValue,
} from '../employee-export.helpers';

describe('employee-export.helpers', () => {
  it('renders unavailable CDS columns distinctly from empty cells', () => {
    expect(
      formatExportCellValue(undefined, BUILTIN_FIELD_IDS.last_assessment_date, [
        BUILTIN_FIELD_IDS.last_assessment_date,
      ]),
    ).toBe(EXPORT_CELL_UNAVAILABLE);
    expect(
      formatExportCellValue(null, BUILTIN_FIELD_IDS.last_assessment_date, []),
    ).toBe('');
  });

  it('formats boolean CDS values for spreadsheets', () => {
    expect(
      formatExportCellValue(true, BUILTIN_FIELD_IDS.has_open_idp, []),
    ).toBe('TRUE');
  });
});
