# Deployments

## Supabase/Core

- **Projeto:** `radar-da-rede`
- **Project ref:** `pluruijhqnueayrlkthx`
- **Região:** `sa-east-1`
- **Estado:** `ACTIVE_HEALTHY`
- **Migrations:** onze aplicadas. Depois do Group Registry e das métricas P1 vieram `capture_coverage_and_run_anchor` (amostras append-only de captura, colunas de cobertura e procedência da janela em `processing_runs`, `persist_analysis_v3`) e `processing_run_legacy_window_provenance`.
- **Edge Functions:** seis ativas, verificadas em 2026-09-03: `ingest-events` v2, `ingest-health` v2, `process-window` v5, `radar-read-model` v12, `capture-diagnostic` v1 e `process-latest-window` v6. **As correções da P1.1 ainda não foram implantadas.**
- **Ensaio remoto:** aprovado em 2026-08-26 com replay idempotente e proveniência completa.
- **Group Registry shadow:** ativado em 2026-08-31. Backfill de 101 observações criou 101 grupos/aliases; repetição resolveu as 101 observações e criou zero registros. Os 652 eventos e 110 lotes permaneceram intactos.
- **Classificação administrativa:** RPCs de classificação e revisão validadas remotamente com owner/operator, histórico auditável e limpeza integral dos dados temporários do ensaio.
- **Estado em 2026-09-03:** 124 grupos/aliases, 1.064 eventos e 175 lotes; nenhuma ambiguidade real pendente no instante da consulta. Nove execuções de processamento, sendo uma `canonical_slot` e oito `legacy_on_read`, e 30 linhas em `group_metric_windows`.

## Radar Web

- **Projeto Vercel:** `radar-da-rede`
- **Project ID:** `prj_7wbF23T6QbEK4oC4qpk6SG6fN26J`
- **Team:** `gquental-projects`
- **URL:** `https://radar-da-rede.vercel.app`
- **Fonte atual:** laboratório com oito cenários e modo live autenticado pelo Supabase.
- **Backend atual:** Supabase read model com escopo por associação de rede.
- **Deployment funcional verificado:** `dpl_7YeqkzjdVnbqgWbfKwRr5rryJfBb` (`READY`), commit `6d31e49`.
- **Deployment P0:** `dpl_DjjtTiQCQVwdFMFta4QVt8LrL9Rc` (`READY`), commit `dbb68c4`, com classificação administrativa.
- **Integração Git/Vercel:** revalidada no commit `dbb68c4`; publicação automática concluída.

## Consolidação agendada

- **Mecanismo versionado:** `.github/workflows/consolidate.yml`.
- **Horários pretendidos:** 08:00, 13:00 e 18:00 em `America/Recife` (11:00, 16:00 e 21:00 UTC).
- **Janela:** snapshot móvel de 24 horas ancorado no último horário canônico.
- **Falha visível:** desde a P1.1, `check-consolidation-config.mjs` roda antes do passo canônico e derruba o job quando falta qualquer configuração obrigatória. O job não pode mais ficar verde pulando o processamento.
- **Sumário do job:** `run-consolidation.mjs` grava em `GITHUB_STEP_SUMMARY` status, referência da rede, janela, execução, contagens, cobertura e duração. A rede aparece como `network_ref` (prefixo do SHA-256), nunca como identificador em claro.
- **Credencial:** criada em 2026-09-03 pelo mecanismo existente. `token_hint` `p11-sched`, id `9a54b2a1-eeb8-45b7-b1f6-cdaa38e11cce`, somente SHA-256 no banco. Revogar com `update public.processing_credentials set revoked_at = now() where id = '9a54b2a1-...';` — isso não afeta a ingestão, que usa `device_credentials`.
- **Estado:** a consolidação foi VALIDADA REMOTAMENTE fora do GitHub: execução real `954bd295-06cc-4a45-a7ce-d7914a5277c0` na janela `2026-09-02T16:00Z → 2026-09-03T16:00Z` (189 eventos, 4 fatos, 4 sinais, 1 alerta, 30 métricas), replay idempotente sem duplicar nada e falha visível com credencial inválida.
- **Gate restante:** configurar os três GitHub Actions Secrets e observar uma execução agendada real. PENDENTE.

## Release da P1.1

A ordem importa. Implantar `radar-read-model` antes de o scheduler funcionar
deixaria a produção sem atualização, porque a versão nova não consolida ao
responder GET.

