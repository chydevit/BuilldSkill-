#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = process.cwd();
const buildskillDir = path.join(rootDir, "buildskill");
const changesDir = path.join(buildskillDir, "changes");
const specsDir = path.join(buildskillDir, "specs");
const buildsDir = path.join(rootDir, "builds");

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    await runInteractive();
    return;
  }

  await runCommand(args.join(" "));
}

async function runInteractive() {
  console.log("BuildSkill");
  console.log("Commands: /init, /skills, /create <idea>, /apply <change>, /status, /archive <change>, /exit");

  const rl = readline.createInterface({ input, output });

  try {
    while (true) {
      const line = await rl.question("> ");
      const commandLine = line.trim();
      if (!commandLine) continue;
      if (commandLine === "/exit" || commandLine === "exit") break;

      try {
        await runCommand(commandLine);
      } catch (error) {
        console.error(`Error: ${error.message}`);
      }
    }
  } finally {
    rl.close();
  }
}

async function runCommand(commandLine) {
  const [command, ...rest] = commandLine.trim().split(/\s+/);
  const value = rest.join(" ").trim();

  switch (command) {
    case "/init":
    case "init":
      await initWorkspace();
      break;
    case "/create":
    case "create":
      await createChange(value);
      break;
    case "/skills":
    case "skills":
    case "/catalog":
    case "catalog":
      showSkills();
      break;
    case "/apply":
    case "apply":
      await applyChange(value);
      break;
    case "/status":
    case "status":
      await showStatus();
      break;
    case "/archive":
    case "archive":
      await archiveChange(value);
      break;
    case "/help":
    case "help":
      printHelp();
      break;
    default:
      throw new Error(`Unknown command "${command}". Use /help to see available commands.`);
  }
}

async function initWorkspace(options = {}) {
  await fs.mkdir(changesDir, { recursive: true });
  await fs.mkdir(specsDir, { recursive: true });

  const configPath = path.join(buildskillDir, "config.json");
  if (!(await exists(configPath))) {
    await writeJson(configPath, {
      project: path.basename(rootDir),
      workflow: "spec-driven",
      version: 1
    });
  }

  const readmePath = path.join(buildskillDir, "README.md");
  if (!(await exists(readmePath))) {
    await fs.writeFile(readmePath, renderBuildSkillReadme(), "utf8");
  }

  if (!options.silent) {
    console.log(`Initialized: ${relative(buildskillDir)}`);
  }
}

async function createChange(idea) {
  if (!idea) {
    throw new Error("Please provide an idea, for example: /create add dark mode task tracker");
  }

  await initWorkspace({ silent: true });

  const plan = buildPlan(idea);
  const changeDir = path.join(changesDir, plan.changeId);
  if (await exists(changeDir)) {
    throw new Error(`Change already exists: ${relative(changeDir)}`);
  }

  await fs.mkdir(path.join(changeDir, "specs", "app"), { recursive: true });
  await fs.writeFile(path.join(changeDir, "proposal.md"), renderProposal(plan), "utf8");
  await fs.writeFile(path.join(changeDir, "design.md"), renderDesign(plan), "utf8");
  await fs.writeFile(path.join(changeDir, "tasks.md"), renderTasks(plan), "utf8");
  await fs.writeFile(path.join(changeDir, "specs", "app", "spec.md"), renderSpec(plan), "utf8");
  await writeJson(path.join(changeDir, "plan.json"), plan);

  console.log(`Created: ${relative(changeDir)}`);
  console.log("Artifacts:");
  console.log(`- ${relative(path.join(changeDir, "proposal.md"))}`);
  console.log(`- ${relative(path.join(changeDir, "design.md"))}`);
  console.log(`- ${relative(path.join(changeDir, "tasks.md"))}`);
  console.log(`- ${relative(path.join(changeDir, "specs", "app", "spec.md"))}`);
  console.log(`Next: /apply ${plan.changeId}`);
}

async function applyChange(changeInput) {
  const changeDir = await resolveChangeDir(changeInput);
  const plan = await readJson(path.join(changeDir, "plan.json"));
  const buildDir = path.join(buildsDir, plan.changeId);

  await fs.mkdir(buildDir, { recursive: true });

  const files = createBuildFiles(plan);
  for (const [fileName, content] of Object.entries(files)) {
    const target = path.join(buildDir, fileName);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, "utf8");
  }

  await markTasksDone(path.join(changeDir, "tasks.md"));
  await fs.writeFile(path.join(changeDir, "applied.md"), renderApplied(plan, files), "utf8");

  console.log(`Applied: ${plan.changeId}`);
  console.log(`Built: ${relative(buildDir)}`);
  for (const fileName of Object.keys(files)) {
    console.log(`- ${relative(path.join(buildDir, fileName))}`);
  }
}

async function showStatus() {
  await initWorkspace({ silent: true });

  const entries = await fs.readdir(changesDir, { withFileTypes: true });
  const changes = entries
    .filter((entry) => entry.isDirectory() && entry.name !== "archive")
    .map((entry) => entry.name)
    .sort();

  if (changes.length === 0) {
    console.log("No active changes.");
    return;
  }

  for (const changeId of changes) {
    const changeDir = path.join(changesDir, changeId);
    const applied = await exists(path.join(changeDir, "applied.md"));
    const tasks = await readTaskProgress(path.join(changeDir, "tasks.md"));
    console.log(`${changeId}: ${applied ? "applied" : "planned"} (${tasks.done}/${tasks.total} tasks done)`);
  }
}

async function archiveChange(changeInput) {
  const changeDir = await resolveChangeDir(changeInput);
  const changeId = path.basename(changeDir);
  const archiveDir = path.join(changesDir, "archive");
  const date = new Date().toISOString().slice(0, 10);
  const target = path.join(archiveDir, `${date}-${changeId}`);

  if (await exists(target)) {
    throw new Error(`Archive target already exists: ${relative(target)}`);
  }

  await fs.mkdir(archiveDir, { recursive: true });
  await fs.rename(changeDir, target);

  console.log(`Archived: ${relative(target)}`);
}

function buildPlan(idea) {
  const keywords = extractKeywords(idea);
  const changeId = slugify(idea);
  const title = toTitle(changeId);
  const appName = title.replace(/^(Add|Create|Build|Make|Implement|Fix)\s+/i, "");
  const hasDarkMode = keywords.includes("dark");
  const appType = detectAppType(keywords);
  const skill = getSkillDefinition(appType);
  const features = [
    `Focused interface for ${appName}.`,
    ...skill.features
  ];

  if (hasDarkMode) features.push("Toggle and persist dark mode.");

  return {
    changeId,
    title,
    appName,
    idea,
    createdAt: new Date().toISOString(),
    capability: "app",
    outputDir: `builds/${changeId}`,
    files: ["index.html", "styles.css", "script.js", "README.md"],
    features,
    flags: {
      darkMode: hasDarkMode,
      appType
    },
    tasks: [
      "Create static app shell",
      ...skill.tasks,
      "Persist state in localStorage",
      hasDarkMode ? "Add theme toggle and dark mode styles" : "Add responsive light theme styles",
      "Write README run instructions"
    ]
  };
}

function renderProposal(plan) {
  return `# ${plan.title}

## Why

${plan.idea}

The goal is to convert the idea into a small, runnable first version with enough structure to extend safely.

## What Changes

${plan.features.map((feature) => `- ${feature}`).join("\n")}

## Capabilities

### New Capabilities

- \`${plan.capability}\`: User-facing static web app generated from this change.

## Impact

- Output folder: \`${plan.outputDir}\`
- Generated files: ${plan.files.map((file) => `\`${file}\``).join(", ")}
- No external dependencies are required.
`;
}

function renderDesign(plan) {
  return `# Design

## Approach

- Build a static web app that runs by opening \`index.html\`.
- Keep all state in browser localStorage.
- Keep implementation in \`index.html\`, \`styles.css\`, and \`script.js\`.
- Make the generated files readable so they can become a real project starting point.

## Data Model

\`\`\`json
${JSON.stringify(getDataModel(plan.flags.appType), null, 2)}
\`\`\`

## Notes

${plan.flags.darkMode ? "- Theme preference is stored separately from app data." : "- Theme support is not included for this change."}
${getDesignNotes(plan.flags.appType)}
`;
}

function renderTasks(plan) {
  const verificationStep = {
    task: "Add an item and refresh to confirm persistence",
    budget: "Add an expense and refresh to confirm totals persist",
    quiz: "Answer a question and refresh to confirm progress persists",
    notes: "Save a note and refresh to confirm persistence",
    habit: "Toggle a habit and refresh to confirm persistence",
    inventory: "Add an inventory item and refresh to confirm persistence",
    recipe: "Add a recipe and refresh to confirm persistence",
    workout: "Add a workout item and refresh to confirm persistence",
    contact: "Add a contact and refresh to confirm persistence",
    event: "Add an event and refresh to confirm persistence",
    invoice: "Add an invoice item and refresh to confirm persistence",
    booking: "Add a booking and refresh to confirm persistence",
    study: "Add a study topic and refresh to confirm persistence"
  };

  return `# Tasks

${plan.tasks.map((task, index) => `- [ ] ${index + 1}. ${task}`).join("\n")}

## Verification

- [ ] Run \`npm start -- /apply ${plan.changeId}\`
- [ ] Open \`${plan.outputDir}/index.html\` in a browser
- [ ] ${verificationStep[plan.flags.appType] || verificationStep.task}
${plan.flags.darkMode ? `- [ ] Toggle dark mode and refresh to confirm persistence\n` : ""}`;
}

