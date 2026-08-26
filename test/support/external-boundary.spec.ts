import { ExternalBoundary } from './external-boundary';

describe('ExternalBoundary', () => {
  let boundary: ExternalBoundary;

  beforeEach(async () => {
    boundary = await ExternalBoundary.start('timetracker-leaves');
  });

  afterEach(async () => {
    await boundary.stop();
  });

  it('answers with the configured payload', async () => {
    boundary.behave({ kind: 'respond', body: { leaves: [] } });

    const res = await fetch(`${boundary.url}/leaves`);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ leaves: [] });
  });

  it('answers with the configured failure status', async () => {
    boundary.behave({ kind: 'respond', status: 503 });

    const res = await fetch(`${boundary.url}/leaves`);

    expect(res.status).toBe(503);
  });

  it('serves a body that is not parseable as JSON', async () => {
    boundary.behave({ kind: 'malformed' });

    const res = await fetch(`${boundary.url}/leaves`);

    await expect(res.json()).rejects.toThrow();
  });

  it('lets the caller time out when the far end never answers', async () => {
    boundary.behave({ kind: 'hang' });

    await expect(
      fetch(`${boundary.url}/leaves`, { signal: AbortSignal.timeout(150) }),
    ).rejects.toThrow();
  });

  it('surfaces a peer reset as a network error', async () => {
    boundary.behave({ kind: 'reset' });

    await expect(fetch(`${boundary.url}/leaves`)).rejects.toThrow();
  });

  it('delays the answer by the configured amount', async () => {
    boundary.behave({ kind: 'respond', body: {}, delayMs: 120 });

    const started = Date.now();
    await fetch(`${boundary.url}/leaves`);

    expect(Date.now() - started).toBeGreaterThanOrEqual(100);
  });

  it('records what the client actually sent', async () => {
    await fetch(`${boundary.url}/leaves?from=2026-01-01`, {
      method: 'POST',
      headers: { 'x-api-key': 'test-key' },
      body: '{"employeeId":"e-1"}',
    });

    expect(boundary.requests).toHaveLength(1);
    const [recorded] = boundary.requests;
    expect(recorded.method).toBe('POST');
    expect(recorded.path).toBe('/leaves?from=2026-01-01');
    expect(recorded.headers['x-api-key']).toBe('test-key');
    expect(recorded.body).toBe('{"employeeId":"e-1"}');
  });

  it('refuses connections while offline and accepts them again after', async () => {
    const url = boundary.url;

    await boundary.goOffline();
    await expect(fetch(`${url}/leaves`)).rejects.toThrow();

    await boundary.comeBackOnline();
    expect(boundary.url).toBe(url);
    await expect(fetch(`${url}/leaves`)).resolves.toMatchObject({
      status: 200,
    });
  });

  it('clears recorded traffic and behaviour on reset', async () => {
    boundary.behave({ kind: 'respond', status: 500 });
    await fetch(`${boundary.url}/leaves`);

    boundary.reset();

    expect(boundary.requests).toHaveLength(0);
    const res = await fetch(`${boundary.url}/leaves`);
    expect(res.status).toBe(200);
  });
});
