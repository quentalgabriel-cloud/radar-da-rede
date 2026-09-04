# Identidade de grupo — por que o Control Center não foi ligado

> **Atualização de 2026-09-04.** A causa raiz foi provada depois deste
> levantamento e é diferente do que a seção "Causa raiz" abaixo supôs. O sensor
> **já deriva a identidade do título**; o que a quebra é o sufixo de contagem
> do WhatsApp entrar no hash. O plano de correção está em
> `docs/GROUP-IDENTITY-PLAN.md`. As medições deste documento continuam válidas.

Descoberto em 2026-09-04, durante a verificação pré-ativação. Este documento
existe porque a ativação foi **deliberadamente adiada**, e a razão precisa estar
registrada onde o próximo agente ou operador a encontre.

## O que está errado

O `source_conversation_id` que chega do sensor é `wa_<hash de 32 hex>` e **muda a
cada notificação**. O resolvedor de grupos usa a chave
`[source, source_conversation_id, normalized_label]`, então cada notificação de
um mesmo grupo cria um grupo novo no registry.

Medição no banco de produção:

| Evidência | Valor |
|---|---:|
| grupos ativos no registry | 196 |
| rótulos distintos entre eles | **8** |
| maior duplicação de um mesmo rótulo | **95 grupos** |
| conversas reais já capturadas, canonicalizadas | **7** |
| eventos da conversa principal | 1.366 |
| ids brutos gerados para essa única conversa | **199** |

Inflação de cerca de 199 vezes na conversa que concentra a operação.

## Por que isso impede ligar o Control Center

A tela mostraria cerca de 196 linhas de grupo para o que é, na prática, **uma
conversa real ativa**. Cada linha com sua condição, sua atividade e sua
tendência. Não é uma tela incompleta: é uma tela que afirma algo falso sobre a
rede.

Ligar assim seria exatamente o que o contrato do projeto proíbe — apresentar
inferência forte sem que a evidência a sustente — e destruiria a confiança da
equipe na primeira olhada.

## O que **não** está errado

A vista atual em produção, a v0.1, **está correta**. O read model aplica
`canonicalizeConversationEvent` antes de montar as conversas, então a tela que a
equipe usa hoje agrupa por rótulo canônico e mostra as conversas reais. A
duplicação afeta o registry de grupos, que alimenta o Control Center, não a
vista em uso.

Também não é defeito das correções da P1.1. A âncora de execução, os zeros
explícitos e a cobertura funcionam como projetado: a execução persiste uma linha
por grupo ativo, e persistiu 196 de 196. O mecanismo está certo; o conjunto de
grupos sobre o qual ele opera é que está inflado.

## Causa raiz

O sensor não emite identidade estável de conversa. O identificador vem de algo
volátil por notificação, provavelmente a chave da notificação do Android, que o
WhatsApp rotaciona.

Isso é o débito D14 se manifestando em escala. O `AGENTS.md` já advertia: *nunca
use título de conversa como identidade estável sem reconhecer a limitação*. O que
o dado mostra agora é que a alternativa em uso é pior que o título — não é
identidade nenhuma.

## Caminhos, do mais correto ao mais rápido

1. **Corrigir no sensor.** Emitir um identificador estável por conversa. É a
   correção real, e fica no repositório `quentalgabriel-cloud/radar-sensor-probe`,
   não neste. Exige investigar o que o Android oferece de estável além do título.
2. **Canonicalizar antes de resolver o grupo.** O read model já canonicaliza para
   exibir; o caminho de resolução não. Passar os eventos por
   `canonicalizeConversationEvent` antes de `resolveGroupObservationsShadow`
   colapsaria os 199 em um. É mitigação, não correção: volta a depender do
   título, com a limitação que o contrato manda reconhecer explicitamente.
3. **Não fazer nada e não ligar o Control Center.** É o estado atual, e é
   seguro: a operação continua com a vista v0.1, que está correta.

A opção 2 é aditiva e reversível, mas muda identidade de grupo em operação e
mereceria migration de consolidação dos grupos existentes. Não deve ser feita às
pressas.

## Observação separada, também relevante

Das sete conversas já capturadas, quatro são grupos de teste da instalação. A
operação real está concentrada em **uma** conversa. Isso pode significar que o
sensor só está enxergando um grupo, ou que só um está ativo. Vale confirmar com
a coordenação antes de tirar conclusão sobre cobertura da rede.

## Estado da decisão

`group_control_center_enabled` permanece `false`. Ligar depende de resolver a
identidade, não dos gates analíticos, que estão fechados.
