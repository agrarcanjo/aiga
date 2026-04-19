# Clone Perssua Beta - Feedback Form & Templates

## 1. Weekly Feedback Form (Google Form Template Export)

**Form Title**: Clone Perssua Beta - Weekly Feedback (Week X)

### Section 1: Stability & Performance

**Q1: Was the app stable during your usage this week?**
- Type: Yes/No
- Required: Yes

**Q2: Overall stability score (1=crashed constantly, 5=rock solid)**
- Type: Linear scale 1-5
- Required: Yes

**Q3: Screenshot quality score (accuracy & relevance of AI responses)**
- Type: Linear scale 1-5
- Default: 3
- Required: Yes

**Q4: Audio transcription quality (accuracy of speech-to-text)**
- Type: Linear scale 1-5
- Default: 3
- Required: Yes

**Q5: Response latency (1=too slow, 5=instant)**
- Type: Linear scale 1-5
- Default: 3
- Required: Yes

---

### Section 2: Usability & UX

**Q6: Ease of learning shortcuts (Ctrl+S, Ctrl+D, Ctrl+B)**
- Type: Linear scale 1-5
- Required: Yes

**Q7: Stealth Mode effectiveness (did it prevent exposure during screen share?)**
- Type: Scale
  - 1 = Didn't use
  - 2 = Used but exposed too much
  - 3 = Adequate
  - 4 = Good
  - 5 = Excellent, invisible
- Required: Yes

**Q8: UI feedback clarity (progress indicators, error messages)**
- Type: Linear scale 1-5
- Required: Yes

**Q9: How likely are you to use Clone Perssua in production? (1=no way, 5=definitely)**
- Type: Linear scale 1-5
- Required: Yes

---

### Section 3: Open-Ended Feedback

**Q10: What was the MOST useful feature/moment for you this week?**
- Type: Short answer
- Required: No
- Hint: "e.g., Screenshot mode saved me 30min of explanation"

**Q11: What was the LEAST useful or most frustrating?**
- Type: Short answer
- Required: No
- Hint: "e.g., Audio capture didn't work in Teams"

**Q12: List 3 features you wish existed in Clone Perssua**
- Type: Short answer
- Required: No
- Hint: "e.g., Copy response to clipboard, dark mode, export chat"

**Q13: Describe any errors or crashes you encountered**
- Type: Paragraph
- Required: No
- Hint: "Include reproduction steps if you remember"

---

### Section 4: Usage Context

**Q14: Approximate hours of use this week**
- Type: Multiple choice
  - 0-2h
  - 2-5h
  - 5-10h
  - 10-20h
  - 20+h
- Required: Yes

**Q15: Approximate number of screenshots taken**
- Type: Short answer
- Required: No

**Q16: Approximate number of audio captures**
- Type: Short answer
- Required: No

**Q17: Primary use case(s) (select all that apply)**
- Type: Checkbox
  - [ ] Explaining code/architecture
  - [ ] Debugging UI/error messages
  - [ ] Meeting transcription & summarization
  - [ ] Research/exploration
  - [ ] Training/documentation
  - [ ] Other: ________

**Q18: Windows version & hardware (for debugging)**
- Type: Multiple choice
  - Windows 10 (Build): ___
  - Windows 11 (Build): ___
- Type: Dropdown
  - RAM: 8GB / 16GB / 32GB+ 
  - CPU: Intel i5 / i7 / i9 / AMD Ryzen / Other
  - GPU: Integrated / Dedicated
- Required: No (but helpful)

---

## 2. Bug Report Template

Use this when reporting issues in Slack or GitHub.

```markdown
### 🐛 Bug Report

**Title**: [One-line description]

---

#### Severity
- [ ] **P1 (Critical)**: App crash or feature completely broken
- [ ] **P2 (High)**: Feature significantly impaired but workaround exists
- [ ] **P3 (Medium)**: Minor issue, doesn't block usage
- [ ] **P4 (Low)**: Polish/cosmetic

#### Frequency
- [ ] **Always**: Every time I try
- [ ] **Often**: ~50% of the time
- [ ] **Rare**: ~10% of attempts
- [ ] **Random**: Unpredictable

---

#### Reproduction Steps
1. 
2. 
3. 
...

#### Expected Behavior
What should happen?

#### Actual Behavior
What actually happened?

---

#### Environment
- **Windows Version**: (Win10/Win11 + build number)
- **App Version**: (from Settings > About)
- **RAM Available**: (Task Manager > Performance)
- **Active API Provider**: Gemini / Local / Hybrid
- **Microphone**: Built-in / USB specified as ______
- **Network**: (WiFi / Ethernet / Cellular)

---

#### Logs
1. Open Settings > Diagnostics > View Logs
2. Paste last 20 lines below:
```
<logs here>
```

---

#### Attachments
- [ ] Screenshot showing the issue
- [ ] Screen recording demonstrating the bug
- [ ] Log file (.txt from %APPDATA%\ClonePerssua\logs\)

---

#### Additional Context
Any other info that might help?
```

