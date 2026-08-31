package br.com.radardarede.sensor.settings

import android.content.Context
import java.util.UUID

class SensorSettings(context: Context) {
    private val prefs = context.getSharedPreferences("sensor_settings", Context.MODE_PRIVATE)
    private val secrets = SecretStore(context)

    fun endpoint(): String? = prefs.getString("ingest_endpoint", null)

    fun networkId(): String = id("network_id")

    fun deviceId(): String = id("device_id")

    fun token(): String? = secrets.token()

    fun configure(endpoint: String, networkId: String, deviceId: String, token: String?) {
        require(endpoint.startsWith("https://")) { "O endpoint deve usar HTTPS" }
        UUID.fromString(networkId)
        UUID.fromString(deviceId)
        prefs.edit()
            .putString("ingest_endpoint", endpoint.trimEnd('/'))
            .putString("network_id", networkId)
            .putString("device_id", deviceId)
            .apply()
        if (!token.isNullOrBlank()) secrets.saveToken(token)
    }

    private fun id(key: String): String {
        prefs.getString(key, null)?.let { return it }
        val value = UUID.randomUUID().toString()
        prefs.edit().putString(key, value).apply()
        return value
    }
}
