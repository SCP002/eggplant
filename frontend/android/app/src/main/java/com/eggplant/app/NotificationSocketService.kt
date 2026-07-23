package com.eggplant.app

import android.app.*
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.os.SystemClock
import android.webkit.CookieManager
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.*
import okhttp3.*
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.RequestBody.Companion.toRequestBody
import org.commonmark.ext.gfm.strikethrough.StrikethroughExtension
import org.commonmark.ext.gfm.tables.TableCell
import org.commonmark.ext.gfm.tables.TableRow
import org.commonmark.ext.gfm.tables.TablesExtension
import org.commonmark.ext.task.list.items.TaskListItemsExtension
import org.commonmark.node.*
import org.commonmark.parser.Parser
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import kotlin.time.Duration.Companion.seconds

/**
 * Background service that keeps a native WebSocket to /ws/updates alive while
 * the app process lives and posts OS notifications for incoming events even
 * when the WebView/JS layer is suspended or destroyed.
 *
 * All mutable socket/token state lives on the main thread; the reconnect and
 * token-refresh flows run as coroutines on [scope] instead of raw threads.
 */
class NotificationSocketService : Service() {
    companion object {
        const val ACTION_START = "com.eggplant.app.action.START_SOCKET"
        const val ACTION_STOP = "com.eggplant.app.action.STOP_SOCKET"

        private const val PREFS = "eggplant_native"
        private const val KEY_TOKEN = "access_token"
        private const val KEY_BASE_URL = "base_url"

        private const val CHANNEL_ID = "messages"
        private const val CHANNEL_CALLS_ID = "calls"
        private const val UPDATES_PATH = "/ws/updates"

        private const val MAX_RECONNECT_DELAY_SECONDS = 60
        private const val AUTH_FAILURE_CLOSE_CODE = 1008
        private const val RESTART_REQUEST_CODE = 1
        private const val RESTART_DELAY_MS = 1000L

        private sealed interface RefreshResult {
            data class Success(
                val newToken: String,
                val refreshCookie: String?,
            ) : RefreshResult

            data object AuthFailed : RefreshResult

            data object Failed : RefreshResult
        }

        @Volatile
        private var isAppInForeground = false

        private val MARKDOWN_PARSER: Parser =
            Parser
                .builder()
                .extensions(
                    listOf(
                        StrikethroughExtension.create(),
                        TablesExtension.create(),
                        TaskListItemsExtension.create(),
                    ),
                ).build()
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    @Volatile
    private var reconnectAttempt = 0
    private var shouldRun = false
    private var token: String? = null
    private var baseUrl: String? = null
    private var reconnectJob: Job? = null
    private var isRefreshingToken = false
    private var updatesSocket: WebSocket? = null
    private lateinit var okHttpClient: OkHttpClient
    private lateinit var refreshClient: OkHttpClient

    override fun onCreate() {
        super.onCreate()
        okHttpClient =
            OkHttpClient
                .Builder()
                .connectTimeout(15, TimeUnit.SECONDS)
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .pingInterval(30, TimeUnit.SECONDS)
                .build()
        refreshClient =
            OkHttpClient
                .Builder()
                .connectTimeout(15, TimeUnit.SECONDS)
                .readTimeout(10, TimeUnit.SECONDS)
                .build()
        createNotificationChannel()
        registerActivityLifecycleTracker()
    }

    /**
     * Tracks whether the app's activity is in the foreground.
     * After the app is killed and reopened, the web layer never receives
     * an appStateChange event (the app is already in the foreground), so the
     * service must check this itself instead of relying on a JS-side stop.
     */
    private fun registerActivityLifecycleTracker() {
        application.registerActivityLifecycleCallbacks(
            object : Application.ActivityLifecycleCallbacks {
                override fun onActivityResumed(activity: Activity) {
                    isAppInForeground = true
                }

                override fun onActivityPaused(activity: Activity) {
                    isAppInForeground = false
                }

                override fun onActivityDestroyed(activity: Activity) {
                    isAppInForeground = false
                }

                override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {
                }

                override fun onActivityStarted(activity: Activity) {
                }

                override fun onActivityStopped(activity: Activity) {
                }

                override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {
                }
            },
        )
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        isAppInForeground = false
        super.onTaskRemoved(rootIntent)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopInternal()
            cancelRestart()
            stopSelf()
            return START_NOT_STICKY
        }

        shouldRun = true
        val prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
        token = prefs.getString(KEY_TOKEN, null)
        baseUrl = prefs.getString(KEY_BASE_URL, null)

        if (token == null) {
            // Not logged in - nothing to do.
            stopSelf()
            return START_NOT_STICKY
        }

        // Dispatchers.Main.immediate runs this inline on the main thread, so
        // the socket is ensured and the restart scheduled before returning.
        scope.launch {
            ensureSocket()
            scheduleRestart(RESTART_DELAY_MS)
        }
        return START_STICKY
    }

