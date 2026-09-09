import { hash } from 'bcryptjs';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { BUILTIN_FIELD_IDS } from '../src/modules/contracts/field-registry.contract';
import { createTestApp, TestApp } from './support/app-harness';
import { FixedClock } from './support/fixed-clock';

const PASSWORD = 'test-only-employees-cds-filters-password';

interface EmployeeListRow {
  employeeId: string;
  cells: Record<string, string | number | boolean | string[] | null>;
}

interface EmployeeListResponse {
  total: number;
  rows: EmployeeListRow[];
  fieldsUnavailable?: string[];
}

interface EmployeeUser {
  readonly userId: string;
  readonly employeeId: string;
  readonly email: string;
}

async function createEmployeeUser(
  testApp: TestApp,
  email: string,
  name: string,
  tenureStart: string,
  grade = 'Mid',
  department = 'Engineering',
): Promise<EmployeeUser> {
  const user = await testApp.prisma.user.create({
    data: {
      email,
      name,
      passwordHash: await hash(PASSWORD, 12),
    },
  });
  const employee = await testApp.prisma.employee.create({
    data: { id: user.id, userId: user.id },
  });

  const effectiveFrom = new Date(`${tenureStart}T00:00:00.000Z`);
  await testApp.prisma.gradeHistory.create({
    data: { employeeId: employee.id, value: grade, effectiveFrom },
  });
  await testApp.prisma.positionHistory.create({
    data: { employeeId: employee.id, value: 'Engineer', effectiveFrom },
  });
  await testApp.prisma.departmentHistory.create({
    data: { employeeId: employee.id, value: department, effectiveFrom },
  });
  await testApp.prisma.employmentTypeHistory.create({
    data: {
      employeeId: employee.id,
      value: 'Full-time',
      effectiveFrom,
    },
  });

  return { userId: user.id, employeeId: employee.id, email };
}

async function createDirectReport(
  testApp: TestApp,
  manager: EmployeeUser,
  email: string,
  name: string,
  department = 'Engineering',
): Promise<EmployeeUser> {
  const reportUser = await testApp.prisma.user.create({
    data: {
      email,
      name,
      passwordHash: await hash(PASSWORD, 12),
    },
  });
  const report = await testApp.prisma.employee.create({
    data: {
      id: reportUser.id,
      userId: reportUser.id,
      managerId: manager.employeeId,
    },
  });
  const effectiveFrom = new Date('2020-01-01T00:00:00.000Z');
  await testApp.prisma.gradeHistory.create({
    data: { employeeId: report.id, value: 'Mid', effectiveFrom },
  });
  await testApp.prisma.positionHistory.create({
    data: { employeeId: report.id, value: 'Engineer', effectiveFrom },
  });
  await testApp.prisma.departmentHistory.create({
    data: { employeeId: report.id, value: department, effectiveFrom },
  });
  await testApp.prisma.employmentTypeHistory.create({
    data: {
      employeeId: report.id,
      value: 'Full-time',
      effectiveFrom,
    },
  });
  return { userId: reportUser.id, employeeId: report.id, email };
}

async function exportRequest(
  agent: ReturnType<typeof request.agent>,
  query: Record<string, string>,
) {
  return agent
    .get('/api/v1/employees/export')
    .query(query)
    .buffer(true)
    .parse((response, callback) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => callback(null, Buffer.concat(chunks)));
    });
}

async function readWorksheet(body: unknown): Promise<ExcelJS.Worksheet> {
  const buffer = Buffer.isBuffer(body)
    ? body
    : Buffer.from(body as WithImplicitCoercion<ArrayBuffer>);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook.worksheets[0];
}

async function loginAs(
  testApp: TestApp,
  email: string,
): Promise<ReturnType<typeof request.agent>> {
  const agent = request.agent(testApp.server);
  await agent
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  return agent;
}

async function seedAssessment(
  testApp: TestApp,
  employeeId: string,
  date: string,
): Promise<void> {
  await testApp.prisma.cDSAssessment.create({
    data: {
      employeeId,
      date: new Date(`${date}T00:00:00.000Z`),
      assessor: 'E2E Assessor',
      resultLink: 'https://example.com/assessment',
      conclusion: 'Assessment complete',
    },
  });
}

async function seedOpenIdp(
  testApp: TestApp,
  employeeId: string,
): Promise<void> {
  await testApp.prisma.iDPRecord.create({
    data: {
      employeeId,
      description: 'Open development plan',
      deadline: new Date('2026-12-31T00:00:00.000Z'),
      fileUrl: 'https://example.com/idp',
    },
  });
}

