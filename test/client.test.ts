import { describe, expect, it, vi } from "vitest";
import { IPTrustError, IPTrustClient, VERSION, type IPResponse } from "../src/index.js";

const sampleIP: IPResponse = {
  ip: "9.9.9.9",
  is_bogon: false,
  asn: {
    number: "AS19281",
    name: "QUAD9-AS-1",
    company: "Quad9",
    country: "US",
    route: "9.9.9.0/24",
    rir: "ARIN",
    type: "business",
    risk: 0.1,
    risk_label: "very_low",
  },
  location: {
    resolution: "city",
    city: "Berkeley",
    state: "California",
    country: "United States",
    latitude: 37.87,
    longitude: -122.27,
    area: { latitude: 37.87, longitude: -122.27, radius_km: 20 },
    meta: {
      country_iso2: "US",
      country_iso3: "USA",
      country_numeric_code: "840",
      country_phone_code: "1",
      country_capital: "Washington",
      country_currency: "USD",
      country_currency_name: "US Dollar",
      country_native: "United States",
      country_region: "Americas",
      country_subregion: "Northern America",
      country_emoji: "🇺🇸",
      country_emoji_u: "U+1F1FA U+1F1F8",
    },
  },
  vpn: { detected: false },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeClient(fetchMock: typeof fetch, extra: Record<string, unknown> = {}) {
  return new IPTrustClient("test-key", { fetch: fetchMock, ...extra });
}

describe("IPTrustClient constructor", () => {
  it("requires an API key", () => {
    vi.stubEnv("IPTRUST_API_KEY", "");
    try {
      expect(() => new IPTrustClient("")).toThrow(TypeError);
      expect(() => new IPTrustClient()).toThrow(TypeError);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("falls back to IPTRUST_API_KEY", async () => {
    vi.stubEnv("IPTRUST_API_KEY", "env-key");
    try {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(sampleIP));
      await new IPTrustClient(undefined, { fetch: fetchMock }).lookupIp("9.9.9.9");
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
      expect((init.headers as Record<string, string>)["X-API-Key"]).toBe("env-key");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("strips trailing slashes from baseUrl", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(sampleIP));
    await makeClient(fetchMock, { baseUrl: "https://example.test///" }).lookupIp("9.9.9.9");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://example.test/ip/9.9.9.9");
  });
});

describe("lookupIp", () => {
  it("sends the API key header and returns the typed body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(sampleIP));
    const result = await makeClient(fetchMock).lookupIp("9.9.9.9");

    expect(result).toEqual(sampleIP);
    expect(result.location?.meta.country_iso2).toBe("US");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.iptrust.co/ip/9.9.9.9");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe("test-key");
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe(`iptrust-node/${VERSION}`);
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
    expect(init.body).toBeUndefined();
  });

  it("URL-encodes IPv6 addresses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ...sampleIP, ip: "2001:db8::1" }));
    await makeClient(fetchMock).lookupIp(" 2001:db8::1 ");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.iptrust.co/ip/2001%3Adb8%3A%3A1");
  });

  it("URL-encodes path-like input so it cannot escape the /ip/ route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: { error_code: "bad_request", detail: "invalid ip address" } }, 400),
    );
    await expect(makeClient(fetchMock).lookupIp("../database?x=1")).rejects.toMatchObject({ status: 400 });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.iptrust.co/ip/..%2Fdatabase%3Fx%3D1");
  });

  it("rejects an empty IP without calling fetch", async () => {
    const fetchMock = vi.fn();
    await expect(makeClient(fetchMock).lookupIp("")).rejects.toThrow(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws IPTrustError with details from the API error body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: { error_code: "token_invalid", detail: "invalid api key" } }, 401),
    );
    const err = await makeClient(fetchMock).lookupIp("9.9.9.9").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(IPTrustError);
    const e = err as IPTrustError;
    expect(e.status).toBe(401);
    expect(e.errorCode).toBe("token_invalid");
    expect(e.detail).toBe("invalid api key");
    expect(e.message).toContain("401");
    expect(e.message).toContain("invalid api key");
  });

  it("surfaces error_id on internal errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        { error: { error_code: "internal_server_error", error_id: "abc-123", detail: "boom" } },
        500,
      ),
    );
    const err = (await makeClient(fetchMock).lookupIp("9.9.9.9").catch((e: unknown) => e)) as IPTrustError;
    expect(err.status).toBe(500);
    expect(err.errorId).toBe("abc-123");
  });

  it("handles non-JSON error bodies", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("Bad Gateway", { status: 502, statusText: "Bad Gateway" }),
    );
    const err = (await makeClient(fetchMock).lookupIp("9.9.9.9").catch((e: unknown) => e)) as IPTrustError;
    expect(err).toBeInstanceOf(IPTrustError);
    expect(err.status).toBe(502);
    expect(err.errorCode).toBeUndefined();
    expect(err.message).toContain("Bad Gateway");
  });

  it("throws IPTrustError when a 200 body is not JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("not json", { status: 200 }));
    const err = (await makeClient(fetchMock).lookupIp("9.9.9.9").catch((e: unknown) => e)) as IPTrustError;
    expect(err).toBeInstanceOf(IPTrustError);
    expect(err.errorCode).toBe("invalid_response");
  });

  it("times out and reports a timeout error", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const e = new Error("aborted");
            e.name = "AbortError";
            reject(e);
          });
        });
      });
      const promise = makeClient(fetchMock as unknown as typeof fetch, { timeout: 50 }).lookupIp("9.9.9.9");
      const assertion = expect(promise).rejects.toMatchObject({ errorCode: "timeout", status: 0 });
      await vi.advanceTimersByTimeAsync(60);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("propagates a user abort as-is", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        });
      });
    });
    const promise = makeClient(fetchMock as unknown as typeof fetch).lookupIp("9.9.9.9", {
      signal: controller.signal,
    });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("merges extra headers but never lets them override the API key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(sampleIP));
    await makeClient(fetchMock, {
      headers: { "User-Agent": "my-app/1.0", "X-API-Key": "nope" },
    }).lookupIp("9.9.9.9");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe("my-app/1.0");
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe("test-key");
  });
});

