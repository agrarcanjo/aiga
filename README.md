# AI Personal Agent

Bootstrap inicial do monorepo para o MVP desktop.

## Pre-requisitos

- Node.js 20.11+
- pnpm 10+

## Estrutura

- apps/desktop: app Electron + React + TypeScript + Vite
- packages/shared-types: tipos compartilhados
- packages/core-domain: contratos de dominio

## Comandos

- corepack pnpm install
- corepack pnpm dev
- corepack pnpm build
- corepack pnpm lint
- corepack pnpm typecheck
- corepack pnpm test
- corepack pnpm test:e2e
- corepack pnpm pack:win
- corepack pnpm dist:win

## Guia pratico de primeira execucao (com Gemini API key)

### 1) Subir o app em modo desenvolvimento

1. No terminal, na raiz do repo, execute:
	- `corepack pnpm install`
	- `corepack pnpm typecheck`
	- `corepack pnpm dev`
2. Aguarde abrir:
	- Vite em `http://localhost:5173`
	- Janela Electron do app
3. Se `pnpm dev` falhar, tente:
	- `corepack pnpm --filter @clone-perssua/desktop dev`

### 2) Gerar a API key da Gemini

1. Acesse o Google AI Studio: `https://aistudio.google.com/apikey`
2. Faça login com a conta Google que sera usada no teste.
3. Clique em `Create API key` e selecione/crie o projeto.
4. Copie a chave gerada (formato semelhante a `AIza...`).
5. Boas praticas de seguranca:
	- nao commitar chave no git
	- nao compartilhar em chat/email
	- rotacionar a chave se houver exposicao

### 3) Inserir a API key no app

1. Com o app aberto, va para o painel `Configuracoes`.
2. Localize o campo de API key da Gemini.
3. Cole a chave e salve.
4. Confirme que o status da chave no painel indica configuracao valida.

### 4) Teste rapido de ponta a ponta (2 minutos)

1. Capture uma screenshot (atalho padrao configurado no app).
2. No ASK, envie: `Resuma o que esta visivel nesta tela em 3 bullets.`
3. Valide na timeline:
	- inicio de stream
	- resposta incremental
	- conclusao sem erro

### 5) Se der erro na primeira execucao

- `MISSING_API_KEY`
  - Causa: chave nao salva.
  - Acao: salvar chave no painel `Configuracoes`.
- `AUTH_INVALID_API_KEY`
  - Causa: chave invalida/revogada/projeto incorreto.
  - Acao: gerar nova chave no AI Studio e substituir.
- `RATE_LIMIT`
  - Causa: limite de chamadas atingido.
  - Acao: aguardar e tentar novamente.
- `NETWORK` ou `TIMEOUT`
  - Causa: conectividade/latencia.
  - Acao: validar internet, VPN/proxy e reenviar o ASK.

## Playbook operacional

### Boot e validacao inicial

- Executar `corepack pnpm install` ao preparar uma maquina nova.
- Em desenvolvimento, usar `corepack pnpm dev`.
- Antes de empacotar/release, validar nesta ordem:
	1. `corepack pnpm test`
	2. `corepack pnpm test:e2e`
	3. `corepack pnpm typecheck`
	4. `corepack pnpm build`

### Operacao diaria

- Confirmar no painel `Configuracoes`:
	- idioma
	- atalhos de captura, push-to-talk e stealth
	- status da API key Gemini quando o modo cloud/hybrid for usado
- Confirmar no painel `Feature flags e ambiente`:
	- `providerMode`
	- `localProviderEnabled`
	- `forceLocalOnly`
	- `stealthHardening`
- Confirmar no painel `Diagnostico`:
	- caminho do arquivo de log
	- nivel de log adequado (`info` por padrao, `debug` para investigacao)

### Operacao pre-apresentacao

- Executar o self-check de stealth no app antes de iniciar compartilhamento.
- Em Windows, validar previamente:
	- permissao de microfone
	- atalho `Ctrl+B`
	- modo de compartilhamento escolhido (janela/monitor secundario preferidos)
- Se o ambiente exigir discricao maxima, usar `stealthHardening=strict` e validar manualmente o cenario real em Zoom/Meet/Teams.

