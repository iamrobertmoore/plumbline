# Implement sub-tasks 1, 2 and 5 of @plumbline-skill-plan.md, with these decisions, and update the plan file to record them:

Documents: look in docs/ first, then the repository root.
Outputs: write everything to a .plumbline/ folder in the audited repository (claims.json, mapping, mutations, results, report.html). Not outputs/.
Stage 4: the mode may run read-only git commands itself (git log, git show, git diff) with execute_command. Also allow execute_command for running plumbline-run.mjs. Nothing else.
PDF: in Stage 1, try reading the PDF natively first. If that fails, say so in claims.json and in the report. Never skip it silently.
Critical correction to Stage 3: the mutation must make the test-plan case's described behaviour false. It must NOT be chosen to make the mapped test fail. The mutation subagent receives only the claim text and the source files the tests import, never the test file itself. Otherwise a test that asserts the wrong thing would get a mutation aimed at what it asserts, and we would never catch a test in name only.
The skill and mode must work when copied into another repository's .bob/ folder. That is how a team installs Plumbline.

---

**Status:** active  **Date:** 2026-09-25

---

### 👤 User

Implement sub-tasks 1, 2 and 5 of @plumbline-skill-plan.md, with these decisions, and update the plan file to record them:

Documents: look in docs/ first, then the repository root.
Outputs: write everything to a .plumbline/ folder in the audited repository (claims.json, mapping, mutations, results, report.html). Not outputs/.
Stage 4: the mode may run read-only git commands itself (git log, git show, git diff) with execute_command. Also allow execute_command for running plumbline-run.mjs. Nothing else.
PDF: in Stage 1, try reading the PDF natively first. If that fails, say so in claims.json and in the report. Never skip it silently.
Critical correction to Stage 3: the mutation must make the test-plan case's described behaviour false. It must NOT be chosen to make the mapped test fail. The mutation subagent receives only the claim text and the source files the tests import, never the test file itself. Otherwise a test that asserts the wrong thing would get a mutation aimed at what it asserts, and we would never catch a test in name only.
The skill and mode must work when copied into another repository's .bob/ folder. That is how a team installs Plumbline.

---

### 🤖 Assistant

> 🔧 called: read_file



> 🔧 **read_file** — plumbline-skill-plan.md

### 🤖 Assistant

> 🔧 called: use_skill, use_skill

Good. Now let me load both skills I need before creating any files.

> 🔧 **use_skill** — create-mode

> 🔧 **use_skill** — create-skill

### 🤖 Assistant

> 🔧 called: update_todo_list

Now I have all the schema information I need. Let me set up the todo list and implement all three sub-tasks.

> 🔧 **update_todo_list** — 
[-] Sub-task 1: Create .bob/custom_modes.yaml with plumbline mode
[ ] Sub-task 2: Write .bob/skills/plumbline/SKILL.md with all six sections
[ ] Sub-task 5: Wire skill activation into the mode's roleDefinition
[ ] Update plumbline-skill-plan.md with all user decisions and status changes


### 🤖 Assistant

> 🔧 called: glob



> 🔧 **glob** — .bob/**/*

### 🤖 Assistant

> 🔧 called: write_file

No existing `.bob/` directory. I'll create the mode file and skill file now. Sub-task 5 depends on Sub-task 2, so I'll do 1 first, then 2, then update the mode for 5.

> 🔧 **write_file** — .bob/custom_modes.yaml

### 🤖 Assistant

> 🔧 called: update_todo_list



> 🔧 **update_todo_list** — 
[x] Sub-task 1: Create .bob/custom_modes.yaml with plumbline mode
[-] Sub-task 2: Write .bob/skills/plumbline/SKILL.md with all six sections
[ ] Sub-task 5: Wire skill activation into the mode's roleDefinition
[ ] Update plumbline-skill-plan.md with all user decisions and status changes


### 🤖 Assistant

> 🔧 called: write_file, write_file

Now write the full skill file incorporating all the user's decisions:Now write the skill. This needs to incorporate all the user decisions:
- `docs/` first, then repo root for documents
- Output to `.plumbline/` folder
- Stage 4 may use `execute_command` for git read commands and `plumbline-run.mjs`
- Stage 1 PDF: try native read first, record failure in claims.json/report if it fails
- Stage 3 critical correction: mutation makes the *described behaviour* false; subagent never sees the test file
- Installable in another repo's `.bob/` folder

> 🔧 **write_file** — .bob/skills/plumbline/SKILL.md

