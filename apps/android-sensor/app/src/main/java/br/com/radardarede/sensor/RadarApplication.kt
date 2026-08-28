package br.com.radardarede.sensor

import android.app.Application

class RadarApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        SensorGraph.initialize(this)
        SensorGraph.uploads.schedulePeriodic()
    }
}
