'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const activity = fs.readFileSync(path.join(root, 'app/src/main/java/com/midad/bookai/MainActivity.java'), 'utf8');
const manifest = fs.readFileSync(path.join(root, 'app/src/main/AndroidManifest.xml'), 'utf8');
const html = fs.readFileSync(path.join(root, 'app/src/main/assets/web/index.html'), 'utf8');

test('WebView app UI is served from the reserved HTTPS asset origin', () => {
  assert.match(activity, /appassets\.androidplatform\.net/);
  assert.match(activity, /\/assets\/web\//);
  assert.match(activity, /web\.loadUrl\(ASSET_URL \+ "index\.html"\)/);
  assert.match(activity, /getAssets\(\)\.open\(relative\)/);
  assert.match(activity, /shouldInterceptRequest\(WebView view, WebResourceRequest request\)/);
});

test('WebView denies filesystem access and disables file-origin privileges', () => {
  assert.match(activity, /settings\.setAllowFileAccess\(false\)/);
  assert.match(activity, /settings\.setAllowFileAccessFromFileURLs\(false\)/);
  assert.match(activity, /settings\.setAllowUniversalAccessFromFileURLs\(false\)/);
  assert.doesNotMatch(activity, /setAllowFileAccess\(true\)|setAllowFileAccessFromFileURLs\(true\)|setAllowUniversalAccessFromFileURLs\(true\)/);
});

test('asset URL policy restricts scheme, authority, host, port and path traversal', () => {
  assert.match(activity, /"https"\.equalsIgnoreCase\(uri\.getScheme\(\)\)/);
  assert.match(activity, /ASSET_HOST\.equalsIgnoreCase\(uri\.getHost\(\)\)/);
  assert.match(activity, /isReservedAssetAuthority\(uri\.getEncodedAuthority\(\)\)/);
  assert.match(activity, /"\.\."\.equals\(segment\)/);
  assert.match(activity, /"\."\.equals\(segment\)/);
  assert.match(activity, /blockedResponse\(403, "Forbidden"\)/);
});

test('WebView hardening disables mixed content, Safe Browsing, debugging and secondary windows', () => {
  assert.match(activity, /MIXED_CONTENT_NEVER_ALLOW/);
  assert.match(activity, /setSafeBrowsingEnabled\(true\)/);
  assert.match(activity, /setWebContentsDebuggingEnabled\(false\)/);
  assert.match(activity, /setSupportMultipleWindows\(false\)/);
  assert.match(activity, /setJavaScriptCanOpenWindowsAutomatically\(false\)/);
  assert.match(activity, /setGeolocationEnabled\(false\)/);
});

test('document picker accepts only content URIs and known document MIME types', () => {
  assert.match(activity, /"application\/pdf", "text\/plain", "text\/markdown"/);
  assert.match(activity, /"content"\.equalsIgnoreCase\(uri\.getScheme\(\)\)/);
  assert.match(activity, /isContentDocumentUri\(uri\)/);
});

test('manifest does not grant internet or broad storage permissions', () => {
  assert.doesNotMatch(manifest, /android\.permission\.(INTERNET|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|MANAGE_EXTERNAL_STORAGE)/);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  assert.match(manifest, /android:allowBackup="false"/);
});

test('local content policy forbids embedded frames and plugin objects', () => {
  assert.match(html, /frame-src 'none'/);
  assert.match(html, /object-src 'none'/);
  assert.match(html, /base-uri 'none'/);
  assert.match(html, /form-action 'none'/);
  assert.match(html, /connect-src 'self' blob:/);
});
