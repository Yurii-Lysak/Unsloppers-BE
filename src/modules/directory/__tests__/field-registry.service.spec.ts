import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../../../generated/prisma/client';
import { Clock } from '../../../clock/clock.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { FieldRegistryService } from '../field-registry.service';

describe('FieldRegistryService', () => {
  let service: FieldRegistryService;

  const clock = {
    now: jest.fn(() => new Date('2026-08-31T12:00:00.000Z')),
    nowMs: jest.fn(() => new Date('2026-08-31T12:00:00.000Z').getTime()),
  };

  const prisma = {
    customFieldDefinition: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    customFieldValue: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
    },
    employee: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const knownError = (code: string) =>
    new Prisma.PrismaClientKnownRequestError('error', {
      code,
      clientVersion: 'test',
    });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FieldRegistryService,
        { provide: PrismaService, useValue: prisma },
        { provide: Clock, useValue: clock },
      ],
    }).compile();

    service = module.get(FieldRegistryService);
  });

  describe('defineField', () => {
    it('creates a select field with options', async () => {
      prisma.customFieldDefinition.create.mockResolvedValue({
        id: 'field-1',
      });

      await expect(
        service.defineField('Preferred office', 'select', 'employee', [
          'Kyiv',
          'Lviv',
        ]),
      ).resolves.toBe('field-1');

      expect(prisma.customFieldDefinition.create).toHaveBeenCalledWith({
        data: {
          name: 'Preferred office',
          type: 'select',
          visibility: 'employee',
          options: ['Kyiv', 'Lviv'],
        },
      });
    });

    it('rejects select fields without options', async () => {
      await expect(
        service.defineField('Preferred office', 'select', 'employee', []),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects whitespace-only names', async () => {
      await expect(
        service.defineField('   ', 'text', 'management'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects options on non-select types', async () => {
      await expect(
        service.defineField('Notes', 'text', 'management', ['A']),
      ).rejects.toThrow(BadRequestException);
    });

    it('maps duplicate names to ConflictException', async () => {
      prisma.customFieldDefinition.create.mockRejectedValue(
        knownError('P2002'),
      );

      await expect(
        service.defineField('Duplicate', 'text', 'management'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('setValue', () => {
    it('upserts a typed value and clears sibling columns', async () => {
      prisma.customFieldDefinition.findUnique.mockResolvedValue({
        id: 'field-1',
        type: 'number',
        options: null,
      });
      prisma.employee.findUnique.mockResolvedValue({ id: 'employee-1' });
      prisma.customFieldValue.upsert.mockResolvedValue({});

      await service.setValue('employee-1', 'field-1', 42);

      expect(prisma.customFieldValue.upsert).toHaveBeenCalledTimes(1);
      const upsertCall = prisma.customFieldValue.upsert.mock
        .calls[0] as unknown as [
        {
          update: {
            valueText: string | null;
            valueNumber: Prisma.Decimal | null;
            valueDate: Date | null;
            valueBoolean: boolean | null;
            valueSelect: string | null;
          };
        },
      ];
      const { update } = upsertCall[0];
      expect(update.valueText).toBeNull();
      expect(update.valueNumber).toBeInstanceOf(Prisma.Decimal);
      expect(update.valueDate).toBeNull();
      expect(update.valueBoolean).toBeNull();
      expect(update.valueSelect).toBeNull();
    });

    it('rejects select values outside defined options', async () => {
      prisma.customFieldDefinition.findUnique.mockResolvedValue({
        id: 'field-1',
        type: 'select',
        options: ['Kyiv'],
      });
      prisma.employee.findUnique.mockResolvedValue({ id: 'employee-1' });

      await expect(
        service.setValue('employee-1', 'field-1', 'Lviv'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate multi_select entries', async () => {
      prisma.customFieldDefinition.findUnique.mockResolvedValue({
        id: 'field-1',
        type: 'multi_select',
        options: ['A', 'B'],
      });
      prisma.employee.findUnique.mockResolvedValue({ id: 'employee-1' });

      await expect(
        service.setValue('employee-1', 'field-1', ['A', 'A']),
      ).rejects.toThrow(BadRequestException);
    });

    it('deletes the row when value is null (lazy unset)', async () => {
      prisma.customFieldDefinition.findUnique.mockResolvedValue({
        id: 'field-1',
        type: 'text',
        options: null,
      });
      prisma.employee.findUnique.mockResolvedValue({ id: 'employee-1' });
      prisma.customFieldValue.deleteMany.mockResolvedValue({ count: 1 });

      await service.setValue('employee-1', 'field-1', null);

      expect(prisma.customFieldValue.deleteMany).toHaveBeenCalledWith({
        where: {
          employeeId: 'employee-1',
          fieldDefinitionId: 'field-1',
        },
      });
    });

    it('throws when the employee does not exist', async () => {
      prisma.customFieldDefinition.findUnique.mockResolvedValue({
        id: 'field-1',
        type: 'text',
        options: null,
      });
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        service.setValue('missing', 'field-1', 'hello'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('query', () => {
    it('returns an empty array when filter arrays are empty', async () => {
      await expect(service.query({ employeeIds: [] })).resolves.toEqual([]);
      expect(prisma.customFieldValue.findMany).not.toHaveBeenCalled();
    });

    it('returns null for corrupt multi_select storage', async () => {
      prisma.customFieldValue.findMany.mockResolvedValue([
        {
          employeeId: 'employee-1',
          fieldDefinitionId: 'field-multi',
          valueText: '{bad-json',
          valueNumber: null,
          valueDate: null,
          valueBoolean: null,
          valueSelect: null,
          fieldDefinition: { type: 'multi_select' },
        },
      ]);

      await expect(
        service.query({ employeeIds: ['employee-1'] }),
      ).resolves.toEqual([
        {
          employeeId: 'employee-1',
          fieldId: 'field-multi',
          value: null,
        },
      ]);
    });

    it('returns decoded values for mixed types', async () => {
      prisma.customFieldValue.findMany.mockResolvedValue([
        {
          employeeId: 'employee-1',
          fieldDefinitionId: 'field-text',
          valueText: 'note',
          valueNumber: null,
          valueDate: null,
          valueBoolean: null,
          valueSelect: null,
          fieldDefinition: { type: 'text' },
        },
        {
          employeeId: 'employee-1',
          fieldDefinitionId: 'field-multi',
          valueText: '["A","B"]',
          valueNumber: null,
          valueDate: null,
          valueBoolean: null,
          valueSelect: null,
          fieldDefinition: { type: 'multi_select' },
        },
      ]);

      await expect(
        service.query({ employeeIds: ['employee-1'] }),
      ).resolves.toEqual([
        {
          employeeId: 'employee-1',
          fieldId: 'field-text',
          value: 'note',
        },
        {
          employeeId: 'employee-1',
          fieldId: 'field-multi',
          value: ['A', 'B'],
        },
      ]);
    });
  });

  describe('listFields', () => {
    it('returns built-in fields plus custom definitions', async () => {
      prisma.customFieldDefinition.findMany.mockResolvedValue([
        {
          id: 'custom-1',
          name: 'Preferred office',
          type: 'select',
          visibility: 'employee',
          options: ['Kyiv'],
        },
      ]);

      const fields = await service.listFields();
      expect(fields.some((field) => field.id === 'name')).toBe(true);
      expect(fields.some((field) => field.id === 'custom-1')).toBe(true);
    });
  });

  describe('queryEmployees', () => {
    it('filters by derived years_with_company and paginates', async () => {
      prisma.customFieldDefinition.findMany.mockResolvedValue([]);
      prisma.employee.findMany.mockResolvedValue([
        {
          id: 'emp-long',
          user: { name: 'Long Tenure' },
          gradeHistory: [
            { value: 'Senior', effectiveFrom: new Date('2018-01-01') },
          ],
          positionHistory: [
            { value: 'Engineer', effectiveFrom: new Date('2018-01-01') },
          ],
          departmentHistory: [
            { value: 'Engineering', effectiveFrom: new Date('2018-01-01') },
          ],
          employmentTypeHistory: [
            { value: 'Full-time', effectiveFrom: new Date('2018-01-01') },
          ],
        },
        {
          id: 'emp-short',
          user: { name: 'Short Tenure' },
          gradeHistory: [
            { value: 'Junior', effectiveFrom: new Date('2025-01-01') },
          ],
          positionHistory: [
            { value: 'Engineer', effectiveFrom: new Date('2025-01-01') },
          ],
          departmentHistory: [
            { value: 'Engineering', effectiveFrom: new Date('2025-01-01') },
          ],
          employmentTypeHistory: [
            { value: 'Full-time', effectiveFrom: new Date('2025-01-01') },
          ],
        },
      ]);

      const result = await service.queryEmployees({
        page: 1,
        pageSize: 50,
        filters: [
          {
            fieldId: 'years_with_company',
            operator: 'gt',
            value: 7,
          },
        ],
      });

      expect(result.total).toBe(1);
      expect(result.rows[0]?.employeeId).toBe('emp-long');
    });

    it('rejects invalid pagination parameters', async () => {
      await expect(service.queryEmployees({ page: 0 })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.queryEmployees({ pageSize: 500 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects sorting by unknown fields', async () => {
      prisma.customFieldDefinition.findMany.mockResolvedValue([]);

      await expect(
        service.queryEmployees({ sort: 'unknown_field' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('filters by custom text field values', async () => {
      prisma.customFieldDefinition.findMany.mockResolvedValue([
        {
          id: 'custom-office',
          name: 'Office',
          type: 'text',
          visibility: 'employee',
          options: null,
        },
      ]);
      prisma.employee.findMany.mockResolvedValue([
        {
          id: 'emp-kyiv',
          user: { name: 'Kyiv Employee' },
          gradeHistory: [
            {
              value: 'Mid',
              effectiveFrom: new Date('2020-01-01'),
              effectiveTo: null,
            },
          ],
          positionHistory: [],
          departmentHistory: [],
          employmentTypeHistory: [],
        },
        {
          id: 'emp-lviv',
          user: { name: 'Lviv Employee' },
          gradeHistory: [
            {
              value: 'Mid',
              effectiveFrom: new Date('2020-01-01'),
              effectiveTo: null,
            },
          ],
          positionHistory: [],
          departmentHistory: [],
          employmentTypeHistory: [],
        },
      ]);
      prisma.customFieldValue.findMany.mockResolvedValue([
        {
          employeeId: 'emp-kyiv',
          fieldDefinitionId: 'custom-office',
          valueText: 'Kyiv',
          valueNumber: null,
          valueDate: null,
          valueBoolean: null,
          valueSelect: null,
          fieldDefinition: { type: 'text' },
        },
        {
          employeeId: 'emp-lviv',
          fieldDefinitionId: 'custom-office',
          valueText: 'Lviv',
          valueNumber: null,
          valueDate: null,
          valueBoolean: null,
          valueSelect: null,
          fieldDefinition: { type: 'text' },
        },
      ]);

      const result = await service.queryEmployees({
        page: 1,
        pageSize: 50,
        filters: [
          {
            fieldId: 'custom-office',
            operator: 'eq',
            value: 'Kyiv',
          },
        ],
      });

      expect(result.total).toBe(1);
      expect(result.rows[0]?.employeeId).toBe('emp-kyiv');
      expect(result.rows[0]?.cells['custom-office']).toBe('Kyiv');
    });

    it('sorts by custom text field values', async () => {
      prisma.customFieldDefinition.findMany.mockResolvedValue([
        {
          id: 'custom-office',
          name: 'Office',
          type: 'text',
          visibility: 'employee',
          options: null,
        },
      ]);
      prisma.employee.findMany.mockResolvedValue([
        {
          id: 'emp-b',
          user: { name: 'Bravo' },
          gradeHistory: [
            {
              value: 'Mid',
              effectiveFrom: new Date('2020-01-01'),
              effectiveTo: null,
            },
          ],
          positionHistory: [],
          departmentHistory: [],
          employmentTypeHistory: [],
        },
        {
          id: 'emp-a',
          user: { name: 'Alpha' },
          gradeHistory: [
            {
              value: 'Mid',
              effectiveFrom: new Date('2020-01-01'),
              effectiveTo: null,
            },
          ],
          positionHistory: [],
          departmentHistory: [],
          employmentTypeHistory: [],
        },
      ]);
      prisma.customFieldValue.findMany.mockResolvedValue([
        {
          employeeId: 'emp-b',
          fieldDefinitionId: 'custom-office',
          valueText: 'Lviv',
          valueNumber: null,
          valueDate: null,
          valueBoolean: null,
          valueSelect: null,
          fieldDefinition: { type: 'text' },
        },
        {
          employeeId: 'emp-a',
          fieldDefinitionId: 'custom-office',
          valueText: 'Kyiv',
          valueNumber: null,
          valueDate: null,
          valueBoolean: null,
          valueSelect: null,
          fieldDefinition: { type: 'text' },
        },
      ]);

      const result = await service.queryEmployees({
        page: 1,
        pageSize: 50,
        sort: 'custom-office',
        order: 'asc',
      });

      expect(result.rows.map((row) => row.employeeId)).toEqual(['emp-a', 'emp-b']);
    });

    it('uses the open history row and earliest tenure date across all rows', async () => {
      prisma.customFieldDefinition.findMany.mockResolvedValue([]);
      prisma.employee.findMany.mockResolvedValue([
        {
          id: 'emp-history',
          user: { name: 'History Subject' },
          gradeHistory: [
            {
              value: 'Junior',
              effectiveFrom: new Date('2015-01-01'),
              effectiveTo: new Date('2019-12-31'),
            },
            {
              value: 'Senior',
              effectiveFrom: new Date('2020-01-01'),
              effectiveTo: null,
            },
          ],
          positionHistory: [
            {
              value: 'Engineer',
              effectiveFrom: new Date('2020-01-01'),
              effectiveTo: null,
            },
          ],
          departmentHistory: [],
          employmentTypeHistory: [],
        },
      ]);

      const result = await service.queryEmployees({
        page: 1,
        pageSize: 50,
      });

      expect(result.rows[0]?.cells.grade).toBe('Senior');
      expect(result.rows[0]?.cells.years_with_company).toBeGreaterThanOrEqual(7);
    });
  });
});
