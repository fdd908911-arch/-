(function () {
  "use strict";

  var APPEARANCE_KEY = "island-chat.preferences.v1";
  var DAILY_KEY = "island-home.daily.v1";
  var FONT_KEY = "island-diary.font.v1";
  var MAX_MESSAGE_LENGTH = 2000;
  var AUTO_SAVE_DELAY = 850;
  var LEGACY_THEMES = { coast: "zen", dusk: "sage", paper: "blush" };
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
  var FONT_NAMES = {
    handwriting: "手写",
    serif: "宋体",
    modern: "简洁"
  };

  var diaryForm = document.getElementById("diaryForm");
  var diaryBack = document.querySelector(".diary-back");
  var diaryDate = document.getElementById("diaryDate");
  var previousDayButton = document.getElementById("previousDayButton");
  var nextDayButton = document.getElementById("nextDayButton");
  var diaryWeather = document.getElementById("diaryWeather");
  var diaryTemperature = document.getElementById("diaryTemperature");
  var diaryText = document.getElementById("diaryText");
  var diaryWeatherEmoji = document.getElementById("diaryWeatherEmoji");
  var diaryPaperWeatherEmoji = document.getElementById("diaryPaperWeatherEmoji");
  var diaryPaperWeatherText = document.getElementById("diaryPaperWeatherText");
  var diaryPaperWeather = document.querySelector(".diary-paper-weather");
  var diaryHeadingDate = document.getElementById("diaryHeadingDate");
  var diaryPaperYear = document.getElementById("diaryPaperYear");
  var diaryPaperTitle = document.getElementById("diaryPaperTitle");
  var diaryCharacterCount = document.getElementById("diaryCharacterCount");
  var diarySaveState = document.getElementById("diarySaveState");
  var diarySaveStateText = document.getElementById("diarySaveStateText");
  var diaryError = document.getElementById("diaryError");
  var diaryClearButton = document.getElementById("diaryClearButton");
  var diaryClearButtonText = diaryClearButton.querySelector("span");
  var fontInputs = Array.prototype.slice.call(
    document.querySelectorAll('input[name="diaryFont"]')
  );
  var themeColorMeta = document.getElementById("themeColorMeta");
  var diaryToast = document.getElementById("diaryToast");
  var diaryToastText = document.getElementById("diaryToastText");

  var selectedDate = readInitialDate();
  var dirty = false;
  var saveTimer = 0;
  var toastTimer = 0;
  var clearConfirmTimer = 0;
  var lastTypingSignal = 0;

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

  function todayString() {
    var today = new Date();
    return (
      String(today.getFullYear()) +
      "-" +
      String(today.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(today.getDate()).padStart(2, "0")
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

  function localDateFromString(value) {
    var parts = value.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function dateStringFromLocalDate(date) {
    return (
      String(date.getFullYear()) +
      "-" +
      String(date.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(date.getDate()).padStart(2, "0")
    );
  }

  function shiftDate(value, amount) {
    var date = localDateFromString(value);
    date.setDate(date.getDate() + amount);
    return dateStringFromLocalDate(date);
  }

  function readInitialDate() {
    var candidate = "";
    try {
      candidate = new URLSearchParams(window.location.search).get("date") || "";
    } catch (error) {
      candidate = "";
    }
    return isValidDateString(candidate) && candidate <= todayString()
      ? candidate
      : todayString();
  }

  function formatLongDate(value) {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long"
    }).format(localDateFromString(value));
  }

  function formatPaperTitle(value) {
    if (value === todayString()) {
      return "今天的日记";
    }
    var parts = value.split("-").map(Number);
    return parts[1] + "月" + parts[2] + "日的日记";
  }

  function formatPaperYear(value) {
    var parts = value.split("-");
    return parts[0] + " · " + parts[1] + " / " + parts[2];
  }

  function syncDateInAddress() {
    try {
      var url = new URL(window.location.href);
      if (selectedDate === todayString()) {
        url.searchParams.delete("date");
      } else {
        url.searchParams.set("date", selectedDate);
      }
      window.history.replaceState(null, "", url.href);
    } catch (error) {
      // The selected date still works when a browser restricts file URL history.
    }
  }

  function readTheme() {
    try {
      var saved = JSON.parse(localStorage.getItem(APPEARANCE_KEY));
      var theme =
        saved && (saved.theme || LEGACY_THEMES[saved.id] || saved.id);
      return Object.prototype.hasOwnProperty.call(THEME_COLORS, theme)
        ? theme
        : "mist";
    } catch (error) {
      return "mist";
    }
  }

  function syncTheme() {
    var theme = readTheme();
    document.documentElement.dataset.theme = theme;
    themeColorMeta.setAttribute("content", THEME_COLORS[theme]);
  }

  function emptyRecord() {
    return { weather: "", temperature: null, message: "", updatedAt: "" };
  }

  function readDailyStore() {
    try {
      var parsed = JSON.parse(localStorage.getItem(DAILY_KEY));
      if (
        parsed &&
        parsed.version === 1 &&
        parsed.days &&
        typeof parsed.days === "object"
      ) {
        return parsed;
      }
    } catch (error) {
      // A clean in-memory store keeps the editor usable if saved data is malformed.
    }
    return { version: 1, days: {} };
  }

  function normalizeRecord(record) {
    if (!record || typeof record !== "object") {
      return emptyRecord();
    }
    var weather = Object.prototype.hasOwnProperty.call(
      WEATHER_TYPES,
      record.weather
    )
      ? record.weather
      : "";
    var temperature =
      typeof record.temperature === "number" &&
      Number.isFinite(record.temperature) &&
      record.temperature >= -50 &&
      record.temperature <= 60
        ? record.temperature
        : null;
    return {
      weather: weather,
      temperature: temperature,
      message:
        typeof record.message === "string"
          ? record.message.slice(0, MAX_MESSAGE_LENGTH)
          : "",
      updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : ""
    };
  }

  function readRecord(value) {
    return normalizeRecord(readDailyStore().days[value]);
  }

  function recordHasContent(record) {
    return Boolean(
      record.weather ||
        record.temperature !== null ||
        record.message.trim()
    );
  }

  function writeRecord(value, record) {
    var store = readDailyStore();
    if (recordHasContent(record)) {
      store.days[value] = {
        weather: record.weather,
        temperature: record.temperature,
        message: record.message,
        updatedAt: new Date().toISOString()
      };
    } else {
      delete store.days[value];
    }
    localStorage.setItem(DAILY_KEY, JSON.stringify(store));
  }

  function readFont() {
    try {
      var saved = localStorage.getItem(FONT_KEY);
      return Object.prototype.hasOwnProperty.call(FONT_NAMES, saved)
        ? saved
        : "serif";
    } catch (error) {
      return "serif";
    }
  }

  function applyFont(font, shouldSave) {
    var nextFont = Object.prototype.hasOwnProperty.call(FONT_NAMES, font)
      ? font
      : "serif";
    document.body.dataset.diaryFont = nextFont;
    fontInputs.forEach(function (input) {
      input.checked = input.value === nextFont;
    });
    if (shouldSave) {
      try {
        localStorage.setItem(FONT_KEY, nextFont);
      } catch (error) {
        showError("字体已经切换，但浏览器没有允许记住这个选择。");
      }
    }
  }

  function setSaveState(state, message) {
    diarySaveState.dataset.state = state;
    diarySaveStateText.textContent = message;
  }

  function showError(message) {
    diaryError.textContent = message;
    diaryError.hidden = false;
    setSaveState("error", "暂未保存");
  }

  function clearError() {
    diaryError.hidden = true;
    diaryError.textContent = "";
    diaryTemperature.removeAttribute("aria-invalid");
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    diaryToastText.textContent = message;
    diaryToast.hidden = false;
    requestAnimationFrame(function () {
      diaryToast.classList.add("visible");
    });
    toastTimer = window.setTimeout(function () {
      diaryToast.classList.remove("visible");
      window.setTimeout(function () {
        if (!diaryToast.classList.contains("visible")) {
          diaryToast.hidden = true;
        }
      }, 190);
    }, 2200);
  }

  function parseTemperature() {
    if (diaryTemperature.validity && diaryTemperature.validity.badInput) {
      throw new Error("温度请填写 -50 到 60 之间的数字，最多一位小数。");
    }
    var raw = diaryTemperature.value.trim();
    if (!raw) {
      return null;
    }
    if (!/^-?\d{1,2}(?:\.\d)?$/.test(raw)) {
      throw new Error("温度请填写 -50 到 60 之间的数字，最多一位小数。");
    }
    var value = Number(raw);
    if (!Number.isFinite(value) || value < -50 || value > 60) {
      throw new Error("温度需要在 -50℃ 到 60℃ 之间。");
    }
    return value;
  }

  function buildRecordFromFields() {
    var temperature;
    try {
      temperature = parseTemperature();
    } catch (error) {
      diaryTemperature.setAttribute("aria-invalid", "true");
      throw error;
    }
    return {
      weather: Object.prototype.hasOwnProperty.call(
        WEATHER_TYPES,
        diaryWeather.value
      )
        ? diaryWeather.value
        : "",
      temperature: temperature,
      message: diaryText.value.slice(0, MAX_MESSAGE_LENGTH)
    };
  }

  function updateWeatherPreview() {
    var weather = WEATHER_TYPES[diaryWeather.value];
    var emoji = weather ? weather.emoji : "○";
    var label = weather ? weather.label : "天气待记录";
    diaryWeatherEmoji.textContent = emoji;
    diaryPaperWeatherEmoji.textContent = emoji;
    diaryPaperWeatherText.textContent = label;
    diaryPaperWeather.setAttribute("aria-label", "当前记录的天气：" + label);
  }

  function updateCharacterCount() {
    diaryCharacterCount.textContent = String(diaryText.value.length);
  }

  function updateDatePresentation() {
    diaryDate.max = todayString();
    diaryDate.value = selectedDate;
    diaryHeadingDate.textContent = formatLongDate(selectedDate);
    diaryPaperYear.textContent = formatPaperYear(selectedDate);
    diaryPaperTitle.textContent = formatPaperTitle(selectedDate);
    previousDayButton.disabled = false;
    nextDayButton.disabled = selectedDate >= todayString();
  }

  function resetClearConfirmation() {
    window.clearTimeout(clearConfirmTimer);
    diaryClearButton.classList.remove("confirming");
    diaryClearButtonText.textContent = "清空";
  }

  function loadSelectedRecord() {
    window.clearTimeout(saveTimer);
    resetClearConfirmation();
    clearError();
    var record = readRecord(selectedDate);
    diaryWeather.value = record.weather;
    diaryTemperature.value =
      record.temperature === null ? "" : String(record.temperature);
    diaryText.value = record.message;
    dirty = false;
    updateDatePresentation();
    updateWeatherPreview();
    updateCharacterCount();
    setSaveState(
      "saved",
      recordHasContent(record) ? "日记已载入" : "等待记录"
    );
  }

  function saveCurrent(options) {
    var settings = options || {};
    window.clearTimeout(saveTimer);
    clearError();
    var record;
    try {
      record = buildRecordFromFields();
    } catch (error) {
      dirty = true;
      showError(error.message);
      emitClawd("confused", "这篇日记还没存好", {
        duration: 2400,
        priority: 4
      });
      return false;
    }

    try {
      writeRecord(selectedDate, record);
    } catch (error) {
      dirty = true;
      showError("浏览器没有允许保存，日记内容还保留在页面上。");
      emitClawd("confused", "这篇日记还没存好", {
        duration: 2400,
        priority: 4
      });
      return false;
    }

    dirty = false;
    setSaveState("saved", "已保存到这台设备");
    if (!settings.silent) {
      showToast(settings.cleared ? "这一天已经重新留白" : "日记已经保存");
      emitClawd(settings.cleared ? "sweeping" : "eureka", settings.cleared ? "重新留白啦" : "今天也记下来啦", {
        duration: 2100,
        priority: 3,
        next: settings.cleared
          ? null
          : { name: "happy", duration: 1200, priority: 3 }
      });
    }
    return true;
  }

  function scheduleSave() {
    window.clearTimeout(saveTimer);
    dirty = true;
    setSaveState("saving", "正在自动保存…");
    saveTimer = window.setTimeout(function () {
      saveCurrent({ silent: true });
    }, AUTO_SAVE_DELAY);
  }

  function switchDate(nextDate) {
    if (
      !isValidDateString(nextDate) ||
      nextDate > todayString()
    ) {
      diaryDate.value = selectedDate;
      showError("只能选择今天或更早的日期。");
      return;
    }
    if (nextDate === selectedDate) {
      return;
    }
    if (dirty && !saveCurrent({ silent: true })) {
      diaryDate.value = selectedDate;
      diaryTemperature.focus();
      return;
    }
    selectedDate = nextDate;
    syncDateInAddress();
    loadSelectedRecord();
    emitClawd("walking", "翻到另一天看看", {
      duration: 1300,
      priority: 2
    });
  }

  diaryForm.addEventListener("submit", function (event) {
    event.preventDefault();
    resetClearConfirmation();
    saveCurrent({ silent: false });
  });

  diaryDate.addEventListener("change", function () {
    switchDate(diaryDate.value);
  });

  previousDayButton.addEventListener("click", function () {
    switchDate(shiftDate(selectedDate, -1));
  });

  nextDayButton.addEventListener("click", function () {
    switchDate(shiftDate(selectedDate, 1));
  });

  diaryWeather.addEventListener("change", function () {
    resetClearConfirmation();
    clearError();
    updateWeatherPreview();
    scheduleSave();
  });

  diaryTemperature.addEventListener("input", function () {
    resetClearConfirmation();
    clearError();
    scheduleSave();
  });

  diaryText.addEventListener("input", function () {
    resetClearConfirmation();
    clearError();
    updateCharacterCount();
    scheduleSave();
    if (Date.now() - lastTypingSignal > 700) {
      lastTypingSignal = Date.now();
      emitClawd("typing", "", { duration: 900, priority: 1 });
    }
  });

  fontInputs.forEach(function (input) {
    input.addEventListener("change", function () {
      if (!input.checked) {
        return;
      }
      applyFont(input.value, true);
      showToast("日记字体已切换为“" + FONT_NAMES[input.value] + "”");
      emitClawd("wizard", "换一种字来写", {
        duration: 1800,
        priority: 2
      });
    });
  });

  diaryClearButton.addEventListener("click", function () {
    if (!diaryClearButton.classList.contains("confirming")) {
      diaryClearButton.classList.add("confirming");
      diaryClearButtonText.textContent = "再点一次";
      clearConfirmTimer = window.setTimeout(resetClearConfirmation, 3200);
      return;
    }
    resetClearConfirmation();
    diaryWeather.value = "";
    diaryTemperature.value = "";
    diaryText.value = "";
    updateWeatherPreview();
    updateCharacterCount();
    dirty = true;
    saveCurrent({ silent: false, cleared: true });
  });

  diaryBack.addEventListener("click", function (event) {
    if (dirty && !saveCurrent({ silent: true })) {
      event.preventDefault();
      diaryTemperature.focus();
      showToast("请先修正温度，再返回开场页");
      return;
    }
    emitClawd("goingAway", "回开场页见", {
      duration: 900,
      priority: 3
    });
  });

  document.addEventListener("keydown", function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      resetClearConfirmation();
      saveCurrent({ silent: false });
    }
  });

  window.addEventListener("pageshow", function () {
    syncTheme();
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden && dirty) {
      saveCurrent({ silent: true });
    } else if (!document.hidden) {
      syncTheme();
    }
  });

  window.addEventListener("beforeunload", function () {
    if (dirty) {
      saveCurrent({ silent: true });
    }
  });

  window.addEventListener("storage", function (event) {
    if (!event.key || event.key === APPEARANCE_KEY) {
      syncTheme();
    }
    if ((!event.key || event.key === DAILY_KEY) && !dirty) {
      loadSelectedRecord();
    }
    if (!event.key || event.key === FONT_KEY) {
      applyFont(readFont(), false);
    }
  });

  syncTheme();
  applyFont(readFont(), false);
  loadSelectedRecord();
})();
