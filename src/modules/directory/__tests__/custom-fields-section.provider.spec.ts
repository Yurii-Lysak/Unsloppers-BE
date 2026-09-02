import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AccessResolver,
  AccessRole,
} from '../../contracts/access-resolver.contract';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  FieldRegistry,
  FieldSpec,
  FieldVisibility,
} from '../../contracts/field-registry.contract';
import { CustomFieldVisibilityService } from '../custom-field-visibility.service';
import { CustomFieldsSectionProvider } from '../custom-fields-section.provider';

const field = (overrides: Partial<FieldSpec> = {}): FieldSpec => ({
  id: 'field-1',
  name: 'Field One',
  type: 'text',
  source: 'custom',
  sortable: true,
  filterable: true,
  visibility: 'management',
  ...overrides,
});

describe('CustomFieldsSectionProvider', () => {
  let provider: CustomFieldsSectionProvider;
  const fieldRegistry = {
    listFields: jest.fn(),
    query: jest.fn(),
  };
  const accessResolver = {
    resolveAudience: jest.fn(),
  };
  const prisma = {
    employee: { findFirst: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomFieldsSectionProvider,
        CustomFieldVisibilityService,
        { provide: FieldRegistry, useValue: fieldRegistry },
        { provide: AccessResolver, useValue: accessResolver },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    provider = module.get(CustomFieldsSectionProvider);
  });

  it('throws when S16 grant is none', async () => {
    await expect(
      provider.getSection('viewer', 'subject', {
        role: 'Colleague',
        sections: { S16: 'none' } as never,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('resolves audience when not supplied', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'Self',
      sections: { S16: 'R' },
    });
    fieldRegistry.listFields.mockResolvedValue([]);

    const result = await provider.getSection('viewer', 'subject');

    expect(accessResolver.resolveAudience).toHaveBeenCalledWith(
      'viewer',
      'subject',
    );
    expect(result).toEqual({ fields: [], values: {} });
  });

  it('calls resolveAudience only once when filtering multiple custom fields', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'Self',
      sections: { S16: 'R' },
    });
    fieldRegistry.listFields.mockResolvedValue([
      field({ id: 'f1', visibility: 'employee' }),
      field({ id: 'f2', visibility: 'employee' }),
      field({ id: 'f3', visibility: 'colleague' }),
    ]);
    fieldRegistry.query.mockResolvedValue([]);

    await provider.getSection('viewer', 'subject');

    expect(accessResolver.resolveAudience).toHaveBeenCalledTimes(1);
  });

  it('ignores builtin fields (no visibility tier) when assembling the section', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'PP',
      sections: { S16: 'RW' },
    });
    fieldRegistry.listFields.mockResolvedValue([
      {
        id: 'name',
        name: 'Name',
        type: 'text',
        source: 'builtin',
        sortable: true,
        filterable: true,
      },
      field({ id: 'custom-1', visibility: 'colleague' }),
    ]);
    fieldRegistry.query.mockResolvedValue([
      { employeeId: 'subject', fieldId: 'custom-1', value: 'x' },
    ]);

    const result = await provider.getSection('viewer', 'subject', {
      role: 'PP',
      sections: { S16: 'RW' } as never,
    });

    expect(result.fields).toEqual([
      { id: 'custom-1', name: 'Field One', type: 'text' },
    ]);
  });

  it('returns an empty section, never unavailable, when no custom field is visible (matrix row 5)', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'Colleague',
      sections: { S16: 'R' },
    });
    fieldRegistry.listFields.mockResolvedValue([
      field({ id: 'management-field', visibility: 'management' }),
    ]);

    const result = await provider.getSection('viewer', 'subject', {
      role: 'Colleague',
      sections: { S16: 'R' } as never,
    });

    expect(result).toEqual({ fields: [], values: {} });
    expect(fieldRegistry.query).not.toHaveBeenCalled();
  });

  it('omits a visible field from values when it has no stored row — lazy unset (matrix row 6)', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'PP',
      sections: { S16: 'RW' },
    });
    fieldRegistry.listFields.mockResolvedValue([
      field({
        id: 'unset-field',
        name: 'Unset field',
        visibility: 'management',
      }),
    ]);
    fieldRegistry.query.mockResolvedValue([]);

    const result = await provider.getSection('viewer', 'subject', {
      role: 'PP',
      sections: { S16: 'RW' } as never,
    });

    expect(result.fields).toEqual([
      { id: 'unset-field', name: 'Unset field', type: 'text' },
    ]);
    expect(result.values).toEqual({});
  });

  it('keeps a stored empty multi_select array in values (AD-6, distinct from never-set)', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'Self',
      sections: { S16: 'R' },
    });
    fieldRegistry.listFields.mockResolvedValue([
      field({
        id: 'multi-1',
        name: 'Preferred perks',
        type: 'multi_select',
        visibility: 'employee',
      }),
    ]);
    fieldRegistry.query.mockResolvedValue([
      { employeeId: 'subject', fieldId: 'multi-1', value: [] },
    ]);

    const result = await provider.getSection('viewer', 'subject', {
      role: 'Self',
      sections: { S16: 'R' } as never,
    });

    expect(result.values).toEqual({ 'multi-1': [] });
  });

  /**
   * Per-field filter matrix: management/employee/colleague visibility across
   * Self/ReportingLine/ProjectLine/PP/Colleague audiences. Drives the real
   * `CustomFieldVisibilityService.canViewFieldForSubject`, never a mock of it
   * — this is the boundary the story requires the provider to reuse unchanged.
   */
  describe.each<{ role: AccessRole; s16: 'R' | 'RW' }>([
    { role: 'Self', s16: 'R' },
    { role: 'ReportingLine', s16: 'RW' },
    { role: 'ProjectLine', s16: 'RW' },
    { role: 'PP', s16: 'RW' },
    { role: 'Colleague', s16: 'R' },
  ])('$role viewer', ({ role, s16 }) => {
    const expectedVisibility: Record<FieldVisibility, boolean> =
      role === 'Self'
        ? { management: false, employee: true, colleague: true }
        : role === 'Colleague'
          ? { management: false, employee: false, colleague: true }
          : { management: true, employee: true, colleague: true };

    it.each<[FieldVisibility, boolean]>([
      ['management', expectedVisibility.management],
      ['employee', expectedVisibility.employee],
      ['colleague', expectedVisibility.colleague],
    ])('visibility=%s -> visible=%s', async (visibility, visible) => {
      accessResolver.resolveAudience.mockResolvedValue({
        role,
        sections: { S16: s16 },
      });
      fieldRegistry.listFields.mockResolvedValue([field({ visibility })]);
      fieldRegistry.query.mockResolvedValue([
        { employeeId: 'subject', fieldId: 'field-1', value: 'stored value' },
      ]);

      const result = await provider.getSection('viewer', 'subject', {
        role,
        sections: { S16: s16 } as never,
      });

      if (visible) {
        expect(result.fields).toEqual([
          { id: 'field-1', name: 'Field One', type: 'text' },
        ]);
        expect(result.values).toEqual({ 'field-1': 'stored value' });
      } else {
        expect(result.fields).toEqual([]);
        expect(result.values).toEqual({});
        expect(fieldRegistry.query).not.toHaveBeenCalled();
      }
    });
  });
});
