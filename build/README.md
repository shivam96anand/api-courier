# build/

This directory contains static resources used during the packaging step (`electron-builder`).

## Required files

| File | Description |
|------|-------------|
| `icon-source.png` | Square master artwork used to generate the rounded macOS icon. |
| `icon.png` | Rounded 1024×1024 macOS icon source used to build `icon.icns`. |
| `icon.icns` | App icon for macOS. Regenerated automatically by `scripts/generate-macos-assets.py`. |
| `dmg-background.png` | Standard-DPI DMG background. Keep this decorative only; Finder renders the real app and Applications icons. |
| `dmg-background@2x.png` | Retina DMG background at 2× size and 144 DPI. |
| `entitlements.mac.plist` | Hardened Runtime entitlements — already provided. |

## Regenerating macOS Assets

```bash
python3 scripts/generate-macos-assets.py
```

Notes:

- The script regenerates `icon.png`, `icon.icns`, `dmg-background.png`, and `dmg-background@2x.png`.
- The DMG background should not contain the app icon, Applications folder, or their labels. Finder overlays those automatically.
- macOS does not auto-round app icons. The rounded shape must be part of `icon.png` / `icon.icns`.

## Generating icon.icns

```bash
# 1. Start with a 1024×1024 PNG named icon.png in this directory
# 2. Create an iconset
mkdir icon.iconset
sips -z 16 16   icon.png --out icon.iconset/icon_16x16.png
sips -z 32 32   icon.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32   icon.png --out icon.iconset/icon_32x32.png
sips -z 64 64   icon.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128 icon.png --out icon.iconset/icon_128x128.png
sips -z 256 256 icon.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256 icon.png --out icon.iconset/icon_256x256.png
sips -z 512 512 icon.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512 icon.png --out icon.iconset/icon_512x512.png
cp icon.png        icon.iconset/icon_512x512@2x.png
# 3. Convert
iconutil -c icns icon.iconset
# 4. Clean up
rm -rf icon.iconset
```
