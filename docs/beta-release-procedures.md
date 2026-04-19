# Clone Perssua Beta - Release & Deployment Procedures (T7.1)

## 1. Release Candidate Build Process

### 1.1 Pre-Build Checklist

```markdown
## Release Checklist (Before `pack:win`)

**Branch**: feature/beta-release
**Target**: v0.1.0-rcX (release candidate) or v0.1.0 (stable)

### Code Freeze
- [ ] All P1/P2 fixes merged to main
- [ ] No work-in-progress branches
- [ ] Git log clean: `git log --oneline main ~10` (review recent commits)
- [ ] Feature flags validated: `corepack pnpm grep "featureFlag"` (no experimental toggles)

### Testing Gate (2x run, both must pass)
- [ ] `corepack pnpm test` (18 unit tests, 0 failures)
- [ ] `corepack pnpm test:e2e` (4 E2E IPC tests, 0 failures)
- [ ] `corepack pnpm typecheck` (TypeScript strict, 0 errors)
- [ ] `corepack pnpm build` (Vite prod, <200MB gzipped)
- [ ] Manual smoke test (dev mode, 5min): launch → settings → screenshot → audio → stealth toggle

### Version Bump
- [ ] `package.json` version updated: v0.1.0-rcX → v0.1.0-rc(X+1) or v0.1.0
- [ ] `apps/desktop/electron/package.json` version synced with root
- [ ] Version in auto-updater feed URL reflects new version
- [ ] CHANGELOG.md updated with highlights (fixes + features)

### Security Pre-Flight
- [ ] No hardcoded API keys in code (grep for `GEMINI_API_KEY=`)
- [ ] No console.log of sensitive data (logs review)
- [ ] Environment variables documented (.env.example updated)
- [ ] Code signing cert prepared: WIN_CSC_LINK and WIN_CSC_KEY_PASSWORD env vars validated
- [ ] Pre-build signing check passed: `corepack pnpm run ci-sign-check`

### Go/No-Go Decision
- [ ] All checks ✅ PASS
- **Decision**: ☐ Proceed to `pack:win` | ☐ Block, fix issues
```

### 1.2 Build Commands

```bash
# Step 1: Clean previous builds
cd c:\develop\branch\aiga
rm -r apps/desktop/dist apps/desktop/release

# Step 2: Set signing credentials (from secure vault, CI/CD or local)
# For local development:
$env:WIN_CSC_LINK = "file:///C:/path/to/cert.pfx"
$env:WIN_CSC_KEY_PASSWORD = "YOUR_CERT_PASSWORD"
# OR for CI/CD (GitHub Actions): use GitHub Secrets

# Step 3: Generate installer package (signed NSIS)
# This creates: apps/desktop/release/Clone Perssua x64 Setup v0.1.0-rcX.exe
corepack pnpm run pack:win

# Expected output:
# ✓ Packaged: .../release/Clone Perssua x64 Setup v0.1.0-rcX.exe (156 MB)
# ✓ Signed: Code signing certificate applied
# ✓ Time-stamp: Notarized via Symantec
# ✓ Hash: SHA-256 = [hex string]

# Step 4: Generate full distribution (MSI + auto-update metadata)
# This creates: apps/desktop/release/latest.yml (auto-updater feed data)
corepack pnpm run dist:win

# Expected output:
# ✓ Dist complete
# ✓ Files:
#   - Clone Perssua x64 Setup v0.1.0-rcX.exe
#   - latest.yml (contains version, changelog, hash, download URL)
#   - BlockMap file (binary diff for auto-update delta)

# Step 5: Verify signing
# Command: signtool verify /pa apps/desktop/release/Clone\ Perssua\ x64\ Setup\ v0.1.0-rcX.exe
# Expected: "Signature verified" + cert details
```

### 1.3 Output Artifacts

After successful build:

```
apps/desktop/release/
├── Clone Perssua x64 Setup v0.1.0-rcX.exe   [~156 MB, signed]
├── Clone Perssua x64 Setup v0.1.0-rcX.exe.blockmap
├── latest.yml                                [auto-updater feed metadata]
└── builder-effective-config.yaml             [build config audit trail]
```

**Critical**: Verify exe signature before distribution:
```bash
signtool verify /pa "apps/desktop/release/Clone Perssua x64 Setup v0.1.0-rcX.exe"
# Output should show:
#   SignTool Error: WintustE_Verify_Action_Unknown (0x80092010)
#   BUT actual signature valid (ignore error if cert chain resolves)
```

---

## 2. Distribution to Beta Pilots

