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


def main() -> None:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    standard_icon(192).save(PUBLIC / "pwa-192x192.png")
    standard_icon(512).save(PUBLIC / "pwa-512x512.png")
    maskable_icon(512).save(PUBLIC / "pwa-maskable-512x512.png")
    print("wrote pwa-192x192.png, pwa-512x512.png, pwa-maskable-512x512.png")


if __name__ == "__main__":
    main()
