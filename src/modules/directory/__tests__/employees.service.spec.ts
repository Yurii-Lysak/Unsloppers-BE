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
import { EmployeeListLeavesReader } from '../../contracts/employee-list-leaves.contract';
import { PermissionChecker } from '../../contracts/permission-checker.contract';
import { ProjectAssignment } from '../../contracts/project-assignment.contract';
import { SectionAccessGate } from '../../contracts/section-access-gate.contract';
import { PrismaService } from '../../../prisma/prisma.service';
import { CustomFieldsService } from '../custom-fields.service';
import { CustomFieldVisibilityService } from '../custom-field-visibility.service';
import { EmployeesService } from '../employees.service';
import { FieldRegistryService } from '../field-registry.service';
import { ListCatalogAccessService } from '../list-catalog-access.service';

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
  const listCatalogAccess = {
    resolveCatalogSections: jest.fn(),
    resolveCatalogAccess: jest.fn(),
  };
  const projectAssignment = {
    listByEmployee: jest.fn(),
  };
  const leavesReader = {
    formatListCell: jest.fn(),
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
      sectionId: 'S1',
      sortable: true,
      filterable: true,
    },
    {
      id: BUILTIN_FIELD_IDS.years_with_company,
      name: 'Years with company',
      type: 'number',
      source: 'derived',
      sectionId: 'S4',
      sortable: true,
      filterable: true,
    },
  ];

  const colleagueCatalogSections = new Set([
    'S1',
    'S10',
    'S11',
    'S16',
  ] as const);

  const managerCatalogSections = new Set([
    'S1',
    'S4',
    'S10',
    'S11',
    'S16',
  ] as const);

  const managementCustomField: FieldSpec = {
    id: 'custom-mgmt',
    name: 'Performance flag',
    type: 'boolean',
    source: 'custom',
    sortable: true,
    filterable: true,
    visibility: 'management',
    sectionId: 'S16',
  };

  const colleagueCustomField: FieldSpec = {
    id: 'custom-colleague',
    name: 'Favorite team',
    type: 'text',
    source: 'custom',
    sortable: true,
    filterable: true,
    visibility: 'colleague',
    sectionId: 'S16',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.employee.findUnique.mockResolvedValue({ id: 'viewer-1' });
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'Colleague',
      sections: {
        S1: 'R',
        S4: 'none',
        S10: 'R',
        S11: 'R',
        S16: 'none',
      },
    });
    listCatalogAccess.resolveCatalogAccess.mockResolvedValue({
      sections: colleagueCatalogSections,
      elevated: false,
    });
    listCatalogAccess.resolveCatalogSections.mockResolvedValue(
      colleagueCatalogSections,
    );
    leavesReader.formatListCell.mockResolvedValue({
      value: '',
      unavailable: false,
    });
    projectAssignment.listByEmployee.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeesService,
        { provide: FieldRegistryService, useValue: fieldRegistryService },
        { provide: CustomFieldsService, useValue: customFieldsService },
        { provide: CustomFieldVisibilityService, useValue: visibility },
        { provide: PermissionChecker, useValue: permissionChecker },
        { provide: AccessResolver, useValue: accessResolver },
        { provide: SectionAccessGate, useValue: sectionGate },
        { provide: ListCatalogAccessService, useValue: listCatalogAccess },
        { provide: ProjectAssignment, useValue: projectAssignment },
        { provide: EmployeeListLeavesReader, useValue: leavesReader },
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
    ]);
    expect(fieldRegistryService.queryEmployees).toHaveBeenCalledWith(
      expect.objectContaining({
        visibleFieldIds: [BUILTIN_FIELD_IDS.name],
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
      colleagueCustomField.id,
    ]);
    expect(fieldRegistryService.queryEmployees).toHaveBeenCalledWith(
      expect.objectContaining({
        visibleFieldIds: [BUILTIN_FIELD_IDS.name, colleagueCustomField.id],
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
    listCatalogAccess.resolveCatalogAccess.mockResolvedValue({
      sections: managerCatalogSections,
      elevated: true,
    });
    listCatalogAccess.resolveCatalogSections.mockResolvedValue(
      managerCatalogSections,
    );
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
    listCatalogAccess.resolveCatalogAccess.mockResolvedValue({
      sections: managerCatalogSections,
      elevated: true,
    });
    listCatalogAccess.resolveCatalogSections.mockResolvedValue(
      managerCatalogSections,
    );
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
      sectionId: 'S4',
      sortable: true,
      filterable: true,
      editable: true,
    };
    listCatalogAccess.resolveCatalogAccess.mockResolvedValue({
      sections: managerCatalogSections,
      elevated: true,
    });
    listCatalogAccess.resolveCatalogSections.mockResolvedValue(
      managerCatalogSections,
    );
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
      sectionId: 'S4',
      sortable: true,
      filterable: true,
      editable: true,
    };
    listCatalogAccess.resolveCatalogAccess.mockResolvedValue({
      sections: managerCatalogSections,
      elevated: true,
    });
    listCatalogAccess.resolveCatalogSections.mockResolvedValue(
      managerCatalogSections,
    );
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
      sectionId: 'S4',
      sortable: true,
      filterable: true,
      editable: true,
    };
    listCatalogAccess.resolveCatalogAccess.mockResolvedValue({
      sections: managerCatalogSections,
      elevated: true,
    });
    listCatalogAccess.resolveCatalogSections.mockResolvedValue(
      managerCatalogSections,
    );
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
      sectionId: 'S16',
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
      sectionId: 'S16',
    };
    fieldRegistryService.listFields.mockResolvedValue([customField]);
    fieldRegistryService.assertEmployeeExists.mockResolvedValue(undefined);
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'Colleague',
      sections: { S4: 'none', S16: 'none' },
    });
    visibility.canWriteFieldForSubject.mockResolvedValue(false);

    await expect(
      service.updateEmployeeField('viewer-1', 'peer-1', customField.id, {
        value: 'Updated',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(customFieldsService.setValue).not.toHaveBeenCalled();
  });

  it('updateEmployeeField rejects writes to non-editable built-in department', async () => {
    const departmentField: FieldSpec = {
      id: BUILTIN_FIELD_IDS.department,
      name: 'Department',
      type: 'text',
      source: 'builtin',
      sectionId: 'S1',
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
    listCatalogAccess.resolveCatalogAccess.mockResolvedValue({
      sections: managerCatalogSections,
      elevated: true,
    });
    listCatalogAccess.resolveCatalogSections.mockResolvedValue(
      managerCatalogSections,
    );
    fieldRegistryService.listFields.mockResolvedValue(builtinFields);
    permissionChecker.hasPermission.mockResolvedValue(false);
    fieldRegistryService.queryEmployees.mockResolvedValue({
      rows: [],
      total: 0,
      page: 1,
      pageSize: 50,
    });

    const filters = [
      {
        fieldId: BUILTIN_FIELD_IDS.name,
        operator: 'eq' as const,
        value: 'Alex',
      },
    ];
    const result = await service.listEmployees('viewer-1', { filters });

    expect(fieldRegistryService.queryEmployees).toHaveBeenCalledWith(
      expect.objectContaining({ filters }),
    );
    expect(result.filtersHidden).toBe(false);
  });

  it('omits S4 built-in cells for colleague audience rows (Story 3.6)', async () => {
    const gradeField: FieldSpec = {
      id: BUILTIN_FIELD_IDS.grade,
      name: 'Grade',
      type: 'text',
      source: 'builtin',
      sectionId: 'S4',
      sortable: true,
      filterable: true,
      editable: true,
    };
    listCatalogAccess.resolveCatalogAccess.mockResolvedValue({
      sections: managerCatalogSections,
      elevated: true,
    });
    listCatalogAccess.resolveCatalogSections.mockResolvedValue(
      managerCatalogSections,
    );
    fieldRegistryService.listFields.mockResolvedValue([
      ...builtinFields,
      gradeField,
    ]);
    permissionChecker.hasPermission.mockResolvedValue(false);
    fieldRegistryService.queryEmployees.mockResolvedValue({
      rows: [
        {
          employeeId: 'report-1',
          cells: {
            [BUILTIN_FIELD_IDS.name]: 'Report',
            [BUILTIN_FIELD_IDS.grade]: 'Senior',
          },
        },
        {
          employeeId: 'peer-1',
          cells: {
            [BUILTIN_FIELD_IDS.name]: 'Peer',
            [BUILTIN_FIELD_IDS.grade]: 'Mid',
          },
        },
      ],
      total: 2,
      page: 1,
      pageSize: 50,
    });
    accessResolver.resolveAudience.mockImplementation(
      (_viewerId: string, subjectId: string) => {
        if (subjectId === 'report-1') {
          return Promise.resolve({
            role: 'ReportingLine',
            sections: {
              S1: 'R',
              S4: 'RW',
              S10: 'R',
              S11: 'R',
              S16: 'none',
            },
          });
        }
        return Promise.resolve({
          role: 'Colleague',
          sections: {
            S1: 'R',
            S4: 'none',
            S10: 'R',
            S11: 'R',
            S16: 'none',
          },
        });
      },
    );

    const result = await service.listEmployees('viewer-1', {});

    expect(result.rows[0]?.cells[BUILTIN_FIELD_IDS.grade]).toBe('Senior');
    expect(result.rows[1]?.cells[BUILTIN_FIELD_IDS.grade]).toBeUndefined();
  });

  it('shows Self-granted S4 fields on the viewer own row only (Story 3.6)', async () => {
    const employmentTypeField: FieldSpec = {
      id: BUILTIN_FIELD_IDS.employment_type,
      name: 'Employment type',
      type: 'text',
      source: 'builtin',
      sectionId: 'S4',
      sortable: true,
      filterable: true,
      editable: true,
    };
    listCatalogAccess.resolveCatalogAccess.mockResolvedValue({
      sections: new Set(['S1', 'S4', 'S10', 'S11', 'S16']),
      elevated: false,
    });
    listCatalogAccess.resolveCatalogSections.mockResolvedValue(
      new Set(['S1', 'S4', 'S10', 'S11', 'S16']),
    );
    fieldRegistryService.listFields.mockResolvedValue([
      builtinFields[0],
      employmentTypeField,
    ]);
    permissionChecker.hasPermission.mockResolvedValue(false);
    fieldRegistryService.queryEmployees.mockResolvedValue({
      rows: [
        {
          employeeId: 'viewer-1',
          cells: {
            [BUILTIN_FIELD_IDS.name]: 'Me',
            [BUILTIN_FIELD_IDS.employment_type]: 'Full-time',
          },
        },
        {
          employeeId: 'peer-1',
          cells: {
            [BUILTIN_FIELD_IDS.name]: 'Peer',
            [BUILTIN_FIELD_IDS.employment_type]: 'Contract',
          },
        },
      ],
      total: 2,
      page: 1,
      pageSize: 50,
    });
    accessResolver.resolveAudience.mockImplementation(
      (_viewerId: string, subjectId: string) => {
        if (subjectId === 'viewer-1') {
          return Promise.resolve({
            role: 'Self',
            sections: {
              S1: 'R',
              S4: 'R',
              S10: 'R',
              S11: 'R',
              S16: 'R',
            },
          });
        }
        return Promise.resolve({
          role: 'Colleague',
          sections: {
            S1: 'R',
            S4: 'none',
            S10: 'R',
            S11: 'R',
            S16: 'none',
          },
        });
      },
    );

    const result = await service.listEmployees('viewer-1', {});

    expect(result.rows[0]?.cells[BUILTIN_FIELD_IDS.employment_type]).toBe(
      'Full-time',
    );
    expect(
      result.rows[1]?.cells[BUILTIN_FIELD_IDS.employment_type],
    ).toBeUndefined();
    const employmentField = result.fields.find(
      (field) => field.id === BUILTIN_FIELD_IDS.employment_type,
    );
    expect(employmentField?.filterable).toBe(false);
    expect(employmentField?.sortable).toBe(false);
  });

  it('enriches S10 and S11 integrated list cells when visible (Story 3.6)', async () => {
    const integratedFields: FieldSpec[] = [
      {
        id: BUILTIN_FIELD_IDS.current_leave_dates,
        name: 'Current leave dates',
        type: 'text',
        source: 'derived',
        sectionId: 'S10',
        sortable: false,
        filterable: false,
      },
      {
        id: BUILTIN_FIELD_IDS.project_names,
        name: 'Project names',
        type: 'text',
        source: 'derived',
        sectionId: 'S11',
        sortable: false,
        filterable: false,
      },
    ];
    listCatalogAccess.resolveCatalogAccess.mockResolvedValue({
      sections: colleagueCatalogSections,
      elevated: false,
    });
    listCatalogAccess.resolveCatalogSections.mockResolvedValue(
      colleagueCatalogSections,
    );
    fieldRegistryService.listFields.mockResolvedValue([
      builtinFields[0],
      ...integratedFields,
    ]);
    permissionChecker.hasPermission.mockResolvedValue(false);
    fieldRegistryService.queryEmployees.mockResolvedValue({
      rows: [
        {
          employeeId: 'peer-1',
          cells: {
            [BUILTIN_FIELD_IDS.name]: 'Peer',
            [BUILTIN_FIELD_IDS.current_leave_dates]: null,
            [BUILTIN_FIELD_IDS.project_names]: null,
          },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    });
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'Colleague',
      sections: {
        S1: 'R',
        S4: 'none',
        S10: 'R',
        S11: 'R',
        S16: 'none',
      },
    });
    leavesReader.formatListCell.mockResolvedValue({
      value: '2026-09-01 – 2026-09-05',
      unavailable: false,
    });
    projectAssignment.listByEmployee.mockResolvedValue([
      {
        employeeId: 'peer-1',
        projectId: 'Project Alpha',
        pmId: 'pm-1',
        dmId: 'dm-1',
        startDate: '2026-01-01',
        endDate: null,
        confirmed: true,
        confirmedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const result = await service.listEmployees('viewer-1', {});

    expect(leavesReader.formatListCell).toHaveBeenCalledWith('peer-1', true);
    expect(result.rows[0]?.cells[BUILTIN_FIELD_IDS.current_leave_dates]).toBe(
      '2026-09-01 – 2026-09-05',
    );
    expect(result.rows[0]?.cells[BUILTIN_FIELD_IDS.project_names]).toBe(
      'Project Alpha',
    );
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
      sectionId: 'S4',
      sortable: true,
      filterable: true,
      editable: true,
    };
    listCatalogAccess.resolveCatalogAccess.mockResolvedValue({
      sections: managerCatalogSections,
      elevated: true,
    });
    listCatalogAccess.resolveCatalogSections.mockResolvedValue(
      managerCatalogSections,
    );
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
