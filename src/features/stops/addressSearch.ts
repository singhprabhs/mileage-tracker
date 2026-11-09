/**
 * Geoapify Address Autocomplete client.
 *
 * Free-plan friendly: queries are debounced, only sent at 3+ characters,
 * and results are cached in memory by query string. The fetch function is
 * injectable so tests never touch the network.
 *
 * Results are restricted to British Columbia: the autocomplete request
 * carries a `filter=rect:` bounding box around the province, so a search
 * for a place name never returns addresses from the rest of the world.
 * A proximity `bias` (from the device's location) only re-ranks results
 * inside that box — it can never pull in an out-of-province match.
 *
 * When no API key is configured, or a request fails (offline, quota,
 * network error), search returns an "unavailable" result and the UI falls
 * back to manual name + address entry, which always works on its own.
 */

export interface PlaceSuggestion {
  name: string;
  /** Full formatted address, as it should appear on legs and reports. */
  address: string;
  place_id: string | null;
  lat: number | null;
  lng: number | null;
  /**
   * True when the name is just the street address, not a real
   * place/company name — i.e. Geoapify had no name for the result and
   * the name fell back to the address's first line. The UI asks the
   * user to type the customer name in that case instead of saving
   * the street address as the name.
   */
  nameIsAddress: boolean;
}

export type AddressSearchResult =
  { status: "ok"; results: PlaceSuggestion[] } | { status: "unavailable"; reason: string };

/** Shown in the search UI: Geoapify results are built on OpenStreetMap data. */
export const ADDRESS_SEARCH_ATTRIBUTION =
  "Address search by Geoapify · © OpenStreetMap contributors";

/** Minimum typed characters before a query is sent (Geoapify free-plan hygiene). */
export const MIN_QUERY_LENGTH = 3;

const AUTOCOMPLETE_URL = "https://api.geoapify.com/v1/geocode/autocomplete";
const REVERSE_URL = "https://api.geoapify.com/v1/geocode/reverse";
const DEBOUNCE_MS = 300;

/**
 * Bounding box around British Columbia (lon1,lat1,lon2,lat2) for the
 * autocomplete `filter=rect:` parameter. Verified live 2026-11-09: a
 * search for "Paris" with this filter returns only BC matches (Paris
 * Street, Penticton) — no Paris, France. The box's south edge (48.30)
 * keeps southern Vancouver Island in; it also admits a thin strip of
 * northern Washington (e.g. Bellingham), which is the price of a
 * rectangle — the alternative, a second `filter=countrycode:ca`, is
 * not combined with `rect` by the API.
 */
export const BC_FILTER_RECT = "rect:-139.06,48.30,-114.03,60.00";

/** Device location, for re-ranking autocomplete results by proximity. */
export interface GeoBias {
  lat: number;
  lng: number;
}

export type FetchFn = (url: string) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export interface AddressSearcher {
  /** True when an API key is configured. */
  readonly configured: boolean;
  search(query: string, bias?: GeoBias | null): Promise<AddressSearchResult>;
  searchDebounced(query: string, bias?: GeoBias | null): Promise<AddressSearchResult>;
  /** Nearest named place for a coordinate (the "where am I" lookup). */
  reverseGeocode(lat: number, lng: number): Promise<AddressSearchResult>;
}

interface GeoapifyFeatureProperties {
  name?: string;
  formatted?: string;
  address_line1?: string;
  address_line2?: string;
  place_id?: string;
  lat?: number;
  lon?: number;
}

function mapFeature(feature: { properties?: GeoapifyFeatureProperties }): PlaceSuggestion | null {
  const properties = feature.properties ?? {};
  const address = properties.formatted?.trim();
  if (!address) return null;
  const placeName = properties.name?.trim();
  const addressLine1 = properties.address_line1?.trim();
  const firstSegment = address.split(",")[0]?.trim();
  const name = placeName || addressLine1 || firstSegment || address;
  // The name is only a real place/company name when Geoapify gave one
  // that is not just the street address itself.
  const nameIsAddress = !placeName || placeName === addressLine1 || placeName === firstSegment;
  return {
    name,
    address,
    place_id: properties.place_id ?? null,
    lat: typeof properties.lat === "number" ? properties.lat : null,
    lng: typeof properties.lon === "number" ? properties.lon : null,
    nameIsAddress,
  };
}

function parseFeatures(payload: unknown): PlaceSuggestion[] {
  const features =
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { features?: unknown }).features)
      ? ((payload as { features: Array<{ properties?: GeoapifyFeatureProperties }> }).features ??
        [])
      : [];
  return features
    .map((feature) => mapFeature(feature))
    .filter((entry): entry is PlaceSuggestion => entry !== null);
}

