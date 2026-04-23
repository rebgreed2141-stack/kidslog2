const APP_KEY_PREFIX = "kidslog2_";
const CSV_HEADER = ["monthKey", "date", "id", "name", "clock_in", "clock_out", "status", "reason", "class_id", "class_name", "teacher"];
const FIXED_REASONS = ["都合", "早退", "様子見", "熱", "咳", "下痢", "病院", "その他"];
const TEACHER_BY_CLASS_ID = {};
const WEEKDAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];
const FACILITY_STORAGE_KEY = "kidslog2_facility";
const FACILITY_CONFIG = {
  m: {
    childFile: "./child_m.json",
    staffFile: "./staff_m.json",
    label: "こどもの森保育園"
  },
  y: {
    childFile: "./child_y.json",
    staffFile: "./staff_y.json",
    label: "こどもの森You保育園"
  }
};

let classMaster = [];
let childMaster = [];
let selectedClassId = "";
let selectedMode = "in";
let selectedDateKey = "";
let monthCursor = "";
let currentContext = null;
let swRegistration = null;
let currentVersionText = "";
let latestVersionText = "";
let currentFacility = getSavedFacility();

const el = {};

document.addEventListener("DOMContentLoaded", async () => {
  cacheElements();
  setupTabs();
  setupEventHandlers();
  syncFacilityRadios();
  await loadChildMaster();
  await loadStaffMaster();
  selectedDateKey = getDateKey(new Date());
  monthCursor = selectedDateKey.slice(0, 7);
  el.dateInput.value = selectedDateKey;
  applyDefaultModeByTime();
  renderTodayLabel();
  renderClassSelect();
  renderChildrenList();
  renderMonthTitle();
  setupAdminButtons();
  await setupVersionUi();
});

function cacheElements() {
  el.todayLabel = document.getElementById("today-label");
  el.dateInput = document.getElementById("date-input");
  el.classSelect = document.getElementById("class-select");
  el.childrenList = document.getElementById("children-list");
  el.parentScreen = document.getElementById("parent-screen");
  el.parentClass = document.getElementById("parent-class");
  el.parentName = document.getElementById("parent-name");
  el.parentActionBtn = document.getElementById("parent-action-btn");
  el.parentCancelBtn = document.getElementById("parent-cancel-btn");
  el.absenceScreen = document.getElementById("absence-screen");
  el.absenceClass = document.getElementById("absence-class");
  el.absenceName = document.getElementById("absence-name");
  el.absenceReasonList = document.getElementById("absence-reason-list");
  el.absenceOtherInput = document.getElementById("absence-other-input");
  el.absenceSubmitBtn = document.getElementById("absence-submit-btn");
  el.absenceCancelBtn = document.getElementById("absence-cancel-btn");
  el.resultDialog = document.getElementById("result-dialog");
  el.dialogChildName = document.getElementById("dialog-child-name");
  el.dialogTime = document.getElementById("dialog-time");
  el.dialogMessage = document.getElementById("dialog-message");
  el.dialogOkBtn = document.getElementById("dialog-ok-btn");
  el.restoreFile = document.getElementById("restore-file");
  el.currentVersion = document.getElementById("current-version");
  el.latestVersion = document.getElementById("latest-version");
  el.updateBtn = document.getElementById("update-btn");
  el.prevMonthBtn = document.getElementById("prev-month-btn");
  el.nextMonthBtn = document.getElementById("next-month-btn");
  el.monthTitle = document.getElementById("month-title");
  el.viewHeader = document.getElementById("view-header");
  el.monthTable = document.getElementById("month-table");
}

function setupTabs() {
  const buttons = document.querySelectorAll(".tab-btn");
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      buttons.forEach((btn) => btn.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
      button.classList.add("active");
      document.getElementById(`tab-${button.dataset.tab}`).classList.add("active");
      if (button.dataset.tab === "record") {
        renderTodayLabel();
        renderChildrenList();
      }
      if (button.dataset.tab === "month") {
        monthCursor = selectedDateKey.slice(0, 7);
        renderMonthTitle();
        renderMonthlyView();
      }
    });
  });
}

