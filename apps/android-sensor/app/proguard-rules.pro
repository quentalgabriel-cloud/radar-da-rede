# Room and WorkManager ship their own consumer rules. Keep application DTO names
# because payload keys are written explicitly and may be inspected during probes.
-keepnames class br.com.radardarede.sensor.contract.** { *; }