### 🤖 Assistant

> 🔧 called: read_file

Sub-task 2 is done. Now Sub-task 5: the `roleDefinition` already contains the `use_skill` directive. Let me verify the exact wording and confirm the schema has no separate `skills:` key (from the create-mode skill docs — there is no `skills:` array in the schema, so the `roleDefinition` directive is the correct approach). The current mode file already says:

> "Before starting any stage, activate the plumbline skill with use_skill to load the full stage-by-stage instructions."

That is the correct wiring. Sub-task 5 is already satisfied by Sub-task 1's output. Let me verify the file looks correct:

> 🔧 **read_file** — .bob/custom_modes.yaml

### 🤖 Assistant

> 🔧 called: update_todo_list

Good. Now update the plan file to record all decisions and mark sub-tasks 1, 2, and 5 as complete.

> 🔧 **update_todo_list** — 
[x] Sub-task 1: Create .bob/custom_modes.yaml with plumbline mode
[x] Sub-task 2: Write .bob/skills/plumbline/SKILL.md with all six sections
[x] Sub-task 5: Wire skill activation into the mode's roleDefinition
[-] Update plumbline-skill-plan.md with all user decisions and status changes


### 🤖 Assistant

> 🔧 called: write_file



> 🔧 **write_file** — plumbline-skill-plan.md

### 🤖 Assistant

> 🔧 called: update_todo_list



> 🔧 **update_todo_list** — 
[x] Sub-task 1: Create .bob/custom_modes.yaml with plumbline mode
[x] Sub-task 2: Write .bob/skills/plumbline/SKILL.md with all six sections
[x] Sub-task 5: Wire skill activation into the mode's roleDefinition
[x] Update plumbline-skill-plan.md with all user decisions and status changes


### 🤖 Assistant

> 🔧 called: execute_command

Let me do a quick sanity check on the YAML file (no tabs, correct structure):

> 🔧 **execute_command** — python3 -c "import yaml; data = yaml.safe_load(open('.bob/custom_modes.yaml')); print('OK:', [m['slug'] for m in data['customModes']])"

### 🤖 Assistant

> 🔧 called: execute_command



> 🔧 **execute_command** — node -e "const fs=require('fs'); const txt=fs.readFileSync('.bob/custom_modes.yaml','utf8'); if(txt.includes('\t')) throw new Error('tabs found'); console.log('No tabs. Lines:',txt.split('\n').length); console.log('slug present:', txt.includes('slug: plumbline')); console.log('groups present:', txt.includes('groups:')); console.log('execute present:', txt.includes('- execute'));"

### 🤖 Assistant

All three files are in order. Here's a summary of what was done:

---

## Sub-tasks 1, 2 & 5 — Complete

### Files created

**[`.bob/custom_modes.yaml`](.bob/custom_modes.yaml)** (Sub-tasks 1 & 5)
- Slug `plumbline`, name `Plumbline`
- Groups: `read`, `edit`, `execute`, `skill`, `todo`, `subagent`
  - `execute` is included so Stage 4's `git log`/`git show`/`git diff` and `plumbline-run.mjs` are reachable from within the mode
- `roleDefinition` ends with the `use_skill` directive — this is the correct wiring mechanism (the Bob mode schema has no separate `skills:` key)

**[`.bob/skills/plumbline/SKILL.md`](.bob/skills/plumbline/SKILL.md)** (Sub-task 2)
- Six sections with all user decisions baked in:
  - **§ 0** Activation guard (checks `docs/`, `.git`, and file presence)
  - **§ 1** Claims extraction — `docs/` first, repo root fallback; PDF native-read-first with `PDF_UNREADABLE` claim on failure (never silent)
  - **§ 2** Test mapping — one subagent per test file
  - **§ 3** Mutation generation — subagent receives claim text + imported source files **but never the test file**; mutation must falsify the described behaviour, not the test's assertion
  - **§ 4** Judging — `execute_command` explicitly allowed for read-only git commands and `plumbline-run.mjs`
  - **§ 5** HTML report — all outputs to `.plumbline/`
  - **§ 6** `plumbline-run.mjs` protocol reference

**[`plumbline-skill-plan.md`](plumbline-skill-plan.md)** — Updated with:
- A **Decisions table** recording all seven choices
- Sub-tasks 1, 2, 5 marked `[x] complete` with outcomes delivered
- Sub-tasks 3, 4, 6 updated to use `.plumbline/` paths consistently with the decisions