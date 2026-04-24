# BuildSkill

# BuilldSkill-

BuildSkill is a lightweight spec-first workflow tool.

## Install

Install from GitHub:

```bash
npm install -g https://github.com/chydevit/BuilldSkill-.git
```

Then use it inside any project:

```bash
buildskill /init
buildskill /create add dark mode task tracker
buildskill /apply add-dark-mode-task-tracker
```

If you publish this package to npm later, the install command can become:

```bash
npm install -g buildskill@latest
```

## Local Setup

Use these steps when you clone this repository and want to run BuildSkill locally.

### Prerequisites

- Node.js 18 or newer
- npm

Check your versions:

```bash
node --version
npm --version
```

### Install Dependencies

From the project root:

```bash
npm install
```

This project currently uses only Node.js built-in modules, so install should be quick.

### Run Locally

Start the interactive CLI:

```bash
npm start
```

Run a command directly:

```bash
npm start -- /init
npm start -- /create add dark mode task tracker
npm start -- /apply add-dark-mode-task-tracker
npm start -- /status
```

You can also use the npm script shortcuts:

```bash
npm run create -- add dark mode task tracker
npm run apply -- add-dark-mode-task-tracker
npm run status
npm run demo
```

### Optional: Link The CLI Globally

If you want to test the `buildskill` command as a local global CLI:

```bash
npm link
buildskill /init
buildskill /create add dark mode task tracker
buildskill /apply add-dark-mode-task-tracker
```

To remove the local global link later:

```bash
npm unlink -g buildskill
```

### Open Generated Builds

After running `/apply`, BuildSkill writes the app to `builds/<change-id>/`.
For example:

```text
builds/add-dark-mode-task-tracker/index.html
```

Open that `index.html` file in a browser to run the generated static app.

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
buildskill
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
buildskill /init
buildskill /create add dark mode task tracker
buildskill /apply add-dark-mode-task-tracker
buildskill /status
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
