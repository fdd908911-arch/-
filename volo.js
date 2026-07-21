(function () {
  "use strict";

  var DRAFT_KEY = "island-chat.ccc-drafts.v1";
  var PROJECT_KEY = "island-chat.ccc-last-project.v1";
  var composer = document.getElementById("voloComposer");
  var DEFAULT_GATEWAY_SESSION = "volo-gateway";
  var input = document.getElementById("voloInput");
  var sendButton = document.getElementById("voloSendButton");
  var voiceButton = document.getElementById("voloVoiceButton");
  var voiceStatus = document.getElementById("voloVoiceStatus");
  var messageScroll = document.getElementById("voloMessageScroll");
  var messageList = document.getElementById("voloMessageList");
  var emptyState = document.getElementById("voloEmpty");
  var drawer = document.getElementById("voloDrawer");
  var drawerButton = document.getElementById("voloDrawerButton");
  var drawerClose = document.getElementById("voloDrawerClose");
  var drawerScrim = document.getElementById("voloDrawerScrim");
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
  var carrierPill = document.getElementById("voloCarrierPill");
  var voloView = document.getElementById("voloView");
  var usageButton = document.getElementById("voloUsageButton");
  var usageSidebar = document.getElementById("voloUsageSidebar");
  var usageClose = document.getElementById("voloUsageClose");
  var usageRefresh = document.getElementById("voloUsageRefresh");
  var usageStatus = document.getElementById("voloUsageStatus");
  var usageRecent = document.getElementById("voloUsageRecent");
  var actionTitle = document.getElementById("sessionActionDialogTitle");
  var actionText = document.getElementById("sessionActionText");
  var actionError = document.getElementById("sessionActionError");
  var gatewayStatus = { enabled: false, online: false, gateway_session: DEFAULT_GATEWAY_SESSION };
  var compactButton = document.getElementById("sessionCompactButton");
  var closeButton = document.getElementById("sessionCloseButton");

  var sessions = [];
  var selectedSession = window.CCC.getSelectedSession();
  var actionSession = "";
  var messagesBySession = Object.create(null);
  var cursorBySession = Object.create(null);
  var typingBySession = Object.create(null);
  var unreadBySession = Object.create(null);
  var drafts = readDrafts();
  var pollTimer = 0;
  var requestGeneration = 0;
  var sending = false;
  var voiceRecorder = null;
  var voiceStream = null;
  var voiceChunks = [];
  var voiceBusy = false;
  var voiceReleaseRequested = false;
  var voiceCancelled = false;
  var voiceStatusTimer = 0;
  var usageOpen = window.matchMedia("(min-width: 761px)").matches;
  var usageLoading = false;
  if (!window.VoloMusic) throw new Error("VoloMusic must load before volo.js");
  var music = window.VoloMusic.create({
    sendMessage: function (text) { return sendMessage(text); },
    emitClawd: emitClawd,
    getSelectedSession: function () { return selectedSession; },
    isVoiceBusy: function () { return voiceBusy; },
    isSending: function () { return sending; }
  });

  function emitClawd(state, phrase, options) {
    document.dispatchEvent(
      new CustomEvent("clawd:action", {
        detail: Object.assign({ state: state, phrase: phrase || "" }, options || {})
      })
    );
  }

  function readDrafts() {
    try {
      return JSON.parse(localStorage.getItem(DRAFT_KEY)) || {};
    } catch (error) {
      return {};
    }
  }

  function writeDrafts() {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
  }

  function gatewaySessionId() {
    return gatewayStatus.gateway_session || DEFAULT_GATEWAY_SESSION;
  }

  function isGatewaySession(sessionId) {
    return sessionId === gatewaySessionId();
  }

  function currentCarrier() {
    return isGatewaySession(selectedSession) ? "gateway" : "claude_code";
  }

  function updateCarrierPresentation() {
    if (!carrierPill) return;
    var gateway = currentCarrier() === "gateway";
    carrierPill.textContent = gateway ? "Volo · 陪我聊聊" : "Volo · Claude Code";
    carrierPill.classList.toggle("is-gateway", gateway);
    input.placeholder = gateway ? "和 Volo 聊聊..." : "Reply to Volo...";
    if (gateway) {
      setUsageOpen(usageOpen);
      loadUsage();
    } else {
      voloView.classList.remove("is-usage-open");
      usageButton.hidden = true;
      usageSidebar.hidden = true;
      usageSidebar.setAttribute("aria-hidden", "true");
      usageButton.setAttribute("aria-expanded", "false");
    }
  }


  function usageNode(id) {
    return document.getElementById(id);
  }

  function setUsageText(id, value) {
    var node = usageNode(id);
    if (node) node.textContent = value;
  }

  function usageNumber(value) {
    var number = Number(value || 0);
    return Number.isFinite(number) ? number : 0;
  }

  function formatUsageNumber(value) {
    return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(usageNumber(value));
  }

  function formatUsageRate(value) {
    return (Math.max(0, usageNumber(value)) * 100).toFixed(1) + "%";
  }

  function formatUsageCost(value) {
    return "$" + usageNumber(value).toFixed(6);
  }

  function usageDate(value) {
    var number = Number(value);
    var date = Number.isFinite(number) ? new Date(number * 1000) : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function setUsageOpen(open) {
    var gateway = currentCarrier() === "gateway";
    usageOpen = Boolean(open);
    voloView.classList.toggle("is-usage-open", gateway && usageOpen);
    usageButton.hidden = !gateway;
    usageSidebar.hidden = !gateway || !usageOpen;
    usageSidebar.setAttribute("aria-hidden", String(!gateway || !usageOpen));
    usageButton.setAttribute("aria-expanded", String(gateway && usageOpen));
    if (gateway && usageOpen) loadUsage();
  }

  function renderUsage(payload) {
    var total = payload && payload.total ? payload.total : {};
    var recent = payload && Array.isArray(payload.recent) ? payload.recent : [];
    var latest = recent[0] || {};
    var requests = usageNumber(total.requests);
    usageStatus.classList.remove("is-error");
    usageStatus.textContent = requests
      ? "已记录 " + formatUsageNumber(requests) + " 次 · 仅当前 Gateway 会话"
      : "等待第一条 Gateway 对话";

    var latestDate = usageDate(latest.created_at);
    setUsageText("voloUsageTime", latestDate ? latestDate.toLocaleString("zh-CN", { hour12: false }) : "—");
    setUsageText("voloUsageInput", recent.length ? formatUsageNumber(latest.input_tokens) : "—");
    setUsageText("voloUsageOutput", recent.length ? formatUsageNumber(latest.output_tokens) : "—");
    setUsageText("voloUsageCacheRead", recent.length ? formatUsageNumber(latest.cache_read_input_tokens) : "—");
    setUsageText("voloUsageHitRate", recent.length ? formatUsageRate(latest.cache_read_ratio) : "—");
    setUsageText("voloUsageWrite5m", recent.length ? formatUsageNumber(latest.cache_write_5m_tokens) + " tokens" : "—");
    setUsageText("voloUsageWrite1h", recent.length ? formatUsageNumber(latest.cache_write_1h_tokens) + " tokens" : "—");
    setUsageText("voloUsageCreation", recent.length ? formatUsageNumber(latest.cache_creation_input_tokens) + " tokens" : "—");
    setUsageText("voloUsageCost", recent.length ? formatUsageCost(latest.estimated_cost_usd) : "—");
    setUsageText("voloUsageModel", latest.model || "—");
    setUsageText("voloUsageFinish", latest.finish_reason || "—");
    setUsageText("voloUsageRequests", formatUsageNumber(requests) + " 次请求");
    setUsageText("voloUsageTotalIO", formatUsageNumber(total.input_tokens) + " / " + formatUsageNumber(total.output_tokens));
    setUsageText("voloUsageTotalRead", formatUsageNumber(total.cache_read_input_tokens) + " tokens");
    setUsageText("voloUsageTotalRate", formatUsageRate(total.cache_read_ratio));
    setUsageText("voloUsageTotalCost", formatUsageCost(total.estimated_cost_usd));

    usageRecent.replaceChildren();
    if (!recent.length) {
      var empty = document.createElement("p");
      empty.textContent = "暂无记录";
      usageRecent.appendChild(empty);
      return;
    }
    recent.forEach(function (request) {
      var row = document.createElement("article");
      row.className = "volo-usage-request";
      var time = document.createElement("time");
      var date = usageDate(request.created_at);
      time.textContent = date ? formatTime(date.toISOString()) : "—";
      var summary = document.createElement("span");
      summary.textContent = "入 " + formatUsageNumber(request.input_tokens) + " · 出 " + formatUsageNumber(request.output_tokens);
      var rate = document.createElement("strong");
      rate.textContent = formatUsageRate(request.cache_read_ratio);
      rate.title = "缓存读取 " + formatUsageNumber(request.cache_read_input_tokens) + " tokens";
      row.append(time, summary, rate);
      usageRecent.appendChild(row);
    });
  }

  async function loadUsage() {
    if (currentCarrier() !== "gateway" || usageLoading || !window.CCC.isConfigured()) return;
    usageLoading = true;
    usageStatus.classList.remove("is-error");
    usageStatus.textContent = "正在读取 Gateway 账本…";
    try {
      renderUsage(await window.CCC.voloUsage());
    } catch (error) {
      usageStatus.classList.add("is-error");
      usageStatus.textContent = "账本暂时不可用 · " + error.message;
    } finally {
      usageLoading = false;
    }
  }

  function formatTime(value) {
    var date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) {
      date = new Date();
    }
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
      .map(function (key) {
        return map[key];
      })
      .sort(function (left, right) {
        return String(left.ts || "").localeCompare(String(right.ts || ""));
      });
  }

  function resizeInput() {
    input.style.height = "auto";
    var height = Math.min(input.scrollHeight, 120);
    input.style.height = Math.max(height, 28) + "px";
    input.style.overflowY = input.scrollHeight > 120 ? "auto" : "hidden";
    sendButton.disabled = sending || !selectedSession || input.value.trim().length === 0;
  }

  function setVoiceStatus(message, state, hideAfter) {
    window.clearTimeout(voiceStatusTimer);
    voiceStatus.textContent = message || "";
    voiceStatus.hidden = !message;
    voiceStatus.className = "volo-voice-status" + (state ? " is-" + state : "");
    voiceButton.classList.toggle("is-recording", state === "recording");
    voiceButton.classList.toggle("is-processing", state === "processing");
    voiceButton.setAttribute("aria-pressed", String(state === "recording"));
    voiceButton.setAttribute("aria-label", state === "recording" ? "松开发送语音" : "按住说话");
    voiceButton.title = state === "recording" ? "松开发送" : "按住说话";
    if (hideAfter) {
      voiceStatusTimer = window.setTimeout(function () {
        voiceStatus.hidden = true;
      }, hideAfter);
    }
  }

  function stopVoiceTracks() {
    if (voiceStream) {
      voiceStream.getTracks().forEach(function (track) { track.stop(); });
    }
    voiceStream = null;
  }

  function preferredVoiceMimeType() {
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return "";
    return ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"].find(function (type) {
      return MediaRecorder.isTypeSupported(type);
    }) || "";
  }

  function voiceFilename(type) {
    if (type.indexOf("mp4") !== -1) return "voice.m4a";
    if (type.indexOf("ogg") !== -1) return "voice.ogg";
    return "voice.webm";
  }

  function formatVoiceMessage(payload) {
    var emotion = [payload.emotion, payload.tone].filter(Boolean).join(" · ");
    var lines = ["[语音输入]", "内容：" + payload.text];
    if (emotion) lines.push("情绪：" + emotion + (payload.confidence ? "（" + payload.confidence + "）" : ""));
    if (payload.hint) lines.push("语气提示：" + payload.hint);
    var relative = Object.keys(payload.relative || {}).map(function (key) {
      return key + payload.relative[key];
    });
    if (relative.length) lines.push("和平时比：" + relative.join("、"));
    if (payload.baseline_progress) {
      lines.push("声音基线：" + payload.baseline_progress +
        (payload.baseline_ready ? "（已建立）" : "（学习中）"));
    }
    return lines.join("\n");
  }

  async function uploadVoice(blob) {
    if (blob.size < 1000) {
      voiceBusy = false;
      setVoiceStatus("录音太短了，再按住说一次", "error", 3200);
      return;
    }
    var config = window.CCC.getConfig();
    var form = new FormData();
    form.append("file", blob, voiceFilename(blob.type || ""));
    setVoiceStatus("正在听懂你的语气…", "processing");
    voiceButton.disabled = true;
    try {
      var response = await fetch("/api/voice/upload?deliver=0", {
        method: "POST",
        headers: { "X-Auth-Token": config.token },
        body: form,
        cache: "no-store"
      });
      var payload = await response.json().catch(function () { return {}; });
      if (!response.ok || payload.error) {
        throw new Error(payload.error || "HTTP " + response.status);
      }
      setVoiceStatus("听懂了，正在送给 Volo…", "processing");
      var sent = await sendMessage(formatVoiceMessage(payload));
      setVoiceStatus(sent ? "已送给 Volo ♡" : "没有送出去，请重试", sent ? "" : "error", 3600);
    } catch (error) {
      var message = error && error.message ? error.message : "语音发送失败";
      if (message.indexOf("401") !== -1 || message.indexOf("Unauthorized") !== -1) {
        message = "访问 Token 不正确，请重新配置服务器";
      }
      setVoiceStatus(message, "error", 4200);
      emitClawd("disconnected", "语音没有送出去", { duration: 1800, priority: 4 });
    } finally {
      voiceBusy = false;
      voiceButton.disabled = false;
      voiceButton.classList.remove("is-processing");
    }
  }

  async function startVoiceRecording(event) {
    if (voiceBusy || music.isBusy() || sending) return;
    if (!window.CCC.isConfigured()) {
      setVoiceStatus("先配置服务器地址和访问 Token", "error", 3200);
      window.CCC.openConnectionDialog();
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      setVoiceStatus("当前浏览器不支持录音", "error", 3600);
      return;
    }
    voiceBusy = true;
    voiceReleaseRequested = false;
    voiceCancelled = false;
    voiceChunks = [];
    if (event && event.pointerId !== undefined && voiceButton.setPointerCapture) {
      try { voiceButton.setPointerCapture(event.pointerId); } catch (error) { void error; }
    }
    setVoiceStatus("正在打开麦克风…", "processing");
    try {
      voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (voiceReleaseRequested) {
        stopVoiceTracks();
        voiceBusy = false;
        setVoiceStatus("麦克风已允许，请再按住说话", "", 2800);
        return;
      }
      var mimeType = preferredVoiceMimeType();
      voiceRecorder = new MediaRecorder(voiceStream, mimeType ? { mimeType: mimeType } : undefined);
      voiceRecorder.addEventListener("dataavailable", function (dataEvent) {
        if (dataEvent.data && dataEvent.data.size) voiceChunks.push(dataEvent.data);
      });
      voiceRecorder.addEventListener("stop", function () {
        var cancelled = voiceCancelled;
        var blob = new Blob(voiceChunks, { type: voiceRecorder.mimeType || mimeType || "audio/webm" });
        stopVoiceTracks();
        voiceRecorder = null;
        voiceChunks = [];
        if (cancelled) {
          voiceBusy = false;
          setVoiceStatus("已取消录音", "", 1800);
          return;
        }
        uploadVoice(blob);
      });
      voiceRecorder.start();
      setVoiceStatus("录音中 · 松开发送", "recording");
      emitClawd("beacon", "Volo 在听", { duration: 1200, priority: 3 });
    } catch (error) {
      stopVoiceTracks();
      voiceBusy = false;
      setVoiceStatus("没有麦克风权限", "error", 3600);
    }
  }

  function stopVoiceRecording(cancelled) {
    voiceReleaseRequested = true;
    voiceCancelled = Boolean(cancelled);
    if (voiceRecorder && voiceRecorder.state === "recording") {
      voiceRecorder.stop();
      if (!cancelled) setVoiceStatus("正在处理录音…", "processing");
    }
  }

  function setDrawerOpen(open, restoreFocus) {
    drawer.classList.toggle("is-open", open);
    drawerScrim.classList.toggle("is-open", open);
    drawer.style.transform = open ? "translateX(0)" : "";
    drawer.style.pointerEvents = open ? "auto" : "";
    drawerScrim.style.pointerEvents = open ? "auto" : "";
    drawerScrim.style.opacity = open ? "1" : "";
    drawer.setAttribute("aria-hidden", String(!open));
    drawer.toggleAttribute("inert", !open);
    drawerButton.setAttribute("aria-expanded", String(open));
    if (open) {
      window.setTimeout(function () {
        newChatButton.focus();
      }, 80);
    } else if (restoreFocus) {
      drawerButton.focus();
    }
  }

  // Bind the drawer before optional voice/music/session setup. A partially
  // updated PWA must still be able to switch conversations.
  drawerButton.onclick = function () {
    setDrawerOpen(drawerButton.getAttribute("aria-expanded") !== "true", false);
  };
  drawerClose.onclick = function () {
    setDrawerOpen(false, true);
  };
  drawerScrim.onclick = function () {
    setDrawerOpen(false, true);
  };

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
    var content = music.contentForMessage(message);
    if (content.text) {
      var text = document.createElement("p");
      text.textContent = content.text;
      body.appendChild(text);
    }
    if (content.music) body.appendChild(music.createCard(content.music));
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
    note.textContent =
      carrierLabel + " · " + formatTime(message.ts) +
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

  function isMessageScrollNearBottom() {
    return messageScroll.scrollHeight - messageScroll.clientHeight - messageScroll.scrollTop < 96;
  }

  function renderMessages(shouldScroll) {
    var messages = messagesBySession[selectedSession] || [];
    var fragment = document.createDocumentFragment();
    fragment.appendChild(emptyState);
    messages.forEach(function (message) {
      fragment.appendChild(
        message.role === "user" ? createUserMessage(message) : createAssistantMessage(message)
      );
    });
    if (typingBySession[selectedSession]) {
      fragment.appendChild(createTypingMessage());
    }
    messageList.classList.toggle(
      "has-messages",
      messages.length > 0 || Boolean(typingBySession[selectedSession])
    );
    messageList.replaceChildren(fragment);
    if (shouldScroll) {
      requestAnimationFrame(function () {
        messageScroll.scrollTop = messageScroll.scrollHeight;
      });
    }
  }

  function sessionStatus(session) {
    if (session.virtual) {
      return session.status === "online" ? "记忆与工具在线" : "Volo 载体未连接";
    }
    if (typingBySession[session.tmux_session]) {
      return "思考中";
    }
    if (session.status === "online") {
      return "在线";
    }
    if (session.status === "shell_only") {
      return "Claude 已退出";
    }
    return "已停止";
  }

  function renderSessions() {
    if (!sessions.length) {
      var empty = document.createElement("p");
      empty.className = "volo-session-empty";
      empty.textContent = window.CCC.isConfigured() ? "还没有窗口" : "连接服务器后显示窗口";
      sessionList.replaceChildren(empty);
      return;
    }
    var fragment = document.createDocumentFragment();
    sessions.forEach(function (session) {
      var sessionId = session.tmux_session;
      var row = document.createElement("div");
      row.className = "volo-session-row";
      if (session.virtual) {
        row.classList.add("volo-session-virtual");
      }
      if (sessionId === selectedSession) {
        row.classList.add("active");
      }
      var button = document.createElement("button");
      button.type = "button";
      button.className = "volo-current-chat";
      button.dataset.session = sessionId;
      button.setAttribute("aria-current", sessionId === selectedSession ? "page" : "false");
      var flower = document.createElement("span");
      flower.className = "volo-current-chat-flower";
      flower.setAttribute("aria-hidden", "true");
      var copy = document.createElement("span");
      var title = document.createElement("strong");
      title.textContent = session.title || sessionId;
      var status = document.createElement("small");
      var unread = unreadBySession[sessionId] || 0;
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
      if (!session.virtual) {
        row.appendChild(menu);
      }
      fragment.appendChild(row);
    });
    sessionList.replaceChildren(fragment);
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

  async function loadSessions(preferred) {
    if (!window.CCC.isConfigured()) {
      setConnectionState(false, "未配置");
      renderSessions();
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
      var wanted = preferred || selectedSession;
      if (!findSession(wanted)) {
        wanted = findSession("volo") ? "volo" : (sessions.length ? sessions[0].tmux_session : "");
      }
      renderSessions();
      if (wanted && wanted !== selectedSession) {
        await selectSession(wanted);
      } else if (wanted) {
        selectedSession = wanted;
        window.CCC.setSelectedSession(wanted);
        input.value = drafts[wanted] || "";
        updateCarrierPresentation();
        resizeInput();
        await loadHistory(wanted);
      }
    } catch (error) {
      setConnectionState(false, error.message);
      renderSessions();
    }
  }

  async function loadHistory(sessionId) {
    var generation = ++requestGeneration;
    try {
      var payload = await window.CCC.history(sessionId, 300);
      if (generation !== requestGeneration || selectedSession !== sessionId) {
        return;
      }
      messagesBySession[sessionId] = mergeMessages([], payload.records || []);
      cursorBySession[sessionId] =
        messagesBySession[sessionId].length
          ? messagesBySession[sessionId][messagesBySession[sessionId].length - 1].ts
          : null;
      unreadBySession[sessionId] = 0;
      renderMessages(true);
      renderSessions();
      schedulePoll(250);
    } catch (error) {
      emitClawd("disconnected", "连接失败", { duration: 1800, priority: 4 });
      setConnectionState(false, error.message);
    }
  }

  async function pollSelected() {
    var sessionId = selectedSession;
    if (!sessionId || document.hidden) {
      schedulePoll(1800);
      return;
    }
    var generation = requestGeneration;
    try {
      var payload = await window.CCC.poll(sessionId, cursorBySession[sessionId], 100);
      if (generation !== requestGeneration || selectedSession !== sessionId) {
        return;
      }
      var incoming = (payload.chat && payload.chat.new_records) || [];
      var previousLength = (messagesBySession[sessionId] || []).length;
      var wasTyping = Boolean(typingBySession[sessionId]);
      messagesBySession[sessionId] = mergeMessages(messagesBySession[sessionId], incoming);
      cursorBySession[sessionId] =
        (payload.chat && payload.chat.last_ts) || cursorBySession[sessionId] || null;
      var isTyping = Boolean(payload.status && payload.status.is_typing);
      typingBySession[sessionId] = isTyping;
      var hasNew = messagesBySession[sessionId].length > previousLength;
      var typingChanged = wasTyping !== isTyping;
      if (hasNew || typingChanged) {
        renderMessages(isMessageScrollNearBottom());
        renderSessions();
      }
      if (hasNew && incoming.some(function (message) { return message.role === "assistant"; })) {
        emitClawd("notification", "Volo 回信啦", {
          duration: 1400,
          priority: 4,
          next: { name: "happy", duration: 900, priority: 3 }
        });
      }
      setConnectionState(true, sessions.length + " 个窗口");
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
    if (!sessionId) {
      return;
    }
    if (selectedSession) {
      drafts[selectedSession] = input.value;
      writeDrafts();
    }
    selectedSession = sessionId;
    requestGeneration += 1;
    window.CCC.setSelectedSession(sessionId);
    unreadBySession[sessionId] = 0;
    input.value = drafts[sessionId] || "";
    updateCarrierPresentation();
    resizeInput();
    renderSessions();
    if (messagesBySession[sessionId]) {
      renderMessages(true);
      schedulePoll(100);
    } else {
      renderMessages(false);
      await loadHistory(sessionId);
    }
    setDrawerOpen(false, false);
    input.focus();
  }

  async function sendMessage(explicitValue) {
    var sessionId = selectedSession;
    var carrier = currentCarrier();
    var fromComposer = typeof explicitValue !== "string";
    var value = (fromComposer ? input.value : explicitValue).trim();
    if (!sessionId || !value || sending) {
      return false;
    }
    sending = true;
    if (fromComposer) {
      input.value = "";
      drafts[sessionId] = "";
      writeDrafts();
    }

    var optimistic = {
      ts: new Date().toISOString(),
      role: "user",
      text: value,
      client_local: true
    };
    messagesBySession[sessionId] = mergeMessages(messagesBySession[sessionId], [optimistic]);
    typingBySession[sessionId] = true;
    resizeInput();
    renderMessages(true);
    renderSessions();
    emitClawd("beacon", carrier === "gateway" ? "去找共同记忆" : "发到 " + sessionId, {
      duration: 900,
      priority: 3
    });

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
      if (selectedSession === sessionId) {
        renderMessages(true);
      }
      renderSessions();
      if (carrier === "gateway") {
        emitClawd("happy", payload.tools && payload.tools.length ? "Volo 用工具看过啦" : "Volo 回信啦", {
          duration: 1200,
          priority: 3
        });
        loadUsage();
      }
      schedulePoll(300);
      return true;
    } catch (error) {
      messagesBySession[sessionId] = (messagesBySession[sessionId] || []).filter(function (message) {
        return !message.client_local;
      });
      typingBySession[sessionId] = false;
      if (fromComposer) {
        input.value = value;
        drafts[sessionId] = value;
        writeDrafts();
      }
      renderMessages(false);
      setConnectionState(false, error.message);
      emitClawd("disconnected", "发送失败", { duration: 1800, priority: 4 });
      return false;
    } finally {
      sending = false;
      resizeInput();
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
    if (!session) {
      return;
    }
    actionSession = sessionId;
    actionTitle.textContent = session.title || sessionId;
    actionText.textContent =
      session.status === "online"
        ? "该窗口正在运行。停止 tmux 不会删除聊天历史。"
        : "该窗口当前为 " + sessionStatus(session) + "，可以重新启动 Claude。";
    actionError.hidden = true;
    compactButton.disabled = session.status !== "online";
    closeButton.textContent = session.status === "online" ? "停止窗口" : "启动窗口";
    actionDialog.showModal();
  }

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
      await loadSessions(payload.session && payload.session.tmux_session);
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
        if (!window.confirm("停止 " + (session.title || actionSession) + "？聊天历史会保留。")) {
          return;
        }
        await window.CCC.closeSession(actionSession);
      } else {
        await window.CCC.startSession(actionSession);
      }
      actionDialog.close();
      await loadSessions();
    } catch (error) {
      actionError.textContent = error.message;
      actionError.hidden = false;
    }
  });

  composer.addEventListener("submit", function (event) {
    event.preventDefault();
    sendMessage();
  });
  voiceButton.addEventListener("pointerdown", function (event) {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    startVoiceRecording(event);
  });
  voiceButton.addEventListener("pointerup", function (event) {
    event.preventDefault();
    stopVoiceRecording(false);
  });
  voiceButton.addEventListener("pointercancel", function () {
    stopVoiceRecording(true);
  });
  voiceButton.addEventListener("contextmenu", function (event) { event.preventDefault(); });
  voiceButton.addEventListener("keydown", function (event) {
    if ((event.key === " " || event.key === "Enter") && !event.repeat) {
      event.preventDefault();
      startVoiceRecording();
    }
  });
  voiceButton.addEventListener("keyup", function (event) {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      stopVoiceRecording(false);
    }
  });
  music.bind();
  input.addEventListener("input", function () {
    if (selectedSession) {
      drafts[selectedSession] = input.value;
      writeDrafts();
    }
    resizeInput();
    if (input.value.trim()) {
      emitClawd("typing", "", { duration: 900, priority: 1 });
    }
  });
  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      sendMessage();
    }
  });
  newChatButton.addEventListener("click", openCreateDialog);
  topNewChatButton.addEventListener("click", openCreateDialog);
  usageButton.addEventListener("click", function () { setUsageOpen(!usageOpen); });
  usageClose.addEventListener("click", function () { setUsageOpen(false); });
  usageRefresh.addEventListener("click", loadUsage);

  sessionList.addEventListener("click", function (event) {
    var action = event.target.closest("[data-session-action]");
    if (action) {
      openActionDialog(action.dataset.sessionAction);
      return;
    }
    var button = event.target.closest("[data-session]");
    if (button) {
      selectSession(button.dataset.session);
    }
  });

  messageList.addEventListener("click", function (event) {
    var flower = event.target.closest(".volo-flower-button");
    if (flower) {
      flower.classList.remove("is-blooming");
      void flower.offsetWidth;
      flower.classList.add("is-blooming");
      emitClawd("happy", "Volo 的小花开啦", { duration: 1000, priority: 2 });
    }
  });

  document.addEventListener("ccc:session-selected", function (event) {
    var next = event.detail && event.detail.session;
    if (next && next !== selectedSession && findSession(next)) {
      selectSession(next);
    }
  });

  document.addEventListener("ccc:config-changed", function () {
    loadSessions();
  });
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) {
      schedulePoll(100);
    }
  });
  window.addEventListener("hashchange", function () {
    if (window.location.hash !== "#volo") {
      setDrawerOpen(false, false);
    }
  });

  resizeInput();
  renderMessages(false);
  loadSessions();
})();
