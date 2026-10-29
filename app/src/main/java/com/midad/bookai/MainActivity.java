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
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;

/** Offline Android host: documents, app assets, and atomic local notebook storage. */
public final class MainActivity extends Activity {
    private static final int PICK_DOCUMENTS = 101;
    private static final int MAX_STATE_BYTES = 64 * 1024 * 1024;
    private static final String ASSET_URL = "file:///android_asset/web/";
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
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        // PDF.js and the OCR template table are app assets loaded from file://.
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setBlockNetworkLoads(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !request.getUrl().toString().startsWith(ASSET_URL);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return !url.startsWith(ASSET_URL);
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

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != PICK_DOCUMENTS || fileCallback == null) return;
        ArrayList<Uri> uris = new ArrayList<>();
        if (resultCode == RESULT_OK && data != null) {
            ClipData clip = data.getClipData();
            if (clip != null) {
                for (int i = 0; i < clip.getItemCount(); i++) uris.add(clip.getItemAt(i).getUri());
            } else if (data.getData() != null) uris.add(data.getData());
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
