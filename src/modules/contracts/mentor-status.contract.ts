export const MENTOR_STATUS_VALUES = [
  'mentor',
  'openToMentoring',
  'none',
] as const;

export type MentorStatus = (typeof MENTOR_STATUS_VALUES)[number];

export function computeMentorStatus(
  openToMentoring: boolean,
  hasActiveMentorPair: boolean,
): MentorStatus {
  if (hasActiveMentorPair) {
    return 'mentor';
  }
  if (openToMentoring) {
    return 'openToMentoring';
  }
  return 'none';
}
