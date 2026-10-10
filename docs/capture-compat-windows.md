# Compatibilidade de captura Windows — implementação e operação

Para comandos de geração do executável/instalador e diagnóstico de abertura sem janela, consulte [AIGA no Windows — gerar, instalar e abrir](guia-build-windows.md). O guia também acompanha o pacote em `resources/resources/guides/guia-build-windows.md`.

## Situação da entrega

Recurso opcional implementado para **processos Windows x64**, protocolo 1, componentes nativos 1.0.0. O alvo deve ser escolhido explicitamente em **Configurações → Captura tela → Compatibilidade de captura — Java**. Não há ativação persistida, seleção por nome compartilhado, elevação automática, alteração de JAR/runtime, encerramento ou reinício do Java.

**Implementação validada no aplicativo de teste; critérios referentes à aplicação Java real permanecem pendentes.** A matriz detalhada e os resultados medidos estão em [capture-compat-validation.md](capture-compat-validation.md). Não se declara aceite integral, qualificação de máquina limpa ou correção de congelamentos do Windows.

## Inspeção e mapa do repositório

Base inspecionada: branch `version2`, revisão `989718acd4725f1678c6d327c44b0991cef87f94`. Não foram encontrados `AGENTS.md` aplicáveis. A alteração preexistente em `apps/desktop/electron/local-provider.cjs` foi preservada. Nenhum commit ou mudança de branch foi feito para esta entrega.

| Caminho | Responsabilidade |
| --- | --- |
| `apps/desktop/electron/main.cjs` | Cria serviço e IPC; encerra heartbeat no fechamento; carrega `dist/index.html` na versão empacotada |
| `apps/desktop/electron/capture-compat-service.cjs` | Descoberta, seleção, identidade, filas, estados, hashes, execução restrita e diagnóstico |
| `apps/desktop/electron/preload.cjs` | Cinco operações específicas; não expõe comandos ou caminho de DLL |
| `packages/shared-types/src/capture-compat.ts` | Contratos de identidade, janela e estado |
| `apps/desktop/src/components/CaptureCompatSettings.tsx` | Seleção e resultados por janela, dentro de `SettingsPage.tsx` |
| `apps/desktop/native/capture-compat/` | CMake, build PowerShell, helper, DLL, fixture e testes nativos/UI |
| `apps/desktop/resources/capture-compat/x64/` | Binários gerados, manifesto SHA-256 e licença do Detours; ignorados pelo Git |
| `apps/desktop/electron/capture-compat-after-sign.cjs` | Atualiza hashes dos binários efetivamente distribuídos após assinatura |
| `apps/desktop/electron/content-protection-guard.test.cjs` | Regressão do guard existente; implementação do guard permanece inalterada |

O AIGA já utiliza Electron, React, TypeScript, testes `node:test`, pnpm e electron-builder. Não havia camada nativa para esta finalidade. `extraResources` copia os binários para `resources/resources/capture-compat/x64`, fora de `app.asar`. A base relativa do Vite e o carregamento local no main corrigem o caminho de assets necessário para abrir o pacote sem servidor Vite.

## Decisões técnicas

