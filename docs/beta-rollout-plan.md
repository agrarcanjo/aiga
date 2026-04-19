# Clone Perssua - Beta Rollout Plan (T7.1)

## 1. Objetivo do Beta Fechado

Validar Clone Perssua com grupo piloto selecionado para:
- Identificar problemas críticos (P1: app crash, feature-breaking) em ambiente real
- Coletar feedback qualitativo sobre UX (shortcuts, stealth mode, audio quality, response quality)
- Medir viabilidade operacional (resource usage, stability over 2+ weeks)
- Estabelecer base de dados para transição para Beta Aberto (T7.2)

**Duração**: 2 semanas (Semana 1: ramp-up + estabilização, Semana 2: feedback intensivo)

---

## 2. Critério de Seleção - Grupo Piloto

### 2.1 Perfil Ideal (8-12 usuários)

| Característica | Critério | Razão |
|---|---|---|
| **Função** | Profissionais de tech/inovação, gestores com desktop + prezent | Usuários frequentes de atalhos globais, compartilhamento de tela |
| **Experiência UX** | Alto (confortável com betas e feedback iterativo) | Tolerância a UI/UX imperfeitas, disposição para reportar |
| **Ambiente** | Windows 10/11 x64, mínimo Intel i5+, 8GB RAM, Speaker/Headset | Equipamento de line: garantir estabilidade de hardware |
| **Disponibilidade** | Mínimo 10h/semana de uso ativo | Uso consistente para capturar edge cases |
| **Feedback** | Disposto a preencher survey semanal e reportar bugs | Dados estruturados para priorização |

### 2.2 Critério de Exclusão
- Usuários em conexão rural/intermitente (impede Gemini cloud)
- Sem experiência de linha de comando (maior custo de suporte)
- Fora do continente America Latina/NA (fuso horário para triage sync)

---

## 3. Distribuição e Onboarding

### 3.1 Pack de Distribuição
```
clone-perssua-beta-v0.1.0-signed.exe         [~150 MB, signed com cert corporativo]
docs/BETA-README.txt                          [onboarding rápido em PT]
docs/BETA-FEEDBACK-FORM.md                    [template para issues/feedback]
docs/DAILY-TRIAGE-LOG.md                      [log estruturado para triage]
```

### 3.2 Onboarding Checklist (Dia 1)
1. **Instalação**:
   - Executar .exe assinado
   - Confirmar Windows SmartScreen (botch de aviso)
   - Permitir acesso a Microphone + Desktop Capture (Sistema)
   
2. **Configuração Mínima**:
   - Insira Gemini API Key (ou use credencial fornecida X@accenture.com)
   - Teste Screenshot: Ctrl+S (validar captura)
   - Teste Audio: Ctrl+D 3s (validar microfone)
   - Teste Stealth: Ctrl+B (validar toggle invisibilidade)

3. **Comunicação**:
   - Receba link Slack privado #clone-perssua-beta
   - Envie 1 screenshoot de "Settings" preenchido para confirmar onboarding

### 3.3 Canais de Comunicação
- **Para bugs críticos** (app crash, feature inútil): Slack #clone-perssua-beta (ao vivo, @incident)
- **Para feedback qualitativo**: Weekly survey Google Form (sexta 5pm)
- **Para tech help**: Comment no issue GitHub privado ou responder Slack thread

---

## 4. Matriz de Feedback Estruturado

### 4.1 Feedback Form Semanal (Google Form)

**Seção 1: Estabilidade (checkbox + score 1-5)**
- [ ] App foi estável durante 10h+ uso (não travou)
- Qualidade resposta de screenshot (1=ruim, 5=excelente): ___
- Qualidade transcricao audio (1=pobre, 5=excelente): ___
- Velocidade de resposta (latência media): ___

**Seção 2: Usabilidade (score 1-5)**
- Facilidade de aprender shortcuts: ___
- Efetividade de Stealth Mode (reduziu exposição): ___
- Clareza de feedback visual (progress/errors): ___
- Probabilidade de usar em producao (1-5): ___

**Seção 3: Open Feedback**
- Qual foi o caso de uso MAIS útil?
- Qual foi o caso de uso MENOS útil?
- 3 funcionalidades que faltaram?
- Erros encontrados (descricao + reproduction):

**Seção 4: Contexto**
- Horas de uso na semana: ___
- Quantidade de screenshots: ___
- Quantidade de audio: ___
- Equipo usado (ex: Win11 + Intel i7 + 16GB): ___

### 4.2 Bug Report Template (para Slack/GitHub private)

```
[BUG] <titulo breve>

Severity: [P1-Critical | P2-High | P3-Medium | P4-Low]
Frequency: [Always | Often ~50% | Rare ~10% | Random]

REPRODUCTION STEPS:
1. ...
2. ...
3. ...

EXPECTED: ...
ACTUAL: ...

ENVIRONMENT: 
- Windows: ___
- Memory Available: ___
- API Provider: [Gemini | Local | Hybrid]

LOGS (from Settings > Diagnostics or C:\Users\...\AppData\Local\ClonePerssua\logs\):
[paste last 10 lines]

SCREENSHOT / VIDEO: [attach if UX related]
```

---

## 5. Rollback Criteria & Escalation

### 5.1 Rollback Triggers (STOP Beta)

**P1 (Critical) - Immediate Rollback**:
- App crashes on 2+ pilots (não é isolated)
- Privacy breach (logs expostos, API key em plain text)
- Stealth mode não funciona (oposto de segurança)
- Audio capture malfunction (impossível usar feature)

**Decision**: Se ≥2 P1 em 48h sem ETA de fix → rollback automatico via auto-updater (downgrade para v0.0.9)

