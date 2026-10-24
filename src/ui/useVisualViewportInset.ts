import { useEffect } from "react";
import { watchKeyboardInset } from "./keyboardInset";

/**
 * Keep the `--keyboard-inset` custom property on <html> in sync with
 * the on-screen keyboard (see keyboardInset.ts). Mount once, in the
 * app shell; docked bars (the Undo bar today, Log Stop's Save bar in
 * Phase 3) offset themselves by the variable.
 */
export function useVisualViewportInset(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    return watchKeyboardInset(window, (px) => {
      document.documentElement.style.setProperty("--keyboard-inset", `${px}px`);
    });
  }, []);
}
