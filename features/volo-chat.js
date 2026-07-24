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
    var thinkingByTurn = Object.create(null);
    var thoughtOpenByKey = Object.create(null);
    var thinkingPrimed = false;
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

    function emitAssistantMessages(records, sessionId) {
      (records || []).forEach(function (message) {
        if (!message || message.role !== "assistant") return;
        document.dispatchEvent(
          new CustomEvent("volo:assistant-message", {
            detail: { message: message, sessionId: sessionId }
          })
        );
      });
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

    function indexThinkingRecords(records) {
      var changed = false;
      (records || []).forEach(function (record) {
        var turnId = String(record && record.turn_id || "").trim();
        var thinking = typeof (record && record.thinking) === "string"
          ? record.thinking.trim()
          : "";
        if (turnId && thinking && thinkingByTurn[turnId] !== thinking) {
          thinkingByTurn[turnId] = thinking;
          changed = true;
        }
      });
      return changed;
    }

    async function ensureThinkingIndex() {
      if (thinkingPrimed || typeof window.CCC.thinking !== "function") return;
      try {
        var payload = await window.CCC.thinking("", 500);
        indexThinkingRecords(payload.records || []);
        thinkingPrimed = true;
      } catch (error) {
        // Thinking cards are optional; chat history must remain usable if this endpoint is unavailable.
      }
    }

    function messageThought(message) {
      var metadata = message.metadata || {};
      var inline = message.thought || metadata.thought || metadata.thinking;
      if (typeof inline === "string" && inline.trim()) return inline.trim();
      var turnId = String(message.turn_id || "").trim();
      return turnId ? (thinkingByTurn[turnId] || "") : "";
    }

    function createThought(message) {
      var thinking = messageThought(message);
      if (!thinking) return null;
      var key = String(message.turn_id || messageKey(message));
      var thought = document.createElement("div");
      thought.className = "volo-thought";
      var toggle = document.createElement("button");
      toggle.className = "volo-thought-toggle";
      toggle.type = "button";
      toggle.dataset.thoughtKey = key;
      toggle.setAttribute("aria-expanded", String(Boolean(thoughtOpenByKey[key])));
      var sparkle = document.createElement("span");
      sparkle.className = "volo-thought-sparkle";
      sparkle.setAttribute("aria-hidden", "true");
      sparkle.textContent = "✦";
      var label = document.createElement("span");
      label.textContent = "Volo 在想";
      var arrow = document.createElement("span");
      arrow.className = "volo-thought-arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "⌄";
      toggle.append(sparkle, label, arrow);
      var panel = document.createElement("div");
      panel.className = "volo-thought-panel";
      panel.hidden = !thoughtOpenByKey[key];
      var text = document.createElement("p");
      text.textContent = thinking;
      panel.appendChild(text);
      thought.append(toggle, panel);
      return thought;
    }

    function refreshThinkingForMessages(messages, sessionId, generation, attempt) {
      if (typeof window.CCC.thinking !== "function") return;
      var turnIds = [];
      (messages || []).forEach(function (message) {
        var turnId = String(message && message.turn_id || "").trim();
        if (
          message && message.role === "assistant" && turnId &&
          !thinkingByTurn[turnId] && turnIds.indexOf(turnId) === -1
        ) {
          turnIds.push(turnId);
        }
      });
      if (!turnIds.length) return;
      Promise.all(turnIds.map(function (turnId) {
        return window.CCC.thinking(turnId, 10).catch(function () { return { records: [] }; });
      })).then(function (payloads) {
        if (generation !== requestGeneration || selectedSession() !== sessionId) return;
        var changed = false;
        payloads.forEach(function (payload) {
          if (indexThinkingRecords(payload.records || [])) changed = true;
        });
        if (changed) render(isNearBottom());
        var missing = turnIds.filter(function (turnId) { return !thinkingByTurn[turnId]; });
        if (missing.length && attempt < 2) {
          window.setTimeout(function () {
            refreshThinkingForMessages(messages, sessionId, generation, attempt + 1);
          }, attempt === 0 ? 1200 : 2600);
        }
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
      var note = document.createElement("span");
      var metadata = message.metadata || {};
      var carrierLabel = metadata.carrier === "gateway" ? "陪我聊聊" : "当前窗口";
      var toolCount = Array.isArray(metadata.tools) ? metadata.tools.length : 0;
      note.textContent = carrierLabel + " · " + formatTime(message.ts) +
        (toolCount ? " · " + toolCount + " 个工具" : "");
      footer.appendChild(note);
      var thought = createThought(message);
      if (thought) row.appendChild(thought);
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
        var results = await Promise.all([
          window.CCC.history(sessionId, 300),
          ensureThinkingIndex()
        ]);
        var payload = results[0];
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
        var existingKeys = Object.create(null);
        (messagesBySession[sessionId] || []).forEach(function (message) {
          existingKeys[messageKey(message)] = true;
        });
        var newAssistantMessages = incoming.filter(function (message) {
          return message && message.role === "assistant" && !existingKeys[messageKey(message)];
        });
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
        if (newAssistantMessages.length) {
          emitAssistantMessages(newAssistantMessages, sessionId);
          refreshThinkingForMessages(incoming, sessionId, generation, 0);
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
        emitAssistantMessages(incoming, sessionId);
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
        var toggle = event.target.closest(".volo-thought-toggle");
        if (!toggle) return;
        var key = toggle.dataset.thoughtKey || "";
        thoughtOpenByKey[key] = !thoughtOpenByKey[key];
        toggle.setAttribute("aria-expanded", String(thoughtOpenByKey[key]));
        var panel = toggle.nextElementSibling;
        if (panel) panel.hidden = !thoughtOpenByKey[key];
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
