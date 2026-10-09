/**
 * Types describing the IP Trust API.
 *
 * Field documentation mirrors https://iptrust.co/docs. The lookup response has
 * one shape for every plan; fields your plan does not include are simply
 * absent, so every top-level section is optional.
 */

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

/** AS or company classification. */
export type OrganizationType = "isp" | "hosting" | "business" | "government" | "education";

/** Risk level derived from the numeric `asn.risk` score. */
export type RiskLabel = "very_low" | "low" | "moderate" | "high" | "very_high";

/** Risk signal categories attached to an AS. */
export type RiskType =
  | "confirmed_bot"
  | "suspected_bot"
  | "traffic_volume"
  | "repeated_abuse"
  | "targeted_abuse";

/** Precision of the geolocation data. */
export type LocationResolution = "city" | "state" | "country";

/** Category of a detected known bot. */
export type BotType = "crawler" | "ai" | "other";

/**
 * Identifier of a known bot or crawler, e.g. "google_bot", "gpt_bot",
 * "anthropic". The list grows over time, so this is an open string. See
 * https://iptrust.co/docs for the current names.
 */
export type KnownBotName = string;

/** Proxy classification. */
export type ProxyType = "residential" | "open";

// ---------------------------------------------------------------------------
// Lookup response sections
// ---------------------------------------------------------------------------

/** Autonomous System information (Identity package). */
export interface ASN {
  /** The Autonomous System Number, e.g. "AS8075". */
  number: string;
  /** Registered name of the AS as listed by the RIR. */
  name: string;
  /** Legal organization name that owns the AS. */
  company: string;
  /** ISO 3166-1 alpha-2 country code where the AS is registered. */
  country: string;
  /** Most-specific BGP route prefix containing this IP. */
  route: string;
  /** Regional Internet Registry, e.g. "ARIN", "RIPE", "APNIC". */
  rir: string;
  /** Primary domain associated with the AS owner. */
  domain?: string;
  /** AS classification. */
  type?: OrganizationType;
  /** Human-readable description of the AS owner organization. */
  description?: string;
  /** Risk score from 0.0 (very low) to 1.0 (very high). */
  risk?: number;
  /** Risk level label. */
  risk_label?: RiskLabel;
  /** Risk signal categories. */
  risk_types?: RiskType[];
}

/** A circular area described by its centre and radius. */
export interface Area {
  /** Latitude of the centre of the area (WGS84). */
  latitude: number;
  /** Longitude of the centre of the area (WGS84). */
  longitude: number;
  /** Radius of the area in kilometres. */
  radius_km: number;
}

/**
 * The area the IP is expected to be within. Matches `location.resolution`
 * and is intended for checks such as impossible travel detection.
 */
export interface LocationArea extends Area {
  /**
   * Only present when `resolution` is `country` and the country has
   * territories outside the main area, such as Alaska and Hawaii for the
   * United States.
   */
  territories?: Area[];
}

/** Country metadata attached to a location. */
export interface LocationMeta {
  /** ISO 3166-1 alpha-2 code. */
  country_iso2: string;
  /** ISO 3166-1 alpha-3 code. */
  country_iso3: string;
  /** ISO 3166-1 numeric code. */
  country_numeric_code: string;
  /** International dialling code. */
  country_phone_code: string;
  /** Capital city. */
  country_capital: string;
  /** ISO 4217 currency code. */
  country_currency: string;
  /** Full currency name. */
  country_currency_name: string;
  /** Country name in local language. */
  country_native: string;
  /** UN geographic macro-region. */
  country_region: string;
  /** UN geographic sub-region. */
  country_subregion: string;
  /** Country flag emoji. */
  country_emoji: string;
  /** Country flag as Unicode code points. */
  country_emoji_u: string;
}

/** Geolocation information (Geolocation package). */
export interface Location {
  /** Precision of the location data. */
  resolution: LocationResolution;
  /**
   * City-level location. When resolution is `state` or `country`, this is a
   * suitable default city for that state or country.
   */
  city: string;
  /** State, province, or top-level administrative region. */
  state: string;
  /** Full country name. */
  country: string;
  /** Approximate latitude of the provided city (WGS84). */
  latitude: number;
  /** Approximate longitude of the provided city (WGS84). */
  longitude: number;
  /** The area the IP is expected to be within. */
  area: LocationArea;
  /** Country metadata. */
  meta: LocationMeta;
}

/** Company operating at this IP (Identity package). */
export interface Company {
  /** Legal name of the company. */
  name: string;
  /** Company classification. */
  type?: OrganizationType;
  /** Primary website domain. */
  domain?: string;
  /** Brief description of the company. */
  description?: string;
}

