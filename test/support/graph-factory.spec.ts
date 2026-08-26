import { aGraph } from './graph-factory';

describe('relationship graph', () => {
  describe('reports-to closure', () => {
    it('grants manager access to the direct supervisor', () => {
      const graph = aGraph().reportsTo('ic', 'lead').build();

      expect(graph.audienceFor('lead', 'ic')).toBe('managerLine');
    });

    it('grants manager access at arbitrary depth', () => {
      const graph = aGraph()
        .reportsTo('ic', 'lead')
        .reportsTo('lead', 'head')
        .reportsTo('head', 'cto')
        .build();

      expect(graph.managerLineOf('ic')).toEqual(
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

      expect(graph.managerLineOf('a')).toEqual(new Set(['b']));
    });
  });

  describe('project assignment', () => {
    it('grants manager access to the PM and the DM', () => {
      const graph = aGraph()
        .project('atlas', { pm: 'pm', dm: 'dm' })
        .assign('ic', 'atlas')
        .build();

      expect(graph.managerLineOf('ic')).toEqual(new Set(['pm', 'dm']));
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

    it('unions the two relations, so a unit manager and a DM both see the person', () => {
      const graph = aGraph()
        .reportsTo('ic', 'unitManager')
        .project('atlas', { dm: 'dm' })
        .assign('ic', 'atlas')
        .build();

      expect(graph.managerLineOf('ic')).toEqual(new Set(['unitManager', 'dm']));
    });

    it('closes over the union, so the manager of a PM also sees the PM\u2019s people', () => {
      const graph = aGraph()
        .project('atlas', { pm: 'pm' })
        .assign('ic', 'atlas')
        .reportsTo('pm', 'head')
        .build();

      expect(graph.managerLineOf('ic')).toEqual(new Set(['pm', 'head']));
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

    it('reports both roles when a viewer holds manager and PP access', () => {
      const graph = aGraph()
        .reportsTo('ic', 'both')
        .peoplePartner('ic', 'both')
        .build();

      expect(graph.rolesFor('both', 'ic')).toEqual(
        new Set(['managerLine', 'pp']),
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
