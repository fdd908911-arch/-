(function initializeRealGroupChat() {
  "use strict";

  var ALLOWED_AGENTS = ["codex", "opencode"];
  var messageList = document.getElementById("messageList");
  var messageScroll = document.getElementById("messageScroll");
  var composer = document.getElementById("composer");
  var input = document.getElementById("messageInput");
  var sendButton = document.getElementById("sendButton");
  var headerName = document.getElementById("headerName");
  var headerStatus = document.getElementById("headerStatus");
  var headerAvatar = document.getElementById("headerAvatar");
  var records = [];
  var roster = Object.create(null);
  var agentStatus = Object.create(null);
  var cursor = "";
  var pollTimer = 0;
  var loading = false;
  var sending = false;
  var lastSignature = "";

  if (!messageList || !composer || !window.CCC) return;

  function groupVisible() {
  messageList.dataset.realGroup = "true";
    return document.body.dataset.chatView === "group" && !document.hidden;
  }

  function recordKey(record) {
    return record.id || [record.ts, record.sender_id, record.text].join("|");
  }

  function mergeRecords(incoming) {
    var byKey = Object.create(null);
    records.concat(incoming || []).forEach(function (record) {
      if (record && (record.sender_id === "amian" || ALLOWED_AGENTS.includes(record.sender_id))) {
        byKey[recordKey(record)] = record;
      }
    });
    records = Object.keys(byKey)
      .map(function (key) { return byKey[key]; })
      .sort(function (left, right) { return String(left.ts || "").localeCompare(String(right.ts || "")); });
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

  function displayName(senderId) {
    return (roster[senderId] && roster[senderId].display_name) || senderId;
  }

  function messageElement(record) {
    var outgoing = record.sender_id === "amian";
    var row = document.createElement("div");
    row.className = "message-row " + (outgoing ? "outgoing" : "incoming");
    row.dataset.messageId = recordKey(record);
    var bubble = document.createElement("div");
    bubble.className = "message-bubble";
    if (!outgoing) {
      var sender = document.createElement("strong");
      sender.className = "group-message-sender group-sender-" + record.sender_id;
      sender.textContent = displayName(record.sender_id);
      bubble.appendChild(sender);
    }
    var body = document.createElement("p");
    body.textContent = record.text || "";
    bubble.appendChild(body);
    var meta = document.createElement("span");
    meta.className = "message-meta";
    var time = document.createElement("time");
    time.textContent = formatTime(record.ts);
    meta.appendChild(time);
    if (outgoing) {
      var checks = document.createElement("span");
      checks.className = "message-checks";
      checks.textContent = "✓✓";
      meta.appendChild(checks);
    }
    bubble.appendChild(meta);
    row.appendChild(bubble);
    return row;
  }

  function typingElement(agentId) {
    var row = document.createElement("div");
    row.className = "typing-row group-agent-typing";
    var bubble = document.createElement("div");
    bubble.className = "typing-bubble";
    var label = document.createElement("strong");
    label.textContent = displayName(agentId);
    bubble.appendChild(label);
    for (var index = 0; index < 3; index += 1) bubble.appendChild(document.createElement("span"));
    row.appendChild(bubble);
    return row;
  }

  function render(forceScroll) {
    var typingIds = ALLOWED_AGENTS.filter(function (agentId) {
      return agentStatus[agentId] && agentStatus[agentId].is_typing;
    });
    var signature = records.map(recordKey).join(",") + "|" + typingIds.join(",");
    if (signature === lastSignature) return;
    var nearBottom = messageScroll.scrollHeight - messageScroll.scrollTop - messageScroll.clientHeight < 140;
    var fragment = document.createDocumentFragment();
    records.forEach(function (record) { fragment.appendChild(messageElement(record)); });
    typingIds.forEach(function (agentId) { fragment.appendChild(typingElement(agentId)); });
    messageList.replaceChildren(fragment);
    lastSignature = signature;
    if (forceScroll || nearBottom) {
      requestAnimationFrame(function () { messageScroll.scrollTop = messageScroll.scrollHeight; });
    }
  }

  function updateHeader() {
    var online = ALLOWED_AGENTS.filter(function (agentId) {
      return agentStatus[agentId] && agentStatus[agentId].state === "online";
    }).length;
    headerName.textContent = "Codex + OpenCode";
    headerStatus.textContent = "2 位 AI 成员，" + online + " 位在线";
    headerAvatar.textContent = "AI";
  }

  function schedule(delay) {
    window.clearTimeout(pollTimer);
    pollTimer = window.setTimeout(poll, delay);
  }

  async function load() {
    if (loading || !window.CCC.isConfigured()) {
      if (!window.CCC.isConfigured()) headerStatus.textContent = "请先在 Volo 配置服务器连接";
      return;
    }
    loading = true;
    try {
      var payloads = await Promise.all([window.CCC.groupRoster(), window.CCC.groupHistory(300)]);
      (payloads[0].roster || []).forEach(function (member) { roster[member.id] = member; });
      agentStatus = (payloads[0].status && payloads[0].status.agents) || Object.create(null);
      records = [];
      mergeRecords(payloads[1].records || []);
      cursor = records.length ? records[records.length - 1].ts || "" : "";
      lastSignature = "";
      updateHeader();
      render(true);
      schedule(300);
    } catch (error) {
      headerStatus.textContent = error.message;
    } finally {
      loading = false;
    }
  }

  async function poll() {
    if (!groupVisible() || !window.CCC.isConfigured()) {
      schedule(4000);
      return;
    }
    try {
      var payload = await window.CCC.groupPoll(cursor, 100);
      mergeRecords(payload.records || []);
      cursor = payload.last_ts || cursor;
      agentStatus = (payload.status && payload.status.agents) || agentStatus;
      updateHeader();
      render(false);
    } catch (error) {
      headerStatus.textContent = error.message;
    } finally {
      schedule(1500);
    }
  }

  async function send() {
    var text = input.value.trim();
    if (!text || sending) return;
    sending = true;
    sendButton.disabled = true;
    try {
      var payload = await window.CCC.sendGroup(text);
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      if (payload.record) {
        mergeRecords([payload.record]);
        cursor = payload.record.ts || cursor;
        render(true);
      }
      schedule(250);
    } catch (error) {
      headerStatus.textContent = error.message;
    } finally {
      sending = false;
      sendButton.disabled = input.value.trim().length === 0;
    }
  }

  composer.addEventListener("submit", function (event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    send();
  }, true);

  window.addEventListener("hashchange", function () {
    if (window.location.hash === "#group") load();
  });
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && groupVisible()) schedule(100);
  });
  document.addEventListener("ccc:config-changed", function () {
    if (groupVisible()) load();
  });

  if (window.location.hash === "#group") load();
})();
