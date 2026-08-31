import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FieldRegistry } from '../../contracts/field-registry.contract';
import { PermissionChecker } from '../../contracts/permission-checker.contract';
import { CustomFieldVisibilityService } from '../custom-field-visibility.service';
import { CustomFieldsService } from '../custom-fields.service';
import { FieldRegistryService } from '../field-registry.service';
import { MANAGE_CUSTOM_FIELDS_PERMISSION } from '../directory.constants';

describe('CustomFieldsService', () => {
  let service: CustomFieldsService;

  const fieldRegistry = {
    defineField: jest.fn(),
    setValue: jest.fn(),
    query: jest.fn(),
  };
  const fieldRegistryService = {
    listDefinitions: jest.fn(),
    getDefinition: jest.fn(),
    assertEmployeeExists: jest.fn(),
  };
  const visibility = {
    canViewFieldDefinition: jest.fn(),
    canViewFieldForSubject: jest.fn(),
    canWriteFieldForSubject: jest.fn(),
  };
  const permissionChecker = {
    hasPermission: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomFieldsService,
        { provide: FieldRegistry, useValue: fieldRegistry },
        { provide: FieldRegistryService, useValue: fieldRegistryService },
        { provide: CustomFieldVisibilityService, useValue: visibility },
        { provide: PermissionChecker, useValue: permissionChecker },
      ],
    }).compile();

    service = module.get(CustomFieldsService);
  });

  it('requires manage custom fields permission to create a definition', async () => {
    permissionChecker.hasPermission.mockResolvedValue(false);

    await expect(
      service.createDefinition('viewer-1', {
        name: 'Preferred office',
        type: 'select',
        visibility: 'employee',
        options: ['Kyiv'],
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('returns all definitions for permission holders', async () => {
    permissionChecker.hasPermission.mockResolvedValue(true);
    fieldRegistryService.listDefinitions.mockResolvedValue([
      {
        id: 'field-1',
        name: 'Performance flag',
        type: 'boolean',
        visibility: 'management',
        options: [],
      },
    ]);

    await expect(service.listDefinitions('viewer-1')).resolves.toHaveLength(1);
    expect(visibility.canViewFieldDefinition).not.toHaveBeenCalled();
  });

  it('filters management definitions from colleagues', async () => {
    permissionChecker.hasPermission.mockResolvedValue(false);
    fieldRegistryService.listDefinitions.mockResolvedValue([
      {
        id: 'field-1',
        name: 'Performance flag',
        type: 'boolean',
        visibility: 'management',
        options: [],
      },
      {
        id: 'field-2',
        name: 'Desk preference',
        type: 'text',
        visibility: 'colleague',
        options: [],
      },
    ]);
    visibility.canViewFieldDefinition.mockImplementation(
      (_viewerId: string, visibilityLevel: string) =>
        Promise.resolve(visibilityLevel === 'colleague'),
    );

    await expect(service.listDefinitions('viewer-1')).resolves.toEqual([
      expect.objectContaining({ id: 'field-2' }),
    ]);
  });

  it('creates a definition when permission is granted', async () => {
    permissionChecker.hasPermission.mockImplementation((_userId, key) =>
      Promise.resolve(key === MANAGE_CUSTOM_FIELDS_PERMISSION),
    );
    fieldRegistry.defineField.mockResolvedValue('field-1');
    fieldRegistryService.getDefinition.mockResolvedValue({
      id: 'field-1',
      name: 'Preferred office',
      type: 'select',
      visibility: 'employee',
      options: ['Kyiv'],
    });

    await expect(
      service.createDefinition('viewer-1', {
        name: 'Preferred office',
        type: 'select',
        visibility: 'employee',
        options: ['Kyiv'],
      }),
    ).resolves.toEqual(
      expect.objectContaining({ id: 'field-1', name: 'Preferred office' }),
    );
  });

  it('forbids getDefinition when the field is not visible', async () => {
    permissionChecker.hasPermission.mockResolvedValue(false);
    fieldRegistryService.getDefinition.mockResolvedValue({
      id: 'field-1',
      name: 'Performance flag',
      type: 'boolean',
      visibility: 'management',
      options: [],
    });
    visibility.canViewFieldDefinition.mockResolvedValue(false);

    await expect(service.getDefinition('viewer-1', 'field-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('forbids setValue without write permission', async () => {
    permissionChecker.hasPermission.mockResolvedValue(false);
    fieldRegistryService.getDefinition.mockResolvedValue({
      id: 'field-1',
      name: 'Desk preference',
      type: 'text',
      visibility: 'colleague',
      options: [],
    });
    visibility.canWriteFieldForSubject.mockResolvedValue(false);

    await expect(
      service.setValue('viewer-1', 'employee-1', 'field-1', { value: 'A' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('returns stored value after setValue', async () => {
    permissionChecker.hasPermission.mockResolvedValue(true);
    fieldRegistryService.getDefinition.mockResolvedValue({
      id: 'field-1',
      name: 'Score',
      type: 'number',
      visibility: 'management',
      options: [],
    });
    fieldRegistry.setValue.mockResolvedValue(undefined);
    fieldRegistry.query.mockResolvedValue([
      { employeeId: 'employee-1', fieldId: 'field-1', value: 42 },
    ]);

    await expect(
      service.setValue('viewer-1', 'employee-1', 'field-1', { value: 42 }),
    ).resolves.toEqual({
      employeeId: 'employee-1',
      fieldId: 'field-1',
      value: 42,
    });
  });

  it('requires value property on setValue', async () => {
    permissionChecker.hasPermission.mockResolvedValue(true);
    fieldRegistryService.getDefinition.mockResolvedValue({
      id: 'field-1',
      name: 'Score',
      type: 'number',
      visibility: 'management',
      options: [],
    });

    await expect(
      service.setValue('viewer-1', 'employee-1', 'field-1', {}),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns 404 path when employee is missing on value list', async () => {
    fieldRegistryService.assertEmployeeExists.mockRejectedValue(
      new NotFoundException('Employee "missing" not found'),
    );

    await expect(
      service.listValuesForEmployee('viewer-1', 'missing'),
    ).rejects.toThrow(NotFoundException);
  });

  it('filters management values from colleagues in listValuesForEmployee', async () => {
    permissionChecker.hasPermission.mockResolvedValue(false);
    fieldRegistryService.assertEmployeeExists.mockResolvedValue(undefined);
    fieldRegistryService.listDefinitions.mockResolvedValue([
      {
        id: 'field-1',
        name: 'Performance flag',
        type: 'boolean',
        visibility: 'management',
        options: [],
      },
      {
        id: 'field-2',
        name: 'Desk preference',
        type: 'text',
        visibility: 'colleague',
        options: [],
      },
    ]);
    visibility.canViewFieldForSubject.mockImplementation(
      (_viewerId: string, _employeeId: string, visibilityLevel: string) =>
        Promise.resolve(visibilityLevel === 'colleague'),
    );
    fieldRegistry.query.mockResolvedValue([
      { employeeId: 'employee-1', fieldId: 'field-2', value: 'Open plan' },
    ]);

    await expect(
      service.listValuesForEmployee('viewer-1', 'employee-1'),
    ).resolves.toEqual([
      { employeeId: 'employee-1', fieldId: 'field-2', value: 'Open plan' },
    ]);
  });
});