function setupEventHandlers() {
  el.dateInput.addEventListener("change", (e) => {
    selectedDateKey = normalizeDateInputValue(e.target.value) || getDateKey(new Date());
    e.target.value = selectedDateKey;
    monthCursor = selectedDateKey.slice(0, 7);
    renderTodayLabel();
    renderChildrenList();
    renderMonthTitle();
    if (document.getElementById("tab-month").classList.contains("active")) {
      renderMonthlyView();
    }
  });

  el.classSelect.addEventListener("change", (e) => {
    selectedClassId = e.target.value;
    renderChildrenList();
    if (document.getElementById("tab-month").classList.contains("active")) {
      renderMonthlyView();
    }
  });

  document.querySelectorAll('input[name="mode"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      selectedMode = e.target.value;
      renderChildrenList();
    });
  });

  el.parentCancelBtn.addEventListener("click", closeParentScreen);
  el.parentActionBtn.addEventListener("click", submitCurrentRecord);
  el.absenceCancelBtn.addEventListener("click", closeAbsenceScreen);
  el.absenceSubmitBtn.addEventListener("click", submitAbsenceRecord);
  el.absenceReasonList.addEventListener("change", syncAbsenceOtherInput);
  el.dialogOkBtn.addEventListener("click", () => {
    hideOverlay(el.resultDialog);
    currentContext = null;
    renderChildrenList();
    if (document.getElementById("tab-month").classList.contains("active")) {
      renderMonthlyView();
    }
  });
  el.updateBtn.addEventListener("click", updateApp);
  el.prevMonthBtn.addEventListener("click", () => moveMonth(-1));
  el.nextMonthBtn.addEventListener("click", () => moveMonth(1));
}

async function loadChildMaster() {
  const response = await fetch(getCurrentFacilityConfig().childFile, { cache: "no-store" });
  const data = await response.json();
  classMaster = Array.isArray(data.classes) ? data.classes.slice() : [];
  childMaster = Array.isArray(data.children) ? data.children.slice() : [];
  childMaster.sort((a, b) => {
    if (a.classId !== b.classId) return a.classId.localeCompare(b.classId, "ja");
    return Number(a.no || 0) - Number(b.no || 0);
  });
  selectedClassId = classMaster[0] ? classMaster[0].id : "";
}

async function loadStaffMaster() {
  try {
    const response = await fetch(getCurrentFacilityConfig().staffFile, { cache: "no-store" });
    const data = await response.json();
    Object.keys(TEACHER_BY_CLASS_ID).forEach((key) => delete TEACHER_BY_CLASS_ID[key]);
    if (data && typeof data === "object") {
      Object.entries(data).forEach(([classId, teacher]) => {
        TEACHER_BY_CLASS_ID[classId] = String(teacher || "").trim();
      });
    }
  } catch (_error) {
    Object.keys(TEACHER_BY_CLASS_ID).forEach((key) => delete TEACHER_BY_CLASS_ID[key]);
  }
}

function applyDefaultModeByTime() {
  const now = new Date();
  selectedMode = now.getHours() < 12 ? "in" : "out";
  const target = document.querySelector(`input[name="mode"][value="${selectedMode}"]`);
  if (target) target.checked = true;
}

function renderTodayLabel() {
  const selectedDate = dateFromKey(selectedDateKey);
  const weekday = WEEKDAY_NAMES[selectedDate.getDay()];
  el.todayLabel.textContent = `${selectedDate.getFullYear()}年${selectedDate.getMonth() + 1}月${selectedDate.getDate()}日（${weekday}）`;
}

function renderClassSelect() {
  el.classSelect.innerHTML = classMaster
    .map((cls) => `<option value="${escapeHtml(cls.id)}">${escapeHtml(cls.name)}</option>`)
    .join("");
  el.classSelect.value = selectedClassId;
}

function renderChildrenList() {
  const dayData = loadDayData(selectedDateKey);
  const recordsById = new Map((dayData.records || []).map((record) => [record.id, record]));
  const isToday = selectedDateKey === getDateKey(new Date());

  const rows = getChildrenByClass(selectedClassId).map((child) => {
    const record = recordsById.get(child.id) || null;
    const status = getStatusSymbol(record);
    const disabled = getChildButtonDisabled(record, isToday);
    const canClear = canClearRecord(record);

    return `
      <div class="child-row">
        <div class="child-status ${status === "欠" ? "status-absent" : ""}">${status}</div>
        <div class="child-no">${escapeHtml(String(child.no))}</div>
        <button class="child-btn" ${disabled ? "disabled" : ""} onclick="openChildAction('${escapeJs(child.id)}')">${escapeHtml(getDisplayName(child))}</button>
        ${canClear
          ? `<button class="child-clear-btn" onclick="clearChildRecord('${escapeJs(child.id)}')">クリア</button>`
          : `<div class="child-clear-spacer" aria-hidden="true"></div>`}
      </div>
    `;
  });

  el.childrenList.innerHTML = rows.length > 0
    ? rows.join("")
    : `<div class="child-row"><div class="child-status"></div><div class="child-no"></div><div>園児がいません</div><div class="child-clear-spacer" aria-hidden="true"></div></div>`;
}

