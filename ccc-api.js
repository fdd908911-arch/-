(function () {
  "use strict";

  var runtime = window.CCCRuntime;
  if (!runtime) throw new Error("CCC runtime must load before ccc-api.js");
  var request = runtime.request;

  window.CCC = {
    getConfig: runtime.getConfig,
    isConfigured: runtime.isConfigured,
    saveConfig: runtime.saveConfig,
    getSelectedSession: runtime.getSelectedSession,
    setSelectedSession: runtime.setSelectedSession,
    request: request,
    health: function () {
      return request("/health");
    },
    sessions: function () {
      return request("/sessions");
    },
    createSession: function (title, session, projectPath) {
      return request("/sessions/create", {
        method: "POST",
        body: { title: title, session: session, project_path: projectPath }
      });
    },
    startSession: function (session) {
      return request("/sessions/start", { method: "POST", body: { session: session } });
    },
    closeSession: function (session) {
      return request("/sessions/close", { method: "POST", body: { session: session } });
    },
    history: function (session, limit) {
      return request("/chat/history", { query: { session: session, limit: limit || 200 } });
    },
    poll: function (session, since, limit) {
      return request("/chat/poll", {
        query: { session: session, since: since || "", limit: limit || 100 }
      });
    },
    sendChat: function (session, text) {
      return request("/chat/send", {
        method: "POST",
        body: { session: session, text: text }
      });
    },
    voloStatus: function () {
      return request("/volo/status");
    },
    drivesStatus: function () {
      return request("/volo/drives");
    },
    inside: function (limit) {
      return request("/volo/inside", { query: { limit: limit || 50 } });
    },
    voloUsage: function () {
      return request("/volo/usage");
    },
    musicState: function () {
      return request("/music/state");
    },
    musicInfo: function (songId) {
      return request("/music/info", { query: { id: String(songId || "") } });
    },
    updateMusicState: function (state) {
      return request("/music/state", { method: "POST", body: state || {} });
    },
    musicStreamUrl: function (songId) {
      return runtime.apiUrl("/music/stream", { id: String(songId || "") });
    },
    musicAnalysis: function (songId) {
      return request("/music/analysis", { query: { id: String(songId || "") } });
    },
    startMusicAnalysis: function (music, force) {
      music = music || {};
      return request("/music/analysis", {
        method: "POST",
        body: {
          id: String(music.id || ""),
          title: String(music.title || ""),
          artist: String(music.artist || ""),
          cover: String(music.cover || ""),
          force: Boolean(force)
        }
      });
    },
    musicSpectrumBlob: function (songId) {
      return runtime.requestBlob("/music/analysis/spectrum", {
        query: { id: String(songId || "") }
      });
    },
    sendVolo: function (carrier, session, text, conversationId) {
      return request("/volo/chat", {
        method: "POST",
        body: {
          carrier: carrier,
          session: session,
          text: text,
          conversation_id: conversationId || undefined
        }
      });
    },
    memories: function (query, sort, offset, limit) {
      return request("/volo/memories", {
        query: {
          q: query || "",
          sort: sort || "newest",
          offset: offset || 0,
          limit: limit || 50
        }
      });
    },
    memoryStats: function () {
      return request("/volo/memory-stats");
    },
    memoryDashboard: function (filters) {
      return request("/memory/dashboard", { query: filters || {} });
    },
    memoryAction: function (action, memory) {
      return request("/volo/memories", {
        method: "POST",
        body: Object.assign({ action: action }, memory || {})
      });
    },
    capture: function (session, lines) {
      return request("/tmux/capture", {
        query: { session: session, lines: lines || 160 }
      });
    },
    sendTerminalText: function (session, keys, enter) {
      return request("/tmux/send", {
        method: "POST",
        body: { session: session, keys: keys, enter: enter !== false }
      });
    },
    sendTerminalKey: function (session, key) {
      return request("/tmux/send", {
        method: "POST",
        body: { session: session, key: key }
      });
    },
    groupRoster: function () {
      return request("/group/roster");
    },
    groupHistory: function (limit) {
      return request("/group/history", { query: { limit: limit || 300 } });
    },
    groupPoll: function (since, limit) {
      return request("/group/poll", {
        query: { since: since || "", limit: limit || 100, sender_id: "amian" }
      });
    },
    sendGroup: function (text) {
      return request("/group/send", {
        method: "POST",
        body: {
          sender_id: "amian",
          text: text,
          source: "android-pwa",
          client_msg_id: "pwa-" + Date.now() + "-" + Math.random().toString(36).slice(2)
        }
      });
    },
    dailyDiary: function (date) {
      return request("/diary/daily", { query: { date: date } });
    },
    dailyDiaryIndex: function () {
      return request("/diary/daily/index");
    },
    saveDailyDiary: function (date, record, options) {
      options = options || {};
      return request("/diary/daily", {
        method: "POST",
        body: {
          date: date,
          weather: record.weather || "",
          temperature: record.temperature,
          message: record.message || "",
          source: options.source || "hui-pwa",
          mode: options.mode || "replace"
        }
      });
    }
  };

  var dialog = document.getElementById("connectionDialog");
  var form = document.getElementById("connectionForm");
  var baseInput = document.getElementById("connectionBaseUrl");
  var tokenInput = document.getElementById("connectionToken");
  var errorText = document.getElementById("connectionError");
  var openButton = document.getElementById("voloConnectionButton");

  function openConnectionDialog() {
    if (!dialog || !baseInput || !tokenInput || !errorText) {
      window.location.href = "connect.html";
      return;
    }
    var current = runtime.readConfig();
    baseInput.value = current.baseUrl || runtime.defaultBaseUrl();
    tokenInput.value = current.token;
    errorText.hidden = true;
    dialog.showModal();
    window.setTimeout(function () {
      baseInput.focus();
    }, 40);
  }

  if (openButton) openButton.addEventListener("click", openConnectionDialog);

  document.querySelectorAll("[data-close-dialog]").forEach(function (button) {
    button.addEventListener("click", function () {
      var target = document.getElementById(button.dataset.closeDialog);
      if (target && target.open) target.close();
    });
  });

  if (form) {
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      errorText.hidden = true;
      runtime.saveConfig(baseInput.value, tokenInput.value);
      try {
        await window.CCC.sessions();
        dialog.close();
      } catch (error) {
        errorText.textContent = error.message;
        errorText.hidden = false;
      }
    });
  }

  window.CCC.openConnectionDialog = openConnectionDialog;
})();
