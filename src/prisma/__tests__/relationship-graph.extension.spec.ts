import {
  departmentHistoryWriteTouchesGraph,
  employeeWriteTouchesGraph,
  fullAccessGrantWriteTouchesGraph,
  projectAssignmentWriteTouchesGraph,
  runWithBump,
} from '../extensions/relationship-graph.extension';
import {
  invokeRelationshipGraphBump,
  registerRelationshipGraphBump,
  resetRelationshipGraphBumpRegistry,
} from '../relationship-graph-bump.registry';

describe('relationship-graph.extension', () => {
  const bump = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    resetRelationshipGraphBumpRegistry();
    registerRelationshipGraphBump(() => {
      bump();
      return Promise.resolve();
    });
  });

  afterEach(() => {
    resetRelationshipGraphBumpRegistry();
  });

  it('detects employee managerId updates as graph writes', () => {
    expect(
      employeeWriteTouchesGraph('update', {
        data: { managerId: 'm2' },
      }),
    ).toBe(true);
  });

  it('ignores employee updates that do not touch graph fields', () => {
    expect(
      employeeWriteTouchesGraph('update', {
        data: { updatedAt: new Date() },
      }),
    ).toBe(false);
  });

  it('detects projectAssignment bulk writes', () => {
    expect(projectAssignmentWriteTouchesGraph('updateMany')).toBe(true);
  });

  it('detects departmentHistory create as a graph write', () => {
    expect(departmentHistoryWriteTouchesGraph('create')).toBe(true);
    expect(departmentHistoryWriteTouchesGraph('update')).toBe(false);
  });

  it('detects fullAccessGrant writes', () => {
    expect(fullAccessGrantWriteTouchesGraph('create')).toBe(true);
  });

  it('invokeRelationshipGraphBump is a no-op before registration', async () => {
    resetRelationshipGraphBumpRegistry();
    await invokeRelationshipGraphBump();
    expect(bump).not.toHaveBeenCalled();
  });

  describe('runWithBump integration', () => {
    it('invokes bump after a successful projectAssignment update', async () => {
      const query = jest.fn().mockResolvedValue({ id: 'row-1' });

      await runWithBump(
        'update',
        query,
        { where: { id: 'row-1' }, data: { confirmed: false } },
        projectAssignmentWriteTouchesGraph('update'),
      );

      expect(query).toHaveBeenCalledTimes(1);
      expect(bump).toHaveBeenCalledTimes(1);
    });

    it('does not invoke bump when employee update omits graph fields', async () => {
      const query = jest.fn().mockResolvedValue({ id: 'emp-1' });

      await runWithBump(
        'update',
        query,
        { where: { id: 'emp-1' }, data: { updatedAt: new Date() } },
        employeeWriteTouchesGraph('update', {
          data: { updatedAt: new Date() },
        }),
      );

      expect(query).toHaveBeenCalledTimes(1);
      expect(bump).not.toHaveBeenCalled();
    });

    it('invokes bump after employee managerId update', async () => {
      const query = jest.fn().mockResolvedValue({ id: 'emp-1' });

      await runWithBump(
        'update',
        query,
        { where: { id: 'emp-1' }, data: { managerId: 'mgr-2' } },
        employeeWriteTouchesGraph('update', { data: { managerId: 'mgr-2' } }),
      );

      expect(bump).toHaveBeenCalledTimes(1);
    });

    it('invokes bump after departmentHistory create', async () => {
      const query = jest.fn().mockResolvedValue({ id: 'hist-1' });

      await runWithBump(
        'create',
        query,
        { data: { employeeId: 'e1', value: 'HR' } },
        departmentHistoryWriteTouchesGraph('create'),
      );

      expect(bump).toHaveBeenCalledTimes(1);
    });

    it('does not invoke bump when the query throws', async () => {
      const query = jest.fn().mockRejectedValue(new Error('write failed'));

      await expect(
        runWithBump(
          'update',
          query,
          { where: { id: 'row-1' } },
          projectAssignmentWriteTouchesGraph('update'),
        ),
      ).rejects.toThrow('write failed');

      expect(bump).not.toHaveBeenCalled();
    });
  });
});
