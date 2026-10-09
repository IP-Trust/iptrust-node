import type { APIErrorBody } from "./types.js";

/**
 * Thrown when the IP Trust API returns a non-2xx response, or when the
 * response cannot be parsed.
 */
export class IPTrustError extends Error {
  override readonly name = "IPTrustError";

  /** HTTP status code of the failed response. */
  readonly status: number;
  /** Machine-readable error code from the API, e.g. "token_invalid". */
  readonly errorCode: string | undefined;
  /** Human-friendly description from the API, if present. */
  readonly detail: string | undefined;
  /** Correlation ID for internal errors (status 500 or 502). */
  readonly errorId: string | undefined;
  /** Extra structured data attached to the error, if present. */
  readonly data: unknown;

  constructor(
    message: string,
    options: {
      status: number;
      errorCode?: string | undefined;
      detail?: string | undefined;
      errorId?: string | undefined;
      data?: unknown;
      cause?: unknown;
    },
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.status = options.status;
    this.errorCode = options.errorCode;
    this.detail = options.detail;
    this.errorId = options.errorId;
    this.data = options.data;
  }

  /** Build an error from a failed HTTP response. */
  static async fromResponse(response: Response): Promise<IPTrustError> {
    let body: APIErrorBody | undefined;
    let text = "";
    try {
      text = await response.text();
      const parsed: unknown = JSON.parse(text);
      if (isAPIErrorBody(parsed)) body = parsed;
    } catch {
      // Not JSON, or unreadable: fall through to a generic message.
    }

    const code = body?.error.error_code;
    const detail = body?.error.detail;
    const summary = detail ?? code ?? (text.length > 0 ? text.slice(0, 200) : response.statusText);
    const message = `IP Trust API request failed with status ${response.status}${summary ? `: ${summary}` : ""}`;

    return new IPTrustError(message, {
      status: response.status,
      errorCode: code,
      detail,
      errorId: body?.error.error_id,
      data: body?.error.data,
    });
  }
}

function isAPIErrorBody(value: unknown): value is APIErrorBody {
  if (typeof value !== "object" || value === null) return false;
  const err = (value as { error?: unknown }).error;
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as { error_code?: unknown }).error_code === "string"
  );
}
