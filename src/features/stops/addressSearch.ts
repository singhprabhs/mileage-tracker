/**
 * Geoapify Address Autocomplete client.
 *
 * Free-plan friendly: queries are debounced, only sent at 3+ characters,
 * and results are cached in memory by query string. The fetch function is
 * injectable so tests never touch the network.
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
}

export type AddressSearchResult =
  { status: "ok"; results: PlaceSuggestion[] } | { status: "unavailable"; reason: string };

/** Shown in the search UI: Geoapify results are built on OpenStreetMap data. */
export const ADDRESS_SEARCH_ATTRIBUTION =
  "Address search by Geoapify · © OpenStreetMap contributors";

/** Minimum typed characters before a query is sent (Geoapify free-plan hygiene). */
export const MIN_QUERY_LENGTH = 3;

const AUTOCOMPLETE_URL = "https://api.geoapify.com/v1/geocode/autocomplete";
const DEBOUNCE_MS = 300;

export type FetchFn = (url: string) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export interface AddressSearcher {
  /** True when an API key is configured. */
  readonly configured: boolean;
  search(query: string): Promise<AddressSearchResult>;
  searchDebounced(query: string): Promise<AddressSearchResult>;
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
  const name =
    properties.name?.trim() ||
    properties.address_line1?.trim() ||
    address.split(",")[0]?.trim() ||
    address;
  return {
    name,
    address,
    place_id: properties.place_id ?? null,
    lat: typeof properties.lat === "number" ? properties.lat : null,
    lng: typeof properties.lon === "number" ? properties.lon : null,
  };
}

export interface GeoapifySearcherOptions {
  apiKey: string | null | undefined;
  fetchFn?: FetchFn;
  debounceMs?: number;
}

const defaultFetch: FetchFn = (url) => fetch(url);

export function createGeoapifySearcher(options: GeoapifySearcherOptions): AddressSearcher {
  const apiKey = options.apiKey?.trim() ? options.apiKey.trim() : null;
  const fetchFn = options.fetchFn ?? defaultFetch;
  const debounceMs = options.debounceMs ?? DEBOUNCE_MS;
  const cache = new Map<string, PlaceSuggestion[]>();

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingQuery: string | null = null;
  let pendingResolvers: Array<(result: AddressSearchResult) => void> = [];

  async function search(query: string): Promise<AddressSearchResult> {
    const trimmed = query.trim();
    if (!apiKey) {
      return { status: "unavailable", reason: "Address search is not set up on this device." };
    }
    if (trimmed.length < MIN_QUERY_LENGTH) {
      return { status: "ok", results: [] };
    }
    const cacheKey = trimmed.toLowerCase();
    const cached = cache.get(cacheKey);
    if (cached) return { status: "ok", results: cached };

    const url = `${AUTOCOMPLETE_URL}?text=${encodeURIComponent(trimmed)}&apiKey=${encodeURIComponent(apiKey)}`;
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

    const features =
      payload &&
      typeof payload === "object" &&
      Array.isArray((payload as { features?: unknown }).features)
        ? ((payload as { features: Array<{ properties?: GeoapifyFeatureProperties }> }).features ??
          [])
        : [];
    const results = features
      .map((feature) => mapFeature(feature))
      .filter((entry): entry is PlaceSuggestion => entry !== null);
    cache.set(cacheKey, results);
    return { status: "ok", results };
  }

  function searchDebounced(query: string): Promise<AddressSearchResult> {
    pendingQuery = query;
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    return new Promise<AddressSearchResult>((resolve) => {
      pendingResolvers.push(resolve);
      debounceTimer = setTimeout(() => {
        const resolvers = pendingResolvers;
        const latestQuery = pendingQuery ?? "";
        pendingResolvers = [];
        pendingQuery = null;
        debounceTimer = null;
        void search(latestQuery).then((result) => {
          for (const resolveOne of resolvers) resolveOne(result);
        });
      }, debounceMs);
    });
  }

  return { configured: apiKey !== null, search, searchDebounced };
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
