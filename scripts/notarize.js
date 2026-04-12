#!/usr/bin/env node
/**
 * scripts/notarize.js
 *
 * DEPRECATED — Notarization is now handled by scripts/release-mac.sh
 * which calls `xcrun notarytool` directly after packaging.
 *
 * This file is kept as a no-op so that if someone accidentally adds
 * "afterSign": "scripts/notarize.js" back to electron-builder config,
 * the build won't break — it just won't notarize during packaging.
 *
 * To run a full signed + notarized release, use:
 *   npm run release:mac
 */

'use strict';

exports.default = async function afterSign(_context) {
  console.log('[notarize] No-op — notarization handled by scripts/release-mac.sh');
  console.log('[notarize] Run `npm run release:mac` for the full release pipeline.');
};
