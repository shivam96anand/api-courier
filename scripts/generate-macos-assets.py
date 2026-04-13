#!/usr/bin/env python3

import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parent.parent
BUILD_DIR = ROOT / "build"
ICON_SOURCE_PATH = BUILD_DIR / "icon-source.png"
ICON_OUTPUT_PATH = BUILD_DIR / "icon.png"
ICON_ICNS_OUTPUT_PATH = BUILD_DIR / "icon.icns"
BACKGROUND_PATH = BUILD_DIR / "dmg-background.png"
BACKGROUND_RETINA_PATH = BUILD_DIR / "dmg-background@2x.png"

ICONSET_FILES = [
    ("icon_16x16.png", 16),
    ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32),
    ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128),
    ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256),
    ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512),
    ("icon_512x512@2x.png", 1024),
]


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for candidate in (
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/Supplemental/Helvetica Neue.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
    ):
        path = Path(candidate)
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size[0], size[1]), radius=radius, fill=255)
    return mask


def make_icon() -> None:
    if not ICON_SOURCE_PATH.exists():
        raise FileNotFoundError(f"Missing icon source: {ICON_SOURCE_PATH}")

    source = Image.open(ICON_SOURCE_PATH).convert("RGBA")
    tile_size = 860
    tile_radius = 205
    tile_left = (1024 - tile_size) // 2
    tile_top = 80
    tile_box = (tile_left, tile_top, tile_left + tile_size, tile_top + tile_size)

    tile = source.resize((tile_size, tile_size), Image.Resampling.LANCZOS)
    tile_mask = rounded_mask((tile_size, tile_size), tile_radius)

    canvas = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))

    shadow = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle(
        (tile_box[0], tile_box[1] + 22, tile_box[2], tile_box[3] + 22),
        radius=tile_radius,
        fill=(8, 10, 18, 150),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(36))
    canvas.alpha_composite(shadow)

    canvas.paste(tile, (tile_left, tile_top), tile_mask)

    gloss = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    gloss_draw = ImageDraw.Draw(gloss)
    for index in range(170):
        alpha = max(0, 42 - index // 5)
        gloss_draw.rounded_rectangle(
            (tile_box[0], tile_box[1] + index, tile_box[2], tile_box[3]),
            radius=tile_radius,
            fill=(255, 255, 255, alpha),
        )
    gloss_mask = Image.new("L", (1024, 1024), 0)
    gloss_mask.paste(tile_mask, (tile_left, tile_top))
    gloss.putalpha(ImageChops.multiply(gloss.getchannel("A"), gloss_mask))
    canvas.alpha_composite(gloss)

    canvas.save(ICON_OUTPUT_PATH)


def make_icns() -> None:
    if shutil.which("iconutil") is None:
        raise RuntimeError("iconutil is required to generate icon.icns on macOS")

    icon = Image.open(ICON_OUTPUT_PATH).convert("RGBA")

    with tempfile.TemporaryDirectory() as temp_dir:
        iconset_dir = Path(temp_dir) / "icon.iconset"
        iconset_dir.mkdir()

        for file_name, size in ICONSET_FILES:
            rendered = icon if size == 1024 else icon.resize((size, size), Image.Resampling.LANCZOS)
            rendered.save(iconset_dir / file_name)

        subprocess.run(
            ["iconutil", "-c", "icns", str(iconset_dir), "-o", str(ICON_ICNS_OUTPUT_PATH)],
            check=True,
        )


def make_background(size: tuple[int, int], output_path: Path, dpi: tuple[int, int]) -> None:
    width, height = size
    scale = width / 660

    base = Image.new("RGBA", size, (255, 255, 255, 255))

    vignette = Image.new("RGBA", size, (0, 0, 0, 0))
    vignette_draw = ImageDraw.Draw(vignette)
    vignette_draw.rounded_rectangle(
        (
            int(12 * scale),
            int(12 * scale),
            width - int(12 * scale),
            height - int(12 * scale),
        ),
        radius=int(20 * scale),
        outline=(32, 35, 40, 255),
        width=max(1, int(2 * scale)),
    )
    base.alpha_composite(vignette)

    arrow = Image.new("RGBA", size, (0, 0, 0, 0))
    arrow_draw = ImageDraw.Draw(arrow)
    arrow_y = int(height * 0.43)
    arrow_start = int(width * 0.40)
    arrow_end = int(width * 0.61)
    arrow_thickness = max(6, int(8 * scale))
    arrow_color = (20, 22, 26, 255)
    arrow_draw.rounded_rectangle(
        (
            arrow_start,
            arrow_y - arrow_thickness // 2,
            arrow_end,
            arrow_y + arrow_thickness // 2,
        ),
        radius=arrow_thickness // 2,
        fill=arrow_color,
    )
    arrow_draw.polygon(
        (
            (arrow_end - int(2 * scale), arrow_y - int(22 * scale)),
            (arrow_end + int(26 * scale), arrow_y),
            (arrow_end - int(2 * scale), arrow_y + int(22 * scale)),
        ),
        fill=arrow_color,
    )
    base.alpha_composite(arrow)

    footer = Image.new("RGBA", size, (0, 0, 0, 0))
    footer_draw = ImageDraw.Draw(footer)
    footer_font = load_font(max(18, int(20 * scale)))
    footer_text = "Drag RestBro to Applications to install"
    text_box = footer_draw.textbbox((0, 0), footer_text, font=footer_font)
    text_width = text_box[2] - text_box[0]
    text_height = text_box[3] - text_box[1]
    footer_draw.text(
        ((width - text_width) / 2, height - text_height - int(34 * scale)),
        footer_text,
        font=footer_font,
        fill=(47, 52, 62, 255),
    )
    base.alpha_composite(footer)

    base.save(output_path, dpi=dpi)


def main() -> None:
    make_icon()
    make_icns()
    make_background((660, 400), BACKGROUND_PATH, (72, 72))
    make_background((1320, 800), BACKGROUND_RETINA_PATH, (144, 144))


if __name__ == "__main__":
    main()