function getChildrenByClass(classId) {
  return childMaster.filter((child) => child.classId === classId).sort((a, b) => Number(a.no || 0) - Number(b.no || 0));
}

function getChildButtonDisabled(record, isToday) {
  if (selectedMode === "absent") return false;
  if (!isToday) return true;
  if (!record || record.status === "欠席") return false;
  return Boolean(record.clock_in && record.clock_out);
}

function canClearRecord(record) {
  if (!record) return false;
  if (selectedMode === "in") return Boolean(record.clock_in);
  if (selectedMode === "out") return Boolean(record.clock_out);
  return record.status === "欠席" || Boolean(record.reason);
}

function openChildAction(childId) {
  const child = childMaster.find((item) => item.id === childId);
  if (!child) return;

  currentContext = {
    child,
    mode: selectedMode
  };

  if (selectedMode === "absent") {
    openAbsenceScreen(child);
    return;
  }

  if (selectedDateKey !== getDateKey(new Date())) return;

  el.parentClass.textContent = `${child.className}組`;
  el.parentName.textContent = getDisplayName(child);
  el.parentActionBtn.textContent = selectedMode === "in" ? "登園" : "降園";
  el.parentActionBtn.classList.toggle("mode-in", selectedMode === "in");
  el.parentActionBtn.classList.toggle("mode-out", selectedMode === "out");
  showOverlay(el.parentScreen);
}

function openAbsenceScreen(child) {
  el.absenceClass.textContent = `${child.className}組`;
  el.absenceName.textContent = getDisplayName(child);
  el.absenceReasonList.innerHTML = FIXED_REASONS.map((reason, index) => `
    <label class="absence-reason-item">
      <input type="radio" name="absence-reason" value="${escapeHtml(reason)}" ${index === 0 ? "checked" : ""}>
      <span>${escapeHtml(reason)}</span>
    </label>
  `).join("");
  el.absenceOtherInput.value = "";
  el.absenceOtherInput.disabled = true;
  showOverlay(el.absenceScreen);
}

function syncAbsenceOtherInput() {
  const value = getSelectedAbsenceReason();
  const isOther = value === "その他";
  el.absenceOtherInput.disabled = !isOther;
  if (!isOther) {
    el.absenceOtherInput.value = "";
  } else {
    el.absenceOtherInput.focus();
  }
}

function getSelectedAbsenceReason() {
  const checked = document.querySelector('input[name="absence-reason"]:checked');
  return checked ? checked.value : "";
}

function closeParentScreen() {
  hideOverlay(el.parentScreen);
  currentContext = null;
}

function closeAbsenceScreen() {
  hideOverlay(el.absenceScreen);
  currentContext = null;
}

function submitCurrentRecord() {
  if (!currentContext) return;

  const now = new Date();
  const time = formatTime(now);
  const dayData = loadDayData(selectedDateKey);
  const child = currentContext.child;
  const mode = currentContext.mode;
  let record = findRecordById(dayData, child.id);

  if (!record) {
    record = createRecordBase(selectedDateKey, child);
    dayData.records.push(record);
  }

  if (mode === "in") {
    record.clock_in = time;
    record.status = "出席";
    record.reason = "";
  } else {
    record.clock_out = time;
    if (record.status !== "欠席") {
      record.status = "出席";
    }
    if (record.status === "出席") {
      record.reason = "";
    }
  }

  saveDayData(selectedDateKey, dayData);
  hideOverlay(el.parentScreen);
  showResultDialog(child, mode, time, record);
}

function submitAbsenceRecord() {
  if (!currentContext) return;

  const selectedReason = getSelectedAbsenceReason();
  const reason = selectedReason === "その他" ? String(el.absenceOtherInput.value || "").trim() : selectedReason;
  if (!reason) {
    alert("理由を入力してください");
    return;
  }

  const dayData = loadDayData(selectedDateKey);
  const child = currentContext.child;
  let record = findRecordById(dayData, child.id);

  if (!record) {
    record = createRecordBase(selectedDateKey, child);
    dayData.records.push(record);
  }

  record.status = "欠席";
  record.reason = reason;
  record.clock_in = "";
  record.clock_out = "";

  saveDayData(selectedDateKey, dayData);
  hideOverlay(el.absenceScreen);
  showAbsenceResultDialog(child, reason);
}

