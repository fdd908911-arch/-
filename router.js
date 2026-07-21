(function () {
  "use strict";

  var API_ROOT = window.location.origin + "/hui-router";
  var switcher = document.getElementById("providerSwitch");
  var hint = document.getElementById("providerHint");
  var hintText = hint.querySelector("span:last-child");
  var timeline = document.getElementById("timeline");
  var emptyState = document.getElementById("emptyState");
  var composer = document.getElementById("composer");
  var input = document.getElementById("message");
  var send = document.getElementById("send");
  var providerMenuButton = document.getElementById("providerMenuButton");
  var providerPopover = document.getElementById("providerPopover");
  var activeProviderLabel = document.getElementById("activeProviderLabel");
  var status = null;
  var switching = false;
  var sending = false;
  var lastMessageId = 0;
  var rendered = Object.create(null);
  var drafts = Object.create(null);
  var refreshTimer = 0;

  function connectionConfig() {
    try {
      return window.CCC && window.CCC.getConfig ? window.CCC.getConfig() : {};
    } catch (error) {
      return {};
    }
  }

  async function api(path, options) {
    options = options || {};
    var config = connectionConfig();
    var headers = Object.assign({ Accept: "application/json" }, options.headers || {});
    if (config.token) headers["X-Auth-Token"] = config.token;
    var response = await fetch(API_ROOT + path, {
      method: options.method || "GET",
      headers: headers,
      body: options.body,
      cache: "no-store",
      credentials: "same-origin"
    });
    var body = {};
    try {
      body = await response.json();
    } catch (error) {}
    if (!response.ok) throw new Error(body.detail || body.error || ("HTTP " + response.status));
    return body;
  }

  function providerLabel(provider) {
    if (provider === "codex") return "Codex";
    if (provider === "claude") return "Claude Code";
    return "双核";
  }

  function setHint(text, kind) {
    hint.classList.toggle("is-transition", kind === "transition");
    hint.classList.toggle("is-error", kind === "error");
    hintText.textContent = text;
  }

  function setProviderMenu(open) {
    providerPopover.hidden = !open;
    providerMenuButton.setAttribute("aria-expanded", String(open));
  }

  function updateSendState() {
    send.disabled = switching || sending || !input.value.trim();
  }

  function renderBrain(data) {
    status = data;
    switching = Boolean(data.transition);

    Array.prototype.forEach.call(switcher.querySelectorAll("button[data-provider]"), function (button) {
      var name = button.dataset.provider;
      var provider = data.providers && data.providers[name] || {};
      var active = name === data.target;
      var health = button.querySelector(".router-provider-health");
      button.classList.toggle("active", active);
      button.setAttribute("aria-checked", String(active));
      button.disabled = switching || provider.available === false;
      button.title = provider.error || (provider.dormant ? "点击后现场启动" : "");

      if (health) {
        if (provider.available === false) {
          health.textContent = "当前不可用";
        } else if (active) {
          health.textContent = "当前响应核心";
        } else if (provider.dormant) {
          health.textContent = "点击后启动";
        } else {
          health.textContent = "可随时切换";
        }
      }
    });

    input.disabled = switching;
    providerMenuButton.disabled = switching;
    activeProviderLabel.textContent = providerLabel(data.target);
    updateSendState();

    window.clearTimeout(refreshTimer);
    if (data.transition) {
      setHint("正在切换至 " + providerLabel(data.transition.target) + " · " + data.transition.stage, "transition");
      refreshTimer = window.setTimeout(loadBrain, 1100);
    } else {
      setHint(providerLabel(data.target) + " · 在线", "ready");
    }
  }

  async function loadBrain() {
    try {
      renderBrain(await api("/app/brain"));
    } catch (error) {
      setHint("路由暂时不可用 · " + error.message, "error");
      switching = true;
      input.disabled = true;
      providerMenuButton.disabled = true;
      updateSendState();
    }
  }

  function formatTime(value) {
    var date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) date = new Date();
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(date);
  }

  function nearBottom() {
    return timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight < 140;
  }

  function scrollToBottom(force) {
    if (force || nearBottom()) timeline.scrollTop = timeline.scrollHeight;
  }

  function createMessage(message, draft) {
    var assistant = message.direction !== "in";
    var row = document.createElement("article");
    row.className = "router-message " + (assistant ? "router-message-assistant" : "router-message-user");
    if (draft) row.classList.add("draft");

    var body = document.createElement("div");
    body.className = "router-message-body";
    body.title = [
      providerLabel(message.provider),
      message.epoch !== undefined ? "epoch " + message.epoch : "",
      message.id ? "#" + message.id : ""
    ].filter(Boolean).join(" · ");

    if (assistant) {
      var author = document.createElement("div");
      author.className = "router-message-author";
      author.textContent = providerLabel(message.provider || (status && status.target));
      body.appendChild(author);
    }

    var text = document.createElement("p");
    text.textContent = message.text || "";
    body.appendChild(text);

    if (draft) {
      var dots = document.createElement("span");
      dots.className = "router-typing-dots";
      dots.setAttribute("aria-label", "正在输入");
      dots.innerHTML = "<i></i><i></i><i></i>";
      body.appendChild(dots);
    }

    var footer = document.createElement("footer");
    var time = document.createElement("span");
    time.textContent = formatTime(message.created_at);
    footer.appendChild(time);

    if (!assistant) {
      var check = document.createElement("span");
      check.className = "router-delivery-check";
      check.textContent = "✓✓";
      check.setAttribute("aria-label", "已送达");
      footer.appendChild(check);
    }

    body.appendChild(footer);
    row.appendChild(body);
    return row;
  }

  function appendMessage(message) {
    if (!message) return;
    var messageKey = String(message.id);
    if (rendered[messageKey]) return;
    var stick = nearBottom();

    rendered[messageKey] = true;
    lastMessageId = Math.max(lastMessageId, Number(message.id) || 0);

    if (message.direction === "out" && message.reply_to !== undefined && message.reply_to !== null) {
      var replyKey = String(message.reply_to);
      if (drafts[replyKey]) {
        drafts[replyKey].remove();
        delete drafts[replyKey];
      }
    }

    if (emptyState.isConnected) emptyState.remove();
    timeline.appendChild(createMessage(message, false));
    scrollToBottom(stick);
  }

  async function loadMessages() {
    try {
      var payload = await api("/messages?since=" + lastMessageId + "&limit=300");
      (payload.messages || []).forEach(appendMessage);
    } catch (error) {
      setHint("消息加载失败 · " + error.message, "error");
    }
  }

  function applyStream(event) {
    var payload = event.payload || {};
    var messageId = payload.message_id !== undefined && payload.message_id !== null
      ? String(payload.message_id)
      : "";

    if (event.type === "thinking_delta") {
      setHint(providerLabel(status && status.target) + " · 正在思考…", "transition");
      return;
    }

    if (event.type === "tool_event") {
      setHint(providerLabel(status && status.target) + " · 正在使用工具…", "transition");
      return;
    }

    if (event.type === "error") {
      setHint(payload.error || "本轮处理失败", "error");
      return;
    }

    if (!messageId) return;

    if (event.type === "reply_delta") {
      var row = drafts[messageId];
      if (!row) {
        if (emptyState.isConnected) emptyState.remove();
        row = createMessage({
          id: "draft-" + messageId,
          direction: "out",
          provider: event.source || event.provider || (status && status.target),
          epoch: event.epoch || (status && status.epoch),
          created_at: new Date().toISOString(),
          text: ""
        }, true);
        drafts[messageId] = row;
        timeline.appendChild(row);
      }
      row.querySelector("p").textContent += payload.delta || "";
      setHint(providerLabel(status && status.target) + " · 正在输入…", "transition");
      scrollToBottom(true);
      return;
    }

    if (event.type === "stream_done") {
      var draft = drafts[messageId];
      if (draft) {
        draft.classList.remove("draft");
        var dots = draft.querySelector(".router-typing-dots");
        if (dots) dots.remove();
      }
      setHint(providerLabel(status && status.target) + " · 在线", "ready");
      window.setTimeout(loadMessages, 220);
    }
  }

  function handleRouterEvent(type, event) {
    if (type === "message" && event.type === "message") appendMessage(event.payload);
    if (["reply_delta", "thinking_delta", "tool_event", "stream_done", "error"].indexOf(type) !== -1) {
      applyStream(event);
    }
    if (type === "provider_changed" || type === "transition_failed") loadBrain();
  }

  async function connectEvents() {
    var cursor = "";
    while (true) {
      try {
        var config = connectionConfig();
        var headers = { Accept: "text/event-stream" };
        if (config.token) headers["X-Auth-Token"] = config.token;
        if (cursor) headers["Last-Event-ID"] = cursor;
        var response = await fetch(API_ROOT + "/events", {
          headers: headers,
          cache: "no-store",
          credentials: "same-origin"
        });
        if (!response.ok || !response.body) throw new Error("SSE HTTP " + response.status);

        if (!switching && status) setHint(providerLabel(status.target) + " · 在线", "ready");

        var reader = response.body.getReader();
        var decoder = new TextDecoder();
        var buffer = "";
        var eventType = "message";
        var dataLines = [];

        while (true) {
          var chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, "\n");
          var lines = buffer.split("\n");
          buffer = lines.pop() || "";

          lines.forEach(function (line) {
            if (!line) {
              if (dataLines.length) {
                try {
                  handleRouterEvent(eventType, JSON.parse(dataLines.join("\n")));
                } catch (error) {}
              }
              eventType = "message";
              dataLines = [];
            } else if (line.indexOf("id:") === 0) {
              cursor = line.slice(3).trim();
            } else if (line.indexOf("event:") === 0) {
              eventType = line.slice(6).trim() || "message";
            } else if (line.indexOf("data:") === 0) {
              dataLines.push(line.slice(5).trimStart());
            }
          });
        }
      } catch (error) {
        setHint("连接暂时中断 · 正在自动重连…", "transition");
        await Promise.all([loadMessages(), loadBrain()]);
        await new Promise(function (resolve) {
          window.setTimeout(resolve, 1500);
        });
      }
    }
  }

  async function switchBrain(target) {
    if (switching || target === (status && status.target)) {
      setProviderMenu(false);
      return;
    }

    setProviderMenu(false);
    switching = true;
    renderBrain(Object.assign({}, status || {}, {
      providers: status && status.providers || {},
      transition: { target: target, stage: "requested" }
    }));

    try {
      await api("/app/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: target })
      });
    } catch (error) {
      setHint("切换失败 · " + error.message, "error");
    } finally {
      await loadBrain();
    }
  }

  function resizeInput() {
    input.style.height = "0px";
    input.style.height = Math.min(input.scrollHeight, 150) + "px";
  }

  providerMenuButton.addEventListener("click", function () {
    if (!providerMenuButton.disabled) setProviderMenu(providerPopover.hidden);
  });

  switcher.addEventListener("click", function (event) {
    var button = event.target.closest("button[data-provider]");
    if (button && !button.disabled) switchBrain(button.dataset.provider);
  });

  document.addEventListener("click", function (event) {
    if (!event.target.closest(".router-provider-control")) setProviderMenu(false);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") setProviderMenu(false);
  });

  input.addEventListener("input", function () {
    resizeInput();
    updateSendState();
  });

  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (!send.disabled) composer.requestSubmit();
    }
  });

  composer.addEventListener("submit", async function (event) {
    event.preventDefault();
    var text = input.value.trim();
    if (!text || switching || sending) return;

    sending = true;
    updateSendState();
    var key = window.crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : (Date.now() + "-" + Math.random());

    try {
      var payload = await api("/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text,
          idempotency_key: "hui-" + key,
          meta: { source: "hui-v40" }
        })
      });
      appendMessage(payload.message);
      input.value = "";
      resizeInput();
    } catch (error) {
      setHint("发送失败 · " + error.message, "error");
    } finally {
      sending = false;
      updateSendState();
      input.focus();
    }
  });

  resizeInput();
  updateSendState();
  Promise.all([loadBrain(), loadMessages()]).then(connectEvents);
})();