export interface GeoapifySearcherOptions {
  apiKey: string | null | undefined;
  fetchFn?: FetchFn;
  debounceMs?: number;
}

const defaultFetch: FetchFn = (url) => fetch(url);

function biasKey(bias: GeoBias | null | undefined): string {
  if (!bias) return "";
  return `${bias.lat.toFixed(3)},${bias.lng.toFixed(3)}`;
}

export function createGeoapifySearcher(options: GeoapifySearcherOptions): AddressSearcher {
  const apiKey = options.apiKey?.trim() ? options.apiKey.trim() : null;
  const fetchFn = options.fetchFn ?? defaultFetch;
  const debounceMs = options.debounceMs ?? DEBOUNCE_MS;
  const cache = new Map<string, PlaceSuggestion[]>();

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingQuery: string | null = null;
  let pendingBias: GeoBias | null = null;
  let pendingResolvers: Array<(result: AddressSearchResult) => void> = [];

  async function search(query: string, bias?: GeoBias | null): Promise<AddressSearchResult> {
    const trimmed = query.trim();
    if (!apiKey) {
      return { status: "unavailable", reason: "Address search is not set up on this device." };
    }
    if (trimmed.length < MIN_QUERY_LENGTH) {
      return { status: "ok", results: [] };
    }
    const cacheKey = `${trimmed.toLowerCase()}\n${biasKey(bias)}`;
    const cached = cache.get(cacheKey);
    if (cached) return { status: "ok", results: cached };

    const biasParam = bias
      ? `&bias=proximity:${encodeURIComponent(`${bias.lng},${bias.lat}`)}`
      : "";
    const url =
      `${AUTOCOMPLETE_URL}?text=${encodeURIComponent(trimmed)}` +
      `&lang=en&filter=${encodeURIComponent(BC_FILTER_RECT)}${biasParam}` +
      `&apiKey=${encodeURIComponent(apiKey)}`;
    let payload: unknown;
    try {
      const response = await fetchFn(url);
      if (!response.ok) {
        return {
          status: "unavailable",
          reason: `Address search failed (HTTP ${response.status}). Type the address instead.`,
        };
      }
      payload = await response.json();
    } catch {
      return {
        status: "unavailable",
        reason: "Address search is unavailable right now. Type the address instead.",
      };
    }

    const results = parseFeatures(payload);
    cache.set(cacheKey, results);
    return { status: "ok", results };
  }

  function searchDebounced(query: string, bias?: GeoBias | null): Promise<AddressSearchResult> {
    pendingQuery = query;
    pendingBias = bias ?? null;
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    return new Promise<AddressSearchResult>((resolve) => {
      pendingResolvers.push(resolve);
      debounceTimer = setTimeout(() => {
        const resolvers = pendingResolvers;
        const latestQuery = pendingQuery ?? "";
        const latestBias = pendingBias;
        pendingResolvers = [];
        pendingQuery = null;
        pendingBias = null;
        debounceTimer = null;
        void search(latestQuery, latestBias).then((result) => {
          for (const resolveOne of resolvers) resolveOne(result);
        });
      }, debounceMs);
    });
  }

  async function reverseGeocode(lat: number, lng: number): Promise<AddressSearchResult> {
    if (!apiKey) {
      return { status: "unavailable", reason: "Address search is not set up on this device." };
    }
    const url =
      `${REVERSE_URL}?lat=${encodeURIComponent(String(lat))}` +
      `&lon=${encodeURIComponent(String(lng))}&lang=en&apiKey=${encodeURIComponent(apiKey)}`;
    try {
      const response = await fetchFn(url);
      if (!response.ok) {
        return {
          status: "unavailable",
          reason: `Location lookup failed (HTTP ${response.status}).`,
        };
      }
      return { status: "ok", results: parseFeatures(await response.json()) };
    } catch {
      return { status: "unavailable", reason: "Location lookup is unavailable right now." };
    }
  }

  return { configured: apiKey !== null, search, searchDebounced, reverseGeocode };
}

let defaultSearcher: AddressSearcher | null = null;

/** The app-wide searcher, built from the VITE_GEOAPIFY_API_KEY env var. */
export function getAddressSearcher(): AddressSearcher {
  if (!defaultSearcher) {
    defaultSearcher = createGeoapifySearcher({
      apiKey: import.meta.env.VITE_GEOAPIFY_API_KEY as string | undefined,
    });
  }
  return defaultSearcher;
}
