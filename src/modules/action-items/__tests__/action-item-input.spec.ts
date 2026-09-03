import { Clock } from '../../../clock/clock.service';
import { isActionItemOverdue, utcCalendarDateMs } from '../action-item-input';

describe('action-item-input overdue derivation', () => {
  const clockAt = (iso: string): Clock => ({
    now: () => new Date(iso),
    nowMs: () => new Date(iso).getTime(),
  });

  describe('utcCalendarDateMs', () => {
    it('normalizes to UTC calendar midnight regardless of time-of-day', () => {
      const lateUtc = new Date('2026-01-05T23:59:59.000Z');
      expect(utcCalendarDateMs(lateUtc)).toBe(Date.UTC(2026, 0, 5));
    });
  });

  describe('isActionItemOverdue', () => {
    it.each([
      {
        label: 'open past due',
        status: 'open',
        dueDate: new Date('2025-12-31T00:00:00.000Z'),
        clock: '2026-01-05T09:00:00.000Z',
        expected: true,
      },
      {
        label: 'open due today at late UTC',
        status: 'open',
        dueDate: new Date('2026-01-05T00:00:00.000Z'),
        clock: '2026-01-05T23:59:59.000Z',
        expected: false,
      },
      {
        label: 'open future due',
        status: 'open',
        dueDate: new Date('2026-09-20T00:00:00.000Z'),
        clock: '2026-01-05T09:00:00.000Z',
        expected: false,
      },
      {
        label: 'completed past due',
        status: 'completed',
        dueDate: new Date('2025-12-31T00:00:00.000Z'),
        clock: '2026-01-05T09:00:00.000Z',
        expected: false,
      },
      {
        label: 'cancelled past due',
        status: 'cancelled',
        dueDate: new Date('2025-12-31T00:00:00.000Z'),
        clock: '2026-01-05T09:00:00.000Z',
        expected: false,
      },
    ])('$label', ({ status, dueDate, clock, expected }) => {
      expect(isActionItemOverdue(status, dueDate, clockAt(clock))).toBe(
        expected,
      );
    });

    it('flips when clock retreats without a DB write', () => {
      const dueDate = new Date('2025-12-31T00:00:00.000Z');
      const advancing = clockAt('2026-01-05T09:00:00.000Z');
      expect(isActionItemOverdue('open', dueDate, advancing)).toBe(true);

      const retreating = clockAt('2025-12-15T12:00:00.000Z');
      expect(isActionItemOverdue('open', dueDate, retreating)).toBe(false);
    });
  });
});
