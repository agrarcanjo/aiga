# Evidências e pendências — compatibilidade de captura

Data: 8 de outubro de 2026 (America/Sao_Paulo). Resultado: **implementação entregue e validada em fixture próprio; aceite integral ainda pendente**.

## Ambiente e artefatos

- Windows 11 x64, build `10.0.26300`.
- Intel UHD Graphics, driver `32.0.101.6733`; NVIDIA GeForce RTX 2050, driver `32.0.15.9174` (consulta CIM). Não se identificou/qualificou o caminho gráfico efetivo de uma captura, nem alternância entre GPUs.
- MSVC 19.44.35228, SDK 10.0.26100.0, CRT estático, Electron 33.4.11, Node 24.14.1.
- Detours 4.0.1, commit `e4bfd6b03e50de46b47abfbd1e46b384f0c5f833`; helper/DLL 1.0.0, protocolo 1.
- Branch de trabalho `version2`, base `989718acd4725f1678c6d327c44b0991cef87f94`. Nenhum processo Java real foi usado nos testes.
- Arquivos JSON anexos incluem versões, hashes de binários, identidades, HWNDs, valores reais e tempos. São **evidências históricas**, não identificadores para futuras operações.

## Execuções concluídas

1. Compilação nativa x64: passou; helper, DLL e fixture gerados.
2. TypeScript `tsc --noEmit`: passou.
3. Suite `node --test electron/*.test.cjs`: **64 testes passaram**, nenhum falhou. Inclui 12 testes novos de serviço/IPC e 1 de regressão do guard.
4. Vite build: passou.
5. Suite nativa: **16 cenários passaram**, incluindo reaplicações, recriação, escopo entre duas instâncias, token inválido para sessão ativa, arquitetura, identidade, desativação e lease. [Evidência nativa](evidence/capture-compat/native-evidence.json).
6. UI no Electron: passou o fluxo do componente real, preload, IPC, serviço e nativos. A descoberta do teste oferece somente o fixture criado pelo próprio harness. A afinidade real da janela Electron protegida permaneceu **17 (`0x11`) antes/depois** da habilitação no fixture. [Evidência UI](evidence/capture-compat/ui-evidence.json).
7. electron-builder `--win --dir --publish never`: pacote x64 gerado. Binários nativos foram exercitados diretamente a partir de `win-unpacked/resources/resources`; os 16 cenários passaram com ensaio abreviado de 5 s. [Evidência dos binários empacotados](evidence/capture-compat/package-evidence.json). Os hashes do pacote final correspondem aos binários testados. Isso não equivale a instalação/uso em máquina limpa.
8. Instalador NSIS de validação gerado: `apps/desktop/release/0.1.0/AIGA Setup 0.1.0.exe`, 83.203.521 bytes, SHA-256 `882e3bd97564770c768c45d8aff422f73f84c89f1e18989a610503c683780638`. Sem assinatura e com ícone padrão por override apenas no comando de validação. Não foi executado/instalado; a configuração de produção continua exigindo o ícone oficial ausente.

No ensaio nativo final de 120 segundos houve **178 ciclos** de reaplicação/recriação/verificação. Handles: **89 → 89**. Memória privada: **1.474.560 → 1.388.544 bytes**. T01 (consulta inicial + habilitação + consulta final) levou 455 ms; T12 (inclui espera de pausa do fixture e desativação) levou 278 ms. Esses valores são tempos do cenário, não medição isolada da pausa das threads. O hash SHA-256 do executável do fixture permaneceu `fa7835bc3d9efaf81f8857f06b4b8153f99983c563032ca3e6b691fc3c06ea7c` antes/depois. A identidade do mesmo processo foi mantida até seu encerramento natural comandado ao fixture no fim do teste.

## Matriz do plano

Cada cenário executado usa a preparação contida em `test-native.cjs` ou nos testes indicados, com resultados esperados expressos por asserções. Os JSONs registram resultado observado e conclusão. Não há marcação de aprovação para passos não executados.

