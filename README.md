# @iptrust/sdk

Official Node.js SDK for the [IP Trust](https://iptrust.co) API. Look up geolocation, ASN, company, hosting, known bot, VPN, proxy, Tor and privacy relay data for any IPv4 or IPv6 address, and download the underlying databases. Works in JavaScript and TypeScript, ships ESM and CommonJS builds, has no runtime dependencies, and uses the built-in `fetch` (Node 20+).

Get a free API key from the [IP Trust dashboard](https://dashboard.iptrust.co/). IP Trust is free for up to 10,000 requests a month.

## Install

```sh
npm install @iptrust/sdk
```

## Quick start

```ts
import { IPTrustClient } from "@iptrust/sdk";

const iptrust = new IPTrustClient("your-api-key"); // Or reads IPTRUST_API_KEY from the environment
                                                   // when not specified

const result = await iptrust.lookupIp("9.9.9.9");

console.log(result.location?.country);      // "United States"
console.log(result.asn?.number);            // "AS19281"
console.log(result.vpn?.detected);          // false
console.log(result.known_bot?.name);        // undefined unless a bot was detected
```

CommonJS works too:

```js
const { IPTrustClient } = require("@iptrust/sdk");
```

## IP lookup

`lookupIp(ip)` calls `GET /ip/{ip}` and resolves to an `IPResponse`. The response has the same structure on every plan; sections your plan does not include are absent, so each top-level section is optional in the type.

```ts
const r = await iptrust.lookupIp("2001:4860:4860::8888");

if (r.is_bogon) { /* reserved / unroutable */ }

r.asn?.risk_label;          // "very_low" | "low" | "moderate" | "high" | "very_high"
r.location?.resolution;     // "city" | "state" | "country"
r.location?.area.radius_km; // expected area, handy for impossible-travel checks
r.proxy?.type;              // "residential" | "open"
```

Full field reference: https://iptrust.co/docs

## Database downloads

For plans that include database downloads.

```ts
// What's available and what your plan covers
const { databases } = await iptrust.listDatabases();
for (const db of databases) {
  console.log(db.type, db.entitled, db.formats.map((f) => f.format));
}

// Get a signed URL (valid about an hour, see `expires_at`)
const link = await iptrust.createDatabaseDownload("geolocation", "mmdb");
console.log(link.url, link.filename, link.size_bytes);

// Or fetch the file in one step and stream it to disk
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const { download, response } = await iptrust.downloadDatabase("geolocation", "mmdb");
if (!response.body) throw new Error("empty response body");
await pipeline(Readable.fromWeb(response.body), createWriteStream(download.filename));
```

The signed URL carries its own authorisation. Anyone holding it can download the file until it expires, so treat it like a credential.

## Errors

Any non-2xx response throws an `IPTrustError`:

```ts
import { IPTrustError } from "@iptrust/sdk";

try {
  await iptrust.lookupIp("not-an-ip");
} catch (err) {
  if (err instanceof IPTrustError) {
    err.status;     // 400
    err.errorCode;  // e.g. "bad_request", "token_invalid", "request_limit_exceeded"
    err.detail;     // human-readable message from the API
    err.errorId;    // set on 5xx responses, quote it to support
  }
}
```

| Status | Meaning |
|--------|---------|
| 400 | Invalid IP, or unknown database type/format |
| 401 | Missing or invalid API key |
| 403 | Your plan does not include this resource |
| 404 | Database not published in that format |
| 429 | Quota or rate limit exceeded |
| 500 | Server error, retry or contact support |

Timeouts throw an `IPTrustError` with `status: 0` and `errorCode: "timeout"`. Network failures from `fetch` are rethrown unchanged.

## Options

```ts
const iptrust = new IPTrustClient(apiKey, {
  baseUrl: "https://api.iptrust.co", // override for testing
  timeout: 10_000,                   // ms, 0 to disable
  fetch: myFetch,                    // custom fetch implementation
  headers: { "User-Agent": "my-app/1.0" }, // default is "iptrust-node/<version>"
});

// Per-request cancellation
const controller = new AbortController();
await iptrust.lookupIp("9.9.9.9", { signal: controller.signal });
```

## Types

All response types are exported:

```ts
import type {
  IPResponse, ASN, Location, Company, KnownBot, Hosting,
  AbuseContact, TorExitNode, PrivacyRelay, Proxy, VPN,
  DatabaseType, DatabaseFormat, DatabaseListResponse, DatabaseDownload,
} from "@iptrust/sdk";
```

## License

MIT
