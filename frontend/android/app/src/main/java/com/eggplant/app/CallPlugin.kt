package com.eggplant.app

import android.content.Intent
import android.os.Build
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * JS bridge for the native call foreground service.
 */
@CapacitorPlugin(name = "CallService")
class CallPlugin : Plugin() {
    @PluginMethod
    fun start(call: PluginCall) {
        val context = context
        if (context != null) {
            val intent = Intent(context, CallService::class.java)
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            } catch (e: Exception) {
                call.reject("failed to start call service", e)
                return
            }
        }
        call.resolve()
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        val context = context
        if (context != null) {
            context.stopService(Intent(context, CallService::class.java))
        }
        call.resolve()
    }
}
