# Catálogo funcional do AIGA

> Inventário rastreável do comportamento do sistema no estado atual do repositório.  
> Revisão: 2026-09-20 · Produto: AIGA Desktop 0.1.0 · Plataforma-alvo: Windows.

## 1. Objetivo e critério de classificação

Este documento cataloga as funcionalidades encontradas na interface React, na ponte IPC, nos serviços Electron, nos tipos compartilhados, nos testes e na documentação operacional. Ele descreve **o que o código atual oferece**, sem transformar planos ou documentos conceituais em funcionalidades entregues.

### Estados usados

| Estado | Critério |
|---|---|
| **Implementada** | Há fluxo executável de interface/IPC até um serviço com comportamento concreto. |
| **Condicional** | Implementada, mas depende de SO, build instalada, permissão, credencial, binário, modelo ou feature flag. |
| **Parcial / fallback** | O fluxo existe, porém alguma etapa pode operar como stub ou degradação controlada. |
| **Operacional / manual** | O sistema fornece suporte, checklist ou evidência, mas a validação depende de ação humana. |
| **Planejada** | Aparece somente em plano/backlog; não há fluxo de produto correspondente no código. |

### Fontes de evidência

- Interface: `apps/desktop/src/App.tsx`, `apps/desktop/src/components/*` e `TranslationOverlayView.tsx`.
- Contrato renderer/main: `apps/desktop/electron/preload.cjs`, `ipc.cjs` e `packages/shared-types/src/*`.
- Serviços: módulos em `apps/desktop/electron/*`.
- Operação: `README.md`, `.env.example`, scripts e documentos em `docs/`.

## 2. Visão funcional

O AIGA é um assistente desktop Electron com três modos principais:

1. **Chat multimodal** — pergunta textual, screenshot e/ou áudio, com resposta incremental de LLM.
2. **Reunião** — captura/transcrição de áudio, resumo, alertas de perguntas e memória contextual.
3. **Tradução ao vivo** — áudio para STT, tradução e legendas em painel/overlay.

Esses modos compartilham provedores de IA, runtime local, controle de privacidade, captura de mídia, stealth, configurações persistidas, diagnóstico e atualização.

## 3. Catálogo executivo

| Categoria | IDs | Capacidades principais |
|---|---|---|
| Chat e respostas | CHAT-01…10 | ASK, streaming, histórico, erro acionável, reenvio, presets e guardrails |
| Tela e visão | VIS-01…09 | captura global, múltiplos monitores, fila, preview e análise automática |
| Áudio e transcrição | AUD-01…12 | gravação, fontes, medição, loopback, arquivo, FFmpeg e Whisper |
| Reuniões | MEET-01…17 | wizard, modos, transcrição, resumo, alertas, bookmarks, templates e memória |
| Tradução | TRN-01…11 | tradução contínua, idiomas, overlay, latência e exclusão mútua |
| IA e roteamento | LLM-01…12 | Gemini/OpenAI/Anthropic/local, rotas, teste, fallback e orçamento |
| Contexto | CTX-01…05 | perfis pessoais e memória editável do time |
| Privacidade e stealth | PRV-01…11 | always-on-top, full stealth, content protection, consentimento e retenção |
| Configuração e UX | UX-01…13 | modos, opacidade, layout, foco reflexivo, atalhos, idioma de código e setup |
| Operação e release | OPS-01…13 | logs, flags, ambiente, atualização, rollback, build e beta gates |

## 4. Chat multimodal e geração de respostas