function showResultDialog(child, mode, time, record) {
  el.dialogChildName.textContent = getDisplayName(child);
  el.dialogTime.textContent = time;

  let message = mode === "in" ? "登園時間を記録しました" : "降園時間を記録しました";
  if (mode === "out" && !record.clock_in) {
    message = "登園の記録がありませんが、\n降園を記録しました";
  }

  el.dialogMessage.textContent = message;
  showOverlay(el.resultDialog);
}

function showAbsenceResultDialog(child, reason) {
  el.dialogChildName.textContent = getDisplayName(child);
  el.dialogTime.textContent = "";
  el.dialogMessage.textContent = `欠席理由を記録しました\n${reason}`;
  showOverlay(el.resultDialog);
}

function setupAdminButtons() {
  document.querySelectorAll('input[name="facility"]').forEach((radio) => {
    radio.addEventListener("change", handleFacilityChange);
  });
  document.getElementById("backup-btn").addEventListener("click", backupCsv);
  document.getElementById("restore-btn").addEventListener("click", () => el.restoreFile.click());
  document.getElementById("restore-file").addEventListener("change", restoreCsv);
  document.getElementById("delete-btn").addEventListener("click", deleteAllData);
}

function getSavedFacility() {
  const value = String(localStorage.getItem(FACILITY_STORAGE_KEY) || "m").trim();
  return FACILITY_CONFIG[value] ? value : "m";
}

function getCurrentFacilityConfig() {
  return FACILITY_CONFIG[currentFacility] || FACILITY_CONFIG.m;
}

function syncFacilityRadios() {
  document.querySelectorAll('input[name="facility"]').forEach((radio) => {
    radio.checked = radio.value === currentFacility;
  });
}

function handleFacilityChange(e) {
  const nextFacility = String(e.target.value || "").trim();
  if (!FACILITY_CONFIG[nextFacility]) {
    syncFacilityRadios();
    return;
  }
  if (nextFacility === currentFacility) return;

  localStorage.setItem(FACILITY_STORAGE_KEY, nextFacility);
  currentFacility = nextFacility;
  location.reload();
}

function loadDayData(dateKey) {
  const raw = localStorage.getItem(APP_KEY_PREFIX + dateKey);
  if (!raw) return { records: [] };

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { records: [] };
    if (!Array.isArray(parsed.records)) parsed.records = [];
    parsed.records = parsed.records.map(normalizeRecord).filter((record) => record.dateKey === dateKey);
    return parsed;
  } catch (_error) {
    return { records: [] };
  }
}

function saveDayData(dateKey, data) {
  const safeRecords = Array.isArray(data.records) ? data.records.map(normalizeRecord).filter((record) => record.dateKey === dateKey) : [];
  localStorage.setItem(APP_KEY_PREFIX + dateKey, JSON.stringify({ records: safeRecords }));
}

function createRecordBase(dateKey, child) {
  return normalizeRecord({
    monthKey: dateKey.slice(0, 7),
    date: formatDateKeyForCsv(dateKey),
    id: child.id,
    name: child.name,
    clock_in: "",
    clock_out: "",
    status: "",
    reason: "",
    class_id: child.classId,
    class_name: child.className,
    teacher: getTeacherByClassId(child.classId)
  });
}

function normalizeRecord(record) {
  const safe = record && typeof record === "object" ? record : {};
  const dateKey = normalizeCsvDateToKey(safe.date) || normalizeCsvDateToKey(safe.dateKey) || getDateKey(new Date());
  return {
    monthKey: normalizeMonthKey(safe.monthKey) || dateKey.slice(0, 7),
    date: formatDateKeyForCsv(dateKey),
    dateKey,
    id: String(safe.id || "").trim(),
    name: String(safe.name || "").trim(),
    clock_in: normalizeTimeText(safe.clock_in),
    clock_out: normalizeTimeText(safe.clock_out),
    status: normalizeStatusText(safe.status),
    reason: String(safe.reason || "").trim(),
    class_id: String(safe.class_id || "").trim(),
    class_name: String(safe.class_name || "").trim(),
    teacher: String(safe.teacher || "").trim()
  };
}

function findRecordById(dayData, id) {
  return Array.isArray(dayData.records) ? dayData.records.find((record) => record.id === id) || null : null;
}

