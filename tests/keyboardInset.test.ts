import { describe, expect, it, vi } from "vitest";
import { computeKeyboardInset, watchKeyboardInset } from "../src/ui/keyboardInset";

describe("computeKeyboardInset", () => {
  it("is 0 when visualViewport is unavailable", () => {
    expect(computeKeyboardInset({ innerHeight: 844, visualViewport: null })).toBe(0);
    expect(computeKeyboardInset({ innerHeight: 844, visualViewport: undefined })).toBe(0);
  });

  it("is 0 when the visual viewport fills the layout viewport (keyboard closed)", () => {
    expect(
      computeKeyboardInset({ innerHeight: 844, visualViewport: { height: 844, offsetTop: 0 } }),
    ).toBe(0);
  });

  it("reports the covered strip when the keyboard is open", () => {
    // Keyboard open: visual viewport shrinks to the area above it.
    expect(
      computeKeyboardInset({ innerHeight: 844, visualViewport: { height: 508, offsetTop: 0 } }),
    ).toBe(336);
  });

  it("accounts for a panned visual viewport (page scrolled with keyboard open)", () => {
    expect(
      computeKeyboardInset({ innerHeight: 844, visualViewport: { height: 460, offsetTop: 48 } }),
    ).toBe(336);
  });

  it("clamps negative results (pinch-zoomed past the layout height) to 0", () => {
    expect(
      computeKeyboardInset({ innerHeight: 844, visualViewport: { height: 900, offsetTop: 0 } }),
    ).toBe(0);
  });
});

/** Minimal window fake with capturable listeners. */
function fakeWindow(innerHeight: number, viewportHeight: number) {
  const listeners = new Map<string, Set<() => void>>();
  const on =
    (bucket: Map<string, Set<() => void>>) =>
    (type: string, fn: () => void) => {
      if (!bucket.has(type)) bucket.set(type, new Set());
      bucket.get(type)?.add(fn);
    };
  const off =
    (bucket: Map<string, Set<() => void>>) =>
    (type: string, fn: () => void) => {
      bucket.get(type)?.delete(fn);
    };
  const viewportListeners = new Map<string, Set<() => void>>();
  const win = {
    innerHeight,
    visualViewport: {
      height: viewportHeight,
      offsetTop: 0,
      addEventListener: on(viewportListeners),
      removeEventListener: off(viewportListeners),
    },
    addEventListener: on(listeners),
    removeEventListener: off(listeners),
    fireViewport(type: string) {
      viewportListeners.get(type)?.forEach((fn) => fn());
    },
  };
  return win;
}

describe("watchKeyboardInset", () => {
  it("fires immediately, then only on change, and stops after unsubscribe", () => {
    const win = fakeWindow(844, 844);
    const seen: number[] = [];
    const stop = watchKeyboardInset(win as unknown as Window, (px) => seen.push(px));
    expect(seen).toEqual([0]);

    // Keyboard opens: viewport shrinks, resize fires.
    win.visualViewport.height = 500;
    win.fireViewport("resize");
    win.fireViewport("resize"); // duplicate event, same inset: no re-fire
    expect(seen).toEqual([0, 344]);

    stop();
    win.visualViewport.height = 844;
    win.fireViewport("resize");
    expect(seen).toEqual([0, 344]);
  });

  it("tolerates a window without visualViewport", () => {
    const win = fakeWindow(844, 844);
    win.visualViewport = null as never;
    const onInset = vi.fn();
    const stop = watchKeyboardInset(win as unknown as Window, onInset);
    expect(onInset).toHaveBeenCalledWith(0);
    expect(() => stop()).not.toThrow();
  });
});
