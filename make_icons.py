"""Generate RoadSOS PNG icons in all sizes required by Android/PWA."""
from PIL import Image, ImageDraw
from pathlib import Path

OUT = Path(__file__).parent / "static" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

# Brand colour
RED = (230, 57, 70)
WHITE = (255, 255, 255)
DARK = (29, 53, 87)

def draw_icon(size: int, maskable: bool = False) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # For maskable icons, fill the safe-zone (Android adaptive icon)
    if maskable:
        d.rectangle([0, 0, size, size], fill=RED)
        # Centered circle representing the safe zone
        pad = int(size * 0.18)
        d.ellipse([pad, pad, size - pad, size - pad], fill=WHITE)
        # Red exclamation mark
        cx = size // 2
        bar_w = max(2, int(size * 0.08))
        d.rectangle([cx - bar_w, int(size * 0.30), cx + bar_w, int(size * 0.62)], fill=RED)
        d.ellipse([cx - bar_w - 2, int(size * 0.66), cx + bar_w + 2, int(size * 0.74)], fill=RED)
        return img

    # Normal rounded-square icon
    radius = int(size * 0.20)
    # Rounded rect background
    d.rounded_rectangle([0, 0, size, size], radius=radius, fill=RED)

    # Inner white circle
    pad = int(size * 0.22)
    d.ellipse([pad, pad, size - pad, size - pad], fill=WHITE)

    # Red exclamation mark
    cx = size // 2
    bar_w = max(2, int(size * 0.08))
    d.rectangle([cx - bar_w, int(size * 0.32), cx + bar_w, int(size * 0.62)], fill=RED)
    d.ellipse([cx - bar_w - 2, int(size * 0.66), cx + bar_w + 2, int(size * 0.74)], fill=RED)

    return img


SIZES = [48, 72, 96, 128, 144, 152, 192, 256, 384, 512]
for s in SIZES:
    p = OUT / f"icon-{s}.png"
    draw_icon(s).save(p)
    print(f"wrote {p.name}")

# Maskable variants for Android adaptive icons
for s in [192, 512]:
    p = OUT / f"icon-maskable-{s}.png"
    draw_icon(s, maskable=True).save(p)
    print(f"wrote {p.name}")

# Apple touch
draw_icon(180).save(OUT / "apple-touch-icon.png")
print("wrote apple-touch-icon.png")

# Favicon
draw_icon(32).save(OUT / "favicon.png")
print("wrote favicon.png")

print(f"\nAll icons saved to {OUT}")