function renderSpec(plan) {
  const darkModeRequirement = plan.flags.darkMode
    ? `
### Requirement: Theme Preference

The app SHALL allow users to switch between light and dark mode.

#### Scenario: User toggles dark mode
- GIVEN the app is open
- WHEN the user activates the theme control
- THEN the app changes theme
- AND the selected theme is saved for the next visit
`
    : "";

  const specBuilders = {
    task: renderTaskSpec,
    budget: renderBudgetSpec,
    quiz: renderQuizSpec,
    notes: renderNotesSpec,
    habit: renderHabitSpec,
    inventory: renderInventorySpec,
    recipe: renderRecipeSpec,
    workout: renderWorkoutSpec,
    contact: renderContactSpec,
    event: renderEventSpec,
    invoice: renderInvoiceSpec,
    booking: renderBookingSpec,
    study: renderStudySpec
  };

  return specBuilders[plan.flags.appType](plan, darkModeRequirement);
}

function renderApplied(plan, files) {
  return `# Applied

Change \`${plan.changeId}\` was applied.

## Output

${Object.keys(files).map((file) => `- \`${plan.outputDir}/${file}\``).join("\n")}
`;
}

function createBuildFiles(plan) {
  const appTitle = escapeHtml(plan.appName);
  const themeButton = plan.flags.darkMode
    ? '<button id="theme-toggle" class="theme-toggle" type="button" aria-label="Toggle theme">Theme</button>'
    : "";
  const appMarkup = renderAppMarkup(plan);

  return {
    "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${appTitle}</title>
    <link rel="stylesheet" href="./styles.css">
  </head>
  <body>
    <main class="shell">
      <section class="workspace" aria-labelledby="app-title">
        <header class="header">
          <div>
            <p class="eyebrow">BuildSkill build</p>
            <h1 id="app-title">${appTitle}</h1>
          </div>
          ${themeButton}
        </header>

        <p class="summary">${escapeHtml(plan.idea)}</p>

        ${appMarkup}
      </section>
    </main>
    <script src="./script.js"></script>
  </body>
</html>
`,
    "styles.css": renderCss(),
    "script.js": renderScript(plan),
    "README.md": `# ${plan.appName}

Generated from BuildSkill change \`${plan.changeId}\`.

## Run

Open \`index.html\` in a browser.

## Source Change

See \`../../buildskill/changes/${plan.changeId}/\`.
`
  };
}

function renderCss() {
  return `:root {
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --page: #f4f6f8;
  --surface: #ffffff;
  --text: #151b23;
  --muted: #5b6673;
  --border: #d9e0e8;
  --accent: #0f766e;
  --accent-text: #ffffff;
  --shadow: rgba(21, 27, 35, 0.09);
}

body.dark {
  color-scheme: dark;
  --page: #0f1419;
  --surface: #182028;
  --text: #eef3f8;
  --muted: #a8b3bf;
  --border: #33414f;
  --accent: #5ee0c2;
  --accent-text: #071310;
  --shadow: rgba(0, 0, 0, 0.28);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background: var(--page);
  color: var(--text);
}

button,
input {
  font: inherit;
}

.shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 32px 16px;
}

.workspace {
  width: min(780px, 100%);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 28px;
  box-shadow: 0 18px 45px var(--shadow);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.eyebrow {
  margin: 0 0 8px;
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 800;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  font-size: clamp(2rem, 6vw, 3.4rem);
  line-height: 1;
}

.summary {
  margin: 16px 0 24px;
  color: var(--muted);
  line-height: 1.6;
}

.theme-toggle,
.input-row button {
  border: 0;
  border-radius: 6px;
  background: var(--accent);
  color: var(--accent-text);
  font-weight: 800;
  cursor: pointer;
}

.theme-toggle {
  padding: 9px 12px;
}

.item-form label {
  display: block;
  margin-bottom: 8px;
  font-weight: 800;
}

.form-grid {
  display: grid;
  gap: 12px;
}

.input-row {
  display: flex;
  gap: 10px;
}

.input-row input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px 14px;
  background: var(--surface);
  color: var(--text);
}

.input-row button {
  padding: 12px 18px;
}

.field {
  display: grid;
  gap: 8px;
}

.field label {
  font-weight: 800;
}

.field small {
  color: var(--muted);
}

.field input,
.field textarea,
.field select {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px 14px;
  background: var(--surface);
  color: var(--text);
}

.field textarea {
  min-height: 110px;
  resize: vertical;
}

.stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 20px 0;
}

.stats div,
.item-list li {
  border: 1px solid var(--border);
  border-radius: 8px;
}

.stats div {
  padding: 14px;
}

.stats strong {
  display: block;
  font-size: 1.8rem;
}

.stats span {
  color: var(--muted);
}

.item-list {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.item-list li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
}

.item-list li.stack {
  display: grid;
  gap: 8px;
}

.item-list li.stack .row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.item-list input {
  width: 18px;
  height: 18px;
}

.item-list span {
  flex: 1;
}

.item-list li.done span {
  color: var(--muted);
  text-decoration: line-through;
}

.meta {
  color: var(--muted);
  font-size: 0.95rem;
}

.badge {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 4px 10px;
  color: var(--muted);
  font-size: 0.85rem;
  font-weight: 700;
}

.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.secondary-button {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  padding: 10px 14px;
}

.choice-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.choice-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px;
}

.choice-card button {
  margin-top: 12px;
  width: 100%;
  border: 0;
  border-radius: 6px;
  background: var(--accent);
  color: var(--accent-text);
  font-weight: 800;
  cursor: pointer;
  padding: 10px 12px;
}

@media (max-width: 560px) {
  .workspace {
    padding: 20px;
  }

  .header,
  .input-row {
    flex-direction: column;
  }

  .theme-toggle,
  .input-row button,
  .secondary-button {
    width: 100%;
  }
}
`;
}

