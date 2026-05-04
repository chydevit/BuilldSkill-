# BuildSkill

BuildSkill is a lightweight spec-first workflow tool.

## Install

Install it in your project:

```bash
npm install --save-dev git+https://github.com/chydevit/BuilldSkill-.git
```

Then create your project idea and call BuildSkill:

```bash
npx buildskill /init
npx buildskill /create create coffee ordering system
npx buildskill /apply create-coffee-ordering-system
```

## How To Use

Simple flow:

1. Install it in your project:

```bash
npm install --save-dev git+https://github.com/chydevit/BuilldSkill-.git
```

2. Initialize BuildSkill:

```bash
npx buildskill /init
```

3. Create your project idea and call the skill:

```bash
npx buildskill /create create coffee ordering system
```

This creates the change files, prompt, and spec files in:

```text
buildskill/changes/create-coffee-ordering-system/
```

4. Apply the skill output to generate the app:

```bash
npx buildskill /apply create-coffee-ordering-system
```

After `/apply`, open the generated file in your browser:

```text
builds/create-coffee-ordering-system/index.html
```

Example prompts:

- `npx buildskill /create create coffee ordering system`
- `npx buildskill /create build budget tracker`
- `npx buildskill /create create recipe organizer`
- `npx buildskill /create add workout tracker`
- `npx buildskill /create build contact directory`
- `npx buildskill /create create event planner`
- `npx buildskill /create build invoice tracker`
- `npx buildskill /create add booking manager`
- `npx buildskill /create create study planner`

## Install And Use In Project

Install it:

```bash
npm install --save-dev git+https://github.com/chydevit/BuilldSkill-.git
```

Use it in the project:

```bash
npx buildskill /init
npx buildskill /create create coffee ordering system
npx buildskill /apply create-coffee-ordering-system
npx buildskill /status
```

You can also install it globally if you want the `buildskill` command available everywhere:

```bash
npm install -g git+https://github.com/chydevit/BuilldSkill-.git
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
npm start -- /skills
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
buildskill /skills
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
/skills
/create add dark mode task tracker
/apply add-dark-mode-task-tracker
/status
/archive add-dark-mode-task-tracker
```

Direct mode:

```bash
buildskill /init
buildskill /skills
buildskill /create add dark mode task tracker
buildskill /apply add-dark-mode-task-tracker
buildskill /status
```

## Built-In Skills

Use `/skills` to list the built-in generators. BuildSkill now infers a starter type from the keywords in your idea:

- `task`: todo, planner, checklist, kanban
- `budget`: budget, expense, finance, money
- `quiz`: quiz, trivia, flashcard, game
- `notes`: note, memo, journal
- `habit`: habit, streak, routine, daily
- `inventory`: inventory, stock, warehouse, product, catalog
- `recipe`: recipe, meal, cook, kitchen, food, menu
- `workout`: workout, fitness, exercise, gym, training
- `contact`: contact, crm, client, customer, directory
- `event`: event, calendar, schedule, meetup, agenda
- `invoice`: invoice, billing, bill, payment, receipt
- `booking`: booking, reservation, appointment, slot, hotel
- `study`: study, lesson, course, revision, learning, class

Examples:

```bash
buildskill /create build budget tracker
buildskill /create create quiz game
buildskill /create add notes journal
buildskill /create add habit tracker with dark mode
buildskill /create build inventory catalog
buildskill /create create recipe organizer
buildskill /create add workout tracker
buildskill /create build contact directory
buildskill /create create event planner
buildskill /create build invoice tracker
buildskill /create add booking manager
buildskill /create create study planner
```

## Workflow

`/create <idea>` creates planning artifacts and infers the closest built-in skill:

- `proposal.md`: why and what changes
- `design.md`: implementation approach
- `tasks.md`: checklist
- `specs/app/spec.md`: requirements and scenarios
- `plan.json`: machine-readable build plan

`/apply <change>` reads `plan.json`, creates files under `builds/<change>/`, and checks off completed tasks.

`/archive <change>` moves completed changes into `buildskill/changes/archive/`.

BuildSkill gives you the spec-first loop: create a structured change first, then apply it into working files.