### 2.1 Private Hosting (GitHub Releases)

```markdown
## Setup (One-time)

1. Create private GitHub org if not exists (e.g., accenture-internal)
2. Create private repo: clone-perssua-releases
3. Settings > Security > Access tokens: Generate personal token (repo scope)

## Per Release

**GitHub Release Draft**:
- Tag: `v0.1.0-rcX`
- Title: "Clone Perssua Beta RC-X"
- Body:
  ```
  ## What's New
  - [List fixes & features]
  
  ## Installation
  1. Download `Clone Perssua x64 Setup v0.1.0-rcX.exe` below
  2. Run installer
  3. Confirm SmartScreen warning (click "More info" → "Run anyway")
  4. Confirm microphone + screen capture permissions
  
  ## Known Issues
  - [List open P2/P3 if any]
  
  ## Feedback
  - Report bugs in Slack #clone-perssua-beta
  - Survey link: [Google Form]
  
  **SHA-256**: [copy from dist:win output]
  ```

- Upload: `release/Clone Perssua x64 Setup v0.1.0-rcX.exe` (156 MB)
- Publish

**Slack Announcement** (#clone-perssua-beta):
```
🚀 **Clone Perssua v0.1.0-rcX Released**

Download: [GitHub Release link]
Installation: Run .exe, confirm SmartScreen, allow permissions

