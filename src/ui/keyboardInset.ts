/**
 * Keyboard-inset groundwork (UI Polish Phase 2, for Phase 3's docked
 * bars). The visualViewport API is the reliable way to know how much
 * of the layout viewport the on-screen keyboard covers: when the
 * keyboard opens, the visual viewport shrinks (and may pan) while the
 * layout viewport keeps its size. The difference is the inset a
 * bottom-docked bar must add to sit directly above the keyboard.
 *
 * Nothing animates here: the inset is published as the
 * `--keyboard-inset` custom property and docked bars transition on
 * that variable themselves, which keeps the mechanism safe under
 * prefers-reduced-motion (their transitions are disabled there).
 */

export interface KeyboardInsetSource {
  innerHeight: number;
  visualViewport: { height: number; offsetTop: number } | null | undefined;
}

/** Pixels of the layout viewport covered by the keyboard (0 when
    the keyboard is closed or visualViewport is unavailable). */
export function computeKeyboardInset(source: KeyboardInsetSource): number {
  const viewport = source.visualViewport;
  if (!viewport) return 0;
  const inset = source.innerHeight - viewport.height - viewport.offsetTop;
  if (!Number.isFinite(inset)) return 0;
  return Math.max(0, Math.round(inset));
}

/**
 * Watch a window and report the keyboard inset whenever it changes.
 * Returns the unsubscribe function. Fires once immediately with the
 * current value.
 */
export function watchKeyboardInset(win: Window, onInset: (px: number) => void): () => void {
  let last = -1;
  const update = () => {
    const next = computeKeyboardInset(win);
    if (next !== last) {
      last = next;
      onInset(next);
    }
  };
  update();
  const viewport = win.visualViewport;
  viewport?.addEventListener("resize", update);
  viewport?.addEventListener("scroll", update);
  win.addEventListener("resize", update);
  win.addEventListener("orientationchange", update);
  return () => {
    viewport?.removeEventListener("resize", update);
    viewport?.removeEventListener("scroll", update);
    win.removeEventListener("resize", update);
    win.removeEventListener("orientationchange", update);
  };
}
