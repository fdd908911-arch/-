(function () {
  "use strict";

  var select = document.getElementById("terminalSessionSelect");
  var TERMINAL_SESSION_KEY = "island-chat.ccc-terminal-session.v1";
  var output = document.getElementById("terminalOutput");
  var stateLabel = document.getElementById("terminalConnectionState");
  var composer = document.getElementById("terminalComposer");
  var input = document.getElementById("terminalInput");
  var sendButton = document.getElementById("terminalSendButton");
  var sessions = [];
  var selectedSession = localStorage.getItem(TERMINAL_SESSION_KEY) || window.CCC.getSelectedSession();
  var pollTimer = 0;
  var generation = 0;
  var sending = false;

  function isTerminalVisible() {
    return document.body.dataset.chatView === "terminal" && !document.hidden;
  }

  function setState(text, online) {
    stateLabel.textContent = text;
    stateLabel.classList.toggle("online", Boolean(online));
  }

  function renderOptions() {
    var fragment = document.createDocumentFragment();
    sessions.forEach(function (session) {
      var option = document.createElement("option");
      option.value = session.tmux_session;
      option.textContent = session.title || session.tmux_session;
      option.selected = session.tmux_session === selectedSession;
      fragment.appendChild(option);
    });
    select.replaceChildren(fragment);
    select.disabled = sessions.length === 0;
  }

  async function loadSessions() {
    if (!window.CCC.isConfigured()) {
      sessions = [];
      renderOptions();
      setState("未配置", false);
      output.textContent = "请先在 Volo 会话侧栏配置服务器连接。";
      return;
    }
    try {
      var payload = await window.CCC.sessions();
      sessions = (payload.sessions || []).filter(function (session) {
        return !session.archived && !["glm", "deepseek"].includes(session.tmux_session);
      });
      if (!sessions.some(function (session) { return session.tmux_session === selectedSession; })) {
        selectedSession = sessions.length ? sessions[0].tmux_session : "";
      }
      renderOptions();
      if (selectedSession) {
        localStorage.setItem(TERMINAL_SESSION_KEY, selectedSession);
        refreshTerminal(true);
      } else {
        output.textContent = "还没有 tmux 窗口。";
      }
    } catch (error) {
      setState(error.message, false);
    }
  }

  async function refreshTerminal(scroll) {
    var session = selectedSession;
    if (!session || !isTerminalVisible()) {
      schedulePoll(900);
      return;
    }
    var requestId = ++generation;
    try {
      var payload = await window.CCC.capture(session, 180);
      if (requestId !== generation || selectedSession !== session) {
        return;
      }
      var wasNearBottom =
        output.scrollHeight - output.scrollTop - output.clientHeight < 80;
      var nextContent = payload.content || payload.text || payload.output || "";
      var contentChanged = output.textContent !== nextContent;
      if (contentChanged) {
        output.textContent = nextContent;
      }
      setState(session + " · 在线", true);
      if (contentChanged && (scroll || wasNearBottom)) {
        requestAnimationFrame(function () {
          output.scrollTop = output.scrollHeight;
        });
      }
    } catch (error) {
      if (requestId === generation) {
        setState(error.message, false);
        output.textContent = "无法读取 " + session + "\n\n" + error.message;
      }
    } finally {
      schedulePoll(900);
    }
  }

  function schedulePoll(delay) {
    window.clearTimeout(pollTimer);
    pollTimer = window.setTimeout(function () {
      refreshTerminal(false);
    }, delay);
  }

  async function sendText() {
    var value = input.value;
    var session = selectedSession;
    if (!session || !value.trim() || sending) {
      return;
    }
    sending = true;
    sendButton.disabled = true;
    input.value = "";
    try {
      await window.CCC.sendTerminalText(session, value, true);
      await refreshTerminal(true);
    } catch (error) {
      input.value = value;
      setState(error.message, false);
    } finally {
      sending = false;
      sendButton.disabled = false;
      input.focus();
    }
  }

  select.addEventListener("change", function () {
    selectedSession = select.value;
    generation += 1;
    localStorage.setItem(TERMINAL_SESSION_KEY, selectedSession);
    output.textContent = "";
    refreshTerminal(true);
  });

  composer.addEventListener("submit", function (event) {
    event.preventDefault();
    sendText();
  });

  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      sendText();
    }
  });

  document.querySelectorAll("[data-terminal-key]").forEach(function (button) {
    button.addEventListener("click", async function () {
      if (!selectedSession) {
        return;
      }
      try {
        await window.CCC.sendTerminalKey(selectedSession, button.dataset.terminalKey);
        await refreshTerminal(true);
      } catch (error) {
        setState(error.message, false);
      }
    });
  });

  document.addEventListener("ccc:config-changed", loadSessions);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) {
      refreshTerminal(false);
    }
  });
  window.addEventListener("hashchange", function () {
    if (window.location.hash === "#terminal") {
      loadSessions();
    }
  });

  loadSessions();
})();
