package br.com.radardarede.sensor.transport

import java.net.HttpURLConnection
import java.net.URL

class IngestClient {
    fun post(endpoint: String, bearerToken: String, payload: String): Result {
        val connection = (URL(endpoint).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15_000
            readTimeout = 20_000
            doOutput = true
            setRequestProperty("Authorization", "Bearer $bearerToken")
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("User-Agent", "radar-android-sensor/0.1.0")
        }
        return try {
            connection.outputStream.use { it.write(payload.toByteArray(Charsets.UTF_8)) }
            Result(connection.responseCode)
        } finally {
            connection.disconnect()
        }
    }

    data class Result(val statusCode: Int) {
        val accepted: Boolean get() = statusCode in 200..299
        val retryable: Boolean get() = statusCode == 408 || statusCode == 429 || statusCode >= 500
    }
}
