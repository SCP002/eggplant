package com.eggplant.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Restarts the native notification socket service after the device reboots. No-op for logged-out
 * users.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val serviceIntent = Intent(context, NotificationSocketService::class.java)
        serviceIntent.action = NotificationSocketService.ACTION_START
        context.startService(serviceIntent)
    }
}
