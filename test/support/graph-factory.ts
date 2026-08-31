import { ProfileAudience } from './access-matrix';

/**
 * Builds the relationship graph that every access-matrix case is a function of.
 *
 * Each cell of the matrix depends on the graph rather than on a role column:
 * reports-to at arbitrary depth, project assignment with a PM and a DM, an
 * assigned people partner and the HR line above them. Without one shared way to
 * describe that graph, every module invents its own fixture shape and the
 * matrix cases stop being comparable across modules.
 *
 * The graph doubles as the oracle for those cases: `rolesFor` computes the
 * audience a viewer holds with respect to a subject straight from the spec
 * rules, independently of the resolver under test. A test that compares the
 * resolver against this is comparing it against the spec, not against itself.
 *
 * TODO(domain-schema): persistence attaches here. `prisma/schema.prisma`
 * currently holds only the starter `User` model, so there is nothing yet to
 * write employees, projects, or assignments into. When the domain models land,
 * add `persist(prisma)` that inserts this graph inside the caller's schema and
 * relies on `truncateAllTables` for teardown; the shape below is already the
 * shape those inserts need.
 */

export type EmployeeHandle = string;

/** The access roles that arise from the graph. Functional roles never do. */
export type GraphRole = Extract<ProfileAudience, 'self' | 'managerLine' | 'pp'>;

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

  /** `subordinate` reports to `manager`. */
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

  /**
   * Puts an employee on a project. An ended assignment grants nothing: derived
   * managerial access is not sticky.
   */
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

  /** `pp` is the assigned people partner of `employee`. */
  peoplePartner(employee: EmployeeHandle, pp: EmployeeHandle): this {
    this.employee(employee, pp);
    this.peoplePartners.set(employee, pp);
    return this;
  }

  /** `above` sits over `pp` in the HR line and inherits their PP access. */
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

  /**
   * Everyone holding Manager access over `subject`.
   *
   * The spec defines this as the transitive closure of two relations, unioned:
   * reports-to, and is-assigned-to-a-project-managed-by. Taken literally, the
   * manager of someone who manages the subject also manages the subject, by
   * either route. That literal reading is what this implements, so a resolver
   * that stops at the first hop disagrees with it visibly.
   */
  managerLineOf(subject: EmployeeHandle): Set<EmployeeHandle> {
    const managers = new Set<EmployeeHandle>();
    const frontier: EmployeeHandle[] = [subject];

    while (frontier.length > 0) {
      const current = frontier.pop() as EmployeeHandle;

      for (const manager of this.directManagersOf(current)) {
        if (manager === subject || managers.has(manager)) {
          continue;
        }
        managers.add(manager);
        frontier.push(manager);
      }
    }

    return managers;
  }

  /** The assigned people partner plus the HR line above them. */
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

  /** Every access role `viewer` holds with respect to `subject`. */
  rolesFor(viewer: EmployeeHandle, subject: EmployeeHandle): Set<GraphRole> {
    const roles = new Set<GraphRole>();

    if (viewer === subject) {
      roles.add('self');
      return roles;
    }

    if (this.managerLineOf(subject).has(viewer)) {
      roles.add('managerLine');
    }
    if (this.peoplePartnerLineOf(subject).has(viewer)) {
      roles.add('pp');
    }

    return roles;
  }

  /**
   * The single audience a surface should be evaluated against.
   *
   * Precedence is `self`, then `pp`, then `managerLine`, then `colleague`. PP
   * outranks Manager line because no matrix cell grants a manager more than the
   * PP; where they differ, PP is the wider grant.
   */
  audienceFor(
    viewer: EmployeeHandle,
    subject: EmployeeHandle,
  ): Extract<ProfileAudience, 'self' | 'managerLine' | 'pp' | 'colleague'> {
    const roles = this.rolesFor(viewer, subject);

    if (roles.has('self')) {
      return 'self';
    }
    if (roles.has('pp')) {
      return 'pp';
    }
    if (roles.has('managerLine')) {
      return 'managerLine';
    }
    return 'colleague';
  }

  private directManagersOf(employee: EmployeeHandle): EmployeeHandle[] {
    const managers: EmployeeHandle[] = [];

    const supervisor = this.reportsToEdges.get(employee);
    if (supervisor !== undefined) {
      managers.push(supervisor);
    }

    for (const assignment of this.assignments) {
      if (assignment.employee !== employee || !assignment.active) {
        continue;
      }
      const project = this.projects.get(assignment.project);
      if (project === undefined) {
        continue;
      }
      if (project.pm !== undefined && project.pm !== employee) {
        managers.push(project.pm);
      }
      if (project.dm !== undefined && project.dm !== employee) {
        managers.push(project.dm);
      }
    }

    return managers;
  }
}

/** Entry point: `aGraph().reportsTo('ic', 'lead').build()`. */
export function aGraph(): GraphBuilder {
  return new GraphBuilder();
}
