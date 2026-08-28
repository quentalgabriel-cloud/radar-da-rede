package br.com.radardarede.sensor.transport

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import br.com.radardarede.sensor.SensorGraph
import br.com.radardarede.sensor.contract.PayloadCodec

class UploadWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        val settings = SensorGraph.settings
        val endpoint = settings.endpoint() ?: return Result.success()
        val token = settings.token() ?: return Result.failure()
        val events = SensorGraph.outbox.pending()
        if (events.isEmpty()) return Result.success()

        val payload = PayloadCodec.batch(
            networkId = settings.networkId(),
            deviceId = settings.deviceId(),
            payloads = events.map { it.payload },
        )
        return runCatching { SensorGraph.ingestClient.post(endpoint, token, payload) }
            .fold(
                onSuccess = { response ->
                    when {
                        response.accepted -> {
                            SensorGraph.outbox.acknowledge(events)
                            Result.success()
                        }
                        response.retryable -> {
                            SensorGraph.outbox.retryLater(events)
                            Result.retry()
                        }
                        else -> Result.failure()
                    }
                },
                onFailure = {
                    SensorGraph.outbox.retryLater(events)
                    Result.retry()
                },
            )
    }
}
