import { Test, TestingModule } from '@nestjs/testing';
import { ClockModule } from '../clock.module';
import { Clock, SystemClock } from '../clock.service';

describe('SystemClock', () => {
  it('reports the wall clock', () => {
    const clock = new SystemClock();

    const before = Date.now();
    const observed = clock.nowMs();
    const after = Date.now();

    expect(observed).toBeGreaterThanOrEqual(before);
    expect(observed).toBeLessThanOrEqual(after);
  });

  it('returns now() and nowMs() for the same instant', () => {
    const clock = new SystemClock();

    expect(Math.abs(clock.now().getTime() - clock.nowMs())).toBeLessThan(50);
  });
});

describe('ClockModule', () => {
  it('resolves Clock to the system implementation', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ClockModule],
    }).compile();

    expect(moduleRef.get(Clock)).toBeInstanceOf(SystemClock);

    await moduleRef.close();
  });
});
