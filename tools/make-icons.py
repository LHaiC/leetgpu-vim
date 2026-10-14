#!/usr/bin/env python3
"""Regenerates the extension icons (icons/icon{16,32,48,128}.png).

Run from the repository root: python3 tools/make-icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "icons"

BACKGROUND = (14, 14, 16, 255)
BORDER = (255, 255, 255, 38)
GLYPH = (118, 185, 0, 255)  # NVIDIA green; also reads as "vim normal mode"
CURSOR = (235, 235, 235, 255)


def render(size: int) -> Image.Image:
    scale = 8  # supersample, then downscale for smooth edges
    big = size * scale
    img = Image.new("RGBA", (big, big), BACKGROUND)
    draw = ImageDraw.Draw(img)
    radius = int(big * 0.22)
    draw.rounded_rectangle(
        (0, 0, big - 1, big - 1), radius=radius, outline=BORDER, width=max(1, int(big * 0.02))
    )

    font = None
    for candidate in ("DejaVuSansMono-Bold.ttf", "DejaVuSans-Bold.ttf", "DejaVuSans.ttf"):
        try:
            font = ImageFont.truetype(candidate, int(big * 0.62))
            break
        except OSError:
            continue
    if font is None:  # pragma: no cover - fallback when no DejaVu is installed
        font = ImageFont.load_default()

    box = draw.textbbox((0, 0), "V", font=font)
    draw.text(
        ((big - (box[2] - box[0])) / 2 - box[0], (big - (box[3] - box[1])) / 2 - box[1] - big * 0.04),
        "V",
        font=font,
        fill=GLYPH,
    )

    # block cursor, like the one vim mode draws
    cursor_w = big * 0.30
    cursor_h = big * 0.09
    cx = (big - cursor_w) / 2
    cy = big * 0.78
    draw.rounded_rectangle(
        (cx, cy, cx + cursor_w, cy + cursor_h), radius=cursor_h / 2, fill=CURSOR
    )
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for size in (16, 32, 48, 128):
        path = OUT / f"icon{size}.png"
        render(size).save(path)
        print(f"wrote {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
