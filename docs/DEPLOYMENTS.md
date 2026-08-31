# Deployments

## Supabase/Core

- **Projeto:** `radar-da-rede`
- **Project ref:** `pluruijhqnueayrlkthx`
- **Região:** `sa-east-1`
- **Estado:** `ACTIVE_HEALTHY`
- **Migrations:** `20260826141837_initial_core`, `20260826142021_harden_membership_and_indexes`
- **Edge Functions:** `ingest-events`, `ingest-health`, `process-window`, `radar-read-model` (`ACTIVE`, versão 1)
- **Ensaio remoto:** aprovado em 2026-08-26 com replay idempotente e proveniência completa.

## Radar Web

- **Projeto Vercel:** `radar-da-rede`
- **Project ID:** `prj_7wbF23T6QbEK4oC4qpk6SG6fN26J`
- **Team:** `gquental-projects`
- **URL:** `https://radar-da-rede.vercel.app`
- **Fonte atual:** laboratório com oito cenários sintéticos; default `material-shortage`
- **Backend atual:** nenhum; artefato estático gerado pelo view model.
- **Deployment:** `dpl_4Fic8GXudrGAhxMYk3x536ZCj1TF` (`READY`)

## Consolidação agendada

- **Mecanismo versionado:** `.github/workflows/consolidate.yml`.
- **Horários pretendidos:** 08:00, 13:00 e 18:00 em `America/Recife` (11:00, 16:00 e 21:00 UTC).
- **Janela:** snapshot móvel de 24 horas ancorado no último horário canônico.
- **Estado:** IMPLEMENTADO e TESTADO LOCALMENTE; NÃO VALIDADO REMOTAMENTE.
- **Gate:** configurar `RADAR_SUPABASE_URL`, `RADAR_NETWORK_ID` e `RADAR_PROCESSING_SECRET` em GitHub Actions Secrets e observar ao menos uma execução e um retry idempotente.

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