| ID | Preparação/ação e esperado | Resultado observado / conclusão |
| --- | --- | --- |
| T01 | Fixture aplica 0x11 antes; habilitar e consultar de verdade | Passou: antes 17, depois 0, hook ativo |
| T02 | Timer reaplica 0x11 a cada 10 ms | Passou: contador aumenta; afinidade real permanece zero |
| T03 | Trocar reaplicação para 0x1 | Passou: afinidade zero com hook ativo |
| T04 | Criar segunda janela, destruir/recriar durante atividade | Passou nas passagens controladas; estado baseado no conjunto atual |
| T05 | Duas instâncias do mesmo executável, somente uma selecionada | Passou no fixture: controle mantém 17 e não recebe DLL/hook; duas instâncias **Java reais** não executadas |
| T06 | Guard do AIGA e janela Electron durante atuação no fixture | Passou em unidade e consulta Win32 real antes/depois: 17/17 |
| T07 | Identidade de criação antiga e encerramento do fixture | Passou: recusa/invalidade, sem migração para outro PID; reciclagem efetiva de PID não foi forçada |
| T08 | Arquitetura incompatível; arquivo ausente/corrompido | Passou: recusa nativa x86; testes do serviço recusam artefatos antes de executar helper |
| T09 | Acesso negado/falha de instalação | Passou na simulação do serviço, sem retry/elevação/reinício. Negação de acesso por integridade Windows e falha transacional nativa induzida permanecem não executadas |
| T10 | Consulta desconhecida, afinidade remanescente, erro de limpeza | Passou na simulação: parcial, `null` separado de zero. Falha de API induzida no processo real não executada |
| T11 | Habilitação repetida e concorrente | Passou: idempotência; concorrência nativa devolve operação válida/ocupado; fila main serializa |
| T12 | Pausar reaplicações e desativar em execução | Passou: hook inativo, afinidade segue zero; não restaura 0x11 |
| T13 | Retomar solicitações depois de desativar | Passou: aplicação volta a aplicar 17 |
| T14 | Deixar de renovar token, consultar com novo controlador | Passou: após 17 s hook inativo e aplicação aplicando 17. O fechamento/reabertura completo do executável AIGA não foi automatizado; política foi validada pela interrupção do heartbeat/lease |
| T15 | 120 s, timer 10 ms, recriação a cada ciclo | Passou: 178 ciclos, nenhum aumento de handles/memória ao fim. Sessão de horas/dias e medição de pausas por profiler não executadas |
| T16 | Comparação visual antes/depois | **Não executado**: não há captura comparativa certificada nem qualificação dos dois caminhos de GPU |
| T17 | Distribuição instalada em ambiente sem toolchain | **Parcial**: pacote e instalador de validação gerados, nativos do pacote testados nesta máquina; execução do instalador, instalação limpa e fluxo completo do executável empacotado ainda não executados |
| T18 | Origem IPC, parâmetros e outro controlador da sessão | Passou: frame/window/URL incorretos e campos extras recusados; token distinto não pode habilitar/desativar sessão ativa |
| T19 | Chamada já iniciada termina após primeira limpeza | **Parcial**: há reaplicação concorrente no fixture e reconciliação em até três passagens; não foi induzida deterministicamente uma chamada presa dentro do Windows antes do hook. Não há promessa de recuperar essa chamada |
| T20 | Launcher bloqueia primeira chamada | **Não aplicável**: launcher avaliado e excluído do escopo; nenhuma garantia de primeira chamada anunciada |

Casos adicionais: encaminhamento de afinidade desconhecida, child window, HWND inválido e WDA_NONE comparou retorno/erro com baseline sem hook e passou. Ausência de janelas não gera selo de captura verificada. Erro/timeout remove evidência antiga na UI. Os testes de UI validaram também janela auxiliar IME elegível no processo de teste.

## Pendências do aceite na aplicação Java real

**Implementação validada no aplicativo de teste; critérios referentes à aplicação Java real permanecem pendentes.** Não houve seleção operacional nem injeção em Java de produção. Permanecem todos os passos da etapa 13 do plano:

1. Responsável selecionar uma execução atual, confirmar arquitetura x64, PID/criação/caminho e afinidade inicial.
2. Registrar hashes autorizados dos arquivos relevantes antes/depois.
3. Habilitar nessa execução, comprovar 0x0 nas janelas existentes e registrar horário/erros.
4. Reproduzir ações que solicitam 0x1/0x11 e recriam janelas; observar o contador e consultar afinidade real.
5. Comprovar continuidade da mesma execução e estabilidade durante intervalo operacional acordado.
6. Verificar outra instância Java e as janelas reais do AIGA como controles.
7. Comparar captura antes/depois, registrar mecanismo e caminho gráfico; repetir cenários pertinentes às GPUs disponíveis; testar desativação.
8. Registrar ações não reproduzíveis, janelas inacessíveis, tempo observado, integridade/privilégios e demais limitações.

Também permanecem as partes não executadas de T09, T10, T14, T16, T17 e T19 discriminadas acima. Congelamento geral do Windows exige investigação separada; nenhuma relação causal foi estabelecida por esta entrega.

## Intercorrências e rastreabilidade

- Rede no sandbox impediu consultas/downloads iniciais; Detours e componentes oficiais de empacotamento foram obtidos com execução autorizada fora do sandbox.
- O linker encontrou um arquivo `.lib` gerado que não conseguia substituir após mudança de exports. Foi removido somente esse artefato intermediário; o rebuild e as validações finais passaram.
- Electron não iniciou no sandbox; o harness foi executado fora dele, mantendo contexto isolado, sandbox do renderer e testes restritos aos processos criados pelo próprio teste.
- CIM precisou de execução fora do sandbox para ler GPU/driver. A consulta foi somente leitura.
- A versão local não foi assinada; configuração de certificado não foi adicionada nem alterada. O instalador inicialmente falhou por ausência preexistente de `build/icon.ico`; o instalador de validação usou override para ícones padrão, mantendo os caminhos de produção intactos.

Operação, limites, recuperação, manutenção e decisão do launcher: [capture-compat-windows.md](capture-compat-windows.md).
