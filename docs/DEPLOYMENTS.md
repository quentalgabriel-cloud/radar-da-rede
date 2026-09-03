# Deployments

## Supabase/Core

- **Projeto:** `radar-da-rede`
- **Project ref:** `pluruijhqnueayrlkthx`
- **Região:** `sa-east-1`
- **Estado:** `ACTIVE_HEALTHY`
- **Migrations:** oito aplicadas, incluindo foundation, índices, explicabilidade e acesso da interface do Group Registry.
- **Edge Functions:** seis ativas: `ingest-events` v2, `ingest-health` v2, `process-window` v3, `radar-read-model` v9, `capture-diagnostic` v1 e `process-latest-window` v4.
- **Ensaio remoto:** aprovado em 2026-08-26 com replay idempotente e proveniência completa.
- **Group Registry shadow:** ativado em 2026-08-31. Backfill de 101 observações criou 101 grupos/aliases; repetição resolveu as 101 observações e criou zero registros. Os 652 eventos e 110 lotes permaneceram intactos.
- **Classificação administrativa:** RPCs de classificação e revisão validadas remotamente com owner/operator, histórico auditável e limpeza integral dos dados temporários do ensaio.
- **Estado em 2026-09-03:** 124 grupos/aliases, 1.064 eventos e 175 lotes; nenhuma ambiguidade real pendente no instante da consulta.

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
- **Estado:** IMPLEMENTADO e TESTADO LOCALMENTE; NÃO VALIDADO REMOTAMENTE.
- **Gate:** criar uma credencial de processamento, configurar os três GitHub Actions Secrets e observar ao menos uma execução e um retry idempotente. Em 2026-08-31, `processing_credentials` não possuía credencial ativa.

## Android Sensor

- **Fonte reconciliada:** parser e transporte no commit `ebdc56b`; heartbeat remoto no commit `8bf0cd0`; correção final de compilação no commit `824a8c1`.
- **Versão:** `0.3.0-connected`, versionCode 4.
- **Build remoto final:** GitHub Actions run `33448035276`, aprovado.
- **Artefato:** `radar-sensor-v0.3.0-connected-debug`.
- **SHA-256 do APK debug:** `882F4143BCF4B7ADE3806A6ED0C8ECCDD9FC8B1FB9A1260D62D476EAB392037A`.
- **Estado:** parser, identidade, outbox, upload, heartbeat e compilação TESTADOS; instalação desta build, equivalência e ciclo completo no Moto G84 PENDENTES.

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