### Release Windows

- Gerar artefato local para inspeção sem instalador final:
	- `corepack pnpm pack:win`
- Gerar instalador NSIS:
	- `corepack pnpm dist:win`
- Para release assinada, definir antes:
	- `WIN_CSC_LINK`
	- `WIN_CSC_KEY_PASSWORD`
- Sem assinatura, o instalador continua gerado, mas o Windows SmartScreen exibira aviso.

### Rollout de auto-update

- Configurar feed HTTPS e canal no painel `Auto-update seguro`.
- Fluxo recomendado:
	1. salvar configuracao
	2. verificar update
	3. baixar update
	4. aplicar no restart
	5. apos reinicio, confirmar saude da versao
- Se a versao atual nao for aprovada, iniciar rollback pelo mesmo painel.
- O fluxo de auto-update so e validavel em build instalada; em dev/unpackaged ele permanece indisponivel por design.

## Observabilidade local

- O app grava logs em arquivo local (pasta userData do Electron, subpasta logs).
- Rotacao de logs por tamanho ativada no main process.
- Nivel de log pode ser definido por variavel de ambiente no boot:
	- DESKTOP_LOG_LEVEL=debug
	- valores: debug, info, warn, error
- Tambem e possivel alterar nivel em runtime pelo painel de Diagnostico da UI.

## Auto-update seguro

- O app inclui um `AutoUpdateService` no main process com integracao via IPC para o renderer.
- Regras de seguranca atuais:
	- feed remoto obrigatoriamente em `HTTPS`
	- sem auto-download silencioso
	- sem instalacao forcada imediata
	- health confirmation apos reinicio em nova versao
	- rollback por downgrade para o canal anterior quando a versao atual nao for aprovada
- Configuracao operacional pela UI:
	- `enabled`
	- `feedUrl`
	- `channel` (`stable` ou `beta`)
	- `allowPrerelease`
- Limitacao intencional: em ambiente dev/unpackaged o fluxo fica indisponivel; a validacao real exige build instalada.

## Feature flags e env management

- O app expoe gerenciamento de flags em runtime pelo painel Feature flags e ambiente.
- As flags persistidas podem ser sobrescritas por variaveis de ambiente no boot.
- Arquivo de referencia: .env.example

Variaveis suportadas:
- FEATURE_PROVIDER_MODE: cloud | local | hybrid
- FEATURE_LOCAL_PROVIDER_ENABLED: true | false
- FEATURE_FORCE_LOCAL_ONLY: true | false
- FEATURE_STEALTH_HARDENING: off | safe | strict

## Captura de screenshots

- O atalho global de captura usa a configuracao salva em Settings.
- Valor inicial padrao: Ctrl+E.
- Cada captura gera um arquivo PNG temporario em userData/captures e entra na fila da UI.
- A UI mostra preview das ultimas capturas e permite limpar a fila.

## Fluxo ASK

- O usuario pode selecionar uma ou mais screenshots da fila para contextualizar o envio.
- O campo ASK aceita instrucao textual livre para analise.
- Envio por botao ou atalho local Ctrl+Enter.
- O renderer mantem um historico local das ultimas requisicoes aceitas pelo main process.

## Presets e guardrails

- O composer ASK permite selecionar presets de prompt (UI, diagnostico de erro, resumo conciso).
- O main process aplica guardrails antes de chamar o provider.
- Prompts com indicios de segredo em texto puro sao bloqueados com mensagem acionavel.
- O prompt final inclui regras de output para reduzir alucinacao e manter respostas objetivas.

## Gemini

- A integracao Gemini roda no main process e faz streaming incremental de resposta para o renderer.
- A API key deve ser configurada no painel Settings da UI.
- O modelo pode ser sobrescrito por variavel de ambiente:
	- GEMINI_MODEL=gemini-2.0-flash
- Se a API key estiver ausente ou o modo local-only estiver ativo, o stream retorna erro acionavel na timeline do ASK.

## ProviderRouter e LocalProvider

- O fluxo ASK agora passa por um `ProviderRouter` no main process.
- Estrategias suportadas atualmente:
	- `cloud-only`
	- `local-only`
	- `prefer-local-fallback-cloud`
