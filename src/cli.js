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
  console.log("Commands: /init, /create <idea>, /apply <change>, /status, /archive <change>, /exit");

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
  const isTaskApp = keywords.some((word) => ["task", "todo", "planner", "kanban"].includes(word));
  const isBudgetApp = keywords.some((word) => ["budget", "money", "finance", "expense"].includes(word));
  const isQuizApp = keywords.some((word) => ["quiz", "learn", "game"].includes(word));

  const features = [
    `Focused interface for ${appName}.`,
    "Add user-created items from a form.",
    "Persist items in localStorage.",
    "Show live item counts."
  ];

  if (hasDarkMode) features.push("Toggle and persist dark mode.");
  if (isTaskApp) features.push("Mark items complete.");
  if (isBudgetApp) features.push("Track numeric amounts and total value.");
  if (isQuizApp) features.push("Track score or progress.");

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
      taskApp: isTaskApp,
      budgetApp: isBudgetApp,
      quizApp: isQuizApp
    },
    tasks: [
      "Create static app shell",
      "Add input and item list behavior",
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
{
  "items": [
    { "id": "string", "text": "string", "done": false }
  ],
  "theme": "light"
}
\`\`\`

## Notes

${plan.flags.darkMode ? "- Theme preference is stored separately from item data." : "- Theme support is not included for this change."}
${plan.flags.budgetApp ? "- Amount parsing is lightweight and can be replaced with stricter validation later." : "- Item data stays text-first for broad app compatibility."}
`;
}

function renderTasks(plan) {
  return `# Tasks

${plan.tasks.map((task, index) => `- [ ] ${index + 1}. ${task}`).join("\n")}

## Verification

- [ ] Run \`npm start -- /apply ${plan.changeId}\`
- [ ] Open \`${plan.outputDir}/index.html\` in a browser
- [ ] Add an item and refresh to confirm persistence
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

function renderApplied(plan, files) {
  return `# Applied

Change \`${plan.changeId}\` was applied.

## Output

${Object.keys(files).map((file) => `- \`${plan.outputDir}/${file}\``).join("\n")}
`;
}

function createBuildFiles(plan) {
  const appTitle = escapeHtml(plan.appName);
  const starterItems = plan.features.slice(0, 3);
  const themeButton = plan.flags.darkMode
    ? '<button id="theme-toggle" class="theme-toggle" type="button" aria-label="Toggle theme">Theme</button>'
    : "";

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

        <form id="item-form" class="item-form">
          <label for="item-input">Add item</label>
          <div class="input-row">
            <input id="item-input" type="text" placeholder="Type a new item" autocomplete="off">
            <button type="submit">Add</button>
          </div>
        </form>

        <section class="stats" aria-label="Stats">
          <div><strong id="total-count">0</strong><span>Total</span></div>
          <div><strong id="done-count">0</strong><span>Done</span></div>
        </section>

        <ul id="item-list" class="item-list"></ul>
      </section>
    </main>
    <script src="./script.js"></script>
  </body>
</html>
`,
    "styles.css": renderCss(),
    "script.js": renderScript(plan, starterItems),
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

@media (max-width: 560px) {
  .workspace {
    padding: 20px;
  }

  .header,
  .input-row {
    flex-direction: column;
  }

  .theme-toggle,
  .input-row button {
    width: 100%;
  }
}
`;
}

function renderScript(plan, starterItems) {
  return `const storageKey = "buildskill:${plan.changeId}:items";
const themeKey = "buildskill:${plan.changeId}:theme";
const defaultItems = ${JSON.stringify(starterItems, null, 2)};

const form = document.querySelector("#item-form");
const input = document.querySelector("#item-input");
const list = document.querySelector("#item-list");
const totalCount = document.querySelector("#total-count");
const doneCount = document.querySelector("#done-count");
const themeToggle = document.querySelector("#theme-toggle");

let items = loadItems();

if (localStorage.getItem(themeKey) === "dark") {
  document.body.classList.add("dark");
}

themeToggle?.addEventListener("click", () => {
  document.body.classList.toggle("dark");
  localStorage.setItem(themeKey, document.body.classList.contains("dark") ? "dark" : "light");
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  items.unshift({ id: crypto.randomUUID(), text, done: false });
  input.value = "";
  saveAndRender();
});

function loadItems() {
  const saved = localStorage.getItem(storageKey);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      localStorage.removeItem(storageKey);
    }
  }

  return defaultItems.map((text) => ({
    id: crypto.randomUUID(),
    text,
    done: false
  }));
}

function saveAndRender() {
  localStorage.setItem(storageKey, JSON.stringify(items));
  render();
}

function render() {
  list.innerHTML = "";

  for (const item of items) {
    const row = document.createElement("li");
    row.className = item.done ? "done" : "";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = item.done;
    checkbox.addEventListener("change", () => {
      item.done = checkbox.checked;
      saveAndRender();
    });

    const text = document.createElement("span");
    text.textContent = item.text;

    row.append(checkbox, text);
    list.append(row);
  }

  totalCount.textContent = String(items.length);
  doneCount.textContent = String(items.filter((item) => item.done).length);
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
  console.log("  buildskill /create <idea>");
  console.log("  buildskill /apply <change-id>");
  console.log("  buildskill /status");
  console.log("  buildskill /archive <change-id>");
}
