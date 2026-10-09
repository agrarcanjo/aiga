# AIGA no Windows — gerar, instalar e abrir

Este guia acompanha o código-fonte em `docs/guia-build-windows.md` e o pacote instalado em `resources/resources/guides/guia-build-windows.md`. A versão 0.1.1 corrige a abertura sem janela quando um atalho global já está ocupado. A documentação específica da compatibilidade Java está em `docs/capture-compat-windows.md` no repositório.

## Executar a versão pronta

Você não precisa de Node, pnpm, Visual Studio ou FFmpeg instalado separadamente para abrir a interface do pacote pronto. Componentes adicionais de áudio/modelos são configurados posteriormente no AIGA.

Há duas formas de execução:

1. **Instalador:** execute `AIGA Setup 0.1.1.exe`, conclua a instalação e abra o atalho AIGA. O instalador local de validação usa ícone padrão e não é assinado.
2. **Pasta distribuível:** copie a pasta **inteira** `win-unpacked`, mantendo DLLs, `resources`, `locales` e demais arquivos. Abra o `AIGA.exe` dentro dessa pasta. Esse executável depende dos arquivos ao lado dele; não copie somente o `.exe`.

O `ffmpeg.dll` ao lado de `AIGA.exe` pertence ao runtime Electron. Instalar o utilitário `ffmpeg.exe` no PowerShell não substitui essa DLL. Se houver mensagem de DLL ausente, restaure o pacote completo da mesma versão.

No repositório desta máquina, o pacote corrigido fica em:

```text
C:\develop\branches\aiga\apps\desktop\release\0.1.1\
    AIGA Setup 0.1.1.exe
    win-unpacked\
        AIGA.exe
        ffmpeg.dll
        resources\
        locales\
```

Exemplo PowerShell para abrir:

```powershell
Set-Location 'C:\develop\branches\aiga\apps\desktop\release\0.1.1\win-unpacked'
Test-Path '.\ffmpeg.dll'  # Deve retornar True
.\AIGA.exe
```

O AIGA opera por padrão com proteção de captura e modo stealth: sua janela pode não aparecer na barra de tarefas nem em compartilhamento de tela. Observe primeiro na tela local do Windows. Abrir novamente o executável da versão corrigida traz a janela da instância existente para frente, sem criar outra sessão e preservando a proteção.

## Pré-requisitos para compilar a partir do código-fonte

- Windows x64 e acesso ao repositório AIGA.
- Node.js >=20.11, Corepack/pnpm 10.0.0 e Git.
- Visual Studio 2022 Community ou Build Tools com o workload **Desenvolvimento para desktop com C++**.
- No instalador do Visual Studio, incluir **MSVC v143**, **Windows 10/11 SDK** e **Ferramentas CMake do C++ para Windows**. O script usa o CMake encontrado pelo `vswhere`.
- Acesso à internet para dependências do pnpm, revisão fixa do Microsoft Detours e ferramentas oficiais do electron-builder na primeira execução.

Não é preciso executar o AIGA como administrador. A instalação dos próprios pré-requisitos segue o instalador de cada ferramenta.

## Gerar a pasta com o executável

Feche as sessões de teste do AIGA antes de substituir os arquivos de um pacote em uso. Na raiz do código-fonte, execute os comandos individualmente; avance somente se o comando anterior terminar com sucesso:

```powershell
Set-Location 'C:\develop\branches\aiga'
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm test
corepack pnpm pack:win
```

`pack:win` compila helper/DLL x64, compila a interface com Vite e executa electron-builder. A pasta de saída usa a versão de `apps/desktop/package.json`; para a versão corrigida é `apps/desktop/release/0.1.1/win-unpacked`.

`corepack pnpm build` compila somente a interface; não gera o pacote Electron completo.

Se o Corepack não estiver disponível, instale-o no ambiente Node utilizado e reabra o terminal:

```powershell
npm install --global corepack
```

Se o script não encontrar `pnpm`, habilite os shims no seu ambiente Node ou utilize os comandos individuais abaixo, que evitam a chamada de pnpm dentro de outro script:

```powershell
# Na raiz do repositório:
corepack pnpm --filter @aiga/desktop run build:capture-compat
corepack pnpm --filter @aiga/desktop run build
corepack pnpm --filter @aiga/desktop exec electron-builder --win --dir --publish never
```

## Gerar o instalador .exe

Para o instalador com ícone oficial, coloque um ICO válido em `apps/desktop/build/icon.ico` e execute na raiz:

```powershell
corepack pnpm dist:win
```

O repositório atual não inclui esse ícone. Para gerar o **instalador de validação com ícone padrão**, sem alterar a configuração de produção, primeiro gere `win-unpacked` com `pack:win` e depois execute:

```powershell
Set-Location 'C:\develop\branches\aiga\apps\desktop'
node scripts/build-validation-installer.cjs
```

Saída: `apps/desktop/release/0.1.1/AIGA Setup 0.1.1.exe`. A compilação local funciona sem certificado; assinatura de release utiliza a configuração de certificado já prevista no projeto.

Também existe um comando único, na raiz, que compila a pasta e gera esse instalador de validação:

```powershell
Set-Location 'C:\develop\branches\aiga'
corepack pnpm dist:win:validation
```

Com Node.js 22+ você pode testar automaticamente a **aplicação empacotada inteira**, depois de `pack:win`:

```powershell
corepack pnpm test:pack:win
```

Esse teste usa perfis separados dentro de `apps/desktop/out`, verifica a janela e a interface renderizada, simula um atalho global ocupado e confirma a ativação da instância existente. Ele não seleciona nem altera processos Java.

## Quando o AIGA fica em execução sem janela

Na versão 0.1.0, um atalho ocupado, por exemplo `Ctrl+E`, podia abortar a inicialização antes da criação da janela. O processo ficava ativo sem janela. A versão 0.1.1:

- Abre a janela mesmo se algum atalho não puder ser registrado.
- Mantém os demais atalhos disponíveis; o indisponível fica registrado no diagnóstico e pode ser alterado em Configurações → Atalhos.
- Reutiliza a instância existente quando o executável é aberto novamente.
- Mostra uma mensagem com caminho de diagnóstico quando ocorre uma falha na inicialização ou no carregamento da interface.

Para trocar uma versão antiga que ficou presa, encerre **somente o AIGA** no Gerenciador de Tarefas e abra o pacote corrigido. Não é necessário reiniciar o Java ou o Windows.

Se a versão corrigida ainda não abrir na máquina de teste, execute na pasta `win-unpacked`:

```powershell
$env:DESKTOP_LOG_LEVEL = 'debug'
$startupLog = Join-Path $PWD 'AIGA-startup.log'
.\AIGA.exe --enable-logging --log-file="$startupLog"
```

O log principal, no perfil padrão, fica em:

```text
%APPDATA%\@aiga\desktop\logs\desktop.log
```

Se o logger falhar antes de inicializar, o AIGA tenta escrever `startup-error.log` nessa mesma pasta. Um perfil de diagnóstico separado permite conferir se a falha depende da configuração antiga, sem apagá-la:

```powershell
$diagnosticProfile = Join-Path $env:TEMP ('AIGA-diagnostico-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $diagnosticProfile | Out-Null
.\AIGA.exe --user-data-dir="$diagnosticProfile" --enable-logging --log-file="$startupLog"
```

Nesse caso, o log principal estará em `$diagnosticProfile\logs\desktop.log`. Para suporte, informe se o processo permanece ativo, o tipo de visualização (local/remota), a versão testada e as últimas linhas do log. Não envie arquivos de configuração com credenciais.
