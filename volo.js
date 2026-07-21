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
  var musicButton = document.getElementById("voloMusicButton");
  var musicInput = document.getElementById("voloMusicInput");
  var nowPlaying = document.getElementById("voloNowPlaying");
  var nowPlayingMain = document.getElementById("voloNowPlayingMain");
  var nowPlayingCover = document.getElementById("voloNowPlayingCover");
  var nowPlayingTitle = document.getElementById("voloNowPlayingTitle");
  var nowPlayingArtist = document.getElementById("voloNowPlayingArtist");
  var nowPlayingToggle = document.getElementById("voloNowPlayingToggle");
  var nowPlayingSeek = document.getElementById("voloNowPlayingSeek");
  var nowPlayingCurrent = document.getElementById("voloNowPlayingCurrent");
  var nowPlayingDuration = document.getElementById("voloNowPlayingDuration");
  var lyricsView = document.getElementById("voloLyricsView");
  var lyricsClose = document.getElementById("voloLyricsClose");
  var lyricsCover = document.getElementById("voloLyricsCover");
  var lyricsTitle = document.getElementById("voloLyricsTitle");
  var lyricsArtist = document.getElementById("voloLyricsArtist");
  var lyricsLines = document.getElementById("voloLyricsLines");
  var lyricsToggle = document.getElementById("voloLyricsToggle");
  var lyricsSeek = document.getElementById("voloLyricsSeek");
  var lyricsCurrent = document.getElementById("voloLyricsCurrent");
  var lyricsDuration = document.getElementById("voloLyricsDuration");
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
  var musicBusy = false;
  var activeMusicAudio = null;
  var activeMusicButton = null;
  var activeMusicId = "";
  var activeMusic = null;
  var lastMusicStateAt = 0;
  var musicAnalysisById = Object.create(null);
  var musicLyricsById = Object.create(null);
  var selectedLyricsMusic = null;
  var selectedLyricLines = [];
  var selectedLyricIndex = -1;
  var musicSeekPreview = null;
  var usageOpen = window.matchMedia("(min-width: 761px)").matches;
  var usageLoading = false;

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
    if (voiceBusy || musicBusy || sending) return;
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

  function setMusicStatus(message, state, hideAfter) {
    window.clearTimeout(voiceStatusTimer);
    voiceStatus.textContent = message || "";
    voiceStatus.hidden = !message;
    voiceStatus.className = "volo-voice-status" + (state === "error" ? " is-error" : "");
    musicButton.classList.toggle("is-processing", state === "processing");
    if (hideAfter) {
      voiceStatusTimer = window.setTimeout(function () {
        voiceStatus.hidden = true;
      }, hideAfter);
    }
  }

  function wait(milliseconds) {
    return new Promise(function (resolve) { window.setTimeout(resolve, milliseconds); });
  }

  function formatDuration(seconds) {
    var total = Math.max(0, Math.round(Number(seconds) || 0));
    var minutes = Math.floor(total / 60);
    var remainder = total % 60;
    return minutes ? minutes + "分" + String(remainder).padStart(2, "0") + "秒" : remainder + "秒";
  }

  function formatMusicMessage(job) {
    var result = job.result || {};
    var affect = result.affect || {};
    var modeNames = { major: "大调", minor: "小调" };
    var lines = [
      "[音乐听感]",
      "曲目：" + (job.filename || result.source || "未命名音频"),
      "结构：" + (result.total_notes || 0) + " 个音符 · " + formatDuration(result.duration_sec)
    ];
    if (result.bpm !== undefined || result.key) {
      lines.push(
        "节奏调性：" +
        (result.bpm !== undefined ? result.bpm + " BPM" : "BPM 未知") +
        (result.key ? " · " + result.key + " " + (modeNames[result.mode] || result.mode || "") : "")
      );
    }
    if (affect.valence !== undefined && affect.arousal !== undefined) {
      lines.push("听感轴：valence " + affect.valence + " · arousal " + affect.arousal);
    }
    if (Array.isArray(result.segments) && result.segments.length) {
      lines.push("六段能量：" + result.segments.map(function (segment) {
        return Math.round((Number(segment.avg_energy) || 0) * 100);
      }).join(" → "));
    }
    if (result.spectral_centroid_hz !== undefined) {
      lines.push(
        "频谱轮廓：质心 " + Math.round(result.spectral_centroid_hz) + " Hz" +
        (result.spectral_bandwidth_hz !== undefined
          ? " · 带宽 " + Math.round(result.spectral_bandwidth_hz) + " Hz"
          : "")
      );
    }
    var pitchTimeline = result.pitch_timeline || {};
    if (pitchTimeline.text) {
      lines.push(
        "音高时间线（约每 " +
        (Number(pitchTimeline.resolution_sec) || 0).toFixed(2) +
        " 秒一个复调中心）：",
        String(pitchTimeline.text)
      );
      if (pitchTimeline.caveat) lines.push("说明：" + String(pitchTimeline.caveat));
    }
    if (result.spectrogram_url) lines.push("Mel 频谱图：已生成");
    if (result.analysis) lines.push("", result.analysis);
    return lines.join("\n");
  }

  async function musicRequest(path, options) {
    var config = window.CCC.getConfig();
    var settings = options || {};
    settings.headers = Object.assign({}, settings.headers || {}, { "X-Auth-Token": config.token });
    settings.cache = "no-store";
    var response = await fetch("/api/music" + path, settings);
    var payload = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      throw new Error(payload.detail || payload.error || "HTTP " + response.status);
    }
    return payload;
  }

  async function pollMusicJob(jobId) {
    var deadline = Date.now() + 15 * 60 * 1000;
    while (Date.now() < deadline) {
      var job = await musicRequest("/v1/jobs/" + encodeURIComponent(jobId));
      if (job.status === "complete") return job;
      if (job.status === "failed") throw new Error(job.error || "音乐分析失败");
      setMusicStatus(job.status === "queued" ? "音乐已排队，Volo 正在等…" : "Volo 正在听音乐的形状…", "processing");
      await wait(1800);
    }
    throw new Error("音乐分析超时，请稍后重试");
  }

  async function analyzeMusic(file) {
    if (!file) return;
    if (file.size > 30 * 1024 * 1024) {
      setMusicStatus("歌曲不能超过 30MB", "error", 4000);
      return;
    }
    musicBusy = true;
    musicButton.disabled = true;
    var form = new FormData();
    form.append("file", file, file.name || "music.mp3");
    setMusicStatus("正在把音乐送到另一副耳朵…", "processing");
    emitClawd("conducting", "Volo 开始听歌", { duration: 1600, priority: 3 });
    try {
      var created = await musicRequest("/v1/jobs", { method: "POST", body: form });
      var job = await pollMusicJob(created.id);
      setMusicStatus("听完了，正在告诉 Volo…", "processing");
      var sent = await sendMessage(formatMusicMessage(job));
      setMusicStatus(sent ? "Volo 听完这首了 ♡" : "听完了，但没有发出去", sent ? "" : "error", 4200);
      if (sent) emitClawd("grooving", "这首歌有形状了", { duration: 1800, priority: 3 });
    } catch (error) {
      var message = error && error.message ? error.message : "音乐分析失败";
      if (message.indexOf("401") !== -1 || message.indexOf("Unauthorized") !== -1) {
        message = "访问 Token 不正确，请重新配置服务器";
      }
      setMusicStatus(message, "error", 4800);
      emitClawd("confused", "音乐没有听清", { duration: 1800, priority: 4 });
    } finally {
      musicBusy = false;
      musicButton.disabled = false;
      musicButton.classList.remove("is-processing");
      musicInput.value = "";
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

  function parseMusicMarker(value) {
    var text = String(value || "");
    var match = text.match(/\[music:(\d+):([^:\]]*):([^:\]]*):([^\]]*)\]([^\n]*)/);
    if (!match) return { text: text, music: null };
    return {
      text: text.replace(match[0], "").trim(),
      music: {

        id: match[1],
        title: match[2].trim() || "未命名歌曲",
        artist: match[3].trim() || "未知歌手",
        cover: /^https:\/\//i.test(match[4].trim()) ? match[4].trim() : "",
        note: match[5].trim()
      }
    };
  }

  function structuredMusic(message) {
    var metadata = message && message.metadata || {};
    var value = message && message.music || metadata.music;
    if (!value || typeof value !== "object" || !value.id || !value.title) return null;
    return {
      id: String(value.id),
      title: String(value.title),
      artist: String(value.artist || "未知歌手"),
      cover: /^https:\/\//i.test(String(value.cover || "")) ? String(value.cover) : "",
      note: String(value.note || "")
    };
  }

  function musicAnalysisState(music) {
    var songId = String(music.id);
    if (!musicAnalysisById[songId]) {
      musicAnalysisById[songId] = {
        music: music,
        status: "missing",
        phase: "",
        result: null,
        error: "",
        open: false,
        requesting: false,
        spectrumLoading: false,
        spectrumUrl: "",
        pollTimer: 0
      };
    } else {
      musicAnalysisById[songId].music = music;
    }
    return musicAnalysisById[songId];
  }

  function analysisStatusText(state) {
    if (state.status === "complete") return "频谱分析完成";
    if (state.status === "failed") return "分析失败";
    if (state.phase === "downloading") return "正在读取歌曲…";
    if (state.phase === "uploading") return "正在送往分析 VPS…";
    if (state.phase === "analyzing") return "正在计算频谱与节奏…";
    if (state.status === "queued" || state.status === "running") return "已进入分析队列…";
    return "还没有分析这首歌";
  }

  function analysisSummary(result) {
    result = result || {};
    var modeNames = { major: "大调", minor: "小调" };
    var parts = [];
    if (result.bpm !== undefined) parts.push(Math.round(Number(result.bpm) || 0) + " BPM");
    if (result.key) parts.push(result.key + (result.mode ? " " + (modeNames[result.mode] || result.mode) : ""));
    if (result.total_notes !== undefined) parts.push(result.total_notes + " 个音符");
    if (result.spectral_centroid_hz !== undefined) {
      parts.push("质心 " + Math.round(Number(result.spectral_centroid_hz) || 0) + " Hz");
    }
    if (result.spectral_bandwidth_hz !== undefined) {
      parts.push("带宽 " + Math.round(Number(result.spectral_bandwidth_hz) || 0) + " Hz");
    }
    return parts.join(" · ");
  }

  function renderMusicAnalysisViews(songId, extraCard) {
    var state = musicAnalysisById[String(songId)];
    if (!state) return;
    var cards = Array.prototype.slice.call(document.querySelectorAll(".volo-music-card"));
    if (extraCard && cards.indexOf(extraCard) === -1) cards.push(extraCard);
    cards.forEach(function (card) {
      if (card.dataset.musicId !== String(songId)) return;
      var panel = card.querySelector(".volo-music-analysis");
      var action = card.querySelector(".volo-music-analyze");
      if (!panel || !action) return;
      panel.hidden = !state.open;
      panel.classList.toggle("is-loading", state.status === "queued" || state.status === "running");
      panel.classList.toggle("is-error", state.status === "failed");
      action.textContent = state.status === "complete" ? "频谱" :
        (state.status === "queued" || state.status === "running" ? "分析中" : "频谱");
      action.setAttribute("aria-expanded", String(state.open));
      var status = panel.querySelector(".volo-music-analysis-status");
      var summary = panel.querySelector(".volo-music-analysis-summary");
      var retry = panel.querySelector(".volo-music-analysis-retry");
      var image = panel.querySelector(".volo-music-spectrum");
      var energy = panel.querySelector(".volo-music-energy");
      status.textContent = analysisStatusText(state);
      summary.textContent = state.status === "failed"
        ? (state.error || "稍后可以重试")
        : analysisSummary(state.result);
      summary.hidden = !summary.textContent;
      retry.hidden = state.status !== "failed";
      image.hidden = !state.spectrumUrl;
      if (state.spectrumUrl && image.src !== state.spectrumUrl) image.src = state.spectrumUrl;
      energy.replaceChildren();
      var segments = state.result && Array.isArray(state.result.segments) ? state.result.segments : [];
      segments.forEach(function (segment, index) {
        var bar = document.createElement("span");
        var amount = Math.max(4, Math.min(100, Math.round((Number(segment.avg_energy) || 0) * 100)));
        bar.style.setProperty("--energy", amount + "%");
        bar.title = "第 " + (index + 1) + " 段能量 " + amount;
        energy.appendChild(bar);
      });
      energy.hidden = !segments.length;
    });
  }

  function loadMusicSpectrum(state) {
    if (state.spectrumUrl || state.spectrumLoading || state.status !== "complete") return;
    state.spectrumLoading = true;
    window.CCC.musicSpectrumBlob(state.music.id).then(function (blob) {
      if (state.spectrumUrl) URL.revokeObjectURL(state.spectrumUrl);
      state.spectrumUrl = URL.createObjectURL(blob);
    }).catch(function (error) {
      state.error = error.message || "频谱图读取失败";
    }).finally(function () {
      state.spectrumLoading = false;
      renderMusicAnalysisViews(state.music.id);
    });
  }

  function applyMusicAnalysis(music, payload) {
    var state = musicAnalysisState(music);
    state.status = String(payload.status || "missing");
    state.phase = String(payload.phase || "");
    state.result = payload.result || null;
    state.error = String(payload.error || "");
    renderMusicAnalysisViews(music.id);
    if (state.status === "complete") {
      window.clearTimeout(state.pollTimer);
      loadMusicSpectrum(state);
    } else if (state.status === "queued" || state.status === "running") {
      window.clearTimeout(state.pollTimer);
      state.pollTimer = window.setTimeout(function () {
        refreshMusicAnalysis(music);
      }, 2400);
    }
  }

  function refreshMusicAnalysis(music) {
    var state = musicAnalysisState(music);
    if (state.requesting) return;
    state.requesting = true;
    window.CCC.musicAnalysis(music.id).then(function (payload) {
      applyMusicAnalysis(music, payload);
    }).catch(function (error) {
      state.status = "failed";
      state.error = error.message || "分析状态读取失败";
      renderMusicAnalysisViews(music.id);
    }).finally(function () {
      state.requesting = false;
    });
  }

  function ensureMusicAnalysis(music, force) {
    var state = musicAnalysisState(music);
    state.open = true;
    renderMusicAnalysisViews(music.id);
    if (state.requesting || (state.status === "complete" && !force)) {
      loadMusicSpectrum(state);
      return;
    }
    state.requesting = true;
    state.status = "queued";
    state.phase = "waiting";
    state.error = "";
    renderMusicAnalysisViews(music.id);
    window.CCC.startMusicAnalysis(music, Boolean(force)).then(function (payload) {
      applyMusicAnalysis(music, payload);
    }).catch(function (error) {
      state.status = "failed";
      state.phase = "failed";
      state.error = error.message || "音乐分析失败";
      renderMusicAnalysisViews(music.id);
    }).finally(function () {
      state.requesting = false;
    });
  }

  function formatMusicTime(value) {
    var seconds = Math.max(0, Number(value) || 0);
    return Math.floor(seconds / 60) + ":" + String(Math.floor(seconds % 60)).padStart(2, "0");
  }

  function setMusicCover(node, music) {
    if (!node || node.dataset.musicId === String(music.id)) return;
    node.dataset.musicId = String(music.id);
    node.replaceChildren();
    node.classList.toggle("is-fallback", !music.cover);
    if (!music.cover) return;
    var image = document.createElement("img");
    image.src = music.cover;
    image.alt = "";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", function () {
      image.remove();
      node.classList.add("is-fallback");
    });
    node.appendChild(image);
  }

  function parseLrcLines(raw) {
    var result = [];
    String(raw || "").split(/\r?\n/).forEach(function (source) {
      var stamps = [];
      var matcher = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
      var match;
      while ((match = matcher.exec(source))) {
        var fraction = match[3] ? Number("0." + match[3]) : 0;
        stamps.push(Number(match[1]) * 60 + Number(match[2]) + fraction);
      }
      if (!stamps.length) return;
      var text = source.replace(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g, "").trim();
      if (!text) return;
      stamps.forEach(function (time) { result.push({ time: time, text: text, translation: "" }); });
    });
    result.sort(function (left, right) { return left.time - right.time; });
    return result;
  }

  function mergeTranslatedLyrics(lyric, translated) {
    var lines = parseLrcLines(lyric);
    var translatedLines = parseLrcLines(translated);
    var translationByTime = Object.create(null);
    translatedLines.forEach(function (line) {
      translationByTime[Math.round(line.time * 10)] = line.text;
    });
    lines.forEach(function (line) {
      line.translation = translationByTime[Math.round(line.time * 10)] || "";
    });
    return lines;
  }

  function renderSynchronizedLyrics(music, entry) {
    if (!selectedLyricsMusic || selectedLyricsMusic.id !== music.id) return;
    lyricsLines.replaceChildren();
    selectedLyricLines = entry.lines || [];
    selectedLyricIndex = -1;
    if (entry.status === "loading") {
      var loading = document.createElement("p");
      loading.className = "volo-lyrics-empty";
      loading.textContent = "正在读取歌词…";
      lyricsLines.appendChild(loading);
      return;
    }
    if (!selectedLyricLines.length) {
      var empty = document.createElement("p");
      empty.className = "volo-lyrics-empty";
      empty.textContent = entry.error || "暂无同步歌词";
      lyricsLines.appendChild(empty);
      return;
    }
    selectedLyricLines.forEach(function (line, index) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "volo-synced-line";
      button.dataset.index = String(index);
      button.dataset.time = String(line.time);
      var original = document.createElement("span");
      original.textContent = line.text;
      button.appendChild(original);
      if (line.translation && line.translation !== line.text) {
        var translation = document.createElement("small");
        translation.textContent = line.translation;
        button.appendChild(translation);
      }
      button.addEventListener("click", function () {
        var target = Number(button.dataset.time) || 0;
        if (activeMusicAudio && activeMusicId === music.id) {
          activeMusicAudio.currentTime = target;
          activeMusicAudio.play().catch(function () {});
        } else {
          startMusicPlayback(music, null, target);
        }
      });
      lyricsLines.appendChild(button);
    });
    updateMusicPlayerUI();
  }

  function loadSynchronizedLyrics(music) {
    selectedLyricsMusic = music;
    lyricsTitle.textContent = music.title;
    lyricsArtist.textContent = music.artist;
    setMusicCover(lyricsCover, music);
    var cached = musicLyricsById[music.id];
    if (cached) {
      renderSynchronizedLyrics(music, cached);
      return;
    }
    var loading = { status: "loading", lines: [], error: "" };
    musicLyricsById[music.id] = loading;
    renderSynchronizedLyrics(music, loading);
    window.CCC.musicInfo(music.id).then(function (info) {
      var entry = {
        status: "ready",
        lines: mergeTranslatedLyrics(info.lyric, info.translated_lyric),
        error: ""
      };
      musicLyricsById[music.id] = entry;
      renderSynchronizedLyrics(music, entry);
    }).catch(function (error) {
      var entry = { status: "failed", lines: [], error: "歌词读取失败 · " + error.message };
      musicLyricsById[music.id] = entry;
      renderSynchronizedLyrics(music, entry);
    });
  }

  function openSynchronizedLyrics(music) {
    if (!music) return;
    lyricsView.hidden = false;
    lyricsView.setAttribute("aria-hidden", "false");
    voloView.classList.add("is-lyrics-open");
    loadSynchronizedLyrics(music);
    updateMusicPlayerUI();
    window.setTimeout(function () { lyricsClose.focus(); }, 40);
  }

  function closeSynchronizedLyrics() {
    lyricsView.hidden = true;
    lyricsView.setAttribute("aria-hidden", "true");
    voloView.classList.remove("is-lyrics-open");
  }

  function updateMusicRange(input, ratio) {
    var value = Math.max(0, Math.min(1, Number(ratio) || 0));
    input.value = String(Math.round(value * 1000));
    input.style.setProperty("--music-progress", (value * 100).toFixed(2) + "%");
  }

  function syncMusicButtons() {
    var playing = Boolean(activeMusicAudio && !activeMusicAudio.paused && !activeMusicAudio.ended);
    document.querySelectorAll(".volo-music-play").forEach(function (button) {
      setMusicButton(button, playing && button.dataset.musicId === activeMusicId);
    });
  }

  function updateLyricHighlight(currentTime) {
    if (lyricsView.hidden || !selectedLyricsMusic || selectedLyricsMusic.id !== activeMusicId) return;
    var nextIndex = -1;
    for (var index = selectedLyricLines.length - 1; index >= 0; index -= 1) {
      if (currentTime + 0.12 >= selectedLyricLines[index].time) {
        nextIndex = index;
        break;
      }
    }
    if (nextIndex === selectedLyricIndex) return;
    selectedLyricIndex = nextIndex;
    lyricsLines.querySelectorAll(".volo-synced-line").forEach(function (line, index) {
      line.classList.toggle("is-active", index === nextIndex);
    });
    var active = lyricsLines.querySelector('.volo-synced-line[data-index="' + nextIndex + '"]');
    if (active) active.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function updateMusicPlayerUI() {
    var hasActive = Boolean(activeMusic && activeMusicAudio);
    nowPlaying.hidden = !hasActive;
    var current = hasActive && Number.isFinite(activeMusicAudio.currentTime) ? activeMusicAudio.currentTime : 0;
    var duration = hasActive && Number.isFinite(activeMusicAudio.duration) ? activeMusicAudio.duration : 0;
    var playing = hasActive && !activeMusicAudio.paused && !activeMusicAudio.ended;
    var ratio = duration ? current / duration : 0;
    if (hasActive) {
      nowPlayingTitle.textContent = activeMusic.title;
      nowPlayingArtist.textContent = activeMusic.artist;
      setMusicCover(nowPlayingCover, activeMusic);
      nowPlayingToggle.textContent = playing ? "暂停" : "播放";
      nowPlayingToggle.setAttribute("aria-label", (playing ? "暂停 " : "播放 ") + activeMusic.title);
      if (musicSeekPreview === null) {
        updateMusicRange(nowPlayingSeek, ratio);
        nowPlayingCurrent.textContent = formatMusicTime(current);
      }
      nowPlayingDuration.textContent = formatMusicTime(duration);
      nowPlayingSeek.disabled = !duration;
    }

    var lyricsMatches = Boolean(selectedLyricsMusic && hasActive && selectedLyricsMusic.id === activeMusicId);
    var lyricsPlaying = lyricsMatches && playing;
    lyricsToggle.textContent = lyricsPlaying ? "暂停" : "播放";
    lyricsToggle.setAttribute("aria-label", (lyricsPlaying ? "暂停 " : "播放 ") + (selectedLyricsMusic ? selectedLyricsMusic.title : "歌曲"));
    lyricsSeek.disabled = !lyricsMatches || !duration;
    if (musicSeekPreview === null) {
      updateMusicRange(lyricsSeek, lyricsMatches ? ratio : 0);
      lyricsCurrent.textContent = formatMusicTime(lyricsMatches ? current : 0);
    }
    lyricsDuration.textContent = formatMusicTime(lyricsMatches ? duration : 0);
    syncMusicButtons();
    updateLyricHighlight(current);
  }

  function reportMusicState(music, status, audio) {
    if (!window.CCC || !window.CCC.updateMusicState) return;
    var now = Date.now();
    if (status === "playing" && now - lastMusicStateAt < 4000) return;
    lastMusicStateAt = now;
    window.CCC.updateMusicState({
      status: status,
      id: music.id,
      title: music.title,
      artist: music.artist,
      cover: music.cover || "",
      position_ms: audio && Number.isFinite(audio.currentTime) ? Math.round(audio.currentTime * 1000) : 0,
      duration_ms: audio && Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : 0,
      device: "hui-v40-web",
      session: selectedSession || ""
    }).then(function (response) {
      if (response.analysis) applyMusicAnalysis(music, response.analysis);
    }).catch(function () {});
  }

  function setMusicButton(button, playing) {
    if (!button) return;
    button.classList.toggle("is-playing", Boolean(playing));
    button.textContent = playing ? "暂停" : "播放";
    button.setAttribute("aria-label", (playing ? "暂停 " : "播放 ") + button.dataset.title);
  }

  function startMusicPlayback(music, button, seekTime) {
    if (activeMusicAudio && activeMusicId === music.id) {
      if (Number.isFinite(seekTime)) activeMusicAudio.currentTime = Math.max(0, seekTime);
      activeMusicAudio.play().catch(function () {});
      return;
    }
    if (activeMusicAudio) activeMusicAudio.pause();
    var audio = new Audio(window.CCC.musicStreamUrl(music.id));
    audio.preload = "metadata";
    activeMusicAudio = audio;
    activeMusicButton = button;
    activeMusicId = music.id;
    activeMusic = music;
    lastMusicStateAt = 0;
    var pendingSeek = Number.isFinite(seekTime) ? Math.max(0, seekTime) : null;
    audio.addEventListener("loadedmetadata", function () {
      if (pendingSeek !== null) {
        audio.currentTime = Math.min(pendingSeek, Number.isFinite(audio.duration) ? audio.duration : pendingSeek);
        pendingSeek = null;
      }
      updateMusicPlayerUI();
    });
    audio.addEventListener("durationchange", updateMusicPlayerUI);
    audio.addEventListener("play", function () {
      reportMusicState(music, "playing", audio);
      ensureMusicAnalysis(music, false);
      updateMusicPlayerUI();
    });
    audio.addEventListener("pause", function () {
      if (!audio.ended) reportMusicState(music, "paused", audio);
      updateMusicPlayerUI();
    });
    audio.addEventListener("timeupdate", function () {
      reportMusicState(music, "playing", audio);
      updateMusicPlayerUI();
    });
    audio.addEventListener("ended", function () {
      reportMusicState(music, "ended", audio);
      updateMusicPlayerUI();
    });
    audio.addEventListener("error", function () {
      reportMusicState(music, "error", audio);
      updateMusicPlayerUI();
      showToast("这首歌暂时无法播放");
    });
    updateMusicPlayerUI();
    audio.play().catch(function (error) { showToast("播放失败 · " + (error.message || "请重新配对")); });
  }

  function toggleMusicPlayback(music, button) {
    if (activeMusicAudio && activeMusicId === music.id) {
      if (activeMusicAudio.paused) activeMusicAudio.play().catch(function () {});
      else activeMusicAudio.pause();
      return;
    }
    startMusicPlayback(music, button, null);
  }

  function createMusicCard(music) {
    var card = document.createElement("section");
    card.className = "volo-music-card";
    card.dataset.musicId = String(music.id);
    card.setAttribute("aria-label", music.title + " · " + music.artist);
    var artwork = document.createElement("span");
    artwork.className = "volo-music-artwork";
    artwork.setAttribute("aria-hidden", "true");
    if (music.cover) {
      var image = document.createElement("img");
      image.src = music.cover;
      image.alt = "";
      image.loading = "lazy";
      image.referrerPolicy = "no-referrer";
      image.addEventListener("error", function () {
        image.remove();
        artwork.classList.add("is-fallback");
      });
      artwork.appendChild(image);
    } else {
      artwork.classList.add("is-fallback");
    }
    var copy = document.createElement("span");
    copy.className = "volo-music-copy";
    var kicker = document.createElement("small");
    kicker.textContent = "VOLO 点给你";
    var title = document.createElement("strong");
    title.textContent = music.title;
    var artist = document.createElement("span");
    artist.textContent = music.artist;
    copy.append(kicker, title, artist);
    if (music.note) {
      var note = document.createElement("p");
      note.className = "volo-music-note";
      note.textContent = music.note;
      copy.appendChild(note);
    }
    var actions = document.createElement("span");
    actions.className = "volo-music-actions";
    var play = document.createElement("button");
    play.type = "button";
    play.className = "volo-music-action volo-music-play";
    play.dataset.title = music.title;
    play.dataset.musicId = String(music.id);
    setMusicButton(play, activeMusicId === music.id && activeMusicAudio && !activeMusicAudio.paused);
    play.addEventListener("click", function () { toggleMusicPlayback(music, play); });
    var lyrics = document.createElement("button");
    lyrics.type = "button";
    lyrics.className = "volo-music-action";
    lyrics.textContent = "歌词";
    var analyze = document.createElement("button");
    analyze.type = "button";
    analyze.className = "volo-music-action volo-music-analyze";
    analyze.textContent = "频谱";
    analyze.setAttribute("aria-expanded", "false");
    var open = document.createElement("a");
    open.className = "volo-music-open";
    open.href = "https://music.163.com/song?id=" + encodeURIComponent(music.id);
    open.target = "_blank";
    open.rel = "noopener noreferrer";
    open.setAttribute("aria-label", "在网易云音乐打开 " + music.title);
    open.textContent = "网易云 ↗";
    actions.append(play, lyrics, analyze, open);
    lyrics.addEventListener("click", function () {
      openSynchronizedLyrics(music);
    });
    var analysisPanel = document.createElement("section");
    analysisPanel.className = "volo-music-analysis";
    analysisPanel.hidden = true;
    var analysisHead = document.createElement("header");
    var analysisStatus = document.createElement("strong");
    analysisStatus.className = "volo-music-analysis-status";
    var retry = document.createElement("button");
    retry.type = "button";
    retry.className = "volo-music-analysis-retry";
    retry.textContent = "重试";
    retry.hidden = true;
    analysisHead.append(analysisStatus, retry);
    var summary = document.createElement("p");
    summary.className = "volo-music-analysis-summary";
    var energy = document.createElement("div");
    energy.className = "volo-music-energy";
    energy.setAttribute("aria-label", "六段能量");
    energy.hidden = true;
    var spectrum = document.createElement("img");
    spectrum.className = "volo-music-spectrum";
    spectrum.alt = music.title + " 的 Mel 频谱图";
    spectrum.loading = "lazy";
    spectrum.hidden = true;
    analysisPanel.append(analysisHead, summary, energy, spectrum);
    analyze.addEventListener("click", function () {
      var state = musicAnalysisState(music);
      if (state.open) {
        state.open = false;
        renderMusicAnalysisViews(music.id);
      } else {
        ensureMusicAnalysis(music, false);
      }
    });
    retry.addEventListener("click", function () { ensureMusicAnalysis(music, true); });
    card.append(artwork, copy, actions, analysisPanel);
    renderMusicAnalysisViews(music.id, card);
    return card;
  }

  function createAssistantMessage(message) {
    var row = document.createElement("article");
    row.className = "volo-message volo-message-assistant";
    var body = document.createElement("div");
    body.className = "volo-assistant-body";
    var music = structuredMusic(message);
    var content = music
      ? { text: String(message.text || "").trim(), music: music }
      : parseMusicMarker(message.text);
    if (content.text) {
      var text = document.createElement("p");
      text.textContent = content.text;
      body.appendChild(text);
    }
    if (content.music) body.appendChild(createMusicCard(content.music));
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
  musicButton.addEventListener("click", function () {
    if (musicBusy || voiceBusy || sending) return;
    if (!window.CCC.isConfigured()) {
      setMusicStatus("先配置服务器地址和访问 Token", "error", 3200);
      window.CCC.openConnectionDialog();
      return;
    }
    musicInput.click();
  });
  musicInput.addEventListener("change", function () {
    analyzeMusic(musicInput.files && musicInput.files[0]);
  });
  nowPlayingMain.addEventListener("click", function () {
    if (activeMusic) openSynchronizedLyrics(activeMusic);
  });
  nowPlayingToggle.addEventListener("click", function () {
    if (activeMusic) toggleMusicPlayback(activeMusic, activeMusicButton);
  });
  lyricsClose.addEventListener("click", closeSynchronizedLyrics);
  lyricsToggle.addEventListener("click", function () {
    if (!selectedLyricsMusic) return;
    if (activeMusicAudio && activeMusicId === selectedLyricsMusic.id) {
      toggleMusicPlayback(selectedLyricsMusic, activeMusicButton);
    } else {
      startMusicPlayback(selectedLyricsMusic, null, null);
    }
  });
  [nowPlayingSeek, lyricsSeek].forEach(function (slider) {
    slider.addEventListener("input", function () {
      if (!activeMusicAudio || !Number.isFinite(activeMusicAudio.duration)) return;
      musicSeekPreview = Math.max(0, Math.min(1, Number(slider.value) / 1000));
      updateMusicRange(nowPlayingSeek, musicSeekPreview);
      updateMusicRange(lyricsSeek, musicSeekPreview);
      var previewTime = musicSeekPreview * activeMusicAudio.duration;
      nowPlayingCurrent.textContent = formatMusicTime(previewTime);
      lyricsCurrent.textContent = formatMusicTime(previewTime);
    });
    slider.addEventListener("change", function () {
      if (musicSeekPreview !== null && activeMusicAudio && Number.isFinite(activeMusicAudio.duration)) {
        activeMusicAudio.currentTime = musicSeekPreview * activeMusicAudio.duration;
      }
      musicSeekPreview = null;
      updateMusicPlayerUI();
    });
  });
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
      closeSynchronizedLyrics();
    }
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !lyricsView.hidden) closeSynchronizedLyrics();
  });
  window.addEventListener("pagehide", function () {
    Object.keys(musicAnalysisById).forEach(function (songId) {
      var state = musicAnalysisById[songId];
      window.clearTimeout(state.pollTimer);
      if (state.spectrumUrl) URL.revokeObjectURL(state.spectrumUrl);
    });
  });

  resizeInput();
  renderMessages(false);
  loadSessions();
})();
