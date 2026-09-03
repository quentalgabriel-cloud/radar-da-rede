# Radar da Rede — Roadmap de conclusão do produto

- Data da revisão: 2026-09-03 (atualizado ao fim da primeira sessão da P1.1)
- Estado de referência: `main` em `86c66fb`
- Princípio: preservar a operação ativa enquanto aumentamos confiabilidade, utilidade e capacidade analítica.

## 1. Direção do produto

O Radar da Rede transforma a atividade de uma rede grande de grupos de WhatsApp em poucos sinais operacionais confiáveis, para que a coordenação entenda o que está acontecendo, onde há perda de atividade ou problema e o que merece atenção.

Permanecem dentro do escopo:

- captura passiva e ingestão de eventos;
- identidade e classificação de grupos;
- métricas, condição, tendência e confiança de captura;
- menções políticas, reação/sentimento e segmentação agregada;
- consultas estruturadas e, depois de avaliadas, consultas em linguagem natural controlada;
- evidência, rastreabilidade, observabilidade e controle de acesso.

Permanecem fora do escopo:

- CRM de participantes;
- perfil individual, persuasibilidade ou intenção de voto;
- inferência sobre pessoas silenciosas;
- disparo automático ou automação de persuasão;
- SQL livre produzido por modelo.

Não existe gate jurídico externo neste roadmap. Privacidade, retenção, acesso, auditoria e segurança são controles internos do próprio sistema e fazem parte da definição de produto pronto.

## 2. Diagnóstico executivo

P0 está tecnicamente implantada e P1 está instalada em modo shadow, mas P1 ainda não está operacionalmente validada. O Control Center deve continuar desligado até os bloqueios abaixo serem resolvidos.

### Estado observado

A coluna “antes” é o diagnóstico que abriu a P1.1. A coluna “depois” é o estado ao fim da primeira sessão da P1.1.

| Evidência | Antes | Depois | Leitura |
|---|---:|---:|---|
| Eventos persistidos | 1.064 | 1.064 | ingestão real existe |
| Batches | 175 | 175 | fluxo do sensor já operou |
| Grupos no registry | 124 | 151 | o resolvedor shadow registrou 27 conversas novas na consolidação |
| Grupos confirmados | 0 | 0 | classificação operacional ainda não começou |
| Aliases ambíguos | 0 | 0 | não há fila ambígua no momento |
| Linhas de métricas P1 | 0 | 30 | primeira janela real produzida |
| Execuções de processamento | 8 | 9 | uma delas é o primeiro slot canônico |
| Redes com Control Center ativo | 0 | 0 | rollout continua protegido |
| Credenciais de processamento ativas | 0 | 1 | consolidação voltou a ser possível |
| Amostras de saúde append-only | inexistentes | 1 | tabela criada e alimentada por heartbeat real |
| Último processamento observado | 2026-09-02 20:16 UTC | 2026-09-03 19:42 UTC | consolidação restaurada |

O workflow `Consolidate Radar` terminava verde quando faltavam secrets e pulava o passo canônico. Esse falso positivo foi eliminado: a configuração é validada em um passo próprio que derruba o job. Falta configurar os secrets e observar uma execução agendada real.

As 30 linhas de métrica cobrem 30 dos 124 grupos monitorados. Essa é a demonstração prática do débito D02 e a razão de a execução passar a persistir um zero explícito por grupo.

### Conclusão de prontidão

| Camada | Situação | Decisão |
|---|---|---|
| Captura/ingestão | funcionando, ainda sem matriz completa de campo | manter operação e executar soak test |
| P0 Group Registry | implantada, classificação pendente | classificar progressivamente por volume/criticidade |
| P1 persistência/UI | implementada e testada localmente | manter em shadow |
| P1 validade analítica | possui lacunas críticas | executar P1.1 antes de ativar |
| P2 inteligência | prompt existente, pré-condição incompleta | não iniciar a implementação completa ainda |

## 3. Definição de produto pronto

O produto somente pode ser tratado como concluído dentro do escopo quando:

1. a captura mantém continuidade conhecida e recupera falhas sem duplicar ou perder dados silenciosamente;
2. as consolidações executam nos horários definidos e falham de forma visível quando não executam;
3. cada métrica está presa a uma execução e janela explícitas, inclusive quando um grupo teve zero eventos;
4. tendências usam janelas comparáveis e confiança baseada em cobertura do período completo;
5. a interface permite priorizar grupos e contextos com linguagem validada pela operação;
6. permissões, retenção, logs e segredos possuem controles testados;
7. deploy, rollback, monitoramento e resposta a incidente têm responsáveis e runbooks;
8. menções e análises políticas são agregadas, avaliadas e rastreáveis;
9. IA, se adotada, possui baseline, teto de custo, fallback e medição de qualidade;
10. não há débito crítico ou alto oculto. Débito médio aceito deve ter responsável, mitigação, gatilho e prazo de revisão.

