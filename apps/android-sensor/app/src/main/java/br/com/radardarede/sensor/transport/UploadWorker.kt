package br.com.radardarede.sensor.transport

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import br.com.radardarede.sensor.SensorGraph
import br.com.radardarede.sensor.contract.PayloadCodec

class UploadWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        val settings = SensorGraph.settings
        val eventsEndpoint = settings.eventsEndpoint() ?: return Result.success()
        val healthEndpoint = settings.healthEndpoint() ?: return Result.success()
        val token = settings.token() ?: return Result.failure()
        val events = SensorGraph.outbox.pending()
        if (events.isNotEmpty()) {
            val payload = PayloadCodec.batch(
                networkId = settings.networkId(),
                deviceId = settings.deviceId(),
                payloads = events.map { it.payload },
            )
            val response = runCatching {
                SensorGraph.ingestClient.post(eventsEndpoint, token, payload)
            }.getOrElse {
                SensorGraph.outbox.retryLater(events)
                return Result.retry()
            }
            when {
                response.accepted -> {
                    SensorGraph.outbox.acknowledge(events)
                    SensorGraph.health.recordUploadSucceeded()
                }
                response.retryable -> {
                    SensorGraph.outbox.retryLater(events)
                    return Result.retry()
                }
                else -> return Result.failure()
            }
        }

        val heartbeat = PayloadCodec.heartbeat(
            networkId = settings.networkId(),
            deviceId = settings.deviceId(),
            observedAt = System.currentTimeMillis(),
            outboxPending = SensorGraph.outbox.pendingCount(),
            oldestPendingAt = SensorGraph.outbox.oldestCreatedAt(),
            lastNotificationAt = SensorGraph.health.lastNotificationAt(),
            lastParsedEventAt = SensorGraph.health.lastParsedEventAt(),
            lastUploadSucceededAt = SensorGraph.health.lastUploadSucceededAt(),
            observedCount = SensorGraph.health.observedCount(),
            emittedCount = SensorGraph.health.emittedCount(),
            listenerConnected = SensorGraph.health.listenerConnected(),
        )
        val healthResponse = runCatching {
            SensorGraph.ingestClient.post(healthEndpoint, token, heartbeat)
        }.getOrElse { return Result.retry() }
        return when {
            healthResponse.accepted -> Result.success()
            healthResponse.retryable -> Result.retry()
            else -> Result.failure()
        }
    }
}
