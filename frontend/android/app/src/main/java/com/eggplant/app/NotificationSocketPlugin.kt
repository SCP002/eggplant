package com.eggplant.app

import android.app.AlertDialog
import android.content.ComponentName
import android.content.Context
import android.content.DialogInterface
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.util.*

/**
 * JS bridge for the native notification socket service.
 */
@CapacitorPlugin(name = "NotificationSocket")
class NotificationSocketPlugin : Plugin() {
    companion object {
        private const val PREFS = "eggplant_native"
        private const val KEY_TOKEN = "access_token"
        private const val KEY_BASE_URL = "base_url"
    }

    @PluginMethod
    fun configure(call: PluginCall) {
        val token = call.getString("token")
        val baseUrl = call.getString("baseUrl")
        if (token == null || baseUrl == null) {
            call.reject("token and baseUrl are required")
            return
        }
        context
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_TOKEN, token)
            .putString(KEY_BASE_URL, baseUrl)
            .apply()
        call.resolve()
    }

    @PluginMethod
    fun setToken(call: PluginCall) {
        val token = call.getString("token")
        if (token == null) {
            call.reject("token is required")
            return
        }
        context
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_TOKEN, token)
            .apply()
        call.resolve()
    }

    @PluginMethod
    fun checkBatteryOptimizations(call: PluginCall) {
        val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
        val enabled = pm?.isIgnoringBatteryOptimizations(context.packageName) ?: false
        call.resolve(JSObject().apply { put("enabled", enabled) })
    }

    @PluginMethod
    fun requestDisableBatteryOptimizations(call: PluginCall) {
        val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
        val enabled = pm?.isIgnoringBatteryOptimizations(context.packageName) ?: false
        if (enabled) {
            call.resolve(JSObject().apply { put("enabled", true) })
            return
        }
        confirmThenOpen(
            call,
            R.string.dialog_battery_title,
            R.string.dialog_battery_message,
            {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                intent.data = Uri.parse("package:${context.packageName}")
                startActivityForResult(call, intent, "batteryOptimizationResult")
            },
            { call.resolve(JSObject().apply { put("enabled", false) }) },
        )
    }

    @ActivityCallback
    private fun batteryOptimizationResult(call: PluginCall, result: ActivityResult) {
        val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
        val enabled = pm?.isIgnoringBatteryOptimizations(context.packageName) ?: false
        call.resolve(JSObject().apply { put("enabled", enabled) })
    }

    /**
     * Opens the manufacturer's autostart settings (Xiaomi MIUI / HyperOS).
     */
    @PluginMethod
    fun openAutostartSettings(call: PluginCall) {
        confirmThenOpen(
            call,
            R.string.dialog_autostart_title,
            R.string.dialog_autostart_message,
            {
                var opened = false
                val manufacturer = (Build.MANUFACTURER ?: "").lowercase(Locale.ROOT)
                val isXiaomi =
                    manufacturer.contains("xiaomi") ||
                        manufacturer.contains("redmi") ||
                        manufacturer.contains("poco")

                if (isXiaomi) {
                    val targets =
                        arrayOf(
                            ComponentName(
                                "com.miui.securitycenter",
                                "com.miui.permcenter.autostart.AutoStartManagementActivity",
                            ),
                            ComponentName(
                                "com.miui.securitycenter",
                                "com.miui.permcenter.autostart.AutoStartActivity",
                            ),
                        )
                    for (target in targets) {
                        try {
                            val intent = Intent()
                            intent.component = target
                            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            context.startActivity(intent)
                            opened = true
                            break
                        } catch (e: Exception) {
                            // Try the next component / fall back below.
                        }
                    }
                }

                if (!opened) {
                    try {
                        val appDetails = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                        appDetails.data = Uri.parse("package:${context.packageName}")
                        appDetails.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        context.startActivity(appDetails)
                        opened = true
                    } catch (e: Exception) {
                        opened = false
                    }
                }

                call.resolve(JSObject().apply { put("opened", opened) })
            },
            { call.resolve(JSObject().apply { put("opened", false) }) },
        )
    }

    /**
     * Shows a native Yes/No dialog asking for consent.
     */
    private fun confirmThenOpen(call: PluginCall, titleRes: Int, messageRes: Int, onConfirm: () -> Unit, onDismiss: () -> Unit) {
        val activity = activity
        if (activity == null || activity.isFinishing) {
            onConfirm()
            return
        }
        AlertDialog
            .Builder(activity)
            .setTitle(titleRes)
            .setMessage(messageRes)
            .setCancelable(false)
            .setPositiveButton(R.string.dialog_open_settings) { _: DialogInterface, _: Int -> onConfirm() }
            .setNegativeButton(R.string.dialog_not_now) { _: DialogInterface, _: Int -> onDismiss() }
            .show()
    }

    @PluginMethod
    fun start(call: PluginCall) {
        val context = context
        val intent = Intent(context, NotificationSocketService::class.java)
        intent.action = NotificationSocketService.ACTION_START
        try {
            context.startService(intent)
        } catch (e: IllegalStateException) {
            // ignore
        }
        call.resolve()
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        val context = context
        val intent = Intent(context, NotificationSocketService::class.java)
        intent.action = NotificationSocketService.ACTION_STOP
        try {
            context.startService(intent)
        } catch (e: IllegalStateException) {
            // ignore
        }
        call.resolve()
    }
}