function renderScript(plan) {
  const config = getAppConfig(plan);

  return `const appConfig = ${JSON.stringify(config, null, 2)};
const storageKey = appConfig.storageKey;
const themeKey = "buildskill:${plan.changeId}:theme";
const form = document.querySelector("#item-form");
const list = document.querySelector("#item-list");
const themeToggle = document.querySelector("#theme-toggle");
const stats = Object.fromEntries(
  Object.keys(appConfig.stats).map((key) => [key, document.querySelector(appConfig.stats[key])])
);
const emptyState = document.querySelector("#empty-state");
let state = loadState();

if (localStorage.getItem(themeKey) === "dark") {
  document.body.classList.add("dark");
}

themeToggle?.addEventListener("click", () => {
  document.body.classList.toggle("dark");
  localStorage.setItem(themeKey, document.body.classList.contains("dark") ? "dark" : "light");
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = Object.fromEntries(new FormData(form).entries());
  const nextState = reducers[appConfig.type].submit(state, formData);
  if (!nextState) return;
  state = nextState;
  form.reset();
  saveAndRender();
});

list?.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;

  const { action, id, value } = target.dataset;
  const nextState = reducers[appConfig.type].action(state, { action, id, value });
  if (!nextState) return;
  state = nextState;
  saveAndRender();
});

list?.addEventListener("change", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;

  const { action, id } = target.dataset;
  const nextState = reducers[appConfig.type].action(state, { action, id, checked: target.checked });
  if (!nextState) return;
  state = nextState;
  saveAndRender();
});

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      localStorage.removeItem(storageKey);
    }
  }

  return structuredClone(appConfig.defaultState);
}

function saveAndRender() {
  localStorage.setItem(storageKey, JSON.stringify(state));
  render();
}

function render() {
  const view = renderers[appConfig.type](state);
  if (list) {
    list.innerHTML = view.html;
  }
  if (emptyState) {
    emptyState.hidden = !view.empty;
  }
  for (const [key, value] of Object.entries(view.stats)) {
    if (stats[key]) {
      stats[key].textContent = String(value);
    }
  }
}

const reducers = {
  task: {
    submit(currentState, formData) {
      const text = String(formData.text || "").trim();
      if (!text) return null;
      return {
        ...currentState,
        items: [{ id: crypto.randomUUID(), text, done: false }, ...currentState.items]
      };
    },
    action(currentState, payload) {
      if (payload.action !== "toggle-task") return null;
      return {
        ...currentState,
        items: currentState.items.map((item) =>
          item.id === payload.id ? { ...item, done: payload.checked } : item
        )
      };
    }
  },
  budget: {
    submit(currentState, formData) {
      const label = String(formData.label || "").trim();
      const amount = Number(formData.amount || 0);
      if (!label || Number.isNaN(amount) || amount <= 0) return null;
      return {
        ...currentState,
        entries: [{ id: crypto.randomUUID(), label, amount }, ...currentState.entries]
      };
    },
    action(currentState, payload) {
      if (payload.action !== "delete-entry") return null;
      return {
        ...currentState,
        entries: currentState.entries.filter((entry) => entry.id !== payload.id)
      };
    }
  },
  quiz: {
    submit(currentState) {
      return currentState;
    },
    action(currentState, payload) {
      if (payload.action !== "answer") return null;
      if (currentState.currentIndex >= currentState.questions.length) return null;
      const question = currentState.questions[currentState.currentIndex];
      const selected = Number(payload.value);
      const correct = selected === question.answer;

      return {
        ...currentState,
        currentIndex: currentState.currentIndex + 1,
        score: currentState.score + (correct ? 1 : 0),
        answered: [...currentState.answered, { id: question.id, selected, correct }]
      };
    }
  },
  notes: {
    submit(currentState, formData) {
      const title = String(formData.title || "").trim();
      const content = String(formData.content || "").trim();
      if (!title && !content) return null;
      return {
        ...currentState,
        notes: [{ id: crypto.randomUUID(), title: title || "Untitled note", content }, ...currentState.notes]
      };
    },
    action(currentState, payload) {
      if (payload.action !== "delete-note") return null;
      return {
        ...currentState,
        notes: currentState.notes.filter((note) => note.id !== payload.id)
      };
    }
  },
  habit: {
    submit(currentState, formData) {
      const name = String(formData.name || "").trim();
      if (!name) return null;
      return {
        ...currentState,
        habits: [{ id: crypto.randomUUID(), name, streak: 0, completedToday: false }, ...currentState.habits]
      };
    },
    action(currentState, payload) {
      if (payload.action !== "toggle-habit") return null;
      return {
        ...currentState,
        habits: currentState.habits.map((habit) => {
          if (habit.id !== payload.id) return habit;
          const completedToday = !habit.completedToday;
          return {
            ...habit,
            completedToday,
            streak: completedToday ? habit.streak + 1 : Math.max(0, habit.streak - 1)
          };
        })
      };
    }
  },
  inventory: {
    submit(currentState, formData) {
      const name = String(formData.name || "").trim();
      const quantity = Number(formData.quantity || 0);
      if (!name || Number.isNaN(quantity) || quantity <= 0) return null;
      return {
        ...currentState,
        items: [{ id: crypto.randomUUID(), name, quantity, inStock: true }, ...currentState.items]
      };
    },
    action(currentState, payload) {
      if (payload.action === "toggle-stock") {
        return {
          ...currentState,
          items: currentState.items.map((item) =>
            item.id === payload.id ? { ...item, inStock: payload.checked } : item
          )
        };
      }
      if (payload.action === "delete-inventory") {
        return {
          ...currentState,
          items: currentState.items.filter((item) => item.id !== payload.id)
        };
      }
      return null;
    }
  },
  recipe: {
    submit(currentState, formData) {
      const name = String(formData.name || "").trim();
      const category = String(formData.category || "").trim() || "General";
      const minutes = Number(formData.minutes || 0);
      if (!name || Number.isNaN(minutes) || minutes < 0) return null;
      return {
        ...currentState,
        recipes: [{ id: crypto.randomUUID(), name, category, minutes }, ...currentState.recipes]
      };
    },
    action(currentState, payload) {
      if (payload.action !== "delete-recipe") return null;
      return {
        ...currentState,
        recipes: currentState.recipes.filter((recipe) => recipe.id !== payload.id)
      };
    }
  },
  workout: {
    submit(currentState, formData) {
      const name = String(formData.name || "").trim();
      const reps = String(formData.reps || "").trim() || "1 set";
      if (!name) return null;
      return {
        ...currentState,
        workouts: [{ id: crypto.randomUUID(), name, reps, done: false }, ...currentState.workouts]
      };
    },
    action(currentState, payload) {
      if (payload.action !== "toggle-workout") return null;
      return {
        ...currentState,
        workouts: currentState.workouts.map((workout) =>
          workout.id === payload.id ? { ...workout, done: payload.checked } : workout
        )
      };
    }
  },
  contact: {
    submit(currentState, formData) {
      const name = String(formData.name || "").trim();
      const email = String(formData.email || "").trim();
      const phone = String(formData.phone || "").trim();
      if (!name) return null;
      return {
        ...currentState,
        contacts: [{ id: crypto.randomUUID(), name, email, phone }, ...currentState.contacts]
      };
    },
    action(currentState, payload) {
      if (payload.action !== "delete-contact") return null;
      return {
        ...currentState,
        contacts: currentState.contacts.filter((contact) => contact.id !== payload.id)
      };
    }
  },
  event: {
    submit(currentState, formData) {
      const title = String(formData.title || "").trim();
      const date = String(formData.date || "").trim();
      const location = String(formData.location || "").trim();
      if (!title) return null;
      return {
        ...currentState,
        events: [{ id: crypto.randomUUID(), title, date, location }, ...currentState.events]
      };
    },
    action(currentState, payload) {
      if (payload.action !== "delete-event") return null;
      return {
        ...currentState,
        events: currentState.events.filter((event) => event.id !== payload.id)
      };
    }
  },
  invoice: {
    submit(currentState, formData) {
      const label = String(formData.label || "").trim();
      const amount = Number(formData.amount || 0);
      if (!label || Number.isNaN(amount) || amount <= 0) return null;
      return {
        ...currentState,
        invoices: [{ id: crypto.randomUUID(), label, amount, paid: false }, ...currentState.invoices]
      };
    },
    action(currentState, payload) {
      if (payload.action === "toggle-invoice") {
        return {
          ...currentState,
          invoices: currentState.invoices.map((invoice) =>
            invoice.id === payload.id ? { ...invoice, paid: payload.checked } : invoice
          )
        };
      }
      if (payload.action === "delete-invoice") {
        return {
          ...currentState,
          invoices: currentState.invoices.filter((invoice) => invoice.id !== payload.id)
        };
      }
      return null;
    }
  },
  booking: {
    submit(currentState, formData) {
      const name = String(formData.name || "").trim();
      const date = String(formData.date || "").trim();
      if (!name) return null;
      return {
        ...currentState,
        bookings: [{ id: crypto.randomUUID(), name, date, confirmed: false }, ...currentState.bookings]
      };
    },
    action(currentState, payload) {
      if (payload.action === "toggle-booking") {
        return {
          ...currentState,
          bookings: currentState.bookings.map((booking) =>
            booking.id === payload.id ? { ...booking, confirmed: payload.checked } : booking
          )
        };
      }
      if (payload.action === "delete-booking") {
        return {
          ...currentState,
          bookings: currentState.bookings.filter((booking) => booking.id !== payload.id)
        };
      }
      return null;
    }
  },
  study: {
    submit(currentState, formData) {
      const name = String(formData.name || "").trim();
      const subject = String(formData.subject || "").trim() || "General";
      const minutes = Number(formData.minutes || 0);
      if (!name || Number.isNaN(minutes) || minutes < 0) return null;
      return {
        ...currentState,
        topics: [{ id: crypto.randomUUID(), name, subject, minutes, done: false }, ...currentState.topics]
      };
    },
    action(currentState, payload) {
      if (payload.action !== "toggle-study") return null;
      return {
        ...currentState,
        topics: currentState.topics.map((topic) =>
          topic.id === payload.id ? { ...topic, done: payload.checked } : topic
        )
      };
    }
  }
};

const renderers = {
  task(currentState) {
    const items = currentState.items || [];
    return {
      empty: items.length === 0,
      stats: {
        primary: items.length,
        secondary: items.filter((item) => item.done).length
      },
      html: items
        .map(
          (item) => \`<li class="\${item.done ? "done" : ""}">
            <input type="checkbox" data-action="toggle-task" data-id="\${item.id}" \${item.done ? "checked" : ""}>
            <span>\${escapeHtml(item.text)}</span>
          </li>\`
        )
        .join("")
    };
  },
  budget(currentState) {
    const entries = currentState.entries || [];
    const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
    return {
      empty: entries.length === 0,
      stats: {
        primary: entries.length,
        secondary: \`$\${total.toFixed(2)}\`
      },
      html: entries
        .map(
          (entry) => \`<li class="stack">
            <div class="row">
              <span>\${escapeHtml(entry.label)}</span>
              <strong>$\${entry.amount.toFixed(2)}</strong>
            </div>
            <div class="actions">
              <span class="meta">Tracked expense</span>
              <button class="secondary-button" type="button" data-action="delete-entry" data-id="\${entry.id}">Remove</button>
            </div>
          </li>\`
        )
        .join("")
    };
  },
  quiz(currentState) {
    const question = currentState.questions[currentState.currentIndex];
    const complete = !question;
    const total = currentState.questions.length;
    return {
      empty: false,
      stats: {
        primary: currentState.score,
        secondary: \`\${Math.min(currentState.currentIndex, total)}/\${total}\`
      },
      html: complete
        ? \`<li class="stack">
            <div class="row"><span>Quiz complete</span><span class="badge">\${currentState.score}/\${total}</span></div>
            <p class="meta">Refresh the page to replay the starter quiz or extend \`script.js\` with more questions.</p>
          </li>\`
        : \`<li class="stack">
            <div class="row"><span>\${escapeHtml(question.prompt)}</span><span class="badge">Question \${currentState.currentIndex + 1}</span></div>
            <div class="choice-grid">
              \${question.options
                .map(
                  (option, index) => \`<article class="choice-card">
                    <div>\${escapeHtml(option)}</div>
                    <button type="button" data-action="answer" data-value="\${index}">Choose</button>
                  </article>\`
                )
                .join("")}
            </div>
          </li>\`
    };
  },
  notes(currentState) {
    const notes = currentState.notes || [];
    return {
      empty: notes.length === 0,
      stats: {
        primary: notes.length,
        secondary: notes.reduce((sum, note) => sum + note.content.length, 0)
      },
      html: notes
        .map(
          (note) => \`<li class="stack">
            <div class="row"><span>\${escapeHtml(note.title)}</span><span class="badge">\${note.content.length} chars</span></div>
            <p class="meta">\${escapeHtml(note.content || "No note body yet.")}</p>
            <div class="actions">
              <button class="secondary-button" type="button" data-action="delete-note" data-id="\${note.id}">Delete</button>
            </div>
          </li>\`
        )
        .join("")
    };
  },
  habit(currentState) {
    const habits = currentState.habits || [];
    return {
      empty: habits.length === 0,
      stats: {
        primary: habits.length,
        secondary: habits.filter((habit) => habit.completedToday).length
      },
      html: habits
        .map(
          (habit) => \`<li class="stack">
            <div class="row">
              <span>\${escapeHtml(habit.name)}</span>
              <span class="badge">\${habit.streak} day streak</span>
            </div>
            <div class="actions">
              <label class="meta">
                <input type="checkbox" data-action="toggle-habit" data-id="\${habit.id}" \${habit.completedToday ? "checked" : ""}>
                Completed today
              </label>
            </div>
          </li>\`
        )
        .join("")
    };
  },
  inventory(currentState) {
    const items = currentState.items || [];
    return {
      empty: items.length === 0,
      stats: {
        primary: items.length,
        secondary: items.filter((item) => item.inStock).length
      },
      html: items
        .map(
          (item) => \`<li class="stack \${item.inStock ? "" : "done"}">
            <div class="row">
              <span>\${escapeHtml(item.name)}</span>
              <span class="badge">\${item.quantity} units</span>
            </div>
            <div class="actions">
              <label class="meta">
                <input type="checkbox" data-action="toggle-stock" data-id="\${item.id}" \${item.inStock ? "checked" : ""}>
                In stock
              </label>
              <button class="secondary-button" type="button" data-action="delete-inventory" data-id="\${item.id}">Remove</button>
            </div>
          </li>\`
        )
        .join("")
    };
  },
  recipe(currentState) {
    const recipes = currentState.recipes || [];
    const totalMinutes = recipes.reduce((sum, recipe) => sum + recipe.minutes, 0);
    return {
      empty: recipes.length === 0,
      stats: {
        primary: recipes.length,
        secondary: totalMinutes
      },
      html: recipes
        .map(
          (recipe) => \`<li class="stack">
            <div class="row">
              <span>\${escapeHtml(recipe.name)}</span>
              <span class="badge">\${escapeHtml(recipe.category)}</span>
            </div>
            <div class="actions">
              <span class="meta">\${recipe.minutes} min prep</span>
              <button class="secondary-button" type="button" data-action="delete-recipe" data-id="\${recipe.id}">Remove</button>
            </div>
          </li>\`
        )
        .join("")
    };
  },
  workout(currentState) {
    const workouts = currentState.workouts || [];
    return {
      empty: workouts.length === 0,
      stats: {
        primary: workouts.length,
        secondary: workouts.filter((workout) => workout.done).length
      },
      html: workouts
        .map(
          (workout) => \`<li class="stack \${workout.done ? "done" : ""}">
            <div class="row">
              <span>\${escapeHtml(workout.name)}</span>
              <span class="badge">\${escapeHtml(workout.reps)}</span>
            </div>
            <div class="actions">
              <label class="meta">
                <input type="checkbox" data-action="toggle-workout" data-id="\${workout.id}" \${workout.done ? "checked" : ""}>
                Completed
              </label>
            </div>
          </li>\`
        )
        .join("")
    };
  },
  contact(currentState) {
    const contacts = currentState.contacts || [];
    const reachable = contacts.filter((contact) => contact.email || contact.phone).length;
    return {
      empty: contacts.length === 0,
      stats: {
        primary: contacts.length,
        secondary: reachable
      },
      html: contacts
        .map(
          (contact) => \`<li class="stack">
            <div class="row">
              <span>\${escapeHtml(contact.name)}</span>
              <span class="badge">\${contact.email || contact.phone ? "reachable" : "no details"}</span>
            </div>
            <p class="meta">\${escapeHtml([contact.email, contact.phone].filter(Boolean).join(" | ") || "No contact details yet.")}</p>
            <div class="actions">
              <button class="secondary-button" type="button" data-action="delete-contact" data-id="\${contact.id}">Delete</button>
            </div>
          </li>\`
        )
        .join("")
    };
  },
  event(currentState) {
    const events = currentState.events || [];
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = events.filter((event) => !event.date || event.date >= today).length;
    return {
      empty: events.length === 0,
      stats: {
        primary: events.length,
        secondary: upcoming
      },
      html: events
        .map(
          (event) => \`<li class="stack">
            <div class="row">
              <span>\${escapeHtml(event.title)}</span>
              <span class="badge">\${escapeHtml(event.date || "no date")}</span>
            </div>
            <p class="meta">\${escapeHtml(event.location || "No location yet.")}</p>
            <div class="actions">
              <button class="secondary-button" type="button" data-action="delete-event" data-id="\${event.id}">Delete</button>
            </div>
          </li>\`
        )
        .join("")
    };
  },
  invoice(currentState) {
    const invoices = currentState.invoices || [];
    const total = invoices.reduce((sum, invoice) => sum + invoice.amount, 0);
    return {
      empty: invoices.length === 0,
      stats: {
        primary: invoices.length,
        secondary: \`$\${total.toFixed(2)}\`
      },
      html: invoices
        .map(
          (invoice) => \`<li class="stack \${invoice.paid ? "done" : ""}">
            <div class="row">
              <span>\${escapeHtml(invoice.label)}</span>
              <span class="badge">$\${invoice.amount.toFixed(2)}</span>
            </div>
            <div class="actions">
              <label class="meta">
                <input type="checkbox" data-action="toggle-invoice" data-id="\${invoice.id}" \${invoice.paid ? "checked" : ""}>
                Paid
              </label>
              <button class="secondary-button" type="button" data-action="delete-invoice" data-id="\${invoice.id}">Remove</button>
            </div>
          </li>\`
        )
        .join("")
    };
  },
  booking(currentState) {
    const bookings = currentState.bookings || [];
    return {
      empty: bookings.length === 0,
      stats: {
        primary: bookings.length,
        secondary: bookings.filter((booking) => booking.confirmed).length
      },
      html: bookings
        .map(
          (booking) => \`<li class="stack \${booking.confirmed ? "" : "done"}">
            <div class="row">
              <span>\${escapeHtml(booking.name)}</span>
              <span class="badge">\${escapeHtml(booking.date || "no date")}</span>
            </div>
            <div class="actions">
              <label class="meta">
                <input type="checkbox" data-action="toggle-booking" data-id="\${booking.id}" \${booking.confirmed ? "checked" : ""}>
                Confirmed
              </label>
              <button class="secondary-button" type="button" data-action="delete-booking" data-id="\${booking.id}">Remove</button>
            </div>
          </li>\`
        )
        .join("")
    };
  },
  study(currentState) {
    const topics = currentState.topics || [];
    const totalMinutes = topics.reduce((sum, topic) => sum + topic.minutes, 0);
    return {
      empty: topics.length === 0,
      stats: {
        primary: topics.length,
        secondary: totalMinutes
      },
      html: topics
        .map(
          (topic) => \`<li class="stack \${topic.done ? "done" : ""}">
            <div class="row">
              <span>\${escapeHtml(topic.name)}</span>
              <span class="badge">\${topic.minutes} min</span>
            </div>
            <p class="meta">\${escapeHtml(topic.subject)}</p>
            <div class="actions">
              <label class="meta">
                <input type="checkbox" data-action="toggle-study" data-id="\${topic.id}" \${topic.done ? "checked" : ""}>
                Completed
              </label>
            </div>
          </li>\`
        )
        .join("")
    };
  }
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

render();
`;
}

