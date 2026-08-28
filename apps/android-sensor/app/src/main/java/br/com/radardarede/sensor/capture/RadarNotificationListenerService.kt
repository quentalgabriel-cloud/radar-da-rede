package br.com.radardarede.sensor.capture

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import br.com.radardarede.sensor.SensorGraph
import java.util.concurrent.Executors

class RadarNotificationListenerService : NotificationListenerService() {
    private val executor = Executors.newSingleThreadExecutor()

    override fun onNotificationPosted(notification: StatusBarNotification) {
        if (notification.packageName !in WHATSAPP_PACKAGES) return

        val payload = notification.notification
        val extras = payload.extras
        val snapshot = NotificationSnapshot(
            sourceEventId = notification.key,
            packageName = notification.packageName,
            postedAtEpochMillis = notification.postTime,
            capturedAtEpochMillis = System.currentTimeMillis(),
            title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString(),
            text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString(),
            subText = extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString(),
            category = payload.category,
            isGroupConversation = extras.getBoolean(Notification.EXTRA_IS_GROUP_CONVERSATION, false),
        )
        executor.execute { SensorGraph.captureCoordinator.capture(snapshot) }
    }

    override fun onDestroy() {
        executor.shutdown()
        super.onDestroy()
    }

    companion object {
        private val WHATSAPP_PACKAGES = setOf("com.whatsapp", "com.whatsapp.w4b")
    }
}
