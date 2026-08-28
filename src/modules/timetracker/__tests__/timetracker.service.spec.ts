import { ConfigService } from '@nestjs/config';
import { TimetrackerApiError } from '../timetracker.errors';
import { TimetrackerService } from '../timetracker.service';

function makeConfig(values: Record<string, string>): ConfigService {
  return {
    getOrThrow: (key: string) => {
      if (!(key in values)) {
        throw new Error(`Missing config key: ${key}`);
      }
      return values[key];
    },
  } as unknown as ConfigService;
}

describe('TimetrackerService', () => {
  const config = makeConfig({
    TIMETRACKER_BASE_URL: 'https://tt.example.test/',
    TIMETRACKER_ACCOUNTING_API_KEY: 'accounting-key',
    TIMETRACKER_TALENTS_API_KEY: 'talents-key',
  });

  let fetchMock: jest.Mock;
  const originalFetch = global.fetch;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('POSTs the accounting report with the Accounting key and month/year body', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ employees: [] }),
    });

    const service = new TimetrackerService(config);
    await service.fetchAccountingReport({ month: 7, year: 2026 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(String(url)).toBe('https://tt.example.test/api/accounting/report');
    expect(init.method).toBe('POST');
    expect(headers['X-Api-Key']).toBe('accounting-key');
    expect(JSON.parse(init.body as string)).toEqual({ month: 7, year: 2026 });
  });

  it('GETs talents projects with the Talents key', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ projects: [], statuses: [], types: [] }),
    });

    const service = new TimetrackerService(config);
    await service.fetchTalentsProjects();

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(String(url)).toBe('https://tt.example.test/api/projects/talents');
    expect(headers['X-Api-Key']).toBe('talents-key');
  });

  it('throws TimetrackerApiError with the endpoint, status, and response body on a rejected key (403)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve('{"message":"Forbidden"}'),
    });

    const service = new TimetrackerService(config);
    const error = await service
      .fetchAccountingReport({ month: 7, year: 2026 })
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      name: 'TimetrackerApiError',
      endpoint: 'POST /api/accounting/report',
      status: 403,
    });
    expect(String(error)).toContain('{"message":"Forbidden"}');
  });

  it('throws TimetrackerApiError when the host is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    const service = new TimetrackerService(config);
    await expect(service.fetchTalentsProjects()).rejects.toBeInstanceOf(
      TimetrackerApiError,
    );
  });

  it('throws TimetrackerApiError (not a raw SyntaxError) on a malformed JSON body', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON')),
    });

    const service = new TimetrackerService(config);
    await expect(
      service.fetchAccountingReport({ month: 7, year: 2026 }),
    ).rejects.toMatchObject({
      name: 'TimetrackerApiError',
      endpoint: 'POST /api/accounting/report',
      status: 200,
    });
  });

  it('throws TimetrackerApiError when a 2xx body parses to null', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(null),
    });

    const service = new TimetrackerService(config);
    await expect(
      service.fetchAccountingReport({ month: 7, year: 2026 }),
    ).rejects.toMatchObject({
      name: 'TimetrackerApiError',
      endpoint: 'POST /api/accounting/report',
      status: 200,
    });
  });

  it('maps a timeout AbortError (fetch throws when the signal fires) to TimetrackerApiError', async () => {
    fetchMock.mockRejectedValue(
      new DOMException('This operation was aborted', 'AbortError'),
    );

    const service = new TimetrackerService(config);
    await expect(service.fetchTalentsProjects()).rejects.toMatchObject({
      name: 'TimetrackerApiError',
      endpoint: 'GET /api/projects/talents',
      status: undefined,
    });
  });

  it('passes an AbortSignal on every request so a stalled response is bounded', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ projects: [], statuses: [], types: [] }),
    });

    const service = new TimetrackerService(config);
    await service.fetchTalentsProjects();

    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