---

## 3. Daily Triage Log Template

Use this format for standup/tracking during beta week.

```markdown
# Daily Triage Log

**Date**: 2026-04-12 (Day X of Beta)

---

## 1. New Issues Reported Today

| Issue # | Title | Reporter | Severity | Reproducible? | Status |
|---------|-------|----------|----------|---------------|--------|
| #001 | Screenshot lags >2s on Teams | User5 | P2 | Yes | Assigned |
| #002 | Audio cuts out after 5min | User8 | P2 | Yes | InProgress |

---

## 2. Critical (P1) Issues

**Current P1 count**: 0
- (none - good status!)

---

## 3. High Priority (P2) Issues

### #001 Screenshot Latency on Teams
- **Report**: User5 reported screenshot > Teams always takes 2-3s
- **Repro**: Confirmed, happens consistently when Teams window > 2K resolution
- **Root Cause**: Still investigating (candidate: frame decompression)
- **Owner**: [DevName]
- **ETA**: Tonight EOD (quickfix) or Wed AM (proper fix)

### #002 Audio Dropout
- **Report**: User8, audio capture cuts after 5min continuous
- **Repro**: Needs confirmation (likely buffer overflow or VAD hanging)
- **Owner**: [DevName]
- **ETA**: Investigate tomorrow AM

---

## 4. Medium Priority (P3) Issues (for next sprint)

- [ ] #003 Tooltip text cropped on 1280x720 resolution
- [ ] #004 Stealth mode hotkey conflicts with OneNote (Ctrl+Alt+S)
- [ ] #005 Dark theme missing on settings panel

---

## 5. Resolved Today

- ✅ #OLD-001 Auto-update modal doesn't close (fixed, v0.1.0-rc2 deployed)
- ✅ #OLD-002 API key not persisted after restart (fixed, local test passed)

---

## 6. Builds Deployed

| Build | Time | Pilots | Status | Notes |
|-------|------|--------|--------|-------|
| v0.1.0-rc2 | Wed 2pm | All 12 | OK | Audio buffer fix + screenshot optimization |

---

## 7. Health Metrics (Snapshot)

| Metric | Value | Trend |
|--------|-------|-------|
| Active Pilots | 12/12 | ↑ |
| Avg Stability Score | 4.3/5 | ↑ |
| Avg Usability Score | 3.0/5 | → |
| Crashes Reported | 0 | ↓ |
| P1 Open | 0 | ↓ |
| P2 Open | 2 | → |
| P3 Open | 3 | ↑ (new issues) |

---

## 8. Action Items (by EOD)

- [ ] Investigate #002 audio dropout (User8 +replay, VAD logs)
- [ ] Deploy rc3 with screenshot optimization to 2 pilots (User5 + User7)
- [ ] Update rollback trigger doc if new P1 discovered
- [ ] Notify pilots of rc2 deployment & ask for retest feedback

---

## 9. Notes for Tomorrow's Standup

- Ask User5 about Teams window resolution (confirm >2K theory)
- Prepare rollback procedure doc in case #002 becomes widespread
- Plan rc3 release window (Wed 4pm vs Thu 10am)

---

## 10. Escalation Status

**Escalation Required?**: No
**Rollback Candidate**: No
**Continue Beta**: Yes ✅
```

---

## 4. Go-No-Go Checklist (Weekly, End of Week 1)

Use this Friday to decide: Continue Beta or Pause for Fixes?