| ID | Funcionalidade | Comportamento e regras | Estado | Evidência principal |
|---|---|---|---|---|
| CHAT-01 | ASK textual | Envia texto livre em uma sessão e exibe a resposta da IA. `Ctrl+Enter` ou botão faz o envio. | Implementada | `App.tsx`; `chat:ask` |
| CHAT-02 | Resposta incremental | Eventos de stream criam/atualizam a mensagem do assistente nos estados pending, streaming, completed ou error. | Implementada | `onChatStreamEvent`; providers cloud/local |
| CHAT-03 | Histórico da sessão | Mantém no renderer as mensagens de usuário e assistente, com data, request ID e anexos relacionados. Não é um histórico persistente entre execuções. | Implementada | estado `chatMessages` em `App.tsx` |
| CHAT-04 | Chat multimodal | Um ASK pode combinar texto, uma ou mais screenshots e um áudio gravado. | Implementada | `submitAsk`; `llm-parts-builder.cjs` |
| CHAT-05 | Erros acionáveis | Propaga código, mensagem, recomendação e flag de retry. Abrange chave ausente/inválida, limite, rede, timeout e bloqueio local-only. | Implementada | contrato `ChatStreamEvent`; providers/router |
| CHAT-06 | Reenvio de falha | Reenvia a solicitação quando o erro é marcado como recuperável. | Implementada | `App.tsx` |
| CHAT-07 | Auto-scroll | Mantém a timeline na resposta mais recente; pode ser desativado. | Implementada | `App.tsx`; Recursos (chat) |
| CHAT-08 | Selecionar para prompt | Ao copiar texto selecionado dentro da janela AIGA, preenche o ASK com uma instrução de análise. Não captura seleção global de outros apps. | Implementada | `selectToPrompt` em `App.tsx` |
| CHAT-09 | Presets especializados | Catálogo interno para código, UI, erro, resumo, screenshot e áudio. A seleção automática usa `screenshot-analysis` ou `audio-analysis` quando há mídia; sem mídia, usa `code-solver`. | Implementada | `prompt-presets.cjs` |
| CHAT-10 | Guardrails de prompt | Bloqueia instrução curta quando aplicável e padrões de segredo em texto puro; injeta regras globais de objetividade/corretude. | Implementada | `validatePromptGuardrails` |

## 5. Captura e análise de tela

| ID | Funcionalidade | Comportamento e regras | Estado | Evidência principal |
|---|---|---|---|---|
| VIS-01 | Captura por botão | Captura a tela a partir do cabeçalho do chat. | Implementada | `handleCapture`; `screenshot:capture` |
| VIS-02 | Atalho global de captura | Atalho padrão `Ctrl+E`, configurável e registrado no processo principal. Funciona sem foco na janela. | Implementada | `shortcut-service.cjs`; Settings |
| VIS-03 | Modos de monitor | Captura tela principal, uma tela específica ou todas as telas. | Implementada | `ScreenCaptureSettings.tsx`; `screenshot-service.cjs` |
| VIS-04 | Descoberta de displays | Lista monitores com identificação, rótulo e resolução para escolha. | Implementada | `screenshot:displays:list` |
| VIS-05 | Fila de screenshots | Salva PNG temporário em `userData/captures`, publica atualização da fila e limita a apresentação recente na UI. | Implementada | `screenshot-service.cjs`; eventos de fila |
| VIS-06 | Preview e anexação | Exibe miniaturas, permite anexar múltiplas capturas ao ASK e remover anexos pendentes. | Implementada | `App.tsx` |
| VIS-07 | Análise rápida automática | Após capturar, envia imediatamente “analise a tela” com o preset especializado; pode ser desligada para edição prévia do pedido. | Implementada | `quickAnalysis`; `onQuickAnalyze` |
| VIS-08 | Análise visual especializada | Classifica conteúdo em algoritmo, questão objetiva/teórica, erro, UI/UX, documento ou outro; adapta estrutura, linguagem e nível de detalhe. | Implementada | preset `screenshot-analysis` |
| VIS-09 | Limpeza de fila | Remove as capturas temporárias enfileiradas por comando IPC. | Implementada | `screenshot:queue:clear` |

## 6. Áudio, fontes e transcrição

