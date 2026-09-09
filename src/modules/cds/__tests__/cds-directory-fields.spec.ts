import { Test, TestingModule } from '@nestjs/testing';
import { Clock } from '../../../clock/clock.service';
import { DepartmentDirectory } from '../../contracts/department-directory.contract';
import { PrismaService } from '../../../prisma/prisma.service';
import { BUILTIN_FIELD_IDS } from '../../contracts/field-registry.contract';
import { LastAssessmentDateFieldProvider } from '../last-assessment-date-field.provider';
import { OpenIdpFieldProvider } from '../open-idp-field.provider';
import { CdsService } from '../cds.service';

describe('CDS directory field providers', () => {
  let cdsService: CdsService;
  let lastAssessmentProvider: LastAssessmentDateFieldProvider;
  let openIdpProvider: OpenIdpFieldProvider;

  const prisma = {
    cDSAssessment: {
      groupBy: jest.fn(),
    },
    iDPRecord: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CdsService,
        LastAssessmentDateFieldProvider,
        OpenIdpFieldProvider,
        { provide: PrismaService, useValue: prisma },
        {
          provide: DepartmentDirectory,
          useValue: { getDepartmentByName: jest.fn() },
        },
        {
          provide: Clock,
          useValue: {
            now: jest.fn(() => new Date('2026-08-31T12:00:00.000Z')),
            nowMs: jest.fn(() =>
              new Date('2026-08-31T12:00:00.000Z').getTime(),
            ),
          },
        },
      ],
    }).compile();

    cdsService = module.get(CdsService);
    lastAssessmentProvider = module.get(LastAssessmentDateFieldProvider);
    openIdpProvider = module.get(OpenIdpFieldProvider);
  });

  it('returns the most recent assessment date per employee', async () => {
    prisma.cDSAssessment.groupBy.mockResolvedValue([
      {
        employeeId: 'emp-1',
        _max: { date: new Date('2026-03-15T00:00:00.000Z') },
      },
    ]);

    const dates = await cdsService.getLastAssessmentDates(['emp-1', 'emp-2']);
    expect(dates.get('emp-1')).toBe('2026-03-15');
    expect(dates.has('emp-2')).toBe(false);

    const values = await lastAssessmentProvider.queryValues(['emp-1', 'emp-2']);
    expect(values).toEqual([
      {
        employeeId: 'emp-1',
        fieldId: BUILTIN_FIELD_IDS.last_assessment_date,
        value: '2026-03-15',
      },
      {
        employeeId: 'emp-2',
        fieldId: BUILTIN_FIELD_IDS.last_assessment_date,
        value: null,
      },
    ]);
  });

  it('emits explicit false for employees without open IDPs', async () => {
    prisma.iDPRecord.findMany.mockResolvedValue([{ employeeId: 'emp-1' }]);

    const values = await openIdpProvider.queryValues(['emp-1', 'emp-2']);
    expect(values).toEqual([
      {
        employeeId: 'emp-1',
        fieldId: BUILTIN_FIELD_IDS.has_open_idp,
        value: true,
      },
      {
        employeeId: 'emp-2',
        fieldId: BUILTIN_FIELD_IDS.has_open_idp,
        value: false,
      },
    ]);
  });
});
