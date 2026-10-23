import { useEffect, useState } from "react";
import { db, getMetaValue, META_KEYS, setMetaValue } from "../../data";
import { isStandaloneDisplay } from "./installState";

/**
 * One-time Add to Home Screen hint (iPhone rule from the brief): Safari
 * can clear a plain tab's stored data after 7 days, but not an installed
 * web app's. Shown on any browser that is not running standalone — with
 * Share-sheet wording on Apple mobile devices, generic install wording
 * elsewhere — and never again once dismissed.
 */
export default function InstallHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (isStandaloneDisplay()) return;
      const dismissed = await getMetaValue(db, META_KEYS.installHintDismissed);
      if (!cancelled && dismissed !== "1") setVisible(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  const appleMobile = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  const message = appleMobile
    ? "Install this app so your logs stay safe on this phone: tap the Share button, then “Add to Home Screen”."
    : "Install this app so it opens full-screen and your logs stay safe on this phone: use your browser's menu and choose “Add to Home Screen” or “Install app”.";

  async function dismiss() {
    setVisible(false);
    await setMetaValue(db, META_KEYS.installHintDismissed, "1");
  }

  return (
    <div className="notice install-hint" role="note">
      <p>{message}</p>
      <button
        type="button"
        className="button install-hint-dismiss"
        aria-label="Dismiss install hint"
        onClick={() => void dismiss()}
      >
        ✕
      </button>
    </div>
  );
}