| ID | Funcionalidade | Comportamento e regras | Estado | Evidência principal |
|---|---|---|---|---|
| AUD-01 | Push-to-talk no chat | Grava microfone, anexa o áudio ao ASK e remove o arquivo temporário após o envio. Atalho padrão `Ctrl+D`. | Condicional: permissão/dispositivo | `MediaRecorder` em `App.tsx`; `audio:add` |
| AUD-02 | Medidor de microfone | Mostra nível e pico em dBFS durante gravação/teste. | Implementada | `AudioCaptureHud.tsx`; meter IPC |
| AUD-03 | Seleção de microfone | Enumera entradas, solicita permissão, persiste device ID/rótulo e orienta sobre bloqueio no Windows. | Condicional: permissão do SO | `SettingsPage.tsx` |
| AUD-04 | Captura da saída do sistema | Obtém áudio do dispositivo de reprodução padrão por `desktopCapturer`, voltado a Teams/Meet/Zoom. | Condicional: Electron/Windows e permissão | `audio-loopback-capture.cjs` |
| AUD-05 | Modos de captura | Configura saída do sistema ou microfone; normaliza configurações legadas de output device. | Implementada | `AudioCaptureSettings.tsx`; settings store |
| AUD-06 | Teste de fonte | Valida uma fonte e mede pico real antes de iniciar reunião/tradução. | Condicional: fonte disponível | `audio-source-validator.cjs`; `audio:source:test` |
| AUD-07 | Captura dupla | Fora do modo somente microfone, reunião captura sistema e microfone em paralelo e distingue `[Você]`/`[Reunião]`. | Condicional: fontes disponíveis | `MeetingModePanel.tsx`; orchestrator |
| AUD-08 | Arquivo de reunião | Grava chunks em pasta configurável, com seletor de diretório e pasta padrão. | Implementada | `meeting-audio-archive.cjs`; settings de áudio |
| AUD-09 | Conversão para STT | Converte chunks WebM/Opus para WAV PCM mono 16 kHz usando FFmpeg. | Condicional: FFmpeg instalado | `stt-adapter.cjs`; `ffmpeg-installer.cjs` |
| AUD-10 | Instalação de FFmpeg | Consulta status e instala runtime com evento de progresso. | Condicional: rede e política local-only | `audio:ffmpeg:*` |
| AUD-11 | Whisper local | Executa `whisper-cli` por chunk e usa retorno stub controlado quando binário/modelo não está pronto. | Parcial / fallback | `whisper-cli-manager.cjs`; `stt-adapter.cjs` |
| AUD-12 | Pacotes de transcrição | Instala/remove runtime e pacotes PT, EN, ES, FR, DE, IT; seleciona modelo Base (~142 MB), Small (~466 MB) ou Medium (~1,5 GB). PT/EN são obrigatórios no setup. | Condicional: rede, disco e local-only | `TranscriptionPacksSettings.tsx`; `transcription-packs.cjs` |

## 7. Modo reunião

| ID | Funcionalidade | Comportamento e regras | Estado | Evidência principal |
|---|---|---|---|---|
| MEET-01 | Wizard de início | Coleta template, perfil, objetivo, prompt adicional, modo, apelidos e consentimento. | Implementada | `MeetingWizard.tsx` |
| MEET-02 | Modo observador | Transcreve e gera resumo ao encerrar. | Implementada | modo `passive`; orchestrator |
| MEET-03 | Modo ativo | Detecta perguntas dirigidas ao usuário e sugere resposta durante a reunião. | Implementada | modo `active`; active detector |
| MEET-04 | Modo híbrido | Combina resumo contínuo/final e alertas de pergunta. | Implementada | modo `hybrid` |
| MEET-05 | Heurística por apelidos | Usa nomes/apelidos configurados para reconhecer perguntas dirigidas ao usuário. | Implementada | `meeting-active-detector.cjs` |
| MEET-06 | Question-only | Restringe alerta à presença de pergunta e heurística, sem classificador LLM. | Implementada | `questionOnlyMode` |
| MEET-07 | Classificador LLM | Rota dedicada avalia perguntas e produz confiança/sugestão; pode ser configurada independentemente. | Condicional: provider válido | `meetingActiveClassifier` |
| MEET-08 | Transcrição incremental | Recebe chunks e publica delta/texto completo durante a sessão. | Implementada com STT condicional | `meeting:transcript:append`; eventos |
| MEET-09 | Resumo final | Ao encerrar, gera Markdown e publica evento de sessão concluída. | Condicional: rota LLM/local | `meeting-session-orchestrator.cjs` |
| MEET-10 | Resumo intermediário | Solicita resumo “mid-call” sem encerrar a reunião. | Condicional: rota LLM/local | `meeting:session:mid-summary` |
| MEET-11 | Bookmarks | Marca um ponto por tempo/transcript length e contabiliza marcações da sessão. | Implementada | `meeting:transcript:bookmark` |
| MEET-12 | Copiar/exportar resumo | Interface permite copiar/usar o resumo produzido ao final. | Implementada | `MeetingModePanel.tsx` |
| MEET-13 | Templates curados | Daily, retrospectiva, 1:1, planning/refinamento, review e entrevista técnica; preenchem objetivo, prompt e modo sugerido. | Implementada | `meeting-templates.cjs` |
| MEET-14 | Status e cronômetro | Exibe recording/processing/completed/cancelled/failed, tempo, tamanho da transcrição, tokens e bookmarks. | Implementada | `MeetingSessionStatusEvent` |
| MEET-15 | Bandeja durante stealth | Mantém indicador/cronômetro e ações Encerrar/Cancelar quando a janela não deve ficar exposta. | Condicional: tray do SO | `meeting-tray-service.cjs` |
| MEET-16 | Cancelamento | Cancela sessão sem produzir o fluxo normal de conclusão. | Implementada | `meeting:session:cancel` |
| MEET-17 | Limite de simultaneidade | Reunião e tradução não podem ficar ativas ao mesmo tempo. | Implementada | `main.cjs`; `translation-session.cjs` |

