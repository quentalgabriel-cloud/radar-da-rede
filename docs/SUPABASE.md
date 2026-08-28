# Supabase/Core

## Estado

A base declarativa está em `supabase/schemas/core.sql`. O projeto dedicado
`radar-da-rede` (`pluruijhqnueayrlkthx`, `sa-east-1`) foi criado em 2026-08-26.
As duas migrations estão aplicadas e as quatro Edge Functions estão ativas.

O schema inclui:

- redes, membros e source devices;
- credenciais de dispositivo somente como SHA-256 de tokens aleatórios fortes;
- batches e `NormalizedEvent` idempotentes;
- último heartbeat por dispositivo;
- execuções de processamento e `facts`, `signals` e `alerts` com proveniência;
- RLS de leitura por membership e grants explícitos;
- RPCs transacionais de ingestão e persistência da análise acessíveis apenas por `service_role`.

As Edge Functions `ingest-events` e `ingest-health` desabilitam o JWT da
plataforma porque o bearer é uma credencial própria do dispositivo. O handler
faz autenticação, valida contrato e escopo antes de chamar a RPC. A service role
fica somente nos secrets automáticos do runtime Supabase.

A Edge Function `process-window` lê no máximo 5.000 eventos de uma janela de até
sete dias, executa a mesma inteligência determinística versionada do monorepo e
persiste o resultado por meio de `persist_analysis`. O RPC serializa replays da
mesma entrada, substitui o resultado dentro de uma transação e mantém IDs
determinísticos e proveniência até os eventos de origem. Essa função usa uma
credencial operacional separada, escopada por rede e armazenada somente como
SHA-256 em `processing_credentials`.

A Edge Function `radar-read-model` aceita somente JWT de usuário, usa o cliente
escopado do `@supabase/server` e deixa a RLS decidir quais redes podem ser
lidas. Ela monta o mesmo contrato consumido hoje pelo laboratório sintético,
incluindo evidências, saúde e proveniência. Assim, a troca futura no Radar Web é
de provider e autenticação, não de componentes ou regras de apresentação.

## Workflow aplicado

1. projeto dedicado criado em `sa-east-1`;
2. migrations `initial_core` e `harden_membership_and_indexes` aplicadas;
3. `ingest-events`, `ingest-health`, `process-window` e `radar-read-model` publicadas;
4. advisors executados após DDL;
5. Fake Sensor executado com replay 2 e credenciais temporárias revogadas;
6. leitura autenticada via RLS permanece como próximo gate.

O repositório mantém schema declarativo porque este é um projeto novo. Schema e
migration gerada deverão ser commitados juntos; alterações remotas manuais não
farão parte do workflow.

## Provisionamento do primeiro device

Gerar um token aleatório de pelo menos 32 bytes. Persistir apenas o SHA-256 em
`device_credentials` e entregar o valor original ao adapter uma única vez. O
token pode ser revogado sem remover o device ou os eventos históricos.

## Provisionamento do processador

Gerar outro segredo aleatório de pelo menos 32 bytes, independente dos tokens de
device. Persistir somente seu SHA-256 em `processing_credentials` e entregar o
valor original apenas ao job que invoca `process-window`. A credencial é
escopada por rede; a função também limita intervalo e quantidade de eventos.

## Ensaio remoto reproduzível

Depois de provisionar a rede, o Fake Sensor pode comprovar ingestão idempotente,
heartbeat e processamento no mesmo fluxo. O endpoint é a raiz de Functions do
projeto, sem incluir o nome da função:

```bash
RADAR_DEVICE_SECRET='<segredo-do-device>' \
RADAR_PROCESSING_SECRET='<segredo-do-processador>' \
pnpm --filter @radar-rede/fake-sensor scenario -- \
  --scenario material-shortage \
  --endpoint https://<project-ref>.supabase.co/functions/v1 \
  --replay 2
```

O primeiro batch deve ser aceito, o replay deve ser reconhecido como duplicado,
o heartbeat deve ser atualizado e `processing` deve informar as contagens
persistidas. Segredos reais nunca entram no repositório nem na saída documentada.

### Evidência de 2026-08-26

- primeiro batch: 5 eventos aceitos;
- replay: batch duplicado, 0 eventos adicionais;
- heartbeat: atualizado e não obsoleto;
- processamento: 3 facts, 1 signal e 1 alert;
- banco: 1 batch, 5 eventos, 1 heartbeat e 1 processing run;
- proveniência: todas as referências derivadas resolvem para eventos persistidos;
- credenciais temporárias: removidas após o ensaio;
- read model sem JWT: rejeitado pelo gateway com 401;
- logs das funções: ingestão 202/200, health 202 e processamento 200;
- advisors: nenhum warning de segurança e nenhuma FK sem índice; restam apenas infos intencionais/esperadas.

## Acesso humano e Radar Web

O frontend tem dois providers: laboratório e Supabase. O modo real só é
habilitado no build quando `RADAR_SUPABASE_URL`,
`RADAR_SUPABASE_PUBLISHABLE_KEY` e `RADAR_NETWORK_ID` existem. A chave
publicável identifica o app; o JWT da sessão identifica o usuário. O read model
continua protegido por membership e RLS.

Depois que o usuário criar e confirmar seu acesso, um administrador deve
incluí-lo explicitamente na rede:

```sql
insert into public.network_members (network_id, user_id, role)
values ('<network-id>', '<auth-user-id>', 'operator');
```

Esse vínculo não é automático: cadastro no Auth não concede acesso aos dados.
