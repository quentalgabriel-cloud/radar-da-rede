package br.com.radardarede.sensor.transport

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

class UploadScheduler(context: Context) {
    private val manager = WorkManager.getInstance(context)
    private val connected = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build()

    fun schedulePeriodic() {
        val request = PeriodicWorkRequestBuilder<UploadWorker>(15, TimeUnit.MINUTES)
            .setConstraints(connected)
            .build()
        manager.enqueueUniquePeriodicWork(
            "radar-outbox-periodic",
            ExistingPeriodicWorkPolicy.UPDATE,
            request,
        )
    }

    fun enqueueNow() {
        val request = OneTimeWorkRequestBuilder<UploadWorker>()
            .setConstraints(connected)
            .build()
        manager.enqueueUniqueWork("radar-outbox-now", ExistingWorkPolicy.KEEP, request)
    }
}
