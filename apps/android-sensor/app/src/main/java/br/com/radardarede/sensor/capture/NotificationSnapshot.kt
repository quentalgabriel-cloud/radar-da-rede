package br.com.radardarede.sensor.capture

data class NotificationSnapshot(
    val sourceEventId: String,
    val packageName: String,
    val postedAtEpochMillis: Long,
    val capturedAtEpochMillis: Long,
    val title: String?,
    val text: String?,
    val subText: String?,
    val category: String?,
    val isGroupConversation: Boolean?,
    val messages: List<NotificationMessage> = emptyList(),
)

data class NotificationMessage(
    val text: String,
    val occurredAtEpochMillis: Long,
    val sender: String? = null,
)
