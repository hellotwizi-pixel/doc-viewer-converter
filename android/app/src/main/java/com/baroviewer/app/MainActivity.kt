package com.baroviewer.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.ClipData
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import androidx.webkit.WebViewAssetLoader
import java.io.File

/**
 * 얇은 WebView 래퍼. 렌더는 동일 웹뷰어(assets/web)가 담당한다.
 * 카톡 "다른 앱으로 열기"(ACTION_VIEW)/공유(ACTION_SEND)로 받은 파일을 읽어
 * window.__openFromNative(base64, name, mime)로 주입한다.
 * WebViewAssetLoader의 https 가상 오리진을 써서 Service Worker/ES 모듈이 정상 동작한다.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var pending: Pair<String, String>? = null // inbox 파일명, mime
    private var pageReady = false

    /** 인텐트로 받은 원본을 두는 곳. 웹뷰어가 https 가상 오리진으로 직접 읽는다. */
    private val inboxDir: File by lazy { File(cacheDir, "inbox").apply { mkdirs() } }

    /** 웹뷰어의 <input type="file">이 띄우는 시스템 파일 선택기 연결 */
    private var fileChooser: ValueCallback<Array<Uri>>? = null
    private val pickFile = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val cb = fileChooser ?: return@registerForActivityResult
        fileChooser = null
        cb.onReceiveValue(
            WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
        )
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // /inbox/ 를 가상 오리진으로 서빙 → 큰 문서도 fetch로 그대로 읽힌다.
        // (base64를 evaluateJavascript로 밀어넣으면 수 MB에서 잘려 '손상' 오류가 났다)
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .addPathHandler("/inbox/", WebViewAssetLoader.InternalStoragePathHandler(this, inboxDir))
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
        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(m: android.webkit.ConsoleMessage): Boolean {
                android.util.Log.d(
                    "BaroViewer",
                    "[${m.messageLevel()}] ${m.message()} (${m.sourceId()}:${m.lineNumber()})"
                )
                return true
            }

            // 이게 없으면 뷰어의 "파일 선택" 버튼이 아무 반응도 하지 않는다.
            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams
            ): Boolean {
                fileChooser?.onReceiveValue(null) // 앞선 요청은 취소로 마감
                fileChooser = callback
                return try {
                    pickFile.launch(params.createIntent())
                    true
                } catch (_: Exception) {
                    fileChooser = null
                    false
                }
            }
        }
        // 저장·공유 브리지. 뷰어는 문서 바이트를 네트워크로 내보내지 않는다(egress-0) —
        // 이 브리지도 기기 안에서만(MediaStore/공유 인텐트) 처리한다.
        webView.addJavascriptInterface(FileBridge(), "DocViewerApi")
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

    /** 인텐트에서 파일을 뽑아 inbox에 복사해 둔다(웹뷰어가 URL로 읽는다). */
    private fun readIntent(intent: Intent?) {
        val uri: Uri? = when (intent?.action) {
            Intent.ACTION_VIEW -> intent.data
            Intent.ACTION_SEND -> intent.getParcelableExtra(Intent.EXTRA_STREAM)
            else -> null
        } ?: return
        try {
            val name = sanitize(queryName(uri!!) ?: "문서")
            val mime = contentResolver.getType(uri) ?: ""
            // 앞선 문서는 정리(캐시 누적 방지)
            inboxDir.listFiles()?.forEach { it.delete() }
            val dest = File(inboxDir, name)
            contentResolver.openInputStream(uri)?.use { input ->
                dest.outputStream().use { out -> input.copyTo(out) }
            } ?: return
            if (dest.length() <= 0L) return
            pending = name to mime
        } catch (_: Exception) {
            // 실패 시 그냥 뷰어의 파일피커로 떨어진다
        }
    }

    /** 경로 분리자·상위 경로 표기를 제거해 inbox 밖으로 못 나가게 한다. */
    private fun sanitize(name: String): String {
        val base = name.substringAfterLast('/').substringAfterLast('\\')
        val safe = base.replace("..", "_").trim()
        return if (safe.isEmpty()) "문서" else safe
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
        val (name, mime) = p
        val url = "https://appassets.androidplatform.net/inbox/" + Uri.encode(name)
        // 짧은 URL만 넘긴다 → 문서 크기와 무관하게 안전
        val js = "window.__openFromNativeUrl(${jsStr(url)}, ${jsStr(name)}, ${jsStr(mime)});"
        webView.evaluateJavascript(js, null)
    }

    private fun jsStr(s: String): String =
        "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\""

    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    private fun toast(msg: String) = runOnUiThread {
        Toast.makeText(this@MainActivity, msg, Toast.LENGTH_SHORT).show()
    }

    /** 이름이 겹치면 "문서 (1).pdf"처럼 뒤에 번호를 붙인다. */
    private fun uniqueIn(dir: File, filename: String): File {
        val dot = filename.lastIndexOf('.')
        val stem = if (dot > 0) filename.substring(0, dot) else filename
        val ext = if (dot > 0) filename.substring(dot) else ""
        var f = File(dir, filename)
        var n = 1
        while (f.exists()) {
            f = File(dir, "$stem ($n)$ext")
            n++
        }
        return f
    }

    /**
     * 웹뷰어가 부르는 저장·공유 브리지.
     * @JavascriptInterface가 붙은 메서드만 JS에 노출된다(별 클래스로 분리해 표면 최소화).
     */
    inner class FileBridge {

        /* ── 인텐트로 받은 원본(inbox)을 그대로 쓰는 경로 ──
           바이트가 JS를 거치지 않으니 문서 크기에 영향받지 않는다. */

        @JavascriptInterface
        fun saveInbox(filename: String, mime: String) {
            Thread {
                val src = File(inboxDir, sanitize(filename))
                if (!src.isFile) { toast("저장할 파일을 찾지 못했습니다"); return@Thread }
                runCatching { saveBytes(src.readBytes(), src.name, mime) }
                    .onSuccess { toast("다운로드 폴더에 저장했습니다") }
                    .onFailure { toast("저장 실패: ${it.message ?: "알 수 없는 오류"}") }
            }.start()
        }

        @JavascriptInterface
        fun shareInbox(filename: String, mime: String) {
            Thread {
                val src = File(inboxDir, sanitize(filename))
                if (!src.isFile) { toast("공유할 파일을 찾지 못했습니다"); return@Thread }
                runCatching { shareBytes(src.readBytes(), src.name, mime) }
                    .onFailure { toast("공유 실패: ${it.message ?: "알 수 없는 오류"}") }
            }.start()
        }

        /* ── 웹 파일피커로 고른 파일(네이티브가 원본을 모르는 경우) ── */

        @JavascriptInterface
        fun saveFile(base64: String, filename: String, mime: String) {
            Thread {
                runCatching {
                    saveBytes(Base64.decode(base64, Base64.DEFAULT), sanitize(filename), mime)
                }
                    .onSuccess { toast("다운로드 폴더에 저장했습니다") }
                    .onFailure { toast("저장 실패: ${it.message ?: "알 수 없는 오류"}") }
            }.start()
        }

        @JavascriptInterface
        fun shareFile(base64: String, filename: String, mime: String) {
            Thread {
                runCatching {
                    shareBytes(Base64.decode(base64, Base64.DEFAULT), sanitize(filename), mime)
                }.onFailure { toast("공유 실패: ${it.message ?: "알 수 없는 오류"}") }
            }.start()
        }
    }

    /**
     * 구형 안드로이드(9 이하)는 다운로드 폴더에 쓰려면 런타임 권한이 필요하다.
     * 권한이 없으면 요청만 하고 false — 사용자가 허용 후 다시 누르면 저장된다.
     */
    private fun hasLegacyWritePermission(): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) return true
        val perm = Manifest.permission.WRITE_EXTERNAL_STORAGE
        if (checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED) return true
        runOnUiThread { requestPermissions(arrayOf(perm), 1001) }
        return false
    }

    /** 다운로드 폴더에 저장. Android 10+는 MediaStore, 그 이하는 직접 쓰기. */
    private fun saveBytes(bytes: ByteArray, filename: String, mime: String) {
        val type = if (mime.isBlank()) "application/octet-stream" else mime
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
                put(MediaStore.MediaColumns.MIME_TYPE, type)
                put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
            }
            val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: throw IllegalStateException("저장 위치를 만들 수 없습니다")
            contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
                ?: throw IllegalStateException("저장 스트림을 열 수 없습니다")
        } else {
            if (!hasLegacyWritePermission()) {
                throw IllegalStateException("저장 권한을 허용한 뒤 다시 눌러주세요")
            }
            val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            if (!dir.exists()) dir.mkdirs()
            uniqueIn(dir, filename).writeBytes(bytes)
        }
    }

    /** 캐시에 써서 FileProvider URI로 다른 앱에 넘긴다(카톡·메일·드라이브 등). */
    private fun shareBytes(bytes: ByteArray, filename: String, mime: String) {
        val dir = File(cacheDir, "share").apply { mkdirs() }
        dir.listFiles()?.forEach { it.delete() } // 이전 공유물 정리
        val file = File(dir, filename)
        file.writeBytes(bytes)

        val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
        val send = Intent(Intent.ACTION_SEND).apply {
            type = if (mime.isBlank()) "application/octet-stream" else mime
            putExtra(Intent.EXTRA_STREAM, uri)
            // clipData가 있어야 공유 시트와 대상 앱이 이 URI를 읽을 권한을 받는다.
            clipData = ClipData.newUri(contentResolver, filename, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        runOnUiThread {
            startActivity(Intent.createChooser(send, "공유").apply {
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            })
        }
    }
}
