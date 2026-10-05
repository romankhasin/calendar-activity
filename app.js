(function () {
  "use strict";

  const STORAGE_KEY = "level-calendar-activity-v1";
  const SHARED_ROW_ID = "shared";
  const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  const MONTHS_GENITIVE = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const COLORS = [
    { name: "Красный", value: "#f7c4c1" },
    { name: "Золотой", value: "#f5df9f" },
    { name: "Зелёный", value: "#cbe2bf" },
    { name: "Голубой", value: "#cbdff0" },
    { name: "Розовый", value: "#e9d1dc" }
  ];
  const DIRECTION_COLORS = {
    "Запуски": "#c44747", "Финансы": "#9b5588", "Креативы": "#b07819",
    "Аналитика": "#326ca3", "Кликхаус": "#6857a0", "Исследования": "#268275",
    "Спецпроекты": "#a15337", "Медиапланы": "#438047", "ПБА": "#a24c70"
  };

  const now = new Date();
  let visibleYear = now.getFullYear();
  let visibleMonth = now.getMonth();
  let state = loadState();
  let selectedColor = COLORS[1].value;
  let activeTool = "paint";
  let isPointerDown = false;
  let dirty = false;
  let toastTimer = null;
  let supabaseClient = null;
  let serverRevision = null;
  let sharedReady = false;
  let realtimeChannel = null;

  const els = {
    todayDate: document.getElementById("todayDate"),
    todayWeekday: document.getElementById("todayWeekday"),
    deadlineCount: document.getElementById("deadlineCount"),
    deadlineList: document.getElementById("deadlineList"),
    currentYear: document.getElementById("currentYear"),
    monthTabs: document.getElementById("monthTabs"),
    saveButton: document.getElementById("saveButton"),
    saveStatus: document.getElementById("saveStatus"),
    calendarTitle: document.getElementById("calendarTitle"),
    colorPalette: document.getElementById("colorPalette"),
    deadlineTool: document.getElementById("deadlineTool"),
    clearTool: document.getElementById("clearTool"),
    calendarHead: document.getElementById("calendarHead"),
    calendarBody: document.getElementById("calendarBody"),
    addTask: document.getElementById("addTask"),
    copyPreviousMonth: document.getElementById("copyPreviousMonth"),
    exportData: document.getElementById("exportData"),
    importData: document.getElementById("importData"),
    toast: document.getElementById("toast")
  };

  function monthKey(year = visibleYear, month = visibleMonth) {
    return `${year}-${String(month + 1).padStart(2, "0")}`;
  }

  function createId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function emptyMonth() {
    return { tasks: [] };
  }

  function scheduleCells(ranges, color, deadlineDays = []) {
    const cells = {};
    ranges.forEach(([from, to]) => {
      for (let day = from; day <= to; day += 1) cells[day] = { color, deadline: false };
    });
    deadlineDays.forEach(day => {
      cells[day] = { color: cells[day]?.color || color, deadline: true };
    });
    return cells;
  }

  function septemberSourceMonth() {
    const red = COLORS[0].value;
    const gold = COLORS[1].value;
    const green = COLORS[2].value;
    const blue = COLORS[3].value;
    const pink = COLORS[4].value;

    return {
      tasks: [
        { id: createId(), team: "MIG", direction: "Запуски", title: "Запуск Августовских размещений", cells: scheduleCells([[1, 4]], red, [4]) },
        { id: createId(), team: "MIG", direction: "Финансы", title: "Отправляем закрывы за пред. месяц (Август)", cells: scheduleCells([[10, 14]], pink, [14]) },
        { id: createId(), team: "MIG", direction: "Финансы", title: "Плановые приложения за текущий (Сентябрь)", cells: scheduleCells([[24, 25]], pink, [25]) },
        { id: createId(), team: "MIG", direction: "Креативы", title: "Карта креативов \\ скриншоты за пред. мес", cells: scheduleCells([[1, 30]], gold) },
        { id: createId(), team: "MIG", direction: "Креативы", title: "Фигма за текущий месяц", cells: scheduleCells([[1, 30]], gold) },
        { id: createId(), team: "MIG", direction: "Креативы", title: "Обсудить персонализацию креативов для сегментов", cells: {} },
        { id: createId(), team: "LEVEL", direction: "Креативы", title: "Получаем ТЗ от LVL", cells: scheduleCells([], gold, [22]) },
        { id: createId(), team: "MIG", direction: "Креативы", title: "Готовим ресайзы", cells: scheduleCells([[23, 25]], gold, [28]) },
        { id: createId(), team: "LEVEL", direction: "Креативы", title: "Получаем видео креативы (если новые ролики)", cells: scheduleCells([[24, 25]], gold, [24]) },
        { id: createId(), team: "MIG", direction: "Креативы", title: "Адаптация видео креативов", cells: scheduleCells([[24, 25]], gold, [28]) },
        { id: createId(), team: "LEVEL", direction: "Креативы", title: "Согласование креативов (корректировки)", cells: scheduleCells([[24, 25], [28, 30]], gold, [30]) },
        { id: createId(), team: "MIG", direction: "Креативы", title: "Список UTM на аппрув + BI + Comagic", cells: scheduleCells([[25, 25], [28, 29]], gold, [29]) },
        { id: createId(), team: "MIG", direction: "Креативы", title: "Заведение видео РК в кабинетах", cells: scheduleCells([[25, 25], [28, 29]], gold, [29]) },
        { id: createId(), team: "MIG", direction: "Креативы", title: "Заведение всех РК в кабинетах", cells: scheduleCells([[25, 25], [28, 29]], gold, [29]) },
        { id: createId(), team: "MIG", direction: "Аналитика", title: "Выгрузки MS и DB", cells: scheduleCells([], blue, [28]) },
        { id: createId(), team: "MIG", direction: "Кликхаус", title: "Заносить данные в КХ", cells: {} },
        { id: createId(), team: "MIG", direction: "Исследования", title: "Обновление ММО и в т.ч. Digital", cells: {} },
        { id: createId(), team: "MIG", direction: "Спецпроекты", title: "Обсудить идеи от отдела СП", cells: scheduleCells([], blue, [15]) },
        { id: createId(), team: "MIG", direction: "Медиапланы", title: "1-я версия МП на след мес", cells: scheduleCells([[7, 11]], green, [11]) },
        { id: createId(), team: "LEVEL", direction: "Медиапланы", title: "Корректировки МП", cells: scheduleCells([[14, 15]], green) },
        { id: createId(), team: "MIG", direction: "Медиапланы", title: "Апдейт МП с учетом корректировок", cells: scheduleCells([], green, [18]) },
        { id: createId(), team: "LEVEL", direction: "Медиапланы", title: "Фин подтверждение МП", cells: scheduleCells([], green, [25]) },
        { id: createId(), team: "MIG", direction: "ПБА", title: "ПБА за прошлый месяц", cells: scheduleCells([[10, 15]], gold, [15]) }
      ]
    };
  }

  function defaultState() {
    return { version: 2, months: { "2026-09": septemberSourceMonth() } };
  }

  function migrateState(candidate) {
    if ((Number(candidate.version) || 1) >= 2) return candidate;

    const targetKey = "2026-09";
    const sourceTasks = septemberSourceMonth().tasks;
    const currentTasks = candidate.months[targetKey]?.tasks || [];
    const legacyDemoTitles = new Set([
      "Подготовка нового размещения",
      "Согласование креативов",
      "Корректировки медиаплана",
      "Обновление отчётности"
    ]);
    const untouchedDemo = currentTasks.length > 0 && currentTasks.every(task => legacyDemoTitles.has(task.title));

    if (!currentTasks.length || untouchedDemo) {
      candidate.months[targetKey] = { tasks: sourceTasks };
    } else {
      const existingTitles = new Set(currentTasks.map(task => task.title));
      candidate.months[targetKey] = {
        tasks: currentTasks.concat(sourceTasks.filter(task => !existingTitles.has(task.title)))
      };
    }
    candidate.version = 2;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(candidate));
    return candidate;
  }

  function normalizeState(candidate) {
    if (!candidate || typeof candidate !== "object" || !candidate.months || typeof candidate.months !== "object") return null;
    Object.values(candidate.months).forEach(month => {
      month.tasks = Array.isArray(month.tasks) ? month.tasks : [];
      month.tasks.forEach(task => {
        task.id = task.id || createId();
        task.team = String(task.team || "");
        task.direction = String(task.direction || "");
        task.title = String(task.title || "");
        task.cells = task.cells && typeof task.cells === "object" ? task.cells : {};
        Object.entries(task.cells).forEach(([day, cell]) => {
          if (!cell || typeof cell !== "object") {
            delete task.cells[day];
            return;
          }
          cell.color = /^#[0-9a-f]{6}$/i.test(String(cell.color || "")) ? cell.color : "";
          cell.deadline = Boolean(cell.deadline);
        });
      });
    });
    return candidate;
  }

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      const normalized = normalizeState(parsed);
      return normalized ? migrateState(normalized) : defaultState();
    } catch (_) {
      return defaultState();
    }
  }

  function applySharedRow(row, notify = false) {
    const sharedState = normalizeState(row?.payload);
    if (!sharedState) throw new Error("Invalid shared calendar state");
    state = sharedState;
    serverRevision = Number(row.revision);
    sharedReady = true;
    saveLocalBackup();
    setDirty(false);
    renderAll();
    if (notify) showToast("Календарь обновлён другим пользователем");
  }

  async function readSharedRow() {
    const { data, error } = await supabaseClient
      .from("calendar_state")
      .select("payload, revision, updated_at")
      .eq("id", SHARED_ROW_ID)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function createSharedRow() {
    const { data, error } = await supabaseClient
      .from("calendar_state")
      .insert({ id: SHARED_ROW_ID, payload: state, revision: 1 })
      .select("payload, revision, updated_at")
      .single();
    if (error) {
      if (error.code === "23505") return readSharedRow();
      throw error;
    }
    return data;
  }

  function subscribeToSharedChanges() {
    if (realtimeChannel) supabaseClient.removeChannel(realtimeChannel);
    realtimeChannel = supabaseClient
      .channel("shared-calendar")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "calendar_state", filter: `id=eq.${SHARED_ROW_ID}` },
        payload => {
          const incomingRevision = Number(payload.new?.revision || 0);
          if (incomingRevision <= Number(serverRevision || 0)) return;
          if (dirty) {
            els.saveStatus.textContent = "На сервере есть более новая версия";
            els.saveStatus.classList.add("dirty");
            showToast("Другой пользователь изменил календарь. Обновите страницу перед сохранением.");
            return;
          }
          try {
            applySharedRow(payload.new, true);
          } catch (error) {
            console.error("Shared calendar realtime update failed", error);
          }
        }
      )
      .subscribe();
  }

  async function initializeSharedStorage() {
    const config = window.CALENDAR_CONFIG || {};
    if (!config.supabaseUrl || !config.supabasePublishableKey || !window.supabase?.createClient) {
      sharedReady = false;
      els.saveButton.disabled = true;
      els.saveStatus.textContent = "Общая база не подключена";
      els.saveStatus.classList.add("dirty");
      return;
    }

    els.saveButton.disabled = true;
    els.saveStatus.textContent = "Загружаем общий календарь…";
    els.saveStatus.classList.remove("dirty");
    try {
      if (!supabaseClient) {
        supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
        });
      }
      const sharedRow = await readSharedRow() || await createSharedRow();
      applySharedRow(sharedRow);
      subscribeToSharedChanges();
      showToast("Общий календарь загружен");
    } catch (error) {
      sharedReady = false;
      els.saveStatus.textContent = "Сервер недоступен — показана резервная копия";
      els.saveStatus.classList.add("dirty");
      showToast("Не удалось загрузить общую базу. Попробуйте обновить страницу.");
      console.error("Shared calendar initialization failed", error);
    } finally {
      els.saveButton.disabled = false;
    }
  }

  function saveLocalBackup() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  async function saveState() {
    if (!sharedReady || !supabaseClient || serverRevision === null) {
      await initializeSharedStorage();
      return;
    }

    els.saveButton.disabled = true;
    els.saveStatus.textContent = "Сохраняем для всех…";
    try {
      const nextRevision = serverRevision + 1;
      const { data, error } = await supabaseClient
        .from("calendar_state")
        .update({ payload: state, revision: nextRevision })
        .eq("id", SHARED_ROW_ID)
        .eq("revision", serverRevision)
        .select("revision, updated_at")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        els.saveStatus.textContent = "На сервере есть более новая версия";
        els.saveStatus.classList.add("dirty");
        showToast("Другой пользователь уже изменил календарь. Обновите страницу и повторите правки.");
        return;
      }

      serverRevision = Number(data.revision);
      saveLocalBackup();
      setDirty(false);
      renderDeadlines();
      showToast("Изменения сохранены и доступны всем");
    } catch (error) {
      saveLocalBackup();
      els.saveStatus.textContent = "Не удалось сохранить на сервере";
      els.saveStatus.classList.add("dirty");
      showToast("Сервер временно недоступен. Изменения сохранены как локальная резервная копия.");
      console.error("Shared calendar save failed", error);
    } finally {
      els.saveButton.disabled = false;
    }
  }

  function setDirty(value = true) {
    dirty = value;
    els.saveStatus.textContent = dirty ? "Есть несохранённые изменения" : "Все изменения сохранены";
    els.saveStatus.classList.toggle("dirty", dirty);
  }

  function currentMonthData() {
    const key = monthKey();
    if (!state.months[key]) state.months[key] = emptyMonth();
    return state.months[key];
  }

  function previousMonth() {
    const date = new Date(visibleYear, visibleMonth - 1, 1);
    return { year: date.getFullYear(), month: date.getMonth() };
  }

  function cloneTasksForMonth(tasks, year, month) {
    const lastDay = new Date(year, month + 1, 0).getDate();
    return tasks.map(task => {
      const cells = {};
      Object.entries(task.cells || {}).forEach(([day, cell]) => {
        const dayNumber = Number(day);
        if (Number.isInteger(dayNumber) && dayNumber >= 1 && dayNumber <= lastDay) {
          cells[dayNumber] = { color: cell.color || "", deadline: Boolean(cell.deadline) };
        }
      });
      return {
        id: createId(),
        team: task.team,
        direction: task.direction,
        title: task.title,
        cells
      };
    });
  }

  function renderToday() {
    els.todayDate.textContent = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(now);
    els.todayWeekday.textContent = new Intl.DateTimeFormat("ru-RU", { weekday: "long" }).format(now);
  }

  function renderMonthTabs() {
    els.currentYear.textContent = String(visibleYear);
    els.monthTabs.innerHTML = MONTHS.map((name, index) => `<button class="month-tab${index === visibleMonth ? " active" : ""}" type="button" data-month="${index}">${name.slice(0, 3)}</button>`).join("");
    els.monthTabs.querySelector(".active")?.scrollIntoView({ inline: "center", block: "nearest" });
  }

  function renderCopyButton() {
    const source = previousMonth();
    const sourceYear = source.year === visibleYear ? "" : ` ${source.year}`;
    els.copyPreviousMonth.textContent = `Скопировать ${MONTHS[source.month].toLowerCase()}${sourceYear}`;
    els.copyPreviousMonth.title = `Перенести все задачи, заливки и дедлайны из ${MONTHS_GENITIVE[source.month]} ${source.year}`;
  }

  function renderPalette() {
    els.colorPalette.innerHTML = COLORS.map(color => `<button class="color-swatch${color.value === selectedColor && activeTool === "paint" ? " active" : ""}" type="button" data-color="${color.value}" title="${color.name}" aria-label="${color.name}" style="background:${color.value}"></button>`).join("");
    els.deadlineTool.classList.toggle("active", activeTool === "deadline");
    els.deadlineTool.setAttribute("aria-pressed", String(activeTool === "deadline"));
    els.clearTool.classList.toggle("active", activeTool === "clear");
    els.clearTool.setAttribute("aria-pressed", String(activeTool === "clear"));
  }

  function renderCalendar() {
    const days = new Date(visibleYear, visibleMonth + 1, 0).getDate();
    els.calendarTitle.textContent = `${MONTHS[visibleMonth]} ${visibleYear}`;
    const headDays = Array.from({ length: days }, (_, i) => {
      const day = i + 1;
      const date = new Date(visibleYear, visibleMonth, day);
      const weekend = [0, 6].includes(date.getDay());
      const today = visibleYear === now.getFullYear() && visibleMonth === now.getMonth() && day === now.getDate();
      return `<th class="day-head${weekend ? " weekend" : ""}${today ? " today" : ""}" title="${new Intl.DateTimeFormat("ru-RU", { weekday: "long" }).format(date)}">${day}</th>`;
    }).join("");
    els.calendarHead.innerHTML = `<tr><th class="sticky team-col">Команда</th><th class="sticky direction-col">Направление</th><th class="sticky task-col">Задача</th><th class="sticky delete-col">Порядок</th>${headDays}</tr>`;

    const tasks = currentMonthData().tasks;
    els.calendarBody.innerHTML = tasks.length ? tasks.map((task, index) => taskRow(task, days, index, tasks.length)).join("") : `<tr class="empty-row"><td colspan="${days + 4}">В этом месяце пока нет задач. Добавьте первую строку.</td></tr>`;
  }

  function directionColor(direction) {
    const name = String(direction || "").trim();
    if (!name) return "#69717f";
    if (DIRECTION_COLORS[name]) return DIRECTION_COLORS[name];
    let hash = 0;
    for (const char of name.toLocaleLowerCase("ru-RU")) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
    return `hsl(${hash % 360} 52% 38%)`;
  }

  function taskRow(task, days, index, count) {
    const directionStyle = `--direction-color:${directionColor(task.direction)}`;
    const dayCells = Array.from({ length: days }, (_, i) => {
      const day = i + 1;
      const cell = task.cells[day] || {};
      const date = new Date(visibleYear, visibleMonth, day);
      const weekend = [0, 6].includes(date.getDay());
      const today = visibleYear === now.getFullYear() && visibleMonth === now.getMonth() && day === now.getDate();
      return `<td class="day-cell${weekend ? " weekend" : ""}${today ? " today" : ""}${cell.deadline ? " is-deadline" : ""}" data-task-id="${task.id}" data-day="${day}" style="${cell.color ? `background-color:${cell.color}` : ""}"></td>`;
    }).join("");
    return `<tr data-task-id="${task.id}" style="${directionStyle}">
      <td class="sticky team-col team-cell"><div class="editable" contenteditable="true" data-field="team" title="${escapeHtml(task.team)}">${escapeHtml(task.team)}</div></td>
      <td class="sticky direction-col direction-cell"><div class="editable" contenteditable="true" data-field="direction" title="${escapeHtml(task.direction)}">${escapeHtml(task.direction)}</div></td>
      <td class="sticky task-col task-cell"><div class="editable" contenteditable="true" data-field="title" title="${escapeHtml(task.title)}">${escapeHtml(task.title)}</div></td>
      <td class="sticky delete-col"><div class="row-actions"><button class="move-task" type="button" data-move="-1" title="Поднять задачу" aria-label="Поднять задачу" ${index === 0 ? "disabled" : ""}>↑</button><button class="move-task" type="button" data-move="1" title="Опустить задачу" aria-label="Опустить задачу" ${index === count - 1 ? "disabled" : ""}>↓</button><button class="delete-task" type="button" title="Удалить задачу" aria-label="Удалить задачу">×</button></div></td>
      ${dayCells}
    </tr>`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char]));
  }

  function paintCell(cell) {
    const task = currentMonthData().tasks.find(item => item.id === cell.dataset.taskId);
    if (!task) return;
    const day = Number(cell.dataset.day);
    const current = task.cells[day] || {};
    if (activeTool === "clear") {
      delete task.cells[day];
    } else if (activeTool === "deadline") {
      task.cells[day] = { color: current.color || selectedColor, deadline: !current.deadline };
    } else {
      task.cells[day] = { ...current, color: selectedColor };
    }
    const updated = task.cells[day] || {};
    cell.style.backgroundColor = updated.color || "";
    cell.classList.toggle("is-deadline", Boolean(updated.deadline));
    setDirty();
    renderDeadlines();
  }

  function collectDeadlines() {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const result = [];
    Object.entries(state.months).forEach(([key, month]) => {
      const [year, monthNumber] = key.split("-").map(Number);
      month.tasks.forEach(task => {
        Object.entries(task.cells || {}).forEach(([day, cell]) => {
          if (!cell.deadline) return;
          const date = new Date(year, monthNumber - 1, Number(day));
          if (date >= start) result.push({ date, task });
        });
      });
    });
    return result.sort((a, b) => a.date - b.date).slice(0, 5);
  }

  function renderDeadlines() {
    const deadlines = collectDeadlines();
    els.deadlineCount.textContent = `${deadlines.length} ${pluralize(deadlines.length, ["задача", "задачи", "задач"])}`;
    if (!deadlines.length) {
      els.deadlineList.innerHTML = `<div class="deadline-item deadline-item--empty">Будущих дедлайнов пока нет — отметьте дату инструментом «ДЛ».</div>`;
      return;
    }
    els.deadlineList.innerHTML = deadlines.map(item => {
      const daysAway = Math.round((item.date - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
      const relative = daysAway === 0 ? "сегодня" : daysAway === 1 ? "завтра" : `через ${daysAway} дн.`;
      return `<article class="deadline-item"><div class="deadline-item__date"><span>${item.date.getDate()} ${MONTHS_GENITIVE[item.date.getMonth()]}</span><b>${relative}</b></div><h3>${escapeHtml(item.task.title || "Без названия")}</h3><p>${escapeHtml([item.task.team, item.task.direction].filter(Boolean).join(" · ") || "Без направления")}</p></article>`;
    }).join("");
  }

  function pluralize(number, forms) {
    const n10 = number % 10;
    const n100 = number % 100;
    if (n10 === 1 && n100 !== 11) return forms[0];
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return forms[1];
    return forms[2];
  }

  function addTask() {
    const task = { id: createId(), team: "MIG", direction: "Направление", title: "Новая задача", cells: {} };
    currentMonthData().tasks.push(task);
    setDirty();
    renderCalendar();
    requestAnimationFrame(() => {
      const row = els.calendarBody.querySelector(`[data-task-id="${task.id}"]`);
      row?.querySelector('[data-field="title"]')?.focus();
      row?.scrollIntoView({ block: "nearest" });
    });
  }

  function copyPreviousMonth() {
    const source = previousMonth();
    const sourceTasks = state.months[monthKey(source.year, source.month)]?.tasks || [];
    if (!sourceTasks.length) {
      showToast(`В ${MONTHS_GENITIVE[source.month]} ${source.year} нет задач для копирования`);
      return;
    }

    const target = currentMonthData();
    if (target.tasks.length) {
      const confirmed = window.confirm(`В ${MONTHS_GENITIVE[visibleMonth]} уже есть задачи. Заменить их данными из ${MONTHS_GENITIVE[source.month]}?`);
      if (!confirmed) return;
    }

    target.tasks = cloneTasksForMonth(sourceTasks, visibleYear, visibleMonth);
    setDirty();
    renderCalendar();
    renderDeadlines();
    showToast(`${sourceTasks.length} ${pluralize(sourceTasks.length, ["задача скопирована", "задачи скопированы", "задач скопировано"])} из ${MONTHS_GENITIVE[source.month]}`);
  }

  function switchMonth(month) {
    visibleMonth = month;
    renderMonthTabs();
    renderCopyButton();
    renderCalendar();
  }

  function exportState() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `calendar-activity-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast("Резервная копия подготовлена");
  }

  function importState(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = normalizeState(JSON.parse(String(reader.result)));
        if (!imported) throw new Error("invalid");
        state = imported;
        setDirty();
        renderAll();
        showToast("Данные импортированы — нажмите «Сохранить изменения»");
      } catch (_) {
        showToast("Не удалось прочитать файл календаря");
      }
      els.importData.value = "";
    };
    reader.readAsText(file);
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("visible");
    toastTimer = setTimeout(() => els.toast.classList.remove("visible"), 2800);
  }

  function bindEvents() {
    document.getElementById("previousYear").addEventListener("click", () => { visibleYear -= 1; renderMonthTabs(); renderCopyButton(); renderCalendar(); });
    document.getElementById("nextYear").addEventListener("click", () => { visibleYear += 1; renderMonthTabs(); renderCopyButton(); renderCalendar(); });
    els.monthTabs.addEventListener("click", event => {
      const button = event.target.closest("[data-month]");
      if (button) switchMonth(Number(button.dataset.month));
    });
    els.colorPalette.addEventListener("click", event => {
      const button = event.target.closest("[data-color]");
      if (!button) return;
      selectedColor = button.dataset.color;
      activeTool = "paint";
      renderPalette();
    });
    els.deadlineTool.addEventListener("click", () => { activeTool = activeTool === "deadline" ? "paint" : "deadline"; renderPalette(); });
    els.clearTool.addEventListener("click", () => { activeTool = activeTool === "clear" ? "paint" : "clear"; renderPalette(); });
    els.saveButton.addEventListener("click", saveState);
    els.addTask.addEventListener("click", addTask);
    els.copyPreviousMonth.addEventListener("click", copyPreviousMonth);
    els.exportData.addEventListener("click", exportState);
    els.importData.addEventListener("change", event => importState(event.target.files[0]));

    els.calendarBody.addEventListener("pointerdown", event => {
      const cell = event.target.closest(".day-cell");
      if (!cell) return;
      isPointerDown = true;
      event.preventDefault();
      paintCell(cell);
    });
    els.calendarBody.addEventListener("pointerover", event => {
      const cell = event.target.closest(".day-cell");
      if (isPointerDown && cell && activeTool !== "deadline") paintCell(cell);
    });
    window.addEventListener("pointerup", () => { isPointerDown = false; });
    els.calendarBody.addEventListener("contextmenu", event => {
      const cell = event.target.closest(".day-cell");
      if (!cell) return;
      event.preventDefault();
      const previousTool = activeTool;
      activeTool = "clear";
      paintCell(cell);
      activeTool = previousTool;
      renderPalette();
    });
    els.calendarBody.addEventListener("input", event => {
      const editable = event.target.closest(".editable");
      if (!editable) return;
      const taskId = editable.closest("tr").dataset.taskId;
      const task = currentMonthData().tasks.find(item => item.id === taskId);
      if (!task) return;
      task[editable.dataset.field] = editable.textContent.trim();
      editable.title = editable.textContent.trim();
      if (editable.dataset.field === "direction") editable.closest("tr").style.setProperty("--direction-color", directionColor(task.direction));
      setDirty();
      renderDeadlines();
    });
    els.calendarBody.addEventListener("click", event => {
      const moveButton = event.target.closest(".move-task");
      if (moveButton) {
        const tasks = currentMonthData().tasks;
        const taskId = moveButton.closest("tr").dataset.taskId;
        const index = tasks.findIndex(item => item.id === taskId);
        const target = index + Number(moveButton.dataset.move);
        if (index < 0 || target < 0 || target >= tasks.length) return;
        [tasks[index], tasks[target]] = [tasks[target], tasks[index]];
        setDirty();
        renderCalendar();
        els.calendarBody.querySelector(`[data-task-id="${taskId}"] [data-move="${moveButton.dataset.move}"]`)?.focus();
        return;
      }
      const button = event.target.closest(".delete-task");
      if (!button) return;
      const taskId = button.closest("tr").dataset.taskId;
      currentMonthData().tasks = currentMonthData().tasks.filter(item => item.id !== taskId);
      setDirty();
      renderCalendar();
      renderDeadlines();
    });
    window.addEventListener("beforeunload", event => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  function renderAll() {
    renderToday();
    renderMonthTabs();
    renderCopyButton();
    renderPalette();
    renderCalendar();
    renderDeadlines();
  }

  bindEvents();
  renderAll();
  initializeSharedStorage();
})();
