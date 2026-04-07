#!/usr/bin/env node
/**
 * scripts/notarize.js
 *
 * Post-build notarization hook called automatically by electron-builder
 * when the "afterSign" hook fires on macOS.
 *
 * Required environment variables (set in CI or locally):
 *   APPLE_API_KEY_ID  — Your App Store Connect API key ID (e.g. "ABC123DEFG")
 *   APPLE_API_ISSUER  — Your App Store Connect issuer UUID
 *   APPLE_API_KEY     — The raw contents of the .p8 private key file
 *                       (paste the full PEM text, including header/footer lines)
 *   APPLE_TEAM_ID     — Your Apple Developer Team ID (10-char alphanumeric)
 *
 * The script is a no-op when:
 *   - The platform is not macOS
 *   - The app is not yet signed (identity=null / unsigned builds)
 *   - The required env vars are not set (logs a warning and skips)
 *
 * Docs: https://www.electron.build/configuration/mac#notarize
 */

'use strict';

const { notarize } = require('@electron/notarize');

exports.default = async function afterSign(context) {
  const { electronPlatformName, appOutDir, packager } = context;

  // Only notarize on macOS
  if (electronPlatformName !== 'darwin') return;

  // Skip if signing is intentionally disabled (unsigned dev builds)
  const identity = packager.platformSpecificBuildOptions.identity;
  if (identity === null) {
    console.log('[notarize] Skipping — code signing identity is null (unsigned build).');
    return;
  }

  // Validate required environment variables
  const requiredEnv = ['APPLE_API_KEY_ID', 'APPLE_API_ISSUER', 'APPLE_API_KEY', 'APPLE_TEAM_ID'];
  const missing = requiredEnv.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.warn(`[notarize] Skipping — missing env vars: ${missing.join(', ')}`);
    console.warn('[notarize] Set these in your shell or CI secrets to enable notarization.');
    return;
  }

  const appName = packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`[notarize] Notarizing ${appPath}…`);

  try {
    await notarize({
      appPath,
      appleApiKey: process.env.APPLE_API_KEY,
      appleApiKeyId: process.env.APPLE_API_KEY_ID,
      appleApiIssuer: process.env.APPLE_API_ISSUER,
    });
    console.log('[notarize] Notarization complete.');
  } catch (err) {
    console.error('[notarize] Notarization failed:', err);
    throw err; // Abort the build so a broken release is never published
  }
};