async function resolveChangeDir(changeInput) {
  await initWorkspace({ silent: true });

  const changeId = changeInput ? slugify(changeInput) : await inferOnlyChange();
  const changeDir = path.join(changesDir, changeId);
  if (!(await exists(changeDir))) {
    throw new Error(`Change not found: ${changeId}`);
  }
  return changeDir;
}

async function inferOnlyChange() {
  const entries = await fs.readdir(changesDir, { withFileTypes: true });
  const changes = entries.filter((entry) => entry.isDirectory() && entry.name !== "archive");
  if (changes.length === 0) throw new Error("No active changes. Run /create first.");
  if (changes.length > 1) throw new Error("Multiple active changes. Pass a change id to /apply.");
  return changes[0].name;
}

async function markTasksDone(tasksPath) {
  const content = await fs.readFile(tasksPath, "utf8");
  const updated = content.replace(/- \[ \]/g, "- [x]");
  await fs.writeFile(tasksPath, updated, "utf8");
}

async function readTaskProgress(tasksPath) {
  if (!(await exists(tasksPath))) return { done: 0, total: 0 };

  const content = await fs.readFile(tasksPath, "utf8");
  const done = [...content.matchAll(/- \[x\]/gi)].length;
  const open = [...content.matchAll(/- \[ \]/g)].length;
  return { done, total: done + open };
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function renderBuildSkillReadme() {
  return `# BuildSkill

\`specs/\` describes current behavior. \`changes/\` contains proposed changes until they are applied or archived.
`;
}

function detectAppType(keywords) {
  const skillMatchers = [
    ["event", ["event", "calendar", "schedule", "meetup", "agenda"]],
    ["invoice", ["invoice", "billing", "bill", "payment", "receipt"]],
    ["booking", ["booking", "reservation", "appointment", "slot", "hotel"]],
    ["study", ["study", "lesson", "course", "revision", "learning", "class"]],
    ["inventory", ["inventory", "stock", "warehouse", "product", "catalog"]],
    ["recipe", ["recipe", "meal", "cook", "kitchen", "food", "menu"]],
    ["workout", ["workout", "fitness", "exercise", "gym", "training"]],
    ["contact", ["contact", "crm", "client", "customer", "directory", "addressbook"]],
    ["budget", ["budget", "money", "finance", "expense", "spending"]],
    ["quiz", ["quiz", "learn", "flashcard", "trivia", "game"]],
    ["notes", ["note", "notes", "journal", "memo", "writing"]],
    ["habit", ["habit", "streak", "routine", "tracker", "daily"]],
    ["task", ["task", "todo", "planner", "kanban", "checklist"]]
  ];

  for (const [type, words] of skillMatchers) {
    if (keywords.some((word) => words.includes(word))) {
      return type;
    }
  }

  return "task";
}

function getSkillDefinition(appType) {
  const definitions = {
    task: {
      features: [
        "Add user-created items from a form.",
        "Persist items in localStorage.",
        "Show live total and completed counts.",
        "Mark items complete."
      ],
      tasks: ["Add input and checklist behavior"]
    },
    budget: {
      features: [
        "Capture spending entries with numeric amounts.",
        "Persist entries in localStorage.",
        "Show live entry count and running total.",
        "Allow quick removal of entries."
      ],
      tasks: ["Add amount entry and total-tracking behavior"]
    },
    quiz: {
      features: [
        "Present a starter multiple-choice quiz.",
        "Track progress and score in the browser.",
        "Persist current quiz session in localStorage.",
        "Provide a clear end state after the last question."
      ],
      tasks: ["Add quiz question flow and answer handling"]
    },
    notes: {
      features: [
        "Create short notes with title and body.",
        "Persist notes in localStorage.",
        "Show live note count and total character count.",
        "Allow notes to be removed."
      ],
      tasks: ["Add note capture and note list behavior"]
    },
    habit: {
      features: [
        "Create habit entries from a form.",
        "Persist habits in localStorage.",
        "Track completed-today state and streak count.",
        "Show live habit and completed counts."
      ],
      tasks: ["Add habit tracking and streak behavior"]
    },
    inventory: {
      features: [
        "Capture inventory items with quantities.",
        "Persist inventory entries in localStorage.",
        "Track live item and in-stock counts.",
        "Allow stock status changes and quick removal."
      ],
      tasks: ["Add inventory entry and stock-management behavior"]
    },
    recipe: {
      features: [
        "Capture recipes with a name, category, and prep time.",
        "Persist recipes in localStorage.",
        "Show live recipe count and total prep minutes.",
        "Allow recipes to be removed."
      ],
      tasks: ["Add recipe entry and recipe list behavior"]
    },
    workout: {
      features: [
        "Capture workout entries with exercise and reps.",
        "Persist workouts in localStorage.",
        "Track live workout and completed counts.",
        "Allow completion toggles for each exercise."
      ],
      tasks: ["Add workout tracking and completion behavior"]
    },
    contact: {
      features: [
        "Capture contacts with name, email, and phone.",
        "Persist contacts in localStorage.",
        "Show live contact count and reachable contact count.",
        "Allow contacts to be removed."
      ],
      tasks: ["Add contact capture and contact list behavior"]
    },
    event: {
      features: [
        "Capture events with title, date, and location.",
        "Persist events in localStorage.",
        "Show live event count and upcoming count.",
        "Allow events to be removed."
      ],
      tasks: ["Add event capture and event list behavior"]
    },
    invoice: {
      features: [
        "Capture invoice items with label and amount.",
        "Persist invoice rows in localStorage.",
        "Show live item count and total billed amount.",
        "Allow payment status toggles."
      ],
      tasks: ["Add invoice entry and payment-tracking behavior"]
    },
    booking: {
      features: [
        "Capture bookings with customer, date, and status.",
        "Persist bookings in localStorage.",
        "Show live booking count and confirmed count.",
        "Allow confirmation toggles and quick removal."
      ],
      tasks: ["Add booking entry and confirmation behavior"]
    },
    study: {
      features: [
        "Capture study topics with subject and duration.",
        "Persist study items in localStorage.",
        "Show live topic count and total planned minutes.",
        "Allow completion tracking for study items."
      ],
      tasks: ["Add study planning and progress behavior"]
    }
  };

  return definitions[appType] || definitions.task;
}

function getDataModel(appType) {
  const models = {
    task: {
      items: [{ id: "string", text: "string", done: false }],
      theme: "light"
    },
    budget: {
      entries: [{ id: "string", label: "string", amount: 0 }],
      theme: "light"
    },
    quiz: {
      questions: [{ id: "string", prompt: "string", options: ["string"], answer: 0 }],
      currentIndex: 0,
      score: 0,
      answered: [],
      theme: "light"
    },
    notes: {
      notes: [{ id: "string", title: "string", content: "string" }],
      theme: "light"
    },
    habit: {
      habits: [{ id: "string", name: "string", streak: 0, completedToday: false }],
      theme: "light"
    },
    inventory: {
      items: [{ id: "string", name: "string", quantity: 1, inStock: true }],
      theme: "light"
    },
    recipe: {
      recipes: [{ id: "string", name: "string", category: "string", minutes: 0 }],
      theme: "light"
    },
    workout: {
      workouts: [{ id: "string", name: "string", reps: "string", done: false }],
      theme: "light"
    },
    contact: {
      contacts: [{ id: "string", name: "string", email: "string", phone: "string" }],
      theme: "light"
    },
    event: {
      events: [{ id: "string", title: "string", date: "string", location: "string" }],
      theme: "light"
    },
    invoice: {
      invoices: [{ id: "string", label: "string", amount: 0, paid: false }],
      theme: "light"
    },
    booking: {
      bookings: [{ id: "string", name: "string", date: "string", confirmed: false }],
      theme: "light"
    },
    study: {
      topics: [{ id: "string", name: "string", subject: "string", minutes: 0, done: false }],
      theme: "light"
    }
  };

  return models[appType] || models.task;
}

function getDesignNotes(appType) {
  const notes = {
    task: "- Items stay intentionally lightweight so the starter can be expanded into tags, dates, or priorities later.",
    budget: "- Amount parsing is lightweight and can be replaced with stricter currency validation later.",
    quiz: "- Starter quiz content is embedded in the generated script so it can be edited without extra tooling.",
    notes: "- Notes remain browser-local and text-first so the generated app has zero setup cost.",
    habit: "- Streak behavior is deliberately simple and can later be replaced with calendar-aware logic.",
    inventory: "- Inventory logic is lightweight and focused on browser-local stock tracking rather than multi-user sync.",
    recipe: "- Recipe entries are intentionally compact so the starter stays fast to extend into richer meal planning later.",
    workout: "- Workout data is text-first so the starter can be adapted into sets, timers, or schedules later.",
    contact: "- Contact validation is intentionally lightweight so the starter works offline with zero setup.",
    event: "- Event scheduling stays browser-local and simple, making it a clean starting point for richer calendar workflows later.",
    invoice: "- Invoice math is intentionally lightweight so the starter can be extended into taxes, discounts, or exports later.",
    booking: "- Booking state is intentionally simple and local, which keeps the generated starter easy to adapt.",
    study: "- Study planning stays lightweight so the starter can later grow into timers, streaks, or spaced repetition."
  };

  return notes[appType] || notes.task;
}

function renderTaskSpec(plan, darkModeRequirement) {
  return `# ${plan.appName} Specification

## Purpose

Define the observable behavior for the generated ${plan.appName} starter app.

## Requirements

### Requirement: Item Creation

The app SHALL allow users to add items from the main form.

#### Scenario: Valid item text
- GIVEN the user enters item text
- WHEN the user submits the form
- THEN the item appears in the list
- AND the total count increases

#### Scenario: Empty item text
- GIVEN the item input is empty
- WHEN the user submits the form
- THEN no item is added
- AND the current list remains unchanged

### Requirement: Local Persistence

The app SHALL save user-created items in browser localStorage.

#### Scenario: Refresh after adding items
- GIVEN the user has added items
- WHEN the browser page is refreshed
- THEN the saved items are restored
${darkModeRequirement}`;
}

function renderBudgetSpec(plan, darkModeRequirement) {
  return `# ${plan.appName} Specification

## Purpose

Define the observable behavior for the generated ${plan.appName} starter app.

## Requirements

### Requirement: Expense Entry

The app SHALL allow users to log an expense label and amount.

#### Scenario: Valid expense
- GIVEN the user enters a label and positive amount
- WHEN the form is submitted
- THEN a new expense appears in the list
- AND the running total updates

#### Scenario: Invalid amount
- GIVEN the amount is empty or not greater than zero
- WHEN the form is submitted
- THEN no expense is added

### Requirement: Local Persistence

The app SHALL save expense entries in browser localStorage.

#### Scenario: Refresh after logging expenses
- GIVEN one or more expenses have been added
- WHEN the browser page is refreshed
- THEN the entries and total are restored
${darkModeRequirement}`;
}

function renderQuizSpec(plan, darkModeRequirement) {
  return `# ${plan.appName} Specification

## Purpose

Define the observable behavior for the generated ${plan.appName} starter app.

## Requirements

### Requirement: Quiz Flow

The app SHALL present one question at a time and advance after an answer.

#### Scenario: Answering a question
- GIVEN a question is visible
- WHEN the user chooses an answer
- THEN the quiz advances to the next question
- AND progress is updated

### Requirement: Score Tracking

The app SHALL track the score for correct answers.

#### Scenario: Correct answer
- GIVEN the selected answer matches the correct answer
- WHEN the user answers
- THEN the score increases by one

### Requirement: Local Persistence

The app SHALL save quiz progress in browser localStorage.

#### Scenario: Refresh mid-quiz
- GIVEN the user has already answered one or more questions
- WHEN the browser page is refreshed
- THEN the quiz resumes from the saved progress
${darkModeRequirement}`;
}

function renderNotesSpec(plan, darkModeRequirement) {
  return `# ${plan.appName} Specification

## Purpose

Define the observable behavior for the generated ${plan.appName} starter app.

## Requirements

### Requirement: Note Creation

The app SHALL allow users to save notes with a title and body.

#### Scenario: Valid note
- GIVEN the user enters a title or body
- WHEN the form is submitted
- THEN the note appears in the notes list

#### Scenario: Empty note
- GIVEN both title and body are empty
- WHEN the user submits the form
- THEN no note is added

### Requirement: Local Persistence

The app SHALL save notes in browser localStorage.

#### Scenario: Refresh after adding notes
- GIVEN one or more notes have been added
- WHEN the browser page is refreshed
- THEN the notes are restored
${darkModeRequirement}`;
}

function renderHabitSpec(plan, darkModeRequirement) {
  return `# ${plan.appName} Specification

## Purpose

Define the observable behavior for the generated ${plan.appName} starter app.

## Requirements

### Requirement: Habit Creation

The app SHALL allow users to create habits from the main form.

#### Scenario: Valid habit name
- GIVEN the user enters a habit name
- WHEN the form is submitted
- THEN the habit appears in the list

### Requirement: Habit Completion

The app SHALL let users mark a habit as completed for today.

#### Scenario: Toggle completion
- GIVEN a habit exists
- WHEN the user toggles the completed control
- THEN the completion state changes
- AND the streak value updates

### Requirement: Local Persistence

The app SHALL save habits in browser localStorage.

#### Scenario: Refresh after tracking habits
- GIVEN one or more habits have been created
- WHEN the browser page is refreshed
- THEN the habits are restored
${darkModeRequirement}`;
}

function renderInventorySpec(plan, darkModeRequirement) {
  return `# ${plan.appName} Specification

## Purpose

Define the observable behavior for the generated ${plan.appName} starter app.

## Requirements

### Requirement: Inventory Entry

The app SHALL allow users to add inventory items with quantities.

#### Scenario: Valid inventory item
- GIVEN the user enters an item name and valid quantity
- WHEN the form is submitted
- THEN the item appears in the inventory list
- AND the item count increases

### Requirement: Stock Status

The app SHALL let users mark whether an item is in stock.

#### Scenario: Toggle stock status
- GIVEN an inventory item exists
- WHEN the user toggles the stock control
- THEN the stock state changes

### Requirement: Local Persistence

The app SHALL save inventory entries in browser localStorage.

#### Scenario: Refresh after adding inventory
- GIVEN one or more inventory items have been added
- WHEN the browser page is refreshed
- THEN the items are restored
${darkModeRequirement}`;
}

function renderRecipeSpec(plan, darkModeRequirement) {
  return `# ${plan.appName} Specification

## Purpose

Define the observable behavior for the generated ${plan.appName} starter app.

## Requirements

### Requirement: Recipe Creation

The app SHALL allow users to add recipes with a name, category, and prep time.

#### Scenario: Valid recipe
- GIVEN the user enters a recipe name
- WHEN the form is submitted
- THEN the recipe appears in the recipes list

### Requirement: Prep Time Tracking

The app SHALL show the combined prep time for stored recipes.

#### Scenario: Add recipe with minutes
- GIVEN a valid recipe and prep time are entered
- WHEN the recipe is saved
- THEN the total prep minutes update

### Requirement: Local Persistence

The app SHALL save recipe entries in browser localStorage.

#### Scenario: Refresh after adding recipes
- GIVEN one or more recipes have been added
- WHEN the browser page is refreshed
- THEN the recipes are restored
${darkModeRequirement}`;
}

function renderWorkoutSpec(plan, darkModeRequirement) {
  return `# ${plan.appName} Specification

## Purpose

Define the observable behavior for the generated ${plan.appName} starter app.

## Requirements

### Requirement: Workout Entry

The app SHALL allow users to add workout entries from the main form.

#### Scenario: Valid workout
- GIVEN the user enters an exercise name
- WHEN the form is submitted
- THEN the workout appears in the list

### Requirement: Completion Tracking

The app SHALL let users mark workouts complete.

#### Scenario: Toggle workout completion
- GIVEN a workout exists
- WHEN the user toggles the completion control
- THEN the workout completion state changes
- AND the completed count updates

### Requirement: Local Persistence

The app SHALL save workouts in browser localStorage.

#### Scenario: Refresh after tracking workouts
- GIVEN one or more workouts have been added
- WHEN the browser page is refreshed
- THEN the workouts are restored
${darkModeRequirement}`;
}

function renderContactSpec(plan, darkModeRequirement) {
  return `# ${plan.appName} Specification

## Purpose

Define the observable behavior for the generated ${plan.appName} starter app.

## Requirements

### Requirement: Contact Creation

The app SHALL allow users to add contacts with basic details.

#### Scenario: Valid contact
- GIVEN the user enters a contact name
- WHEN the form is submitted
- THEN the contact appears in the directory list

### Requirement: Reachability Tracking

The app SHALL show how many contacts have at least one reachable detail.

#### Scenario: Contact with email or phone
- GIVEN a contact includes an email or phone number
- WHEN the contact is saved
- THEN the reachable contact count increases

### Requirement: Local Persistence

The app SHALL save contacts in browser localStorage.

#### Scenario: Refresh after adding contacts
- GIVEN one or more contacts have been added
- WHEN the browser page is refreshed
- THEN the contacts are restored
${darkModeRequirement}`;
}

function renderEventSpec(plan, darkModeRequirement) {
  return `# ${plan.appName} Specification

## Purpose

Define the observable behavior for the generated ${plan.appName} starter app.

## Requirements

### Requirement: Event Creation

The app SHALL allow users to add events with a title, date, and location.

#### Scenario: Valid event
- GIVEN the user enters an event title
- WHEN the form is submitted
- THEN the event appears in the event list

### Requirement: Upcoming Tracking

The app SHALL show how many events are still upcoming.

#### Scenario: Future-dated event
- GIVEN an event date is today or later
- WHEN the event is saved
- THEN the upcoming event count increases

### Requirement: Local Persistence

The app SHALL save events in browser localStorage.

#### Scenario: Refresh after adding events
- GIVEN one or more events have been added
- WHEN the browser page is refreshed
- THEN the events are restored
${darkModeRequirement}`;
}

function renderInvoiceSpec(plan, darkModeRequirement) {
  return `# ${plan.appName} Specification

## Purpose

Define the observable behavior for the generated ${plan.appName} starter app.

## Requirements

### Requirement: Invoice Item Creation

The app SHALL allow users to add invoice items with a label and amount.

#### Scenario: Valid invoice item
- GIVEN the user enters a label and positive amount
- WHEN the form is submitted
- THEN the invoice item appears in the list
- AND the billed total updates

### Requirement: Payment Tracking

The app SHALL let users mark invoice items as paid.

#### Scenario: Toggle paid status
- GIVEN an invoice item exists
- WHEN the user toggles the paid control
- THEN the payment state changes

### Requirement: Local Persistence

The app SHALL save invoice items in browser localStorage.

#### Scenario: Refresh after adding invoice items
- GIVEN one or more invoice items have been added
- WHEN the browser page is refreshed
- THEN the invoice items are restored
${darkModeRequirement}`;
}

function renderBookingSpec(plan, darkModeRequirement) {
  return `# ${plan.appName} Specification

## Purpose

Define the observable behavior for the generated ${plan.appName} starter app.

## Requirements

### Requirement: Booking Creation

The app SHALL allow users to add bookings with a customer and date.

#### Scenario: Valid booking
- GIVEN the user enters a booking name
- WHEN the form is submitted
- THEN the booking appears in the booking list

### Requirement: Confirmation Tracking

The app SHALL let users mark bookings as confirmed.

#### Scenario: Toggle confirmation
- GIVEN a booking exists
- WHEN the user toggles the confirmed control
- THEN the confirmation state changes
- AND the confirmed count updates

### Requirement: Local Persistence

The app SHALL save bookings in browser localStorage.

#### Scenario: Refresh after adding bookings
- GIVEN one or more bookings have been added
- WHEN the browser page is refreshed
- THEN the bookings are restored
${darkModeRequirement}`;
}

function renderStudySpec(plan, darkModeRequirement) {
  return `# ${plan.appName} Specification

## Purpose

Define the observable behavior for the generated ${plan.appName} starter app.

## Requirements

### Requirement: Study Topic Creation

The app SHALL allow users to add study topics with a subject and duration.

#### Scenario: Valid study topic
- GIVEN the user enters a topic name
- WHEN the form is submitted
- THEN the topic appears in the study list

### Requirement: Progress Tracking

The app SHALL let users mark study topics as complete.

#### Scenario: Toggle study completion
- GIVEN a study topic exists
- WHEN the user toggles the completion control
- THEN the completion state changes

### Requirement: Local Persistence

The app SHALL save study topics in browser localStorage.

#### Scenario: Refresh after adding study topics
- GIVEN one or more study topics have been added
- WHEN the browser page is refreshed
- THEN the study topics are restored
${darkModeRequirement}`;
}

function renderAppMarkup(plan) {
  const markup = {
    task: `
        <form id="item-form" class="item-form">
          <label for="item-input">Add item</label>
          <div class="input-row">
            <input id="item-input" name="text" type="text" placeholder="Type a new item" autocomplete="off">
            <button type="submit">Add</button>
          </div>
        </form>

        <section class="stats" aria-label="Stats">
          <div><strong id="primary-count">0</strong><span>Total</span></div>
          <div><strong id="secondary-count">0</strong><span>Done</span></div>
        </section>

        <p id="empty-state" class="meta" hidden>No items yet. Add your first one above.</p>
        <ul id="item-list" class="item-list"></ul>
    `,
    budget: `
        <form id="item-form" class="item-form form-grid">
          <div class="field">
            <label for="entry-label">Expense label</label>
            <input id="entry-label" name="label" type="text" placeholder="Coffee, hosting, groceries" autocomplete="off">
          </div>
          <div class="field">
            <label for="entry-amount">Amount</label>
            <input id="entry-amount" name="amount" type="number" min="0" step="0.01" placeholder="0.00">
          </div>
          <button type="submit" class="theme-toggle">Track expense</button>
        </form>

        <section class="stats" aria-label="Stats">
          <div><strong id="primary-count">0</strong><span>Entries</span></div>
          <div><strong id="secondary-count">$0.00</strong><span>Total</span></div>
        </section>

        <p id="empty-state" class="meta" hidden>No expenses yet. Add one to start tracking.</p>
        <ul id="item-list" class="item-list"></ul>
    `,
    quiz: `
        <form id="item-form" class="item-form" hidden></form>

        <section class="stats" aria-label="Stats">
          <div><strong id="primary-count">0</strong><span>Score</span></div>
          <div><strong id="secondary-count">0/0</strong><span>Progress</span></div>
        </section>

        <ul id="item-list" class="item-list"></ul>
    `,
    notes: `
        <form id="item-form" class="item-form form-grid">
          <div class="field">
            <label for="note-title">Title</label>
            <input id="note-title" name="title" type="text" placeholder="Sprint retrospective">
          </div>
          <div class="field">
            <label for="note-content">Note</label>
            <textarea id="note-content" name="content" placeholder="Write the main idea here..."></textarea>
          </div>
          <button type="submit" class="theme-toggle">Save note</button>
        </form>

        <section class="stats" aria-label="Stats">
          <div><strong id="primary-count">0</strong><span>Notes</span></div>
          <div><strong id="secondary-count">0</strong><span>Characters</span></div>
        </section>

        <p id="empty-state" class="meta" hidden>No notes yet. Create one from the form.</p>
        <ul id="item-list" class="item-list"></ul>
    `,
    habit: `
        <form id="item-form" class="item-form form-grid">
          <div class="field">
            <label for="habit-name">Habit name</label>
            <input id="habit-name" name="name" type="text" placeholder="Read 10 pages">
            <small>Keep it specific so the streak feels meaningful.</small>
          </div>
          <button type="submit" class="theme-toggle">Add habit</button>
        </form>

        <section class="stats" aria-label="Stats">
          <div><strong id="primary-count">0</strong><span>Habits</span></div>
          <div><strong id="secondary-count">0</strong><span>Completed today</span></div>
        </section>

        <p id="empty-state" class="meta" hidden>No habits yet. Add one to start tracking.</p>
        <ul id="item-list" class="item-list"></ul>
    `,
    inventory: `
        <form id="item-form" class="item-form form-grid">
          <div class="field">
            <label for="inventory-name">Item name</label>
            <input id="inventory-name" name="name" type="text" placeholder="Notebook, cable, speaker">
          </div>
          <div class="field">
            <label for="inventory-quantity">Quantity</label>
            <input id="inventory-quantity" name="quantity" type="number" min="1" step="1" placeholder="1">
          </div>
          <button type="submit" class="theme-toggle">Add item</button>
        </form>

        <section class="stats" aria-label="Stats">
          <div><strong id="primary-count">0</strong><span>Items</span></div>
          <div><strong id="secondary-count">0</strong><span>In stock</span></div>
        </section>

        <p id="empty-state" class="meta" hidden>No inventory items yet. Add one to start tracking.</p>
        <ul id="item-list" class="item-list"></ul>
    `,
    recipe: `
        <form id="item-form" class="item-form form-grid">
          <div class="field">
            <label for="recipe-name">Recipe name</label>
            <input id="recipe-name" name="name" type="text" placeholder="Pasta salad">
          </div>
          <div class="field">
            <label for="recipe-category">Category</label>
            <input id="recipe-category" name="category" type="text" placeholder="Lunch, dessert, snack">
          </div>
          <div class="field">
            <label for="recipe-minutes">Prep minutes</label>
            <input id="recipe-minutes" name="minutes" type="number" min="0" step="1" placeholder="20">
          </div>
          <button type="submit" class="theme-toggle">Save recipe</button>
        </form>

        <section class="stats" aria-label="Stats">
          <div><strong id="primary-count">0</strong><span>Recipes</span></div>
          <div><strong id="secondary-count">0</strong><span>Total minutes</span></div>
        </section>

        <p id="empty-state" class="meta" hidden>No recipes yet. Add your first recipe.</p>
        <ul id="item-list" class="item-list"></ul>
    `,
    workout: `
        <form id="item-form" class="item-form form-grid">
          <div class="field">
            <label for="workout-name">Exercise</label>
            <input id="workout-name" name="name" type="text" placeholder="Push-ups">
          </div>
          <div class="field">
            <label for="workout-reps">Reps or duration</label>
            <input id="workout-reps" name="reps" type="text" placeholder="3 x 12 or 20 min">
          </div>
          <button type="submit" class="theme-toggle">Add workout</button>
        </form>

        <section class="stats" aria-label="Stats">
          <div><strong id="primary-count">0</strong><span>Workouts</span></div>
          <div><strong id="secondary-count">0</strong><span>Completed</span></div>
        </section>

        <p id="empty-state" class="meta" hidden>No workouts yet. Add one to build a routine.</p>
        <ul id="item-list" class="item-list"></ul>
    `,
    contact: `
        <form id="item-form" class="item-form form-grid">
          <div class="field">
            <label for="contact-name">Name</label>
            <input id="contact-name" name="name" type="text" placeholder="Alex Morgan">
          </div>
          <div class="field">
            <label for="contact-email">Email</label>
            <input id="contact-email" name="email" type="email" placeholder="alex@example.com">
          </div>
          <div class="field">
            <label for="contact-phone">Phone</label>
            <input id="contact-phone" name="phone" type="text" placeholder="+1 555 0100">
          </div>
          <button type="submit" class="theme-toggle">Add contact</button>
        </form>

        <section class="stats" aria-label="Stats">
          <div><strong id="primary-count">0</strong><span>Contacts</span></div>
          <div><strong id="secondary-count">0</strong><span>Reachable</span></div>
        </section>

        <p id="empty-state" class="meta" hidden>No contacts yet. Add one to start your directory.</p>
        <ul id="item-list" class="item-list"></ul>
    `,
    event: `
        <form id="item-form" class="item-form form-grid">
          <div class="field">
            <label for="event-title">Event title</label>
            <input id="event-title" name="title" type="text" placeholder="Coffee tasting">
          </div>
          <div class="field">
            <label for="event-date">Date</label>
            <input id="event-date" name="date" type="date">
          </div>
          <div class="field">
            <label for="event-location">Location</label>
            <input id="event-location" name="location" type="text" placeholder="Main cafe">
          </div>
          <button type="submit" class="theme-toggle">Add event</button>
        </form>

        <section class="stats" aria-label="Stats">
          <div><strong id="primary-count">0</strong><span>Events</span></div>
          <div><strong id="secondary-count">0</strong><span>Upcoming</span></div>
        </section>

        <p id="empty-state" class="meta" hidden>No events yet. Add one to start scheduling.</p>
        <ul id="item-list" class="item-list"></ul>
    `,
    invoice: `
        <form id="item-form" class="item-form form-grid">
          <div class="field">
            <label for="invoice-label">Item label</label>
            <input id="invoice-label" name="label" type="text" placeholder="Website design">
          </div>
          <div class="field">
            <label for="invoice-amount">Amount</label>
            <input id="invoice-amount" name="amount" type="number" min="0" step="0.01" placeholder="250.00">
          </div>
          <button type="submit" class="theme-toggle">Add invoice item</button>
        </form>

        <section class="stats" aria-label="Stats">
          <div><strong id="primary-count">0</strong><span>Items</span></div>
          <div><strong id="secondary-count">$0.00</strong><span>Total billed</span></div>
        </section>

        <p id="empty-state" class="meta" hidden>No invoice items yet. Add one to start billing.</p>
        <ul id="item-list" class="item-list"></ul>
    `,
    booking: `
        <form id="item-form" class="item-form form-grid">
          <div class="field">
            <label for="booking-name">Booking name</label>
            <input id="booking-name" name="name" type="text" placeholder="Alex table reservation">
          </div>
          <div class="field">
            <label for="booking-date">Date</label>
            <input id="booking-date" name="date" type="date">
          </div>
          <button type="submit" class="theme-toggle">Add booking</button>
        </form>

        <section class="stats" aria-label="Stats">
          <div><strong id="primary-count">0</strong><span>Bookings</span></div>
          <div><strong id="secondary-count">0</strong><span>Confirmed</span></div>
        </section>

        <p id="empty-state" class="meta" hidden>No bookings yet. Add one to start tracking.</p>
        <ul id="item-list" class="item-list"></ul>
    `,
    study: `
        <form id="item-form" class="item-form form-grid">
          <div class="field">
            <label for="study-name">Topic</label>
            <input id="study-name" name="name" type="text" placeholder="Espresso extraction">
          </div>
          <div class="field">
            <label for="study-subject">Subject</label>
            <input id="study-subject" name="subject" type="text" placeholder="Coffee science">
          </div>
          <div class="field">
            <label for="study-minutes">Minutes</label>
            <input id="study-minutes" name="minutes" type="number" min="0" step="1" placeholder="45">
          </div>
          <button type="submit" class="theme-toggle">Add study topic</button>
        </form>

        <section class="stats" aria-label="Stats">
          <div><strong id="primary-count">0</strong><span>Topics</span></div>
          <div><strong id="secondary-count">0</strong><span>Total minutes</span></div>
        </section>

        <p id="empty-state" class="meta" hidden>No study topics yet. Add one to start planning.</p>
        <ul id="item-list" class="item-list"></ul>
    `
  };

  return markup[plan.flags.appType] || markup.task;
}

function getAppConfig(plan) {
  const configs = {
    task: {
      type: "task",
      storageKey: `buildskill:${plan.changeId}:items`,
      stats: { primary: "#primary-count", secondary: "#secondary-count" },
      defaultState: {
        items: [
          { id: "starter-1", text: `Plan ${plan.appName}`, done: false },
          { id: "starter-2", text: "Capture the next small milestone", done: false },
          { id: "starter-3", text: "Review the result in the browser", done: true }
        ]
      }
    },
    budget: {
      type: "budget",
      storageKey: `buildskill:${plan.changeId}:entries`,
      stats: { primary: "#primary-count", secondary: "#secondary-count" },
      defaultState: {
        entries: [
          { id: "entry-1", label: "Starter budget item", amount: 18.5 },
          { id: "entry-2", label: "Second tracked cost", amount: 42 }
        ]
      }
    },
    quiz: {
      type: "quiz",
      storageKey: `buildskill:${plan.changeId}:quiz`,
      stats: { primary: "#primary-count", secondary: "#secondary-count" },
      defaultState: {
        currentIndex: 0,
        score: 0,
        answered: [],
        questions: [
          {
            id: "quiz-1",
            prompt: `What is the main goal of ${plan.appName}?`,
            options: ["Ignore the idea", "Turn it into a working starter", "Only write README text"],
            answer: 1
          },
          {
            id: "quiz-2",
            prompt: "Where does the starter save progress?",
            options: ["Browser localStorage", "A remote database", "Server session memory"],
            answer: 0
          },
          {
            id: "quiz-3",
            prompt: "What should you do after generation?",
            options: ["Open the generated app", "Delete the build folder", "Disable persistence"],
            answer: 0
          }
        ]
      }
    },
    notes: {
      type: "notes",
      storageKey: `buildskill:${plan.changeId}:notes`,
      stats: { primary: "#primary-count", secondary: "#secondary-count" },
      defaultState: {
        notes: [
          {
            id: "note-1",
            title: "Starter note",
            content: `Generated for ${plan.appName}. Replace this with your own working notes.`
          }
        ]
      }
    },
    habit: {
      type: "habit",
      storageKey: `buildskill:${plan.changeId}:habits`,
      stats: { primary: "#primary-count", secondary: "#secondary-count" },
      defaultState: {
        habits: [
          { id: "habit-1", name: "Starter habit", streak: 2, completedToday: true },
          { id: "habit-2", name: "Second daily routine", streak: 0, completedToday: false }
        ]
      }
    },
    inventory: {
      type: "inventory",
      storageKey: `buildskill:${plan.changeId}:inventory`,
      stats: { primary: "#primary-count", secondary: "#secondary-count" },
      defaultState: {
        items: [
          { id: "inventory-1", name: "Starter item", quantity: 12, inStock: true },
          { id: "inventory-2", name: "Backup supply", quantity: 4, inStock: false }
        ]
      }
    },
    recipe: {
      type: "recipe",
      storageKey: `buildskill:${plan.changeId}:recipes`,
      stats: { primary: "#primary-count", secondary: "#secondary-count" },
      defaultState: {
        recipes: [
          { id: "recipe-1", name: "Starter recipe", category: "Dinner", minutes: 25 },
          { id: "recipe-2", name: "Quick snack bowl", category: "Snack", minutes: 10 }
        ]
      }
    },
    workout: {
      type: "workout",
      storageKey: `buildskill:${plan.changeId}:workouts`,
      stats: { primary: "#primary-count", secondary: "#secondary-count" },
      defaultState: {
        workouts: [
          { id: "workout-1", name: "Push-ups", reps: "3 x 12", done: false },
          { id: "workout-2", name: "Plank", reps: "60 sec", done: true }
        ]
      }
    },
    contact: {
      type: "contact",
      storageKey: `buildskill:${plan.changeId}:contacts`,
      stats: { primary: "#primary-count", secondary: "#secondary-count" },
      defaultState: {
        contacts: [
          { id: "contact-1", name: "Starter contact", email: "starter@example.com", phone: "" },
          { id: "contact-2", name: "Backup contact", email: "", phone: "+1 555 0102" }
        ]
      }
    },
    event: {
      type: "event",
      storageKey: `buildskill:${plan.changeId}:events`,
      stats: { primary: "#primary-count", secondary: "#secondary-count" },
      defaultState: {
        events: [
          { id: "event-1", title: "Starter event", date: "2026-06-01", location: "Main room" },
          { id: "event-2", title: "Team meetup", date: "2026-06-05", location: "Cafe corner" }
        ]
      }
    },
    invoice: {
      type: "invoice",
      storageKey: `buildskill:${plan.changeId}:invoices`,
      stats: { primary: "#primary-count", secondary: "#secondary-count" },
      defaultState: {
        invoices: [
          { id: "invoice-1", label: "Starter invoice line", amount: 125, paid: false },
          { id: "invoice-2", label: "Follow-up service", amount: 80, paid: true }
        ]
      }
    },
    booking: {
      type: "booking",
      storageKey: `buildskill:${plan.changeId}:bookings`,
      stats: { primary: "#primary-count", secondary: "#secondary-count" },
      defaultState: {
        bookings: [
          { id: "booking-1", name: "Starter booking", date: "2026-06-10", confirmed: true },
          { id: "booking-2", name: "Second reservation", date: "2026-06-12", confirmed: false }
        ]
      }
    },
    study: {
      type: "study",
      storageKey: `buildskill:${plan.changeId}:topics`,
      stats: { primary: "#primary-count", secondary: "#secondary-count" },
      defaultState: {
        topics: [
          { id: "study-1", name: "Starter topic", subject: "Planning", minutes: 30, done: false },
          { id: "study-2", name: "Review notes", subject: "Practice", minutes: 20, done: true }
        ]
      }
    }
  };

  return configs[plan.flags.appType] || configs.task;
}

function extractKeywords(value) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1);
}