    /**
     * Schedules the service to restart after the given delay.
     */
    private fun scheduleRestart(delayMs: Long) {
        val restartIntent = Intent(this, NotificationSocketService::class.java)
        restartIntent.action = ACTION_START
        restartIntent.setPackage(packageName)
        val restartPendingIntent =
            PendingIntent.getService(
                this,
                RESTART_REQUEST_CODE,
                restartIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        val alarmManager = getSystemService(ALARM_SERVICE) as? AlarmManager ?: return
        val triggerAt = SystemClock.elapsedRealtime() + delayMs
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && alarmManager.canScheduleExactAlarms()) {
            alarmManager.setExactAndAllowWhileIdle(
                AlarmManager.ELAPSED_REALTIME,
                triggerAt,
                restartPendingIntent,
            )
        } else {
            alarmManager.setAndAllowWhileIdle(
                AlarmManager.ELAPSED_REALTIME,
                triggerAt,
                restartPendingIntent,
            )
        }
    }

    private fun cancelRestart() {
        val restartIntent = Intent(this, NotificationSocketService::class.java)
        restartIntent.action = ACTION_START
        restartIntent.setPackage(packageName)
        val pendingIntent =
            PendingIntent.getService(
                this,
                RESTART_REQUEST_CODE,
                restartIntent,
                PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
            )
        if (pendingIntent != null) {
            val alarmManager = getSystemService(ALARM_SERVICE) as? AlarmManager
            alarmManager?.cancel(pendingIntent)
            pendingIntent.cancel()
        }
    }

    private fun stopInternal() {
        shouldRun = false
        reconnectJob?.cancel()
        reconnectJob = null
        updatesSocket?.close(1000, "stopped")
        updatesSocket = null
    }

    private fun ensureSocket() {
        val currentToken = token
        if (currentToken == null || !shouldRun || isRefreshingToken) return
        if (updatesSocket == null) {
            val base =
                baseUrl
                    ?.replace("http://", "ws://")
                    ?.replace("https://", "wss://")
                    ?: return
            val url = base + UPDATES_PATH
            val request =
                Request
                    .Builder()
                    .url(url)
                    .header("Authorization", "Bearer $currentToken")
                    .header("Sec-WebSocket-Protocol", "Authorization, $currentToken")
                    .build()
            updatesSocket = okHttpClient.newWebSocket(request, SocketListener())
        }
    }