## 8. Tradução em tempo real

| ID | Funcionalidade | Comportamento e regras | Estado | Evidência principal |
|---|---|---|---|---|
| TRN-01 | Sessão de tradução contínua | Inicia captura, transcreve chunks, traduz e publica linhas até o encerramento. | Condicional: áudio, STT e rota LLM | `TranslationModePanel.tsx`; `translation-session.cjs` |
| TRN-02 | Idioma de origem | Automático, português, inglês, espanhol, francês, alemão ou italiano. | Implementada | `TranslationLanguageCode` |
| TRN-03 | Idioma de destino | Português, inglês, espanhol, francês, alemão ou italiano. | Implementada | painel e settings |
| TRN-04 | Preferências persistidas | Persiste origem, destino, tamanho de fonte, opacidade, linhas de histórico e overlay ligado/desligado. | Implementada | `translationPrefs` |
| TRN-05 | Linhas bilíngues | Cada evento contém texto original, tradução, idiomas, latência e horário. | Implementada | `TranslationLineEvent` |
| TRN-06 | Métricas de latência | Mantém média, máximo e quantidade de linhas da sessão. | Implementada | status de tradução |
| TRN-07 | Overlay flutuante | Janela sempre no topo mostra legendas recentes e estado “Aguardando áudio”. | Condicional: overlay habilitado | `translation-overlay-window.cjs`; `TranslationOverlayView.tsx` |
| TRN-08 | Overlay protegido | Aplica content protection e perfil de stealth ao overlay. | Condicional: suporte do SO | content protection/stealth services |
| TRN-09 | Fontes mic/sistema | Reusa as fontes de captura e permite alternância conforme configuração. | Condicional: fonte disponível | `TranslationModePanel.tsx` |
| TRN-10 | Consentimento | Exige aceite explícito e grava versão/texto, uso de cloud e timestamp antes de capturar. | Implementada | consent audit store |
| TRN-11 | Tratamento de erro | Publica evento específico e atualiza o status após falha. | Implementada | `onTranslationError` |

## 9. Provedores, modelos e orçamento de IA

| ID | Funcionalidade | Comportamento e regras | Estado | Evidência principal |
|---|---|---|---|---|
| LLM-01 | Gemini | Provider cloud padrão, com streaming e chave persistida de forma cifrada. | Condicional: API key/rede | `gemini-provider.cjs` |
| LLM-02 | OpenAI | Provider cloud configurável, desabilitado por padrão. | Condicional: API key/rede | `openai-provider.cjs` |
| LLM-03 | Anthropic | Provider cloud configurável, desabilitado por padrão. | Condicional: API key/rede | `anthropic-provider.cjs` |
| LLM-04 | Teste de provider | Testa provider/modelo e retorna mensagem e horário do teste. | Condicional: credencial/rede | `llm:providers:test` |
| LLM-05 | Rotas por finalidade | Configuração independente para ASK, resumo de reunião, classificador ativo e tradução. | Implementada | `LlmRoutingPublicConfig` |
| LLM-06 | Modos cloud/local/híbrido | Flags efetivas selecionam cloud, local ou preferência local com fallback cloud. | Implementada | `provider-router.cjs`; feature flags |
| LLM-07 | Privacidade local-only | Força local, bloqueia cloud/fallback e downloads de modelo; em indisponibilidade retorna erro acionável. | Implementada | `forceLocalOnly`; router/model manager |
| LLM-08 | LocalProvider | Interface de streaming local; pode conversar com llama-server, mas conserva stub diagnóstico quando o runtime/modelo não está pronto. | Parcial / fallback | `local-provider.cjs` |
| LLM-09 | Gerência do llama-server | Resolve binário, inicia/para servidor e tenta perfis progressivos de GPU layers, contexto e batch, com fallback após falha/OOM. | Condicional: binário/modelo | `llama-server-manager.cjs` |
| LLM-10 | ModelManager | Resolve, baixa e valida modelos por SHA-256; degrada sem travar a UI. | Condicional: URL/rede/checksum | `model-manager.cjs` |
| LLM-11 | Orçamento por sessão | Avisa em 50 mil tokens e possui limite hard padrão de 200 mil; ação pode avisar, bloquear cloud ou migrar para local. | Implementada | `token-usage-tracker.cjs`; defaults |
| LLM-12 | Uso diário | Agrega tokens de entrada/saída por data e informa extrapolação do limite diário quando definido. | Implementada | `usage:tokens:daily` |

