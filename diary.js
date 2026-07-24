(function () {
  "use strict";

  var APPEARANCE_KEY = "island-chat.preferences.v1";
  var LEGACY_THEMES = { coast: "zen", dusk: "sage", paper: "blush" };
  var THEME_COLORS = { mist: "#eef2f0", zen: "#f2efe8", sage: "#f1f1e7", blush: "#ebeef1" };
  var WEATHER_TYPES = {
    sunny: "☀️ 晴", "partly-cloudy": "🌤️ 晴间多云", cloudy: "☁️ 多云",
    rainy: "🌧️ 下雨", storm: "⛈️ 雷雨", snowy: "🌨️ 下雪",
    foggy: "🌫️ 有雾", windy: "🌬️ 有风"
  };

  var diaryDate = document.getElementById("diaryDate");
  var previousDayButton = document.getElementById("previousDayButton");
  var nextDayButton = document.getElementById("nextDayButton");
  var headingDate = document.getElementById("diaryHeadingDate");
  var status = document.getElementById("diaryStatus");
  var statusText = document.getElementById("diaryStatusText");
  var errorText = document.getElementById("diaryError");
  var sharedList = document.getElementById("sharedDiaryList");
  var lockedList = document.getElementById("lockedDiaryList");
  var sharedCount = document.getElementById("sharedDiaryCount");
  var lockedCount = document.getElementById("lockedDiaryCount");
  var paper = document.getElementById("diaryPaper");
  var paperYear = document.getElementById("diaryPaperYear");
  var paperTitle = document.getElementById("diaryPaperTitle");
  var visibilityBadge = document.getElementById("diaryVisibilityBadge");
  var visibilityUse = visibilityBadge.querySelector("use");
  var visibilityText = visibilityBadge.querySelector("span");
  var paperMeta = document.getElementById("diaryPaperMeta");
  var paperWeather = document.getElementById("diaryPaperWeather");
  var paperUpdated = document.getElementById("diaryPaperUpdated");
  var reading = document.getElementById("diaryReading");
  var message = document.getElementById("diaryMessage");
  var lockedState = document.getElementById("diaryLockedState");
  var emptyState = document.getElementById("diaryEmptyState");
  var themeColorMeta = document.getElementById("themeColorMeta");

  var selectedDate = initialDate();
  var indexRecords = [];
  var requestGeneration = 0;
  var shouldOpenLatestShared = !hasRequestedDate();

  function emitClawd(state, phrase, options) {
    document.dispatchEvent(new CustomEvent("clawd:action", {
      detail: Object.assign({ state: state, phrase: phrase || "" }, options || {})
    }));
  }

  function todayString() {
    var date = new Date();
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  }

  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
    var parts = value.split("-").map(Number);
    var date = new Date(parts[0], parts[1] - 1, parts[2]);
    return date.getFullYear() === parts[0] &&
      date.getMonth() === parts[1] - 1 &&
      date.getDate() === parts[2];
  }

  function initialDate() {
    var value = "";
    try { value = new URLSearchParams(location.search).get("date") || ""; } catch (error) {}
    return validDate(value) && value <= todayString() ? value : todayString();
  }
  function hasRequestedDate() {
    try {
      var value = new URLSearchParams(location.search).get("date") || "";
      return validDate(value) && value <= todayString();
    } catch (error) {
      return false;
    }
  }


  function localDate(value) {
    var parts = value.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function shiftDate(value, amount) {
    var date = localDate(value);
    date.setDate(date.getDate() + amount);
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  }

  function longDate(value) {
    return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(localDate(value));
  }

  function shortDate(value) {
    return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(localDate(value));
  }

  function titleFor(value) {
    if (value === todayString()) return "今天的日记";
    var parts = value.split("-").map(Number);
    return parts[1] + "月" + parts[2] + "日的日记";
  }

  function setStatus(state, text) {
    status.dataset.state = state;
    statusText.textContent = text;
  }

  function showError(text) {
    errorText.textContent = text;
    errorText.hidden = false;
    setStatus("error", "暂时读不到");
  }

  function clearError() {
    errorText.hidden = true;
    errorText.textContent = "";
  }

  function syncTheme() {
    var theme = "mist";
    try {
      var saved = JSON.parse(localStorage.getItem(APPEARANCE_KEY));
      var candidate = saved && (saved.theme || LEGACY_THEMES[saved.id] || saved.id);
      if (THEME_COLORS[candidate]) theme = candidate;
    } catch (error) {}
    document.documentElement.dataset.theme = theme;
    themeColorMeta.setAttribute("content", THEME_COLORS[theme]);
  }

  function updateAddress() {
    try {
      var url = new URL(location.href);
      if (selectedDate === todayString()) url.searchParams.delete("date");
      else url.searchParams.set("date", selectedDate);
      history.replaceState(null, "", url.href);
    } catch (error) {}
  }

  function updateDateUi() {
    diaryDate.max = todayString();
    diaryDate.value = selectedDate;
    headingDate.textContent = longDate(selectedDate);
    paperYear.textContent = selectedDate.split("-").join(" · ");
    paperTitle.textContent = titleFor(selectedDate);
    nextDayButton.disabled = selectedDate >= todayString();
  }

  function clearPaperBeforeRequest() {
    message.textContent = "";
    reading.hidden = true;
    lockedState.hidden = true;
    emptyState.hidden = true;
    paperMeta.hidden = true;
    paper.classList.remove("is-locked");
  }

  function renderRecord(record) {
    var hasContent = Boolean(record && record.hasContent);
    var isLocked = Boolean(hasContent && record.locked);
    paper.classList.toggle("is-locked", isLocked);
    visibilityBadge.classList.toggle("is-locked", isLocked);
    visibilityUse.setAttribute("href", isLocked ? "#diary-icon-lock" : "#diary-icon-eye");
    visibilityText.textContent = isLocked ? "Volo 锁起来了" : "想让你看到";
    message.textContent = "";
    reading.hidden = !hasContent || isLocked;
    lockedState.hidden = !isLocked;
    emptyState.hidden = hasContent;
    paperMeta.hidden = !hasContent || isLocked;

    if (hasContent && !isLocked) {
      message.textContent = String(record.message || "");
      var weather = WEATHER_TYPES[record.weather] || "天气未记";
      if (record.temperature !== null && record.temperature !== undefined) weather += " · " + record.temperature + "℃";
      paperWeather.textContent = weather;
      var updated = record.updatedAt ? new Date(record.updatedAt) : null;
      paperUpdated.textContent = updated && !Number.isNaN(updated.getTime())
        ? "Volo 写于 " + updated.toLocaleString("zh-CN", { hour12: false })
        : "Volo 写下的";
    }
    setStatus("ready", isLocked ? "这一页已锁" : hasContent ? "Volo 想让你看到" : "等待 Volo 落笔");
  }

  function archiveButton(record) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "diary-archive-button";
    button.classList.toggle("is-selected", record.date === selectedDate);
    button.dataset.date = record.date;
    var date = document.createElement("span");
    date.textContent = shortDate(record.date);
    var state = document.createElement("span");
    state.textContent = record.locked ? "已锁" : "可读";
    button.append(date, state);
    return button;
  }

  function renderArchive() {
    var shared = indexRecords.filter(function (record) { return record.visibility !== "locked"; });
    var locked = indexRecords.filter(function (record) { return record.visibility === "locked"; });
    sharedCount.textContent = shared.length + " 页";
    lockedCount.textContent = locked.length + " 页";
    sharedList.replaceChildren();
    lockedList.replaceChildren();
    [ [sharedList, shared, "还没有公开的页"], [lockedList, locked, "还没有锁起来的页"] ].forEach(function (entry) {
      if (!entry[1].length) {
        var empty = document.createElement("p");
        empty.className = "diary-list-empty";
        empty.textContent = entry[2];
        entry[0].appendChild(empty);
      } else {
        entry[1].forEach(function (record) { entry[0].appendChild(archiveButton(record)); });
      }
    });
  }

  async function loadIndex() {
    if (!window.CCC || !window.CCC.isConfigured()) {
      indexRecords = [];
      renderArchive();
      sharedCount.textContent = "未连接";
      lockedCount.textContent = "未连接";
      showError("请先在 Chat 中配置服务器连接。这里不再使用浏览器本地日记。");
      return;
    }
    try {
      var payload = await window.CCC.dailyDiaryIndex();
      indexRecords = Array.isArray(payload.records) ? payload.records : [];
      if (shouldOpenLatestShared) {
        var latestShared = indexRecords.find(function (record) {
          return record && record.hasContent && record.visibility !== "locked";
        });
        if (latestShared && validDate(latestShared.date)) selectedDate = latestShared.date;
        shouldOpenLatestShared = false;
      }
      renderArchive();
    } catch (error) {
      sharedCount.textContent = "读取失败";
      lockedCount.textContent = "读取失败";
      showError(error.message);
    }
  }

  async function loadSelectedDate() {
    var generation = ++requestGeneration;
    updateDateUi();
    updateAddress();
    clearPaperBeforeRequest();
    clearError();
    renderArchive();
    setStatus("loading", "正在翻页");
    if (!window.CCC || !window.CCC.isConfigured()) {
      showError("请先在 Chat 中配置服务器连接。");
      emptyState.hidden = false;
      return;
    }
    try {
      var payload = await window.CCC.dailyDiary(selectedDate);
      if (generation !== requestGeneration) return;
      renderRecord(payload.record || {});
    } catch (error) {
      if (generation !== requestGeneration) return;
      emptyState.hidden = false;
      showError(error.message);
    }
  }

  function selectDate(value) {
    if (!validDate(value) || value > todayString()) {
      diaryDate.value = selectedDate;
      showError("只能翻到今天或更早的日期。");
      return;
    }
    selectedDate = value;
    loadSelectedDate();
    emitClawd("walking", "翻一页 Volo 的日记", { duration: 1100, priority: 2 });
  }

  diaryDate.addEventListener("change", function () { selectDate(diaryDate.value); });
  previousDayButton.addEventListener("click", function () { selectDate(shiftDate(selectedDate, -1)); });
  nextDayButton.addEventListener("click", function () { selectDate(shiftDate(selectedDate, 1)); });
  document.querySelector(".diary-controls").addEventListener("click", function (event) {
    var button = event.target.closest("[data-date]");
    if (button) selectDate(button.dataset.date);
  });
  document.addEventListener("ccc:config-changed", async function () { await loadIndex(); loadSelectedDate(); });
  window.addEventListener("pageshow", async function () { syncTheme(); await loadIndex(); loadSelectedDate(); });
  document.addEventListener("visibilitychange", async function () {
    if (!document.hidden) { await loadIndex(); loadSelectedDate(); }
  });

  syncTheme();
  loadIndex().then(loadSelectedDate);
})();