/** Known bot / crawler detection (Identity package). */
export interface KnownBot {
  /** Whether a known bot or crawler was detected. */
  detected: boolean;
  /** Bot category. */
  bot_type?: BotType;
  /** Bot identifier. */
  name?: KnownBotName;
}

/** Hosting / cloud provider detection (Identity package). */
export interface Hosting {
  /** Whether the IP belongs to a known hosting or cloud provider. */
  detected: boolean;
  /** Website domain of the hosting provider. */
  domain?: string;
  /** Name of the hosting or cloud provider. */
  name?: string;
}

/** Abuse contact for the network (Identity package). */
export interface AbuseContact {
  /** Physical mailing address. */
  address?: string;
  /** Email for reporting abuse. */
  email?: string;
  /** Name of the abuse contact person or team. */
  name?: string;
}

/** Tor exit node detection (Anonymization package). */
export interface TorExitNode {
  /** Whether this IP is a known Tor exit node. */
  detected: boolean;
}

/** Commercial privacy relay detection (Anonymization package). */
export interface PrivacyRelay {
  /** Whether the IP is part of a commercial privacy relay service. */
  detected: boolean;
  /** Provider identifier, e.g. "icloud_private_relay". */
  provider?: string;
}

/** Proxy detection (Anonymization package). */
export interface Proxy {
  /** Whether this IP is a detected proxy server. */
  detected: boolean;
  /** Proxy type. */
  type?: ProxyType;
  /** ISO 8601 date when proxy activity was last observed. */
  last_detected?: string;
}

/** VPN detection (Anonymization package). */
export interface VPN {
  /** Whether this IP is part of a VPN service. */
  detected: boolean;
  /** VPN provider identifier, e.g. "nord_vpn". */
  provider?: string;
  /** ISO 8601 date when VPN activity was last observed. */
  last_detected?: string;
}

/**
 * Response from `GET /ip/{ip}`.
 *
 * The shape is the same for every plan. Sections not included in your plan
 * are omitted from the response.
 */
export interface IPResponse {
  /** The queried IP address, echoed back. */
  ip: string;
  /** Whether the IP belongs to a bogon (unroutable or reserved) range. */
  is_bogon: boolean;
  asn?: ASN;
  location?: Location;
  company?: Company;
  known_bot?: KnownBot;
  hosting?: Hosting;
  abuse_contact?: AbuseContact;
  tor_exit_node?: TorExitNode;
  privacy_relay?: PrivacyRelay;
  proxy?: Proxy;
  vpn?: VPN;
}

// ---------------------------------------------------------------------------
// Database downloads
// ---------------------------------------------------------------------------

/** Identifier of a downloadable database. */
export type DatabaseType =
  | "asn"
  | "company"
  | "geolocation"
  | "abusecontact"
  | "knownbots"
  | "hosting"
  | "anonymization";

/**
 * File format of a downloadable database. `mmdb` is a MaxMind DB file;
 * `csv` is a gzipped CSV export.
 */
export type DatabaseFormat = "mmdb" | "csv";

/** One published format of a database. */
export interface DatabaseFileInfo {
  format: DatabaseFormat;
  /** File size in bytes as published. For `csv` this is the compressed size. */
  size_bytes: number;
  /** ISO 8601 timestamp (UTC) when this file was published. */
  updated_at: string;
}

/** One entry from `GET /database`. */
export interface DatabaseInfo {
  type: DatabaseType;
  /** Whether your plan includes downloads of this database. */
  entitled: boolean;
  /** ISO 8601 timestamp (UTC) of the most recently refreshed file. */
  updated_at: string;
  formats: DatabaseFileInfo[];
}

/** Response from `GET /database`. */
export interface DatabaseListResponse {
  databases: DatabaseInfo[];
}

/** Response from `POST /database/download`. */
export interface DatabaseDownload {
  type: DatabaseType;
  format: DatabaseFormat;
  /** Suggested filename for the downloaded file. */
  filename: string;
  /**
   * Signed download URL. Needs no API key, and anyone holding it can download
   * the file until it expires, so treat it as a credential.
   */
  url: string;
  /** File size in bytes. */
  size_bytes: number;
  /** ISO 8601 timestamp (UTC) when the file was published. */
  updated_at: string;
  /** ISO 8601 timestamp (UTC) after which the signed URL stops working. */
  expires_at: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Error body returned by every API endpoint on failure. */
export interface APIErrorBody {
  error: {
    error_code: string;
    /** Only present for internal errors (status 500 or 502). */
    error_id?: string;
    /** Human-friendly description that can be shown to the user. */
    detail?: string;
    data?: unknown;
  };
}