1. configurar `RADAR_SUPABASE_URL`, `RADAR_NETWORK_ID` e `RADAR_PROCESSING_SECRET`;
2. executar `Consolidate Radar` manualmente e comprovar verde com sumário, depois comprovar vermelho sem um dos secrets;
3. `supabase functions deploy process-window process-latest-window radar-read-model --project-ref pluruijhqnueayrlkthx`, sempre a partir do repositório, para garantir identidade byte a byte com `main`;
4. conferir no banco: uma linha de métrica por grupo ativo, `capture_confidence` e `capture_coverage` preenchidos na execução e `window_kind = 'canonical_slot'`;
5. aguardar o mesmo slot do dia seguinte para obter a segunda janela comparável.

Rollback por camada: desligar a flag do Control Center; `GROUP_METRICS_SHADOW_ENABLED=false`; reimplantar as versões atuais (`process-window` v5, `process-latest-window` v6, `radar-read-model` v12); remover `persist_analysis_v3`, já que a cadeia degrada sozinha para a v2 e depois para a v1.

## Android Sensor

- **Fonte reconciliada:** parser e transporte no commit `ebdc56b`; heartbeat remoto no commit `8bf0cd0`; correção final de compilação no commit `824a8c1`.
- **Versão:** `0.3.0-connected`, versionCode 4.
- **Build remoto final:** GitHub Actions run `33448035276`, aprovado.
- **Artefato:** `radar-sensor-v0.3.0-connected-debug`.
- **SHA-256 do APK debug:** `882F4143BCF4B7ADE3806A6ED0C8ECCDD9FC8B1FB9A1260D62D476EAB392037A`.
- **Estado:** parser, identidade, outbox, upload, heartbeat e compilação TESTADOS; instalação desta build, equivalência e ciclo completo no Moto G84 PENDENTES.
- **Evidência remota de 2026-09-03:** os heartbeats chegam com `adapter_version` `0.3.0-connected`, mas `listener_connected`, `notification_access`, `whatsapp_installed` e `network_type` chegam nulos. O código atual do repositório envia `listener_connected`; portanto o aparelho ainda roda uma build anterior ao commit `8bf0cd0`, coerente com a instalação registrada como pendente acima.
- **Lacuna de produto:** nenhum APK do repositório envia `notification_access`, `whatsapp_installed` ou `network_type`. Sem esses campos a confiança de captura fica limitada a `moderate` (`configuration_not_reported`). Reportá-los é pré-requisito para o nível `high`.
- **SHA-256 dos artefatos locais:** `radar-sensor-v0.3.0-connected-debug/app-debug.apk` = `9861b1104b818f4f6658c0b423a494fdd411d884c1292763730565185b2cef24`; `radar-sensor-v0.3.0-connected-heartbeat/app-debug.apk` = `882f4143bcf4b7ade3806a6ed0c8eccdd9fc8b1fb9a1260d62d476eab392037a`.

### Configuração obrigatória de Auth

No Supabase Auth, a `Site URL` de produção deve ser `https://radar-da-rede.vercel.app`.

Redirect URLs recomendadas:

- `https://radar-da-rede.vercel.app/**`
- `http://localhost:3000/**`
- `http://localhost:5173/**`

O Radar Web envia `redirect_to` no cadastro para evitar que e-mails de confirmação dependam do valor padrão do projeto Supabase. Mesmo assim, a URL de produção precisa estar permitida no Supabase para que a confirmação funcione.

### Verificação de 2026-08-26

- deployment READY;
- build sem erros;
- overview com 5 eventos, 3 grupos, 1 sinal e 1 alerta;
- navegação entre Radar, Explorar e Saúde;
- filtro `bairro novo` retorna uma evidência;
- health mostra heartbeat, fila e versões;
- seletor alterna os oito cenários no mesmo view model;
- `event-time-change` mostra alerta médio com evidência;
- `high-volume` mostra 120 eventos, 8 grupos, 2 sinais e nenhum falso alerta;
- `offline-recovery` preserva seu estado de saúde;
- bundle preparado para distinguir dados sintéticos de dados persistidos;
- `?mode=live` abre a autenticação e mantém o read model oculto sem sessão;
- troca de volta ao laboratório restaura o cenário `material-shortage` e suas métricas;
- sem overlay de erro da aplicação;
- erros observados no console pertenciam à extensão do navegador, não ao site.