function clearChildRecord(childId) {
  const child = childMaster.find((item) => item.id === childId);
  if (!child) return;

  const modeLabel = selectedMode === "in" ? "登園" : selectedMode === "out" ? "降園" : "欠席連絡";
  if (!confirm(`${getDisplayName(child)} の${modeLabel}記録をクリアしますか？`)) return;

  const dayData = loadDayData(selectedDateKey);
  const record = findRecordById(dayData, child.id);
  if (!record) return;

  if (selectedMode === "in") {
    record.clock_in = "";
    if (!record.clock_out && record.status === "出席") {
      record.status = "";
    }
  } else if (selectedMode === "out") {
    record.clock_out = "";
    if (!record.clock_in && record.status === "出席") {
      record.status = "";
    }
  } else {
    record.status = "";
    record.reason = "";
  }

  dayData.records = (dayData.records || []).filter((item) => item.id !== child.id || hasAnyData(item));
  saveDayData(selectedDateKey, dayData);
  renderChildrenList();
  if (document.getElementById("tab-month").classList.contains("active")) {
    renderMonthlyView();
  }
  alert(`${modeLabel}記録をクリアしました`);
}

function hasAnyData(record) {
  return Boolean(record.clock_in || record.clock_out || record.status || record.reason);
}

function getStatusSymbol(record) {
  if (!record) return "";
  if (record.status === "欠席") return "欠";
  const hasIn = Boolean(record.clock_in);
  const hasOut = Boolean(record.clock_out);
  if (hasIn && hasOut) return "●";
  if (hasIn || hasOut) return "▲";
  return "";
}

async function backupCsv() {
  try {
    const zip = new JSZip();
    const keys = Object.keys(localStorage).filter((key) => key.startsWith(APP_KEY_PREFIX)).sort();
    keys.forEach((storageKey) => {
      const dateKey = storageKey.slice(APP_KEY_PREFIX.length);
      const dayData = loadDayData(dateKey);
      zip.file(`${storageKey}.csv`, buildCsvText(dateKey, dayData));
    });

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kidslog2_backup.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error(error);
    alert("バックアップに失敗しました");
  }
}

function buildCsvText(dateKey, dayData) {
  const lines = [CSV_HEADER.map(toCsvCell).join(",")];
  const sortedRecords = (dayData.records || []).slice().sort((a, b) => a.id.localeCompare(b.id, "ja"));
  sortedRecords.forEach((record) => {
    lines.push([
      record.monthKey || dateKey.slice(0, 7),
      record.date,
      record.id,
      record.name,
      record.clock_in,
      record.clock_out,
      record.status,
      record.reason,
      record.class_id,
      record.class_name,
      record.teacher
    ].map(toCsvCell).join(","));
  });
  return "\uFEFF" + lines.join("\r\n");
}

async function restoreCsv(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const zip = await JSZip.loadAsync(file);
    const jobs = [];

    zip.forEach((path, fileEntry) => {
      if (fileEntry.dir || !path.toLowerCase().endsWith(".csv")) return;
      jobs.push(fileEntry.async("string").then((text) => {
        const storageKey = path.replace(/^.*\//, "").replace(/\.csv$/i, "");
        if (!storageKey.startsWith(APP_KEY_PREFIX)) return;
        const dateKey = storageKey.slice(APP_KEY_PREFIX.length);
        saveDayData(dateKey, parseCsvTextToDayData(text, dateKey));
      }));
    });

    await Promise.all(jobs);
    e.target.value = "";
    renderChildrenList();
    if (document.getElementById("tab-month").classList.contains("active")) {
      renderMonthlyView();
    }
    alert("復元完了");
  } catch (error) {
    console.error(error);
    e.target.value = "";
    alert("復元に失敗しました");
  }
}

