# build/

This directory contains static resources used during the packaging step (`electron-builder`).

## Required files

| File | Description |
|------|-------------|
| `icon.icns` | App icon for macOS (1024×1024 px recommended, auto-resized). Generate from a PNG with `iconutil` or tools like `electron-icon-builder`. |
| `entitlements.mac.plist` | Hardened Runtime entitlements — already provided. |

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
