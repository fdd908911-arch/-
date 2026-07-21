(function () {
  "use strict";

  function create(options) {
    options = options || {};
    var messageScroll = document.getElementById("voloMessageScroll");
    var messageList = document.getElementById("voloMessageList");
    var emptyState = document.getElementById("voloEmpty");
    var messagesBySession = Object.create(null);
    var cursorBySession = Object.create(null);
    var typingBySession = Object.create(null);
    var unreadBySession = Object.create(null);
    var pollTimer = 0;
    var requestGeneration = 0;
    var sending = false;
    var bound = false;

    function selectedSession() {
      return typeof options.getSelectedSession === "function" ? options.getSelectedSession() : "";
    }

    function emitClawd(state, phrase, detail) {
      if (typeof options.emitClawd === "function") {
        options.emitClawd(state, phrase, detail);
      }
    }

    function renderSessions() {
      if (typeof options.renderSessions === "function") options.renderSessions();
    }

    function setConnectionState(online, label) {
      if (typeof options.setConnectionState === "function") {
        options.setConnectionState(online, label);
      }
    }

    function notifySending() {
      if (typeof options.onSendingChange === "function") options.onSendingChange(sending);
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

    function messageKey(message) {
      return [message.ts || "", message.role || "", message.text || ""].join("|");
    }

    function mergeMessages(current, incoming) {
      var map = Object.create(null);
      (current || []).concat(incoming || []).forEach(function (message) {
        if (message && (message.role === "user" || message.role === "assistant")) {
          map[messageKey(message)] = message;
        }
      });
      return Object.keys(map)
        .map(function (key) { return map[key]; })
        .sort(function (left, right) {
          return String(left.ts || "").localeCompare(String(right.ts || ""));
        });
    }

    function createUserMessage(message) {
      var row = document.createElement("article");
      row.className = "volo-message volo-message-user";
      var bubble = document.createElement("div");
      bubble.className = "volo-user-bubble";
      var text = document.createElement("p");
      text.textContent = message.text;
      bubble.appendChild(text);
      var time = document.createElement("time");
      time.className = "volo-message-time";
      time.textContent = formatTime(message.ts);
      bubble.appendChild(time);
      row.appendChild(bubble);
      return row;
    }

    function createAssistantMessage(message) {
      var row = document.createElement("article");
      row.className = "volo-message volo-message-assistant";
      var body = document.createElement("div");
      body.className = "volo-assistant-body";
      var content = options.music.contentForMessage(message);
      if (content.text) {
        var text = document.createElement("p");
        text.textContent = content.text;
        body.appendChild(text);
      }
      if (content.music) body.appendChild(options.music.createCard(content.music));
      var footer = document.createElement("footer");
      footer.className = "volo-assistant-footer";
      var mark = document.createElement("button");
      mark.className = "volo-assistant-mark volo-flower-button";
      mark.type = "button";
      mark.setAttribute("aria-label", "让 Volo 的小花动起来");
      var note = document.createElement("span");
      var metadata = message.metadata || {};
      var carrierLabel = metadata.carrier === "gateway" ? "陪我聊聊" : "Claude Code";
      var toolCount = Array.isArray(metadata.tools) ? metadata.tools.length : 0;
      note.textContent = carrierLabel + " · " + formatTime(message.ts) +
        (toolCount ? " · " + toolCount + " 个工具" : "");
      footer.append(mark, note);
      row.append(body, footer);
      return row;
    }

    function createTypingMessage() {
      var row = document.createElement("article");
      row.className = "volo-message volo-message-assistant";
      row.setAttribute("aria-label", "正在回复");
      var typing = document.createElement("div");
      typing.className = "volo-typing";
      for (var index = 0; index < 3; index += 1) {
        typing.appendChild(document.createElement("span"));
      }
      row.appendChild(typing);
      return row;
    }

    function isNearBottom() {
      return messageScroll.scrollHeight - messageScroll.clientHeight - messageScroll.scrollTop < 96;
    }

    function render(shouldScroll) {
      var sessionId = selectedSession();
      var messages = messagesBySession[sessionId] || [];
      var fragment = document.createDocumentFragment();
      fragment.appendChild(emptyState);
      messages.forEach(function (message) {
        fragment.appendChild(
          message.role === "user" ? createUserMessage(message) : createAssistantMessage(message)
        );
      });
      if (typingBySession[sessionId]) fragment.appendChild(createTypingMessage());
      messageList.classList.toggle(
        "has-messages",
        messages.length > 0 || Boolean(typingBySession[sessionId])
      );
      messageList.replaceChildren(fragment);
      if (shouldScroll) {
        requestAnimationFrame(function () {
          messageScroll.scrollTop = messageScroll.scrollHeight;
        });
      }
    }

    async function loadHistory(sessionId) {
      var generation = ++requestGeneration;
      try {
        var payload = await window.CCC.history(sessionId, 300);
        if (generation !== requestGeneration || selectedSession() !== sessionId) return;
        messagesBySession[sessionId] = mergeMessages([], payload.records || []);
        cursorBySession[sessionId] = messagesBySession[sessionId].length
          ? messagesBySession[sessionId][messagesBySession[sessionId].length - 1].ts
          : null;
        unreadBySession[sessionId] = 0;
        render(true);
        renderSessions();
        schedulePoll(250);
      } catch (error) {
        emitClawd("disconnected", "连接失败", { duration: 1800, priority: 4 });
        setConnectionState(false, error.message);
      }
    }

    async function pollSelected() {
      var sessionId = selectedSession();
      if (!sessionId || document.hidden) {
        schedulePoll(1800);
        return;
      }
      var generation = requestGeneration;
      try {
        var payload = await window.CCC.poll(sessionId, cursorBySession[sessionId], 100);
        if (generation !== requestGeneration || selectedSession() !== sessionId) return;
        var incoming = (payload.chat && payload.chat.new_records) || [];
        var previousLength = (messagesBySession[sessionId] || []).length;
        var wasTyping = Boolean(typingBySession[sessionId]);
        messagesBySession[sessionId] = mergeMessages(messagesBySession[sessionId], incoming);
        cursorBySession[sessionId] =
          (payload.chat && payload.chat.last_ts) || cursorBySession[sessionId] || null;
        var isTyping = Boolean(payload.status && payload.status.is_typing);
        typingBySession[sessionId] = isTyping;
        var hasNew = messagesBySession[sessionId].length > previousLength;
        if (hasNew || wasTyping !== isTyping) {
          render(isNearBottom());
          renderSessions();
        }
        if (hasNew && incoming.some(function (message) { return message.role === "assistant"; })) {
          emitClawd("notification", "Volo 回信啦", {
            duration: 1400,
            priority: 4,
            next: { name: "happy", duration: 900, priority: 3 }
          });
        }
        var count = typeof options.getSessionCount === "function" ? options.getSessionCount() : 0;
        setConnectionState(true, count + " 个窗口");
      } catch (error) {
        setConnectionState(false, error.message);
      } finally {
        schedulePoll(1800);
      }
    }

    function schedulePoll(delay) {
      window.clearTimeout(pollTimer);
      pollTimer = window.setTimeout(pollSelected, delay);
    }

    async function selectSession(sessionId) {
      requestGeneration += 1;
      unreadBySession[sessionId] = 0;
      if (messagesBySession[sessionId]) {
        render(true);
        schedulePoll(100);
      } else {
        render(false);
        await loadHistory(sessionId);
      }
    }

    async function send(sessionId, carrier, value) {
      if (!sessionId || !value || sending) return false;
      sending = true;
      notifySending();
      var optimistic = {
        ts: new Date().toISOString(),
        role: "user",
        text: value,
        client_local: true
      };
      messagesBySession[sessionId] = mergeMessages(messagesBySession[sessionId], [optimistic]);
      typingBySession[sessionId] = true;
      render(true);
      renderSessions();

      try {
        var payload = await window.CCC.sendVolo(
          carrier,
          carrier === "gateway" ? "" : sessionId,
          value,
          null
        );
        messagesBySession[sessionId] = (messagesBySession[sessionId] || []).filter(function (message) {
          return !message.client_local;
        });
        var incoming = [payload.record, payload.assistant_record].filter(Boolean);
        messagesBySession[sessionId] = mergeMessages(messagesBySession[sessionId], incoming);
        if (incoming.length) {
          cursorBySession[sessionId] = incoming[incoming.length - 1].ts || cursorBySession[sessionId];
        }
        typingBySession[sessionId] = carrier !== "gateway";
        if (selectedSession() === sessionId) render(true);
        renderSessions();
        if (carrier === "gateway" && typeof options.onGatewayReply === "function") {
          options.onGatewayReply(payload);
        }
        schedulePoll(300);
        return true;
      } catch (error) {
        messagesBySession[sessionId] = (messagesBySession[sessionId] || []).filter(function (message) {
          return !message.client_local;
        });
        typingBySession[sessionId] = false;
        if (selectedSession() === sessionId) render(false);
        renderSessions();
        setConnectionState(false, error.message);
        emitClawd("disconnected", "发送失败", { duration: 1800, priority: 4 });
        return false;
      } finally {
        sending = false;
        notifySending();
      }
    }

    function bind() {
      if (bound) return;
      bound = true;
      messageList.addEventListener("click", function (event) {
        var flower = event.target.closest(".volo-flower-button");
        if (!flower) return;
        flower.classList.remove("is-blooming");
        void flower.offsetWidth;
        flower.classList.add("is-blooming");
        emitClawd("happy", "Volo 的小花开啦", { duration: 1000, priority: 2 });
      });
      document.addEventListener("visibilitychange", function () {
        if (!document.hidden) schedulePoll(100);
      });
      window.addEventListener("pagehide", function () {
        window.clearTimeout(pollTimer);
      });
    }

    return {
      bind: bind,
      isSending: function () { return sending; },
      isTyping: function (sessionId) { return Boolean(typingBySession[sessionId]); },
      loadHistory: loadHistory,
      mergeMessages: mergeMessages,
      render: render,
      schedulePoll: schedulePoll,
      selectSession: selectSession,
      send: send,
      unreadCount: function (sessionId) { return unreadBySession[sessionId] || 0; }
    };
  }

  window.VoloChat = { create: create };
})();
