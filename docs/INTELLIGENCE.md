# Inteligência V1

## Pipeline atual

`events -> janela -> regras determinísticas -> facts -> signals -> alerts`

O pipeline v0.1.0 é intencionalmente simples. Seu papel é estabelecer uma baseline verificável antes de qualquer LLM.

## Regras

- `fact`: categoria detectada por vocabulário versionado, com contagem e referências aos eventos.
- `cross_group_recurrence`: pelo menos três menções em pelo menos dois grupos.
- `operational_blocker`: recorrência alta de material/logística combinada com linguagem de bloqueio ou espera.
- `schedule_change`: linguagem explícita de alteração de horário gera sinal e alerta médio.
- `territory_spike`: pelo menos quatro demandas territoriais concentradas em uma conversa.

## Regressão sintética

Oito cenários têm ground truth explícito: `normal-day`, `material-shortage`,
`event-time-change`, `territory-spike`, `same-topic-multiple-groups`,
`noise-heavy`, `high-volume` (120 eventos) e `offline-recovery`.

## Limites

- A taxonomia é hipótese.
- Não há entendimento semântico amplo.
- Não há inferência sobre pessoas.
- Resultados sintéticos testados não equivalem a validação em dados reais.
- Um adapter de LLM só deve entrar depois de demonstrar ganho contra esta baseline.
