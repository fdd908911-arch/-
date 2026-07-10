(function () {
  "use strict";

  var APPEARANCE_KEY = "island-chat.preferences.v1";
  var RELATIONSHIP_KEY = "island-home.relationship.v1";
  var DAY_MS = 24 * 60 * 60 * 1000;
  var LEGACY_THEMES = { coast: "zen", dusk: "sage", paper: "blush" };
  var THEME_NAMES = {
    mist: "雾蓝杏粉",
    zen: "禅意米棕",
    sage: "灰绿鹅黄",
    blush: "烟粉雾蓝"
  };
  var THEME_COLORS = {
    mist: "#eef2f1",
    zen: "#f4f1ea",
    sage: "#e9eadf",
    blush: "#ebe3e5"
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

  var startDate = readStartDate();
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
      if (saved && saved.version === 1 && isValidDateString(saved.startDate)) {
        return saved.startDate;
      }
    } catch (error) {
      return null;
    }
    return null;
  }

  function writeStartDate(value) {
    localStorage.setItem(
      RELATIONSHIP_KEY,
      JSON.stringify({ version: 1, startDate: value })
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

  function renderDays() {
    if (!startDate) {
      daysCount.textContent = "—";
      daysCaption.textContent = "设置开始日期后，会每天自动更新";
      startDateLabel.textContent = "设置我们的日期";
      clearDateButton.hidden = true;
      return;
    }

    var days = relationshipDays(startDate);
    if (days < 1) {
      startDate = null;
      localStorage.removeItem(RELATIONSHIP_KEY);
      renderDays();
      return;
    }

    daysCount.textContent = String(days);
    daysCaption.textContent = "从 " + formatDate(startDate) + " 开始";
    startDateLabel.textContent = formatDate(startDate);
    clearDateButton.hidden = false;
  }

  function openDateDialog() {
    dateError.hidden = true;
    dateError.textContent = "";
    dateInput.max = todayString();
    dateInput.value = startDate || todayString();
    clearDateButton.hidden = !startDate;
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
    localStorage.removeItem(RELATIONSHIP_KEY);
    startDate = null;
    renderDays();
    closeDateDialog();
    showToast("开始日期已清除");
    emitClawd("sweeping", "把日期清空啦", {
      duration: 2600,
      priority: 3
    });
  });

  document
    .querySelectorAll(".chat-entry-card, .memory-entry-card")
    .forEach(function (entry) {
      entry.addEventListener("pointerdown", function () {
        var destination = entry.classList.contains("memory-entry-card")
          ? "Memory"
          : "聊天页";
        emitClawd("goingAway", "去" + destination + "见", {
          duration: 900,
          priority: 3
        });
      });
    });

  window.addEventListener("pageshow", function () {
    syncTheme();
    renderDays();
  });

  window.addEventListener("storage", syncTheme);
  window.setInterval(renderDays, 60 * 1000);

  syncTheme();
  renderDays();
})();