- Suporte implementado e testado: alvo x64; x86, ARM64 e arquiteturas desconhecidas são recusadas antes de carregar DLL. `IsWow64Process2` inspeciona o alvo; não se infere arquitetura do Electron. A arquitetura do Java real ainda deve ser confirmada.
- Escopo: todas as janelas de nível superior do processo escolhido, incluindo auxiliares e ocultas enumeradas no desktop atual. Child windows e janelas de outros processos são encaminhadas à API original. Janelas de outros desktops/sessões não foram qualificadas.
- Identidade: PID + FILETIME de criação como string exata + caminho absoluto + arquitetura. O helper abre e mantém um handle durante cada operação; revalida antes de carregar, executar comando e devolver resultados. O encerramento invalida a seleção, sem migrar para PID reutilizado.
- Carregamento: `CreateRemoteThread` chama `LoadLibraryW` no processo escolhido. O endereço é resolvido pelo módulo proprietário real no alvo, sem supor bases iguais. Outra chamada remota executa exclusivamente `AigaCaptureCommand`, com estrutura fixa. Nenhuma ação complexa ocorre em `DllMain`; as notificações do CRT estático são preservadas.
- Antes de executar um comando, o helper compara o identificador de build exportado pela imagem remota com o esperado. Caminho divergente ou build antigo gera conflito, sem tentar executar offsets de outra versão.
- Detours 4.0.1, revisão fixa `e4bfd6b03e50de46b47abfbd1e46b384f0c5f833`, licença MIT. O build rejeita revisão diferente ou checkout modificado. Atualização exige revisão da licença, protocolo/build ID e repetição da matriz.
- Instalação/desativação: transações Detours, participação das threads enumeradas, abort em falhas e tratamento de concorrência pelo lock de controle. A DLL permanece carregada até o encerramento natural do alvo, mesmo inativa. Não há `FreeLibrary` remoto, `TerminateProcess`, `TerminateThread` ou suspensão permanente como recuperação.
- Hook: somente `0x1` e `0x11` para HWND elegível são neutralizados com `TRUE`. Esse retorno simula sucesso. `0x0`, valores desconhecidos, child windows e HWND inválido seguem à função real, com preservação de `LastError`. `GetWindowDisplayAffinity` nunca é interceptada.
- Limpeza explícita após instalar: `realSet(hwnd, WDA_NONE)`, consulta real e nova observação após intervalo. Até três passagens reconciliam criação/destruição e restrições remanescentes. O estado verificado exige hook confirmado, conjunto estável não vazio, ausência de overflow e todas as consultas reais em zero, sem erro de limpeza.
- Identidade de janela é novamente conferida por HWND, PID, thread e condição de nível superior. Não há cache histórico de evidência entre operações. A evidência corresponde ao instante observado; criação/destruição ou reutilização extremamente rápida no mesmo thread não pode ser excluída atomicamente pelas APIs públicas usadas.

## Comunicação, permissões e limites

Não há named pipe, serviço elevado nem endpoint de execução arbitrária. O main aceita somente mensagens da janela principal, frame principal e URL de renderer configurada; valida os campos estritamente. O renderer nunca fornece token, executável ou DLL. A seleção deve corresponder a uma descoberta atual, novamente validada pelo helper.

O helper recebe comandos específicos por stdin anônimo herdado, com tamanho limitado, sem shell. Cada sessão tem token aleatório de 256 bits em memória. O token não aparece em argumentos, persistência, UI ou logs. A DLL recusa reivindicação/desativação de sessão ativa com outro token. Consulta sem token correspondente é somente observação: não limpa nem renova a sessão.

O limite de segurança inclui as permissões Windows do processo: software com direito de escrever arbitrariamente na memória do mesmo alvo já pode alterar a DLL. O token protege o protocolo da sessão; não transforma processos do mesmo usuário com tais direitos em domínios isolados. O manifesto verifica integridade/coerência de distribuição, não substitui ACL e assinatura de código. O build local de validação não foi assinado; a assinatura depende da configuração de distribuição do projeto. Após assinatura, `afterSign` recalcula os hashes finais.

| Limite operacional | Valor definido |
| --- | --- |
| Espera por thread remota | 5 segundos por fase |
| Timeout do helper pelo main | 12 segundos |
| Renovação/consulta pelo main | 2 segundos, apenas sessão própria, sem requisição concorrente |
| Atualização da UI | 3 segundos enquanto montada |
| Lease sem controlador | 15 segundos; worker verifica a cada 1 segundo |
| Reconciliação por comando | Até 3 passagens, intervalo de 50 ms |
| Janelas por resposta | Até 256; excesso implica parcial |
| Fila main | Até 8 requisições; excesso é recusado |
| Resposta helper | Até 1 MiB |
| Diagnóstico normal | Transições/comandos explícitos e amostra a cada 60 segundos |
| Retenção | Logger existente: arquivo de 512 KiB e até 5 arquivos rotacionados, sem retenção por data |
| Teste de estabilidade inicial | 120 segundos; timer de reaplicação de 10 ms; recriação a cada ciclo de consulta (~0,7 s medido) |
| Tolerância de recursos nesse teste | Até +16 handles e +16 MiB privados; não é garantia de longo prazo |

