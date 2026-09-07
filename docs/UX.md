# Radar da Rede — experiência do produto

## Objetivo desta rodada

Aumentar simultaneamente a coerência do Core e a compreensibilidade do produto. A arquitetura pode ser sofisticada por baixo; a experiência precisa parecer simples por cima.

Uma pessoa sem conhecimento de IA, banco de dados, parser ou arquitetura deve conseguir olhar a primeira tela por dez segundos e dizer:

- o que está acontecendo;
- onde está acontecendo;
- se está crescendo ou merece atenção;
- por que o Radar chegou a essa leitura.

## Regra de tradução

Os nomes internos continuam estáveis nos contratos e no banco. A interface usa nomes de produto.

| Linguagem do sistema | Linguagem da interface |
| --- | --- |
| Event | Atividade observada ou mensagem |
| Analysis Window | Período analisado |
| Fact | Situação identificada ou assunto |
| Signal | Movimento da rede |
| Alert | Atenção necessária ou situação |
| Conversation | Grupo |
| Device Health | Status da captura |

NormalizedEvent, parser_version, source_event_id, event_id, scores, filas e estados de processamento ficam fora da navegação principal. Eles podem aparecer em diagnóstico técnico.

## Hierarquia

1. **Perceber:** o que acontece agora e se a rede está normal.
2. **Entender:** onde, em quantos grupos, desde quando e com que intensidade.
3. **Investigar:** quais mensagens sustentam a leitura.

O fluxo de produto é Resumo -> Detalhe -> Evidência. Mensagens brutas não aparecem antes do resumo, salvo quando a pessoa abre o aprofundamento.

## Navegação atual

Cinco destinos, servidos por dois controles que chamam a mesma função:

- **Radar:** situação geral, atenção, movimentos, territórios e atividade recente.
- **Painel de controle:** leitura comparável dos grupos — janela, cobertura, resumo, recortes e lista por condição.
- **Situações:** detalhe, intensidade, período, explicação e evidências controladas.
- **Grupos:** repositório de identidade e classificação; em laboratório, a lista de atividade por conversa.
- **Captura:** impacto operacional da captura em camadas; versões técnicas ficam recolhidas.

**Sidebar (≥1024px):** persistente, recolhível para trilha de ícones, com estado
vivo (nível da captura e idade da consolidação), badges por seção derivados do
read model, e o resumo da janela analisada. Abaixo de 1024px ela vira gaveta
(botão no topo, ESC e clique fora fecham, `inert` quando fechada) e a tabbar
inferior continua sendo a navegação primária. Só a tabbar declara
`aria-current="page"`: a sidebar marca a seção ativa visualmente, para não
anunciar duas páginas atuais.

O painel de detalhe do grupo é um `<dialog>` único, aberto tanto pelo Painel de
controle quanto por Grupos, com leitura atual, tendências por parâmetro, ritmo,
assuntos, confiança, classificação e evidência.

## Auditoria da interface anterior

| Elemento anterior | Decisão | Resultado |
| --- | --- | --- |
| Home “O que merece atenção” | REFINAR | Virou “Radar hoje”, com resposta direta sobre o estado da rede. |
| Métricas de eventos, facts e signals | SIMPLIFICAR | Viraram grupos, situações, territórios e atividades observadas. |
| Alertas com evidência aberta | REFINAR | A home mostra o resumo; explicação e mensagens ficam no detalhe. |
| Movimentos em barras de volume | REFINAR | Viraram situações narradas, com grupos e territórios. |
| Tela “Explorar” | FUNDIR E DIVIDIR | Situações foram para uma tela própria; grupos receberam timeline. |
| Lista bruta de eventos | REMOVER DA SUPERFÍCIE | Mensagens aparecem apenas dentro do grupo ou como evidência. |
| Saúde com adapter/parser visíveis | SIMPLIFICAR | A coordenação vê impacto; detalhes técnicos ficam recolhidos. |
| Login com referência a Supabase/RLS | SIMPLIFICAR | O texto agora fala apenas em acesso autorizado. |
| Alternância laboratório/dados reais | MANTER E REFINAR | Continua útil para desenvolvimento, com linguagem de demonstração/rede conectada. |

### Cenários de demonstração

Os identificadores usados por fixtures, URLs e testes permanecem técnicos. No seletor e no cabeçalho, cada cenário recebe obrigatoriamente um nome de produto: “Dia normal na rede”, “Falta de material em vários grupos”, “Mudança de horário”, “Aumento de demandas em um território”, “Mesma dúvida em vários grupos”, “Muitas conversas, pouca urgência”, “Movimento muito acima do normal” e “Captura recuperada após interrupção”.

## Mapa UI e dados

