import { IPTrustError } from "./error.js";
import type {
  DatabaseDownload,
  DatabaseFormat,
  DatabaseListResponse,
  DatabaseType,
  IPResponse,
} from "./types.js";

/** Injected at build time from package.json (see tsup.config.ts / vitest.config.ts). */
declare const __SDK_VERSION__: string;

export const DEFAULT_BASE_URL = "https://api.iptrust.co";
export const DEFAULT_TIMEOUT_MS = 10_000;
/** SDK version, e.g. "0.1.0". */
export const VERSION: string = __SDK_VERSION__;
const USER_AGENT = `iptrust-node/${VERSION}`;

/** Options accepted by the {@link IPTrustClient} constructor. */
export interface IPTrustClientOptions {
  /** API base URL. Defaults to `https://api.iptrust.co`. */
  baseUrl?: string;
  /**
   * Request timeout in milliseconds. Defaults to 10 seconds. Set to `0` to
   * disable.
   */
  timeout?: number;
  /**
   * Custom `fetch` implementation. Defaults to the global `fetch`. Useful for
   * tests, proxies, or older runtimes with a polyfill.
   */
  fetch?: typeof fetch;
  /** Extra headers sent with every request. */
  headers?: Record<string, string>;
}

/** Per-request options. */
export interface RequestOptions {
  /** Abort signal to cancel the request. Combined with the client timeout. */
  signal?: AbortSignal;
}

/**
 * Client for the IP Trust API.
 *
 * ```ts
 * import { IPTrustClient } from "@iptrust/sdk";
 *
 * const iptrust = new IPTrustClient(); // reads process.env.IPTRUST_API_KEY
 * // or: new IPTrustClient("YOUR_API_KEY")
 * const result = await iptrust.lookupIp("9.9.9.9");
 * console.log(result.location?.country, result.vpn?.detected);
 * ```
 */
export class IPTrustClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly fetchImpl: typeof fetch;
  private readonly extraHeaders: Record<string, string>;

  /**
   * @param apiKey Your IP Trust API key. Defaults to the `IPTRUST_API_KEY`
   * environment variable.
   */
  constructor(apiKey?: string, options: IPTrustClientOptions = {}) {
    apiKey ??= globalThis.process?.env?.IPTRUST_API_KEY;
    if (typeof apiKey !== "string" || apiKey.trim() === "") {
      throw new TypeError(
        "IPTrustClient: an API key is required. Pass it to the constructor or set IPTRUST_API_KEY.",
      );
    }
    this.apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    this.extraHeaders = options.headers ?? {};

    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      throw new TypeError(
        "IPTrustClient: no fetch implementation available. Use Node 18+ or pass `fetch` in options.",
      );
    }
    this.fetchImpl = fetchImpl;
  }

  /**
   * Look up intelligence for an IPv4 or IPv6 address.
   *
   * @throws {IPTrustError} on a non-2xx response (400 invalid IP, 401 bad key,
   * 403 no access, 429 quota exceeded, 500 server error).
   */
  async lookupIp(ip: string, options: RequestOptions = {}): Promise<IPResponse> {
    if (typeof ip !== "string" || ip.trim() === "") {
      throw new TypeError("IPTrustClient.lookupIp: an IP address is required");
    }
    return this.request<IPResponse>("GET", `/ip/${encodeURIComponent(ip.trim())}`, options);
  }

  /**
   * List the databases available for download, including ones your plan
   * does not include (see `entitled`).
   */
  async listDatabases(options: RequestOptions = {}): Promise<DatabaseListResponse> {
    return this.request<DatabaseListResponse>("GET", "/database", options);
  }

  /**
   * Generate a temporary signed URL for downloading a database file. The URL
   * is valid for about an hour; check `expires_at`.
   *
   * @throws {IPTrustError} 400 unknown type/format, 403 plan excludes this
   * database, 404 not published in that format.
   */
  async createDatabaseDownload(
    type: DatabaseType,
    format: DatabaseFormat,
    options: RequestOptions = {},
  ): Promise<DatabaseDownload> {
    return this.request<DatabaseDownload>("POST", "/database/download", options, { type, format });
  }

  /**
   * Request a signed URL and fetch the file in one step. Resolves to the raw
   * `Response` so you can stream the body to disk:
   *
   * ```ts
   * import { createWriteStream } from "node:fs";
   * import { Readable } from "node:stream";
   * import { pipeline } from "node:stream/promises";
   *
   * const { response, download } = await iptrust.downloadDatabase("geolocation", "mmdb");
   * if (!response.body) throw new Error("empty response body");
   * await pipeline(Readable.fromWeb(response.body), createWriteStream(download.filename));
   * ```
   */
  async downloadDatabase(
    type: DatabaseType,
    format: DatabaseFormat,
    options: RequestOptions = {},
  ): Promise<{ download: DatabaseDownload; response: Response }> {
    const download = await this.createDatabaseDownload(type, format, options);
    // The signed URL carries its own auth; do not send the API key to it.
    const response = await this.fetchImpl(download.url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT },
      ...(options.signal ? { signal: options.signal } : {}),
    });
    if (!response.ok) {
      throw await IPTrustError.fromResponse(response);
    }
    return { download, response };
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    options: RequestOptions,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
      ...this.extraHeaders,
      "X-API-Key": this.apiKey,
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const { signal, cleanup } = this.buildSignal(options.signal);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        ...(signal ? { signal } : {}),
      });
    } catch (cause) {
      cleanup();
      if (isAbortError(cause) && options.signal?.aborted !== true) {
        throw new IPTrustError(`IP Trust API request timed out after ${this.timeout}ms`, {
          status: 0,
          errorCode: "timeout",
          cause,
        });
      }
      throw cause;
    }

    try {
      if (!response.ok) {
        throw await IPTrustError.fromResponse(response);
      }
      try {
        return (await response.json()) as T;
      } catch (cause) {
        throw new IPTrustError("IP Trust API returned a response that was not valid JSON", {
          status: response.status,
          errorCode: "invalid_response",
          cause,
        });
      }
    } finally {
      cleanup();
    }
  }

  private buildSignal(userSignal: AbortSignal | undefined): {
    signal: AbortSignal | undefined;
    cleanup: () => void;
  } {
    if (this.timeout <= 0) {
      return { signal: userSignal, cleanup: () => {} };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    const onUserAbort = () => controller.abort(userSignal?.reason);
    if (userSignal) {
      if (userSignal.aborted) controller.abort(userSignal.reason);
      else userSignal.addEventListener("abort", onUserAbort, { once: true });
    }
    return {
      signal: controller.signal,
      cleanup: () => {
        clearTimeout(timer);
        userSignal?.removeEventListener("abort", onUserAbort);
      },
    };
  }
}

function isAbortError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: unknown }).name === "AbortError"
  );
}
