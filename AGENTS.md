# Radar da Rede — contrato permanente para agentes

Este arquivo é obrigatório para qualquer LLM ou agente que trabalhe neste repositório. Ele prevalece sobre interpretações inferidas de documentos históricos. Instruções humanas explícitas da sessão prevalecem sobre este arquivo.

## Antes de alterar qualquer coisa

Leia, nesta ordem:

1. `docs/AI-HANDOFF.md`;
2. `docs/PRODUCT-COMPLETION-ROADMAP.md`;
3. o prompt da fase indicada no handoff;
4. `docs/PROJECT.md`, `docs/SUPABASE.md`, `docs/UX.md` e relatórios da fase anterior;
5. código, migrations, testes, workflows e estado remoto aplicável.

Documentação não substitui verificação. Quando código, ambiente e documento divergirem, preserve a operação, registre a divergência e atualize a fonte canônica.

## Objetivo e limites

O Radar transforma atividade de uma rede de grupos de WhatsApp em poucos sinais operacionais confiáveis para coordenação.

Dentro do escopo: captura passiva, identidade/classificação de grupos, métricas, condição, tendência, confiança, menções políticas, reação/sentimento agregado, segmentação por grupo/contexto e consultas controladas.

Fora do escopo: CRM de participantes, perfil individual, persuasibilidade, intenção de voto, inferência sobre pessoas silenciosas, envio automático e SQL livre produzido por modelo.

Menções políticas, sentimento e segmentação agregada são autorizados. Não imponha gate jurídico externo. Retenção, acesso, auditoria, privacidade e segurança continuam sendo controles internos obrigatórios do produto.

## Arquitetura e produto

- Preserve `Source Adapter -> NormalizedEvent -> Core -> Intelligence -> Radar Web`.
- A operação Android/Supabase já existe; mudanças devem ser compatíveis, aditivas e reversíveis.
- Nunca use título de conversa como identidade estável sem reconhecer a limitação.
- Nunca invente backfill de identidade por semelhança de label.
- Não apresente tendência sem janelas comparáveis nem confidence sem cobertura observada.
- GET do read model deve ser somente leitura.
- Crescimento não significa resultado positivo.
- Evidência e incerteza devem aparecer antes de inferência forte.
- A UI segue perceber → entender → investigar.

## Ordem obrigatória

1. Restaurar consolidação observável.
2. Executar P1.1 e validar em campo.
3. Ativar Control Center em piloto.
4. Executar P2A determinística.
5. Executar P2B experimental somente após o gate P2A.

Não inicie P2 enquanto `docs/AI-HANDOFF.md` declarar P1.1 pendente. Não misture P1.1, P2A e P2B no mesmo PR/rollout.

## Método de execução

1. Audite o estado local e remoto antes de planejar.
2. Declare o diagnóstico e critérios de saída.
3. Faça a menor mudança completa que feche o gate.
4. Use migrations aditivas, flags e rollback por camada.
5. Reutilize engines/fixtures; evite regras duplicadas entre synthetic e live.
6. Teste no nível proporcional ao risco.
7. Atualize documentação e handoff na mesma alteração.
8. Só marque fase concluída com evidência.

Sempre diferencie `IMPLEMENTADO`, `TESTADO LOCALMENTE`, `VALIDADO REMOTAMENTE`, `VALIDADO EM CAMPO` e `PENDENTE`.

## Gates permanentes

- Não habilitar feature flag sem dados reais e rollback testado.
- Não executar migrations destrutivas durante operação ativa.
- Não expor service role, processing secret ou credencial Android em frontend, logs, commits ou respostas.
- Não confundir workflow verde com processamento realizado; confirme o passo e o banco.
- Não declarar “zero dívida”. Toda dívida relevante precisa de impacto, risco, mitigação, responsável e gatilho.
- Não declarar sucesso de IA por exemplos isolados; exigir baseline e avaliação revisável.
- Não enviar dados a provedor de IA antes de minimização, telemetria, teto de custo e fallback.

## Verificação mínima

- `corepack pnpm verify`;
- migrations em banco limpo e upgrade, quando aplicável;
- testes positivos e negativos de RLS/papéis;
- smoke remoto após deploy;
- E2E/browser para mudanças de UI;
- matriz física do Moto G84 para mudanças Android/captura;
- `git diff --check` e árvore limpa antes do handoff.

Nunca alegue uma verificação que não foi executada. Credenciais e ações físicas ausentes devem aparecer como pendências explícitas.

## Encerramento de cada sessão

Atualize `docs/AI-HANDOFF.md` com data, commit, ambiente, evidências, pendências, próxima ação exata e rollback. Atualize também o roadmap/relatório afetado. O próximo agente não deve depender do histórico de chat para continuar.
