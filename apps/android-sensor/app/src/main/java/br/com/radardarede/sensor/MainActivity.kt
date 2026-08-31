package br.com.radardarede.sensor

import android.app.Activity
import android.content.Intent
import android.graphics.Typeface
import android.os.Bundle
import android.provider.Settings
import android.text.InputType
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import java.util.concurrent.Executors

class MainActivity : Activity() {
    private val executor = Executors.newSingleThreadExecutor()
    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(screen())
        refreshStatus()
    }

    override fun onDestroy() {
        executor.shutdown()
        super.onDestroy()
    }

    private fun screen(): ScrollView {
        val spacing = (20 * resources.displayMetrics.density).toInt()
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(spacing, spacing, spacing, spacing)
        }

        content.addView(TextView(this).apply {
            text = "Radar Sensor"
            textSize = 28f
            setTypeface(typeface, Typeface.BOLD)
        })
        content.addView(TextView(this).apply {
            text = "Sensor conectado — parser MessagingStyle v0.3.0"
            textSize = 16f
        })

        val endpoint = field("Endpoint HTTPS de ingestão", SensorGraph.settings.endpoint().orEmpty())
        val network = field("Network ID (UUID)", SensorGraph.settings.networkId())
        val device = field("Device ID (UUID)", SensorGraph.settings.deviceId())
        val token = field("Token do dispositivo (deixe vazio para preservar)", "").apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        content.addView(endpoint)
        content.addView(network)
        content.addView(device)
        content.addView(token)

        content.addView(Button(this).apply {
            text = "Salvar configuração"
            setOnClickListener {
                runCatching {
                    SensorGraph.settings.configure(
                        endpoint.text.toString().trim(),
                        network.text.toString().trim(),
                        device.text.toString().trim(),
                        token.text.toString(),
                    )
                    SensorGraph.uploads.enqueueNow()
                }.onSuccess {
                    token.text.clear()
                    Toast.makeText(this@MainActivity, "Configuração salva", Toast.LENGTH_SHORT).show()
                }.onFailure {
                    Toast.makeText(this@MainActivity, it.message, Toast.LENGTH_LONG).show()
                }
            }
        })
        content.addView(Button(this).apply {
            text = "Abrir acesso às notificações"
            setOnClickListener {
                startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
            }
        })
        content.addView(Button(this).apply {
            text = "Tentar enviar outbox"
            setOnClickListener { SensorGraph.uploads.enqueueNow() }
        })

        status = TextView(this).apply {
            textSize = 15f
            setPadding(0, spacing, 0, 0)
        }
        content.addView(status)

        return ScrollView(this).apply { addView(content) }
    }

    private fun field(hint: String, value: String): EditText = EditText(this).apply {
        this.hint = hint
        setText(value)
        layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
        )
    }

    private fun refreshStatus() {
        executor.execute {
            val pending = SensorGraph.outbox.pendingCount()
            val observed = SensorGraph.health.observedCount()
            val emitted = SensorGraph.health.emittedCount()
            runOnUiThread {
                status.text = "Dispositivo: ${SensorGraph.settings.deviceId()}\n" +
                    "Notificações observadas: $observed\n" +
                    "Eventos emitidos: $emitted\n" +
                    "Outbox pendente: $pending\n" +
                    "Parser: 0.3.0"
            }
        }
    }
}
