import { useEffect, useState } from "react";
import { db, getMetaValue, META_KEYS, setMetaValue } from "../../data";
import { Card } from "../../components";
import { ChevronRightIcon, CloseIcon, PlusIcon, ShareIcon } from "../../components/icons";
import {
  installDismissalCount,
  isAppleMobileUserAgent,
  isStandaloneDisplay,
  shouldShowInstallCard,
} from "./installState";

type InstallMode = "card" | "notice" | null;

/**
 * Add to Home Screen prompt (UI Polish Phase 2, replacing the plain
 * install hint). On iOS it is the brief's install card — illustration,
 * steps, and a 48px dismiss — shown only when the app is not
 * installed and has not been dismissed twice; installing matters
 * because Safari clears a plain tab's stored data after 7 days, but
 * not an installed web app's. Other browsers keep the previous
 * one-time generic notice.
 */
export default function InstallCard() {
  const [mode, setMode] = useState<InstallMode>(null);
  const [dismissals, setDismissals] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const onInstalled = () => {
      // The browser confirmed an install: never prompt again.
      setMode(null);
      void setMetaValue(db, META_KEYS.installCardInstalled, "1");
    };
    window.addEventListener("appinstalled", onInstalled);

    void (async () => {
      if (isStandaloneDisplay()) {
        // Running installed: remember it in this container and hide.
        await setMetaValue(db, META_KEYS.installCardInstalled, "1");
        return;
      }
      const [installed, rawCount, legacyDismissed] = await Promise.all([
        getMetaValue(db, META_KEYS.installCardInstalled),
        getMetaValue(db, META_KEYS.installCardDismissals),
        getMetaValue(db, META_KEYS.installHintDismissed),
      ]);
      if (cancelled) return;
      const count = installDismissalCount(rawCount, legacyDismissed);
      setDismissals(count);
      if (
        isAppleMobileUserAgent(window.navigator.userAgent, window.navigator.maxTouchPoints)
      ) {
        if (shouldShowInstallCard({ standalone: false, installed: installed === "1", dismissals: count })) {
          setMode("card");
        }
      } else if (legacyDismissed !== "1") {
        setMode("notice");
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function dismissCard() {
    setMode(null);
    await setMetaValue(db, META_KEYS.installCardDismissals, String(dismissals + 1));
  }

  async function dismissNotice() {
    setMode(null);
    await setMetaValue(db, META_KEYS.installHintDismissed, "1");
  }

  if (mode === "card") {
    return (
      <Card className="ds-install" role="note">
        <div className="ds-install-head">
          <h2 className="ds-install-title">Install Mileage Tracker</h2>
          <button
            type="button"
            className="ds-install-dismiss"
            aria-label="Dismiss install card"
            onClick={() => void dismissCard()}
          >
            <CloseIcon width={20} height={20} />
          </button>
        </div>
        <p className="ds-install-line">
          Add it to your Home Screen so it opens full-screen and your logs stay safe on this
          phone.
        </p>
        <div className="ds-install-figure" aria-hidden="true">
          <span className="ds-install-step-icon">
            <ShareIcon />
          </span>
          <span className="ds-install-figure-arrow">
            <ChevronRightIcon width={20} height={20} />
          </span>
          <span className="ds-install-appicon">
            <PlusIcon />
          </span>
        </div>
        <ol className="ds-install-steps">
          <li>
            Tap the <strong>Share</strong> button in the toolbar.
          </li>
          <li>
            Choose <strong>Add to Home Screen</strong>.
          </li>
        </ol>
      </Card>
    );
  }

  if (mode === "notice") {
    return (
      <div className="notice install-hint" role="note">
        <p>
          Install this app so it opens full-screen and your logs stay safe on this phone: use
          your browser's menu and choose “Add to Home Screen” or “Install app”.
        </p>
        <button
          type="button"
          className="button install-hint-dismiss"
          aria-label="Dismiss install hint"
          onClick={() => void dismissNotice()}
        >
          ✕
        </button>
      </div>
    );
  }

  return null;
}
