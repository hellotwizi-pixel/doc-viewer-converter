package com.baroviewer.app

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.util.Base64
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader

/**
 * 얇은 WebView 래퍼. 렌더는 동일 웹뷰어(assets/web)가 담당한다.
 * 카톡 "다른 앱으로 열기"(ACTION_VIEW)/공유(ACTION_SEND)로 받은 파일을 읽어
 * window.__openFromNative(base64, name, mime)로 주입한다.
 * WebViewAssetLoader의 https 가상 오리진을 써서 Service Worker/ES 모듈이 정상 동작한다.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var pending: Triple<String, String, String>? = null // base64, name, mime
    private var pageReady = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = false
        webView.settings.allowContentAccess = false
        // 핀치 줌 허용(확대/축소) — 줌 버튼 UI는 숨김
        webView.settings.setSupportZoom(true)
        webView.settings.builtInZoomControls = true
        webView.settings.displayZoomControls = false
        webView.settings.useWideViewPort = true
        webView.settings.loadWithOverviewMode = true

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView, request: WebResourceRequest
            ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

            override fun onPageFinished(view: WebView, url: String) {
                pageReady = true
                flushPending()
            }
        }
        // JS 대화상자(alert/confirm/prompt) 활성화 등 — 기본 WebChromeClient 제공
        webView.webChromeClient = WebChromeClient()
        setContentView(webView)

        readIntent(intent)
        webView.loadUrl("https://appassets.androidplatform.net/assets/web/index.html")
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        readIntent(intent)
        if (pageReady) flushPending()
    }

    /** 인텐트에서 파일 URI를 뽑아 base64로 읽어둔다. */
    private fun readIntent(intent: Intent?) {
        val uri: Uri? = when (intent?.action) {
            Intent.ACTION_VIEW -> intent.data
            Intent.ACTION_SEND -> intent.getParcelableExtra(Intent.EXTRA_STREAM)
            else -> null
        } ?: return
        try {
            val bytes = contentResolver.openInputStream(uri!!)?.use { it.readBytes() } ?: return
            val name = queryName(uri) ?: "문서"
            val mime = contentResolver.getType(uri) ?: ""
            pending = Triple(Base64.encodeToString(bytes, Base64.NO_WRAP), name, mime)
        } catch (_: Exception) {
            // 실패 시 그냥 뷰어의 파일피커로 떨어진다
        }
    }

    private fun queryName(uri: Uri): String? {
        contentResolver.query(uri, null, null, null, null)?.use { c ->
            val idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (idx >= 0 && c.moveToFirst()) return c.getString(idx)
        }
        return uri.lastPathSegment
    }

    private fun flushPending() {
        val p = pending ?: return
        pending = null
        val (b64, name, mime) = p
        val js = "window.__openFromNative(${jsStr(b64)}, ${jsStr(name)}, ${jsStr(mime)});"
        webView.evaluateJavascript(js, null)
    }

    private fun jsStr(s: String): String =
        "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\""

    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }
}
