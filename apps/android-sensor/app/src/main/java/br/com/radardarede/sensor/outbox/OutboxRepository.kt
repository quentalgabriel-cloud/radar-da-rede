package br.com.radardarede.sensor.outbox

import br.com.radardarede.sensor.contract.NormalizedEvent
import br.com.radardarede.sensor.contract.PayloadCodec

class OutboxRepository(private val dao: OutboxDao) {
    fun enqueue(event: NormalizedEvent): Boolean =
        dao.insert(
            OutboxEventEntity(
                eventId = event.eventId,
                payload = PayloadCodec.event(event).toString(),
                createdAtEpochMillis = System.currentTimeMillis(),
            ),
        ) != -1L

    fun pending(limit: Int = 100): List<OutboxEventEntity> =
        dao.pending(System.currentTimeMillis(), limit)

    fun acknowledge(events: List<OutboxEventEntity>) = dao.acknowledge(events.map { it.eventId })

    fun retryLater(events: List<OutboxEventEntity>) {
        val highestAttempt = events.maxOfOrNull { it.attempts } ?: 0
        val delayMinutes = minOf(60, 1 shl minOf(6, highestAttempt))
        dao.recordFailure(
            events.map { it.eventId },
            System.currentTimeMillis() + delayMinutes * 60_000L,
        )
    }

    fun pendingCount(): Int = dao.count()

    fun oldestCreatedAt(): Long? = dao.oldestCreatedAt()
}
