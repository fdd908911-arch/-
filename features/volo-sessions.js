(function () {
  "use strict";

  var DEFAULT_GATEWAY_SESSION = "volo-gateway";
  var PROJECT_KEY = "island-chat.ccc-last-project.v1";

  function create(options) {
    options = options || {};
    var newChatButton = document.getElementById("voloNewChatButton");
    var topNewChatButton = document.getElementById("voloTopNewChatButton");
    var sessionList = document.getElementById("voloSessionList");
    var connectionLabel = document.getElementById("voloConnectionLabel");
    var connectionDot = document.getElementById("voloConnectionDot");
    var createDialog = document.getElementById("sessionCreateDialog");
    var createForm = document.getElementById("sessionCreateForm");
    var createTitle = document.getElementById("sessionTitleInput");
    var createName = document.getElementById("sessionNameInput");
    var createProject = document.getElementById("sessionProjectInput");
    var createError = document.getElementById("sessionCreateError");
    var actionDialog = document.getElementById("sessionActionDialog");
    var actionTitle = document.getElementById("sessionActionDialogTitle");
    var actionText = document.getElementById("sessionActionText");
    var actionError = document.getElementById("sessionActionError");
    var compactButton = document.getElementById("sessionCompactButton");
    var closeButton = document.getElementById("sessionCloseButton");
    var sessions = [];
    var gatewayStatus = {
      enabled: false,
      online: false,
      gateway_session: DEFAULT_GATEWAY_SESSION
    };
    var actionSession = "";
    var bound = false;

    function selectedSession() {
      return typeof options.getSelectedSession === "function" ? options.getSelectedSession() : "";
    }

    function gatewaySessionId() {
      return gatewayStatus.gateway_session || DEFAULT_GATEWAY_SESSION;
    }

    function isGatewaySession(sessionId) {
      return sessionId === gatewaySessionId();
    }

    function setConnectionState(online, label) {
      connectionDot.classList.toggle("online", online);
      connectionLabel.textContent = label;
    }

    function findSession(sessionId) {
      return sessions.find(function (item) {
        return item.tmux_session === sessionId;
      });
    }

    function sessionStatus(session) {
      if (session.virtual) {
        return session.status === "online" ? "记忆与工具在线" : "Volo 载体未连接";
      }
      if (options.chat.isTyping(session.tmux_session)) return "思考中";
      if (session.status === "online") return "在线";
      if (session.status === "shell_only") return "Claude 已退出";
      return "已停止";
    }

    function render() {
      if (!sessions.length) {
        var empty = document.createElement("p");
        empty.className = "volo-session-empty";
        empty.textContent = window.CCC.isConfigured() ? "还没有窗口" : "连接服务器后显示窗口";
        sessionList.replaceChildren(empty);
        return;
      }
      var current = selectedSession();
      var fragment = document.createDocumentFragment();
      sessions.forEach(function (session) {
        var sessionId = session.tmux_session;
        var row = document.createElement("div");
        row.className = "volo-session-row";
        if (session.virtual) row.classList.add("volo-session-virtual");
        if (sessionId === current) row.classList.add("active");
        var button = document.createElement("button");
        button.type = "button";
        button.className = "volo-current-chat";
        button.dataset.session = sessionId;
        button.setAttribute("aria-current", sessionId === current ? "page" : "false");
        var flower = document.createElement("span");
        flower.className = "volo-current-chat-flower";
        flower.setAttribute("aria-hidden", "true");
        var copy = document.createElement("span");
        var title = document.createElement("strong");
        title.textContent = session.title || sessionId;
        var status = document.createElement("small");
        var unread = options.chat.unreadCount(sessionId);
        status.textContent = sessionStatus(session) + (unread ? " · " + unread + " 条未读" : "");
        copy.append(title, status);
        button.append(flower, copy);
        var menu = document.createElement("button");
        menu.type = "button";
        menu.className = "volo-session-menu";
        menu.dataset.sessionAction = sessionId;
        menu.setAttribute("aria-label", (session.title || sessionId) + " 窗口操作");
        menu.textContent = "•••";
        row.appendChild(button);
        if (!session.virtual) row.appendChild(menu);
        fragment.appendChild(row);
      });
      sessionList.replaceChildren(fragment);
    }

    async function load(preferred) {
      if (!window.CCC.isConfigured()) {
        setConnectionState(false, "未配置");
        render();
        return;
      }
      try {
        var payloads = await Promise.all([
          window.CCC.sessions(),
          window.CCC.voloStatus().catch(function (error) {
            return { enabled: false, online: false, reason: error.message };
          })
        ]);
        var payload = payloads[0];
        gatewayStatus = payloads[1] || gatewayStatus;
        sessions = (payload.sessions || []).filter(function (session) {
          return !session.archived && (session.tmux_session === "volo" || session.managed);
        });
        if (gatewayStatus.enabled) {
          sessions.unshift({
            tmux_session: gatewaySessionId(),
            title: "Volo · 陪我聊聊",
            status: gatewayStatus.online ? "online" : "stopped",
            virtual: true
          });
        }
        var tmuxCount = sessions.filter(function (session) { return !session.virtual; }).length;
        setConnectionState(
          true,
          tmuxCount + " 个窗口" + (gatewayStatus.online ? " · 记忆在线" : "")
        );
        var current = selectedSession();
        var wanted = preferred || current;
        if (!findSession(wanted)) {
          wanted = findSession("volo") ? "volo" : (sessions.length ? sessions[0].tmux_session : "");
        }
        render();
        if (wanted && wanted !== current && typeof options.onSelect === "function") {
          await options.onSelect(wanted);
        } else if (wanted && typeof options.onRestore === "function") {
          await options.onRestore(wanted);
        }
      } catch (error) {
        setConnectionState(false, error.message);
        render();
      }
    }

    function openCreateDialog() {
      if (!window.CCC.isConfigured()) {
        window.CCC.openConnectionDialog();
        return;
      }
      createTitle.value = "";
      createName.value = "";
      createProject.value = localStorage.getItem(PROJECT_KEY) || "";
      createError.hidden = true;
      createDialog.showModal();
      createTitle.focus();
    }

    function openActionDialog(sessionId) {
      var session = findSession(sessionId);
      if (!session) return;
      actionSession = sessionId;
      actionTitle.textContent = session.title || sessionId;
      actionText.textContent = session.status === "online"
        ? "该窗口正在运行。停止 tmux 不会删除聊天历史。"
        : "该窗口当前为 " + sessionStatus(session) + "，可以重新启动 Claude。";
      actionError.hidden = true;
      compactButton.disabled = session.status !== "online";
      closeButton.textContent = session.status === "online" ? "停止窗口" : "启动窗口";
      actionDialog.showModal();
    }

    function bind() {
      if (bound) return;
      bound = true;
      newChatButton.addEventListener("click", openCreateDialog);
      topNewChatButton.addEventListener("click", openCreateDialog);
      sessionList.addEventListener("click", function (event) {
        var action = event.target.closest("[data-session-action]");
        if (action) {
          openActionDialog(action.dataset.sessionAction);
          return;
        }
        var button = event.target.closest("[data-session]");
        if (button && typeof options.onSelect === "function") options.onSelect(button.dataset.session);
      });
      createForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        createError.hidden = true;
        var submit = createForm.querySelector('[type="submit"]');
        submit.disabled = true;
        try {
          localStorage.setItem(PROJECT_KEY, createProject.value.trim());
          var payload = await window.CCC.createSession(
            createTitle.value.trim(),
            createName.value.trim(),
            createProject.value.trim()
          );
          createDialog.close();
          await load(payload.session && payload.session.tmux_session);
        } catch (error) {
          createError.textContent = error.message;
          createError.hidden = false;
        } finally {
          submit.disabled = false;
        }
      });
      compactButton.addEventListener("click", async function () {
        actionError.hidden = true;
        try {
          await window.CCC.sendTerminalText(
            actionSession,
            "/compact 只保留当前目标、关键决策、已修改文件、未完成事项、下一步和测试命令",
            true
          );
          actionDialog.close();
        } catch (error) {
          actionError.textContent = error.message;
          actionError.hidden = false;
        }
      });
      closeButton.addEventListener("click", async function () {
        var session = findSession(actionSession);
        actionError.hidden = true;
        try {
          if (session && session.status === "online") {
            if (!window.confirm("停止 " + (session.title || actionSession) + "？聊天历史会保留。")) return;
            await window.CCC.closeSession(actionSession);
          } else {
            await window.CCC.startSession(actionSession);
          }
          actionDialog.close();
          await load();
        } catch (error) {
          actionError.textContent = error.message;
          actionError.hidden = false;
        }
      });
      document.addEventListener("ccc:session-selected", function (event) {
        var next = event.detail && event.detail.session;
        if (next && next !== selectedSession() && findSession(next) && typeof options.onSelect === "function") {
          options.onSelect(next);
        }
      });
      document.addEventListener("ccc:config-changed", function () { load(); });
    }

    return {
      bind: bind,
      count: function () { return sessions.length; },
      isGatewaySession: isGatewaySession,
      load: load,
      render: render,
      setConnectionState: setConnectionState
    };
  }

  window.VoloSessions = { create: create };
})();