## 10. Contexto e memória

| ID | Funcionalidade | Comportamento e regras | Estado | Evidência principal |
|---|---|---|---|---|
| CTX-01 | Perfis de contexto | Cadastra nome, papel, time, responsabilidades, estilo de comunicação e prompt base. | Implementada | `ContextProfilesSettings.tsx`; context store |
| CTX-02 | Editar/excluir perfil | Atualiza ou remove perfil persistido em JSON no `userData`. | Implementada | `context:profiles:save/delete` |
| CTX-03 | Duplicar perfil | Clona um perfil para reutilização/adaptação. | Implementada | `context:profiles:duplicate` |
| CTX-04 | Aplicar perfil à reunião | O wizard vincula o perfil e usa seu contexto na geração de resumo/respostas. | Implementada | meeting start/orchestrator |
| CTX-05 | Memória do time | Lista, edita e exclui itens derivados de reuniões, com trecho, resumo, objetivo e vínculos de sessão/perfil. | Implementada | `TeamMemoryPanel.tsx`; context store |

## 11. Privacidade, consentimento e modo stealth

| ID | Funcionalidade | Comportamento e regras | Estado | Evidência principal |
|---|---|---|---|---|
| PRV-01 | Janela assistiva always-on-top | Janela sem moldura, compacta, flutuante e com opacidade ajustável. | Implementada | `main.cjs`; `stealth-window-service.cjs` |
| PRV-02 | Full stealth | Atalho padrão `Ctrl+Shift+H` oculta/restaura a janela; há comando explícito de saída. | Implementada | stealth IPC/shortcut |
| PRV-03 | Content protection | Aplica exclusão de captura nas janelas principal e de overlay e reaplica em eventos/watchdog. | Condicional: SO/pipeline de captura | `content-protection-guard.cjs` |
| PRV-04 | Perfis de hardening | `off`, `safe` e `strict`, com precedência de variável de ambiente. | Implementada | `stealth-profile.cjs`; feature flags |
| PRV-05 | Modo não-stealth | Permite desligar comportamento stealth por preferência geral. | Implementada | Settings Geral |
| PRV-06 | Status de proteção | Mostra suporte/plataforma, número de janelas protegidas e permite reaplicar/verificar. | Implementada | `stealth:content-protection` |
| PRV-07 | Consentimento auditável | Reunião e tradução exigem aceite; registra sessão, tipo, versão do texto, cloud e timestamp. | Implementada | `consent-audit-store.cjs` |
| PRV-08 | Controle de cloud em reuniões | Preferência explícita permite ou bloqueia processamento cloud de reunião. | Implementada | `privacy.allowCloudProcessingForMeetings` |
| PRV-09 | Retenção | Retenção padrão de 7 dias e expurgo manual de arquivos antigos com relatório de removidos/erros. | Implementada | `retention-purge-service.cjs` |
| PRV-10 | Self-check de compartilhamento | Matriz Zoom/Meet/Teams e checklist pré-apresentação registram evidência de validação. | Operacional / manual | Settings/`stealth-validation-evidence.md` |
| PRV-11 | Limitação documentada | A proteção real varia por Windows e plataforma; builds antigas podem mostrar retângulo preto. Recomenda full stealth ou share de janela como fallback. | Operacional / manual | README e evidência stealth |

## 12. Configuração e experiência desktop

