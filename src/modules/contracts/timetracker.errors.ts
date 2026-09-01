/**
 * Thrown for any failure calling the TimeTracker external API — unreachable
 * host, a rejected key (401/403), or any other non-2xx response. Always
 * names the endpoint (and status code, when one was received) so the seed
 * script's failure log matches the spec's "error logged with endpoint +
 * status code" requirement without the caller having to reconstruct it.
 */
export class TimetrackerApiError extends Error {
  constructor(
    public readonly endpoint: string,
    public readonly status?: number,
    cause?: unknown,
    public readonly responseBody?: string,
  ) {
    super(
      status === undefined
        ? `TimeTracker API call to ${endpoint} failed: ${describeCause(cause)}`
        : formatHttpFailure(endpoint, status, responseBody),
    );
    this.name = 'TimetrackerApiError';
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

function describeCause(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message;
  }
  return String(cause);
}

function formatHttpFailure(
  endpoint: string,
  status: number,
  responseBody?: string,
): string {
  const trimmedBody = responseBody?.trim();
  if (trimmedBody) {
    return `TimeTracker API call to ${endpoint} failed with status ${status}: ${trimmedBody}`;
  }
  return `TimeTracker API call to ${endpoint} failed with status ${status}`;
}
