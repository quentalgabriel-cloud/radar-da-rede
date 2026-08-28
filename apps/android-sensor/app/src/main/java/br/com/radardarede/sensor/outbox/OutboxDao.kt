package br.com.radardarede.sensor.outbox

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface OutboxDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    fun insert(event: OutboxEventEntity): Long

    @Query(
        "SELECT * FROM outbox_events " +
            "WHERE nextAttemptEpochMillis <= :now " +
            "ORDER BY createdAtEpochMillis ASC LIMIT :limit",
    )
    fun pending(now: Long, limit: Int): List<OutboxEventEntity>

    @Query("DELETE FROM outbox_events WHERE eventId IN (:eventIds)")
    fun acknowledge(eventIds: List<String>)

    @Query(
        "UPDATE outbox_events SET attempts = attempts + 1, " +
            "nextAttemptEpochMillis = :nextAttempt WHERE eventId IN (:eventIds)",
    )
    fun recordFailure(eventIds: List<String>, nextAttempt: Long)

    @Query("SELECT COUNT(*) FROM outbox_events")
    fun count(): Int

    @Query("SELECT MIN(createdAtEpochMillis) FROM outbox_events")
    fun oldestCreatedAt(): Long?
}