function slugify(value) {
  const slug = extractKeywords(value).slice(0, 9).join("-");
  return slug || "new-change";
}

function toTitle(value) {
  return extractKeywords(value)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ") || "New Change";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function relative(filePath) {
  return path.relative(rootDir, filePath).replaceAll("\\", "/");
}

function printHelp() {
  console.log("Usage:");
  console.log("  buildskill /init");
  console.log("  buildskill /skills");
  console.log("  buildskill /create <idea>");
  console.log("  buildskill /apply <change-id>");
  console.log("  buildskill /status");
  console.log("  buildskill /archive <change-id>");
}

function showSkills() {
  console.log("Built-in skills:");
  console.log("- task: checklist or todo-style apps");
  console.log("- budget: expense and amount trackers");
  console.log("- quiz: starter multiple-choice quiz apps");
  console.log("- notes: quick note and memo apps");
  console.log("- habit: daily streak trackers");
  console.log("- inventory: stock and product trackers");
  console.log("- recipe: recipe and meal organizers");
  console.log("- workout: exercise and routine trackers");
  console.log("- contact: simple contact directories");
  console.log("- event: event and calendar planners");
  console.log("- invoice: billing and invoice trackers");
  console.log("- booking: reservation and appointment trackers");
  console.log("- study: study and lesson planners");
  console.log("Use /create with matching keywords, for example:");
  console.log("- /create build budget tracker");
  console.log("- /create create quiz game");
  console.log("- /create add habit tracker with dark mode");
  console.log("- /create build inventory catalog");
  console.log("- /create create recipe organizer");
  console.log("- /create create event planner");
  console.log("- /create build invoice tracker");
}
