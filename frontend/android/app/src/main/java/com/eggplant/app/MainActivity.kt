package com.eggplant.app

import android.content.Intent
import android.os.Bundle
import android.webkit.WebView
import com.getcapacitor.BridgeActivity
import com.getcapacitor.WebViewListener

class MainActivity : BridgeActivity() {
    private var pendingRoomId = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        // registerPlugin must be called before super.onCreate() because the
        // bridge (and its plugin registry) is created inside onCreate.
        registerPlugin(NotificationSocketPlugin::class.java)
        registerPlugin(CallPlugin::class.java)
        super.onCreate(savedInstanceState)

        if (intent != null) {
            pendingRoomId = intent.getLongExtra("room_id", 0L)
        }

        bridge.addWebViewListener(
            object : WebViewListener() {
                override fun onPageLoaded(webView: WebView) {
                    injectPendingRoomId()
                }
            },
        )
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        pendingRoomId = intent.getLongExtra("room_id", 0L)
        if (pendingRoomId > 0L) {
            injectPendingRoomId()
        }
    }

    /**
     * If the app was launched by tapping a notification posted by the native
     * socket service, expose the target room id to the web layer. MainPage
     * reads it once the rooms list has been loaded and navigates to the room.
     */
    private fun injectPendingRoomId() {
        if (pendingRoomId <= 0L) return
        val roomId = pendingRoomId
        pendingRoomId = 0L
        bridge.eval("window.nativeNotificationRoomId = $roomId;", null)
        bridge.triggerWindowJSEvent("nativeNotificationRoomId")
    }
}
