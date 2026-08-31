# Detecção de ferramentas assistivas ocultas durante compartilhamento de tela

Documento de estratégia e requisitos para desenvolver um sistema que permita a um **observador remoto** (instrutor, entrevistador, proctor) avaliar se a pessoa que compartilha a tela está usando ferramentas de assistência oculta — como overlays de IA, captura de tela com análise automática ou atalhos globais — durante um teste ou avaliação.

**Escopo:** defesa de integridade de provas entrevistas técnicas e avaliações remotas.  
**Referência interna:** comportamento conhecido do AIGA (Electron, stealth, content protection, captura Ctrl+E).  
**Última atualização:** 2026-05-19

---

## 1. Objetivo e premissas

### 1.1 Objetivo

Reduzir a probabilidade de que candidatos usem, sem detecção, ferramentas que:

- exibem respostas ou dicas sobrepostas à tela;
- capturam a tela e enviam para um LLM externo;
- transcrevem áudio da prova e retornam sugestões;
- permanecem invisíveis ou parcialmente invisíveis no fluxo de screen share.

### 1.2 Premissas críticas

| Premissa | Implicação |
|----------|------------|
| O observador recebe apenas **vídeo do compartilhamento** (Zoom, Meet, Teams, WebRTC) | Detecção **visual pura é insuficiente** para ferramentas bem implementadas |
| Ferramentas modernas usam **content protection** e **janela oculta** | Overlay pode **não aparecer** no stream remoto |
| Detecção confiável exige **consentimento** e, idealmente, **agente no endpoint** do candidato | Modelo “só olhar o share” tem teto baixo de eficácia |
| Objetivo é **integridade da avaliação**, não vigilância genérica | Políticas, consentimento e minimização de dados são obrigatórios |

---

## 2. Modelo de ameaça (Threat Model)

### 2.1 Classes de ferramenta

| Classe | Exemplo de comportamento | Exemplo (AIGA) |
|--------|--------------------------|----------------|
| **Overlay assistivo** | Janela flutuante, semi-transparente, always-on-top | Modo stealth (`setAlwaysOnTop`, opacidade ~90%) |
| **Overlay totalmente oculto** | App lógico ativo, janela `hide()` | Full stealth (`Ctrl+Shift+H`) |
| **Captura + IA** | Print da tela → LLM → resposta no chat local | Captura `Ctrl+E` + preset `screenshot-analysis` |
| **Áudio + IA** | Gravação push-to-talk → transcrição + LLM | `Ctrl+D` + preset `audio-analysis` |
| **Atalhos globais** | Ações sem foco na janela da prova | `globalShortcut` Electron |
| **Anti-captura** | Janela excluída de screen share / gravação | `setContentProtection(true)` (Windows/macOS) |
| **Genérico** | Segunda máquina, celular, outra pessoa | Fora do escopo deste doc (controle ambiental) |

### 2.2 Vetores que o observador remoto **não** vê (limitação estrutural)

- Processo Electron/AIGA em execução com janela oculta.
- Tráfego HTTPS para APIs de LLM (Gemini, OpenAI, etc.).
- Janela com content protection **efetiva** no pipeline de captura do SO.
- Respostas renderizadas apenas em monitor secundário (se share for “janela da prova”).

### 2.3 Vetores que o observador remoto **pode** ver (sinais fracos)

- Flash rápido da janela ao capturar tela (hide → capture → restore).
- Overlay semi-transparente se content protection falhar no caminho Meet/Zoom/Teams.
- Barra de ferramentas / ícones se candidato compartilha **tela inteira** em vez de janela.
- Comportamento: pausas regulares, olhar para canto fixo da tela, digitação em padrão “colar resposta”.
- Cursor ou foco alternando para janela não compartilhada (algumas plataformas mostram indicador).

---

## 3. Estratégias de detecção (camadas)

Adotar **defesa em profundidade**. Nenhuma camada isolada é suficiente.

### Camada A — Somente observador remoto (sem agente no PC do candidato)

