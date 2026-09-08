import {
  MENTOR_STATUS_VALUES,
  MentorStatus,
} from './entities/mentorship-section.entity';

export { MENTOR_STATUS_VALUES };

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
