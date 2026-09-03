import { aGraph } from './graph-factory';

describe('relationship graph', () => {
  describe('reports-to closure (reporting line)', () => {
    it('grants reporting-line access to the direct supervisor', () => {
      const graph = aGraph().reportsTo('ic', 'lead').build();

      expect(graph.audienceFor('lead', 'ic')).toBe('reportingLine');
    });

    it('grants reporting-line access at arbitrary depth', () => {
      const graph = aGraph()
        .reportsTo('ic', 'lead')
        .reportsTo('lead', 'head')
        .reportsTo('head', 'cto')
        .build();

      expect(graph.reportingLineOf('ic')).toEqual(
        new Set(['lead', 'head', 'cto']),
      );
    });

    it('does not grant access downwards', () => {
      const graph = aGraph().reportsTo('ic', 'lead').build();

      expect(graph.audienceFor('ic', 'lead')).toBe('colleague');
    });

    it('does not grant access sideways', () => {
      const graph = aGraph()
        .reportsTo('ic', 'lead')
        .reportsTo('peer', 'lead')
        .build();

      expect(graph.audienceFor('peer', 'ic')).toBe('colleague');
    });

    it('terminates on a cyclic reporting line', () => {
      const graph = aGraph().reportsTo('a', 'b').reportsTo('b', 'a').build();

      expect(graph.reportingLineOf('a')).toEqual(new Set(['b']));
    });
  });

  describe('project assignment (project line)', () => {
    it('grants project-line access to the PM and the DM', () => {
      const graph = aGraph()
        .project('atlas', { pm: 'pm', dm: 'dm' })
        .assign('ic', 'atlas')
        .build();

      expect(graph.projectLineOf('ic')).toEqual(new Set(['pm', 'dm']));
      expect(graph.audienceFor('pm', 'ic')).toBe('projectLine');
      expect(graph.audienceFor('dm', 'ic')).toBe('projectLine');
    });

    it('grants nothing once the assignment has ended', () => {
      const graph = aGraph()
        .project('atlas', { pm: 'pm', dm: 'dm' })
        .assign('ic', 'atlas', { active: false })
        .build();

      expect(graph.audienceFor('pm', 'ic')).toBe('colleague');
    });

    it('does not make a project member a manager of their peers', () => {
      const graph = aGraph()
        .project('atlas', { pm: 'pm' })
        .assign('ic', 'atlas')
        .assign('peer', 'atlas')
        .build();

      expect(graph.audienceFor('peer', 'ic')).toBe('colleague');
    });

    it('keeps reporting line and project line separate on the oracle', () => {
      const graph = aGraph()
        .reportsTo('ic', 'unitManager')
        .project('atlas', { dm: 'dm' })
        .assign('ic', 'atlas')
        .build();

      expect(graph.reportingLineOf('ic')).toEqual(new Set(['unitManager']));
      expect(graph.projectLineOf('ic')).toEqual(new Set(['dm']));
      expect(graph.rolesFor('unitManager', 'ic')).toEqual(
        new Set(['reportingLine']),
      );
      expect(graph.rolesFor('dm', 'ic')).toEqual(new Set(['projectLine']));
    });

    it('closes project line over the PM reporting chain', () => {
      const graph = aGraph()
        .project('atlas', { pm: 'pm' })
        .assign('ic', 'atlas')
        .reportsTo('pm', 'head')
        .build();

      expect(graph.projectLineOf('ic')).toEqual(new Set(['pm', 'head']));
      expect(graph.reportingLineOf('ic')).toEqual(new Set());
    });

    it('resolves project-line-only viewers to projectLine, not colleague', () => {
      const graph = aGraph()
        .project('atlas', { pm: 'pm' })
        .assign('ic', 'atlas')
        .build();

      expect(graph.audienceFor('pm', 'ic')).toBe('projectLine');
      expect(graph.audienceFor('pm', 'ic')).not.toBe('colleague');
    });
  });

  describe('people partner line', () => {
    it('grants PP access to the assigned partner', () => {
      const graph = aGraph().peoplePartner('ic', 'pp').build();

      expect(graph.audienceFor('pp', 'ic')).toBe('pp');
    });

    it('grants PP access to the HR line above the partner', () => {
      const graph = aGraph()
        .peoplePartner('ic', 'pp')
        .hrLineAbove('pp', 'hrLead')
        .hrLineAbove('hrLead', 'hrDirector')
        .build();

      expect(graph.peoplePartnerLineOf('ic')).toEqual(
        new Set(['pp', 'hrLead', 'hrDirector']),
      );
    });

    it('does not grant PP access to a partner of somebody else', () => {
      const graph = aGraph()
        .peoplePartner('ic', 'pp')
        .peoplePartner('other', 'otherPp')
        .build();

      expect(graph.audienceFor('otherPp', 'ic')).toBe('colleague');
    });
  });

  describe('audience precedence', () => {
    it('treats the subject as self regardless of other relations', () => {
      const graph = aGraph()
        .reportsTo('ic', 'ic')
        .peoplePartner('ic', 'ic')
        .build();

      expect(graph.rolesFor('ic', 'ic')).toEqual(new Set(['self']));
    });

    it('reports both roles when a viewer holds reporting line and PP access', () => {
      const graph = aGraph()
        .reportsTo('ic', 'both')
        .peoplePartner('ic', 'both')
        .build();

      expect(graph.rolesFor('both', 'ic')).toEqual(
        new Set(['reportingLine', 'pp']),
      );
    });

    it('resolves that viewer to PP, the wider of the two grants', () => {
      const graph = aGraph()
        .reportsTo('ic', 'both')
        .peoplePartner('ic', 'both')
        .build();

      expect(graph.audienceFor('both', 'ic')).toBe('pp');
    });

    it('falls back to colleague for an unrelated authenticated employee', () => {
      const graph = aGraph().employee('ic', 'stranger').build();

      expect(graph.audienceFor('stranger', 'ic')).toBe('colleague');
    });
  });

  it('registers every handle mentioned by any relation', () => {
    const graph = aGraph()
      .reportsTo('ic', 'lead')
      .project('atlas', { pm: 'pm' })
      .assign('ic', 'atlas')
      .peoplePartner('ic', 'pp')
      .build();

    expect(graph.employees).toEqual(['ic', 'lead', 'pm', 'pp']);
  });
});