- O `LocalProvider` atual e um stub com streaming incremental para desacoplar a UI do backend Gemini e preparar a integracao futura com llama-server.
- Em `hybrid`, quando o provider local estiver habilitado, o roteador tenta local primeiro e pode cair para cloud se houver API key disponivel.

## Modo privacidade local-only

- Quando `forceLocalOnly=true`, o runtime aplica guardrails de privacidade ponta a ponta:
	- bloqueia fallback para providers cloud no chat
	- zera uso de API key cloud nos fluxos de chat/STT
	- bloqueia download de modelos por rede no `ModelManager`
	- normaliza flags para `providerMode=local` e `localProviderEnabled=true`
- Se o provider/modelo local estiver indisponivel, a UI recebe erro acionavel informando que o fallback cloud esta bloqueado por privacidade.

## Llama-server manager

- O runtime local inclui um `llama-server manager` no main process para controlar start/stop do processo local.
- Resolucao do binario nesta ordem:
	- `LLAMA_SERVER_PATH`
	- `userData/runtime/llama-server(.exe)`
	- `bin/llama-server(.exe)` na raiz do workspace
- Porta padrao do runtime local:
	- `LLAMA_SERVER_PORT=8081`
- Se o binario nao existir, o `LocalProvider` continua operando em modo stub com diagnostico claro, sem travar o fluxo ASK.
- Auto-tune e fallback:
	- o manager tenta perfis progressivos de `gpu-layers`, `ctx-size` e `batch-size`
	- em falha/OOM, aplica fallback automatico para perfis mais conservadores
	- variaveis opcionais para tuning manual:
		- `LLAMA_GPU_LAYERS`
		- `LLAMA_CTX_SIZE`
		- `LLAMA_BATCH_SIZE`

## Whisper-cli manager

- O STT local agora inclui um manager dedicado para whisper-cli no main process.
- Resolucao do binario nesta ordem:
	- `WHISPER_CLI_PATH`
	- `userData/runtime/whisper-cli(.exe)`
	- `bin/whisper-cli(.exe)` na raiz do workspace
- Resolucao do modelo nesta ordem:
	- `WHISPER_MODEL_PATH`
	- `userData/runtime/models/ggml-base.bin`
- O manager tenta transcrever por execucao isolada por chunk e, em caso de erro/indisponibilidade, o STT local cai para retorno stub sem quebrar o pipeline.

## ModelManager (download e validacao)

- O runtime local inclui um `ModelManager` para resolver, baixar e validar modelos por checksum SHA-256.
- Variaveis suportadas para modelo LLM local:
	- `LLAMA_MODEL_PATH`
	- `LLAMA_MODEL_URL`
	- `LLAMA_MODEL_SHA256`
- Variaveis suportadas para modelo STT local:
	- `WHISPER_MODEL_PATH`
	- `WHISPER_MODEL_URL`
	- `WHISPER_MODEL_SHA256`
- Comportamento:
	- Se o modelo nao existir localmente e houver URL, o manager baixa para `userData/runtime/models`.
	- Se `*_SHA256` estiver definido, valida integridade antes de liberar uso.
	- Em falha de validação/download, o runtime local degrada com fallback seguro sem travar UI.

## Timeline incremental

- Cada envio ASK gera uma dupla de mensagens na timeline: usuario e assistente.
- A mensagem do assistente entra como pending/streaming e e atualizada incrementalmente a cada chunk recebido.
- Erros de provider sao exibidos na propria timeline, vinculados ao requestId correspondente.

## Tratamento de erros (acionavel)

- O stream de chat envia codigo de erro, mensagem tecnica e acao recomendada.
- Principais codigos: MISSING_API_KEY, AUTH_INVALID_API_KEY, RATE_LIMIT, NETWORK, TIMEOUT.
- A UI exibe guidance para correcao e botao para reenviar o ultimo ASK com falha retryable.

## Audio input manager (prioridade Windows)

