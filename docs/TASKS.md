# Estado e próximas tarefas

## Em andamento

- [x] M1 — Synthetic Ingest Spine.
- [x] Laboratório sintético navegável com oito cenários em produção.
- [x] M2 — Supabase Ingest Spine em projeto dedicado.

## Fundação

- [x] Definir estrutura inicial do projeto.
- [x] Implementar e testar contratos v0.1.0.
- [x] Criar fixtures `normal-day` e `material-shortage` com ground truth.
- [x] Configurar CI básico.
- [x] Publicar o histórico local no repositório GitHub.
- [ ] Confirmar o CI remoto na `main` e decidir se o repositório público deve permanecer público.

## Core sem aparelho

- [x] Gerar e validar migrations Supabase a partir do schema declarativo.
- [x] Preparar Edge Functions de ingestão autenticada.
- [x] Implementar serviço de ingestão autenticada contra uma interface de repositório.
- [x] Implementar e testar idempotência de batch e evento em memória.
- [x] Persistir heartbeats e rejeitar atualização obsoleta em memória.
- [x] Criar Fake Sensor e teste de replay.
- [x] Provar o fluxo sintético ponta a ponta contra o Core Simulator.
- [x] Executar teste ponta a ponta no Core Simulator.
- [x] Executar teste ponta a ponta no Supabase dedicado.

## Depois

- [x] Inteligência determinística V1 para os cenários iniciais.
- [x] Ampliar a suíte para todos os oito cenários sintéticos planejados.
- [x] Preparar processamento Supabase transacional e idempotente por janela.
- [x] Persistir janelas, facts, signals e alerts no Supabase.
- [x] Radar Web funcional com view model sintético.
- [x] Publicar e verificar primeira versão no Vercel.
- [x] Preparar read model Supabase autenticado e compatível com a UI existente.
- [x] Implementar provider Supabase/Auth no Radar Web sem remover o laboratório.
- [x] Criar usuários autorizados, conceder membership e validar Auth + read model autenticado.
- [x] Traduzir a UI para linguagem humana e separar resumo, detalhe e evidência.
- [x] Criar leituras funcionais por situação, território e grupo com dados existentes.
- [ ] Validar compreensão e prioridade da UI com a coordenação da campanha.
- [ ] Publicar a rodada de Auth e UI no Vercel e verificar em smartphone.
- [x] Android foundations (estrutura e checks estáticos; build físico pendente).
- [ ] Sensor Probe no Moto G84.
- [x] Implementar refresh global com leitura automática leve e proteção contra concorrência.
- [x] Versionar consolidação de janela canônica às 08:00, 13:00 e 18:00 de Recife.
- [ ] Configurar os três secrets do workflow de consolidação e validar uma execução remota.
- [ ] Validar com a operação se o horizonte móvel de 24 horas representa corretamente situações ainda relevantes.

## Ordem de execução

1. Configurar os secrets do workflow e observar uma consolidação remota idempotente.
2. Publicar e verificar o refresh global no modo live em smartphone.
3. Validar com a coordenação a janela de 24 horas e a compreensão da UI.
4. Executar o Sensor Probe e a matriz física quando o Moto G84 estiver disponível.
