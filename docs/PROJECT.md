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
- Supabase/Core: quatro migrations aplicadas, seis Edge Functions ativas, RLS inspecionada e ensaios remotos com proveniência TESTADOS.
- Inteligência determinística v0.1.0: TESTADA contra o ground truth dos oito cenários sintéticos.
- Radar Web sintético: TESTADO localmente e no navegador, publicado em produção no Vercel.
- Radar Web orientado a linguagem humana e progressão resumo -> detalhe -> evidência: IMPLEMENTADO e TESTADO localmente; publicação desta rodada pendente.
- Android `0.3.0-connected`: fonte histórica recuperada do bundle/patch, parser MessagingStyle portado para Kotlin, checks locais e build Android remoto TESTADOS.
- Produção recebeu 396 eventos `android_notification` até 2026-08-31, com adapter `0.3.0-connected` e parser `0.3.0`; isso prova ingestão real, mas não substitui o roteiro físico completo no Moto G84.
- A lógica Android `0.3.0` foi reconciliada na `main`; a equivalência física com o APK já instalado ainda precisa ser validada no Moto G84.
- Refresh global com intervalo de 90 segundos, pausa em aba oculta e proteção contra concorrência: IMPLEMENTADO e TESTADO LOCALMENTE.
- Consolidação de snapshot móvel de 24 horas às 08:00, 13:00 e 18:00 de Recife: IMPLEMENTADA e TESTADA LOCALMENTE; workflow remoto ainda NÃO VALIDADO.
- IA externa: NÃO IMPLEMENTADA; autorizada para trilhas agregadas futuras, condicionada tecnicamente a telemetria, avaliação contra baseline e fallback.

## Gates externos atuais

- GitHub: repositório público ativo em `quentalgabriel-cloud/radar-da-rede`, branch `main` e CI funcionando.
- Supabase: ingestão, heartbeat, processamento, proveniência e políticas RLS foram inspecionados; falta o teste positivo/negativo de Auth/RLS com sessões reais.
- Operação e controles: grupos reais já estão sendo incorporados. Permissões, rastreabilidade e escopo serão controlados no sistema sem funcionar como gate externo de implementação.
- Consolidação agendada: o workflow existe, porém não há credencial ativa em `processing_credentials` nem execução remota comprovada.
- Moto G84: a Trilha B começa quando aparelho e chip estiverem disponíveis; isso não bloqueia o Core nem o Radar Web.

## Método

Observar -> formular hipótese -> implementar a menor mudança útil -> executar/testar -> comparar esperado e observado -> decidir -> registrar mudanças materiais.
