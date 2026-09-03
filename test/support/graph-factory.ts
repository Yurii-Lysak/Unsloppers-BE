import { ProfileAudience } from './access-matrix';

/**
 * Builds the relationship graph that every access-matrix case is a function of.
 *
 * Reporting line and project line are modeled separately (C1 / AD-14) — never
 * as a single combined manager audience.
 */

export type EmployeeHandle = string;

/** Access roles that arise from the graph. Functional roles never do. */
export type GraphRole =
  Extract<ProfileAudience, 'self' | 'reportingLine' | 'pp'> | 'projectLine';

export interface ProjectRoles {
  readonly pm?: EmployeeHandle;
  readonly dm?: EmployeeHandle;
}

interface ProjectRecord extends ProjectRoles {
  readonly id: string;
}

interface AssignmentRecord {
  readonly employee: EmployeeHandle;
  readonly project: string;
  readonly active: boolean;
}

export class GraphBuilder {
  private readonly employees = new Set<EmployeeHandle>();
  private readonly reportsToEdges = new Map<EmployeeHandle, EmployeeHandle>();
  private readonly projects = new Map<string, ProjectRecord>();
  private readonly assignments: AssignmentRecord[] = [];
  private readonly peoplePartners = new Map<EmployeeHandle, EmployeeHandle>();
  private readonly hrLine = new Map<EmployeeHandle, EmployeeHandle>();

  employee(...handles: EmployeeHandle[]): this {
    for (const handle of handles) {
      this.employees.add(handle);
    }
    return this;
  }

  reportsTo(subordinate: EmployeeHandle, manager: EmployeeHandle): this {
    this.employee(subordinate, manager);
    this.reportsToEdges.set(subordinate, manager);
    return this;
  }

  project(id: string, roles: ProjectRoles = {}): this {
    if (roles.pm !== undefined) {
      this.employee(roles.pm);
    }
    if (roles.dm !== undefined) {
      this.employee(roles.dm);
    }
    this.projects.set(id, { id, ...roles });
    return this;
  }

  assign(
    employee: EmployeeHandle,
    project: string,
    options: { readonly active?: boolean } = {},
  ): this {
    this.employee(employee);
    if (!this.projects.has(project)) {
      this.project(project);
    }
    this.assignments.push({
      employee,
      project,
      active: options.active ?? true,
    });
    return this;
  }

  peoplePartner(employee: EmployeeHandle, pp: EmployeeHandle): this {
    this.employee(employee, pp);
    this.peoplePartners.set(employee, pp);
    return this;
  }

  hrLineAbove(pp: EmployeeHandle, above: EmployeeHandle): this {
    this.employee(pp, above);
    this.hrLine.set(pp, above);
    return this;
  }

  build(): RelationshipGraph {
    return new RelationshipGraph(
      new Set(this.employees),
      new Map(this.reportsToEdges),
      new Map(this.projects),
      [...this.assignments],
      new Map(this.peoplePartners),
      new Map(this.hrLine),
    );
  }
}

export class RelationshipGraph {
  constructor(
    private readonly employeeSet: ReadonlySet<EmployeeHandle>,
    private readonly reportsToEdges: ReadonlyMap<
      EmployeeHandle,
      EmployeeHandle
    >,
    private readonly projects: ReadonlyMap<string, ProjectRecord>,
    private readonly assignments: readonly AssignmentRecord[],
    private readonly peoplePartners: ReadonlyMap<
      EmployeeHandle,
      EmployeeHandle
    >,
    private readonly hrLine: ReadonlyMap<EmployeeHandle, EmployeeHandle>,
  ) {}

  get employees(): EmployeeHandle[] {
    return [...this.employeeSet].sort();
  }

  reportingLineOf(subject: EmployeeHandle): Set<EmployeeHandle> {
    return this.transitiveReportsToAbove(subject);
  }

  projectLineOf(subject: EmployeeHandle): Set<EmployeeHandle> {
    const viewers = new Set<EmployeeHandle>();

    for (const assignment of this.assignments) {
      if (assignment.employee !== subject || !assignment.active) {
        continue;
      }
      const project = this.projects.get(assignment.project);
      if (project === undefined) {
        continue;
      }
      for (const leg of [project.pm, project.dm]) {
        if (leg === undefined || leg === subject) {
          continue;
        }
        viewers.add(leg);
        for (const ancestor of this.transitiveReportsToAbove(leg)) {
          viewers.add(ancestor);
        }
      }
    }

    viewers.delete(subject);
    return viewers;
  }

  /** @deprecated Use `reportingLineOf` or `projectLineOf` instead. */
  managerLineOf(subject: EmployeeHandle): Set<EmployeeHandle> {
    const combined = new Set(this.reportingLineOf(subject));
    for (const viewer of this.projectLineOf(subject)) {
      combined.add(viewer);
    }
    return combined;
  }

  peoplePartnerLineOf(subject: EmployeeHandle): Set<EmployeeHandle> {
    const line = new Set<EmployeeHandle>();

    let current = this.peoplePartners.get(subject);
    while (current !== undefined && !line.has(current)) {
      line.add(current);
      current = this.hrLine.get(current);
    }

    line.delete(subject);
    return line;
  }

  rolesFor(viewer: EmployeeHandle, subject: EmployeeHandle): Set<GraphRole> {
    const roles = new Set<GraphRole>();

    if (viewer === subject) {
      roles.add('self');
      return roles;
    }

    if (this.reportingLineOf(subject).has(viewer)) {
      roles.add('reportingLine');
    }
    if (this.projectLineOf(subject).has(viewer)) {
      roles.add('projectLine');
    }
    if (this.peoplePartnerLineOf(subject).has(viewer)) {
      roles.add('pp');
    }

    return roles;
  }

  audienceFor(
    viewer: EmployeeHandle,
    subject: EmployeeHandle,
  ):
    | Extract<ProfileAudience, 'self' | 'reportingLine' | 'pp' | 'colleague'>
    | 'projectLine' {
    const roles = this.rolesFor(viewer, subject);

    if (roles.has('self')) {
      return 'self';
    }
    if (roles.has('pp')) {
      return 'pp';
    }
    if (roles.has('reportingLine')) {
      return 'reportingLine';
    }
    if (roles.has('projectLine')) {
      return 'projectLine';
    }
    return 'colleague';
  }

  private transitiveReportsToAbove(root: EmployeeHandle): Set<EmployeeHandle> {
    const managers = new Set<EmployeeHandle>();
    const visited = new Set<EmployeeHandle>();
    let current: EmployeeHandle | undefined = root;

    while (current !== undefined) {
      const supervisor = this.reportsToEdges.get(current);
      if (supervisor === undefined) {
        break;
      }
      if (supervisor === root || managers.has(supervisor)) {
        break;
      }
      if (visited.has(current)) {
        break;
      }
      visited.add(current);
      managers.add(supervisor);
      current = supervisor;
    }

    return managers;
  }
}

export function aGraph(): GraphBuilder {
  return new GraphBuilder();
}
