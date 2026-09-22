# Plano — APIs unificadas e roteamento inteligente de modelos

> Estado: primeira versão funcional implementada; avaliação comparativa e promoção do Auto permanecem contínuas.  
> Revisão: 2026-09-21.

## 1. Decisão recomendada

Unificar **API Gemini** e **Provedores IA** em uma única aba chamada **IA e modelos**. Evoluir o roteamento atual em duas camadas independentes:

1. **Perfil escolhido pelo usuário:** Auto, Leve, Balanceado, Alto ou Personalizado.
2. **Política por atividade:** ASK textual, screenshot, áudio, resumo de reunião, classificador de pergunta e tradução.

O modo Auto deve começar com regras determinísticas baseadas em metadados que o AIGA já possui. Não deve fazer uma chamada adicional a um LLM classificador, pois isso acrescentaria custo, latência e um novo ponto de falha antes de cada resposta.

## 2. Diagnóstico do sistema atual

### O que já existe

- Providers Gemini, OpenAI, Anthropic e local.
- API keys cifradas e mantidas no processo principal.
- Teste de conexão por provider/modelo.
- Modelo padrão por provider.
- Rotas separadas para `ask`, `meetingSummary`, `meetingActiveClassifier` e `translation`.
- Modos cloud, local e híbrido.
- Orçamento e registro parcial de tokens.

### Redundâncias e inconsistências

| Achado | Impacto |
|---|---|
| Abas `API Gemini` e `Provedores IA` editam o mesmo domínio | Confusão e dois fluxos de configuração. |
| A lista de modelos está duplicada na UI e no main process | Catálogos podem divergir. |
| Ao trocar apenas o provider do ASK, o `modelId` anterior pode permanecer | Risco de enviar um ID Gemini ao provider OpenAI/Anthropic. |
| `GEMINI_MODEL` ainda funciona como fallback de boot | A fonte efetiva do modelo não fica clara ao usuário. |
| O `ProviderRouter` ainda recebe uma chave genérica do fluxo legado | Decisões de disponibilidade podem divergir da rota efetiva. |
| OpenAI usa Chat Completions, enquanto a linha atual é apresentada oficialmente na Responses API | Limita evolução consistente de reasoning, uso e novos modelos. |
| O endpoint de modelos devolve IDs/disponibilidade, não descrições editoriais completas | A UI precisa de catálogo curado próprio, combinado com disponibilidade real da conta. |
| Uso visual e algumas respostas em streaming não são contabilizados de forma confiável | Ainda não é possível provar economia por perfil. |

## 3. Nova interface “IA e modelos”

### 3.1 Seção: estratégia global

Campo **Estratégia de modelo**:

| Opção | Semântica |
|---|---|
| **Auto (recomendado)** | O sistema escolhe uma rota compatível com a atividade, modalidade, tamanho e complexidade estimada. |
| **Leve** | Prioriza menor latência/custo entre modelos compatíveis habilitados. |
| **Balanceado** | Prioriza qualidade suficiente com custo moderado. |
| **Alto** | Prioriza qualidade/raciocínio; aceita maior custo e latência. |
| **Personalizado** | Usa exatamente as rotas definidas pelo usuário para cada atividade. |

Complementos:

- Preferência de provider: `Sem preferência`, `OpenAI`, `Gemini`, `Anthropic`, `Local`.
- Permitir fallback: sim/não.
- Limite de custo/tokens por sessão.
- Mostrar a rota escolhida na resposta: `OpenAI · modelo X · Auto/visual`.

### 3.2 Seção: provedores e credenciais

Um card por provider:

- Ativo/inativo.
- Status da chave, sem revelar o valor salvo.
- Campo para substituir ou remover a chave.
- Botão **Testar conexão**.
- Botão **Atualizar modelos disponíveis**.
- Data/hora da última sincronização e mensagem de erro.

A antiga aba `API Gemini` deve desaparecer. Sua rota interna pode ser temporariamente redirecionada para `ia` durante uma versão para não quebrar atalhos existentes.

### 3.3 Seção: catálogo de modelos

Cada opção deve exibir:

```text
Nome amigável
model-id
Descrição curta
Velocidade: rápida | média | lenta
Custo relativo: baixo | médio | alto
Capacidades: texto | visão | áudio | reasoning
Disponibilidade: disponível na conta | não verificado | indisponível
```

O catálogo deve ser híbrido:

