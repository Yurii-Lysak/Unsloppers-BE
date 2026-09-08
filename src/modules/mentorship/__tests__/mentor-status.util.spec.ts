import { computeMentorStatus } from '../mentor-status.util';

describe('computeMentorStatus', () => {
  it('returns mentor when an active mentor pair exists', () => {
    expect(computeMentorStatus(true, true)).toBe('mentor');
    expect(computeMentorStatus(false, true)).toBe('mentor');
  });

  it('returns openToMentoring when flag is on and no active pair', () => {
    expect(computeMentorStatus(true, false)).toBe('openToMentoring');
  });

  it('returns none when flag is off and no active pair', () => {
    expect(computeMentorStatus(false, false)).toBe('none');
  });
});
