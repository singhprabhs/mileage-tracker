/**
 * Appearance preference (UI Polish Phase 6): "auto" follows the
 * system colour scheme (the app's behaviour since Phase 1); "light"
 * and "dark" force a scheme. Forcing rides the design tokens'
 * existing [data-theme] hook on <html> — the same hook the
 * styleguide previews use — and rewrites the paired theme-color
 * metas so the browser chrome agrees with the app.
 *
 * The choice persists in localStorage under THEME_STORAGE_KEY and
 * is applied before first paint by the small inline script in
 * index.html (which mirrors applyThemePreference); this module
 * applies it again on boot and whenever Settings changes it.
 */

export type ThemePreference = "auto" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "mt-theme";

/** Token backgrounds (--bg in src/styles/tokens.css) per scheme. */
export const THEME_BACKGROUNDS: Record<ResolvedTheme, string> = {
  light: "#f6f7f9",
  dark: "#0e1116",
};

/** Parse a stored value; anything unrecognised means auto. */
export function parseThemePreference(raw: string | null): ThemePreference {
  return raw === "light" || raw === "dark" ? raw : "auto";
}

export function readThemePreference(): ThemePreference {
  try {
    return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "auto";
  }
}

export function storeThemePreference(preference: ThemePreference): void {
  try {
    if (preference === "auto") {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    }
  } catch {
    // Storage unavailable: the choice applies for this session only.
  }
}

/** The scheme a preference resolves to under the system setting. */
export function resolveTheme(
  preference: ThemePreference,
  systemDark: boolean,
): ResolvedTheme {
  if (preference === "auto") return systemDark ? "dark" : "light";
  return preference;
}

/**
 * Apply a preference now: set or clear data-theme on <html>, and
 * rewrite the theme-color metas. Under "auto" the metas return to
 * the media-scoped pair index.html declares; under a forced scheme
 * the matching meta becomes unconditional and the other is parked
 * behind a never-matching media query.
 */
export function applyThemePreference(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === "auto") {
    root.removeAttribute("data-theme");
  } else {
    root.dataset.theme = preference;
  }

  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  const lightMeta = metas[0];
  const darkMeta = metas[1];
  if (!lightMeta || !darkMeta) return;
  if (preference === "auto") {
    lightMeta.media = "(prefers-color-scheme: light)";
    lightMeta.content = THEME_BACKGROUNDS.light;
    darkMeta.media = "(prefers-color-scheme: dark)";
    darkMeta.content = THEME_BACKGROUNDS.dark;
  } else {
    const active = preference === "light" ? lightMeta : darkMeta;
    const inactive = preference === "light" ? darkMeta : lightMeta;
    active.media = "all";
    active.content = THEME_BACKGROUNDS[preference];
    inactive.media = "not all";
  }
}