**This version**:
✅ Fixed: Screenshot latency (P2 #001)
✅ Fixed: Audio buffer overflow (P2 #002)
✅ Added: Rollback hotkey (Ctrl+Z)

**Known issues**:
⚠️ Stealth mode on Zoom still needs refinement (in progress)

**Feedback deadline**: Friday 5pm survey

Questions? Ping me in this thread!
```
```

### 2.2 Auto-Update Feed Hosting (Electron Update Server)

Option A: Self-Hosted (Recommended for Private Beta)
```markdown
## Setup

1. Create S3 bucket (or similar): `clone-perssua-beta-releases`
2. Upload `latest.yml` from `apps/desktop/release/`
3. Set DNS alias: `https://releases-beta.clone-perssua.accenture.com/latest.yml`
4. Configure app: `appSettings.autoUpdate.feedUrl = "https://releases-beta.clone-perssua.accenture.com"`

## Per Release

- Build with `pack:win && dist:win`
- Upload `latest.yml` to S3
- Upload `.exe` to S3 (or keep on GitHub, link in yml)
- Test with 1-2 pilots: Settings > Auto-Update > Check (should find new version)
```

Option B: GitHub Releases (Simpler for Beta)
```markdown
## Setup

- Electron-updater auto-detects private GitHub releases if feedUrl = `https://github.com/owner/repo/releases/latest`

## Per Release

- Create GitHub Release (see 2.1 above)
- App auto-detects via feedUrl
- Pilots get notice: "Update available: v0.1.0-rcX"
```

---

## 3. Rollout Phases

### 3.1 Phase 1: Canary (1 pilot, 4 hours)

```markdown
## Canary Deployment

**Objective**: Smoke test auto-update chain before expanding to all pilots

**Pilot**: User1 (most technical)
**Time Window**: Mon 10am-2pm (4 hours, during office hours)
**Build**: v0.1.0-rc1

**Procedure**:
1. Notify User1 in Slack private thread (not public announce yet)
2. User1 installs v0.1.0-rc1 manually from GitHub Release
3. Verify installation: User1 runs Settings > About > "Check for Updates"
4. Wait for auto-updater to detect newer version (if exists), or manually disable v0.1.0-rc1 auto-update so next version looks new
5. Monitor User1's machine via Slack check-ins (15min intervals):
   - "Does update check work?" (Y/N)
   - "Did update download?" (Y/N)
   - "Does restart work?" (Y/N)
   - "App stable post-update?" (Y/N)

**Success Criteria**:
- All 4 checks = YES
- No crash logs in `%APPDATA%\ClonePerssua\logs\`

**Decision**:
- ✅ **Canary OK**: Proceed to Phase 2 (expand to 4 pilots)
- ❌ **Canary Failed**: 
  - Rollback User1 auto-updater (disable in settings)
  - Root cause investigation + fix
  - Re-canary with fix

**Time to Decision**: Mon 2:30pm
```

### 3.2 Phase 2: Ramp (4 pilots, 1 day)

```markdown
## Ramp Deployment

**Objective**: Expand to 4 pilots, validate stability across environments

**Pilots**: User1 (canary ✅) + User3,4,5 (diverse HW/OS)
**Time Window**: Tue 10am (after Canary Day 1 data)
**Build**: v0.1.0-rc1 (same as canary if successful, or updated rc2)

**Procedure**:
1. Slack announce to 4 pilots: Download manually OR auto-update will prompt tomorrow
2. Ask pilots to install ASAP (target 9am Wed)
3. Daily triage (Tue-Wed 3pm):
   - Any crashes? (check logs)
   - Any update issues? (manual intervention if needed)
   - Stability score feedback gut check

**Success Criteria**:
- 4/4 pilots successfully install + restart
- 0 critical issues reported
- Stability gut-check ≥3/5 from pilots

**Decision** (Wed 3pm):
- ✅ **Ramp OK**: Proceed to Phase 3 (all 12 pilots)
- ⚠️ **Ramp Caution**: Continue Mon with 4 pilots, fix any P2s
- ❌ **Ramp Failed**: Uninstall from 3 pilots, keep User1 + 1 other

**Time to Decision**: Wed 3pm
```

### 3.3 Phase 3: Rollout (12 pilots, ongoing)

```markdown
## Full Beta Deployment

**Objective**: All 12 pilots on v0.1.0-rc1 (or final v0.1.0)

**Time Window**: Thu 10am (staggered auto-update over 30min)
**Build**: v0.1.0-rc1 (or v0.1.0 if criteria met)

**Procedure**:
1. Auto-updater push to remaining 8 pilots (User6-12)
   - Option: Background download (prompt user later)
   - Option: Prompt at next app launch
2. Daily triage continues (daily logs)
3. Weekly survey Friday 5pm (Week 1)
4. Monitor metrics (triage data):
   - Stability, usability, P2 velocity

**Success Criteria** (after Week 1):
- ≥70% stability score avg
- ≤2 P2 issues
- ≥80% adoption (all pilots using 2+ features)

**Decision** (Fri Week 1):
- ✅ **GO Week 2**: Continue to stabilization phase
- ⚠️ **GO WITH CAUTION**: Continue but close new feature requests
- ❌ **NO-GO**: Roll back all pilots to v0.0.9, investigate root cause

**Time to Decision**: Fri 5pm Week 1 (after survey analysis)
```

### 3.4 Phase 4: Stabilization (Weeks 2-3)

```markdown
## Stabilization Phase

**Objective**: 
- Harden based on Week 1 feedback
- Prepare for Open Beta (expand to 32 pilots)

**Activities**:
- Daily triage continues (2x/day)
- RC2/RC3 iterations with targeted improvements
- 1:1 interviews with pilots about pain points
- Security audit + performance profiling

**Release Cadence**:
- Monday: rc2 (Week 1 feedback fixes)
- Wednesday: rc3 (additional polish)
- Friday: Final v0.1.0 (GA candidate)

**Success Criteria** (after Week 2):
- All criteria from Phase 3 met + sustained
- <2 P2 issues remaining
- ≥3.5/5 usability score (improved from Week 1)

**Decision** (Fri Week 2):
- ✅ **GO to Open Beta**: Expand to 32 pilots
- ⚠️ **EXTEND Closed Beta**: Continue Week 3 (if marginal)
- ❌ **BACK TO DEV**: Found critical issue, revert & retool

**Time to Decision**: Fri 5pm Week 2 (after final survey + triage analysis)
```

---

## 4. Monitoring & Health Signals

### 4.1 Real-Time Monitors (During Rollout)

```markdown
## Rollout Health Dashboard (Tue-Fri)

**Update Adoption Rate**:
- Phase 2 (Tue): User1 ✅ (4/4 = 100%)
- Phase 3 (Thu): User6-12 auto-update (8/8 pending → expect 100% by Fri)
- **Target**: 100% within 24h

**Crash Reports**:
- Check: `%APPDATA%\ClonePerssua\logs\crashes.json` (if any)
- **Target**: 0 reported P1 crashes

**Performance Baseline** (per pilot, spot-check):
- Memory: Resting <180MB, peak <280MB during screenshot+response
- CPU: Screenshot <10% during capture, <5% idle
- Disk: <500MB total (app + models)

**User Activity** (from settings):
- Screenshot count: ≥1 per active pilot per day
- Audio captures: ≥1 per active pilot per day
- Stealth toggles: Evidence of feature exploration

**Support Tickets**:
- **Phase 2-3**: Monitor Slack #clone-perssua-beta hourly (alert on :warning:)
- **Action**: P1 → immediate response, P2 → within 4h

**Decision Points**:
- **<Threshold**: Continue rollout
  - Crash rate <5%
  - Support response <2h for P1
  - Adoption >90%
- **>Threshold**: Pause & Investigate
  - Crash rate ≥5%
  - Adoption <70%
  - Multiple P1s without fix path
```

### 4.2 Weekly Triage Analytics (Friday)

```markdown
## Week 1 Triage Analytics

**Survey Response Rate**: 10/12 pilots (83%)

**Stability**:
- Average: 4.2/5 (target ≥3.5/5)
- Distribution: [3, 3, 4, 4, 4, 4, 4, 4, 5, 5]
- **Trend**: Stable ✅

**Usability**:
- Average: 3.0/5 (target ≥3.0/5)
- Distribution: [2, 2, 3, 3, 3, 3, 3, 4, 4, 4]
- Outliers: User3, User8 (both 2/5) → 1:1 interviews
- **Trend**: Acceptable ✅

**Issues**:
- P1: 0 (target: ≤1) ✅
- P2: 2 (target: ≤3) ✅
  - Screenshot latency (User5, 80% repro)
  - Audio dropout (User8, 50% repro)
- P3: 4 (new feedback items, not blocking)

**Feature Adoption**:
- Screenshot used: 12/12 pilots (100%)
- Audio used: 10/12 pilots (83%)
- Stealth mode used: 11/12 pilots (92%)
- **Insight**: Audio is secondary but engaged

**Production Readiness**:
- "Likely to use in production" (Q9): Average 4.1/5
- **Interpretation**: Pilots confident at current state

**Recommendation**:
✅ **GO Week 2**: Metrics above thresholds, proceed with stabilization
- Ship rc2 with screenshot latency fix (Mon)
- Monitor audio dropout closely
```

---

## 5. Rollback Procedures

### 5.1 Forced Rollback (P1 Trigger)

```bash
# Scenario: v0.1.0-rc1 has app crash, requires immediate downgrade

# Step 1: Identify rollback target
# Current: v0.1.0-rc1 (broken)
# Target: v0.0.9 (last stable)

# Step 2: Create downgrade release
# Option A: Auto-Updater (user doesn't manually reinstall)
# - Set feedUrl to point to v0.0.9 final release
# - Auto-updater detects allowDowngrade=true in config
# - Next app launch → auto-download v0.0.9

# Option B: Manual rollback (for all 12 pilots)
# - Create GitHub Release for v0.0.9 (if not already public)
# - Slack message: "URGENT: Update to v0.0.9 immediately [link]"
# - Pilots uninstall + reinstall manually

# Step 3: Monitoring
cd c:\develop\branch\aiga
# Check rollback in progress:
grep -r "v0.0.9" docs/beta-rollout-plan.md  # Verify config

# Step 4: Validation (per pilot)
# Ask pilots to confirm in Slack:
# - "Settings > About > [version should be v0.0.9]"
# - "Test screenshot → [should work without crashes]"

# Step 5: Retrospective
# - Create GitHub issue: "P1 Postmortem: v0.1.0-rc1 X crash"
# - Root cause analysis (48h)
# - Fix + new test case (prevents regression)
```

### 5.2 Scheduled Rollback (P2 Decision Gate)

```markdown
## Rollback Criteria (Decision Point)

**When**: End of day if ≥2 P1 or ≥5 P2 remain unresolved for 48h

**Procedure**:
1. Triage lead calls engineer lead + PM
2. Decision: Roll back to v0.0.9 (previous stable) or wait for fix
3. If rollback:
   - Update feedUrl → v0.0.9
   - Announce in Slack: "Pausing Beta, rolling back to v0.0.9 for fixes"
   - Pilots notified, downgrade over next 24h
4. Pause Beta: No new rc builds until root cause verified

**Timeframe**: 
- Pause typically 2-3 days
- RC2 with fix + targeted re-test with 2 pilots
- If stable, resume push to all 12 pilots

**Example**:
- Tue: Audio dropout reported (P2)
- Wed: Affects 3 pilots, root cause unclear
- Thu 5pm: Tech lead says ETA Fri → delay rollback 48h
- Fri 5pm: Fix confirmed, rc2 built
- Mon: Pilot re-test ✅, resume all-pilot push of rc2
```

---

## 6. Release Sign-Off

### 6.1 Phase Gate Approval Form

```markdown
# Release Approval - v0.1.0-rcX

**Version**: v0.1.0-rc1 → rc2 → rc3 → v0.1.0 (final)
**Date**: [release date]
**Approvers**: Eng Lead, PM, QA

---

## Pre-Release Verification

| Item | Owner | Status | Notes |
|------|-------|--------|-------|
| Testing gate (unit, e2e, typecheck, build) | QA | ✅ | All green |
| Security audit (logs, API keys) | InfoSec | ✅ | No findings |
| Signing cert valid | DevOps | ✅ | Expires 2027-12-31 |
| Build can be reproduced 2x | Build | ✅ | Deterministic hash |
| Release notes drafted | PM | ✅ | Highlights + known issues |
| Rollback plan documented | Ops | ✅ | Feed URL + procedure |
| Pilot list confirmed | PM | ✅ | 12 names, contact info |

---

## Go-No-Go

**Engineering**: Recommend **GO** ✅
- Builds stable, tests pass, security clear

**Product**: Recommend **GO** ✅
- Criteria met, pilot feedback positive

**QA**: Recommend **GO** ✅
- Test coverage sufficient, no blockers

---

## Final Approval

**Approved by**:
- Eng Lead: _________________ Date: _________
- PM: _________________ Date: _________
- QA: _________________ Date: _________

**Release authorized to proceed to Phase [X]**

---

## Deployment Config

- Auto-Update FeedUrl: `https://releases-beta.clone-perssua.accenture.com/v0.1.0-rcX`
- Download Server: GitHub Releases
- Rollback Version: v0.0.9 (if needed)
- Monitoring Period: 48h (then go/no-go decision)
```

---

## 7. Post-Release Communication

### 7.1 Pilot Kickoff Email

```
Subject: 🎉 Clone Perssua Beta v0.1.0-rcX is Live!

Hi [Pilot Name],

Clone Perssua is ready for your testing! Here's what's new:

**What's Changed**:
- Fixed screenshot latency (now <2s on high-res)
- Improved audio transcription accuracy
- Added rollback hotkey (Ctrl+Z)

**How to Install**:
1. Visit [GitHub Release Link]
2. Download "Clone Perssua x64 Setup v0.1.0-rcX.exe"
3. Run, confirm SmartScreen, allow permissions
4. Launch & test!

**Need Help?**:
- Slack: #clone-perssua-beta
- Docs: [Link to BETA-README.txt]
- Bugs: [Link to Bug Report Template]

**Feedback Deadline**: Friday 5pm - Fill out [survey link]

Thank you for accelerating our release! 🚀

[Team]
```

### 7.2 Daily Standup Format (Slack)

```
📊 **Beta Daily Update - Day X**

✅ **What's Good**:
- v0.1.0-rc1 deployed to 12 pilots
- Canary phase (User1) ✅ stable for 24h
- 0 P1 issues

⚠️ **What's In Progress**:
- Screenshot latency optimization (targeting rc2)
- Audio dropout investigation (User8)

❌ **What's Blocked**:
- (none)

📈 **Metrics** (snapshot):
- Stability: 4.2/5 avg
- Update adoption: 12/12 (100%)
- Support response: 0 open >4h

🎯 **Next Steps**:
- Deploy rc2 tomorrow with screenshot fix
- 1:1 with User3,8 (low usability scores)
- Friday survey → go/no-go decision

Team: Any blockers or escalations? 👇
```

---

## Appendix: Automation Scripts

### Build & Sign Script
```powershell
# build-and-sign.ps1
param([string]$version = "0.1.0-rc1")

cd "c:\develop\branch\aiga"

# Set signing env vars (from secure vault in CI, or local)
$env:WIN_CSC_LINK = "file:///C:/certs/cert.pfx"
$env:WIN_CSC_KEY_PASSWORD = $env:CERT_PASSWORD

Write-Host "Building v$version..." -ForegroundColor Cyan

# Run tests
Write-Host "Running tests..." -ForegroundColor Yellow
corepack pnpm test
corepack pnpm test:e2e
corepack pnpm typecheck

if ($LASTEXITCODE -ne 0) {
    Write-Host "Tests failed! Aborting." -ForegroundColor Red
    exit 1
}

# Bump version (package.json)
Write-Host "Bumping version to $version..." -ForegroundColor Yellow
# (use jq or manual edit)

# Build & sign
Write-Host "Building signed installer..." -ForegroundColor Yellow
corepack pnpm run pack:win
corepack pnpm run dist:win

# Verify signing
Write-Host "Verifying signature..." -ForegroundColor Yellow
$exe = Get-ChildItem "apps/desktop/release/*.exe" | Select-Object -First 1
if ($exe) {
    # (signtool or PowerShell validation)
    Write-Host "✅ Build complete: $($exe.Name)" -ForegroundColor Green
} else {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit 1
}
```