```markdown
# Go-No-Go Beta Evaluation (Week X Conclusion)

**Decision Date**: Friday [date]
**Evaluators**: [Eng Lead, PM, QA]
**Decision**: ☐ GO (continue) | ☐ NO-GO (pause & fix) | ☐ GO WITH CAUTION (continue but monitor closely)

---

## Criteria Assessment

### 1. Stability Check ✅/❌
- [ ] ≥70% of pilots report "stable" or "no crashes"
- [ ] ≤1 P1 issue open (not blocking usage)
- [ ] P2 count ≤ 3
- **Result**: ✅ PASS (avg 4.2/5, 0 P1, 2 P2)

### 2. Privacy & Security ✅/❌
- [ ] No API keys exposed in logs
- [ ] No unencrypted data in filesystem
- [ ] Stealth mode validated by ≥3 pilots
- **Result**: ✅ PASS (audit passed, stealth working)

### 3. Feature Viability ✅/❌
- [ ] ≥3 pilots able to use core features
- [ ] Screenshot mode responds <3s (95% of cases)
- [ ] Audio transcription accuracy >80%
- **Result**: ✅ PASS (all metrics met)

### 4. Operational Health ✅/❌
- [ ] Daily triage completed
- [ ] Builds pushed without critical blockers
- [ ] Communication with pilots clear
- **Result**: ✅ PASS (triage on-time, 2 rc builds)

---

## Risk Register

| Risk | Impact | Mitigation | Status |
|------|--------|-----------|--------|
| Screenshot latency on high-res monitors | Medium | Optimize decompression algo | In Progress |
| Memory leak in audio mode | High | Validate buffer cleanup | Monitoring |
| Gemini rate limiting | Medium | Implement backoff + local fallback | Ready |

---

## Recommendation

**Week 1 Conclusion**: ✅ **GO** forward to Week 2

- Stability is solid (4.2/5)
- No critical blockers
- 2 P2 issues have clear owners & ETA

**Action**: Deploy v0.1.0-rc3 Monday; continue daily triage; execute repo survey Friday for expansion approval.

**Next Gate**: Friday end of Week 2 (transition to Open Beta)
```

---

## 5. Beta Expansion Sign-Off (End of Week 2)

Criteria to expand from Closed Beta (12 pilots) to Open Beta (32 pilots).

```markdown
# Open Beta Go-No-Go (End of Week 2)

**Date**: Friday [date]
**Decision**: ☐ GO to Open Beta | ☐ NO-GO, continue Closed Beta Week 3+

---

## Requirements Checklist

| Requirement | Target | Actual | Status |
|-------------|--------|--------|--------|
| Stability Score | ≥70% | 4.4/5 (88%) | ✅ PASS |
| Usability Score | ≥3.2/5 | 3.5/5 | ✅ PASS |
| P1 Issues | 0 | 0 | ✅ PASS |
| P2 Issues | ≤2 | 1 (resolved, monitoring) | ✅ PASS |
| Feature Adoption | ≥60% | 75% (3+ features/session) | ✅ PASS |
| Privacy Audit | Pass | No findings | ✅ PASS |
| Release Notes | Draft | Ready | ✅ PASS |
| Marketing | Rollout plan | Approved | ✅ PASS |
| Build Size | <200 MB | 180 MB | ✅ PASS |
| Rollback Procedure | Documented & tested | Tested with 1 pilot | ✅ PASS |

---

## Signoff

**Engineering Lead**: _____________ Date: _________

**Product Manager**: _____________ Date: _________

**QA/Operations**: _____________ Date: _________

---

## Next Milestone (Open Beta Week 3+)

- [ ] Auto-updater push v0.1.0 to 32 users (10am Monday)
- [ ] Expand daily triage to 2x/day (morning + EOD)
- [ ] Weekly survey (keeping momentum)
- [ ] Plan v1.0 features based on feedback
```

---

## 6. Issue Priority Legend

Use this consistently across all channels:

| Priority | SLA | Example |
|----------|-----|---------|
| **P1 - Critical** | Fix <24h or rollback | App crash on launch; privacy breach; feature totally broken |
| **P2 - High** | Fix <2-3 days | Latency >3s; audio cuts out after 5min; stealth mode inconsistent |
| **P3 - Medium** | Fix this week | Tooltip cropped; keyboard shortcut conflict; cosmetic glitch |
| **P4 - Low** | Next sprint | UI text typo; color inconsistency; nice-to-have feature |

---

## 7. Feedback Form Export Instructions

When copying to Google Form:
1. Create new form: forms.google.com
2. Copy **Section 1-4** questions above
3. Set **Settings > Link to spreadsheet** (auto-collect responses)
4. Share link with pilots via Slack
5. Set reminder email Friday 3pm (before 5pm deadline)
6. After Week 1 & 2, export CSV and analyze in Sheets

---

## Anexo: Survey Analysis Quick-Wins

After receiving Week 1 survey responses:

```markdown
### Survey Analysis (Week 1)

**Response Rate**: 10/12 (83%)

**Stability**: 
- Mode score: 4.2/5
- Range: 3-5
- Action: Low priority fixes sufficient

**Usability**: 
- Mode score: 3.0/5
- Outliers: User3 (2/5), rest 3-4
- Action: 1:1 with User3 to debug UX blockers

**Feature Wishlist** (from Q12):
- Dark mode (3 mentions)
- Copy response to clipboard (2 mentions)
- Keyboard-only mode (1 mention)
- → Backlog for v1.0

**Crashes/Errors**: 
- (none reported this week)
- Action: Good, continue monitoring

**Production Readiness** (Q9):
- Mean: 4.1/5
- Verdict: Pilots confident for expansion
```

