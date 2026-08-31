# Radar da Rede — contexto operacional

## North Star

Transformar uma rede volumosa de grupos de WhatsApp em poucos sinais operacionais confiáveis para que a coordenação entenda o que está acontecendo e saiba o que merece atenção.

Nesta fase, aumentamos simultaneamente a inteligência do Core e a compreensibilidade do produto: o banco deve ficar mais coerente por baixo e o Radar mais simples por cima.

## Limite do produto

O Radar é inteligência operacional. Não é CRM, ferramenta de disparo, automação de persuasão ou perfilamento individual.

## Arquitetura de referência

`Source Adapter -> NormalizedEvent -> Core -> Intelligence -> Radar Web`

Fake Sensor, Android Notification Adapter e eventual WAHA Adapter convergem no mesmo contrato. O frontend não participa do caminho crítico de ingestão.

## Estado real

- Contratos v0.1.0 e monorepo: TESTADOS localmente.
- Fake Sensor e replay idempotente no Core Simulator: TESTADOS localmente.
- Supabase/Core: duas migrations aplicadas, quatro Edge Functions ativas e ensaio sintético remoto TESTADO.
- Inteligência determinística v0.1.0: TESTADA contra o ground truth dos oito cenários sintéticos.
- Radar Web sintético: TESTADO localmente e no navegador, publicado em produção no Vercel.
- Radar Web orientado a linguagem humana e progressão resumo -> detalhe -> evidência: IMPLEMENTADO e TESTADO localmente; publicação desta rodada pendente.
- Android foundations: checks estáticos TESTADOS; build Android NÃO TESTADO.
- Captura, entrega em background e recuperação após offline no Moto G84: NÃO TESTADAS fisicamente.
- Parser WhatsApp com fixtures reais: NÃO TESTADO.
- Refresh global com intervalo de 90 segundos, pausa em aba oculta e proteção contra concorrência: IMPLEMENTADO e TESTADO LOCALMENTE.
- Consolidação de snapshot móvel de 24 horas às 08:00, 13:00 e 18:00 de Recife: IMPLEMENTADA e TESTADA LOCALMENTE; workflow remoto ainda NÃO VALIDADO.
- IA externa: NÃO IMPLEMENTADA; bloqueada até aprovação da governança e avaliação contra a baseline determinística.

## Gates externos atuais

- GitHub: o histórico local está pronto, mas falta criar um repositório privado vazio e configurar o remoto.
- Supabase: ingestão, replay, heartbeat, processamento e proveniência foram validados no projeto dedicado; autenticação humana/RLS do read model ainda precisa de teste com usuário real.
- Moto G84: a Trilha B começa quando aparelho e chip estiverem disponíveis; isso não bloqueia o Core nem o Radar Web.

## Método

Observar -> formular hipótese -> implementar a menor mudança útil -> executar/testar -> comparar esperado e observado -> decidir -> registrar mudanças materiais.
