# Validação da abertura no Windows — AIGA 0.1.1

Executada em 8 de outubro de 2026, no Windows x64 deste ambiente.

## Falha reproduzida

Com Ctrl+E reservado por outro processo de teste, o pacote 0.1.0 falhava ao registrar o atalho antes de criar a janela. O processo continuava ativo sem interface e sem mensagem para o usuário. Evidência: [before.json](evidence/startup-windows/before.json).

## Correção e verificação

- A inicialização tolera atalhos indisponíveis e registra o diagnóstico; alterações explícitas de atalhos continuam indicando conflitos.
- Uma segunda abertura ativa a janela da instância existente.
- Falhas de inicialização ou carregamento da interface apresentam mensagem com o caminho de diagnóstico.
- O pacote inclui o guia de build e execução em `resources/resources/guides/guia-build-windows.md`.

Os 70 testes de `node --test electron/*.test.cjs` passaram. Typecheck, build da interface, build nativo e empacotamento Windows foram concluídos.

O teste `node scripts/test-packaged-startup.cjs` executou o AIGA.exe 0.1.1 empacotado com perfis isolados e confirmou interface renderizada e janela visível na abertura normal e com Ctrl+E ocupado. Também confirmou a ativação da primeira janela pela segunda execução e a inclusão do guia. Nas duas aberturas, a afinidade real da janela permaneceu 17 (`WDA_EXCLUDEFROMCAPTURE`). Evidência: [after.json](evidence/startup-windows/after.json).

Foi gerado `apps/desktop/release/0.1.1/AIGA Setup 0.1.1.exe`, com ícone padrão e sem assinatura, pelo script de instalador de validação. O teste executou a aplicação de `win-unpacked`; não realizou instalação na máquina externa do usuário. Nenhum processo Java foi selecionado ou alterado. A validação de compatibilidade com a aplicação Java real continua dependendo desse ambiente.

Instruções: [guia-build-windows.md](guia-build-windows.md).