| Elemento visível | Fonte preparada | Natureza | Situação atual |
| --- | --- | --- | --- |
| Status da captura | adapter_health | Saúde operacional | Existe; cobertura física ainda não validada. |
| Grupos acompanhados | normalized_events agregados por grupo | Dado observado | Existe. |
| Situações no período | alerts | Decisão determinística do Core | Existe e mantém evidências de origem. São contagens da janela analisada, não casos com ciclo de resolução; a linguagem foi corrigida na P1.1. |
| Principais movimentos | facts | Agregação determinística | Existe; ainda não compara com histórico anterior. |
| Territórios em destaque | facts + eventos relacionados | Derivação para produto | Existe quando o evento informa território. |
| Explicação | contagem de grupos, atividades e territórios dos alertas | Derivação auditável | Existe sem expor score técnico. |
| Mensagens relacionadas | eventos referenciados por source_event_ids | Evidência observada | Existe com limite inicial de quatro trechos. |
| Timeline do grupo | eventos do grupo | Evidência observada | Existe no período carregado. |

## Limites honestos

- “Crescendo” só deve aparecer quando houver período anterior comparável. Nesta versão, a UI usa “presença forte”, “em movimento” ou “atividade observada”.
- Território ausente deve aparecer como informação não disponível, nunca ser inferido sem evidência.
- Dados sintéticos são identificados como demonstração.
- Cobertura real do WhatsApp permanece não validada até o teste físico.
- Sugestões futuras devem apoiar a decisão humana, sem se apresentar como comando automático.

## Critérios permanentes

- mobile first, leitura com uma mão e poucos elementos por viewport;
- poucos filtros úteis;
- cor de marca e cor de severidade são sistemas independentes; ambas podem ser vermelhas, mas nunca dependem apenas da cor para comunicar função;
- gráficos somente quando responderem uma pergunta;
- estados vazios e de incerteza explícitos;
- componentes visuais pequenos e consistentes;
- toda informação prioritária deve ajudar a entender o próximo movimento humano.

## Tema da campanha

A identidade inicial da campanha é aplicada como uma camada pequena sobre o design system, sem acoplar contratos, dados ou lógica de produto.

- `styles.css` contém os tokens estruturais e os estados operacionais.
- `campaign-theme.css` altera somente os tokens de identidade.
- vermelho de marca identifica interação, seleção e pertencimento.
- verde, âmbar e vermelho operacional continuam identificando normalidade, acompanhamento e urgência com apoio de texto, borda e forma.
- amarelo aparece apenas como acento na estrela do lockup.
- a estrela é uma assinatura do cabeçalho e não substitui ícones funcionais.

## Janela e comparação no Control Center (P1.1)

Um número sem o seu período não é sinal operacional. O Control Center passa a
mostrar, acima da lista de grupos:

- a janela atual, com início e fim;
- a janela comparadora, ou o motivo textual de ela não existir;
- a política de comparação em vigor (`same_slot_previous_day@1`);
- quantos grupos monitorados ficaram sem atividade na execução atual.

Regras de leitura mantidas:

- crescimento não é lido como resultado positivo;
- cor nunca é o único significado; condição, tendência e confiança aparecem como
  texto;
- um grupo sem atividade mostra zero com aviso de que o zero pertence à execução
  atual e não reaproveita medição anterior;
- confiança de captura aparece em português (alta, moderada, baixa,
  indisponível) e explica que mede cobertura observada do período;
- quando a tendência é indisponível, o motivo aparece junto, em vez de um traço.

## Cobertura da captura na tela (2026-09-07)

O objeto `capture_coverage@2` existia no read model desde a P1.1 e não aparecia
em lugar nenhum. Ele agora é o segundo bloco da âncora, com estas regras:

- **nível e motivo são o texto principal; a percentagem é apoio.** Com 60% de
  cobertura e interrupções na janela o motor devolve `low`; uma barra pela metade
  lida como "quase suficiente" contradiria o veredito;
- **cobertura ausente é dita como ausente, nunca como zero.** Quando a execução
  não registrou cobertura (rollback de RPC, falha ao ler saúde, cenário
  sintético), a barra não recebe valor e o texto diz que isso é diferente de
  cobertura zero;
- **a consequência é declarada:** "com esta cobertura, a tendência fica
  indisponível" ou "a cobertura sustenta a comparação";
- o teto (`ceiling`/`ceiling_reason`) só aparece quando o motor o emite.

Os avisos de zero da execução e de confiança saíram de cada cartão para a
âncora, onde aparecem uma vez. No cartão fica o rótulo curto "Sem atividade nesta
execução" — a afirmação continua presa à janela atual.

O histórico por janela obedece à mesma política da comparação: a série só liga
execuções do mesmo tipo e duração equivalente. Uma linha entre um refresh manual
e um slot agendado seria lida como tendência entre janelas que o próprio motor
recusa comparar.
