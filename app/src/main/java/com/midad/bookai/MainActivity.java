package com.midad.bookai;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.AtomicFile;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/** Offline Android host: documents, app assets, and atomic local notebook storage. */
public final class MainActivity extends Activity {
    private static final int PICK_DOCUMENTS = 101;
    private static final int MAX_STATE_BYTES = 64 * 1024 * 1024;
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String ASSET_PATH_PREFIX = "/assets/web/";
    private static final String ASSET_URL = "https://" + ASSET_HOST + ASSET_PATH_PREFIX;
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private AtomicFile stateFile;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xfff7f8f4);
        getWindow().setNavigationBarColor(0xfff7f8f4);
        stateFile = new AtomicFile(new File(getFilesDir(), "notebooks.json"));
        web = new WebView(this);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true); // Required by the bundled local application only.
        settings.setDomStorageEnabled(true);
        // Documents are supplied through the system picker as content:// URIs.
        // The WebView itself must never receive general filesystem access.
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setGeolocationEnabled(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        WebView.setWebContentsDebuggingEnabled(false);

        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (!"GET".equalsIgnoreCase(request.getMethod())) return blockedResponse(403, "Forbidden");
                return serveAppAsset(request.getUrl());
            }

            @SuppressWarnings("deprecation")
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
                return serveAppAsset(Uri.parse(url));
            }

            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !isAllowedAssetUri(request.getUrl());
            }

            @SuppressWarnings("deprecation")
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return !isAllowedAssetUri(Uri.parse(url));
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                                        FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("*/*");
                    intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] {
                            "application/pdf", "text/plain", "text/markdown"
                    });
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    startActivityForResult(intent, PICK_DOCUMENTS);
                    return true;
                } catch (Exception e) {
                    fileCallback = null;
                    callback.onReceiveValue(null);
                    return false;
                }
            }
        });
        web.addJavascriptInterface(new Bridge(), "NativeBridge");
        setContentView(web);
        web.loadUrl(ASSET_URL + "index.html");
    }

    private static boolean isContentDocumentUri(Uri uri) {
        return uri != null && "content".equalsIgnoreCase(uri.getScheme());
    }

    /** Accept only the reserved HTTPS origin and the app's static web asset path. */
    private static boolean isAllowedAssetUri(Uri uri) {
        if (uri == null
                || !"https".equalsIgnoreCase(uri.getScheme())
                || !ASSET_HOST.equalsIgnoreCase(uri.getHost())
                || (uri.getPort() != -1 && uri.getPort() != 443)
                || uri.getUserInfo() != null) {
            return false;
        }
        return assetRelativePath(uri) != null;
    }

    /**
     * Returns a safe path relative to assets/web, or null for every malformed or
     * out-of-scope URL. Uri.getPath() decodes percent-encoding before segment checks.
     */
    private static String assetRelativePath(Uri uri) {
        if (uri == null) return null;
        String path = uri.getPath();
        if (path == null || !path.startsWith(ASSET_PATH_PREFIX)
                || path.indexOf('\\\\') >= 0 || path.indexOf('\u0000') >= 0) {
            return null;
        }
        String relative = path.substring(ASSET_PATH_PREFIX.length());
        if (relative.isEmpty()) return "index.html";
        String[] segments = relative.split("/", -1);
        for (String segment : segments) {
            if (segment.isEmpty() || ".".equals(segment) || "..".equals(segment)) return null;
        }
        return relative;
    }

    /** Serve only bundled files. All other origins receive an explicit local denial. */
    private WebResourceResponse serveAppAsset(Uri uri) {
        if (!isAllowedAssetUri(uri)) return blockedResponse(403, "Forbidden");
        String relative = assetRelativePath(uri);
        try {
            InputStream input = getAssets().open(relative);
            String lower = relative.toLowerCase(Locale.ROOT);
            String mime = mimeTypeFor(lower);
            String encoding = isTextAsset(lower) ? "UTF-8" : null;
            Map<String, String> headers = new HashMap<>();
            headers.put("X-Content-Type-Options", "nosniff");
            headers.put("Cache-Control", "no-store");
            return new WebResourceResponse(mime, encoding, 200, "OK", headers, input);
        } catch (IOException e) {
            return emptyResponse(404, "Not Found");
        }
    }

    private static WebResourceResponse blockedResponse(int status, String reason) {
        return emptyResponse(status, reason);
    }

    private static WebResourceResponse emptyResponse(int status, String reason) {
        Map<String, String> headers = new HashMap<>();
        headers.put("X-Content-Type-Options", "nosniff");
        headers.put("Cache-Control", "no-store");
        return new WebResourceResponse("text/plain", "UTF-8", status, reason, headers,
                new java.io.ByteArrayInputStream(new byte[0]));
    }

    private static boolean isTextAsset(String path) {
        return path.endsWith(".html") || path.endsWith(".htm") || path.endsWith(".js")
                || path.endsWith(".mjs") || path.endsWith(".css") || path.endsWith(".json")
                || path.endsWith(".xml") || path.endsWith(".svg") || path.endsWith(".txt");
    }

    private static String mimeTypeFor(String path) {
        if (path.endsWith(".html") || path.endsWith(".htm")) return "text/html";
        if (path.endsWith(".js") || path.endsWith(".mjs")) return "text/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
        if (path.endsWith(".gif")) return "image/gif";
        if (path.endsWith(".woff2")) return "font/woff2";
        if (path.endsWith(".woff")) return "font/woff";
        if (path.endsWith(".ttf")) return "font/ttf";
        if (path.endsWith(".wasm")) return "application/wasm";
        return "application/octet-stream";
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != PICK_DOCUMENTS || fileCallback == null) return;
        ArrayList<Uri> uris = new ArrayList<>();
        if (resultCode == RESULT_OK && data != null) {
            ClipData clip = data.getClipData();
            if (clip != null) {
                for (int i = 0; i < clip.getItemCount(); i++) {
                    Uri uri = clip.getItemAt(i).getUri();
                    if (isContentDocumentUri(uri)) uris.add(uri);
                }
            } else if (isContentDocumentUri(data.getData())) {
                uris.add(data.getData());
            }
        }
        fileCallback.onReceiveValue(uris.isEmpty() ? null : uris.toArray(new Uri[0]));
        fileCallback = null;
    }

    @Override public void onBackPressed() {
        if (web == null) { super.onBackPressed(); return; }
        web.evaluateJavascript("(function(){var m=document.getElementById('modal-root');" +
                "var open=(m && !m.hidden)||document.querySelector('.rail.open,.sources-panel.open');" +
                "if(open)document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));return !!open;})()",
                value -> { if ("false".equals(value)) finish(); });
    }

    @Override protected void onDestroy() {
        if (fileCallback != null) { fileCallback.onReceiveValue(null); fileCallback = null; }
        if (web != null) { web.removeJavascriptInterface("NativeBridge"); web.destroy(); web = null; }
        super.onDestroy();
    }

    public final class Bridge {
        @JavascriptInterface public String getState() {
            try (FileInputStream in = stateFile.openRead(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] block = new byte[32768]; int n; int total = 0;
                while ((n = in.read(block)) != -1) {
                    total += n;
                    if (total > MAX_STATE_BYTES) return "{"; // Trigger the JS safe-read guard.
                    out.write(block, 0, n);
                }
                return new String(out.toByteArray(), StandardCharsets.UTF_8);
            } catch (IOException e) {
                File base = stateFile.getBaseFile();
                // A missing file is normal on first launch. Never overwrite a failed read.
                return base.exists() || new File(base.getPath() + ".bak").exists() ? "{" : "";
            }
        }
        @JavascriptInterface public boolean saveState(String text) {
            if (text == null) return false;
            byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
            if (bytes.length > MAX_STATE_BYTES) return false;
            FileOutputStream out = null;
            synchronized (stateFile) {
                try {
                    out = stateFile.startWrite(); out.write(bytes); stateFile.finishWrite(out); return true;
                } catch (Exception e) {
                    if (out != null) stateFile.failWrite(out);
                    return false;
                }
            }
        }
        @JavascriptInterface public void copyText(String text) {
            ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (clipboard != null) clipboard.setPrimaryClip(ClipData.newPlainText("مداد", text == null ? "" : text));
        }
    }
}