**Eficácia:** baixa a média. Útil como triagem, não como prova definitiva.

| Estratégia | Descrição | Detecta AIGA? |
|------------|-----------|---------------|
| **A1. Política de compartilhamento** | Exigir share de **tela inteira** ou **monitor único**, não só janela do browser | Parcial (overlay pode ainda sumir) |
| **A2. Inspeção visual guiada** | Checklist ao vivo: taskbar, systray, cantos da tela, alt-tab pedido | Parcial (full stealth oculto) |
| **A3. Análise de vídeo (ML)** | Modelo em frames do share: overlays, janelas estranhas, transparência | Parcial, muitos falsos positivos |
| **A4. Análise comportamental** | Latência entre enunciado e resposta, padrão de olhar, micro-pausas | Indireto |
| **A5. Prova “cola” no conteúdo** | Watermark único por sessão no enunciado; resposta idêntica a outro candidato | Não detecta tool; detecta uso de IA |
| **A6. Desafio dinâmico** | Perguntas geradas na hora, follow-up oral | Reduz valor da captura prévia |

**Requisitos mínimos (Camada A):**

- Gravação opcional do stream recebido (com consentimento).
- Checklist operacional para o observador (ver §7).
- Score de risco heurístico (não binário “culpado/inocente”).

---

### Camada B — Agente leve no endpoint do candidato (recomendado para testes formais)

**Eficácia:** alta. Modelo alinhado a Pearson OnVUE / Browser Lock.

| Estratégia | Descrição |
|------------|-----------|
| **B1. Inventário de processos** | Listar executáveis conhecidos (`AIGA.exe`, Electron genérico, overlays) antes e durante prova |
| **B2. Inventário de janelas** | Enumeração Win32: janelas `WS_EX_TOPMOST`, `WS_EX_LAYERED`, título/classe |
| **B3. Bloqueio de lançamento** | Impedir start de apps não allowlisted durante sessão |
| **B4. Monitor de atalhos globais** | Hook de teclado low-level (com consentimento) para sequências suspeitas |
| **B5. Monitor de captura de tela** | Detectar APIs `BitBlt`, `Desktop Duplication`, `PrintScreen`, `desktopCapturer` |
| **B6. Monitor de rede** | Domínios de LLM (`generativelanguage.googleapis.com`, `api.openai.com`, etc.) durante prova |
| **B7. Integridade do desktop** | Single monitor, sem VM, sem RDP ativo |
| **B8. Secure browser** | Prova roda dentro de container; resto do SO bloqueado |

**Requisitos mínimos (Camada B):**

- Instalador assinado + system test pré-prova.
- Comunicação cifrada agente ↔ servidor de proctoring.
- Lista de bloqueio atualizável (IOC: hash, nome, certificado, padrão de janela).
- Modo “só auditoria” vs “bloqueio hard” configurável.

---

### Camada C — Plataforma de proctoring integrada (produto completo)

Combina B + webcam + identidade + sala + gravação + revisão humana.

| Componente | Função |
|------------|------|
| Check-in biométrico / ID | Quem está na prova |
| Room scan | Ambiente físico |
| Stream câmera + tela | Proctor humano ou IA |
| Agente + lockdown | B1–B8 |
| Pós-prova | Revisão de flags, appeal |

---

## 4. Sinais específicos contra ferramentas estilo AIGA

Use como **indicadores** (IOCs), não como acusação automática.

### 4.1 Processo e binário

