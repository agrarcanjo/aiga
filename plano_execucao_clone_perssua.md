# Plano de Execucao - Clone Perssua (MVP Incremental)

## Status de execucao (atual)
- Objetivo do projeto: claro e viavel para abordagem MVP incremental.
- Escopo macro: definido (Fases 0 a 5 + Epics A a F + T7 Beta).
- Proximo passo de execucao: executar T7.2 rollout beta em campo (canary -> ramp -> full) usando scripts e artefatos operacionais criados no repositorio.
- Estado da primeira tarefa: concluida (estrutura inicial criada no workspace).
- Validacao de runtime: concluida (Vite em http://localhost:5173 e boot Electron sem erro fatal).
- Estado da tarefa T1.3 (A2): concluida com contratos IPC tipados e handlers com validacao de payload.
- Estado da tarefa T1.4 (A3): concluida com persistencia local de configuracoes e API key protegida no main process.
- Estado da tarefa T1.5 (A4): concluida com logs rotativos, niveis de log e painel de diagnostico no renderer.
- Estado da tarefa T1.6 (A5): concluida com feature flags persistidas, override por ambiente e painel de controle no renderer.
- Estado da tarefa T2.1 (B1): concluida com captura global, persistencia temporaria e fila de screenshots em tempo real.
- Estado da tarefa T2.2 (B2): concluida com composer ASK, selecao de screenshots e envio por botao/Ctrl+Enter.
- Estado da tarefa T2.3 (B3): concluida com provider Gemini no main process e streaming de eventos para o renderer.
- Estado da tarefa T2.4 (B4): concluida com timeline incremental separando mensagens de usuario e assistente.
- Estado da tarefa T2.5 (B5 parcial): concluida com erros acionaveis, codigos de falha e retry guiado no renderer.
- Estado da tarefa T2.6 (B5 restante): concluida com presets de prompt e guardrails de output no main process.
- Estado da tarefa T3.1 (C1): concluida com input device manager de audio e fluxo priorizado para Windows.
- Estado da tarefa T3.2 (C2): concluida com gravacao manual (Ctrl+D), modo automatico 10-20s e envio de chunks para transcricao.
- Estado da tarefa T3.3 (C3): concluida com VAD simples (RMS threshold) e decisao por janela deslizante para descartar silencio dominante.
- Estado da tarefa T3.4 (C4): concluida com STT adapter no main process (roteamento cloud/local/hybrid) e handler IPC de transcricao desacoplado de provider.
- Estado da tarefa T3.5 (C5): concluida com dedupe por overlap entre chunks e transcricao consolidada incremental no renderer.
- Estado da tarefa T4.1 (D1): concluida com StealthWindowService no main process e aplicacao de profile off/safe/strict via IPC usando stealthHardening efetivo.
- Estado da tarefa T4.2 (D2): concluida com hotkey global de stealth (Ctrl+B configuravel), toggle real de invisibilidade e sincronizacao de estado entre main e renderer.
- Estado da tarefa T4.3 (D3): concluida com supressao de previews, timeline detalhada, transcricoes, logs e snapshots sensiveis no renderer durante stealth, alem de limpeza de flash/progress no main process.
- Estado da tarefa T4.4 (D4): concluida com matriz operacional de validacao manual para Zoom, Google Meet e Microsoft Teams dentro da UI, com registro de status e observacoes por cenario.
- Estado da tarefa T4.5 (D5): concluida com checklist self-check pre-apresentacao no app e orientacoes operacionais documentadas no README.
- Estado da atividade adicional de escopo T4.6 (Stealth evidence): concluida com documento operacional separado para registro de evidencia manual da validacao stealth por plataforma e modo de compartilhamento.
- Estado da tarefa T5.1 (E1): concluida com LocalProvider inicial e ProviderRouter no main process para roteamento cloud/local/hybrid do fluxo ASK.
- Estado da tarefa T5.2 (E2): concluida com llama-server manager no main process (resolve binario, start/stop, status local e integracao com LocalProvider).
- Estado da tarefa T5.3 (E3): concluida com whisper-cli manager no main process (resolve binario/modelo, execucao por chunk e integracao com STT adapter local com fallback seguro).
- Estado da tarefa T5.4 (E4): concluida com ModelManager no main process para download, resolucao e validacao de modelos (checksum SHA-256) integrando runtime de llama-server e whisper-cli.
- Estado da tarefa T5.5 (E5): concluida com auto-tune de parametros do llama-server (perfis progressivos) e fallback automatico em falha/OOM para configuracoes mais conservadoras.
- Estado da tarefa T5.6 (E6): concluida com modo privacidade local-only reforcado ponta a ponta (chat/STT sem cloud fallback, bloqueio de download por rede no ModelManager e normalizacao de flags para local).
- Estado da tarefa T6.1 (F1): concluida com testes unitarios automatizados para ProviderRouter, resolveFeatureFlags e guardrails de prompt (suite local passando).
- Estado da tarefa T6.2 (F2): concluida com suite E2E de contratos IPC cobrindo fluxos criticos de screenshot, audio, stealth e chat stream (suite local passando).
- Estado da tarefa T6.3 (F3): concluida com electron-builder configurado para NSIS installer Windows x64, sign-check pre-build com suporte a certificado via env vars (WIN_CSC_LINK / WIN_CSC_KEY_PASSWORD), scripts pack:win e dist:win, estrutura build/ e resources/ documentadas.
- Estado da tarefa T6.4 (F4): concluida com AutoUpdateService no main process, painel de controle no renderer, feed HTTPS configuravel, download/install controlados, health confirmation pos-update e rollback por downgrade para canal anterior.
- Estado da tarefa T6.5 (F5): concluida com playbook operacional, fluxo de release/rollout, triage inicial, matriz de troubleshooting e orientacoes de escalonamento consolidadas no README.
- Estado da tarefa T7.1 (Beta Rollout): concluida com plano de beta fechado (12 pilotos), formularios de feedback estruturados, procedimentos de release/deployment, monitoramento de saude, criterios de rollback e arcaboucao de transicao para beta aberto em docs/beta-rollout-plan.md, docs/beta-feedback-templates.md, docs/beta-release-procedures.md.
- Estado da tarefa T7.2 (Beta Execution): em andamento com kit operacional executavel (scripts/beta/run-beta-gates.ps1, scripts/beta/start-triage-day.ps1, scripts/beta/publish-checklist.ps1), rastreamento vivo (beta/pilot-roster.csv, beta/weekly-feedback-summary.csv), triage diario inicializado (beta/triage/2026-04-12.md) e gates de engenharia validados (typecheck/build/test/test:e2e); bloqueio atual apenas em assinatura de release por ausencia de WIN_CSC_LINK e WIN_CSC_KEY_PASSWORD.

## 1) Objetivo do produto
Construir um assistente desktop em tempo real, com foco em:
1. Analise de screenshots com resposta imediata (prioridade 1).
2. Captura e processamento de audio para responder duvidas (prioridade 2).
3. Modo stealth/furtivo para minimizar exposicao da interface em compartilhamento de tela (prioridade critica de UX).
4. Estrategia hibrida de IA: Gemini primeiro (cloud), depois modelos locais (offline/hibrido).

## 2) Tecnologia recomendada (decisao)
### Stack principal
- Desktop shell: Electron + TypeScript.
- UI: React + Vite + Zustand (estado) + React Query (fluxos assincronos).
- Main process: Node.js no Electron para atalhos globais, captura de tela, controle de janelas e IPC.
- Persistencia local: SQLite (better-sqlite3) para configuracoes e historico opcional.
- Streaming de respostas: SSE/WebSocket interno entre main e renderer.

### IA cloud (fase inicial)
- Gemini API (modelo multimodal) para:
  - entendimento de imagem (screenshot + prompt ASK)
  - resposta textual em streaming
  - opcional: resumo de transcricao

### IA local (fase evolutiva)
- LLM local: llama.cpp (llama-server) com modelos GGUF (texto e visao com mmproj).
- STT local: whisper.cpp (CLI) com modelo GGML.
- Abstracao de provider: interface unica para cloud/local, sem acoplar UI ao backend de inferencia.

### Por que essa stack
- Electron oferece melhor controle para app desktop com atalhos globais, overlay, captura e integracao OS.
- O deep-dive tecnico referencia uma arquitetura semelhante com IPC + binarios nativos para IA local.
- Facilita roadmap cloud-first e local-second sem reescrever UI.

## 3) Arquitetura recomendada
## 3.1 Modulos
- Renderer (UI): chat, configuracoes, preview de screenshot, estado de sessao.
- Main Process (Orquestrador):
  - ScreenCaptureService
  - AudioCaptureService
  - StealthWindowService
  - ShortcutService
  - SessionOrchestrator
  - ProviderRouter (GeminiProvider, LocalProvider)
- Native Runtime:
  - whisper-cli (transcricao)
  - llama-server (inferencia local)

## 3.2 Fluxo principal (Screenshot)
1. Usuario aciona atalho global para capturar tela.
2. Main process captura imagem e salva buffer temporario.
3. Renderer exibe fila de capturas + campo ASK.
4. SessionOrchestrator envia prompt multimodal para ProviderRouter.
5. ProviderRouter encaminha para Gemini (MVP inicial).
6. Resposta chega em streaming e e exibida no painel (ou em modo stealth, sem painel visivel).

## 3.3 Fluxo principal (Audio)
1. Usuario aciona captura manual ou auto-transcricao.
2. AudioCaptureService faz chunking e buffering.
3. STT (cloud ou local) gera texto parcial/final.
4. SessionOrchestrator agrega contexto e pergunta ao provider de LLM.
5. UI recebe sugestoes em tempo real.

## 3.4 Principios de projeto
- Provider agnostico: UI nao conhece Gemini/Local.
- Seguranca por default: dados locais, retenção opt-in.
- Falha degradada: se local falhar, fallback cloud (quando permitido).
- Latencia previsivel: streaming e timeout em cada etapa.

## 4) Escopo incremental (MVP por fases)
## Fase 0 - Fundacao tecnica (1 semana)
Objetivo: preparar infraestrutura para evolucao sem retrabalho.

Tarefas:
1. Inicializar monorepo app desktop com Electron + React + TypeScript.
2. Definir contratos IPC (tipados) para screenshot, audio, chat e stealth.
3. Criar modulo de configuracoes (API key Gemini, idioma, atalhos).
4. Criar observabilidade local (logs rotativos + nivel de log).
5. Implementar camada de feature flags (cloud/local, stealth hardening).

Criterios de aceite:
1. App abre com shell funcional e hot reload.
2. IPC tipado e testado com testes de contrato.
3. Configuracoes persistem entre reinicios.

## Fase 1 - MVP Screenshot + Gemini (2 semanas)
Objetivo: entregar primeira funcionalidade de valor real.

Tarefas:
1. Implementar captura de tela por atalho global (Ctrl+E) com fila de imagens.
2. Implementar campo ASK e acao de analise (Ctrl+Enter).
3. Integrar Gemini multimodal com streaming.
4. Construir chat timeline com resposta incremental.
5. Adicionar tratamento de erros (rede, limite API, timeout, imagem invalida).
6. Criar presets de prompt para analise de UI, erros e resumo.

Criterios de aceite:
1. Usuario consegue capturar e enviar screenshot + ASK com resposta em menos de 6s (rede normal).
2. Fluxo completo funciona sem abrir devtools.
3. Falhas mostram mensagens acionaveis ao usuario.

## Fase 2 - Audio assistido (Whisper cloud/local gateway) (2 semanas)
Objetivo: segunda funcionalidade mais importante.

Tarefas:
1. Implementar captura de microfone com modo manual (atalho Ctrl+D).
2. Implementar modo automatico por intervalo configuravel (10-20s inicial).
3. Criar pipeline de chunking + VAD simples (RMS threshold inicial).
4. Integrar transcricao (primeiro cloud API, depois abstrair para local).
5. Enviar transcricao para Gemini com contexto da sessao ativa.
6. Implementar deduplicacao de trecho com overlap.
7. Implementar indicadores de estado (gravando, transcrevendo, erro).

Criterios de aceite:
1. Transcricao com latencia de primeiro token menor que 3s (modo manual, audio curto).
2. Auto mode estavel por 20 minutos sem memory leak perceptivel.
3. Duplicacoes de frase reduzidas por algoritmo de overlap.

## Fase 3 - Stealth mode (hardening UX) (2 semanas)
Objetivo: operacao discreta em compartilhamento de tela.

Tarefas:
1. Implementar toggle de stealth (Ctrl+B) com ocultacao de janela principal.
2. Criar janela utilitaria minima (opcional) em modo click-through ou invisivel.
3. Suprimir notificacoes visuais e sonoras no stealth.
4. Validar comportamento em Zoom, Meet e Teams (janela, tela inteira, monitor secundario).
5. Implementar politica de fallback: se ambiente nao suportar invisibilidade total, aplicar modo minimo seguro.
6. Criar checklist de verificacao pre-apresentacao (self-check).
7. Registrar evidencia operacional de validacao stealth por plataforma e modo de compartilhamento.

Criterios de aceite:
1. Em cenarios de teste, interface principal nao aparece no compartilhamento configurado.
2. Atalhos continuam funcionais em stealth.
3. Usuario recebe aviso claro sobre limitacoes por plataforma.

Observacao importante:
- O nivel de invisibilidade depende de API do sistema operacional e modo de compartilhamento escolhido pelo usuario. O produto deve explicitar limites tecnicos e evitar prometer 100% de indetectabilidade em todos os cenarios.

## Fase 4 - Local-first IA (3 semanas)
Objetivo: rodar sem dependencia obrigatoria da nuvem.

Tarefas:
1. Implementar LocalProvider (OpenAI-like local endpoint).
2. Empacotar binarios por plataforma (llama-server, whisper-cli).
3. Implementar ModelManager (download, checksum, path, versao).
4. Implementar lifecycle do llama-server (spawn, healthcheck, idle timeout 10 min).
5. Implementar auto-tuning de parametros (ctx, batch, gpu layers).
6. Implementar fallback automatico CPU quando GPU falhar.
7. Integrar visao local (modelo multimodal + mmproj) para screenshots.
8. Implementar configuracao de privacidade: forcar local-only.

Criterios de aceite:
1. Usuario executa fluxo screenshot + resposta sem API key.
2. Timeout, OOM e retry tratados sem travar UI.
3. Configuracao validada para hardware fraco (fallback progressivo).

## Fase 5 - Confiabilidade e distribuicao (2 semanas)
Objetivo: tornar produto instalavel e confiavel.

Tarefas:
1. Telemetria local opcional (erros anonimizados).
2. Testes E2E dos fluxos criticos (screenshot, audio, stealth, provider switch).
3. Assinatura de binarios e instalador Windows.
4. Atualizacao automatica com rollback.
5. Documentacao operacional e troubleshooting.

Criterios de aceite:
1. Taxa de sucesso de fluxo critico maior que 95% em suite E2E.
2. Instalador e auto-update funcionando em ambiente limpo.

## 5) Backlog detalhado para execucao no Vibe Code
## Epic A - Fundacao
- A1: Bootstrap Electron + React + TS + Vite.
- A2: Criar camada IPC tipada com zod.
- A3: Modulo Settings (API key, idioma, atalhos).
- A4: Sistema de logs e diagnostico.
- A5: Feature flags e env management.

## Epic B - Screenshot Intelligence
- B1: Captura global e fila de screenshots.
- B2: UX de ASK e envio.
- B3: Gemini multimodal client com streaming.
- B4: Renderizacao incremental de resposta.
- B5: Prompt templates e guardrails de output.

## Epic C - Audio Intelligence
- C1: Input device manager.
- C2: Gravacao manual + auto.
- C3: VAD simples + janela deslizante.
- C4: STT adapter (cloud/local).
- C5: Dedupe de transcricao e consolidacao.

## Epic D - Stealth
- D1: Window profile stealth.
- D2: Toggle invisibilidade e hotkeys.
- D3: Supressao de overlays/notificacoes.
- D4: Test matrix Zoom/Meet/Teams.
- D5: Wizard de validacao pre-call.

## Epic E - Local Runtime
- E1: LocalProvider interface.
- E2: Spawn manager de llama-server.
- E3: Spawn manager de whisper-cli.
- E4: Download e validacao de modelos.
- E5: Auto-tune + OOM fallback.

## Epic F - Qualidade e release
- F1: Testes unitarios de servicos criticos.
- F2: Testes E2E de fluxos completos.
- F3: Packaging e assinatura.
- F4: Auto-update seguro.
- F5: Playbook de incidentes e suporte.

## 6) Arquitetura de pastas sugerida
- /apps/desktop
- /packages/core-domain
- /packages/provider-gemini
- /packages/provider-local
- /packages/native-runtime
- /packages/shared-types
- /packages/e2e-tests
- /docs/adr

## 7) ADRs obrigatorios (decisoes de arquitetura)
Criar estes ADRs antes do desenvolvimento principal:
1. ADR-001: Electron vs Tauri (decisao final + trade-offs).
2. ADR-002: Provider abstraction (cloud/local).
3. ADR-003: Politica de privacidade e armazenamento local.
4. ADR-004: Stealth mode limits por plataforma.
5. ADR-005: Estrategia de modelos locais e fallback.

## 8) NFRs (requisitos nao funcionais)
- Performance: resposta inicial em screenshot em ate 6s (cloud) e ate 10s (local, hardware medio).
- Estabilidade: uptime de sessao > 99% por 1h de uso continuo.
- Memoria: nao ultrapassar limite definido por perfil de hardware sem fallback.
- Seguranca: API keys criptografadas localmente.
- Privacidade: historico opt-in, com opcao de purge total.

## 9) Riscos e mitigacoes
1. Risco: stealth inconsistente por plataforma/app de call.
   Mitigacao: matriz de compatibilidade + self-check guiado + fallback de modo seguro.
2. Risco: latencia alta no audio em hardware fraco.
   Mitigacao: intervalos maiores, VAD, modelos menores e auto-tuning.
3. Risco: OOM no runtime local.
   Mitigacao: degrade progressivo (GPU off, contexto menor, batch menor).
4. Risco: custo cloud elevado.
   Mitigacao: cache local de contexto, throttling e migracao para local-first.

## 10) Plano de validacao por marcos
- Marco M1 (fim Fase 1): Demo screenshot + ASK + resposta Gemini streaming.
- Marco M2 (fim Fase 2): Demo audio manual/auto + resposta contextual.
- Marco M3 (fim Fase 3): Demo stealth validado em 2 plataformas de reuniao.
- Marco M4 (fim Fase 4): Demo local-first sem API key.
- Marco M5 (fim Fase 5): Instalador + E2E + readiness de beta fechado.

## 11) Ordem de execucao recomendada para Vibe Code
1. Implementar Epic A completa.
2. Implementar Epic B e entregar M1.
3. Implementar Epic C e entregar M2.
4. Implementar Epic D e entregar M3.
5. Implementar Epic E e entregar M4.
6. Implementar Epic F e entregar M5.

## 12) Definicao de pronto (DoD) por tarefa
Uma tarefa so fecha quando:
1. Codigo implementado e revisado.
2. Testes minimos criados e passando.
3. Logs de diagnostico adicionados.
4. Documentacao curta atualizada (como usar, limitacoes).
5. Sem regressao nos fluxos criticos.

## 13) Primeiro recorte pratico (primeiras 2 semanas)
Sprint 1:
1. A1, A2, A3
2. B1 (captura) e B2 (ASK)
3. Demo interna de captura em lote

Sprint 2:
1. B3, B4, B5
2. Tratamento de erros e retries basicos
3. Demo M1 com Gemini multimodal

## 14) Atividades detalhadas para atingir o objetivo do projeto
Esta secao transforma o plano estrategico em atividades operacionais, com ordem de dependencia.

### Trilha T0 - Preparacao e alinhamento (antes de codigo)
1. T0.1 Confirmar objetivos de sucesso do MVP (latencia, estabilidade, UX stealth).
2. T0.2 Definir plataforma inicial obrigatoria (Windows primeiro) e matriz de suportes.
3. T0.3 Definir politica de dados locais (retencao, purge, opt-in).
4. T0.4 Aprovar stack final e congelar versoes iniciais de toolchain.
5. T0.5 Abrir ADR-001 a ADR-005 com decisao inicial e owners.

### Trilha T1 - Fundacao tecnica (Epic A)
1. T1.1 Bootstrap monorepo Electron + React + TypeScript + Vite.
2. T1.2 Configurar estrutura de pacotes e aliases compartilhados.
3. T1.3 Implementar IPC tipado com validacao de payload.
4. T1.4 Implementar modulo Settings com persistencia local.
5. T1.5 Implementar logs locais rotativos e niveis de log.
6. T1.6 Implementar feature flags para cloud/local e stealth.

### Trilha T2 - Screenshot intelligence (Epic B)
1. T2.1 Captura global por atalho e fila de screenshots.
2. T2.2 UX de ASK e envio multimodal.
3. T2.3 Integracao Gemini multimodal com streaming.
4. T2.4 Renderizacao incremental de respostas no chat.
5. T2.5 Tratamento de erros e mensagens acionaveis.
6. T2.6 Presets de prompt por caso de uso.

### Trilha T3 - Audio intelligence (Epic C)
1. T3.1 Captura de microfone manual e automatica.
2. T3.2 Pipeline de chunking + VAD simples.
3. T3.3 Integracao STT cloud com contrato para STT local.
4. T3.4 Consolidacao de transcricao e deduplicacao por overlap.
5. T3.5 Envio de contexto transcrito para provedor LLM ativo.
6. T3.6 Indicadores de estado de gravacao/transcricao/erro.

### Trilha T4 - Stealth UX hardening (Epic D)
1. T4.1 Implementar perfil de janela stealth com toggle global.
2. T4.2 Suprimir overlays/notificacoes em modo stealth.
3. T4.3 Criar politica de fallback por limitacoes de plataforma.
4. T4.4 Validar matriz Zoom/Meet/Teams em cenarios reais.
5. T4.5 Implementar checklist self-check pre-apresentacao.
6. T4.6 Consolidar evidencia operacional da validacao stealth.

### Trilha T5 - Local runtime (Epic E)
1. T5.1 Implementar ProviderRouter com LocalProvider.
2. T5.2 Implementar managers de processo para llama-server e whisper-cli.
3. T5.3 Implementar ModelManager (download, checksum, versao).
4. T5.4 Implementar healthcheck, timeout e retry no runtime local.
5. T5.5 Implementar fallback progressivo (GPU para CPU, ctx/batch menor).
6. T5.6 Implementar modo privacidade local-only.

### Trilha T6 - Qualidade e release (Epic F)
1. T6.1 Cobertura de testes unitarios de servicos criticos.
2. T6.2 Suite E2E dos fluxos screenshot, audio, stealth e provider switch.
3. T6.3 Packaging, assinatura e instalador Windows.
4. T6.4 Auto-update com rollback seguro.
5. T6.5 Playbook operacional e troubleshooting.

### Trilha T7 - Go-live controlado
1. T7.1 Beta fechado com grupo piloto e criterios de feedback.
2. T7.2 Priorizacao de bugs por severidade e frequencia.
3. T7.3 Hardening final de estabilidade/performance.
4. T7.4 Decisao de release ampliado.

## 15) Primeira tarefa executada: T1.1 (A1) Bootstrap do monorepo
Objetivo da tarefa:
- Criar a base de projeto desktop para permitir evolucao dos modulos sem retrabalho.

Definicao operacional da tarefa (executada):
1. Criar estrutura de diretorios inicial:
   - /apps/desktop
   - /packages/shared-types
   - /packages/core-domain
2. Inicializar workspace Node com gerenciador unico (pnpm recomendado).
3. Criar app desktop com Electron + Vite + React + TypeScript.
4. Configurar scripts padrao de desenvolvimento, build e lint no workspace.
5. Validar boot local (shell abre + renderer carrega).

Checklist de pronto da T1.1:
1. Workspace inicial criado e versionavel.
2. App Electron sobe em modo dev sem erro de inicializacao.
3. Estrutura de pacotes compartilhados criada.
4. Scripts padrao documentados para execucao da equipe.

Evidencias geradas nesta execucao:
1. Workspace root com package manager e scripts:
   - package.json
   - pnpm-workspace.yaml
   - README.md
2. App desktop inicial:
   - apps/desktop/package.json
   - apps/desktop/electron/main.cjs
   - apps/desktop/electron/preload.cjs
   - apps/desktop/src/main.tsx
   - apps/desktop/src/App.tsx
3. Pacotes compartilhados iniciais:
   - packages/shared-types/src/index.ts
   - packages/core-domain/src/index.ts

Risco imediato e mitigacao:
1. Risco: divergencia de versoes de Node/pnpm na equipe.
   Mitigacao: fixar engines minimas no workspace e registrar prerequisitos no README inicial.

Proxima tarefa apos T1.1:
1. T1.3 (A2) IPC tipado com validacao de payload para screenshot/audio/chat/stealth.

Resultado da validacao tecnica da T1.1:
1. Dependencias instaladas com sucesso via Corepack pnpm.
2. Correcao aplicada para instalacao do Electron (postinstall executado).
3. Ambiente dev subiu com Vite pronto e processo Electron iniciado.
4. Scripts de workspace ajustados para execucao com corepack pnpm em maquinas sem shim global.

Resultado da execucao da T1.3 (A2):
1. Contratos tipados de IPC criados para desktop, screenshot, chat, audio e stealth.
2. Bridge de preload exposta com metodos controlados (contextIsolation + invoke por canal).
3. Handlers de main process criados com validacao de payload usando zod.
4. Smoke test de UI com chamada ping/stealth em renderer para validar roundtrip.
5. Typecheck e build executados com sucesso apos integracao.

Resultado da execucao da T1.4 (A3):
1. Modulo de configuracoes persistentes criado em arquivo local no userData do Electron.
2. Contratos IPC de settings implementados (get, save, reset) com validacao de payload.
3. Persistencia de API key com protecao no main process (safeStorage quando disponivel).
4. UI conectada para carregar/salvar/resetar idioma, atalhos e status da API key.
5. Typecheck, build e smoke test em dev executados com sucesso apos integracao.

Resultado da execucao da T1.5 (A4):
1. Logger local com rotacao por tamanho implementado no main process.
2. Niveis de log configuraveis (debug/info/warn/error) com controle em runtime via IPC.
3. Redacao de campos sensiveis no payload de logs para reduzir exposicao de segredos.
4. Endpoints de diagnostico implementados (arquivo de log, nivel ativo, linhas recentes).
5. Painel de diagnostico no renderer para visualizar logs e ajustar nivel.
6. Typecheck, build e smoke test em dev executados com sucesso apos integracao.

Resultado da execucao da T1.6 (A5):
1. Feature flags persistidas no settings store (provider mode, local provider, force local-only e stealth hardening).
2. Snapshot de ambiente e parser de variaveis de ambiente para overrides de runtime.
3. Resolucao de flags efetivas com precedencia de env sobre persistencia.
4. Contratos IPC adicionados para get/save/reset de flags e consulta de ambiente.
5. Painel no renderer para editar flags persistidas, visualizar flags efetivas e fontes de override.
6. Typecheck, build e smoke test em dev executados com sucesso apos integracao.

Resultado da execucao da T2.1 (B1):
1. Servico de captura de screenshots implementado no main process usando Electron desktopCapturer.
2. Capturas persistidas como PNG temporario em userData/captures.
3. Fila em memoria das ultimas capturas com limite e limpeza de arquivos antigos.
4. Atalho global de captura registrado a partir das configuracoes do usuario e atualizado quando o atalho muda.
5. Evento IPC de atualizacao da fila conectado ao renderer em tempo real.
6. UI com captura manual, visualizacao da fila, preview e limpeza da fila.
7. Typecheck, build e smoke test em dev executados com sucesso apos integracao.

Resultado da execucao da T2.2 (B2):
1. Composer ASK adicionado ao renderer com textarea dedicada.
2. Selecao explicita de screenshots da fila para contextualizar cada envio.
3. Envio implementado por botao e atalho local Ctrl+Enter.
4. Historico local das requisicoes aceitas com requestId, timestamp e screenshots vinculadas.
5. Validacoes basicas de UX para evitar envio vazio.
6. Typecheck, build e smoke test em dev executados com sucesso apos integracao.

Resultado da execucao da T2.3 (B3):
1. SDK Gemini integrado ao app desktop no main process.
2. API key descriptografada apenas no main process para chamadas ao provider cloud.
3. Handler chat:ask atualizado para iniciar stream Gemini multimodal com screenshots selecionadas.
4. Eventos de stream (started, chunk, completed, error) enviados ao renderer via IPC.
5. Timeline do ASK atualizada incrementalmente com resposta e erros acionaveis.
6. Typecheck, build e smoke test em dev executados com sucesso apos integracao.

Resultado da execucao da T2.4 (B4):
1. Timeline dedicada de chat adicionada ao renderer, separando mensagens de usuario e assistente.
2. Placeholder de resposta do assistente criado no momento do envio para melhorar percepcao de latencia.
3. Eventos de stream passam a atualizar a mensagem do assistente incrementalmente na timeline.
4. Estados pending, streaming, completed e error ficam visiveis por mensagem.
5. RequestId e quantidade de screenshots vinculadas ficam visiveis para diagnostico funcional.
6. Typecheck, build e smoke test em dev executados com sucesso apos integracao.

Resultado da execucao da T2.5 (B5 parcial):
1. Eventos de stream passaram a incluir codigo de erro, mensagem acionavel e indicador retryable.
2. Mapeamento de falhas tecnicas para guidance funcional (auth, rate limit, rede, timeout, servidor).
3. Fluxo de erro local-only e API key ausente padronizado com mensagens objetivas de correcao.
4. UI exibe acao recomendada e codigo de erro na timeline/historico.
5. Botao de retry do ultimo ASK com falha retryable implementado no composer.
6. Typecheck e build executados com sucesso apos integracao.

Resultado da execucao da T2.6 (B5 restante):
1. Catalogo de presets de prompt implementado no main process e exposto via IPC.
2. Composer ASK atualizado para selecao de preset com descricao de uso.
3. Guardrails de prompt implementados para bloquear entradas com possivel vazamento de segredo.
4. Builder de prompt final com regras de output para respostas mais objetivas e seguras.
5. Integração completa com chat:ask para envio do prompt processado ao provider.
6. Typecheck, build e smoke test em dev executados com sucesso apos integracao.

Resultado da execucao da T3.1 (C1):
1. Painel de gerenciamento de dispositivo de entrada de audio implementado no renderer.
2. Fluxo de permissao de microfone com mensagens acionaveis para Windows.
3. Listagem de dispositivos de entrada de audio via mediaDevices.enumerateDevices.
4. Teste rapido do microfone selecionado via getUserMedia com deviceId.
5. Persistencia de selectedAudioInputDeviceId nas configuracoes do app.
6. Typecheck, build e smoke test em dev executados com sucesso apos integracao.

---
Este plano mantem escopo enxuto para chegar rapido ao primeiro modo funcional, sem bloquear a evolucao para runtime local e stealth robusto.