“Zero dívida” não é uma declaração tecnicamente verificável. A regra correta é: nenhuma dívida relevante fica invisível ou sem decisão explícita.

## 4. Débitos identificados e prioridade

Pontuação: `(impacto + risco) × (6 - esforço)`, em escala de 1 a 5. Ela ordena a execução; não substitui julgamento de produto.

| ID | Débito | Categoria | I | R | E | Pontos | Decisão |
|---|---|---|---:|---:|---:|---:|---|
| D01 | Scheduler pula processamento sem falhar e não há credencial ativa | Operação | 5 | 5 | 2 | 40 | ENDEREÇADO: falha visível implementada e credencial criada; secrets do GitHub PENDENTES |
| D02 | Grupo sem evento na execução atual pode aparecer com sua métrica antiga como atual | Dados | 5 | 5 | 2 | 40 | CORRIGIDO no código; PENDENTE em produção até o deploy |
| D03 | Janelas móveis adjacentes de 24h se sobrepõem e geram comparações enganosas | Produto/Dados | 5 | 4 | 2 | 36 | CORRIGIDO: política `same_slot_previous_day@1`; PENDENTE em produção |
| D04 | Confidence pode usar um snapshot recente como evidência para toda a janela | Dados/Operação | 5 | 4 | 2 | 36 | CORRIGIDO: `capture_coverage@1` sobre amostras append-only; PENDENTE em produção |
| D05 | GET do read model pode processar e escrever no banco | Arquitetura | 5 | 4 | 2 | 36 | CORRIGIDO no código; deploy só depois do scheduler funcionar |
| D06 | Não há SLO/alerta para heartbeat, atraso, janela ausente ou workflow pulado | Observabilidade | 4 | 4 | 2 | 32 | imediato |
| D07 | Matriz de campo do Moto G84 está incompleta | Android/Operação | 4 | 4 | 2 | 32 | antes da ativação ampla |
| D08 | Cálculo live e sintético do Control Center está duplicado | Arquitetura/Testes | 4 | 3 | 2 | 28 | CORRIGIDO: `packages/group-analytics` com verificação de sincronização no CI |
| D09 | Não há E2E real de filtros, dialog, teclado, mobile e sessão | Qualidade/UX | 4 | 3 | 2 | 28 | antes da ativação |
| D10 | Deploy de migrations/functions é manual e sujeito a drift | Release | 4 | 3 | 2 | 28 | hardening |
| D11 | Documentação central contradiz o estado pós-P1 | Estratégia | 4 | 3 | 2 | 28 | CORRIGIDO nesta sessão |
| D12 | “Situações abertas” são contagens da janela, não casos com ciclo de resolução | Produto | 4 | 3 | 2 | 28 | CORRIGIDO na linguagem; decisão sobre ciclo continua com a coordenação |
| D13 | Controles de retenção, exclusão, menor privilégio e incidente não estão fechados | Segurança/Dados | 5 | 4 | 3 | 27 | antes da P2 |
| D14 | Identidade Android ainda deriva do título; renomear pode criar nova identidade | Android/Dados | 4 | 4 | 3 | 24 | investigar em campo |
| D15 | Read model possui limites fixos sem paginação ou metadado de truncamento | Escala | 3 | 3 | 3 | 18 | PARCIAL: metadado de truncamento existe; paginação continua pendente |
| D16 | APK em operação não reporta configuração da captura | Android/Dados | 4 | 3 | 3 | 21 | novo em 2026-09-03: limita a confiança a `moderate` |
| D18 | O APK em operação não foi gerado pelo código Android deste repositório | Android/Release | 5 | 5 | 4 | 20 | **crítico**, descoberto em 2026-09-03 pelo diagnóstico de campo: contadores do heartbeat e exportação de diagnóstico do aparelho não existem no repositório. Bloqueia a matriz de campo e qualquer troca de APK |
| D17 | `capture_health_samples` cresce sem política de retenção | Dados | 2 | 2 | 2 | 16 | novo em 2026-09-03: revisar em 90 dias ou com vários dispositivos |

## 5. Sequência de execução

### AGORA — Onda R0: restaurar a operação observável

**Objetivo:** voltar a produzir janelas reais sem alterar a captura em operação.

Entregas:

- criar/rotacionar uma credencial de processamento e configurar os três secrets do GitHub;
- alterar o workflow para falhar quando a configuração obrigatória estiver ausente;
- registrar no sumário do job: `run_id`, rede, início/fim da janela, status e quantidade processada, sem expor secrets;
- executar manualmente uma consolidação e provar idempotência por replay;
- criar alarmes mínimos para heartbeat atrasado, processamento atrasado, execução pulada/falha e ausência de métricas;
- reconciliar README, PROJECT, TASKS, SUPABASE, UX e TEST_MATRIX com o estado implantado.

