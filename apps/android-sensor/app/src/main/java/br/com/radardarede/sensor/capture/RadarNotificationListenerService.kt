package br.com.radardarede.sensor.capture

import android.app.Notification
import android.content.ComponentName
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
            messages = Notification.MessagingStyle.Message
                .getMessagesFromBundleArray(extras.getParcelableArray(Notification.EXTRA_MESSAGES))
                .mapNotNull { message ->
                    val body = message.text?.toString()?.trim().orEmpty()
                    if (body.isEmpty()) null else NotificationMessage(
                        text = body,
                        occurredAtEpochMillis = message.timestamp,
                        sender = message.senderPerson?.name?.toString()
                            ?: message.sender?.toString(),
                    )
                },
        )
        executor.execute { SensorGraph.captureCoordinator.capture(snapshot) }
    }

    override fun onDestroy() {
        SensorGraph.health.recordListenerConnected(false)
        executor.shutdown()
        super.onDestroy()
    }

    companion object {
        private val WHATSAPP_PACKAGES = setOf("com.whatsapp", "com.whatsapp.w4b")
    }
}
    override fun onListenerConnected() {
        super.onListenerConnected()
        SensorGraph.health.recordListenerConnected(true)
        SensorGraph.uploads.enqueueNow()
    }

    override fun onListenerDisconnected() {
        SensorGraph.health.recordListenerConnected(false)
        runCatching {
            requestRebind(ComponentName(this, RadarNotificationListenerService::class.java))
        }
        super.onListenerDisconnected()
    }
