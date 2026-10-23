// Writes the PWA icon PNGs into public/ from their base64 sources in
// assets/icons/. The GitHub push tooling used for this repo transfers
// text only, so the icons live in the repo as base64 and are decoded
// here on every build (npm runs this automatically via "prebuild").
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const icons = ["pwa-192x192", "pwa-512x512", "pwa-maskable-512x512"];
mkdirSync(join(root, "public"), { recursive: true });
for (const name of icons) {
  const b64 = readFileSync(join(root, "assets", "icons", `${name}.png.b64`), "utf8").trim();
  writeFileSync(join(root, "public", `${name}.png`), Buffer.from(b64, "base64"));
}
console.log(`Wrote ${icons.length} PWA icons to public/`);
