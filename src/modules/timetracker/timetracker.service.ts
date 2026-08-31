import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TimetrackerApiError } from './timetracker.errors';
import {
  AccountingReportRequest,
  AccountingReportResponse,
  GetTalentProjectsResponse,
  ProjectStatus,
} from './timetracker.types';

const ACCOUNTING_ENDPOINT = 'POST /api/accounting/report';
const TALENTS_ENDPOINT = 'GET /api/projects/talents';

/** Bound on how long a single TimeTracker call may hang (connect + response). */
const REQUEST_TIMEOUT_MS = 15000;

/**
 * HTTP client for the TimeTracker External API (`docs/api-external-openapi.json`).
 *
 * Consumed by `prisma/seed.ts` (Story 1.16) and runtime leave/project sync in
 * `integrations` (Epic 13). Uses Node 22's global `fetch`; no HTTP client
 * dependency needed for two calls.
 *
 * The two endpoints use independent, non-interchangeable API keys
 * (`AccountingApiKey` / `TalentsApiKey` — the wrong one gets a 403), so each
 * method reads its own `ConfigService` key rather than sharing one.
 */
@Injectable()
export class TimetrackerService {
  constructor(private readonly config: ConfigService) {}

  async fetchAccountingReport(
    request: AccountingReportRequest,
  ): Promise<AccountingReportResponse> {
    const url = new URL(
      '/api/accounting/report',
      this.config.getOrThrow<string>('TIMETRACKER_BASE_URL'),
    );
    const response = await this.request(url, ACCOUNTING_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': this.config.getOrThrow<string>(
          'TIMETRACKER_ACCOUNTING_API_KEY',
        ),
      },
      body: JSON.stringify(request),
    });
    return this.parseJson<AccountingReportResponse>(
      response,
      ACCOUNTING_ENDPOINT,
    );
  }

  async fetchTalentsProjects(
    statuses?: ProjectStatus[],
  ): Promise<GetTalentProjectsResponse> {
    const url = new URL(
      '/api/projects/talents',
      this.config.getOrThrow<string>('TIMETRACKER_BASE_URL'),
    );
    for (const status of statuses ?? []) {
      url.searchParams.append('statuses', String(status));
    }
    const response = await this.request(url, TALENTS_ENDPOINT, {
      method: 'GET',
      headers: {
        'X-Api-Key': this.config.getOrThrow<string>(
          'TIMETRACKER_TALENTS_API_KEY',
        ),
      },
    });
    return this.parseJson<GetTalentProjectsResponse>(
      response,
      TALENTS_ENDPOINT,
    );
  }

  /**
   * Shared fetch + error-mapping: unreachable host, a stalled/hung connection
   * (bounded by `REQUEST_TIMEOUT_MS` via `AbortSignal.timeout`), and non-2xx
   * status all become a `TimetrackerApiError`. A timeout surfaces from
   * `fetch` as an `AbortError`, which lands in the same catch block below.
   */
  private async request(
    url: URL,
    endpointLabel: string,
    init: RequestInit,
  ): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new TimetrackerApiError(endpointLabel, undefined, error);
    }
    if (!response.ok) {
      const responseBody = await this.readResponseBody(response);
      throw new TimetrackerApiError(
        endpointLabel,
        response.status,
        undefined,
        responseBody,
      );
    }
    return response;
  }

  private async readResponseBody(
    response: Response,
  ): Promise<string | undefined> {
    try {
      const text = await response.text();
      return text.length > 0 ? text : undefined;
    } catch {
      return undefined;
    }
  }

  /** Parses a 2xx response body as JSON, mapping a malformed body to `TimetrackerApiError` too. */
  private async parseJson<T>(
    response: Response,
    endpointLabel: string,
  ): Promise<T> {
    try {
      const data: unknown = await response.json();
      if (data == null || typeof data !== 'object') {
        throw new TimetrackerApiError(
          endpointLabel,
          response.status,
          new Error('Response body is not a JSON object'),
        );
      }
      return data as T;
    } catch (error) {
      if (error instanceof TimetrackerApiError) {
        throw error;
      }
      throw new TimetrackerApiError(endpointLabel, response.status, error);
    }
  }
}
