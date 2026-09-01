# Radar da Rede

O Radar da Rede transforma um grande volume de conversas em poucos sinais operacionais confiáveis para a coordenação.

O produto não é CRM, ferramenta de disparo ou perfilamento individual. Sua arquitetura preserva a substituição da fonte:

`Source Adapter -> NormalizedEvent -> Core -> Intelligence -> Radar Web`

## Estado

O laboratório sintético já funciona de ponta a ponta: contratos, oito cenários reproduzíveis, Fake Sensor, ingestão idempotente, inteligência determinística e Radar Web. A versão pública está em [radar-da-rede.vercel.app](https://radar-da-rede.vercel.app).

O Supabase dedicado já recebeu seis migrations e seis Edge Functions, com ingestão, replay, heartbeat, processamento e proveniência em uso. O adapter Android `0.3.0-connected` foi recuperado, reconciliado e compilado na `main`, incluindo captura, outbox, upload e heartbeat remoto. A operação já incorpora grupos reais. O Group Registry está ativo em modo shadow: 101 grupos foram reconhecidos no backfill, o replay criou zero duplicações e a classificação administrativa auditável foi validada sem bloquear grupos ainda não classificados.

## Comandos

```bash
pnpm install --frozen-lockfile
pnpm verify
```

O build permanece em modo laboratório quando as três variáveis de `.env.example`
não existem. Com URL, chave publicável e network ID, ele também habilita o modo
“Dados reais”, com Supabase Auth e leitura protegida por RLS. Nenhuma chave
privilegiada pertence ao frontend.

O refresh global e a consolidação backend em três horários estão implementados e testados localmente. O agendamento remoto só será considerado ativo depois da configuração dos GitHub Secrets e da observação de uma execução real. A inteligência oficial continua determinística; módulos externos de IA estão autorizados para fases posteriores sob telemetria, confiança, controle de acesso e fallback.

Consulte [`docs/PROJECT.md`](docs/PROJECT.md), [`docs/TASKS.md`](docs/TASKS.md), [`docs/TEST_MATRIX.md`](docs/TEST_MATRIX.md) e [`docs/DEPLOYMENTS.md`](docs/DEPLOYMENTS.md).
