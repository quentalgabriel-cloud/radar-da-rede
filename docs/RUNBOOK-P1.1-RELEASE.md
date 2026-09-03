# Runbook — release da P1.1

Objetivo: ligar o scheduler, publicar as correções analíticas e provar no banco
que elas valem em produção. Sem isso, o código corrigido não muda nada para a
operação.

Tempo estimado: 20 minutos hoje, mais uma conferência no dia seguinte.

**A ordem importa.** Implantar `radar-read-model` antes de o scheduler funcionar
deixaria a produção sem atualização, porque a versão nova não consolida mais ao
responder um GET.

## Antes de começar

| Item | Valor |
|---|---|
| Repositório | `quentalgabriel-cloud/radar-da-rede` |
| Project ref Supabase | `pluruijhqnueayrlkthx` |
| Rede piloto | `d1224e68-c51f-4b31-a7e6-7b91f1a65357` |
| Credencial de processamento | `p11-sched`, id `9a54b2a1-eeb8-45b7-b1f6-cdaa38e11cce` |

Abra um **terminal novo** (PowerShell). O `gh` foi instalado nesta máquina e só
entra no PATH depois de reiniciar o shell.

```powershell
cd C:\Users\tassi\Documents\Codex\2026-08-28\github-plugin-github-openai-curated-remote\work\radar-upload
gh auth status
```

Esperado: `Logged in to github.com account quentalgabriel-cloud`.

---

## Passo 1 — Mergear o PR aberto

```powershell
gh pr checks 2
gh pr merge 2 --squash --delete-branch
git checkout main
git pull
```

Esperado: todos os checks `pass` antes do merge.

---

## Passo 2 — Configurar os três secrets

O valor da credencial está em
`..\..\RADAR-SECRETS-2026-09-03.txt`, na última linha do arquivo. O comando
abaixo lê direto de lá, sem o valor passar pelo histórico do terminal.

```powershell
gh secret set RADAR_SUPABASE_URL --body "https://pluruijhqnueayrlkthx.supabase.co"
gh secret set RADAR_NETWORK_ID --body "d1224e68-c51f-4b31-a7e6-7b91f1a65357"
Get-Content "..\..\RADAR-SECRETS-2026-09-03.txt" -Tail 1 | gh secret set RADAR_PROCESSING_SECRET
gh secret list
```

Esperado: os três nomes aparecem na lista.

Depois disso, **apague o arquivo da credencial**:

```powershell
Remove-Item "..\..\RADAR-SECRETS-2026-09-03.txt"
```

Se o arquivo já não existir, não tente recuperá-lo. Crie uma credencial nova
(seção "Rotacionar a credencial", no fim).

---

## Passo 3 — Provar que o job fica verde

```powershell
gh workflow run "Consolidate Radar"
Start-Sleep -Seconds 20
gh run list --workflow "Consolidate Radar" --limit 1
```

Aguarde terminar e veja o sumário:

```powershell
gh run watch --exit-status
```

Esperado: `success`. Abra o run no navegador (`gh run view --web`) e confira a
tabela do sumário: status `completed`, janela, execução, contagens e duração.
A rede aparece como `network_ref`, um hash — isso é intencional.

---

## Passo 4 — Provar que o job fica vermelho sem configuração

Este é o gate que elimina o falso verde. Leva um minuto.

```powershell
gh secret delete RADAR_NETWORK_ID
gh workflow run "Consolidate Radar"
Start-Sleep -Seconds 20
gh run watch
```

Esperado: **failure**, com a mensagem
`Consolidation is not configured, so no Radar window can be processed.`

Restaure em seguida:

```powershell
gh secret set RADAR_NETWORK_ID --body "d1224e68-c51f-4b31-a7e6-7b91f1a65357"
```

---

## Passo 5 — Publicar as três Edge Functions

Não precisa de Docker nem de instalar nada global: `--use-api` faz o bundle no
servidor.

```powershell
npx supabase@latest login
npx supabase@latest functions deploy process-window process-latest-window radar-read-model --project-ref pluruijhqnueayrlkthx --use-api
```

`login` abre o navegador. Autorize com a conta dona do projeto.

Esperado: as três funções publicadas. Confira as versões:

```powershell
npx supabase@latest functions list --project-ref pluruijhqnueayrlkthx
```

Esperado: `process-window` v6, `process-latest-window` v7, `radar-read-model` v13
(uma versão acima das atuais v5, v6 e v12).

O `verify_jwt` de cada função vem de `supabase/config.toml` e não deve mudar:
`process-window` continua `false`, as outras duas continuam `true`.

---

