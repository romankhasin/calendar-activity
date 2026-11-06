const fs = require("fs");
const vm = require("vm");

class FakeElement {
  constructor() {
    this.textContent = "";
    this.innerHTML = "";
    this.title = "";
    this.value = "";
    this.dataset = {};
    this.style = {};
    this.disabled = false;
    this.listeners = {};
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  setAttribute() {}
  querySelector() { return null; }
  scrollIntoView() {}
  focus() {}
  click() {}
}

function copy(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function createBackend(initialRow) {
  let row = copy(initialRow);
  return {
    async fetch(_url, options = {}) {
      if (!options.method || options.method === "GET") {
        return { ok: true, status: 200, async json() { return copy(row); } };
      }
      const body = JSON.parse(options.body);
      if (body.expectedRevision !== row.revision) {
        return { ok: false, status: 409, async json() { return { revision: row.revision }; } };
      }
      row = {
        revision: row.revision + 1,
        updated_at: "2026-11-06T00:01:00Z",
        payload: copy(body.payload)
      };
      return { ok: true, status: 200, async json() { return { revision: row.revision, updated_at: row.updated_at }; } };
    },
    get row() { return copy(row); },
    set row(value) { row = copy(value); }
  };
}

async function start(backend) {
  const ids = [
    "todayDate", "todayWeekday", "deadlineCount", "deadlineList", "currentYear", "monthTabs",
    "saveButton", "saveStatus", "calendarTitle", "colorPalette", "deadlineTool", "clearTool",
    "calendarHead", "calendarBody", "addTask", "copyPreviousMonth", "exportData", "importData",
    "toast", "previousYear", "nextYear"
  ];
  const elements = Object.fromEntries(ids.map(id => [id, new FakeElement()]));
  const store = new Map();
  const document = {
    getElementById(id) { return elements[id]; },
    createElement() { return new FakeElement(); }
  };
  const window = {
    CALENDAR_CONFIG: { apiUrl: "https://calendar-api.test" },
    addEventListener() {},
    confirm() { return true; }
  };
  const context = {
    document,
    window,
    localStorage: {
      getItem(key) { return store.get(key) || null; },
      setItem(key, value) { store.set(key, value); }
    },
    Intl, Date, Math, JSON, Number, String, Object, Array, Boolean, Blob, URL,
    FileReader: class {},
    AbortController,
    fetch: backend.fetch,
    requestAnimationFrame(callback) { callback(); },
    setTimeout() { return 1; },
    clearTimeout() {},
    setInterval() { return 1; },
    clearInterval() {},
    console
  };
  vm.runInNewContext(fs.readFileSync("app.js", "utf8"), context);
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  return { elements, store };
}

function selectMonth(app, month) {
  app.elements.monthTabs.listeners.click({
    target: { closest() { return { dataset: { month: String(month) } }; } }
  });
}

(async () => {
  const backend = createBackend({
    revision: 1,
    updated_at: "2026-11-06T00:00:00Z",
    payload: { version: 2, months: {} }
  });
  const app = await start(backend);

  selectMonth(app, 10);
  app.elements.addTask.listeners.click();
  await app.elements.saveButton.listeners.click();
  if (backend.row.revision !== 2 || backend.row.payload.months["2026-11"]?.tasks.length !== 1) {
    throw new Error(`Shared save failed: ${JSON.stringify({ revision: backend.row.revision, months: Object.keys(backend.row.payload.months) })}`);
  }

  app.elements.addTask.listeners.click();
  backend.row = { ...backend.row, revision: 3 };
  await app.elements.saveButton.listeners.click();
  if (app.elements.saveStatus.textContent !== "На сервере есть более новая версия") throw new Error("Revision conflict was not detected");

  console.log("shared storage smoke tests passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
