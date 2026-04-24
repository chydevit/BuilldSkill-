# BuildSkill

# BuilldSkill-

BuildSkill is a lightweight spec-first workflow tool.

It creates a structured change folder before code is generated:

```text
buildskill/
  specs/
  changes/
    add-dark-mode/
      proposal.md
      design.md
      tasks.md
      specs/app/spec.md
      plan.json
```

Then `/apply` reads that change and builds the starter project.

## Commands

Interactive mode:

```bash
npm start
```

Inside the prompt:

```text
/create add dark mode task tracker
/apply add-dark-mode-task-tracker
/status
/archive add-dark-mode-task-tracker
```

Direct mode:

```bash
npm start -- /init
npm start -- /create add dark mode task tracker
npm start -- /apply add-dark-mode-task-tracker
npm start -- /status
```

## Workflow

`/create <idea>` creates planning artifacts:

- `proposal.md`: why and what changes
- `design.md`: implementation approach
- `tasks.md`: checklist
- `specs/app/spec.md`: requirements and scenarios
- `plan.json`: machine-readable build plan

`/apply <change>` reads `plan.json`, creates files under `builds/<change>/`, and checks off completed tasks.

`/archive <change>` moves completed changes into `buildskill/changes/archive/`.

BuildSkill gives you the spec-first loop: create a structured change first, then apply it into working files.