describe('Employees list CDS filters (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({
      clock: new FixedClock(new Date('2026-08-31T12:00:00.000Z')),
    });
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await testApp.resetDatabase();
  });

  it('filters last_assessment_date is_empty for never-assessed employees', async () => {
    const viewer = await createEmployeeUser(
      testApp,
      'cds-never-viewer@example.com',
      'Viewer',
      '2020-01-01',
    );
    await testApp.prisma.fullAccessGrant.create({
      data: { employeeId: viewer.employeeId },
    });
    await seedAssessment(testApp, viewer.employeeId, '2026-01-01');
    const assessed = await createEmployeeUser(
      testApp,
      'cds-assessed@example.com',
      'Assessed',
      '2020-01-01',
    );
    const never = await createEmployeeUser(
      testApp,
      'cds-never@example.com',
      'Never',
      '2020-01-01',
    );
    await seedAssessment(testApp, assessed.employeeId, '2026-03-15');

    const agent = await loginAs(testApp, viewer.email);
    const filters = JSON.stringify([
      {
        fieldId: BUILTIN_FIELD_IDS.last_assessment_date,
        operator: 'is_empty',
        value: null,
      },
    ]);
    const res = await agent
      .get('/api/v1/employees')
      .query({ filters, sort: BUILTIN_FIELD_IDS.name, order: 'asc' })
      .expect(200);

    const body = res.body as EmployeeListResponse;
    expect(body.total).toBe(1);
    expect(body.rows[0]?.employeeId).toBe(never.employeeId);
  });

  it('filters last_assessment_date between an inclusive date range', async () => {
    const viewer = await createEmployeeUser(
      testApp,
      'cds-between-viewer@example.com',
      'Viewer',
      '2020-01-01',
    );
    await testApp.prisma.fullAccessGrant.create({
      data: { employeeId: viewer.employeeId },
    });
    const inRange = await createEmployeeUser(
      testApp,
      'cds-in-range@example.com',
      'In Range',
      '2020-01-01',
    );
    const outOfRange = await createEmployeeUser(
      testApp,
      'cds-out-range@example.com',
      'Out of Range',
      '2020-01-01',
    );
    await seedAssessment(testApp, inRange.employeeId, '2026-03-15');
    await seedAssessment(testApp, outOfRange.employeeId, '2025-01-01');

    const agent = await loginAs(testApp, viewer.email);
    const filters = JSON.stringify([
      {
        fieldId: BUILTIN_FIELD_IDS.last_assessment_date,
        operator: 'between',
        value: ['2026-01-01', '2026-06-30'],
      },
    ]);
    const res = await agent
      .get('/api/v1/employees')
      .query({ filters, sort: BUILTIN_FIELD_IDS.name, order: 'asc' })
      .expect(200);

    const body = res.body as EmployeeListResponse;
    expect(body.total).toBe(1);
    expect(body.rows[0]?.employeeId).toBe(inRange.employeeId);
  });

  it('filters has_open_idp eq true', async () => {
    const viewer = await createEmployeeUser(
      testApp,
      'cds-idp-viewer@example.com',
      'Viewer',
      '2020-01-01',
    );
    await testApp.prisma.fullAccessGrant.create({
      data: { employeeId: viewer.employeeId },
    });
    const withOpenIdp = await createEmployeeUser(
      testApp,
      'cds-open-idp@example.com',
      'Open IDP',
      '2020-01-01',
    );
    await createEmployeeUser(
      testApp,
      'cds-no-idp@example.com',
      'No IDP',
      '2020-01-01',
    );
    await seedOpenIdp(testApp, withOpenIdp.employeeId);

    const agent = await loginAs(testApp, viewer.email);
    const filters = JSON.stringify([
      {
        fieldId: BUILTIN_FIELD_IDS.has_open_idp,
        operator: 'eq',
        value: true,
      },
    ]);
    const res = await agent
      .get('/api/v1/employees')
      .query({ filters, sort: BUILTIN_FIELD_IDS.name, order: 'asc' })
      .expect(200);

    const body = res.body as EmployeeListResponse;
    expect(body.total).toBe(1);
    expect(body.rows[0]?.employeeId).toBe(withOpenIdp.employeeId);
    expect(body.rows[0]?.cells[BUILTIN_FIELD_IDS.has_open_idp]).toBe(true);
  });

  it('scopes CDS filters to S12-visible employees only', async () => {
    const manager = await createEmployeeUser(
      testApp,
      'cds-manager-scope@example.com',
      'Manager',
      '2020-01-01',
    );
    const report = await createDirectReport(
      testApp,
      manager,
      'cds-report-scope@example.com',
      'Report',
    );
    const peer = await createEmployeeUser(
      testApp,
      'cds-peer-scope@example.com',
      'Peer',
      '2020-01-01',
    );
    await seedOpenIdp(testApp, report.employeeId);
    await seedOpenIdp(testApp, peer.employeeId);

    const agent = await loginAs(testApp, manager.email);
    const filters = JSON.stringify([
      {
        fieldId: BUILTIN_FIELD_IDS.has_open_idp,
        operator: 'eq',
        value: true,
      },
    ]);
    const res = await agent
      .get('/api/v1/employees')
      .query({ filters, sort: BUILTIN_FIELD_IDS.name, order: 'asc' })
      .expect(200);

    const body = res.body as EmployeeListResponse;
    expect(body.total).toBe(1);
    expect(body.rows[0]?.employeeId).toBe(report.employeeId);
  });

  it('returns zero rows when a colleague applies a CDS filter via API', async () => {
    const colleague = await createEmployeeUser(
      testApp,
      'cds-colleague@example.com',
      'Colleague',
      '2020-01-01',
    );
    await createEmployeeUser(
      testApp,
      'cds-colleague-peer@example.com',
      'Peer',
      '2020-01-01',
    );
    await seedOpenIdp(testApp, colleague.employeeId);

    const agent = await loginAs(testApp, colleague.email);
    const filters = JSON.stringify([
      {
        fieldId: BUILTIN_FIELD_IDS.has_open_idp,
        operator: 'eq',
        value: true,
      },
    ]);
    const res = await agent
      .get('/api/v1/employees')
      .query({ filters })
      .expect(200);

    const body = res.body as EmployeeListResponse;
    expect(body.total).toBe(0);
    expect(body.rows).toEqual([]);
  });

  it('rejects malformed between and is_empty filters with 400', async () => {
    const viewer = await createEmployeeUser(
      testApp,
      'cds-malformed-viewer@example.com',
      'Viewer',
      '2020-01-01',
    );
    await testApp.prisma.fullAccessGrant.create({
      data: { employeeId: viewer.employeeId },
    });
    const agent = await loginAs(testApp, viewer.email);

    const reversedBetween = JSON.stringify([
      {
        fieldId: BUILTIN_FIELD_IDS.last_assessment_date,
        operator: 'between',
        value: ['2026-06-01', '2026-01-01'],
      },
    ]);
    await agent
      .get('/api/v1/employees')
      .query({ filters: reversedBetween })
      .expect(400);

    const strayIsEmptyValue = JSON.stringify([
      {
        fieldId: BUILTIN_FIELD_IDS.last_assessment_date,
        operator: 'is_empty',
        value: '2026-01-01',
      },
    ]);
    await agent
      .get('/api/v1/employees')
      .query({ filters: strayIsEmptyValue })
      .expect(400);
  });

  it('intersects CDS and non-CDS filters', async () => {
    const viewer = await createEmployeeUser(
      testApp,
      'cds-combined-viewer@example.com',
      'Viewer',
      '2020-01-01',
    );
    await testApp.prisma.fullAccessGrant.create({
      data: { employeeId: viewer.employeeId },
    });
    const salesWithIdp = await createEmployeeUser(
      testApp,
      'cds-sales-open@example.com',
      'Sales Open',
      '2020-01-01',
      'Mid',
      'Sales',
    );
    const engineeringWithIdp = await createEmployeeUser(
      testApp,
      'cds-eng-open@example.com',
      'Eng Open',
      '2020-01-01',
      'Mid',
      'Engineering',
    );
    await seedOpenIdp(testApp, salesWithIdp.employeeId);
    await seedOpenIdp(testApp, engineeringWithIdp.employeeId);

    const agent = await loginAs(testApp, viewer.email);
    const filters = JSON.stringify([
      {
        fieldId: BUILTIN_FIELD_IDS.has_open_idp,
        operator: 'eq',
        value: true,
      },
      {
        fieldId: BUILTIN_FIELD_IDS.department,
        operator: 'eq',
        value: 'Sales',
      },
    ]);
    const res = await agent
      .get('/api/v1/employees')
      .query({ filters, sort: BUILTIN_FIELD_IDS.name, order: 'asc' })
      .expect(200);

    const body = res.body as EmployeeListResponse;
    expect(body.total).toBe(1);
    expect(body.rows[0]?.employeeId).toBe(salesWithIdp.employeeId);
  });

  it('applies both CDS filters together', async () => {
    const viewer = await createEmployeeUser(
      testApp,
      'cds-dual-viewer@example.com',
      'Viewer',
      '2020-01-01',
    );
    await testApp.prisma.fullAccessGrant.create({
      data: { employeeId: viewer.employeeId },
    });
    const match = await createEmployeeUser(
      testApp,
      'cds-dual-match@example.com',
      'Match',
      '2020-01-01',
    );
    const wrongDate = await createEmployeeUser(
      testApp,
      'cds-dual-wrong-date@example.com',
      'Wrong Date',
      '2020-01-01',
    );
    await createEmployeeUser(
      testApp,
      'cds-dual-no-idp@example.com',
      'No IDP',
      '2020-01-01',
    );
    await seedAssessment(testApp, match.employeeId, '2026-03-15');
    await seedAssessment(testApp, wrongDate.employeeId, '2025-01-01');
    await seedOpenIdp(testApp, match.employeeId);
    await seedOpenIdp(testApp, wrongDate.employeeId);

    const agent = await loginAs(testApp, viewer.email);
    const filters = JSON.stringify([
      {
        fieldId: BUILTIN_FIELD_IDS.last_assessment_date,
        operator: 'between',
        value: ['2026-01-01', '2026-06-30'],
      },
      {
        fieldId: BUILTIN_FIELD_IDS.has_open_idp,
        operator: 'eq',
        value: true,
      },
    ]);
    const res = await agent
      .get('/api/v1/employees')
      .query({ filters, sort: BUILTIN_FIELD_IDS.name, order: 'asc' })
      .expect(200);

    const body = res.body as EmployeeListResponse;
    expect(body.total).toBe(1);
    expect(body.rows[0]?.employeeId).toBe(match.employeeId);
  });

  it('exports CDS columns and respects CDS filters', async () => {
    const viewer = await createEmployeeUser(
      testApp,
      'cds-export-viewer@example.com',
      'Viewer',
      '2020-01-01',
    );
    await testApp.prisma.fullAccessGrant.create({
      data: { employeeId: viewer.employeeId },
    });
    await seedAssessment(testApp, viewer.employeeId, '2026-01-01');
    const withOpenIdp = await createEmployeeUser(
      testApp,
      'cds-export-open@example.com',
      'Open IDP',
      '2020-01-01',
    );
    await createEmployeeUser(
      testApp,
      'cds-export-closed@example.com',
      'Closed',
      '2020-01-01',
    );
    await seedOpenIdp(testApp, withOpenIdp.employeeId);

    const agent = await loginAs(testApp, viewer.email);
    const res = await exportRequest(agent, {
      columns: JSON.stringify([
        BUILTIN_FIELD_IDS.name,
        BUILTIN_FIELD_IDS.has_open_idp,
        BUILTIN_FIELD_IDS.last_assessment_date,
      ]),
      filters: JSON.stringify([
        {
          fieldId: BUILTIN_FIELD_IDS.has_open_idp,
          operator: 'eq',
          value: true,
        },
      ]),
      sort: BUILTIN_FIELD_IDS.name,
      order: 'asc',
    });

    expect(res.status).toBe(200);
    const sheet = await readWorksheet(res.body);
    expect(sheet.rowCount).toBe(2);
    expect(sheet.getRow(1).getCell(2).value).toBe('Has open IDP');
    expect(sheet.getRow(2).getCell(1).value).toBe('Open IDP');
    expect(sheet.getRow(2).getCell(2).value).toBe('TRUE');
    expect(sheet.getRow(2).getCell(3).value).toBe('');
  });

  it('masks peer CDS values in export for managers', async () => {
    const manager = await createEmployeeUser(
      testApp,
      'cds-export-manager@example.com',
      'Manager',
      '2020-01-01',
    );
    const report = await createDirectReport(
      testApp,
      manager,
      'cds-export-report@example.com',
      'Report',
    );
    const peer = await createEmployeeUser(
      testApp,
      'cds-export-peer@example.com',
      'Peer',
      '2020-01-01',
    );
    await seedAssessment(testApp, report.employeeId, '2026-03-15');
    await seedAssessment(testApp, peer.employeeId, '2026-02-01');

    const agent = await loginAs(testApp, manager.email);
    const res = await exportRequest(agent, {
      columns: JSON.stringify([
        BUILTIN_FIELD_IDS.name,
        BUILTIN_FIELD_IDS.last_assessment_date,
      ]),
      sort: BUILTIN_FIELD_IDS.name,
      order: 'asc',
    });

    expect(res.status).toBe(200);
    const sheet = await readWorksheet(res.body);
    expect(sheet.rowCount).toBe(4);
    const dataRows = Array.from({ length: sheet.rowCount - 1 }, (_, index) =>
      sheet.getRow(index + 2),
    );
    const reportRow = dataRows.find((row) => row.getCell(1).value === 'Report');
    const peerRow = dataRows.find((row) => row.getCell(1).value === 'Peer');
    expect(reportRow?.getCell(2).value).toBe('2026-03-15');
    expect(peerRow?.getCell(2).value).toBe('');
  });
});