function parseCsvTextToDayData(csvText, fallbackDateKey) {
  const rows = parseCsvRows(csvText);
  const dayData = { records: [] };
  if (rows.length === 0) return dayData;

  const header = rows[0].map((v) => normalizeHeader(v));
  const colIndex = {
    monthKey: header.indexOf("monthkey"),
    date: header.indexOf("date"),
    id: header.indexOf("id"),
    name: header.indexOf("name"),
    clockIn: header.indexOf("clock_in"),
    clockOut: header.indexOf("clock_out"),
    status: header.indexOf("status"),
    reason: header.indexOf("reason"),
    classId: header.indexOf("class_id"),
    className: header.indexOf("class_name"),
    teacher: header.indexOf("teacher")
  };

  const normalizedFallbackDateKey = normalizeCsvDateToKey(fallbackDateKey) || fallbackDateKey;

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (row.length === 1 && String(row[0] || "").trim() === "") continue;
    const id = cleanCsvText(getCsvValue(row, colIndex.id));
    if (!id) continue;

    const rowDateKey = normalizeCsvDateToKey(cleanCsvText(getCsvValue(row, colIndex.date))) || normalizedFallbackDateKey;
    if (rowDateKey !== normalizedFallbackDateKey) continue;

    dayData.records.push(normalizeRecord({
      monthKey: cleanCsvText(getCsvValue(row, colIndex.monthKey)),
      date: formatDateKeyForCsv(normalizedFallbackDateKey),
      id,
      name: cleanCsvText(getCsvValue(row, colIndex.name)),
      clock_in: getCsvValue(row, colIndex.clockIn),
      clock_out: getCsvValue(row, colIndex.clockOut),
      status: cleanCsvText(getCsvValue(row, colIndex.status)),
      reason: cleanCsvText(getCsvValue(row, colIndex.reason)),
      class_id: cleanCsvText(getCsvValue(row, colIndex.classId)),
      class_name: cleanCsvText(getCsvValue(row, colIndex.className)),
      teacher: cleanCsvText(getCsvValue(row, colIndex.teacher))
    }));
  }

  return dayData;
}

