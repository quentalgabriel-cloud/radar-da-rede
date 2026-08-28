# Radar da Rede

O Radar da Rede transforma um grande volume de conversas em poucos sinais operacionais confiáveis para a coordenação.

O produto não é CRM, ferramenta de disparo ou perfilamento individual. Sua arquitetura preserva a substituição da fonte:

`Source Adapter -> NormalizedEvent -> Core -> Intelligence -> Radar Web`

## Estado

O laboratório sintético já funciona de ponta a ponta: contratos, oito cenários reproduzíveis, Fake Sensor, ingestão idempotente, inteligência determinística e Radar Web. A versão pública está em [radar-da-rede.vercel.app](https://radar-da-rede.vercel.app).

O Supabase dedicado já recebeu as migrations e passou pelo ensaio remoto de ingestão, replay, heartbeat, processamento e proveniência. O próximo gate do Core é validar Auth/RLS com um usuário operador. As fundações do adapter Android também estão implementadas, porém build, captura, entrega em background e parser com notificações reais no Moto G84 permanecem **NÃO TESTADOS**.

## Comandos

```bash
pnpm install --frozen-lockfile
pnpm verify
```

O build permanece em modo laboratório quando as três variáveis de `.env.example`
não existem. Com URL, chave publicável e network ID, ele também habilita o modo
“Dados reais”, com Supabase Auth e leitura protegida por RLS. Nenhuma chave
privilegiada pertence ao frontend.

Consulte [`docs/PROJECT.md`](docs/PROJECT.md), [`docs/TASKS.md`](docs/TASKS.md), [`docs/TEST_MATRIX.md`](docs/TEST_MATRIX.md) e [`docs/DEPLOYMENTS.md`](docs/DEPLOYMENTS.md).
