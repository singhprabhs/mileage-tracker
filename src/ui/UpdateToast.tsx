import { Toast } from "../components";
import { RefreshIcon } from "../components/icons";
import { applyPwaUpdate, usePwaUpdate } from "./pwaRegister";

/**
 * "A new version is available" toast (UI Polish Phase 2). Rendered
 * once in the app shell; appears only when a service-worker update
 * is waiting, and Refresh is always the user's choice — the app
 * never reloads itself under a half-filled form.
 */
export default function UpdateToast() {
  const needRefresh = usePwaUpdate();
  if (!needRefresh) return null;
  return (
    <div className="update-toast-dock">
      <Toast
        message="A new version of Mileage Tracker is available."
        actionLabel="Refresh"
        onAction={applyPwaUpdate}
        icon={<RefreshIcon width={18} height={18} />}
      />
    </div>
  );
}
