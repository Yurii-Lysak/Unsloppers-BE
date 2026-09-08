import { hash } from 'bcryptjs';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { BUILTIN_FIELD_IDS } from '../src/modules/contracts/field-registry.contract';
import { createTestApp, TestApp } from './support/app-harness';
import { FixedClock } from './support/fixed-clock';

const PASSWORD = 'test-only-employees-export-password';

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
    data: {
      employeeId: employee.id,
      value: grade,
      effectiveFrom,
    },
  });
  await testApp.prisma.positionHistory.create({
    data: {
      employeeId: employee.id,
      value: 'Engineer',
      effectiveFrom,
    },
  });
  await testApp.prisma.departmentHistory.create({
    data: {
      employeeId: employee.id,
      value: 'Engineering',
      effectiveFrom,
    },
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

describe('Employees export (e2e)', () => {
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

  it('GET /api/v1/employees/export returns 401 when unauthenticated', async () => {
    await request(testApp.server)
      .get('/api/v1/employees/export')
      .query({ columns: JSON.stringify([BUILTIN_FIELD_IDS.name]) })
      .expect(401);
  });

  it('GET /api/v1/employees/export returns 400 when columns is missing', async () => {
    const viewer = await createEmployeeUser(
      testApp,
      'export-viewer@example.com',
      'Export Viewer',
      '2020-01-01',
    );
    const agent = await loginAs(testApp, viewer.email);

    await agent.get('/api/v1/employees/export').expect(400);
  });

  it('GET /api/v1/employees/export returns 400 when columns is an empty array', async () => {
    const viewer = await createEmployeeUser(
      testApp,
      'export-empty-columns@example.com',
      'Export Viewer',
      '2020-01-01',
    );
    const agent = await loginAs(testApp, viewer.email);

    await agent
      .get('/api/v1/employees/export')
      .query({ columns: JSON.stringify([]) })
      .expect(400);
  });

  it('GET /api/v1/employees/export returns 400 for unknown column ids', async () => {
    const viewer = await createEmployeeUser(
      testApp,
      'export-unknown-column@example.com',
      'Export Viewer',
      '2020-01-01',
    );
    const agent = await loginAs(testApp, viewer.email);

    await agent
      .get('/api/v1/employees/export')
      .query({ columns: JSON.stringify(['unknown-field']) })
      .expect(400);
  });

  it('GET /api/v1/employees/export returns 400 for non-visible sort fields', async () => {
    const colleague = await createEmployeeUser(
      testApp,
      'export-invalid-sort@example.com',
      'Colleague Viewer',
      '2020-01-01',
    );
    const managementField = await testApp.prisma.customFieldDefinition.create({
      data: {
        name: 'Management only',
        type: 'text',
        visibility: 'management',
      },
    });
    const agent = await loginAs(testApp, colleague.email);

    await agent
      .get('/api/v1/employees/export')
      .query({
        columns: JSON.stringify([BUILTIN_FIELD_IDS.name]),
        sort: managementField.id,
      })
      .expect(400);
  });

  it('GET /api/v1/employees/export returns 400 when every column is invisible', async () => {
    const colleague = await createEmployeeUser(
      testApp,
      'export-no-visible-columns@example.com',
      'Colleague Viewer',
      '2020-01-01',
    );
    const managementField = await testApp.prisma.customFieldDefinition.create({
      data: {
        name: 'Management only',
        type: 'text',
        visibility: 'management',
      },
    });
    const agent = await loginAs(testApp, colleague.email);

    await agent
      .get('/api/v1/employees/export')
      .query({ columns: JSON.stringify([managementField.id]) })
      .expect(400);
  });

  it('exports headers only when filters match zero rows', async () => {
    const viewer = await createEmployeeUser(
      testApp,
      'export-empty-result@example.com',
      'Export Viewer',
      '2020-01-01',
    );
    const agent = await loginAs(testApp, viewer.email);

    const res = await exportRequest(agent, {
      columns: JSON.stringify([
        BUILTIN_FIELD_IDS.name,
        BUILTIN_FIELD_IDS.grade,
      ]),
      filters: JSON.stringify([
        {
          fieldId: BUILTIN_FIELD_IDS.name,
          operator: 'eq',
          value: 'Nobody matches this',
        },
      ]),
    });

    expect(res.status).toBe(200);
    const sheet = await readWorksheet(res.body);
    expect(sheet.rowCount).toBe(1);
    expect(sheet.getRow(1).getCell(1).value).toBe('Name');
    expect(sheet.getRow(1).getCell(2).value).toBe('Grade');
  });

  it('exports entitled columns and values for the current view', async () => {
    const manager = await createEmployeeUser(
      testApp,
      'export-manager@example.com',
      'Export Manager',
      '2020-01-01',
      'Senior',
    );
    const reportUser = await testApp.prisma.user.create({
      data: {
        email: 'export-report@example.com',
        name: 'Direct Report',
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
    const reportStart = new Date('2020-01-01T00:00:00.000Z');
    await testApp.prisma.gradeHistory.create({
      data: {
        employeeId: report.id,
        value: 'Mid',
        effectiveFrom: reportStart,
      },
    });
    await testApp.prisma.positionHistory.create({
      data: {
        employeeId: report.id,
        value: 'Engineer',
        effectiveFrom: reportStart,
      },
    });
    await testApp.prisma.departmentHistory.create({
      data: {
        employeeId: report.id,
        value: 'Engineering',
        effectiveFrom: reportStart,
      },
    });
    await testApp.prisma.employmentTypeHistory.create({
      data: {
        employeeId: report.id,
        value: 'Full-time',
        effectiveFrom: reportStart,
      },
    });

    const managementField = await testApp.prisma.customFieldDefinition.create({
      data: {
        name: 'Management only',
        type: 'text',
        visibility: 'management',
      },
    });

    await testApp.prisma.customFieldValue.create({
      data: {
        employeeId: report.id,
        fieldDefinitionId: managementField.id,
        valueText: 'visible-secret',
      },
    });

    const agent = await loginAs(testApp, manager.email);
    const res = await exportRequest(agent, {
      columns: JSON.stringify([
        BUILTIN_FIELD_IDS.name,
        BUILTIN_FIELD_IDS.grade,
        managementField.id,
      ]),
      filters: JSON.stringify([
        {
          fieldId: BUILTIN_FIELD_IDS.name,
          operator: 'eq',
          value: 'Direct Report',
        },
      ]),
    });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(res.headers['content-disposition']).toMatch(
      /attachment; filename="employees-export-\d{4}-\d{2}-\d{2}\.xlsx"/,
    );

    const sheet = await readWorksheet(res.body);
    expect(sheet.getRow(1).getCell(1).value).toBe('Name');
    expect(sheet.getRow(1).getCell(2).value).toBe('Grade');
    expect(sheet.getRow(1).getCell(3).value).toBe('Management only');
    expect(sheet.rowCount).toBe(2);
    expect(sheet.getRow(2).getCell(1).value).toBe('Direct Report');
    expect(sheet.getRow(2).getCell(2).value).toBe('Mid');
    expect(sheet.getRow(2).getCell(3).value).toBe('visible-secret');
  });

  it('omits management custom field columns for colleague viewers', async () => {
    const colleague = await createEmployeeUser(
      testApp,
      'export-colleague@example.com',
      'Colleague Viewer',
      '2020-01-01',
    );
    const subject = await createEmployeeUser(
      testApp,
      'export-subject@example.com',
      'Subject',
      '2020-01-01',
    );

    const managementField = await testApp.prisma.customFieldDefinition.create({
      data: {
        name: 'Management only',
        type: 'text',
        visibility: 'management',
      },
    });

    await testApp.prisma.customFieldValue.create({
      data: {
        employeeId: subject.employeeId,
        fieldDefinitionId: managementField.id,
        valueText: 'secret',
      },
    });

    const agent = await loginAs(testApp, colleague.email);
    const res = await exportRequest(agent, {
      columns: JSON.stringify([BUILTIN_FIELD_IDS.name, managementField.id]),
    });

    expect(res.status).toBe(200);

    const sheet = await readWorksheet(res.body);
    expect(sheet.getRow(1).getCell(1).value).toBe('Name');
    expect(sheet.getRow(1).getCell(2).value).toBeNull();

    const subjectRow = sheet
      .getSheetValues()
      .slice(2)
      .find((row) => {
        const values = row as ExcelJS.CellValue[];
        return values?.[1] === 'Subject';
      });
    expect(subjectRow).toBeDefined();
    expect((subjectRow as ExcelJS.CellValue[]).length).toBeLessThanOrEqual(3);
  });
});
