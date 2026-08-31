# Deployments

## Supabase/Core

- **Projeto:** `radar-da-rede`
- **Project ref:** `pluruijhqnueayrlkthx`
- **Região:** `sa-east-1`
- **Estado:** `ACTIVE_HEALTHY`
- **Migrations:** quatro, incluindo `20260827185240_capture_health_diagnostics` e `20260827185523_harden_capture_diagnostics`.
- **Edge Functions:** seis ativas: `ingest-events` v2, `ingest-health` v2, `process-window` v1, `radar-read-model` v6, `capture-diagnostic` v1 e `process-latest-window` v2.
- **Ensaio remoto:** aprovado em 2026-08-26 com replay idempotente e proveniência completa.

## Radar Web

- **Projeto Vercel:** `radar-da-rede`
- **Project ID:** `prj_7wbF23T6QbEK4oC4qpk6SG6fN26J`
- **Team:** `gquental-projects`
- **URL:** `https://radar-da-rede.vercel.app`
- **Fonte atual:** laboratório com oito cenários e modo live autenticado pelo Supabase.
- **Backend atual:** Supabase read model com escopo por associação de rede.
- **Deployment funcional verificado:** `dpl_7YeqkzjdVnbqgWbfKwRr5rryJfBb` (`READY`), commit `6d31e49`.
- **Atenção:** o deploy automático do commit documental `a4136f5` falhou ao clonar o repositório; a integração Git/Vercel precisa ser revalidada no próximo push.

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