Critérios de saída:

- uma execução remota conclui o passo canônico, não apenas o job;
- replay não duplica janela, fatos, alertas nem métricas;
- `processing_runs` e `group_metric_windows` recebem dados reais coerentes;
- falha de credencial produz job vermelho e instrução operacional clara;
- credencial pode ser revogada sem interromper ingestão.

Rollback: revogar a nova credencial, manter a flag do Control Center desligada e continuar capturando eventos.

### AGORA — Onda P1.1: confiabilidade analítica e ativação

**Objetivo:** tornar condição, tendência, inatividade e confidence semanticamente verdadeiras antes de mostrá-las como produto operacional.

Entregas:

1. **Âncora da execução:** selecionar uma única execução atual da rede e sua comparadora. Todos os grupos precisam aparecer nessa âncora; grupos sem eventos recebem zeros da execução atual, nunca uma linha antiga.
2. **Política de comparação:** comparar o mesmo slot do dia anterior ou outra regra não sobreposta aprovada pela operação. Persistir/retornar a política, as duas janelas e o motivo quando a comparação não estiver disponível.
3. **Cobertura de captura:** usar amostras append-only ou intervalos de saúde para medir cobertura e gaps da janela. `high` exige evidência de continuidade; ausência de evidência reduz confidence.
4. **Semântica de situação:** no curto prazo, trocar “situações abertas” por “situações no período”. Só criar `open/resolved/owner/due_at` se a coordenação confirmar necessidade de acompanhamento de caso sem transformar o produto em CRM.
5. **Paridade:** unificar a engine analítica sintética e live em módulo canônico, com sincronização verificável para Edge Functions.
6. **Qualidade:** testes de integração do Supabase e E2E em navegador para filtros, ordenação, dialog, foco, ESC, mobile, reduced motion, autenticação e estados vazios/indisponíveis.
7. **Campo:** executar a matriz do Moto G84 por 24–72h cobrindo reboot, Doze, bateria, rede offline/retorno, silenciado, burst, grupos/comunidades e duplicidade.

Critérios de saída:

- duas janelas reais comparáveis foram produzidas pelo código corrigido;
- grupo inativo aparece com zero na execução atual e sem reaproveitar atividade passada;
- comparação não usa janelas sobrepostas sem indicação explícita;
- confidence corresponde à cobertura observada do período;
- fixtures synthetic/live produzem o mesmo resultado;
- E2E e acessibilidade passam em desktop e smartphone;
- resultado de campo, limitações e hash/versão do APK ficam registrados;
- a coordenação valida vocabulário, prioridades e horizonte.

Rollout:

1. shadow com a flag desligada;
2. comparação manual de agregados;
3. piloto em uma rede;
4. observação de pelo menos um ciclo operacional completo;
5. expansão somente sem alertas críticos.

### PRÓXIMO — Onda P2A: inteligência política determinística

**Objetivo:** responder perguntas políticas agregadas úteis sem depender de modelo probabilístico.

Entregas:

- entidades monitoradas e aliases administráveis com RLS e auditoria;
- matching Unicode/boundaries, exceções e homônimos versionados;
- menções por grupo, contexto, entidade e janela com proveniência;
- spikes somente com volume e confidence mínimos;
- catálogo de consultas estruturadas com parâmetros tipados;
- segmentação apenas de grupos/contextos classificados;
- flags separadas, métricas de qualidade e fallback.

Pré-condições:

- gate P1.1 aprovado;
- classificação cobre a maior parte do volume ativo do escopo piloto, não necessariamente todos os 124 grupos;
- perguntas prioritárias e ações permitidas foram confirmadas com a coordenação.

Critérios de saída:

- avaliação revisável de alias, homônimo, conteúdo oficial compartilhado e baixa captura;
- toda resposta mostra período, escopo, denominador, confiança e proveniência;
- nenhuma consulta retorna indivíduo ou executa SQL livre;
- autorização por rede e papel passa em testes positivos e negativos.

### DEPOIS — Onda P2B: reação/sentimento e linguagem natural

**Objetivo:** adicionar interpretação probabilística apenas onde ela superar a baseline e produzir utilidade operacional mensurável.

Entregas:

- taxonomia pequena: `positive|negative|mixed|neutral|uncertain`;
- dataset versionado e sanitizado com revisão humana;
- comparação entre baseline lexical e candidato de modelo;
- telemetria de modelo, versão, tokens, latência, erro e custo;
- teto de gasto, cache, retry e fallback determinístico;
- linguagem natural restrita à tradução para intents/parâmetros permitidos;
- badge experimental e explicação de incerteza na UI.

Critérios de saída:

