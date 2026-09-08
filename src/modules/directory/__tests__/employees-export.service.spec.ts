import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { AccessResolver } from '../../contracts/access-resolver.contract';
import { PermissionChecker } from '../../contracts/permission-checker.contract';
import { SectionAccessGate } from '../../contracts/section-access-gate.contract';
import { BUILTIN_FIELD_IDS } from '../../contracts/field-registry.contract';
import { CustomFieldsService } from '../custom-fields.service';
import { CustomFieldVisibilityService } from '../custom-field-visibility.service';
import { FieldRegistryService } from '../field-registry.service';
import { EmployeesService } from '../employees.service';

describe('EmployeesService export', () => {
  let service: EmployeesService;

  const prisma = {
    employee: {
      findUnique: jest.fn(),
    },
  };

  const fieldRegistryService = {
    listFields: jest.fn(),
    queryEmployees: jest.fn(),
  };

  const visibility = {
    canViewFieldDefinition: jest.fn(),
    canViewFieldForSubject: jest.fn(),
    canWriteFieldForSubject: jest.fn(),
  };

  const permissionChecker = {
    hasPermission: jest.fn(),
  };

  const accessResolver = {
    resolveAudience: jest.fn(),
  };

  const builtinFields = [
    {
      id: BUILTIN_FIELD_IDS.name,
      name: 'Name',
      type: 'text',
      source: 'builtin',
      sortable: true,
      filterable: true,
    },
    {
      id: BUILTIN_FIELD_IDS.grade,
      name: 'Grade',
      type: 'text',
      source: 'builtin',
      sortable: true,
      filterable: true,
      editable: true,
    },
  ];

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeesService,
        { provide: PrismaService, useValue: prisma },
        { provide: FieldRegistryService, useValue: fieldRegistryService },
        { provide: CustomFieldsService, useValue: {} },
        { provide: CustomFieldVisibilityService, useValue: visibility },
        { provide: PermissionChecker, useValue: permissionChecker },
        { provide: AccessResolver, useValue: accessResolver },
        { provide: SectionAccessGate, useValue: { requireSection: jest.fn() } },
      ],
    }).compile();

    service = module.get(EmployeesService);

    prisma.employee.findUnique.mockResolvedValue({ id: 'viewer-employee-id' });
    permissionChecker.hasPermission.mockResolvedValue(false);
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'Colleague',
      sections: { S4: 'none', S16: 'none' },
    });
    fieldRegistryService.listFields.mockResolvedValue(builtinFields);
    fieldRegistryService.queryEmployees.mockResolvedValue({
      rows: [
        {
          employeeId: 'employee-1',
          cells: {
            [BUILTIN_FIELD_IDS.name]: 'Alice',
            [BUILTIN_FIELD_IDS.grade]: '=Mid',
          },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 100,
    });
  });

  it('rejects unknown column ids', async () => {
    await expect(
      service.exportEmployees('viewer-user-id', {
        columns: ['unknown-field'],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('omits columns the viewer cannot see', async () => {
    const managementField = {
      id: 'custom-management',
      name: 'Management only',
      type: 'text',
      source: 'custom',
      sortable: true,
      filterable: true,
      visibility: 'management',
    };
    fieldRegistryService.listFields.mockResolvedValue([
      ...builtinFields,
      managementField,
    ]);
    visibility.canViewFieldDefinition.mockResolvedValue(false);

    const { buffer } = await service.exportEmployees('viewer-user-id', {
      columns: [BUILTIN_FIELD_IDS.name, managementField.id],
    });

    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    expect(sheet.columnCount).toBe(1);
    expect(sheet.getRow(1).getCell(1).value).toBe('Name');
    expect(sheet.getRow(1).getCell(2).value).toBeNull();
    expect(sheet.getRow(2).getCell(1).value).toBe('Alice');
  });

  it('rejects export when every requested column is invisible to the viewer', async () => {
    const managementField = {
      id: 'custom-management',
      name: 'Management only',
      type: 'text',
      source: 'custom',
      sortable: true,
      filterable: true,
      visibility: 'management',
    };
    fieldRegistryService.listFields.mockResolvedValue([
      ...builtinFields,
      managementField,
    ]);
    visibility.canViewFieldDefinition.mockResolvedValue(false);

    await expect(
      service.exportEmployees('viewer-user-id', {
        columns: [managementField.id],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('exports blank cells for per-row masked custom field values', async () => {
    const managementField = {
      id: 'custom-management',
      name: 'Management only',
      type: 'text',
      source: 'custom',
      sortable: true,
      filterable: true,
      visibility: 'management',
    };
    fieldRegistryService.listFields.mockResolvedValue([
      ...builtinFields,
      managementField,
    ]);
    visibility.canViewFieldDefinition.mockResolvedValue(true);
    visibility.canViewFieldForSubject.mockImplementation(
      (_viewerId: string, employeeId: string) =>
        Promise.resolve(employeeId === 'employee-1'),
    );
    fieldRegistryService.queryEmployees.mockResolvedValue({
      rows: [
        {
          employeeId: 'employee-1',
          cells: {
            [BUILTIN_FIELD_IDS.name]: 'Alice',
            [managementField.id]: 'visible-secret',
          },
        },
        {
          employeeId: 'employee-2',
          cells: {
            [BUILTIN_FIELD_IDS.name]: 'Bob',
            [managementField.id]: 'hidden-secret',
          },
        },
      ],
      total: 2,
      page: 1,
      pageSize: 100,
    });

    const { buffer } = await service.exportEmployees('viewer-user-id', {
      columns: [BUILTIN_FIELD_IDS.name, managementField.id],
    });

    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    expect(sheet.getRow(2).getCell(2).value).toBe('visible-secret');
    expect(sheet.getRow(3).getCell(2).value).toBe('');
  });

  it('drops hidden shared-view filters before exporting rows', async () => {
    const managementField = {
      id: 'custom-management',
      name: 'Management only',
      type: 'text',
      source: 'custom',
      sortable: true,
      filterable: true,
      visibility: 'management',
    };
    fieldRegistryService.listFields.mockResolvedValue([
      ...builtinFields,
      managementField,
    ]);
    visibility.canViewFieldDefinition.mockResolvedValue(false);

    await service.exportEmployees('viewer-user-id', {
      columns: [BUILTIN_FIELD_IDS.name],
      filters: [
        {
          fieldId: managementField.id,
          operator: 'eq',
          value: 'secret',
        },
      ],
    });

    expect(fieldRegistryService.queryEmployees).toHaveBeenCalledWith(
      expect.objectContaining({ filters: [] }),
    );
  });

  it('prefixes formula-like string values in exported cells', async () => {
    const { buffer } = await service.exportEmployees('viewer-user-id', {
      columns: [BUILTIN_FIELD_IDS.name, BUILTIN_FIELD_IDS.grade],
    });

    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    expect(sheet.getRow(2).getCell(2).value).toBe("'=Mid");
  });

  it('paginates through all list pages before building the workbook', async () => {
    fieldRegistryService.queryEmployees
      .mockResolvedValueOnce({
        rows: Array.from({ length: 100 }, (_, index) => ({
          employeeId: `employee-${index}`,
          cells: { [BUILTIN_FIELD_IDS.name]: `Name ${index}` },
        })),
        total: 150,
        page: 1,
        pageSize: 100,
      })
      .mockResolvedValueOnce({
        rows: Array.from({ length: 50 }, (_, index) => ({
          employeeId: `employee-${100 + index}`,
          cells: { [BUILTIN_FIELD_IDS.name]: `Name ${100 + index}` },
        })),
        total: 150,
        page: 2,
        pageSize: 100,
      });

    const { buffer } = await service.exportEmployees('viewer-user-id', {
      columns: [BUILTIN_FIELD_IDS.name],
    });

    expect(fieldRegistryService.queryEmployees).toHaveBeenCalledTimes(2);

    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    expect(sheet.rowCount).toBe(151);
    expect(sheet.getRow(2).getCell(1).value).toBe('Name 0');
    expect(sheet.getRow(151).getCell(1).value).toBe('Name 149');
  });
});
