const storageKey = "buildskill:add-dark-mode-task-tracker:items";
const themeKey = "buildskill:add-dark-mode-task-tracker:theme";
const defaultItems = [
  "Focused interface for Dark Mode Task Tracker.",
  "Add user-created items from a form.",
  "Persist items in localStorage."
];

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