## Passo 6 — Rodar uma janela com o código novo e conferir no banco

```powershell
gh workflow run "Consolidate Radar"
gh run watch --exit-status
```

Depois abra o SQL Editor do Supabase e rode:

```sql
select
  r.id,
  r.starts_at,
  r.ends_at,
  r.window_kind,
  r.capture_confidence,
  r.capture_coverage->>'reason'          as motivo_cobertura,
  r.capture_coverage->>'coverage_ratio'  as cobertura,
  (select count(*) from public.group_metric_windows m
    where m.processing_run_id = r.id)    as linhas_de_metrica,
  (select count(*) from public.groups g
    where g.network_id = r.network_id and g.status = 'active') as grupos_ativos
from public.processing_runs r
order by r.ends_at desc
limit 3;
```

O que precisa ser verdade na execução mais recente:

- `window_kind` = `canonical_slot`;
- `linhas_de_metrica` **igual** a `grupos_ativos` — uma linha por grupo, inclusive
  os que não tiveram nenhum evento;
- `capture_confidence` preenchido, não nulo;
- `motivo_cobertura` explicando o nível.

Se `linhas_de_metrica` for menor que `grupos_ativos`, o deploy não pegou. Volte
ao passo 5.

Sobre a confiança nesta primeira semana: ela vai aparecer baixa ou moderada
porque a série de amostras de saúde começou em 2026-09-03 19:52 UTC e ainda não
cobre 24 horas. Isso é falta de histórico, não falha de captura, e se resolve
sozinho com o tempo de operação.

---

## Passo 7 — No dia seguinte, a segunda janela comparável

Depois que o mesmo horário se repetir (08:00, 13:00 ou 18:00 de Recife), rode:

```sql
select id, starts_at, ends_at, window_kind, capture_confidence
from public.processing_runs
where window_kind = 'canonical_slot'
order by ends_at desc
limit 4;
```

Esperado: duas execuções `canonical_slot` com o mesmo horário final em dias
consecutivos. É isso que fecha o gate da tendência.

Com essas duas, o Control Center passa a ter comparação real. **Não ligue a flag
ainda**: faltam E2E de navegador, matriz de campo do Moto G84, SLOs e a validação
de vocabulário com a coordenação.

---

## Se algo der errado

**O job fica vermelho com `invalid_processing_credentials`.**
O secret está errado ou a credencial foi revogada. Rotacione (abaixo).

**O deploy falha por autenticação.**
Rode `npx supabase@latest login` de novo e confirme que a conta é dona do projeto.

**A produção parou de atualizar depois do passo 5.**
É o sintoma esperado se o scheduler não estiver funcionando. Confirme o passo 3
antes de investigar qualquer outra coisa.

## Rollback, por camada

Do menos ao mais invasivo:

```sql
-- 1. desligar o Control Center (não afeta captura nem ingestão)
update public.networks set group_control_center_enabled = false
where id = 'd1224e68-c51f-4b31-a7e6-7b91f1a65357';
```

```powershell
# 2. voltar as funções para as versões anteriores
git checkout 86c66fb -- supabase/functions
npx supabase@latest functions deploy process-window process-latest-window radar-read-model --project-ref pluruijhqnueayrlkthx --use-api
git checkout HEAD -- supabase/functions
```

```sql
-- 3. desfazer a RPC nova; a cadeia degrada sozinha para v2 e depois v1
drop function if exists public.persist_analysis_v3(jsonb);
```

Revogar a credencial de processamento interrompe a consolidação e **não** afeta
a ingestão do Android, que usa `device_credentials`:

```sql
update public.processing_credentials set revoked_at = now()
where id = '9a54b2a1-eeb8-45b7-b1f6-cdaa38e11cce';
```

## Rotacionar a credencial

Se o valor se perdeu, gere outro. Nunca tente recuperar o antigo: só o SHA-256
está no banco.

```powershell
$secret = -join ((1..48) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
$hash = (Get-FileHash -InputStream ([IO.MemoryStream]::new([Text.Encoding]::UTF8.GetBytes($secret))) -Algorithm SHA256).Hash.ToLower()
"hash para o banco: $hash"
$secret | gh secret set RADAR_PROCESSING_SECRET
```

Depois, no SQL Editor, com o hash impresso acima:

```sql
update public.processing_credentials set revoked_at = now()
where network_id = 'd1224e68-c51f-4b31-a7e6-7b91f1a65357' and revoked_at is null;

insert into public.processing_credentials (network_id, token_hash, token_hint, label)
values ('d1224e68-c51f-4b31-a7e6-7b91f1a65357', '<hash>', 'p11-sched', 'consolidation scheduler');
```