1. **Metadados curados e versionados no AIGA:** descrição, tier, modalidades, contexto e status recomendado/deprecated.
2. **Disponibilidade consultada no provider:** filtra ou marca IDs realmente acessíveis à chave/conta.
3. **Entrada manual avançada:** permite testar um ID ainda não presente no catálogo, sem declará-lo automaticamente compatível.

Para OpenAI, `GET /v1/models` deve ser chamado somente pelo main process. A resposta indica IDs e disponibilidade, mas as descrições permanecem no catálogo curado.

### 3.4 Modelos OpenAI iniciais

O catálogo deve ser configurável e não depender de enum compilado na UI. Como baseline atual:

| Modelo | Papel sugerido no AIGA |
|---|---|
| `gpt-5.6-luna` | Leve: classificação, resumo curto, tradução e perguntas simples de alto volume. |
| `gpt-5.6-terra` | Balanceado: ASK geral e análise de screenshots com boa relação qualidade/custo. |
| `gpt-5.6-sol` | Alto: problemas técnicos, código, contexto ambíguo e resumos complexos. |
| `gpt-6-astra` | Escalação excepcional: tarefas de maior dificuldade em que o ganho de qualidade justifique custo/latência. |

Todos devem ser confirmados contra a disponibilidade retornada para a conta do usuário. O usuário não deve receber a impressão de que uma assinatura ChatGPT inclui créditos de API; a API utiliza credencial e faturamento próprios da plataforma.

## 4. Arquitetura proposta

```text
UI “IA e modelos”
        │
        ▼
LlmSettingsStore
  ├─ providers + secrets
  ├─ model catalog/cache
  ├─ selection profile
  └─ custom routes
        │
        ▼
SmartModelRouter
  ├─ TaskClassifier determinístico
  ├─ CapabilityFilter
  ├─ PolicyResolver
  ├─ Availability/Privacy/BudgetFilter
  └─ FallbackPlanner
        │
        ▼
ProviderRegistry
  ├─ OpenAI Responses
  ├─ Gemini
  ├─ Anthropic
  └─ Local
```

### Novos contratos

```ts
type ModelSelectionProfile = "auto" | "light" | "balanced" | "high" | "custom";

type TaskKind =
  | "simple_text"
  | "complex_reasoning"
  | "code"
  | "screenshot_general"
  | "screenshot_code"
  | "screenshot_error"
  | "audio_question"
  | "meeting_summary"
  | "meeting_classifier"
  | "translation";

interface ModelCatalogEntry {
  providerId: "openai" | "gemini" | "anthropic" | "local";
  modelId: string;
  label: string;
  description: string;
  tier: "light" | "balanced" | "high";
  modalities: Array<"text" | "image" | "audio">;
  reasoning: boolean;
  relativeLatency: "low" | "medium" | "high";
  relativeCost: "low" | "medium" | "high";
  lifecycle: "recommended" | "available" | "deprecated";
}
```

### Resolução da rota

Ordem obrigatória:

1. Respeitar `forceLocalOnly` e consentimento de cloud.
2. Classificar a atividade sem chamada externa.
3. Determinar modalidades obrigatórias.
4. Aplicar perfil Auto/Leve/Balanceado/Alto/Personalizado.
5. Remover providers desabilitados, sem chave ou modelos indisponíveis.
6. Aplicar budget e limite de latência.
7. Escolher rota primária e fallback compatível.
8. Registrar a decisão e o motivo.

## 5. Política inicial para o modo Auto

| Atividade detectada | Tier inicial | Motivo |
|---|---|---|
| Pergunta curta, reescrita ou resumo simples | Leve | Baixa necessidade de raciocínio. |
| Screenshot de UI/documento | Balanceado com visão | OCR e interpretação visual exigem capacidade multimodal, mas normalmente não reasoning máximo. |
| Screenshot de erro/stack trace | Balanceado; escalar se resposta falhar | Combina OCR com diagnóstico. |
| Screenshot de algoritmo/código | Alto | Exige visão, correção de código e raciocínio. |
| Screenshot de questão de prova AWS | Alto | Enunciados e alternativas costumam conter distinções sutis entre serviços, limites e arquiteturas; priorizar precisão sobre economia. A detecção usa contexto textual explícito (`AWS`, certificação, Solutions Architect etc.) ou seleção manual da atividade. |
| Código ou pergunta técnica complexa | Alto | Custo de resposta errada é maior. |
| Áudio já transcrito com pergunta simples | Leve ou Balanceado | O STT é uma etapa separada; o texto final pode ser barato. |
| Classificador de pergunta em reunião | Leve | Alta frequência e saída curta/estruturada. |
| Resumo final de reunião curta | Balanceado | Precisa coerência e extração de decisões. |
| Reunião longa/ambígua | Alto | Contexto extenso e maior risco de omissões. |
| Tradução ao vivo | Leve, baixa latência | Velocidade é mais importante que reasoning profundo. |