describe("databases", () => {
  const listBody = {
    databases: [
      {
        type: "geolocation",
        entitled: true,
        updated_at: "2026-08-24T03:12:44Z",
        formats: [{ format: "mmdb", size_bytes: 91234567, updated_at: "2026-08-24T03:12:44Z" }],
      },
    ],
  };
  const downloadBody = {
    type: "geolocation",
    format: "mmdb",
    filename: "iptrust-geolocation.mmdb",
    url: "https://files.example.test/iptrust-geolocation.mmdb?sig=abc",
    size_bytes: 91234567,
    updated_at: "2026-08-24T03:12:44Z",
    expires_at: "2026-08-24T11:41:09Z",
  };

  it("listDatabases hits GET /database", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(listBody));
    const result = await makeClient(fetchMock).listDatabases();
    expect(result.databases[0]?.type).toBe("geolocation");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.iptrust.co/database");
  });

  it("createDatabaseDownload posts JSON body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(downloadBody));
    const result = await makeClient(fetchMock).createDatabaseDownload("geolocation", "mmdb");
    expect(result.url).toBe(downloadBody.url);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.iptrust.co/database/download");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ type: "geolocation", format: "mmdb" });
  });

  it("createDatabaseDownload throws on 403", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: { error_code: "forbidden", detail: "plan excludes database" } }, 403),
    );
    await expect(makeClient(fetchMock).createDatabaseDownload("anonymization", "csv")).rejects.toMatchObject({
      status: 403,
      errorCode: "forbidden",
    });
  });

  it("downloadDatabase fetches the signed URL without the API key", async () => {
    const fileBody = new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(downloadBody))
      .mockResolvedValueOnce(fileBody);

    const { download, response } = await makeClient(fetchMock).downloadDatabase("geolocation", "mmdb");
    expect(download.filename).toBe("iptrust-geolocation.mmdb");
    expect(response).toBe(fileBody);

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe(downloadBody.url);
    expect(init.headers).toEqual({ "User-Agent": `iptrust-node/${VERSION}` });
  });

  it("downloadDatabase throws if the file fetch fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(downloadBody))
      .mockResolvedValueOnce(new Response("expired", { status: 403 }));
    await expect(makeClient(fetchMock).downloadDatabase("geolocation", "mmdb")).rejects.toMatchObject({
      status: 403,
    });
  });
});
