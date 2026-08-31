package br.com.radardarede.sensor.capture

import android.content.Context

class ProbeHealthStore(context: Context) {
    private val prefs = context.getSharedPreferences("probe_health", Context.MODE_PRIVATE)

    fun recordObserved() {
        increment("notifications_observed", 1)
        prefs.edit().putLong("last_notification_at", System.currentTimeMillis()).apply()
    }

    fun recordEmitted(count: Int) {
        increment("events_emitted", count)
        prefs.edit().putLong("last_parsed_event_at", System.currentTimeMillis()).apply()
    }

    fun observedCount(): Long = prefs.getLong("notifications_observed", 0)

    fun emittedCount(): Long = prefs.getLong("events_emitted", 0)

    fun recordListenerConnected(connected: Boolean) =
        prefs.edit().putBoolean("listener_connected", connected).apply()

    fun listenerConnected(): Boolean = prefs.getBoolean("listener_connected", false)

    fun lastNotificationAt(): Long? = timestamp("last_notification_at")

    fun lastParsedEventAt(): Long? = timestamp("last_parsed_event_at")

    fun recordUploadSucceeded() =
        prefs.edit().putLong("last_upload_succeeded_at", System.currentTimeMillis()).apply()

    fun lastUploadSucceededAt(): Long? = timestamp("last_upload_succeeded_at")

    private fun timestamp(key: String): Long? = prefs.getLong(key, 0).takeIf { it > 0 }

    private fun increment(key: String, by: Int) {
        prefs.edit().putLong(key, prefs.getLong(key, 0) + by).apply()
    }
}