### Sinais determinísticos de complexidade

- Preset resolvido (`screenshot-analysis`, `error-diagnosis`, `code-solver`).
- Presença e quantidade de screenshots/áudio.
- Tamanho do prompt e contexto acumulado.
- Presença de stack trace, blocos de código, restrições e solicitação de comparação/arquitetura.
- Tipo de feature já conhecido pelo chamador.
- Tamanho da transcrição e quantidade de participantes/bookmarks.

Não usar palavras isoladas como único critério. A decisão deve ser explicável, por exemplo:

```json
{
  "profile": "auto",
  "taskKind": "screenshot_code",
  "selected": { "providerId": "openai", "modelId": "gpt-5.6-sol" },
  "reason": ["image_required", "code_detected", "high_accuracy_policy"],
  "fallback": { "providerId": "gemini", "modelId": "..." }
}
```

## 6. Vale a pena?

### Sim, para este produto

O AIGA já possui atividades bem delimitadas e com perfis muito diferentes. Tradução/classificação são frequentes, curtas e sensíveis a latência; diagnóstico, algoritmo e código são menos frequentes, mas penalizam fortemente uma resposta incorreta. Essa assimetria favorece roteamento por tarefa.

### Onde está a economia

- Usar modelos leves em eventos frequentes reduz custo por entrada/saída.
- Reduzir reasoning em tarefas simples diminui tempo até a resposta.
- O recorte de screenshots já reduz bytes e potencialmente tokens visuais.
- Evitar uma chamada classificadora mantém o Auto praticamente sem overhead.

### Onde pode não compensar

- Roteamento errado pode exigir retry em modelo forte, custando mais e demorando mais do que começar nele.
- Catálogo e lifecycle dos modelos exigem manutenção.
- Fallback entre providers pode produzir comportamento/prompting diferente.
- Sem token usage visual e métricas de latência por modelo, “economia” seria apenas hipótese.

Conclusão: implementar, mas começar com poucas regras conservadoras e telemetria. O Auto deve preferir Balanceado e descer para Leve apenas em tarefas claramente simples; Alto deve ser usado quando os sinais de risco forem fortes.

## 7. Telemetria e avaliação necessárias

Registrar por requisição, sem prompt bruto nem segredo:

- feature e `taskKind`;
- perfil solicitado;
- provider/modelo selecionado e motivo;
- modalidade, quantidade de anexos, pixels/bytes de imagens;
- tempo até primeiro token e duração total;
- tokens de entrada, saída, reasoning e cache quando disponíveis;
- erro, fallback e retry;
- avaliação do usuário (`útil`/`não útil`) e correção manual opcional.

Métricas de decisão:

| Métrica | Meta inicial sugerida |
|---|---|
| Qualidade Auto vs Alto | ≥ 95% da taxa de sucesso do perfil Alto |
| Redução de custo Auto vs Alto | ≥ 25% |
| Redução de P50 em tarefas simples | ≥ 20% |
| Fallback/retry causado por roteamento | < 5% |
| Rota incompatível com modalidade | 0% |

Criar um conjunto de avaliação com 20–30 casos por categoria. Primeiro medir tudo com Alto para estabelecer qualidade de referência; depois comparar Balanceado e Leve. Essa ordem segue a recomendação oficial de otimizar precisão antes de custo/latência.

## 8. Plano de entrega

### Fase 0 — Correções de base

- Remover a aba Gemini duplicada e migrar seu estado para `IA e modelos`.
- Fazer route armazenar sempre o par atômico `{providerId, modelId}`.
- Remover fallback silencioso para chave Gemini quando outra rota foi escolhida.
- Fazer disponibilidade da chave ser resolvida no registry, não no IPC legado.
- Definir precedência clara: `forceLocalOnly` > política persistida > `.env` como override explícito de operação.
- Testar migração de settings existentes.