| ID | Funcionalidade | Comportamento e regras | Estado | Evidência principal |
|---|---|---|---|---|
| UX-01 | Alternância de modo | Cabeçalho troca entre chat, reunião e tradução. | Implementada | `App.tsx` |
| UX-02 | Opacidade | Ajuste visual da janela de 20% a 100% quando stealth está ativo. | Implementada | `window:set-opacity` |
| UX-03 | Layouts | Janela usa layouts chat, expanded e settings; resposta pode ser maximizada. | Implementada | `window-layout.cjs`; `setWindowLayout` |
| UX-04 | Controles de janela | Minimizar e fechar/sair pelo cabeçalho. | Implementada | `window:minimize`; `app:quit` |
| UX-05 | Idioma do aplicativo | Preferência padrão `pt-BR`; o catálogo atual da interface permanece majoritariamente em português. | Implementada como preferência; i18n amplo não evidenciado | settings store |
| UX-06 | Linguagem padrão de código | Escolha entre Java, Python, JavaScript, TypeScript, C#, C++, Go, Kotlin, Rust, Ruby e Swift; entra nos presets. | Implementada | `code-language-options.cjs`; Settings |
| UX-07 | Atalhos configuráveis | Captura, push-to-talk e full stealth são persistidos e re-registrados. | Implementada | Settings/shortcut service |
| UX-08 | Persistência de settings | Salva preferências em JSON, aplica defaults seguros e migra modelos/configurações antigas. | Implementada | `settings-store.cjs` |
| UX-09 | Reset de configurações | Restaura defaults de produto. | Implementada | `settings:reset` |
| UX-10 | Setup checklist | Consolida prontidão de runtime, FFmpeg, Whisper, modelos e dependências necessárias. | Implementada | `setup-checklist.cjs` |
| UX-11 | Aviso de setup | Exibe banner/atalho para corrigir pré-requisitos ausentes. | Implementada | `SetupNoticeBanner.tsx` |
| UX-12 | Configurações por área | Geral, Reunião, Tradução, API Gemini, Provedores IA, Ambiente, Flags, Áudio, Tela, Microfone, Recursos do chat, Atalhos, Atualizações e Logs. | Implementada | `SettingsPage.tsx` |
| UX-13 | Foco reflexivo | Após enviar uma mensagem, libera o foco para a aplicação anterior sem ocultar o AIGA; o cabeçalho também oferece liberação manual. Um novo clique no agente recupera o foco para digitação. | Implementada | `window:release-focus`; `App.tsx` |

## 13. Operação, diagnóstico e distribuição

| ID | Funcionalidade | Comportamento e regras | Estado | Evidência principal |
|---|---|---|---|---|
| OPS-01 | Logs locais | Arquivo em `userData/logs`, rotação por tamanho e níveis debug/info/warn/error. | Implementada | `logger.cjs` |
| OPS-02 | Diagnóstico | Exibe caminho do log, nível e informações úteis de runtime. | Implementada | `diagnostics:get`; Settings Logs |
| OPS-03 | Nível de log em runtime | Altera nível sem reiniciar; variável de ambiente também define no boot. | Implementada | `diagnostics:set-log-level` |
| OPS-04 | Feature flags | Edita provider mode, local provider, force local-only e hardening, respeitando locks de ambiente. | Implementada | `FeatureFlagsSettings.tsx` |
| OPS-05 | Catálogo de ambiente | Mostra valores efetivos, origem (arquivo/padrão ou ambiente) e variáveis suportadas. | Implementada | `EnvironmentSettings.tsx`; `env-config.cjs` |
| OPS-06 | Auto-update manual seguro | Configura feed HTTPS/canal, verifica, baixa e instala sem download silencioso. | Condicional: build instalada e feed HTTPS | `auto-update-service.cjs` |
| OPS-07 | Canais stable/beta | Suporta prerelease opcional e canais stable ou beta. | Condicional: feed | AutoUpdate settings |
| OPS-08 | Confirmação de saúde | Após reinício, registra que a nova versão está saudável. | Condicional: update aplicado | auto-update service |
| OPS-09 | Rollback | Solicita downgrade usando versão/canal anterior quando a versão atual não é aprovada. | Condicional: artefato/feed | auto-update service |
| OPS-10 | Build Windows | Gera diretório empacotado ou instalador NSIS x64, atalhos de desktop/menu e diretório escolhível. | Implementada como pipeline | `package.json`; build README |
| OPS-11 | Assinatura de código | Valida configuração de certificado e assina quando credenciais existem; build sem assinatura gera aviso do SmartScreen. | Condicional: certificado | `ci-sign-check.cjs` |
| OPS-12 | Gates beta | Scripts executam gates, checklist de publicação e abertura de triagem diária. | Implementada como operação | `scripts/beta/*` |
| OPS-13 | Testes automatizados | Há testes unitários para update, consentimento, env, flags, reunião, presets e router, além de teste E2E do IPC. | Implementada | `electron/**/*.test.cjs` |