| IOC | Detalhe |
|-----|---------|
| Nome do processo | `AIGA.exe`, `electron.exe` com `--user-data-dir` apontando para perfil AIGA |
| Caminho de instalação | `%LOCALAPPDATA%\Programs\aiga\` ou similar |
| Assinatura digital | Thumbprint do publisher (quando existir build assinado) |
| Linha de comando | `--enable-features`, preload Electron, `VITE_DEV_SERVER_URL` (dev) |

### 4.2 Janela (Windows)

| IOC | API / técnica |
|-----|----------------|
| Always-on-top | `GetWindowLong(GWL_EXSTYLE) & WS_EX_TOPMOST` |
| Layered / transparente | `WS_EX_LAYERED`, `SetLayeredWindowAttributes` |
| Content protection | Comportamento: janela visível localmente mas ausente em captura legítima do share |
| Sem frame | `WS_POPUP` + tamanho pequeno (~400×300) típico de overlay |
| Título | `"AIGA"` |

### 4.3 Comportamento temporal (correlacionar com vídeo)

| Evento agente | Evento no share |
|---------------|-----------------|
| Processo captura screenshot | Flash ~150 ms de sumiço de overlay; ou mudança súbita no frame |
| Pico de rede pós-captura | Candidato digita/colapsa resposta 5–30 s depois |
| Atalho global registrado | Mesmo timestamp em hook de teclado |

### 4.4 Rede

| Destino | Motivo |
|---------|--------|
| `*.googleapis.com` (Gemini) | ASK / análise de imagem |
| `api.openai.com` | Idem |
| `api.anthropic.com` | Idem |
| WebSocket / SSE long-lived durante prova | Streaming de resposta LLM |

### 4.5 O que **não** confiar como único sinal

- Ausência de janela visível no share (full stealth).
- Uso legítimo de IDE, Discord, Notion (falsos positivos).
- Electron usado por Slack, VS Code, etc. (exige allowlist).

---

## 5. Requisitos funcionais (RF)

### RF-01 — Sessão de observação

- Criar sessão com ID, candidato, observador, janela de tempo, política (A/B/C).
- Registrar consentimento explícito (texto + timestamp + versão da política).

### RF-02 — Ingestão de screen share

- Conectar a Zoom / Meet / Teams via bot ou extensão **ou** receber WebRTC direto.
- Buffer de frames (1–5 fps para ML; full fps para gravação opcional).

### RF-03 — Checklist guiado (Camada A)

- Passos obrigatórios antes de iniciar prova: tela inteira, fechar apps, mostrar taskbar, etc.
- Observador marca pass/fail por item; sistema calcula score.

### RF-04 — Agente endpoint (Camada B)

- System test pré-prova (compatibilidade OS, rede, monitor único).
- Snapshot de processos/janelas no T0 e periodicamente (ex.: a cada 30 s).
- Alertas em tempo real para observador: `{ severity, ioc_id, evidence }`.

### RF-05 — Motor de regras (IOC)

- Base de assinaturas versionada (YAML/JSON): processos, títulos, classes, hashes, domínios.
- Score composto: `risk_score = Σ peso_i × match_i`.
- Limiares configuráveis: `watch`, `warn`, `block`.

### RF-06 — Correlação vídeo ↔ agente

- Timeline unificada (UTC): frame anomalies + process start + network + hotkey.
- Export para revisão humana (não auto-desqualificar só por ML).

### RF-07 — Relatório pós-sessão

- PDF/JSON: checklist, alertas, trechos de vídeo marcados, processos detectados.
- Recomendação: `clear` | `review` | `integrity_violation_suspected`.

### RF-08 — Modo prova segura (opcional)

- Launcher que fecha apps não permitidos e só então abre URL da prova.
- Equivalente simplificado ao Browser Lock (Pearson).

---

## 6. Requisitos não funcionais (RNF)

| ID | Requisito |
|----|-----------|
| RNF-01 | **Privacidade (LGPD/GDPR):** minimizar dados; retenção configurável; DPIA documentado |
| RNF-02 | **Consentimento informado** antes de agente, gravação ou monitoramento de rede |
| RNF-03 | **Latência** de alerta ≤ 3 s (agente → observador) |
| RNF-04 | **Disponibilidade** do serviço de proctoring ≥ 99,5% em janelas de prova |
| RNF-05 | **Falsos positivos** ≤ 5% em ambiente de teste calibrado (métrica alvo) |
| RNF-06 | **Atualização de IOCs** sem rede instalar agente completo (delta semanal) |
| RNF-07 | **Windows 10/11** primeiro; macOS fase 2 |
| RNF-08 | **Audit log** imutável de ações do observador e do sistema |

---

## 7. Checklist operacional para observador (Camada A — MVP)

Usar quando **não** há agente instalado.

**Antes de iniciar (5 min):**

1. [ ] Candidato compartilha **tela inteira** (não só janela), monitor único visível.
2. [ ] Mostrar **barra de tarefas** e **systray** por 10 s.
3. [ ] `Alt+Tab` uma vez: narrar apps visíveis; nenhum overlay suspeito.
4. [ ] Fechar explicitamente: Discord, Slack, Telegram, WhatsApp Desktop, remote desktop.
5. [ ] Confirmar que **não** há segundo monitor ligado (pedir para mover janela de ponta a ponta).
6. [ ] Candidato declara por voz: “Não uso assistente de IA externo nesta prova.”

**Durante:**

7. [ ] Olhar fixo alternado para canto da tela → flag comportamental.
8. [ ] Pausas longas (>30 s) seguidas de burst de digitação → flag.
9. [ ] Pedir compartilhar **somente** janela do exam — se recusar sem motivo, elevar risco.

**Limitação explícita:** checklist **não detecta** full stealth + content protection; documentar no relatório.

---

## 8. Arquitetura de referência

```
┌─────────────────────┐     WebRTC / RTMP      ┌──────────────────────┐
│  PC do candidato    │ ─────────────────────► │  Serviço ingestão    │
│  ┌───────────────┐  │                        │  (frames + metadados)│
│  │ Agente (B)    │──┼── TLS ───────────────► │                      │
│  │ - processos   │  │                        └──────────┬───────────┘
│  │ - janelas     │  │                                   │
│  │ - rede/hotkey │  │                        ┌──────────▼───────────┐
│  └───────────────┘  │                        │  Motor IOC + ML      │
│  ┌───────────────┐  │                        │  - regras            │
│  │ Ferramenta    │  │                        │  - visão (opcional)  │
│  │ tipo AIGA     │  │                        └──────────┬───────────┘
│  └───────────────┘  │                                   │
└─────────────────────┘                        ┌──────────▼───────────┐
                                               │  Dashboard observador │
                                               │  alertas + timeline   │
                                               └──────────────────────┘