Critério de aceite: alternar Gemini/OpenAI/Anthropic nunca envia modelo ou chave de outro provider.

### Fase 1 — OpenAI funcional e catálogo unificado

- Substituir o adapter OpenAI Chat Completions por Responses API.
- Salvar/testar/remover chave OpenAI pela interface unificada.
- Implementar `listModels()` no contrato dos providers.
- Criar catálogo curado no main process, sem duplicação na UI.
- Cruzar catálogo com modelos disponíveis para a conta.
- Exibir descrições, capacidades e lifecycle.

Critério de aceite: usuário configura chave, atualiza modelos, escolhe um modelo compatível e conclui ASK textual e visual.

### Fase 2 — Perfis manuais

- Implementar Leve, Balanceado, Alto e Personalizado.
- Definir matriz por provider/tier em configuração.
- Mostrar provider/modelo efetivamente utilizado na timeline.
- Registrar latência e usage real.

Critério de aceite: cada perfil produz uma rota previsível e auditável.

### Fase 3 — Auto determinístico

- Criar `TaskClassifier` local e síncrono.
- Implementar filtros de modalidade, privacidade, disponibilidade e budget.
- Adicionar plano de fallback e motivo de decisão.
- Criar testes de tabela para todas as categorias.

Critério de aceite: zero chamadas extras para roteamento e zero modelo incompatível.

### Fase 4 — Avaliação e ajuste

- Executar dataset de avaliação.
- Comparar Auto, Leve, Balanceado e Alto.
- Ajustar thresholds somente com evidência.
- Considerar escalonamento automático após erro/baixa confiança apenas se o ganho superar o custo.

## 9. Testes obrigatórios

- Migração da chave Gemini legada sem perda.
- API key nunca atravessa preload/renderer nem logs.
- Troca de provider atualiza modelo de forma atômica.
- Modelo indisponível é bloqueado antes da requisição.
- Screenshot nunca usa modelo sem visão.
- `forceLocalOnly` vence todos os perfis.
- Personalizado respeita exatamente a rota salva.
- Auto não faz chamada classificadora.
- Fallback não repete resposta parcial no chat.
- Usage e latência são associados ao provider/modelo correto.
- Catálogo remoto indisponível usa cache curado com status “não verificado”.

## 10. Ordem de prioridade

1. Fase 0 — corrigir consistência atual.
2. Fase 1 — consolidar UI e tornar OpenAI plenamente testável.
3. Fase 2 — oferecer controle explícito ao usuário.
4. Coletar baseline por algumas sessões.
5. Fase 3 — ativar Auto inicialmente como beta/feature flag.
6. Fase 4 — promover Auto a padrão somente após atingir as metas.

## 11. Estimativa de complexidade

| Entrega | Complexidade | Estimativa |
|---|---|---|
| Unificação de UI + correções de rota | Média | 2–4 dias |
| OpenAI Responses + catálogo/disponibilidade | Média-alta | 3–5 dias |
| Perfis manuais e indicação na timeline | Média | 2–4 dias |
| Auto determinístico + fallback | Alta | 4–7 dias |
| Telemetria, dataset e avaliação | Alta/contínua | 5–10 dias iniciais |

Estimativa total para uma primeira versão sólida: **3–5 semanas**, incluindo testes e avaliação, sem contar tempo de coleta de feedback real.

## 12. Entrega implementada

- Aba única **IA e modelos**, removendo a configuração Gemini duplicada.
- Catálogo centralizado com nome, descrição, tier, modalidades, custo e latência relativos.
- OpenAI migrado para Responses API com texto, screenshot, streaming, reasoning por perfil e usage real quando retornado.
- Atualização de modelos disponíveis na conta por provider (`GET /v1/models` para OpenAI).
- Estratégias Auto, Leve, Balanceado, Alto e Personalizado.
- Personalizado por modelo fixo ou por atividade conhecida.
- Auto determinístico, sem chamada adicional, com filtros de modalidade/provider/chave.
- Questões AWS por screenshot classificadas como tier Alto quando o texto/contexto explicita AWS; também disponíveis como atividade manual.
- Composer com seletor embutido, microfone e botão azul de envio contextual.
- Provider, modelo e perfil efetivamente usados exibidos abaixo da resposta.

Ainda dependem de uso real: dataset de avaliação, métricas agregadas de custo/latência e ajuste dos thresholds do Auto.
