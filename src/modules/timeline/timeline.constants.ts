/** Functional permission key from access-model.md — future C8 gate (Story 1-4). */
export const EDIT_CAREER_TIMELINE_PERMISSION = 'edit_career_timeline';

/** Internal event `type` strings (AD-7); UI labels are render-time. */
export const TIMELINE_EVENT_TYPES = [
  'grade',
  'position',
  'department',
  'employmentType',
  'joining',
  'extendedLeave',
  'mentorshipStart',
  'mentorshipEnd',
] as const;

export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];
