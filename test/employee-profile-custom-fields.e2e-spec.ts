import { createTestApp, TestApp } from './support/app-harness';
import { createEmployeeUser, loginAsEmployee } from './support/employee-users';
import type {
  CustomFieldDefinition,
  CustomFieldType,
  CustomFieldVisibility,
} from '../src/generated/prisma/client';

const PASSWORD = 'test-only-profile-custom-fields-password';

interface CustomFieldsSectionResponse {
  fields: Array<{ id: string; name: string; type: string }>;
  values: Record<string, unknown>;
}

interface ProfileResponse {
  audience: { role: string };
  sections: {
    S16?: { data?: CustomFieldsSectionResponse; status?: string };
  };
}

async function createField(
  testApp: TestApp,
  name: string,
  visibility: CustomFieldVisibility,
  type: CustomFieldType = 'text',
): Promise<CustomFieldDefinition> {
  return testApp.prisma.customFieldDefinition.create({
    data: { name, type, visibility },
  });
}

async function setValue(
  testApp: TestApp,
  employeeId: string,
  fieldId: string,
  valueText: string,
): Promise<void> {
  await testApp.prisma.customFieldValue.create({
    data: { employeeId, fieldDefinitionId: fieldId, valueText },
  });
}

describe('Employee profile custom fields — S16 (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await testApp.resetDatabase();
  });

  it('shows an employee-visibility field to Self and hides it entirely from a Colleague', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'cf-subject@example.com',
      PASSWORD,
    );
    const colleague = await createEmployeeUser(
      testApp,
      'cf-colleague@example.com',
      PASSWORD,
    );

    const field = await createField(testApp, 'Dietary preference', 'employee');
    await setValue(testApp, subject.employeeId, field.id, 'Vegetarian');

    const selfAgent = await loginAsEmployee(testApp, subject.email, PASSWORD);
    const selfRes = await selfAgent
      .get(`/api/v1/employees/${subject.employeeId}/profile`)
      .expect(200);
    const selfBody = selfRes.body as ProfileResponse;
    expect(selfBody.sections.S16?.data?.fields).toEqual([
      { id: field.id, name: 'Dietary preference', type: 'text' },
    ]);
    expect(selfBody.sections.S16?.data?.values).toEqual({
      [field.id]: 'Vegetarian',
    });

    const colleagueAgent = await loginAsEmployee(
      testApp,
      colleague.email,
      PASSWORD,
    );
    const colleagueRes = await colleagueAgent
      .get(`/api/v1/employees/${subject.employeeId}/profile`)
      .expect(200);
    const colleagueBody = colleagueRes.body as ProfileResponse;
    expect(colleagueBody.sections.S16?.data?.fields).toEqual([]);
    expect(colleagueBody.sections.S16?.data?.values).toEqual({});
    const raw = JSON.stringify(colleagueRes.body);
    expect(raw).not.toContain('Vegetarian');
    expect(raw).not.toContain('Dietary preference');
  });

  it('shows a colleague-visibility field to a Colleague viewer (CAP-2)', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'cf-colleague-visible-subject@example.com',
      PASSWORD,
    );
    const colleague = await createEmployeeUser(
      testApp,
      'cf-colleague-visible-viewer@example.com',
      PASSWORD,
    );

    const field = await createField(testApp, 'Favorite team', 'colleague');
    await setValue(testApp, subject.employeeId, field.id, 'Falcons');

    const colleagueAgent = await loginAsEmployee(
      testApp,
      colleague.email,
      PASSWORD,
    );
    const res = await colleagueAgent
      .get(`/api/v1/employees/${subject.employeeId}/profile`)
      .expect(200);
    const body = res.body as ProfileResponse;
    expect(body.audience.role).toBe('Colleague');
    expect(body.sections.S16?.data?.fields).toEqual([
      { id: field.id, name: 'Favorite team', type: 'text' },
    ]);
    expect(body.sections.S16?.data?.values).toEqual({ [field.id]: 'Falcons' });
  });

  it('resolves a mixed management/employee/colleague fixture correctly for both Self and Colleague', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'cf-mixed-subject@example.com',
      PASSWORD,
    );
    const colleague = await createEmployeeUser(
      testApp,
      'cf-mixed-colleague@example.com',
      PASSWORD,
    );

    const managementField = await createField(
      testApp,
      'Performance flag',
      'management',
    );
    const employeeField = await createField(testApp, 'Shirt size', 'employee');
    const colleagueField = await createField(testApp, 'Nickname', 'colleague');

    await setValue(testApp, subject.employeeId, managementField.id, 'at-risk');
    await setValue(testApp, subject.employeeId, employeeField.id, 'L');
    await setValue(testApp, subject.employeeId, colleagueField.id, 'Sam');

    const selfAgent = await loginAsEmployee(testApp, subject.email, PASSWORD);
    const selfRes = await selfAgent
      .get(`/api/v1/employees/${subject.employeeId}/profile`)
      .expect(200);
    const selfBody = selfRes.body as ProfileResponse;
    const selfFieldIds = (selfBody.sections.S16?.data?.fields ?? [])
      .map((f) => f.id)
      .sort();
    expect(selfFieldIds).toEqual([colleagueField.id, employeeField.id].sort());
    expect(selfBody.sections.S16?.data?.values).toEqual({
      [employeeField.id]: 'L',
      [colleagueField.id]: 'Sam',
    });
    const selfRaw = JSON.stringify(selfRes.body);
    expect(selfRaw).not.toContain('at-risk');
    expect(selfRaw).not.toContain('Performance flag');

    const colleagueAgent = await loginAsEmployee(
      testApp,
      colleague.email,
      PASSWORD,
    );
    const colleagueRes = await colleagueAgent
      .get(`/api/v1/employees/${subject.employeeId}/profile`)
      .expect(200);
    const colleagueBody = colleagueRes.body as ProfileResponse;
    expect(colleagueBody.sections.S16?.data?.fields).toEqual([
      { id: colleagueField.id, name: 'Nickname', type: 'text' },
    ]);
    expect(colleagueBody.sections.S16?.data?.values).toEqual({
      [colleagueField.id]: 'Sam',
    });
    const colleagueRaw = JSON.stringify(colleagueRes.body);
    expect(colleagueRaw).not.toContain('at-risk');
    expect(colleagueRaw).not.toContain('Performance flag');
    expect(colleagueRaw).not.toContain('Shirt size');
    expect(colleagueRaw).not.toContain('L');
  });

  it('renders an empty S16 section, never unavailable, when only management fields exist for the subject', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'cf-empty-subject@example.com',
      PASSWORD,
    );
    const colleague = await createEmployeeUser(
      testApp,
      'cf-empty-colleague@example.com',
      PASSWORD,
    );

    const managementField = await createField(
      testApp,
      'HR eyes only',
      'management',
    );
    await setValue(testApp, subject.employeeId, managementField.id, 'secret');

    const colleagueAgent = await loginAsEmployee(
      testApp,
      colleague.email,
      PASSWORD,
    );
    const res = await colleagueAgent
      .get(`/api/v1/employees/${subject.employeeId}/profile`)
      .expect(200);
    const body = res.body as ProfileResponse;
    expect(body.sections.S16).toBeDefined();
    expect(body.sections.S16?.status).toBeUndefined();
    expect(body.sections.S16?.data).toEqual({ fields: [], values: {} });
  });

  it('omits a visible field with no stored value from `values` while keeping it in `fields`', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'cf-unset-subject@example.com',
      PASSWORD,
    );
    const field = await createField(testApp, 'Not filled in yet', 'employee');

    const selfAgent = await loginAsEmployee(testApp, subject.email, PASSWORD);
    const res = await selfAgent
      .get(`/api/v1/employees/${subject.employeeId}/profile`)
      .expect(200);
    const body = res.body as ProfileResponse;
    expect(body.sections.S16?.data?.fields).toEqual([
      { id: field.id, name: 'Not filled in yet', type: 'text' },
    ]);
    expect(body.sections.S16?.data?.values).toEqual({});
  });
});
