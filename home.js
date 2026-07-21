(function () {
  "use strict";

  var APPEARANCE_KEY = "island-chat.preferences.v1";
  var RELATIONSHIP_KEY = "island-home.relationship.v1";
  var DAILY_KEY = "island-home.daily.v1";
  var DEFAULT_START_DATE = "2026-07-04";
  var DAY_MS = 24 * 60 * 60 * 1000;
  var LEGACY_THEMES = { coast: "zen", dusk: "sage", paper: "blush" };
  var THEME_NAMES = {
    mist: "雾蓝杏粉",
    zen: "禅意米棕",
    sage: "灰绿鹅黄",
    blush: "烟粉雾蓝"
  };
  var THEME_COLORS = {
    mist: "#eef2f0",
    zen: "#f2efe8",
    sage: "#f1f1e7",
    blush: "#ebeef1"
  };
  var WEATHER_TYPES = {
    sunny: { emoji: "☀️", label: "晴" },
    "partly-cloudy": { emoji: "🌤️", label: "晴间多云" },
    cloudy: { emoji: "☁️", label: "多云" },
    rainy: { emoji: "🌧️", label: "下雨" },
    storm: { emoji: "⛈️", label: "雷雨" },
    snowy: { emoji: "🌨️", label: "下雪" },
    foggy: { emoji: "🌫️", label: "有雾" },
    windy: { emoji: "🌬️", label: "有风" }
  };

  var daysCount = document.getElementById("daysCount");
  var daysCaption = document.getElementById("daysCaption");
  var startDateLabel = document.getElementById("startDateLabel");
  var editDateButton = document.getElementById("editDateButton");
  var dateEntryButton = document.getElementById("dateEntryButton");
  var dateDialog = document.getElementById("dateDialog");
  var dateForm = document.getElementById("dateForm");
  var dateInput = document.getElementById("relationshipDate");
  var dateError = document.getElementById("dateError");
  var clearDateButton = document.getElementById("clearDateButton");
  var dateDialogClose = document.getElementById("dateDialogClose");
  var dateCancelButton = document.getElementById("dateCancelButton");
  var homeThemeName = document.getElementById("homeThemeName");
  var themeColorMeta = document.getElementById("themeColorMeta");
  var homeToast = document.getElementById("homeToast");
  var homeToastText = document.getElementById("homeToastText");
  var todayDateLabel = document.getElementById("todayDateLabel");
  var weatherEmoji = document.getElementById("weatherEmoji");
  var weatherTemperature = document.getElementById("weatherTemperature");
  var weatherCondition = document.getElementById("weatherCondition");
  var dailyNote = document.getElementById("dailyNote");
  var weatherCard = document.querySelector(".weather-card");

  var startDate = readStartDate();
  var activeDay = todayString();
  var dailyRecord = readDailyRecord(activeDay);
  var toastTimer = null;

  function emitClawd(state, phrase, options) {
    var detail = Object.assign(
      {
        state: state,
        phrase: phrase || ""
      },
      options || {}
    );
    document.dispatchEvent(new CustomEvent("clawd:action", { detail: detail }));
  }

  function readTheme() {
    try {
      var appearance = JSON.parse(localStorage.getItem(APPEARANCE_KEY));
      var theme =
        appearance &&
        (appearance.theme || LEGACY_THEMES[appearance.id] || appearance.id);
      return Object.prototype.hasOwnProperty.call(THEME_NAMES, theme) ? theme : "mist";
    } catch (error) {
      return "mist";
    }
  }

  function syncTheme() {
    var theme = readTheme();
    document.documentElement.dataset.theme = theme;
    homeThemeName.textContent = THEME_NAMES[theme];
    themeColorMeta.setAttribute("content", THEME_COLORS[theme]);
  }

  function readStartDate() {
    try {
      var saved = JSON.parse(localStorage.getItem(RELATIONSHIP_KEY));
      if (saved && saved.version === 2 && isValidDateString(saved.startDate)) {
        return saved.startDate;
      }
      writeStartDate(DEFAULT_START_DATE);
    } catch (error) {
      return DEFAULT_START_DATE;
    }
    return DEFAULT_START_DATE;
  }

  function writeStartDate(value) {
    localStorage.setItem(
      RELATIONSHIP_KEY,
      JSON.stringify({ version: 2, startDate: value })
    );
  }

  function isValidDateString(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) {
      return false;
    }
    var parts = value.split("-").map(Number);
    var date = new Date(parts[0], parts[1] - 1, parts[2]);
    return (
      date.getFullYear() === parts[0] &&
      date.getMonth() === parts[1] - 1 &&
      date.getDate() === parts[2]
    );
  }

  function todayString() {
    var today = new Date();
    var year = String(today.getFullYear());
    var month = String(today.getMonth() + 1).padStart(2, "0");
    var day = String(today.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function utcDayValue(dateString) {
    var parts = dateString.split("-").map(Number);
    return Date.UTC(parts[0], parts[1] - 1, parts[2]);
  }

  function relationshipDays(dateString) {
    var today = new Date();
    var todayValue = Date.UTC(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    return Math.floor((todayValue - utcDayValue(dateString)) / DAY_MS) + 1;
  }

  function formatDate(dateString) {
    var parts = dateString.split("-").map(Number);
    return parts[0] + "年" + parts[1] + "月" + parts[2] + "日";
  }

  function formatShortDate(dateString) {
    var parts = dateString.split("-").map(Number);
    return parts[0] + "." + parts[1] + "." + parts[2];
  }

  function localDateFromString(dateString) {
    var parts = dateString.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function formatTodayLabel(dateString) {
    var date = localDateFromString(dateString);
    return new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric"
    }).format(date);
  }

  function emptyDailyRecord() {
    return {
      weather: "",
      temperature: null,
      message: ""
    };
  }

  function readDailyStore() {
    try {
      var parsed = JSON.parse(localStorage.getItem(DAILY_KEY));
      if (parsed && parsed.version === 1 && parsed.days && typeof parsed.days === "object") {
        return parsed;
      }
    } catch (error) {
      // A fresh store is used when local data is unavailable or malformed.
    }
    return { version: 1, days: {} };
  }

  function normalizeDailyRecord(record) {
    if (!record || typeof record !== "object") {
      return emptyDailyRecord();
    }
    var weather = Object.prototype.hasOwnProperty.call(WEATHER_TYPES, record.weather)
      ? record.weather
      : "";
    var temperature =
      typeof record.temperature === "number" &&
      Number.isFinite(record.temperature) &&
      record.temperature >= -50 &&
      record.temperature <= 60
        ? record.temperature
        : null;
    var message =
      typeof record.message === "string"
        ? record.message.trim().slice(0, 80)
        : "";
    return {
      weather: weather,
      temperature: temperature,
      message: message
    };
  }

  function readDailyRecord(dateString) {
    var store = readDailyStore();
    return normalizeDailyRecord(store.days[dateString]);
  }

  function formatTemperature(value) {
    if (value === null) {
      return "--°";
    }
    return String(Number.isInteger(value) ? value : value.toFixed(1)) + "℃";
  }

  function renderDaily() {
    todayDateLabel.textContent = formatTodayLabel(activeDay);
    weatherEmoji.textContent = "◌";
    weatherTemperature.textContent = "Volo";
    weatherCondition.textContent = "的日记";
    dailyNote.textContent = "有些页想让你看到，有些页由 ta 锁起来。";
    weatherCard.setAttribute("aria-label", "打开 Volo 的日记");
  }

  function renderDays() {
    if (!startDate) {
      startDate = DEFAULT_START_DATE;
    }

    var days = relationshipDays(startDate);
    if (days < 1) {
      startDate = DEFAULT_START_DATE;
      writeStartDate(startDate);
      renderDays();
      return;
    }

    daysCount.textContent = String(days);
    daysCaption.textContent = "FROM " + formatShortDate(startDate);
    startDateLabel.textContent = formatShortDate(startDate);
    startDateLabel.setAttribute("datetime", startDate);
    clearDateButton.hidden = false;
  }

  function openDateDialog() {
    dateError.hidden = true;
    dateError.textContent = "";
    dateInput.max = todayString();
    dateInput.value = startDate || todayString();
    clearDateButton.hidden = false;
    if (typeof dateDialog.showModal === "function") {
      dateDialog.showModal();
    } else {
      dateDialog.setAttribute("open", "");
    }
    window.setTimeout(function () {
      dateInput.focus();
    }, 30);
    emitClawd("thinking", "选一个重要的日子", {
      duration: 2200,
      priority: 2
    });
  }

  function closeDateDialog() {
    if (dateDialog.open) {
      dateDialog.close();
    } else {
      dateDialog.removeAttribute("open");
    }
  }

  function showDateError(message) {
    dateError.textContent = message;
    dateError.hidden = false;
    emitClawd("confused", "这个日期好像不对", {
      duration: 2600,
      priority: 4
    });
  }

  function refreshDateSensitiveUI() {
    var currentDay = todayString();
    if (currentDay !== activeDay) {
      activeDay = currentDay;
    }
    dailyRecord = readDailyRecord(activeDay);
    renderDays();
    renderDaily();
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    homeToastText.textContent = message;
    homeToast.hidden = false;
    requestAnimationFrame(function () {
      homeToast.classList.add("visible");
    });
    toastTimer = window.setTimeout(function () {
      homeToast.classList.remove("visible");
      window.setTimeout(function () {
        if (!homeToast.classList.contains("visible")) {
          homeToast.hidden = true;
        }
      }, 190);
    }, 2200);
  }

  editDateButton.addEventListener("click", openDateDialog);
  dateEntryButton.addEventListener("click", openDateDialog);
  dateDialogClose.addEventListener("click", closeDateDialog);
  dateCancelButton.addEventListener("click", closeDateDialog);
  dateInput.addEventListener("input", function () {
    emitClawd("typing", "", {
      duration: 900,
      priority: 1
    });
  });

  dateDialog.addEventListener("cancel", function (event) {
    event.preventDefault();
    closeDateDialog();
  });

  dateDialog.addEventListener("click", function (event) {
    if (event.target === dateDialog) {
      closeDateDialog();
    }
  });

  dateForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var value = dateInput.value;
    if (!isValidDateString(value)) {
      showDateError("请选择一个有效日期。");
      return;
    }
    if (utcDayValue(value) > utcDayValue(todayString())) {
      showDateError("开始日期不能晚于今天。");
      return;
    }
    try {
      writeStartDate(value);
      startDate = value;
      renderDays();
      closeDateDialog();
      showToast("开始日期已保存");
      emitClawd("eureka", "记住这个日子啦", {
        duration: 2200,
        priority: 3,
        next: {
          name: "happy",
          duration: 1300,
          priority: 3
        }
      });
    } catch (error) {
      showDateError("浏览器没有允许保存，请稍后再试。");
    }
  });

  clearDateButton.addEventListener("click", function () {
    try {
      writeStartDate(DEFAULT_START_DATE);
      startDate = DEFAULT_START_DATE;
      renderDays();
      closeDateDialog();
      showToast("已恢复为 FROM 2026.7.4");
      emitClawd("sweeping", "恢复默认日期啦", {
        duration: 2400,
        priority: 3
      });
    } catch (error) {
      showDateError("浏览器没有允许保存，请稍后再试。");
    }
  });

  document
    .querySelectorAll("[data-clawd-destination]")
    .forEach(function (entry) {
      entry.addEventListener("pointerdown", function () {
        var destination = entry.dataset.clawdDestination;
        emitClawd("goingAway", "去" + destination + "见", {
          duration: 900,
          priority: 3
        });
      });
    });

  window.addEventListener("pageshow", function () {
    syncTheme();
    refreshDateSensitiveUI();
  });

  window.addEventListener("focus", refreshDateSensitiveUI);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) {
      refreshDateSensitiveUI();
    }
  });

  window.addEventListener("storage", function (event) {
    if (!event.key || event.key === APPEARANCE_KEY) {
      syncTheme();
    }
    if (!event.key || event.key === RELATIONSHIP_KEY) {
      startDate = readStartDate();
      renderDays();
    }
    if (!event.key || event.key === DAILY_KEY) {
      activeDay = todayString();
      dailyRecord = readDailyRecord(activeDay);
      renderDaily();
    }
  });
  window.setInterval(refreshDateSensitiveUI, 60 * 1000);

  syncTheme();
  refreshDateSensitiveUI();
})();