- meta de qualidade por classe definida antes da promoção;
- erros críticos (ironia, citação, homônimo e conteúdo oficial) medidos;
- módulo que não superar o critério permanece experimental ou desligado;
- nenhuma saída é convertida em apoio, intenção de voto ou perfil individual;
- desligar IA não afeta captura, métricas ou consultas determinísticas.

### MAIS TARDE — Produto endurecido e escala

Executar quando os dados reais demonstrarem necessidade:

- paginação/cursor e metadado de truncamento no read model;
- cache/ETag e redução de polling após medir latência e payload;
- segundo source adapter, se o Android não atingir a confiabilidade de campo;
- relatórios/exportações operacionais com escopo e auditoria;
- ciclo de acompanhamento de situação, somente se validado como necessidade central;
- automação de deployment Supabase com aprovação, smoke test e rollback.

## 6. Trilhas contínuas

### Operação e classificação

- priorizar os grupos que representam a maior parte da atividade e os contextos críticos;
- revisar aliases ambíguos; não confirmar por nome semelhante sem evidência;
- medir cobertura de classificação por volume de eventos e por grupos ativos;
- registrar owner operacional e cadência de revisão.

### Observabilidade e SLOs

Definir metas mensuráveis para:

- freshness do heartbeat;
- atraso entre slot e processamento concluído;
- taxa de batches/eventos aceitos e rejeitados;
- completude das métricas por execução;
- erro e p95 do read model;
- taxa de tendências indisponíveis por baixa confiança.

Cada SLO precisa de fonte, limiar, alerta, responsável e ação. O valor numérico deve ser calibrado com dados reais da onda P1.1, evitando metas arbitrárias.

### Segurança e dados

- política executável de retenção de texto bruto, fatos, logs e auditoria;
- processo de exclusão e resposta a incidente;
- matriz viewer/operator/owner com testes de RLS e funções `SECURITY DEFINER`;
- rotação de credenciais, proteção de conta e revisão de secrets/logs/fixtures;
- decisão formal sobre manter o repositório público;
- minimização de conteúdo antes de qualquer provedor de IA.

Esses controles são gates internos de engenharia e produto, não aprovações jurídicas externas.

### Release e documentação

- um manifesto por release com commits, migrations, versões das Edge Functions, APK e flags;
- dry-run de migrations e smoke pós-deploy;
- rollback testado por camada;
- APK assinado, versionado e com hash/proveniência;
- documentação de arquitetura e operação atualizada na mesma alteração que muda comportamento.

### Métricas de sucesso do produto

Validar com usuários operacionais:

- tempo para identificar o que merece atenção;
- precisão percebida e factual dos principais sinais;
- falsos positivos e casos críticos perdidos;
- compreensão de condição, tendência, período e confidence;
- proporção de sinal que resulta em uma ação operacional válida;
- estabilidade e disponibilidade durante o ciclo real.

Telemetria de uso não deve capturar conteúdo ou comportamento individual desnecessário.

## 7. Governança da execução

Responsáveis devem ser atribuídos por nome antes de iniciar cada onda, cobrindo os papéis: Produto/Operação, Backend/Dados, Web/UX, Android e Plataforma/Segurança. Uma pessoa pode acumular papéis; nenhum gate pode ficar sem dono.

Regras:

- no máximo uma onda de produto principal em andamento;
- correções críticas da operação interrompem a onda corrente;
- nenhuma fase é concluída apenas porque o código existe;
- diferenciar `IMPLEMENTADO`, `TESTADO LOCALMENTE`, `VALIDADO REMOTAMENTE`, `VALIDADO EM CAMPO` e `PENDENTE`;
- registrar decisão arquitetural para mudança de identidade, janela, confidence, IA ou retenção;
- manter reserva de capacidade para confiabilidade e débito; proposta inicial: 70% roadmap, 20% confiabilidade/débito e 10% descoberta, ajustada à capacidade real.

## 8. Próxima ação recomendada

A primeira sessão da P1.1 está registrada em [`P1.1-EXECUTION-REPORT.md`](P1.1-EXECUTION-REPORT.md).
A onda R0 foi cumprida fora do GitHub e as correções analíticas estão
implementadas e testadas localmente. A ação seguinte é o release coordenado:
secrets do GitHub, execução agendada observada, deploy das três Edge Functions a
partir do repositório e, no dia seguinte, a segunda janela comparável.
Depois disso vêm SLOs, E2E e matriz de campo.

O prompt original permanece a referência da fase:

Executar o prompt [`P1.1-CONFIABILIDADE-E-ATIVACAO.md`](implementation-prompts/P1.1-CONFIABILIDADE-E-ATIVACAO.md). Ele começa restaurando a consolidação, corrige as três lacunas analíticas e só então autoriza a ativação piloto. O prompt P2 atual deve ser revisado após esse gate e dividido em P2A/P2B durante sua execução.