### 5.2 Soft-Stop Criteria (Pause Beta, Fix Locally)

**P2 (High) - Pause Expansion**:
- Unresponsive API (Gemini rate limit ou auth failure) afetando ≥3 pilots
- Memory leak (180MB+ after 2h continuous use)
- Inconsistente stealth validation entre plataformas (Teams ✓ vs Zoom ✗)

**Decision**: Fix local, retest com 2-3 pilots → resume expansion

### 5.3 Success Criteria (Proceed to Open Beta)

**After 2 weeks**:
- ≥70% stability score (no crashes in 10h+ usage)
- ≥3/5 usability avg (shortcuts, stealth, feedback clarity)
- ≤2 P2 unresolved
- ≥80% likelihood of use in production (survey)
- No privacy/security issues discovered

---

## 6. Daily Triage Rhythm

### 6.1 Triage Window (Working Hours)
- **09:00 BR / 08:00 EST**: Bug harvest (check Slack, GitHub, surveys)
- **09:30 BR**: Triage call (15min): prioritize new issues
  - P1? Start fix immediately
  - P2? Assign to sprint or hotfix branch
  - P3? Document for next phase
- **17:00 BR**: Status update Slack (what was fixed, what's next)

### 6.2 Daily Triage Log Template

```markdown
## Triage Log - Day X (Data YYYY-MM-DD)

### New Issues
| ID | Title | Severity | Pilot | Repro | Status |
|----|-------|----------|-------|-------|--------|
| #T001 | Screenshot lagging > 2s | P2 | User5 | Yes | InProgress |

### P1s (Critical)
- (none)

### P2 Status
- #T001: Investigating frame drops in ScreenCaptureService → candidate: heavy background process

### Builds Deployed
- v0.1.0-rc1: 3 pilots (Wed 14:00) → pending feedback

### Health Metrics
- Active pilots: 12
- Avg stability score: 4.2/5
- Total issues open: 3 P2, 2 P3
- Crash rate: 0% (no incidents)
```

### 6.3 Escalation Path
1. **Day 1-2**: Triage + initial debug
2. **Day 2-3**: If unresolved P2, escalate to tech lead
3. **Day 3-4**: If still unresolved + impacting >1 pilot, trigger P1 escalation or rollback decision

---

## 7. Transição para Beta Aberto (T7.2)

### 7.1 Gate Checklist (após 2 semanas)
- [ ] Stability > 70%
- [ ] Usability > 3/5
- [ ] ≤2 P2 unresolved
- [ ] Privacy audit passed
- [ ] Build size acceptable (<200 MB)
- [ ] Release notes drafted
- [ ] Rollback procedure validated

### 7.2 Candidatos Beta Aberto (Semana 3)
- Todos 12 pilots originais convidados a continuar (opt-in)
- +20 novos usuarios (referidos ou sign-up)
- Total Beta Aberto: ~32 usuarios

### 7.3 Metrics Tracking
- Manter daily triage log
- Expandir survey para: feature requests, wishlist, competitive comparison
- Setup telemetry (crash reports, feature usage heatmap)
- Track auto-update adoption rate

---

## 8. Communication Plan

### 8.1 Beta Start Email
```
Subject: 🎉 Clone Perssua Beta Fechado - Bem-vindo!

Caro [Piloto],

Você foi convidado para testar Clone Perssua, um assistente desktop 
que revoluciona seu workflow com:
- Captura imediata de screen + resposta IA
- Transcrição de audio em 1 clique
- Modo stealth para compartilhamento de tela

COMO COMEÇAR:
1. Download: [link assinado]
2. Instale e rode onboarding (Settings > Diagnostics)
3. Confirme em Slack #clone-perssua-beta

BUG? Reporte direto em Slack.
FEEDBACK? Preencha survey sexta-feira.

Duração: 2 semanas (até XX/XX), depois transição para beta aberto.

Obrigado por acelerar a qualidade antes do lançamento geral!

Abraços,
[Equipe]
```

### 8.2 Weekly Status (Friday 5pm Slack)
```
📊 **Semana 2 - Clone Perssua Beta Recap**

✅ Builds: v0.1.0-rc2 aprovado, fix para audio latency merged
🐛 Issues: 0 P1, 2 P2 (memória, stealth Teams)
📈 Health: stability 4.3/5, usability 3.2/5, adoption 100%
🚀 Next: Release v0.1.0-stable Monday 10am, expand to open beta

Agradecemos o feedback intenso! 🙏
```

---

## 9. Success Metrics (Post-Beta)

| Métrica | Target | Measurement |
|---------|--------|-------------|
| Stability | >70% uptime 10h+ | Survey: "app stable" checkbox |
| Usability | ≥3.2/5 avg | Likert scale survey |
| Feature Adoption | ≥60% use 2+ features | Feature count per session |
| Adoption Intent | ≥80% "likely to use" | Survey question 1-5 |
| Issue Velocity | P1 fixed <48h | Triage log |
| Privacy | 0 breaches | Audit + log review |

---

## Anexo: Release Schedule

**Semana 1 (Beta Ramp-Up)**
- Seg 10am: Deploy v0.1.0 to 12 pilots
- Qua 5pm: First triage, hotfix if needed (rc1/rc2)
- Sex 5pm: Weekly survey + status

**Semana 2 (Stabilization + Expansion Prep)**
- Seg 10am: Deploy stable (rc2→final)
- Qua 5pm: Triage + expansion readiness check
- Sex 5pm: Final survey, gate evaluation

**Semana 3+ (Open Beta)**
- Mon: Auto-updater push v0.1.0 to 32 users
- Daily: Triage + metrics
- Weekly: Survey + release notes planning for v1.0 GA