## 14. Regras transversais e dependências críticas

| Regra | Impacto funcional |
|---|---|
| Reunião × tradução | Exclusão mútua: apenas uma sessão de captura contínua pode estar ativa. |
| Cloud em reuniões | Requer consentimento, preferência de privacidade e provider/credencial válidos. |
| `forceLocalOnly=true` | Proíbe chamada e fallback cloud e impede downloads por rede; exige runtime/modelos já locais. |
| Áudio do sistema | Depende do compartilhamento de áudio do Electron e do dispositivo padrão do Windows. |
| STT real | Depende de FFmpeg, whisper-cli, DLLs e modelo; sem isso há diagnóstico/fallback, não equivalência de qualidade. |
| Screenshot | Os arquivos são temporários e a UI trabalha com fila/IDs, não com biblioteca permanente. |
| Chat | O histórico é de memória da execução; não foi encontrada persistência de conversas. |
| Content protection | É defesa best-effort e precisa ser validada na combinação SO + Zoom/Meet/Teams usada. |
| Auto-update | Fica indisponível por design em desenvolvimento/unpackaged. |

## 15. Itens documentados, mas não entregues como produto

Os itens abaixo aparecem em documentos de estratégia/backlog e **não devem ser apresentados como funcionalidades atuais do AIGA**:

| Item | Estado observado | Fonte |
|---|---|---|
| Integração com calendário | Planejada | plano de reunião |
| Hotkey global dedicada a bookmark | Planejada; bookmark existe pela UI/IPC | plano de reunião |
| Integração nativa com Zoom/Meet/Teams | Não existe; o app captura o áudio do sistema, sem API/bot dessas plataformas | docs/README |
| Plataforma de proctoring/observador remoto | Documento conceitual separado, sem implementação neste monorepo | `deteccao-ferramentas-assistente-screen-share.md` |
| Agente de endpoint, inventário de processos/janelas e bloqueio de apps | Planejados apenas no documento de proctoring | mesmo documento |
| Dashboard de risco, ML de vídeo e relatório PDF de prova | Planejados apenas no documento de proctoring | mesmo documento |
| Persistência/sincronização cloud de conversas | Não evidenciada | inspeção de código |
| Aplicativos móveis ou versão web autônoma | Não evidenciados | estrutura do monorepo |

## 16. Matriz de configuração padrão

| Configuração | Padrão |
|---|---|
| Idioma | `pt-BR` |
| Captura | `Ctrl+E` |
| Push-to-talk | `Ctrl+D` |
| Full stealth | `Ctrl+Shift+H` |
| Captura de tela | tela principal |
| Áudio | saída do sistema / device padrão |
| Reunião | observador (`passive`) |
| Tradução | origem automática → português; overlay ligado; fonte 14; opacidade 0,92; 8 linhas |
| Provider ASK | Gemini `gemini-3.5-flash` |
| Resumo/classificador/tradução | Gemini `gemini-3.5-flash-lite` |
| Tokens | aviso 50.000; hard limit 200.000; ação `warn` |
| Retenção | 7 dias |
| Transcrição | Whisper Base; pacotes PT/EN requeridos para setup completo |
| Auto-update | desligado; canal stable |

## 17. Cobertura e manutenção deste catálogo

Para manter o inventário confiável, toda mudança funcional deve atualizar:

1. a linha correspondente neste catálogo ou criar novo ID;
2. o contrato em `packages/shared-types` quando cruzar IPC;
3. o preload e o handler IPC;
4. a documentação operacional quando houver dependência/configuração nova;
5. teste automatizado proporcional ao risco.

Uma revisão periódica deve comparar, no mínimo, os métodos expostos em `preload.cjs`, handlers de `ipc.cjs`, navegação de `SettingsPage.tsx`, modos de `App.tsx` e serviços instanciados em `main.cjs`. Essa reconciliação evita que uma capacidade técnica sem UI seja confundida com função disponível ao usuário, ou que um backlog seja reportado como entrega.