```

### 8.1 MVP sugerido (8–12 semanas)

| Fase | Entrega |
|------|---------|
| **M1** | Sessão + checklist web + gravação manual de flags |
| **M2** | Agente Windows: snapshot processos + janelas topmost |
| **M3** | IOC pack inicial (AIGA + Electron genérico + domínios LLM) |
| **M4** | Dashboard tempo real + relatório PDF |
| **M5** | ML leve em frames (detecção overlay/transparência) — opcional |

### 8.2 Stack técnica sugerida

| Peça | Opção |
|------|-------|
| Agente Windows | C# / Rust + Win32 API; serviço assinado |
| Servidor | Node ou Go; WebSocket para alertas |
| IOC store | Git-versioned JSON + CDN |
| Vídeo ML | Python sidecar (OpenCV + modelo leve) ou serviço cloud |
| Frontend observador | React (padrão do monorepo AIGA) |

---

## 9. Calibração contra AIGA (referência interna)

Com base no comportamento atual do AIGA:

| Mecanismo AIGA | Estratégia de detecção |
|----------------|------------------------|
| `setContentProtection(true)` | Não aparece no share → **agente de processos** essencial |
| Stealth always-on-top | Enumeração `WS_EX_TOPMOST` + título |
| Full stealth (`hide()`) | Processo ativo sem janela visível → match por nome/hash |
| Captura Ctrl+E | Hook teclado + correlacionar pico rede + flash opcional no vídeo |
| `desktopCapturer` | Monitor API de duplicação desktop / contadores perf |
| Atalhos `globalShortcut` | Low-level keyboard hook durante sessão |
| LLM cloud | Firewall/DNS log ou monitor de conexões TCP 443 para IOC domains |

**Teste de validação:** executar AIGA em modo stealth e full stealth durante sessão de teste; medir taxa de detecção por camada A vs B.

---

## 10. Limitações e corrida armamentista

1. **Content protection** evolui por SO e por app de videoconferência; detecção visual nunca será 100%.
2. Ferramentas podem **renomear processo**, usar build custom, ou rodar em ** segunda máquina** (fora do share).
3. Bloqueio agressivo gera **falsos positivos** (IDEs Electron, Teams, Cursor).
4. Monitoramento de rede exige **consentimento** e pode conflitar com TLS (SNI/DNS only, não conteúdo).
5. Solução ética: **transparência** com candidato + canal de appeal + humano na decisão final.

---

## 11. Aspectos legais e éticos (obrigatório antes de produção)

- Informar **o que** é monitorado (processos, tela, rede, áudio ambiente).
- Base legal LGPD: **legítimo interesse** ou **consentimento** conforme contexto (emprego vs certificação).
- Não usar detecção como única prova disciplinar; combinar evidências.
- Retenção limitada (ex.: 7–30 dias) e acesso restrito.
- Proibir uso para vigilância fora do contexto de avaliação acordada.

---

## 12. Métricas de sucesso

| Métrica | Meta inicial |
|---------|--------------|
| Detecção AIGA (stealth visível) com agente | ≥ 95% em lab |
| Detecção AIGA (full stealth) com agente | ≥ 90% em lab |
| Detecção só screen share | ≥ 20% (transparência visível) — expectativa honesta |
| Falso positivo (dev normal com VS Code) | ≤ 5% |
| Tempo médio até primeiro alerta | ≤ 60 s após start AIGA |

---

## 13. Próximos passos recomendados

1. **Decidir tier:** só Camada A (checklist) vs agente Camada B (proctoring sério).
2. **Redigir termo de consentimento** alinhado ao tier.
3. **Implementar POC agente Windows:** enum processos + janelas topmost + IOC AIGA.
4. **Rodar bateria** com AIGA nos modos stealth / full stealth / captura rápida; documentar em `stealth-validation-evidence.md`.
5. **Integrar dashboard** mínimo para observador em sessão de screen share interna.

---

## 14. Referências externas

- [Pearson VUE OnVUE – AWS](https://home.pearsonvue.com/aws/onvue)
- [AWS Certification – During Testing](https://aws.amazon.com/certification/policies/during-testing/)
- [AWS Blog – Security measures in certification](https://aws.amazon.com/blogs/training-and-certification/protecting-aws-certification-value-through-security-measures/)
- [Pearson VUE – Online testing requirements](https://www.pearsonvue.com/us/en/onvue/requirements.html)
- Documentação interna: `docs/stealth-validation-evidence.md`

---

## Apêndice A — Exemplo de entrada IOC (YAML)

```yaml
id: aiga-electron-overlay
severity: high
weight: 0.9
process:
  names: ["AIGA.exe", "aiga.exe"]
  path_contains: ["aiga", "AIGA"]
window:
  title_contains: ["AIGA"]
  ex_style_mask: ["WS_EX_TOPMOST", "WS_EX_LAYERED"]
network:
  dns_suffix: ["generativelanguage.googleapis.com", "api.openai.com", "api.anthropic.com"]
hotkeys:
  sequences: ["Ctrl+E", "Ctrl+Shift+H", "Ctrl+D"]
notes: "Ferramenta assistiva desktop conhecida; correlacionar múltiplos sinais."
```

---

## Apêndice B — Matriz decisão rápida

| Cenário | Camada A suficiente? | Camada B necessária? |
|---------|---------------------|----------------------|
| Entrevista informal | Talvez | Recomendado se alta stakes |
| Prova técnica empresa | Não | Sim |
| Certificação formal (AWS) | Não | Sim (ou OnVUE nativo) |
| Pair programming supervisionado | Sim (checklist leve) | Opcional |
