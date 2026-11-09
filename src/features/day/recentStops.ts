import type { LocationRecord } from "../../data";

/**
 * Saved places matching a search query, most recently used first.
 *
 * The filter runs over the WHOLE saved list before the result is
 * capped: the old inline version sliced to 8 first and then filtered,
 * so a place used a while ago never appeared once the user typed its
 * name — only the web search results showed.
 */
export function filterRecentStops(
  stops: LocationRecord[],
  query: string,
  limit = 8,
): LocationRecord[] {
  const needle = query.trim().toLowerCase();
  const matches =
    needle === ""
      ? stops
      : stops.filter(
          (stop) =>
            stop.name.toLowerCase().includes(needle) || stop.address.toLowerCase().includes(needle),
        );
  return matches.slice(0, limit);
}