- A UI inclui painel de gerenciamento de dispositivos de entrada de audio.
- Fluxo recomendado no Windows:
	1. Solicitar permissao de microfone.
	2. Recarregar lista de dispositivos.
	3. Selecionar microfone preferido.
	4. Testar dispositivo e salvar configuracoes.
- O dispositivo selecionado e persistido em Settings para reutilizacao nos proximos fluxos de audio.
- Em caso de bloqueio de permissao no Windows, o app orienta ajustar: Configuracoes > Privacidade e seguranca > Microfone.

## Stealth validation e self-check

- O app inclui uma matriz operacional para validar stealth manualmente em Zoom, Google Meet e Microsoft Teams.
- Cada cenário pode ser marcado como `pending`, `pass`, `risk` ou `fail`, com observações de evidência.
- O app também inclui um checklist de self-check pré-apresentação para confirmar:
	- hotkey global de stealth
	- modo de compartilhamento escolhido
	- supressão de painéis sensíveis
	- recuperação segura no Windows
	- revisão de microfone e sinais visuais
- Limite técnico: a validação real em plataformas de reunião depende de execução manual no ambiente do usuário.
- Documento operacional complementar: [docs/stealth-validation-evidence.md](docs/stealth-validation-evidence.md)

## Troubleshooting

### Triage inicial

- Coletar o caminho do log no painel `Diagnostico`.
- Reproduzir com nivel `debug` quando o problema nao for intermitente.
- Registrar:
	- versao atual do app
	- sistema operacional
	- `providerMode` e `forceLocalOnly`
	- status de stealth
	- canal/feed de auto-update, se aplicavel

### Sintomas comuns

- `MISSING_API_KEY`
	- Causa provavel: modo cloud ativo sem chave Gemini salva.
	- Acao: salvar API key no painel `Configuracoes` ou migrar para `local`/`hybrid` com runtime local disponivel.
- `AUTH_INVALID_API_KEY`
	- Causa provavel: chave invalida, revogada ou com projeto incorreto.
	- Acao: substituir a API key e reenviar o ASK.
- `RATE_LIMIT`
	- Causa provavel: limite da API atingido.
	- Acao: aguardar e reenviar; reduzir frequencia de chamadas ou migrar cargas recorrentes para runtime local.
- `NETWORK`
	- Causa provavel: sem conectividade, DNS ou feed remoto indisponivel.
	- Acao: validar internet, proxy e reachability do endpoint Gemini/feed de update.
- `TIMEOUT`
	- Causa provavel: resposta lenta do provider ou payload pesado.
	- Acao: reduzir ASK, reduzir screenshots anexadas ou testar provider local.
- `LOCAL_ONLY_PRIVACY_MODE_ACTIVE`
	- Causa provavel: `forceLocalOnly=true` com runtime/modelo local indisponivel.
	- Acao: corrigir binarios/modelos locais ou desativar `forceLocalOnly`.
- Falha de microfone no Windows
	- Causa provavel: permissao negada ou device ocupado.
	- Acao: revisar `Configuracoes > Privacidade e seguranca > Microfone`, recarregar devices e testar o dispositivo selecionado.
- Preview/timeline nao aparecem em stealth
	- Causa provavel: comportamento esperado do modo stealth.
	- Acao: desativar stealth para diagnostico visual; o processamento continua em background.
- Auto-update indisponivel
	- Causa provavel: app em dev/unpackaged ou feed ausente/inseguro.
	- Acao: validar em build instalada e usar feed `HTTPS`.
- Instalador Windows com aviso SmartScreen
	- Causa provavel: build sem assinatura.
	- Acao: configurar `WIN_CSC_LINK` e `WIN_CSC_KEY_PASSWORD` para release oficial.

### Escalonamento tecnico

- Se houver regressao funcional apos update:
	1. nao confirmar saude da versao
	2. iniciar rollback no painel de auto-update
	3. preservar logs e versao instalada para analise
- Se stealth falhar em plataforma de reuniao:
	1. registrar cenario exato na matriz Zoom/Meet/Teams
	2. capturar evidencia em [docs/stealth-validation-evidence.md](docs/stealth-validation-evidence.md)
	3. usar fallback seguro (`safe` ou compartilhamento de janela/monitor secundario)
