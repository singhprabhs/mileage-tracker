import { describe, expect, it, vi } from "vitest";
import {
  BC_FILTER_RECT,
  createGeoapifySearcher,
  MIN_QUERY_LENGTH,
  type FetchFn,
} from "../src/features/stops/addressSearch";

const GEOAPIFY_RESPONSE = {
  features: [
    {
      properties: {
        name: "Dsk Law",
        formatted: "970-789 W Pender St, Vancouver, BC, Canada",
        place_id: "geo-place-1",
        lat: 49.286,
        lon: -123.112,
      },
    },
    {
      properties: {
        formatted: "789 W Pender St, Vancouver, BC, Canada",
        place_id: "geo-place-2",
        lat: 49.287,
        lon: -123.113,
      },
    },
  ],
};

function okFetch(payload: unknown = GEOAPIFY_RESPONSE) {
  return vi.fn<FetchFn>(async () => ({
    ok: true,
    status: 200,
    json: async () => payload,
  }));
}

describe("Geoapify address search", () => {
  it("maps Geoapify features to place suggestions", async () => {
    const fetchFn = okFetch();
    const searcher = createGeoapifySearcher({ apiKey: "test-key", fetchFn });
    const result = await searcher.search("789 W Pender");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unavailable");
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toEqual({
      name: "Dsk Law",
      address: "970-789 W Pender St, Vancouver, BC, Canada",
      place_id: "geo-place-1",
      lat: 49.286,
      lng: -123.112,
      nameIsAddress: false,
    });
    // A feature without a name falls back to the address's first line.
    expect(result.results[1]?.name).toBe("789 W Pender St");
    expect(result.results[1]?.nameIsAddress).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const url = fetchFn.mock.calls[0]?.[0] ?? "";
    expect(url).toContain("https://api.geoapify.com/v1/geocode/autocomplete");
    expect(url).toContain("text=789%20W%20Pender");
  });

  it("restricts results to British Columbia and asks for English", async () => {
    const fetchFn = okFetch();
    const searcher = createGeoapifySearcher({ apiKey: "test-key", fetchFn });
    await searcher.search("Paris");
    const url = fetchFn.mock.calls[0]?.[0] ?? "";
    expect(url).toContain(`filter=${encodeURIComponent(BC_FILTER_RECT)}`);
    expect(url).toContain("lang=en");
    expect(BC_FILTER_RECT).toBe("rect:-139.06,48.30,-114.03,60.00");
  });

  it("flags a name that is only the street address, not a company name", async () => {
    const fetchFn = okFetch({
      features: [
        {
          properties: {
            name: "789 W Pender St",
            address_line1: "789 W Pender St",
            formatted: "789 W Pender St, Vancouver, BC, Canada",
            place_id: "geo-street",
          },
        },
        {
          properties: {
            name: "Agat Laboratories",
            address_line1: "3681 E 1st Ave",
            formatted: "3681 E 1st Ave, Vancouver, BC, Canada",
            place_id: "geo-poi",
          },
        },
      ],
    });
    const searcher = createGeoapifySearcher({ apiKey: "test-key", fetchFn });
    const result = await searcher.search("Pender");
    if (result.status !== "ok") throw new Error("unavailable");
    expect(result.results[0]?.nameIsAddress).toBe(true);
    expect(result.results[1]?.nameIsAddress).toBe(false);
  });

  it("re-ranks by proximity when a device location is given, and caches per location", async () => {
    const fetchFn = okFetch();
    const searcher = createGeoapifySearcher({ apiKey: "test-key", fetchFn });
    const near = { lat: 49.286, lng: -123.112 };
    const far = { lat: 48.428, lng: -123.365 };
    await searcher.search("Pender", near);
    const url = fetchFn.mock.calls[0]?.[0] ?? "";
    expect(url).toContain("bias=proximity:-123.112%2C49.286");
    await searcher.search("Pender", near);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await searcher.search("Pender", far);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("reverse-geocodes a coordinate to the nearest named place", async () => {
    const fetchFn = okFetch();
    const searcher = createGeoapifySearcher({ apiKey: "test-key", fetchFn });
    const result = await searcher.reverseGeocode(49.286, -123.112);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unavailable");
    expect(result.results[0]?.name).toBe("Dsk Law");
    const url = fetchFn.mock.calls[0]?.[0] ?? "";
    expect(url).toContain("https://api.geoapify.com/v1/geocode/reverse");
    expect(url).toContain("lat=49.286");
    expect(url).toContain("lon=-123.112");
  });

  it("does not query under the minimum length", async () => {
    const fetchFn = okFetch();
    const searcher = createGeoapifySearcher({ apiKey: "test-key", fetchFn });
    const short = "x".repeat(MIN_QUERY_LENGTH - 1);
    const result = await searcher.search(short);
    expect(result).toEqual({ status: "ok", results: [] });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("caches by query string: a repeat search does not refetch", async () => {
    const fetchFn = okFetch();
    const searcher = createGeoapifySearcher({ apiKey: "test-key", fetchFn });
    await searcher.search("Agat Laboratories");
    const again = await searcher.search("  agat laboratories  ");
    expect(again.status).toBe("ok");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("debounces: rapid typing sends one request for the latest query", async () => {
    vi.useFakeTimers();
    try {
      const fetchFn = okFetch();
      const searcher = createGeoapifySearcher({ apiKey: "test-key", fetchFn, debounceMs: 300 });
      const first = searcher.searchDebounced("789 W Pe");
      const second = searcher.searchDebounced("789 W Pender");
      await vi.advanceTimersByTimeAsync(300);
      const [firstResult, secondResult] = await Promise.all([first, second]);
      expect(fetchFn).toHaveBeenCalledTimes(1);
      const url = fetchFn.mock.calls[0]?.[0] ?? "";
      expect(url).toContain("text=789%20W%20Pender");
      expect(firstResult).toEqual(secondResult);
      expect(secondResult.status).toBe("ok");
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports unavailable when the request fails, so the UI falls back to manual entry", async () => {
    const throwingFetch = vi.fn<FetchFn>(async () => {
      throw new Error("offline");
    });
    const searcher = createGeoapifySearcher({ apiKey: "test-key", fetchFn: throwingFetch });
    const result = await searcher.search("Shellbridge Way");
    expect(result.status).toBe("unavailable");

    const httpFailFetch = vi.fn<FetchFn>(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    }));
    const httpSearcher = createGeoapifySearcher({ apiKey: "test-key", fetchFn: httpFailFetch });
    const httpResult = await httpSearcher.search("Shellbridge Way");
    expect(httpResult.status).toBe("unavailable");
  });

  it("is unconfigured without a key and never fetches", async () => {
    const fetchFn = okFetch();
    const searcher = createGeoapifySearcher({ apiKey: undefined, fetchFn });
    expect(searcher.configured).toBe(false);
    const result = await searcher.search("Shellbridge Way");
    expect(result.status).toBe("unavailable");
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
