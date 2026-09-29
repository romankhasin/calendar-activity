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

function createBackend(initialRow = null) {
  let row = copy(initialRow);
  let realtimeHandler = null;
  const client = {
    from() {
      return {
        select() {
          return { eq() { return { maybeSingle: async () => ({ data: copy(row), error: null }) }; } };
        },
        insert(value) {
          return {
            select() {
              return {
                single: async () => {
                  if (row) return { data: null, error: { code: "23505" } };
                  row = { ...copy(value), updated_at: "2026-09-29T00:00:00Z" };
                  return { data: copy(row), error: null };
                }
              };
            }
          };
        },
        update(value) {
          const filters = {};
          const builder = {
            eq(key, expected) { filters[key] = expected; return builder; },
            select() {
              return {
                maybeSingle: async () => {
                  if (!row || row.id !== filters.id || row.revision !== filters.revision) return { data: null, error: null };
                  row = { ...row, ...copy(value), updated_at: "2026-09-29T00:01:00Z" };
                  return { data: { revision: row.revision, updated_at: row.updated_at }, error: null };
                }
              };
            }
          };
          return builder;
        }
      };
    },
    channel() {
      return {
        on(_event, _filter, handler) { realtimeHandler = handler; return this; },
        subscribe() { return this; }
      };
    },
    removeChannel() {}
  };
  return {
    client,
    get row() { return copy(row); },
    set row(value) { row = copy(value); },
    emit(value) { realtimeHandler?.({ new: copy(value) }); }
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
    CALENDAR_CONFIG: { supabaseUrl: "https://test.supabase.co", supabasePublishableKey: "test-publishable-key" },
    supabase: { createClient() { return backend.client; } },
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
    requestAnimationFrame(callback) { callback(); },
    setTimeout() { return 1; },
    clearTimeout() {},
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
  const backend = createBackend();
  const app = await start(backend);
  if (!backend.row || backend.row.payload.months["2026-09"].tasks.length !== 23) throw new Error("Initial shared state was not created");

  selectMonth(app, 9);
  app.elements.copyPreviousMonth.listeners.click();
  await app.elements.saveButton.listeners.click();
  if (backend.row.revision !== 2 || backend.row.payload.months["2026-10"]?.tasks.length !== 23) {
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
