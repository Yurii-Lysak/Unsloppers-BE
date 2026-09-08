import { Test, TestingModule } from '@nestjs/testing';
import { AccessResolver } from '../../contracts/access-resolver.contract';
import { SectionAccessGate } from '../../contracts/section-access-gate.contract';
import { PrismaService } from '../../../prisma/prisma.service';
import { ListCatalogAccessService } from '../list-catalog-access.service';

describe('ListCatalogAccessService', () => {
  let service: ListCatalogAccessService;

  const accessResolver = {
    resolveAudience: jest.fn(),
  };
  const sectionGate = {
    listGrantedSections: jest.fn(),
  };
  const prisma = {
    fullAccessGrant: { findFirst: jest.fn() },
    employee: { findFirst: jest.fn() },
    projectAssignment: { findFirst: jest.fn() },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.fullAccessGrant.findFirst.mockResolvedValue(null);
    sectionGate.listGrantedSections.mockImplementation((audience) =>
      Object.entries(audience.sections)
        .filter(([, grant]) => grant !== 'none')
        .map(([sectionId]) => sectionId),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListCatalogAccessService,
        { provide: AccessResolver, useValue: accessResolver },
        { provide: SectionAccessGate, useValue: sectionGate },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(ListCatalogAccessService);
  });

  it('returns all sections for full-access holders', async () => {
    prisma.fullAccessGrant.findFirst.mockResolvedValue({ id: 'grant-1' });

    const sections = await service.resolveCatalogSections('viewer-1');

    expect(sections.size).toBe(16);
    expect(accessResolver.resolveAudience).not.toHaveBeenCalled();
  });

  it('returns colleague whitelist sections plus Self S4 for viewers without elevated relationships', async () => {
    prisma.employee.findFirst.mockResolvedValue(null);
    prisma.projectAssignment.findFirst.mockResolvedValue(null);
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'Self',
      sections: {
        S1: 'R',
        S4: 'R',
        S10: 'R',
        S11: 'R',
        S16: 'R',
      },
    });

    const sections = await service.resolveCatalogSections('viewer-1');

    expect(sections).toEqual(new Set(['S1', 'S4', 'S10', 'S11', 'S16']));
    expect(accessResolver.resolveAudience).toHaveBeenCalledWith(
      'viewer-1',
      'viewer-1',
    );
  });

  it('unions representative audiences for elevated viewers', async () => {
    prisma.employee.findFirst
      .mockResolvedValueOnce({ id: 'report-1' })
      .mockResolvedValueOnce({ id: 'report-1' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'peer-1' });
    prisma.projectAssignment.findFirst.mockResolvedValue(null);
    accessResolver.resolveAudience
      .mockResolvedValueOnce({
        role: 'Self',
        sections: { S1: 'R', S4: 'R', S10: 'R', S11: 'R', S16: 'R' },
      })
      .mockResolvedValueOnce({
        role: 'ReportingLine',
        sections: { S1: 'R', S4: 'RW', S10: 'R', S11: 'R', S16: 'none' },
      })
      .mockResolvedValueOnce({
        role: 'Colleague',
        sections: { S1: 'R', S4: 'none', S10: 'R', S11: 'R', S16: 'none' },
      });

    const sections = await service.resolveCatalogSections('viewer-1');

    expect(sections).toEqual(new Set(['S1', 'S4', 'S10', 'S11', 'S16']));
    expect(accessResolver.resolveAudience).toHaveBeenCalledTimes(3);
  });
});
