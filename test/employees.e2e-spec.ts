import { hash } from 'bcryptjs';
import request from 'supertest';
import { BUILTIN_FIELD_IDS } from '../src/modules/contracts/field-registry.contract';
import { createTestApp, TestApp } from './support/app-harness';
import { FixedClock } from './support/fixed-clock';

const PASSWORD = 'test-only-employees-password';

interface EmployeeListField {
  id: string;
}

interface EmployeeListRow {
  employeeId: string;
  cells: Record<string, string | number | boolean | string[] | null>;
  writableFieldIds?: string[];
}

interface EmployeeListResponse {
  total: number;
  rows: EmployeeListRow[];
  fields: EmployeeListField[];
  page?: number;
  pageSize?: number;
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

describe('Employees list (e2e)', () => {
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

  it('GET /api/v1/employees returns 401 when unauthenticated', async () => {
    await request(testApp.server).get('/api/v1/employees').expect(401);
  });

  it('GET /api/v1/employees returns paginated rows for authenticated users', async () => {
    const viewer = await createEmployeeUser(
      testApp,
      'employees-viewer@example.com',
      'Viewer User',
      '2020-01-01',
    );
    await createEmployeeUser(
      testApp,
      'employees-long-tenure@example.com',
      'Long Tenure',
      '2018-01-01',
    );
    await createEmployeeUser(
      testApp,
      'employees-short-tenure@example.com',
      'Short Tenure',
      '2025-01-01',
    );

    const agent = await loginAs(testApp, viewer.email);
    const res = await agent
      .get('/api/v1/employees')
      .query({ page: 1, pageSize: 50 })
      .expect(200);

    const body = res.body as EmployeeListResponse;
    expect(body.total).toBe(3);
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.rows).toHaveLength(3);
    expect(Array.isArray(body.fields)).toBe(true);
    expect(
      body.fields.some((field) => field.id === BUILTIN_FIELD_IDS.grade),
    ).toBe(true);
  });

  it('filters employees by derived years_with_company > 3', async () => {
    const viewer = await createEmployeeUser(
      testApp,
      'employees-manager@example.com',
      'Manager User',
      '2020-01-01',
      'Senior',
    );
    const longTenure = await createEmployeeUser(
      testApp,
      'employees-long@example.com',
      'Long Tenure',
      '2018-01-01',
      'Senior',
    );
    await createEmployeeUser(
      testApp,
      'employees-short@example.com',
      'Short Tenure',
      '2025-01-01',
      'Junior',
    );

    const agent = await loginAs(testApp, viewer.email);
    const filters = JSON.stringify([
      {
        fieldId: BUILTIN_FIELD_IDS.years_with_company,
        operator: 'gt',
        value: 7,
      },
    ]);

    const res = await agent
      .get('/api/v1/employees')
      .query({ filters, sort: BUILTIN_FIELD_IDS.name, order: 'asc' })
      .expect(200);

    const body = res.body as EmployeeListResponse;
    expect(body.total).toBe(1);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].employeeId).toBe(longTenure.employeeId);
    expect(
      body.rows[0].cells[BUILTIN_FIELD_IDS.years_with_company],
    ).toBeGreaterThan(7);
  });

  it('returns 400 for unknown sort fields', async () => {
    const viewer = await createEmployeeUser(
      testApp,
      'employees-invalid-sort@example.com',
      'Viewer',
      '2020-01-01',
    );
    const agent = await loginAs(testApp, viewer.email);

    await agent
      .get('/api/v1/employees')
      .query({ sort: 'unknown_field', order: 'asc' })
      .expect(400);
  });

  it('sorts rows by grade ascending', async () => {
    const viewer = await createEmployeeUser(
      testApp,
      'employees-sort-viewer@example.com',
      'Viewer',
      '2020-01-01',
      'Mid',
    );
    await createEmployeeUser(
      testApp,
      'employees-sort-a@example.com',
      'Alpha',
      '2020-01-01',
      'Junior',
    );
    await createEmployeeUser(
      testApp,
      'employees-sort-z@example.com',
      'Zulu',
      '2020-01-01',
      'Senior',
    );

    const agent = await loginAs(testApp, viewer.email);
    const res = await agent
      .get('/api/v1/employees')
      .query({
        sort: BUILTIN_FIELD_IDS.grade,
        order: 'asc',
      })
      .expect(200);

    const body = res.body as EmployeeListResponse;
    const grades = body.rows.map((row) => row.cells[BUILTIN_FIELD_IDS.grade]);
    expect(grades).toEqual(['Junior', 'Mid', 'Senior']);
  });

  it('returns an empty row set when filters match no employees', async () => {
    const viewer = await createEmployeeUser(
      testApp,
      'employees-empty-filter@example.com',
      'Viewer',
      '2020-01-01',
    );
    await createEmployeeUser(
      testApp,
      'employees-empty-subject@example.com',
      'Subject',
      '2020-01-01',
      'Mid',
    );

    const agent = await loginAs(testApp, viewer.email);
    const filters = JSON.stringify([
      {
        fieldId: BUILTIN_FIELD_IDS.grade,
        operator: 'eq',
        value: 'NonexistentGrade',
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

  it('returns page 2 when pageSize is 50 and more than 50 employees exist', async () => {
    const viewer = await createEmployeeUser(
      testApp,
      'employees-page-viewer@example.com',
      'Viewer',
      '2020-01-01',
    );

    for (let index = 0; index < 55; index += 1) {
      await createEmployeeUser(
        testApp,
        `employees-page-${index}@example.com`,
        `Employee ${index}`,
        '2020-01-01',
        index % 2 === 0 ? 'Mid' : 'Senior',
      );
    }

    const agent = await loginAs(testApp, viewer.email);
    const res = await agent
      .get('/api/v1/employees')
      .query({
        page: 2,
        pageSize: 50,
        sort: BUILTIN_FIELD_IDS.name,
        order: 'asc',
      })
      .expect(200);

    const body = res.body as EmployeeListResponse;
    expect(body.total).toBe(56);
    expect(body.rows).toHaveLength(6);
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(50);
  });

  it('hides management custom fields from colleague viewers in the catalog', async () => {
    const colleague = await createEmployeeUser(
      testApp,
      'employees-colleague@example.com',
      'Colleague Viewer',
      '2020-01-01',
    );
    const subject = await createEmployeeUser(
      testApp,
      'employees-subject@example.com',
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
    const res = await agent.get('/api/v1/employees').expect(200);

    const body = res.body as EmployeeListResponse;
    expect(body.fields.some((field) => field.id === managementField.id)).toBe(
      false,
    );
  });

  it('rejects filters on management custom fields for colleague viewers', async () => {
    const colleague = await createEmployeeUser(
      testApp,
      'employees-colleague-filter@example.com',
      'Colleague Viewer',
      '2020-01-01',
    );
    await createEmployeeUser(
      testApp,
      'employees-filter-subject@example.com',
      'Subject',
      '2020-01-01',
    );

    const managementField = await testApp.prisma.customFieldDefinition.create({
      data: {
        name: 'Management filter field',
        type: 'text',
        visibility: 'management',
      },
    });

    const agent = await loginAs(testApp, colleague.email);
    const filters = JSON.stringify([
      {
        fieldId: managementField.id,
        operator: 'eq',
        value: 'secret',
      },
    ]);

    await agent.get('/api/v1/employees').query({ filters }).expect(400);
  });

  it('omits management custom field values from row cells for colleague viewers', async () => {
    const colleague = await createEmployeeUser(
      testApp,
      'employees-colleague-cells@example.com',
      'Colleague Viewer',
      '2020-01-01',
    );
    const subject = await createEmployeeUser(
      testApp,
      'employees-cells-subject@example.com',
      'Subject',
      '2020-01-01',
    );

    const managementField = await testApp.prisma.customFieldDefinition.create({
      data: {
        name: 'Management cell field',
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
    const res = await agent.get('/api/v1/employees').expect(200);

    const body = res.body as EmployeeListResponse;
    const subjectRow = body.rows.find(
      (row) => row.employeeId === subject.employeeId,
    );
    expect(subjectRow).toBeDefined();
    expect(subjectRow?.cells[managementField.id]).toBeUndefined();
  });

  it('allows a manager to inline-edit a direct report grade and rejects a colleague', async () => {
    const manager = await createEmployeeUser(
      testApp,
      'employees-manager-edit@example.com',
      'Manager',
      '2020-01-01',
      'Senior',
    );
    const reportUser = await testApp.prisma.user.create({
      data: {
        email: 'employees-report-edit@example.com',
        name: 'Report',
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

    const colleague = await createEmployeeUser(
      testApp,
      'employees-colleague-edit@example.com',
      'Colleague',
      '2020-01-01',
      'Mid',
    );

    const managerAgent = await loginAs(testApp, manager.email);
    const listRes = await managerAgent.get('/api/v1/employees').expect(200);
    const listBody = listRes.body as EmployeeListResponse;
    const reportRow = listBody.rows.find(
      (row) => row.employeeId === report.id,
    );
    expect(reportRow?.writableFieldIds).toContain(BUILTIN_FIELD_IDS.grade);

    await managerAgent
      .patch(
        `/api/v1/employees/${report.id}/fields/${BUILTIN_FIELD_IDS.grade}`,
      )
      .send({ value: 'Senior' })
      .expect(200);

    const refreshed = await managerAgent.get('/api/v1/employees').expect(200);
    const refreshedBody = refreshed.body as EmployeeListResponse;
    const updatedRow = refreshedBody.rows.find(
      (row) => row.employeeId === report.id,
    );
    expect(updatedRow?.cells[BUILTIN_FIELD_IDS.grade]).toBe('Senior');

    await managerAgent
      .patch(
        `/api/v1/employees/${report.id}/fields/${BUILTIN_FIELD_IDS.grade}`,
      )
      .send({ value: 'Lead' })
      .expect(200);

    const afterSecondEdit = await managerAgent
      .get('/api/v1/employees')
      .expect(200);
    const afterSecondBody = afterSecondEdit.body as EmployeeListResponse;
    const twiceUpdatedRow = afterSecondBody.rows.find(
      (row) => row.employeeId === report.id,
    );
    expect(twiceUpdatedRow?.cells[BUILTIN_FIELD_IDS.grade]).toBe('Lead');

    const gradeRows = await testApp.prisma.gradeHistory.findMany({
      where: { employeeId: report.id },
      orderBy: { effectiveFrom: 'asc' },
    });
    expect(gradeRows).toHaveLength(2);
    expect(gradeRows[1]?.value).toBe('Lead');
    expect(gradeRows[1]?.effectiveTo).toBeNull();

    const colleagueAgent = await loginAs(testApp, colleague.email);
    await colleagueAgent
      .patch(
        `/api/v1/employees/${report.id}/fields/${BUILTIN_FIELD_IDS.grade}`,
      )
      .send({ value: 'Junior' })
      .expect(403);
  });

  it('allows a manager to inline-edit a custom field on a direct report', async () => {
    const manager = await createEmployeeUser(
      testApp,
      'employees-manager-custom@example.com',
      'Manager',
      '2020-01-01',
      'Senior',
    );
    const reportUser = await testApp.prisma.user.create({
      data: {
        email: 'employees-report-custom@example.com',
        name: 'Report',
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

    const customField = await testApp.prisma.customFieldDefinition.create({
      data: {
        name: 'Inline custom field',
        type: 'text',
        visibility: 'management',
      },
    });

    const managerAgent = await loginAs(testApp, manager.email);
    await managerAgent
      .patch(`/api/v1/employees/${report.id}/fields/${customField.id}`)
      .send({ value: 'Updated note' })
      .expect(200);

    const listRes = await managerAgent.get('/api/v1/employees').expect(200);
    const listBody = listRes.body as EmployeeListResponse;
    const reportRow = listBody.rows.find(
      (row) => row.employeeId === report.id,
    );
    expect(reportRow?.cells[customField.id]).toBe('Updated note');
  });

  it('rejects inline edits to non-editable built-in department', async () => {
    const manager = await createEmployeeUser(
      testApp,
      'employees-manager-dept@example.com',
      'Manager',
      '2020-01-01',
      'Senior',
    );
    const reportUser = await testApp.prisma.user.create({
      data: {
        email: 'employees-report-dept@example.com',
        name: 'Report',
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

    const managerAgent = await loginAs(testApp, manager.email);
    await managerAgent
      .patch(
        `/api/v1/employees/${report.id}/fields/${BUILTIN_FIELD_IDS.department}`,
      )
      .send({ value: 'Sales' })
      .expect(403);
  });

  it('rejects empty grade inline edits with validation error', async () => {
    const manager = await createEmployeeUser(
      testApp,
      'employees-manager-empty-grade@example.com',
      'Manager',
      '2020-01-01',
      'Senior',
    );
    const reportUser = await testApp.prisma.user.create({
      data: {
        email: 'employees-report-empty-grade@example.com',
        name: 'Report',
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

    const managerAgent = await loginAs(testApp, manager.email);
    await managerAgent
      .patch(
        `/api/v1/employees/${report.id}/fields/${BUILTIN_FIELD_IDS.grade}`,
      )
      .send({ value: '' })
      .expect(400);
  });
});