Timeout não implica cancelamento da operação remota. O main pode terminar somente o helper que criou. Não libera memória usada por thread remota ainda em execução, não reinstala automaticamente e marca estado desconhecido. Essa escolha pode deixar uma alocação remota de pedido/caminho por operação pendente até o alvo terminar. Não se promete interromper chamada travada no Windows. A transação pode pausar threads; duração de comando medida não equivale a duração de pausa da aplicação.

## Build, testes e distribuição

Pré-requisitos usados: Windows 11 build 26300, Visual Studio 2022 Community/MSVC 19.44.35228, Windows SDK 10.0.26100.0, CMake do Visual Studio, Git, Node 24.14.1. O projeto declara Node >=20.11 e pnpm 10.0.0. O runtime C/C++ é estático (`/MT`); a validação em máquina sem toolchain ainda está pendente.

Na raiz `C:\develop\branches\aiga`:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @aiga/desktop build:capture-compat
corepack pnpm --filter @aiga/desktop typecheck
corepack pnpm --filter @aiga/desktop test
corepack pnpm --filter @aiga/desktop test:capture-compat
corepack pnpm --filter @aiga/desktop test:capture-compat-ui
corepack pnpm --filter @aiga/desktop pack:win
# Instalador, sem publicar:
corepack pnpm --filter @aiga/desktop dist:win
```

`build.ps1` baixa a revisão fixada do repositório oficial na primeira execução e não exige administrador. Ele procura o toolchain por `vswhere`. Os scripts `pack:win`/`dist:win` compilam os nativos obrigatoriamente. Não copie uma DLL de outra versão ao lado de um helper antigo. O fixture é gerado somente em `native/capture-compat/out/x64/Release` e não é incluído em recursos de produção.

Comandos equivalentes usados nesta máquina, aproveitando dependências já instaladas (o Corepack tentou baixar pnpm e encontrou restrição de rede):

```powershell
./apps/desktop/native/capture-compat/build.ps1
node apps/desktop/native/capture-compat/test-native.cjs
Set-Location apps/desktop
./node_modules/.bin/tsc.cmd --noEmit
node --test electron/*.test.cjs
./node_modules/.bin/vite.cmd build
node native/capture-compat/test-ui.mjs
./node_modules/.bin/electron-builder.cmd --win --dir --publish never
```

Saídas: `apps/desktop/release/0.1.0/win-unpacked/AIGA.exe`, binários nativos em `resources/resources/capture-compat/x64`. Evidências locais em `native/capture-compat/out/{native,ui,package}-evidence.json`; cópias versionadas em `docs/evidence/capture-compat/`.

O repositório não contém `apps/desktop/build/icon.ico`, exigido pelo instalador oficial (ver `build/README.md`). Para a entrega local, após `pack:win`, foi gerado um instalador de validação com ícones padrão, **sem modificar a configuração de produção**, pelo comando abaixo em `apps/desktop`. Para release oficial, forneça o ícone correto e a configuração de assinatura existente.

```powershell
node -e 'const b = require("electron-builder"); b.build({ targets: b.Platform.WINDOWS.createTarget("nsis"), prepackaged: "release/0.1.0/win-unpacked", publish: "never", config: { nsis: { installerIcon: null, uninstallerIcon: null, installerHeaderIcon: null } } }).catch(e => { console.error(e); process.exitCode = 1; });'
```

O instalador de validação está em `apps/desktop/release/0.1.0/AIGA Setup 0.1.0.exe`. Sua geração não substitui a execução de T17 em ambiente limpo.

Para validar especificamente os binários do pacote, sem iniciar aplicações de produção:

```powershell
# Em apps/desktop:
$env:CAPTURE_COMPAT_RESOURCES = "$PWD/release/0.1.0/win-unpacked/resources/resources"
$env:CAPTURE_COMPAT_SOAK_SECONDS = '5'
node native/capture-compat/test-native.cjs
Remove-Item Env:CAPTURE_COMPAT_RESOURCES, Env:CAPTURE_COMPAT_SOAK_SECONDS
```

Os testes criam exclusivamente `aiga-capture-fixture.exe`. O teste de UI usa um adaptador de descoberta que fornece essa instância própria; a aplicação empacotada não contém esse adaptador. Os demais componentes testados são os mesmos serviço, preload, IPC, React, helper e DLL da entrega.

## Uso, encerramento e recuperação

1. Abra a aba Captura tela e atualize as instâncias. Confira PID, criação, executável, arquitetura, classes e HWNDs. Processos cuja identidade não possa ser consultada não são candidatos; não há tentativa de elevar privilégios.
2. Selecione explicitamente a instância desejada. A seleção já consulta o estado real, mas não instala nem limpa afinidade. Uma lista antiga não autoriza uma identidade nova.
3. Habilite. Somente **Ativo e verificado** confirma o hook e a afinidade real em zero no conjunto observado. **Parcialmente aplicado** inclui ausência de janelas, excesso de janelas, mudança do conjunto, erro de limpeza ou consulta. `Desconhecida` nunca significa `0x0`.
4. Use Verificar agora para obter nova observação. O heartbeat mantém/reconcilia apenas a sessão própria enquanto o AIGA está aberto. A UI mostra erro numérico por janela, etapa, horário e contador agregado.
5. Desative antes de trocar uma seleção ativa. Desativação não restaura afinidade anterior. A aplicação pode solicitar proteção imediatamente depois, inclusive antes da consulta de resposta.
6. Ao fechar/crashar o AIGA, o lease deixa de ser renovado; a DLL tenta desativar depois de 15 s, verificando a cada 1 s. Falha na transação é retentada pelo worker, sem descarregar a DLL. Ao reabrir, nenhuma identidade/token é restaurada: selecione novamente e consulte. Uma sessão anterior ainda ativa não pode ser reivindicada com novo token; aguarde sua expiração e confira o estado.

Em acesso negado, confira usuário/nível de integridade e instância; não reinicie nem eleve automaticamente. Em arquitetura incompatível, use uma distribuição qualificada para a arquitetura antes de tentar novamente — atualmente só x64 foi entregue. Em falha parcial, consulte os erros por janela. Em timeout, não interprete desaparecimento do helper como reversão: consulte novamente; uma inicialização sem conclusão continua desconhecida. Em conflito de versão, aguarde encerramento natural do alvo e selecione uma nova execução deliberada, sem reinício automático. Fechar o AIGA interrompe renovações, não cancela à força um comando nativo já iniciado.

Os logs do AIGA em `userData/logs/desktop.log` contêm IDs de operação, versões, PID/criação/arquitetura, estado, afinidades, erros e contagens. Não registram tokens, argumentos Java, títulos ou conteúdo das janelas. As listas de candidatos são transitórias. Para coleta de evidências reais, registre hashes somente dos arquivos relevantes autorizados, antes/depois, sem copiar conteúdo sensível.

## Launcher: decisão de escopo

**Não incluído.** Um launcher seria tecnicamente investigável com criação controlada do processo e sequência explícita de inicialização/handshake, mas apenas criar suspenso ou carregar a DLL cedo não comprova que o hook antecede a primeira chamada de todas as threads relevantes. Também faltam a linha de comando real, suas regras de aspas, ambiente e diretório de trabalho autorizados para reproduzir a execução.

Esta entrega atende instalação em processo existente e não anuncia bloqueio da primeira chamada, monitor automático de Java ou alteração do atalho de inicialização do Java. A inclusão futura exige teste de ordem, argumentos, cwd, ambiente, falha de preparação e adesão/reversão explícitas. T20 é não aplicável à entrega atual.

## Referências primárias

- [SetWindowDisplayAffinity](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity)
- [GetWindowDisplayAffinity](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowdisplayaffinity)
- [Microsoft Detours 4.0.1](https://github.com/microsoft/Detours/tree/e4bfd6b03e50de46b47abfbd1e46b384f0c5f833)
- [Using Detours](https://github.com/microsoft/Detours/wiki/Using-Detours)
- [DisableThreadLibraryCalls e CRT estático](https://learn.microsoft.com/en-us/windows/win32/api/libloaderapi/nf-libloaderapi-disablethreadlibrarycalls)
## Ativação quando o Java ocupa a tela

### Diagnóstico de componentes ausentes e janela coberta

O erro `ARTIFACTS_MISSING` / `ENOENT ... manifest.json` significa que a operação não chegou ao Java. Em desenvolvimento, `apps/desktop/resources/capture-compat/x64` é gerada e ignorada pelo Git; clonar ou atualizar somente o código não fornece esses arquivos. Restaure a pasta completa de componentes da mesma distribuição (manifest.json, aiga-capture-helper.exe e aiga-capture-compat.dll), preservando seus hashes. Não crie um manifesto manualmente. A geração apenas dos componentes nativos, quando desejada pelo operador, usa `corepack pnpm --filter @aiga/desktop build:capture-compat`. Nenhum build foi executado durante esta correção.

Ao iniciar, procure `Application ready` (versão, executable, appPath e packaged) e `Capture compatibility artifacts ready` ou `unavailable`. Ao pressionar Ctrl+Shift+J, procure `Capture compatibility shortcut started`, `completed` ou `failed`: o requestId correlaciona a tentativa, e o diagnóstico inclui duração, etapa, código, arquivo ausente e, quando disponível, resultado nativo. Tokens de controle, chaves de API, imagens e conteúdo de conversas não são adicionados a esses eventos.

`AIGA window presentation` registra visible, minimized, alwaysOnTop, focused, bounds e estado do renderer. Esses campos não provam ausência de outra janela sobreposta. O atalho solicita restauração, reinserção no grupo de janelas superiores e foco; a manutenção periódica não rouba foco nem desfaz a ocultação intencional. Eventos unresponsive/responsive ajudam a distinguir falta de atualização de um problema de posição. Compartilhe o trecho desde a inicialização até a falha para correlacionar os eventos. O comportamento visual ainda precisa ser validado com o Java real.

No código atualizado, abra o AIGA antes do Java e use **Ctrl+Shift+J** para habilitar a compatibilidade. A combinação pode ser alterada ou deixada em branco em Configurações → Atalhos. Se estiver ocupada na inicialização, fica em branco e o aplicativo continua abrindo.

O atalho usa a seleção atual; sem seleção, só escolhe se a descoberta retornar exatamente uma instância Java. Com várias instâncias, selecione previamente a desejada. Sem Java aberto, o aviso pede abrir a aplicação e pressionar novamente. Não há monitoramento global ou ativação automática na inicialização. Repetir o atalho com a interceptação ativa apenas verifica seu estado.

Aguarde a mensagem de hook ativo e afinidade real igual a `0x0`, então use o atalho de captura. O resultado da operação aparece na janela principal. O AIGA mantém a renderização em segundo plano e reforça a posição da janela no modo stealth visível, sem roubar o foco do teclado. Ocultação completa, minimização e ocultação durante a captura continuam sendo respeitadas. Uma captura rápida abre o chat para exibir a análise.

Essas mudanças foram verificadas por testes de serviço e TypeScript, sem gerar build. É necessário validar com a aplicação Java real; nenhuma garantia é feita sobre janelas em outro desktop do Windows ou bloqueios do sistema. A análise também depende de um provedor de IA configurado; o erro `AUTH_INVALID_API_KEY` impede a resposta mesmo com captura correta.

A configuração de renderização segue a [documentação oficial do Electron sobre backgroundThrottling](https://www.electronjs.org/docs/latest/api/structures/web-preferences). A atualização de posição usa [setAlwaysOnTop e moveTop](https://www.electronjs.org/docs/latest/api/browser-window), sem chamada periódica a focus.
