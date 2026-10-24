import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { initPwaUpdates } from "./ui/pwaRegister";
/* Design-system stylesheets (UI Polish Phase 1): token definitions and
   the prefixed ds-* component classes. Additive — the existing screens
   stay styled by index.css until later phases adopt the components. */
import "./styles/tokens.css";
import "./components/components.css";
import "./index.css";
/* Shell foundations (UI Polish Phase 2) come last on purpose: the
   safe-area longhands must layer over index.css's shell padding. */
import "./styles/shell.css";
/* Core-flow screen styles (UI Polish Phase 3): token-only layout for
   Today / Start Day / Log Stop / End Day; dock-aware shell padding
   layers over the shell rules above. */
import "./features/day/dayScreens.css";
/* History & Reports screen styles (UI Polish Phase 4). */
import "./features/history/historyScreens.css";
/* Settings screen styles (UI Polish Phase 4). */
import "./features/settings/settingsScreens.css";
/* Sign-in screen styles (UI Polish Phase 4). */
import "./features/auth/authScreens.css";

// Register the service worker before first render so the update
// singleton exists before the shell's UpdateToast subscribes.
initPwaUpdates();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
