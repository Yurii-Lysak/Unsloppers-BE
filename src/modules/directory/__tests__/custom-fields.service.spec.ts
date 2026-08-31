import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FieldRegistry } from '../../contracts/field-registry.contract';
import { PermissionChecker } from '../../contracts/permission-checker.contract';
import { CustomFieldVisibilityService } from '../custom-field-visibility.service';
import { CustomFieldsService } from '../custom-fields.service';
import { FieldRegistryService } from '../field-registry.service';
import {
  MANAGE_CUSTOM_FIELDS_PERMISSION,
  PERMISSION_KEYS,
} from '../directory.constants';

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

  it('re-exports manage_custom_fields from the permission catalog', () => {
    expect(MANAGE_CUSTOM_FIELDS_PERMISSION).toBe(
      PERMISSION_KEYS.MANAGE_CUSTOM_FIELDS,
    );
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
});
