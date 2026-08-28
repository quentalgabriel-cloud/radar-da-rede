package br.com.radardarede.sensor.capture

import android.content.Context

class ProbeHealthStore(context: Context) {
    private val prefs = context.getSharedPreferences("probe_health", Context.MODE_PRIVATE)

    fun recordObserved() = increment("notifications_observed", 1)

    fun recordEmitted(count: Int) = increment("events_emitted", count)

    fun observedCount(): Long = prefs.getLong("notifications_observed", 0)

    fun emittedCount(): Long = prefs.getLong("events_emitted", 0)

    private fun increment(key: String, by: Int) {
        prefs.edit().putLong(key, prefs.getLong(key, 0) + by).apply()
    }
}
