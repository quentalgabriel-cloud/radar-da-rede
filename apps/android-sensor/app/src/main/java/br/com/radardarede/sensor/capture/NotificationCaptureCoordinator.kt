package br.com.radardarede.sensor.capture

import br.com.radardarede.sensor.outbox.OutboxRepository
import br.com.radardarede.sensor.settings.SensorSettings
import br.com.radardarede.sensor.transport.UploadScheduler

class NotificationCaptureCoordinator(
    private val parser: NotificationParser,
    private val outbox: OutboxRepository,
    private val settings: SensorSettings,
    private val health: ProbeHealthStore,
    private val uploads: UploadScheduler,
) {
    fun capture(snapshot: NotificationSnapshot) {
        health.recordObserved()
        val events = parser.parse(snapshot, settings.networkId(), settings.deviceId())
        events.forEach(outbox::enqueue)
        if (events.isNotEmpty()) {
            health.recordEmitted(events.size)
            uploads.enqueueNow()
        }
    }
}
