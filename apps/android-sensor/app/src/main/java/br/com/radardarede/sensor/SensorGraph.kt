package br.com.radardarede.sensor

import android.content.Context
import androidx.room.Room
import br.com.radardarede.sensor.capture.NoOpWhatsAppParser
import br.com.radardarede.sensor.capture.NotificationCaptureCoordinator
import br.com.radardarede.sensor.capture.ProbeHealthStore
import br.com.radardarede.sensor.outbox.OutboxRepository
import br.com.radardarede.sensor.outbox.SensorDatabase
import br.com.radardarede.sensor.settings.SensorSettings
import br.com.radardarede.sensor.transport.IngestClient
import br.com.radardarede.sensor.transport.UploadScheduler

object SensorGraph {
    lateinit var settings: SensorSettings
        private set
    lateinit var outbox: OutboxRepository
        private set
    lateinit var ingestClient: IngestClient
        private set
    lateinit var captureCoordinator: NotificationCaptureCoordinator
        private set
    lateinit var health: ProbeHealthStore
        private set
    lateinit var uploads: UploadScheduler
        private set

    fun initialize(context: Context) {
        if (::settings.isInitialized) return
        val appContext = context.applicationContext
        val database = Room.databaseBuilder(
            appContext,
            SensorDatabase::class.java,
            "radar-sensor.db",
        ).build()
        settings = SensorSettings(appContext)
        outbox = OutboxRepository(database.outboxDao())
        ingestClient = IngestClient()
        health = ProbeHealthStore(appContext)
        uploads = UploadScheduler(appContext)
        captureCoordinator = NotificationCaptureCoordinator(
            parser = NoOpWhatsAppParser(),
            outbox = outbox,
            settings = settings,
            health = health,
            uploads = uploads,
        )
    }
}