function parseCsvRows(text) {
  const cleaned = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < cleaned.length; i += 1) {
    const ch = cleaned[i];
    const next = cleaned[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') { cell += '"'; i += 1; } else { inQuotes = !inQuotes; }
      continue;
    }
    if (ch === "," && !inQuotes) { row.push(cell); cell = ""; continue; }
    if (ch === "\n" && !inQuotes) { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
    cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

function deleteAllData() {
  if (!confirm("全データ削除しますか")) return;
  Object.keys(localStorage).filter((key) => key.startsWith(APP_KEY_PREFIX)).forEach((key) => localStorage.removeItem(key));
  renderChildrenList();
  renderMonthlyView();
}

function renderMonthTitle() {
  const [yearText, monthText] = monthCursor.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const now = new Date();
  const isCurrent = now.getFullYear() === year && now.getMonth() + 1 === month;
  el.monthTitle.textContent = `${month}月${isCurrent ? "（今月）" : ""}`;
}

function moveMonth(delta) {
  const [yearText, monthText] = monthCursor.split("-");
  const base = new Date(Number(yearText), Number(monthText) - 1 + delta, 1);
  monthCursor = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}`;
  renderMonthTitle();
  renderMonthlyView();
}

function renderMonthlyView() {
  if (!selectedClassId) {
    el.viewHeader.textContent = "組を選択してください";
    el.monthTable.innerHTML = "";
    return;
  }

  const classInfo = classMaster.find((item) => item.id === selectedClassId);
  const className = classInfo ? classInfo.name : "";
  const teacher = getTeacherByClassId(selectedClassId);
  const [yearText, monthText] = monthCursor.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const lastDay = getLastDay(year, month);
  const names = getChildrenByClass(selectedClassId);
  const childcareDays = countChildcareDays(year, month);

  el.viewHeader.textContent = `${toWarekiYearMonth(year, month)}　${className}組　担任：${teacher}　保育日数：${childcareDays}`;
  el.monthTable.innerHTML = "";

  const thead = document.createElement("thead");
  const trh = document.createElement("tr");

  const thName = document.createElement("th");
  thName.textContent = "園児";
  thName.className = "sticky-name th";
  trh.appendChild(thName);

  for (let d = 1; d <= lastDay; d += 1) {
    const th = document.createElement("th");
    const ds = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dow = dayOfWeek(ds);

    th.appendChild(createDateHeaderContent(d, dow));

    if (dow === 0) th.classList.add("sun-col");
    if (dow === 6) th.classList.add("sat-col");

    trh.appendChild(th);
  }

  const thP = document.createElement("th");
  thP.textContent = "出席";
  thP.className = "right-total";
  trh.appendChild(thP);

  const thA = document.createElement("th");
  thA.textContent = "欠席";
  thA.className = "right-total";
  trh.appendChild(thA);

  thead.appendChild(trh);
  el.monthTable.appendChild(thead);

  const tbody = document.createElement("tbody");
  const dailyPresent = new Array(lastDay).fill(0);
  const dailyAbsent = new Array(lastDay).fill(0);

  names.forEach((child) => {
    const tr = document.createElement("tr");

    const tdName = document.createElement("td");
    tdName.textContent = getMonthDisplayName(child.name);
    tdName.className = "sticky-name";
    tr.appendChild(tdName);

    let pTotal = 0;
    let aTotal = 0;

    for (let d = 1; d <= lastDay; d += 1) {
      const td = document.createElement("td");
      const ds = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dow = dayOfWeek(ds);

      if (dow === 0) {
        td.classList.add("sun-col");
        td.textContent = "";
      } else {
        const record = findRecordById(loadDayData(ds), child.id);
        if (!record || !record.status) {
          td.textContent = "";
        } else if (record.status === "出席") {
          td.textContent = "";
          pTotal += 1;
          dailyPresent[d - 1] += 1;
        } else {
          td.textContent = record.reason || "欠席";
          aTotal += 1;
          dailyAbsent[d - 1] += 1;
        }
      }
      tr.appendChild(td);
    }

    const tdPT = document.createElement("td");
    tdPT.textContent = String(pTotal);
    tdPT.className = "right-total";
    tr.appendChild(tdPT);

    const tdAT = document.createElement("td");
    tdAT.textContent = String(aTotal);
    tdAT.className = "right-total";
    tr.appendChild(tdAT);

    tbody.appendChild(tr);
  });

  let monthPresentSum = 0;
  let monthAbsentSum = 0;

  const trP = document.createElement("tr");
  trP.className = "footer-row";

  const tdPLabel = document.createElement("td");
  tdPLabel.textContent = "出席人数";
  tdPLabel.className = "sticky-name";
  trP.appendChild(tdPLabel);

  for (let d = 1; d <= lastDay; d += 1) {
    const ds = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dow = dayOfWeek(ds);
    const td = document.createElement("td");

    if (dow === 0) {
      td.classList.add("sun-col");
      td.textContent = "";
    } else {
      const p = dailyPresent[d - 1] || 0;
      td.textContent = String(p);
      monthPresentSum += p;
    }
    trP.appendChild(td);
  }

  const tdMP = document.createElement("td");
  tdMP.textContent = String(monthPresentSum);
  tdMP.className = "right-total";
  trP.appendChild(tdMP);

  const tdMP2 = document.createElement("td");
  tdMP2.textContent = "";
  tdMP2.className = "right-total";
  trP.appendChild(tdMP2);

  const trA = document.createElement("tr");
  trA.className = "footer-row";

  const tdALabel = document.createElement("td");
  tdALabel.textContent = "欠席人数";
  tdALabel.className = "sticky-name";
  trA.appendChild(tdALabel);

  for (let d = 1; d <= lastDay; d += 1) {
    const ds = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dow = dayOfWeek(ds);
    const td = document.createElement("td");

    if (dow === 0) {
      td.classList.add("sun-col");
      td.textContent = "";
    } else {
      const a = dailyAbsent[d - 1] || 0;
      td.textContent = String(a);
      monthAbsentSum += a;
    }
    trA.appendChild(td);
  }

  const tdMA1 = document.createElement("td");
  tdMA1.textContent = "";
  tdMA1.className = "right-total";
  trA.appendChild(tdMA1);

  const tdMA2 = document.createElement("td");
  tdMA2.textContent = String(monthAbsentSum);
  tdMA2.className = "right-total";
  trA.appendChild(tdMA2);

  tbody.appendChild(trP);
  tbody.appendChild(trA);
  el.monthTable.appendChild(tbody);
}

function getMonthDisplayName(name) {
  const text = String(name || "").trim();
  if (!text) return "";
  const parts = text.split(/[ 　]+/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : text;
}

function createDateHeaderContent(day, dow) {
  const wrap = document.createElement("div");
  wrap.className = "date-header";

  const dayDiv = document.createElement("div");
  dayDiv.textContent = String(day);
  wrap.appendChild(dayDiv);

  const dowDiv = document.createElement("div");
  dowDiv.textContent = WEEKDAY_NAMES[dow];
  dowDiv.className = dow === 0 ? "sun-text" : dow === 6 ? "sat-text" : "weekday-text";
  wrap.appendChild(dowDiv);

  return wrap;
}

function getTeacherByClassId(classId) {
  return TEACHER_BY_CLASS_ID[classId] || "";
}

function countChildcareDays(year, month) {
  let count = 0;
  const lastDay = getLastDay(year, month);
  for (let day = 1; day <= lastDay; day += 1) {
    const ds = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (dayOfWeek(ds) !== 0) count += 1;
  }
  return count;
}

function getLastDay(year, month) {
  return new Date(year, month, 0).getDate();
}

function dayOfWeek(dateKey) {
  const date = dateFromKey(dateKey);
  return date.getDay();
}

function toWarekiYearMonth(year, month) {
  if (year >= 2019) return `令和${year - 2018}年${month}月`;
  if (year >= 1989) return `平成${year - 1988}年${month}月`;
  return `${year}年${month}月`;
}

function normalizeHeader(value) { return String(value || "").replace(/^\uFEFF/, "").trim().toLowerCase(); }
function getCsvValue(row, index) { return index < 0 || index >= row.length ? "" : (row[index] || ""); }
function cleanCsvText(value) { return String(value ?? "").replace(/^\uFEFF/, "").trim(); }
function toCsvCell(value) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
function normalizeTimeText(value) {
  const text = cleanCsvText(value);
  if (!text) return "";
  const match = text.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return "";
  return `${String(Number(match[1])).padStart(2, "0")}:${String(Number(match[2])).padStart(2, "0")}`;
}
function normalizeStatusText(value) {
  const text = cleanCsvText(value);
  if (text === "出席" || text === "欠席") return text;
  return "";
}
function normalizeMonthKey(value) {
  const text = cleanCsvText(value);
  return /^\d{4}-\d{2}$/.test(text) ? text : "";
}
function normalizeCsvDateToKey(value) {
  const text = cleanCsvText(value).replace(/[.\-]/g, "/").replace(/\s+/g, "");
  const match = text.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return "";
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}
function formatDateKeyForCsv(dateKey) {
  const key = normalizeCsvDateToKey(dateKey);
  if (!key) return "";
  const [y, m, d] = key.split("-");
  return `${y}/${Number(m)}/${Number(d)}`;
}
function getDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function dateFromKey(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function normalizeDateInputValue(value) {
  const text = cleanCsvText(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  return `${match[1]}-${match[2]}-${match[3]}`;
}
function formatTime(date) { return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`; }
function getDisplayName(child) { return `${child.name}${child.gender === "m" ? "くん" : "ちゃん"}`; }
function showOverlay(target) { target.classList.remove("hidden"); }
function hideOverlay(target) { target.classList.add("hidden"); }
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function escapeJs(value) { return String(value ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }
window.openChildAction = openChildAction;
window.clearChildRecord = clearChildRecord;

async function setupVersionUi() {
  if (!("serviceWorker" in navigator)) {
    el.currentVersion.textContent = "---";
    el.latestVersion.textContent = "---";
    el.updateBtn.disabled = true;
    return;
  }

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    window.location.reload();
  });

  swRegistration = await navigator.serviceWorker.ready;

  if (swRegistration.installing) {
    watchInstallingWorker(swRegistration.installing);
  }

  swRegistration.addEventListener("updatefound", () => {
    if (swRegistration.installing) {
      watchInstallingWorker(swRegistration.installing);
    }
  });

  await refreshVersionInfo();

  try {
    await swRegistration.update();
  } catch (error) {
    console.error(error);
  }

  await refreshVersionInfo();
}

