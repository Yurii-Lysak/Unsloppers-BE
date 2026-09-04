import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BUILTIN_FIELD_IDS,
  FieldSpec,
} from '../../contracts/field-registry.contract';
import { AccessResolver } from '../../contracts/access-resolver.contract';
import { PermissionChecker } from '../../contracts/permission-checker.contract';
import { SectionAccessGate } from '../../contracts/section-access-gate.contract';
import { PrismaService } from '../../../prisma/prisma.service';
import { CustomFieldsService } from '../custom-fields.service';
import { CustomFieldVisibilityService } from '../custom-field-visibility.service';
import { EmployeesService } from '../employees.service';
import { FieldRegistryService } from '../field-registry.service';

describe('EmployeesService', () => {
  let service: EmployeesService;

  const fieldRegistryService = {
    listFields: jest.fn(),
    queryEmployees: jest.fn(),
    assertEmployeeExists: jest.fn(),
    setBuiltinFieldValue: jest.fn(),
  };
  const visibility = {
    canViewFieldDefinition: jest.fn(),
    canViewFieldForSubject: jest.fn(),
    canWriteFieldForSubject: jest.fn(),
  };
  const permissionChecker = {
    hasPermission: jest.fn(),
  };
  const customFieldsService = {
    setValue: jest.fn(),
  };
  const accessResolver = {
    resolveAudience: jest.fn(),
  };
  const sectionGate = {
    requireSection: jest.fn(),
  };
  const prisma = {
    employee: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const builtinFields: FieldSpec[] = [
    {
      id: BUILTIN_FIELD_IDS.name,
      name: 'Name',
      type: 'text',
      source: 'builtin',
      sortable: true,
      filterable: true,
    },
    {
      id: BUILTIN_FIELD_IDS.years_with_company,
      name: 'Years with company',
      type: 'number',
      source: 'derived',
      sortable: true,
      filterable: true,
    },
  ];

  const managementCustomField: FieldSpec = {
    id: 'custom-mgmt',
    name: 'Performance flag',
    type: 'boolean',
    source: 'custom',
    sortable: true,
    filterable: true,
    visibility: 'management',
  };

  const colleagueCustomField: FieldSpec = {
    id: 'custom-colleague',
    name: 'Favorite team',
    type: 'text',
    source: 'custom',
    sortable: true,
    filterable: true,
    visibility: 'colleague',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.employee.findUnique.mockResolvedValue({ id: 'viewer-1' });
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'Colleague',
      sections: { S4: 'none', S16: 'none' },
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeesService,
        { provide: FieldRegistryService, useValue: fieldRegistryService },
        { provide: CustomFieldsService, useValue: customFieldsService },
        { provide: CustomFieldVisibilityService, useValue: visibility },
        { provide: PermissionChecker, useValue: permissionChecker },
        { provide: AccessResolver, useValue: accessResolver },
        { provide: SectionAccessGate, useValue: sectionGate },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(EmployeesService);
  });

  it('filters management custom fields from colleague catalog responses', async () => {
    fieldRegistryService.listFields.mockResolvedValue([
      ...builtinFields,
      managementCustomField,
    ]);
    permissionChecker.hasPermission.mockResolvedValue(false);
    visibility.canViewFieldDefinition.mockResolvedValue(false);
    fieldRegistryService.queryEmployees.mockResolvedValue({
      rows: [],
      total: 0,
      page: 1,
      pageSize: 50,
    });

    const result = await service.listEmployees('viewer-1', {});

    expect(result.fields.map((field) => field.id)).toEqual([
      BUILTIN_FIELD_IDS.name,
      BUILTIN_FIELD_IDS.years_with_company,
    ]);
    expect(fieldRegistryService.queryEmployees).toHaveBeenCalledWith(
      expect.objectContaining({
        visibleFieldIds: [
          BUILTIN_FIELD_IDS.name,
          BUILTIN_FIELD_IDS.years_with_company,
        ],
      }),
    );
  });

  it('includes colleague-visibility custom fields in colleague catalog responses (Story 1.10)', async () => {
    fieldRegistryService.listFields.mockResolvedValue([
      ...builtinFields,
      colleagueCustomField,
    ]);
    permissionChecker.hasPermission.mockResolvedValue(false);
    visibility.canViewFieldDefinition.mockResolvedValue(true);
    fieldRegistryService.queryEmployees.mockResolvedValue({
      rows: [],
      total: 0,
      page: 1,
      pageSize: 50,
    });

    const result = await service.listEmployees('viewer-1', {});

    expect(result.fields.map((field) => field.id)).toEqual([
      BUILTIN_FIELD_IDS.name,
      BUILTIN_FIELD_IDS.years_with_company,
      colleagueCustomField.id,
    ]);
    expect(fieldRegistryService.queryEmployees).toHaveBeenCalledWith(
      expect.objectContaining({
        visibleFieldIds: [
          BUILTIN_FIELD_IDS.name,
          BUILTIN_FIELD_IDS.years_with_company,
          colleagueCustomField.id,
        ],
      }),
    );
  });

  it('keeps colleague-visibility custom cells unmasked for a Colleague viewer (Story 1.10)', async () => {
    fieldRegistryService.listFields.mockResolvedValue([
      ...builtinFields,
      colleagueCustomField,
    ]);
    permissionChecker.hasPermission.mockResolvedValue(false);
    visibility.canViewFieldDefinition.mockResolvedValue(true);
    fieldRegistryService.queryEmployees.mockResolvedValue({
      rows: [
        {
          employeeId: 'emp-1',
          cells: {
            [BUILTIN_FIELD_IDS.name]: 'Alex',
            [colleagueCustomField.id]: 'Falcons',
          },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    });
    visibility.canViewFieldForSubject.mockResolvedValue(true);

    const result = await service.listEmployees('viewer-1', {});

    expect(result.rows[0]?.cells[colleagueCustomField.id]).toBe('Falcons');
    expect(result.rows[0]?.cells[BUILTIN_FIELD_IDS.name]).toBe('Alex');
  });

  it('passes tenure filter to the registry query engine', async () => {
    fieldRegistryService.listFields.mockResolvedValue(builtinFields);
    permissionChecker.hasPermission.mockResolvedValue(false);
    fieldRegistryService.queryEmployees.mockResolvedValue({
      rows: [{ employeeId: 'emp-1', cells: { years_with_company: 4 } }],
      total: 1,
      page: 1,
      pageSize: 50,
    });

    const result = await service.listEmployees('viewer-1', {
      filters: [
        {
          fieldId: BUILTIN_FIELD_IDS.years_with_company,
          operator: 'gt',
          value: 3,
        },
      ],
    });

    expect(fieldRegistryService.queryEmployees).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [
          {
            fieldId: BUILTIN_FIELD_IDS.years_with_company,
            operator: 'gt',
            value: 3,
          },
        ],
      }),
    );
    expect(result.rows).toHaveLength(1);
  });

  it('masks custom management cells when the viewer lacks subject access', async () => {
    fieldRegistryService.listFields.mockResolvedValue([
      ...builtinFields,
      managementCustomField,
    ]);
    permissionChecker.hasPermission.mockResolvedValue(false);
    visibility.canViewFieldDefinition.mockResolvedValue(true);
    fieldRegistryService.queryEmployees.mockResolvedValue({
      rows: [
        {
          employeeId: 'emp-1',
          cells: {
            [BUILTIN_FIELD_IDS.name]: 'Alex',
            [managementCustomField.id]: true,
          },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    });
    visibility.canViewFieldForSubject.mockResolvedValue(false);

    const result = await service.listEmployees('viewer-1', {});

    expect(result.rows[0]?.cells[managementCustomField.id]).toBeUndefined();
    expect(result.rows[0]?.cells[BUILTIN_FIELD_IDS.name]).toBe('Alex');
  });

  it('returns paginated totals from the registry query', async () => {
    fieldRegistryService.listFields.mockResolvedValue(builtinFields);
    permissionChecker.hasPermission.mockResolvedValue(false);
    fieldRegistryService.queryEmployees.mockResolvedValue({
      rows: Array.from({ length: 50 }, (_, index) => ({
        employeeId: `emp-${index}`,
        cells: {},
      })),
      total: 128,
      page: 2,
      pageSize: 50,
    });

    const result = await service.listEmployees('viewer-1', {
      page: 2,
      pageSize: 50,
    });

    expect(result.total).toBe(128);
    expect(result.page).toBe(2);
    expect(result.rows).toHaveLength(50);
  });

  it('getById returns a single employee summary', async () => {
    prisma.employee.findUnique.mockResolvedValue({
      id: 'emp-1',
      user: { name: 'Anton Savchenko', email: 'anton@example.com' },
    });

    await expect(service.getById('emp-1')).resolves.toEqual({
      id: 'emp-1',
      displayName: 'Anton Savchenko',
    });
  });

  it('getById rejects unknown employees', async () => {
    prisma.employee.findUnique.mockResolvedValue(null);

    await expect(service.getById('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('includes writableFieldIds when viewer has S4 RW over a subject row', async () => {
    const gradeField: FieldSpec = {
      id: BUILTIN_FIELD_IDS.grade,
      name: 'Grade',
      type: 'text',
      source: 'builtin',
      sortable: true,
      filterable: true,
      editable: true,
    };
    fieldRegistryService.listFields.mockResolvedValue([
      ...builtinFields,
      gradeField,
    ]);
    permissionChecker.hasPermission.mockResolvedValue(false);
    fieldRegistryService.queryEmployees.mockResolvedValue({
      rows: [
        {
          employeeId: 'report-1',
          cells: { [BUILTIN_FIELD_IDS.grade]: 'Mid' },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    });
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'ReportingLine',
      sections: { S4: 'RW', S16: 'none' },
    });

    const result = await service.listEmployees('viewer-1', {});

    expect(result.rows[0]?.writableFieldIds).toEqual([BUILTIN_FIELD_IDS.grade]);
  });

  it('updateEmployeeField writes built-in grade when S4 RW is granted', async () => {
    const gradeField: FieldSpec = {
      id: BUILTIN_FIELD_IDS.grade,
      name: 'Grade',
      type: 'text',
      source: 'builtin',
      sortable: true,
      filterable: true,
      editable: true,
    };
    fieldRegistryService.listFields.mockResolvedValue([gradeField]);
    fieldRegistryService.assertEmployeeExists.mockResolvedValue(undefined);
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'ReportingLine',
      sections: { S4: 'RW', S16: 'none' },
    });
    fieldRegistryService.setBuiltinFieldValue.mockResolvedValue(undefined);

    const result = await service.updateEmployeeField(
      'viewer-1',
      'report-1',
      BUILTIN_FIELD_IDS.grade,
      { value: 'Senior' },
    );

    expect(fieldRegistryService.setBuiltinFieldValue).toHaveBeenCalledWith(
      'report-1',
      BUILTIN_FIELD_IDS.grade,
      'Senior',
    );
    expect(result.value).toBe('Senior');
  });

  it('updateEmployeeField rejects writes when field is not writable for viewer', async () => {
    const gradeField: FieldSpec = {
      id: BUILTIN_FIELD_IDS.grade,
      name: 'Grade',
      type: 'text',
      source: 'builtin',
      sortable: true,
      filterable: true,
      editable: true,
    };
    fieldRegistryService.listFields.mockResolvedValue([gradeField]);
    fieldRegistryService.assertEmployeeExists.mockResolvedValue(undefined);
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'Colleague',
      sections: { S4: 'none', S16: 'none' },
    });

    await expect(
      service.updateEmployeeField(
        'viewer-1',
        'peer-1',
        BUILTIN_FIELD_IDS.grade,
        { value: 'Senior' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('updateEmployeeField writes custom field when S16 RW and visibility allow', async () => {
    const customField: FieldSpec = {
      id: 'custom-mgmt',
      name: 'Performance flag',
      type: 'text',
      source: 'custom',
      sortable: true,
      filterable: true,
      editable: true,
      visibility: 'management',
    };
    fieldRegistryService.listFields.mockResolvedValue([customField]);
    fieldRegistryService.assertEmployeeExists.mockResolvedValue(undefined);
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'ReportingLine',
      sections: { S4: 'none', S16: 'RW' },
    });
    visibility.canWriteFieldForSubject.mockResolvedValue(true);
    customFieldsService.setValue.mockResolvedValue({
      employeeId: 'report-1',
      fieldId: customField.id,
      value: 'Updated',
    });

    sectionGate.requireSection.mockResolvedValue({
      role: 'ReportingLine',
      sections: { S4: 'none', S16: 'RW' },
    });
    const result = await service.updateEmployeeField(
      'viewer-1',
      'report-1',
      customField.id,
      { value: 'Updated' },
    );

    expect(sectionGate.requireSection).toHaveBeenCalledWith(
      'viewer-1',
      'report-1',
      'S16',
      'RW',
    );

    expect(customFieldsService.setValue).toHaveBeenCalledWith(
      'viewer-1',
      'viewer-1',
      'report-1',
      customField.id,
      { value: 'Updated' },
    );
    expect(result.value).toBe('Updated');
  });

  it('updateEmployeeField rejects custom field writes when S16 visibility denies', async () => {
    const customField: FieldSpec = {
      id: 'custom-mgmt',
      name: 'Performance flag',
      type: 'text',
      source: 'custom',
      sortable: true,
      filterable: true,
      editable: true,
      visibility: 'management',
    };
    fieldRegistryService.listFields.mockResolvedValue([customField]);
    fieldRegistryService.assertEmployeeExists.mockResolvedValue(undefined);
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'Colleague',
      sections: { S4: 'none', S16: 'none' },
    });
    visibility.canWriteFieldForSubject.mockResolvedValue(false);

    await expect(
      service.updateEmployeeField(
        'viewer-1',
        'peer-1',
        customField.id,
        { value: 'Updated' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(customFieldsService.setValue).not.toHaveBeenCalled();
  });

  it('updateEmployeeField rejects writes to non-editable built-in department', async () => {
    const departmentField: FieldSpec = {
      id: BUILTIN_FIELD_IDS.department,
      name: 'Department',
      type: 'text',
      source: 'builtin',
      sortable: true,
      filterable: true,
    };
    fieldRegistryService.listFields.mockResolvedValue([departmentField]);
    fieldRegistryService.assertEmployeeExists.mockResolvedValue(undefined);
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'ReportingLine',
      sections: { S4: 'RW', S16: 'RW' },
    });

    await expect(
      service.updateEmployeeField(
        'viewer-1',
        'report-1',
        BUILTIN_FIELD_IDS.department,
        { value: 'Sales' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(fieldRegistryService.setBuiltinFieldValue).not.toHaveBeenCalled();
  });

  it('drops the entire filter set and flags filtersHidden when a filter targets a field the viewer cannot see (Story 3.4)', async () => {
    fieldRegistryService.listFields.mockResolvedValue([
      ...builtinFields,
      managementCustomField,
    ]);
    permissionChecker.hasPermission.mockResolvedValue(false);
    visibility.canViewFieldDefinition.mockResolvedValue(false);
    fieldRegistryService.queryEmployees.mockResolvedValue({
      rows: [],
      total: 0,
      page: 1,
      pageSize: 50,
    });

    const result = await service.listEmployees('viewer-1', {
      filters: [
        { fieldId: managementCustomField.id, operator: 'eq', value: true },
        { fieldId: BUILTIN_FIELD_IDS.name, operator: 'eq', value: 'Alex' },
      ],
    });

    expect(fieldRegistryService.queryEmployees).toHaveBeenCalledWith(
      expect.objectContaining({ filters: [] }),
    );
    expect(result.filtersHidden).toBe(true);
  });

  it('passes filters through unchanged and leaves filtersHidden unset when every filter is visible', async () => {
    fieldRegistryService.listFields.mockResolvedValue(builtinFields);
    permissionChecker.hasPermission.mockResolvedValue(false);
    fieldRegistryService.queryEmployees.mockResolvedValue({
      rows: [],
      total: 0,
      page: 1,
      pageSize: 50,
    });

    const filters = [
      { fieldId: BUILTIN_FIELD_IDS.name, operator: 'eq' as const, value: 'Alex' },
    ];
    const result = await service.listEmployees('viewer-1', { filters });

    expect(fieldRegistryService.queryEmployees).toHaveBeenCalledWith(
      expect.objectContaining({ filters }),
    );
    expect(result.filtersHidden).toBe(false);
  });

  it('lists lookup options with id and display name, sorted by name', async () => {
    prisma.employee.findMany.mockResolvedValue([
      { id: 'emp-2', user: { name: 'Zoe', email: 'zoe@example.com' } },
      { id: 'emp-1', user: { name: 'Alex', email: 'alex@example.com' } },
      { id: 'emp-3', user: { name: null, email: 'noname@example.com' } },
    ]);

    const result = await service.listLookupOptions();

    expect(result).toEqual([
      { employeeId: 'emp-1', name: 'Alex' },
      { employeeId: 'emp-3', name: 'noname@example.com' },
      { employeeId: 'emp-2', name: 'Zoe' },
    ]);
  });

  it('updateEmployeeField rejects empty built-in grade values', async () => {
    const gradeField: FieldSpec = {
      id: BUILTIN_FIELD_IDS.grade,
      name: 'Grade',
      type: 'text',
      source: 'builtin',
      sortable: true,
      filterable: true,
      editable: true,
    };
    fieldRegistryService.listFields.mockResolvedValue([gradeField]);
    fieldRegistryService.assertEmployeeExists.mockResolvedValue(undefined);
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'ReportingLine',
      sections: { S4: 'RW', S16: 'none' },
    });
    fieldRegistryService.setBuiltinFieldValue.mockRejectedValue(
      new BadRequestException('Expected a non-empty text value'),
    );

    await expect(
      service.updateEmployeeField(
        'viewer-1',
        'report-1',
        BUILTIN_FIELD_IDS.grade,
        { value: '' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
