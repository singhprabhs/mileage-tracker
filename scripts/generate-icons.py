#!/usr/bin/env python3
"""Generate the PWA icons in public/ (Phase 5).

Simple, legible motif: the app's theme blue (#0f4c81, from the manifest)
with a bold white "M" and a dashed road line under it. The maskable icon
is full-bleed with the artwork kept inside the central safe zone.

Run: python3 scripts/generate-icons.py  (needs Pillow and DejaVu Sans Bold)
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

THEME = (15, 76, 129, 255)  # #0f4c81
WHITE = (255, 255, 255, 255)
FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
PUBLIC = Path(__file__).resolve().parent.parent / "public"


def draw_artwork(size: int, letter_scale: float, dash_y: float) -> Image.Image:
    """White M + road dashes on a transparent canvas of the given size."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT_PATH, int(size * letter_scale))
    text = "M"
    box = draw.textbbox((0, 0), text, font=font)
    width, height = box[2] - box[0], box[3] - box[1]
    x = (size - width) / 2 - box[0]
    y = (size * 0.46 - height / 2) - box[1]
    draw.text((x, y), text, font=font, fill=WHITE)
    # Road: three white dashes under the letter.
    dash_h = max(2, int(size * 0.028))
    dash_w = int(size * 0.13)
    gap = int(size * 0.06)
    total = dash_w * 3 + gap * 2
    start_x = (size - total) / 2
    yy = int(size * dash_y)
    for i in range(3):
        xx = start_x + i * (dash_w + gap)
        draw.rounded_rectangle([xx, yy, xx + dash_w, yy + dash_h], radius=dash_h / 2, fill=WHITE)
    return img


def standard_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.18), fill=THEME)
    img.alpha_composite(draw_artwork(size, 0.52, 0.76))
    return img


def maskable_icon(size: int) -> Image.Image:
    # Full-bleed background; artwork scaled into the central safe zone.
    img = Image.new("RGBA", (size, size), THEME)
    img.alpha_composite(draw_artwork(size, 0.44, 0.72))
    return img


def apple_touch_icon(size: int = 180) -> Image.Image:
    """Home Screen icon for iOS: full-bleed and opaque (no rounded
    corners, no transparency — iOS masks the corners itself and fills
    any transparency with black). Same artwork as the maskable icon."""
    return maskable_icon(size)


# Startup (splash) images, UI Polish Phase 2: flat design-token
# background (--bg light/dark) with the app icon centred, so launching
# from the Home Screen never flashes white. (pixel size, css size, dpr)
STARTUP_SIZES = [
    (1170, 2532),  # 390x844 @3 — iPhone 13/14/15
    (1290, 2796),  # 430x932 @3 — iPhone Pro Max
    (750, 1334),  # 375x667 @2 — iPhone SE
]
BG_LIGHT = (246, 247, 249, 255)  # #f6f7f9 (--bg, light)
BG_DARK = (14, 17, 22, 255)  # #0e1116 (--bg, dark)


def startup_image(width: int, height: int, dark: bool) -> Image.Image:
    img = Image.new("RGBA", (width, height), BG_DARK if dark else BG_LIGHT)
    icon_side = int(min(width, height) * 0.27)
    icon = standard_icon(512).resize((icon_side, icon_side), Image.LANCZOS)
    img.alpha_composite(icon, ((width - icon_side) // 2, (height - icon_side) // 2))
    return img


def main() -> None:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    standard_icon(192).save(PUBLIC / "pwa-192x192.png")
    standard_icon(512).save(PUBLIC / "pwa-512x512.png")
    maskable_icon(512).save(PUBLIC / "pwa-maskable-512x512.png")
    apple_touch_icon(180).save(PUBLIC / "apple-touch-icon.png", optimize=True)
    names = ["pwa-192x192.png", "pwa-512x512.png", "pwa-maskable-512x512.png", "apple-touch-icon.png"]
    for width, height in STARTUP_SIZES:
        for dark in (False, True):
            name = f"splash-{width}x{height}{'-dark' if dark else ''}.png"
            startup_image(width, height, dark).convert("RGB").save(
                PUBLIC / name, optimize=True
            )
            names.append(name)
    print("wrote " + ", ".join(names))


if __name__ == "__main__":
    main()