function watchInstallingWorker(worker) {
  worker.addEventListener("statechange", async () => {
    if (worker.state === "installed") {
      await refreshVersionInfo();
    }
  });
}

async function refreshVersionInfo() {
  currentVersionText = await getCurrentVersionFromInstalledApp();
  latestVersionText = await getLatestVersionFromServer();

  el.currentVersion.textContent = currentVersionText || "---";
  el.latestVersion.textContent = latestVersionText || "---";

  if (swRegistration && swRegistration.waiting && latestVersionText && latestVersionText !== currentVersionText) {
    el.updateBtn.disabled = false;
  } else {
    el.updateBtn.disabled = true;
  }
}

async function getCurrentVersionFromInstalledApp() {
  if (!navigator.serviceWorker.controller) {
    try {
      const response = await fetch("./version.json", { cache: "no-store" });
      const data = await response.json();
      return String(data.version || "").trim();
    } catch (_error) {
      return "";
    }
  }

  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      resolve(String(event.data?.version || "").trim());
    };
    navigator.serviceWorker.controller.postMessage({ type: "GET_CURRENT_VERSION" }, [channel.port2]);
  });
}

async function getLatestVersionFromServer() {
  try {
    const response = await fetch(`./version.json?t=${Date.now()}`, { cache: "no-store" });
    const data = await response.json();
    return String(data.version || "").trim();
  } catch (_error) {
    return "";
  }
}

function updateApp() {
  if (swRegistration && swRegistration.waiting) {
    swRegistration.waiting.postMessage({ type: "SKIP_WAITING" });
  }
}
