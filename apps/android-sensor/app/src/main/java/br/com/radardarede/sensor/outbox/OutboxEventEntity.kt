package br.com.radardarede.sensor.outbox

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "outbox_events")
data class OutboxEventEntity(
    @PrimaryKey val eventId: String,
    val payload: String,
    val createdAtEpochMillis: Long,
    val attempts: Int = 0,
    val nextAttemptEpochMillis: Long = 0,
)
