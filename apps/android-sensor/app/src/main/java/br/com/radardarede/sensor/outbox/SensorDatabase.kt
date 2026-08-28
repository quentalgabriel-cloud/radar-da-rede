package br.com.radardarede.sensor.outbox

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(entities = [OutboxEventEntity::class], version = 1, exportSchema = true)
abstract class SensorDatabase : RoomDatabase() {
    abstract fun outboxDao(): OutboxDao
}
