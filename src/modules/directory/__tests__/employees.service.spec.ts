import { Test, TestingModule } from '@nestjs/testing';
import {
  BUILTIN_FIELD_IDS,
  FieldSpec,
} from '../../contracts/field-registry.contract';
import { PermissionChecker } from '../../contracts/permission-checker.contract';
import { CustomFieldVisibilityService } from '../custom-field-visibility.service';
import { EmployeesService } from '../employees.service';
import { FieldRegistryService } from '../field-registry.service';

describe('EmployeesService', () => {
  let service: EmployeesService;

  const fieldRegistryService = {
    listFields: jest.fn(),
    queryEmployees: jest.fn(),
  };
  const visibility = {
    canViewFieldDefinition: jest.fn(),
    canViewFieldForSubject: jest.fn(),
  };
  const permissionChecker = {
    hasPermission: jest.fn(),
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

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeesService,
        { provide: FieldRegistryService, useValue: fieldRegistryService },
        { provide: CustomFieldVisibilityService, useValue: visibility },
        { provide: PermissionChecker, useValue: permissionChecker },
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
});
