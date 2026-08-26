import { Clock } from '../../src/clock/clock.service';
import { DAY, DEFAULT_TEST_INSTANT, FixedClock, MINUTE } from './fixed-clock';

describe('FixedClock', () => {
  it('is usable wherever a Clock is expected', () => {
    const clock: Clock = new FixedClock();

    expect(clock.now().toISOString()).toBe(DEFAULT_TEST_INSTANT);
  });

  it('does not move on its own', () => {
    const clock = new FixedClock();
    const first = clock.nowMs();

    expect(clock.nowMs()).toBe(first);
  });

  it('moves forward by the given offset', () => {
    const clock = new FixedClock('2026-01-05T09:00:00.000Z');

    clock.advance(15 * MINUTE);

    expect(clock.now().toISOString()).toBe('2026-01-05T09:15:00.000Z');
  });

  it('moves backwards on a negative offset', () => {
    const clock = new FixedClock('2026-01-05T09:00:00.000Z');

    clock.advance(-1 * DAY);

    expect(clock.now().toISOString()).toBe('2026-01-04T09:00:00.000Z');
  });

  it('jumps to an absolute instant', () => {
    const clock = new FixedClock();

    clock.set('2027-06-30T23:59:59.000Z');

    expect(clock.now().toISOString()).toBe('2027-06-30T23:59:59.000Z');
  });

  it('cannot be moved by mutating a previously returned date', () => {
    const clock = new FixedClock('2026-01-05T09:00:00.000Z');

    const handed = clock.now();
    handed.setFullYear(2099);

    expect(clock.now().toISOString()).toBe('2026-01-05T09:00:00.000Z');
  });

  it('rejects an unparseable instant instead of reporting NaN time', () => {
    expect(() => new FixedClock('not-a-date')).toThrow(TypeError);
    expect(() => new FixedClock().set('not-a-date')).toThrow(TypeError);
  });

  it('rejects a non-finite offset', () => {
    expect(() => new FixedClock().advance(Number.NaN)).toThrow(TypeError);
    expect(() => new FixedClock().advance(Number.POSITIVE_INFINITY)).toThrow(
      TypeError,
    );
  });
});
