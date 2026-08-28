import { buildSyntheticProfile } from '../seed.synthetic';

describe('buildSyntheticProfile', () => {
  const now = new Date('2026-08-28T00:00:00Z');

  it('is deterministic for the same seed key', () => {
    const a = buildSyntheticProfile('same@example.com', now);
    const b = buildSyntheticProfile('same@example.com', now);
    expect(a).toEqual(b);
  });

  it('produces an effectiveFrom strictly before now', () => {
    const profile = buildSyntheticProfile('anyone@example.com', now);
    expect(profile.effectiveFrom.getTime()).toBeLessThan(now.getTime());
  });

  it('picks from the documented value sets', () => {
    const profile = buildSyntheticProfile('anyone@example.com', now);
    expect(['Junior', 'Middle', 'Senior', 'Lead']).toContain(profile.grade);
    expect(['FTE', 'Subcontractor']).toContain(profile.employmentType);
  });

  it('derives each dimension from an independently salted hash, not correlated bit-shifts', () => {
    // Regression for a bug where grade/position/department/employmentType were
    // all derived from the same hash shifted by 2 bits each time, making them
    // highly correlated per employee. Over a reasonably sized sample, grade
    // should not always co-occur with the same position for a fixed employmentType
    // (a fully-correlated derivation would produce a rigid 1:1 pairing).
    const pairs = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const profile = buildSyntheticProfile(`user${i}@example.com`, now);
      pairs.add(`${profile.grade}|${profile.position}`);
    }
    // 4 grades * 5 positions = 20 possible pairings; a correlated derivation
    // collapses this to far fewer distinct combinations than independent
    // sampling would produce.
    expect(pairs.size).toBeGreaterThan(10);
  });
});