    private inner class SocketListener : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            reconnectAttempt = 0
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            handleServerMessage(text)
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            handleDisconnect(webSocket, code)
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            val code =
                if (response?.code == 401 || response?.code == 403) {
                    AUTH_FAILURE_CLOSE_CODE
                } else {
                    -1
                }
            handleDisconnect(webSocket, code)
        }
    }

    private fun handleDisconnect(webSocket: WebSocket, code: Int) {
        scope.launch {
            if (updatesSocket === webSocket) updatesSocket = null
            if (!shouldRun) return@launch
            if (code == AUTH_FAILURE_CLOSE_CODE) {
                refreshAndReconnect()
            } else {
                scheduleReconnect()
            }
        }
    }

    private fun scheduleReconnect() {
        if (reconnectJob?.isActive == true) return
        val attempt = reconnectAttempt++
        val delaySeconds = minOf(1L shl minOf(attempt, 30), MAX_RECONNECT_DELAY_SECONDS.toLong())
        reconnectJob =
            scope.launch {
                delay(delaySeconds.seconds)
                if (!shouldRun) return@launch
                ensureSocket()
            }
    }

    /**
     * Fetches a fresh access token then reconnects the socket with the new token.
     */
    private fun refreshAndReconnect() {
        if (isRefreshingToken) return
        isRefreshingToken = true

        scope.launch {
            val base = baseUrl
            val refreshCookie = getRefreshCookie()
            if (base == null || refreshCookie == null) {
                isRefreshingToken = false
                shouldRun = false
                cancelRestart()
                stopSelf()
                return@launch
            }
            val url = base.toHttpUrl()

            val result =
                withContext(Dispatchers.IO) {
                    performRefresh(url, refreshCookie)
                }

            when (result) {
                is RefreshResult.Success -> {
                    token = result.newToken
                    getSharedPreferences(PREFS, MODE_PRIVATE)
                        .edit()
                        .putString(KEY_TOKEN, result.newToken)
                        .apply()
                    result.refreshCookie?.let { cookie ->
                        CookieManager.getInstance().setCookie(url.toString(), cookie)
                        CookieManager.getInstance().flush()
                    }
                    isRefreshingToken = false
                    ensureSocket()
                }

                RefreshResult.AuthFailed -> {
                    isRefreshingToken = false
                    shouldRun = false
                    cancelRestart()
                    stopSelf()
                }

                RefreshResult.Failed -> {
                    isRefreshingToken = false
                }
            }
        }
    }

    private fun performRefresh(url: HttpUrl, refreshCookie: String): RefreshResult =
        try {
            val request =
                Request
                    .Builder()
                    .url("$url/auth/refresh")
                    .post(ByteArray(0).toRequestBody())
                    .header("Cookie", "refresh_token=$refreshCookie")
                    .build()
            refreshClient.newCall(request).execute().use { response ->
                if (response.isSuccessful && response.body != null) {
                    val obj = JSONObject(response.body!!.string())
                    val newToken = obj.optString("access_token", "")
                    if (newToken.isNotEmpty()) {
                        val refreshCookieHeader =
                            Cookie
                                .parseAll(url, response.headers)
                                .firstOrNull { it.name == "refresh_token" }
                                ?.toString()
                        RefreshResult.Success(newToken, refreshCookieHeader)
                    } else {
                        RefreshResult.Failed
                    }
                } else if (response.code == 401 || response.code == 403) {
                    RefreshResult.AuthFailed
                } else {
                    RefreshResult.Failed
                }
            }
        } catch (e: Exception) {
            // Network failure while refreshing; the next 1008 will retry.
            RefreshResult.Failed
        }

    /**
     * Reads the refresh_token cookie from the WebView's cookie store.
     */
    private fun getRefreshCookie(): String? {
        return try {
            val base = baseUrl ?: return null
            val url = base.toHttpUrl()
            val cookies = CookieManager.getInstance().getCookie(url.toString()) ?: return null
            cookies
                .split(";")
                .mapNotNull { Cookie.parse(url, it.trim()) }
                .firstOrNull { it.name == "refresh_token" }
                ?.value
        } catch (e: Exception) {
            // Cookie store unavailable - treat as no refresh token.
            null
        }
    }

    /**
     * Parses incoming server frames. Only the frames relevant to
     * notifications are handled; everything else is ignored.
     */
    private fun handleServerMessage(text: String) {
        try {
            val obj = JSONObject(text)
            when (obj.optString("type")) {
                "new_message_notification" -> {
                    val payload = obj.optJSONObject("payload") ?: return
                    val roomId = payload.optLong("room_id")
                    val message = payload.optJSONObject("message") ?: return
                    val sender = message.optString("sender", "")
                    var preview = stripMarkdown(message.optString("text", ""))
                    if (preview.isEmpty()) {
                        val attachmentCount = message.optJSONArray("attachments")?.length() ?: 0
                        preview =
                            if (attachmentCount > 0) {
                                getString(R.string.notification_attachment_count, attachmentCount)
                            } else {
                                getString(R.string.notification_new_message_text)
                            }
                    }
                    showNotification(
                        sender.ifEmpty { getString(R.string.notification_new_message_title) },
                        preview,
                        roomId,
                    )
                }

                "room_invitation_received" -> {
                    val payload = obj.optJSONObject("payload") ?: return
                    val roomName = payload.optString("room_name")
                    val inviter = payload.optString("inviter_username")
                    showNotification(
                        getString(R.string.notification_invitation_title),
                        getString(
                            R.string.notification_invitation_invited,
                            inviter,
                            roomName,
                        ),
                        0,
                    )
                }

                "call_state" -> {
                    val payload = obj.optJSONObject("payload") ?: return
                    if (payload.optString("status") == "ringing") {
                        val initiator = payload.optJSONObject("initiator")
                        val caller = initiator?.optString("username", "") ?: ""
                        val callRoomId = payload.optLong("room_id")
                        showCallNotification(caller, callRoomId)
                    }
                }
            }
        } catch (e: Exception) {
            // Malformed frame - ignore
        }
    }

    /**
     * Converts the Markdown into a plain-text.
     */
    private fun stripMarkdown(text: String?): String {
        if (text.isNullOrEmpty()) return ""
        val sb = StringBuilder()
        extractText(MARKDOWN_PARSER.parse(text), sb)
        return sb
            .toString()
            .replace(Regex("\n{2,}"), "\n")
            .trim()
    }

    private fun extractText(node: Node, sb: StringBuilder) {
        when (node) {
            is Text -> {
                sb.append(node.literal)
            }

            is Code -> {
                sb.append(node.literal)
            }

            is FencedCodeBlock -> {
                sb.append('\n').append(node.literal).append('\n')
            }

            is IndentedCodeBlock -> {
                sb.append('\n').append(node.literal).append('\n')
            }

            is Image -> {
                extractChildren(node, sb)
                return
            }

            is SoftLineBreak, is HardLineBreak -> {
                sb.append('\n')
            }

            is Paragraph, is Heading, is BlockQuote, is ListItem, is TableRow, is TableCell -> {
                sb.append('\n')
            }
        }
        extractChildren(node, sb)
    }

    private fun extractChildren(node: Node, sb: StringBuilder) {
        var child = node.firstChild
        while (child != null) {
            extractText(child, sb)
            child = child.next
        }
    }

    private fun buildLaunchIntent(roomId: Long): Intent? {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        if (launchIntent != null) {
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            if (roomId > 0L) {
                launchIntent.putExtra("room_id", roomId)
            }
        }
        return launchIntent
    }

    private fun buildContentIntent(roomId: Long): PendingIntent =
        PendingIntent.getActivity(
            this,
            0,
            buildLaunchIntent(roomId),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    private fun showNotification(title: String, body: String, roomId: Long) {
        if (isAppInForeground) return
        val manager = getSystemService(NOTIFICATION_SERVICE) as? NotificationManager ?: return

        val notification =
            NotificationCompat
                .Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_notification)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(buildContentIntent(roomId))
                .build()

        val id = (System.currentTimeMillis() and 0x7fffffffL).toInt()
        manager.notify(id, notification)
    }

    private fun showCallNotification(caller: String, roomId: Long) {
        if (isAppInForeground) return
        val manager = getSystemService(NOTIFICATION_SERVICE) as? NotificationManager ?: return

        val title = getString(R.string.notification_incoming_call_title)
        val body =
            if (caller.isEmpty()) {
                getString(R.string.notification_incoming_call_text)
            } else {
                getString(R.string.notification_incoming_call_from, caller)
            }

        val notification =
            NotificationCompat
                .Builder(this, CHANNEL_CALLS_ID)
                .setSmallIcon(R.drawable.ic_stat_notification)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setAutoCancel(true)
                .setContentIntent(buildContentIntent(roomId))
                .build()

        val id = (System.currentTimeMillis() and 0x7fffffffL).toInt()
        manager.notify(id, notification)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NOTIFICATION_SERVICE) as? NotificationManager ?: return

            val messages =
                NotificationChannel(
                    CHANNEL_ID,
                    getString(R.string.notification_channel_messages_name),
                    NotificationManager.IMPORTANCE_HIGH,
                ).apply {
                    description = getString(R.string.notification_channel_messages_description)
                }
            manager.createNotificationChannel(messages)

            val calls =
                NotificationChannel(
                    CHANNEL_CALLS_ID,
                    getString(R.string.notification_channel_calls_name),
                    NotificationManager.IMPORTANCE_HIGH,
                ).apply {
                    description = getString(R.string.notification_channel_calls_description)
                    setSound(
                        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
                        AudioAttributes
                            .Builder()
                            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build(),
                    )
                    enableVibration(true)
                }
            manager.createNotificationChannel(calls)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
