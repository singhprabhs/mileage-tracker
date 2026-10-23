/**
 * Getting a generated report off the device: prefer the Web Share API
 * with the file attached (the phone's share sheet, per the brief) and
 * fall back to a plain download wherever file sharing is unavailable
 * (desktop browsers, older Safari).
 */

/** Save a blob as a file download. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Revoke on the next tick: some browsers start the download
    // asynchronously and still need the URL alive.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export type ShareOutcome = "shared" | "downloaded";

/**
 * Share the file through the system share sheet when the browser
 * supports sharing files; otherwise download it. A user dismissing the
 * share sheet counts as "shared" — they made their choice there.
 */
export async function shareOrDownload(
  blob: Blob,
  fileName: string,
  title: string,
): Promise<ShareOutcome> {
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
  };
  if (typeof nav.share === "function" && typeof nav.canShare === "function") {
    const file = new File([blob], fileName, { type: blob.type });
    if (nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title });
        return "shared";
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return "shared";
        // Any other share failure falls through to the download.
      }
    }
  }
  downloadBlob(blob, fileName);
  return "downloaded";
}
