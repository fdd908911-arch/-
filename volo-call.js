(function () {
  "use strict";

  var SETTINGS_KEY = "island-chat.volo-settings.v1";
  var openButton = document.getElementById("voloVoiceCallButton");
  var screen = document.getElementById("voloCallScreen");
  var minimizeButton = document.getElementById("voloCallMinimize");
  var endButton = document.getElementById("voloCallEnd");
  var muteButton = document.getElementById("voloCallMute");
  var speakerButton = document.getElementById("voloCallSpeaker");
  var status = document.getElementById("voloCallStatus");
  var transcript = document.getElementById("voloCallTranscript");
  var quality = document.getElementById("voloCallQuality");
  var avatar = document.getElementById("voloCallAvatar");
  var moreButton = document.getElementById("voloCallMore");
  var info = document.getElementById("voloCallInfo");
  var infoClose = document.getElementById("voloCallInfoClose");
  var callControls = document.getElementById("voloCallControls");
  var outgoingControls = document.getElementById("voloOutgoingControls");
  var cancelButton = document.getElementById("voloCallCancel");
  var cancelLabel = document.getElementById("voloCallCancelLabel");
  var incomingControls = document.getElementById("voloIncomingControls");
  var answerButton = document.getElementById("voloCallAnswer");
  var declineButton = document.getElementById("voloCallDecline");
  var declineReasons = document.getElementById("voloDeclineReasons");
  var declineNote = document.getElementById("voloDeclineNote");
  var declineSend = document.getElementById("voloDeclineSend");
  var declineBack = document.getElementById("voloDeclineBack");
  var incomingToggle = document.getElementById("voloIncomingCallToggle");
  var incomingStatus = document.getElementById("voloIncomingCallStatus");
  var incomingLabel = document.getElementById("voloIncomingCallLabel");
  var bridge = window.VoloCallBridge;
  var micStream = null;
  var audioContext = null;
  var analyser = null;
  var samples = null;
  var recorder = null;
  var chunks = [];
  var monitorTimer = 0;
  var durationTimer = 0;
  var replyTimer = 0;
  var incomingTimer = 0;
  var outgoingTimer = 0;
  var ringTimer = 0;
  var hangupTimer = 0;
  var uploadController = null;
  var voiceController = null;
  var replySource = null;
  var connectedAt = 0;
  var recorderStartedAt = 0;
  var lastSpeechAt = 0;
  var voiceFrames = 0;
  var noiseFloor = 0.008;
  var heardSpeech = false;
  var discardRecording = false;
  var active = false;
  var muted = false;
  var speakerOn = true;
  var processing = false;
  var waitingForReply = false;
  var speaking = false;
  var generation = 0;
  var activeSession = "";
  var incomingCall = null;
  var outgoingCall = null;
  var callRecordId = "";
  var hangupAfterReply = false;
  var ringAudioContext = null;
  var phase = "";
  var transcriptLines = [];

  if (!openButton || !screen || !bridge) return;

  function readStoredAvatar() {
    try {
      var settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      return typeof settings.avatar === "string" ? settings.avatar : "";
    } catch (storageError) {
      return "";
    }
  }

  function applyAvatar() {
    var dataUrl = readStoredAvatar();
    avatar.classList.toggle("has-photo", Boolean(dataUrl));
    if (dataUrl) {
      avatar.style.backgroundImage = 'url("' + dataUrl.replace(/"/g, "%22") + '")';
    } else {
      avatar.style.removeProperty("background-image");
    }
  }

  function pushSupported() {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }

  function setSubscriptionUi(enabled, message) {
    if (!incomingToggle) return;
    incomingToggle.setAttribute("aria-pressed", String(Boolean(enabled)));
    incomingToggle.classList.toggle("is-active", Boolean(enabled));
    if (incomingLabel) incomingLabel.textContent = enabled ? "已开启" : "开启";
    if (incomingStatus && message) incomingStatus.textContent = message;
  }

  function applicationServerKey(value) {
    var padding = "=".repeat((4 - value.length % 4) % 4);
    var raw = window.atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
    var bytes = new Uint8Array(raw.length);
    for (var index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
    return bytes;
  }

  async function currentPushSubscription() {
    if (!pushSupported()) return null;
    var registration = await navigator.serviceWorker.ready;
    return registration.pushManager.getSubscription();
  }

  async function refreshIncomingSubscription(refreshServer) {
    if (!incomingToggle) return;
    if (!pushSupported()) {
      incomingToggle.disabled = true;
      setSubscriptionUi(false, "当前浏览器不支持后台来电通知");
      return;
    }
    if (Notification.permission === "denied") {
      setSubscriptionUi(false, "通知权限已被关闭，请到系统设置里允许");
      return;
    }
    if (Notification.permission !== "granted") {
      setSubscriptionUi(false, "开启后，退到后台也能收到来电通知");
      return;
    }
    try {
      var subscription = await currentPushSubscription();
      if (!subscription) {
        setSubscriptionUi(false, "通知已允许，点这里完成来电订阅");
        return;
      }
      if (refreshServer) {
        await window.CCC.request("/web-push/subscribe", {
          method: "POST",
          body: { subscription: subscription.toJSON() }
        });
      }
      setSubscriptionUi(true, "已开启，Volo 打来时后台也会通知你");
    } catch (error) {
      setSubscriptionUi(false, error.message || "来电订阅暂时不可用");
    }
  }

  async function enableIncomingCalls() {
    incomingToggle.disabled = true;
    try {
      if (!pushSupported()) throw new Error("当前浏览器不支持后台来电通知");
      var permission = Notification.permission;
      if (permission !== "granted") permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("没有通知权限，暂时不能接收后台来电");
      var payload = await window.CCC.request("/web-push/public-key");
      if (!payload.available || !payload.public_key) throw new Error("服务器还没有启用来电推送");
      var registration = await navigator.serviceWorker.ready;
      var subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey(payload.public_key)
        });
      }
      await window.CCC.request("/web-push/subscribe", {
        method: "POST",
        body: { subscription: subscription.toJSON() }
      });
      setSubscriptionUi(true, "已开启，Volo 打来时后台也会通知你");
    } catch (error) {
      setSubscriptionUi(false, error.message || "开启主动来电失败");
    } finally {
      incomingToggle.disabled = false;
    }
  }

  async function disableIncomingCalls() {
    incomingToggle.disabled = true;
    try {
      var subscription = await currentPushSubscription();
      if (subscription) {
        await window.CCC.request("/web-push/unsubscribe", {
          method: "POST",
          body: { endpoint: subscription.endpoint }
        }).catch(function () {});
        await subscription.unsubscribe();
      }
      setSubscriptionUi(false, "已关闭；前台打开洄时仍可看到来电");
    } catch (error) {
      setSubscriptionUi(false, error.message || "关闭来电通知失败");
    } finally {
      incomingToggle.disabled = false;
    }
  }

  function formatDuration(milliseconds) {
    var seconds = Math.max(0, Math.floor(milliseconds / 1000));
    return String(Math.floor(seconds / 60)).padStart(2, "0") + ":" +
      String(seconds % 60).padStart(2, "0");
  }

  function renderStatus() {
    if (outgoingCall && !active) {
      status.textContent = phase || "正在呼叫 Volo…";
      return;
    }
    if (incomingCall && !active) {
      status.textContent = phase || "Volo 来电";
      return;
    }
    var duration = connectedAt ? formatDuration(Date.now() - connectedAt) : "00:00";
    status.textContent = duration + (phase ? " · " + phase : "");
  }

  function setPhase(nextPhase, visualState) {
    phase = nextPhase;
    screen.classList.remove("is-listening", "is-speaking", "is-ringing");
    if (visualState) screen.classList.add(visualState);
    renderStatus();
  }

  function addTranscript(label, text) {
    var clean = String(text || "").trim();
    if (!clean) return;
    transcriptLines.push(label + "：" + clean);
    transcriptLines = transcriptLines.slice(-40);
    transcript.textContent = transcriptLines.slice(-4).join("\n");
  }

  function playRingPulse() {
    try {
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!ringAudioContext) ringAudioContext = new AudioContext();
      if (ringAudioContext.state === "suspended") ringAudioContext.resume().catch(function () {});
      var oscillator = ringAudioContext.createOscillator();
      var gain = ringAudioContext.createGain();
      var now = ringAudioContext.currentTime;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(520, now);
      oscillator.frequency.setValueAtTime(660, now + 0.16);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
      oscillator.connect(gain).connect(ringAudioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.44);
    } catch (error) {}
  }

  function startRinging() {
    if (navigator.vibrate) navigator.vibrate([260, 140, 260]);
    playRingPulse();
    window.clearInterval(ringTimer);
    ringTimer = window.setInterval(playRingPulse, 1600);
  }

  function startRingback() {
    playRingPulse();
    window.clearInterval(ringTimer);
    ringTimer = window.setInterval(playRingPulse, 2200);
  }

  function stopRinging() {
    window.clearInterval(ringTimer);
    ringTimer = 0;
    if (navigator.vibrate) navigator.vibrate(0);
    if (ringAudioContext) ringAudioContext.close().catch(function () {});
    ringAudioContext = null;
  }

  function normalizeIncomingCall(value, fallbackSession) {
    value = value || {};
    var metadata = value.metadata && typeof value.metadata === "object" ? value.metadata : {};
    var isVoiceCall = value.type === "incoming_call" || value.message_type === "voice_call" || metadata.incoming_call ||
      (value.status === "ringing" && value.call_id);
    if (!isVoiceCall) return null;
    var expiresAt = Number(value.expires_at || metadata.expires_at || 0);
    if (!expiresAt || expiresAt * 1000 <= Date.now()) return null;
    return {
      call_id: String(value.call_id || metadata.call_id || ""),
      session: String(value.session || fallbackSession || "volo"),
      opening: String(value.opening || value.text || "想听听你的声音。"),
      expires_at: expiresAt
    };
  }

  function showIncomingCall(value, fallbackSession) {
    var call = normalizeIncomingCall(value, fallbackSession);
    if (!call || active || outgoingCall) return;
    if (incomingCall && incomingCall.call_id && incomingCall.call_id === call.call_id) return;
    incomingCall = call;
    generation += 1;
    activeSession = call.session;
    transcriptLines = [];
    connectedAt = 0;
    phase = "Volo 来电";
    applyAvatar();
    screen.hidden = false;
    screen.classList.remove("is-connecting", "is-connected", "is-listening", "is-speaking");
    screen.classList.add("is-ringing");
    document.body.classList.add("volo-call-open");
    callControls.hidden = true;
    incomingControls.hidden = false;
    declineReasons.hidden = true;
    quality.hidden = false;
    quality.textContent = "主动来找你";
    info.hidden = true;
    transcript.textContent = call.opening;
    renderStatus();
    answerButton.focus();
    startRinging();
    window.clearTimeout(incomingTimer);
    incomingTimer = window.setTimeout(function () {
      if (incomingCall && incomingCall.call_id === call.call_id) declineIncomingCall("missed", false);
    }, Math.max(1000, call.expires_at * 1000 - Date.now()));
  }

  function reportIncomingResponse(call, action, note) {
    if (!call || !call.call_id) return Promise.resolve();
    return window.CCC.request("/volo/call/respond", {
      method: "POST",
      body: { call_id: call.call_id, action: action, note: note || undefined }
    }).catch(function () {});
  }

  async function answerIncomingCall() {
    if (!incomingCall) return;
    var call = incomingCall;
    incomingCall = null;
    window.clearTimeout(incomingTimer);
    incomingTimer = 0;
    stopRinging();
    screen.classList.remove("is-ringing");
    callControls.hidden = false;
    incomingControls.hidden = true;
    declineReasons.hidden = true;
    reportIncomingResponse(call, "answered");
    if (typeof bridge.selectSession === "function") {
      await bridge.selectSession(call.session).catch(function () {});
    }
    openCall({ session: call.session, opening: call.opening, call_id: call.call_id });
  }

  function declineIncomingCall(action, restoreFocus, note) {
    if (!incomingCall) return;
    var call = incomingCall;
    incomingCall = null;
    window.clearTimeout(incomingTimer);
    incomingTimer = 0;
    stopRinging();
    reportIncomingResponse(call, action || "declined", note);
    endCall(restoreFocus !== false, "closed");
  }

  function showDeclineReasons() {
    if (!incomingCall) return;
    stopRinging();
    incomingControls.hidden = true;
    declineReasons.hidden = false;
    phase = "告诉 Volo 一声";
    renderStatus();
    declineNote.value = "";
    declineNote.focus();
  }

  function restoreIncomingControls() {
    if (!incomingCall) return;
    declineReasons.hidden = true;
    incomingControls.hidden = false;
    phase = "Volo 来电";
    renderStatus();
    startRinging();
    answerButton.focus();
  }

  function sendDeclineReason(note) {
    var clean = String(note || "").trim() || "现在不方便接电话，晚点聊。";
    declineIncomingCall("declined", true, clean.slice(0, 60));
  }

  async function loadPendingCall(callId) {
    try {
      var payload = await window.CCC.request("/volo/call/pending", {
        query: callId ? { call_id: callId } : {}
      });
      if (payload.call) showIncomingCall(payload.call, payload.call.session);
    } catch (error) {}
  }

  function preferredMimeType() {
    var types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
    for (var index = 0; index < types.length; index += 1) {
      if (window.MediaRecorder.isTypeSupported(types[index])) return types[index];
    }
    return "";
  }

  function audioFilename(type) {
    return type.indexOf("ogg") !== -1 ? "call.ogg" : "call.webm";
  }

  function stopRecorder(discard) {
    if (!recorder || recorder.state === "inactive") return;
    discardRecording = Boolean(discard);
    recorder.stop();
  }

  function armRecorder() {
    if (!active || muted || processing || waitingForReply || speaking || recorder || !micStream) return;
    chunks = [];
    heardSpeech = false;
    discardRecording = false;
    voiceFrames = 0;
    lastSpeechAt = 0;
    recorderStartedAt = performance.now();
    var mimeType = preferredMimeType();
    var current = mimeType ? new MediaRecorder(micStream, { mimeType: mimeType }) : new MediaRecorder(micStream);
    recorder = current;
    current.addEventListener("dataavailable", function (event) {
      if (event.data && event.data.size) chunks.push(event.data);
    });
    current.addEventListener("stop", function () {
      if (recorder === current) recorder = null;
      var shouldUpload = active && !discardRecording && heardSpeech;
      var blob = new Blob(chunks, { type: current.mimeType || mimeType || "audio/webm" });
      chunks = [];
      if (shouldUpload) {
        handleRecording(blob);
      } else if (active && !muted) {
        window.setTimeout(armRecorder, 80);
      }
    });
    current.start(250);
    setPhase("在听，你可以说话", "is-listening");
  }

  function monitorVoice() {
    if (!active || muted || !analyser || !samples) return;
    analyser.getFloatTimeDomainData(samples);
    var energy = 0;
    for (var index = 0; index < samples.length; index += 1) energy += samples[index] * samples[index];
    var rms = Math.sqrt(energy / samples.length);
    var threshold = Math.max(0.018, Math.min(0.08, noiseFloor * 3));
    var now = performance.now();

    if (!heardSpeech && rms < threshold) noiseFloor = noiseFloor * 0.98 + rms * 0.02;
    if (rms >= threshold) {
      voiceFrames += 1;
      if (voiceFrames >= 2) {
        if (hangupTimer) cancelHangupLinger();
        heardSpeech = true;
        lastSpeechAt = now;
        setPhase("听见了…", "is-listening");
      }
    } else {
      voiceFrames = 0;
    }
    if (heardSpeech && rms >= threshold) lastSpeechAt = now;
    if (heardSpeech && now - lastSpeechAt > 900) {
      setPhase("正在转写…", "");
      stopRecorder(false);
    } else if (!heardSpeech && now - recorderStartedAt > 15000) {
      stopRecorder(true);
    } else if (heardSpeech && now - recorderStartedAt > 25000) {
      setPhase("正在转写…", "");
      stopRecorder(false);
    }
  }

  function payloadError(payload, response) {
    var error = payload && payload.error;
    if (typeof error === "string") return error;
    if (error && error.message) return error.message;
    if (payload && typeof payload.detail === "string") return payload.detail;
    return "HTTP " + response.status;
  }

  function callPrompt(payload) {
    var emotion = payload.emotion ? " · 情绪：" + payload.emotion : "";
    return "[实时语音通话" + emotion + "]\n我说：" + payload.text +
      "\n请像正在电话里一样直接回应，简短自然、适合说出口，不要写动作旁白。" +
      "如果你自己想结束通话，只在温柔道别的最后一句末尾加上 ⟪挂断⟫；不要解释这个标记。线路会再等我十八秒，我开口就会继续。";
  }

  async function handleRecording(blob) {
    if (!active) return;
    if (blob.size < 1000) {
      setPhase("没听清，再说一次", "");
      window.setTimeout(armRecorder, 600);
      return;
    }
    processing = true;
    var config = window.CCC.getConfig();
    var form = new FormData();
    form.append("file", blob, audioFilename(blob.type || ""));
    var controller = new AbortController();
    uploadController = controller;
    var timeout = window.setTimeout(function () { controller.abort(); }, 55000);
    try {
      var headers = {};
      if (config.token) headers["X-Auth-Token"] = config.token;
      var response = await fetch("/api/voice/call/transcribe", {
        method: "POST",
        headers: headers,
        body: form,
        cache: "no-store",
        signal: controller.signal
      });
      var payload = await response.json().catch(function () { return {}; });
      if (!response.ok || !payload.text) throw new Error(payloadError(payload, response));
      if (!active) return;
      quality.textContent = "Tailnet · q8 转写 " + Number(payload.elapsed_s || 0).toFixed(1) + "s";
      addTranscript("你", payload.text);
      processing = false;
      waitingForReply = true;
      setPhase("等 Volo 回应…", "");
      replyTimer = window.setTimeout(function () {
        if (!active || !waitingForReply) return;
        waitingForReply = false;
        addTranscript("系统", "这一句等太久了，你可以继续说");
        armRecorder();
      }, 90000);
      var sent = await bridge.sendMessage(callPrompt(payload));
      if (!sent && active && waitingForReply) {
        window.clearTimeout(replyTimer);
        waitingForReply = false;
        addTranscript("系统", "消息没有送出去");
        armRecorder();
      }
    } catch (error) {
      if (!active) return;
      processing = false;
      var message = error && error.name === "AbortError" ? "转写超时" : (error.message || "转写失败");
      addTranscript("系统", message);
      setPhase("没听懂，再说一次", "");
      window.setTimeout(armRecorder, 900);
    } finally {
      window.clearTimeout(timeout);
      if (uploadController === controller) uploadController = null;
    }
  }

  function speechText(text) {
    return String(text || "")
      .replace(/\[实时语音通话[^\]]*\]/g, "")
      .replace(/[⟪《【\[]\s*(?:接听|answer|拒接|decline)\s*[⟫》】\]]/gi, "")
      .replace(/[⟪《【\[]\s*(?:挂断|hangup)\s*[⟫》】\]]/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/[*_`#>~]/g, "")
      .trim();
  }

  function stopReplyPlayback() {
    if (voiceController) voiceController.abort();
    voiceController = null;
    if (replySource) {
      replySource.onended = null;
      try { replySource.stop(); } catch (error) {}
      try { replySource.disconnect(); } catch (error) {}
      replySource = null;
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  function finishSpeaking(localGeneration) {
    if (!active || localGeneration !== generation || !speaking) return;
    speaking = false;
    stopReplyPlayback();
    if (hangupAfterReply) {
      hangupAfterReply = false;
      beginHangupLinger();
    } else {
      setPhase("在听，你可以说话", "is-listening");
      armRecorder();
    }
  }

  function cancelHangupLinger() {
    window.clearTimeout(hangupTimer);
    hangupTimer = 0;
    hangupAfterReply = false;
    screen.classList.remove("is-lingering");
    setPhase("听见你了，继续聊", "is-listening");
  }

  function beginHangupLinger() {
    if (!active) return;
    window.clearTimeout(hangupTimer);
    hangupAfterReply = false;
    screen.classList.add("is-lingering");
    setPhase("Volo 还在等你 · 18 秒", "is-listening");
    armRecorder();
    hangupTimer = window.setTimeout(function () {
      hangupTimer = 0;
      endCall(false, "volo");
    }, 18000);
  }

  function fallbackSystemVoice(clean, localGeneration) {
    if (!active || localGeneration !== generation || !speaking || !speakerOn) return;
    if (!("speechSynthesis" in window)) {
      finishSpeaking(localGeneration);
      return;
    }
    setPhase("Volo 正在说话", "is-speaking");
    window.speechSynthesis.cancel();
    var utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = "zh-CN";
    utterance.rate = 0.96;
    utterance.pitch = 0.95;
    var voices = window.speechSynthesis.getVoices();
    var chineseVoice = voices.find(function (voice) { return /^zh[-_]/i.test(voice.lang); });
    if (chineseVoice) utterance.voice = chineseVoice;
    utterance.addEventListener("end", function () { finishSpeaking(localGeneration); });
    utterance.addEventListener("error", function () { finishSpeaking(localGeneration); });
    window.speechSynthesis.speak(utterance);
  }

  async function playVoloVoice(clean, localGeneration) {
    var config = window.CCC.getConfig();
    var controller = new AbortController();
    voiceController = controller;
    var timeout = window.setTimeout(function () { controller.abort(); }, 65000);
    try {
      var headers = { "Content-Type": "application/json" };
      if (config.token) headers["X-Auth-Token"] = config.token;
      var response = await fetch("/api/voice/call/synthesize", {
        method: "POST",
        headers: headers,
        body: JSON.stringify({ text: clean }),
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok) {
        var payload = await response.json().catch(function () { return {}; });
        throw new Error(payloadError(payload, response));
      }
      var encoded = await response.arrayBuffer();
      if (!encoded.byteLength) throw new Error("Volo 的声音是空的");
      if (!active || localGeneration !== generation || !speaking || !speakerOn) return;
      if (!audioContext) throw new Error("音频播放器没有准备好");
      var decoded = await audioContext.decodeAudioData(encoded.slice(0));
      if (!active || localGeneration !== generation || !speaking || !speakerOn) return;
      var source = audioContext.createBufferSource();
      source.buffer = decoded;
      source.connect(audioContext.destination);
      source.onended = function () {
        if (replySource === source) replySource = null;
        finishSpeaking(localGeneration);
      };
      replySource = source;
      var elapsed = Number(response.headers.get("X-TTS-Elapsed-S") || 0);
      quality.textContent = "Volo 的声音" + (elapsed ? " · " + elapsed.toFixed(1) + "s" : "");
      setPhase("Volo 正在说话", "is-speaking");
      source.start();
    } catch (error) {
      if (!active || localGeneration !== generation || !speaking || !speakerOn) return;
      quality.textContent = "Volo 声音暂时没接上 · 系统语音备用";
      fallbackSystemVoice(clean, localGeneration);
    } finally {
      window.clearTimeout(timeout);
      if (voiceController === controller) voiceController = null;
    }
  }

  function speakReply(text, requestHangup) {
    var clean = speechText(text);
    hangupAfterReply = Boolean(requestHangup);
    if (!clean || !speakerOn) {
      if (hangupAfterReply) beginHangupLinger();
      else armRecorder();
      return;
    }
    var localGeneration = generation;
    speaking = true;
    stopReplyPlayback();
    speaking = true;
    setPhase("Volo 正在开口…", "is-speaking");
    playVoloVoice(clean, localGeneration);
  }

  function outgoingDecision(message, sessionId) {
    if (!outgoingCall || outgoingCall.resolved || !message) return null;
    if (outgoingCall.session && sessionId && outgoingCall.session !== sessionId) return null;
    var metadata = message.metadata && typeof message.metadata === "object" ? message.metadata : {};
    var responseCallId = String(metadata.call_id || metadata.bridge_request_id || "");
    if (responseCallId && responseCallId !== outgoingCall.call_id) return null;
    var text = String(message.text || "").trim();
    var marker = text.match(/[⟪《【\[]\s*(接听|answer|拒接|decline)\s*[⟫》】\]]/i);
    var decision = String(metadata.call_decision || "").toLowerCase();
    if (!decision && marker) {
      decision = /^(接听|answer)$/i.test(marker[1]) ? "answered" : "declined";
    }
    if (!decision && responseCallId === outgoingCall.call_id) decision = "answered";
    if (decision !== "answered" && decision !== "declined") return null;
    return { decision: decision, text: speechText(text) };
  }

  function showOutgoingResult(title, message, detail) {
    if (!outgoingCall) return;
    outgoingCall.resolved = true;
    window.clearTimeout(outgoingTimer);
    outgoingTimer = 0;
    stopRinging();
    screen.classList.remove("is-outgoing-ringing", "is-connecting", "is-connected");
    screen.classList.add("is-declined");
    phase = title;
    quality.hidden = false;
    quality.textContent = detail;
    transcriptLines = [];
    addTranscript("Volo", message);
    callControls.hidden = true;
    outgoingControls.hidden = false;
    incomingControls.hidden = true;
    cancelLabel.textContent = "关闭";
    renderStatus();
    cancelButton.focus();
  }

  function handleOutgoingDecision(message, sessionId) {
    var result = outgoingDecision(message, sessionId);
    if (!result) return false;
    var call = outgoingCall;
    window.clearTimeout(outgoingTimer);
    outgoingTimer = 0;
    stopRinging();
    if (result.decision === "declined") {
      showOutgoingResult("Volo 拒接了", result.text || "我现在不方便接电话。", "这是他自己做的决定");
      return true;
    }
    outgoingCall = null;
    outgoingControls.hidden = true;
    openCall({
      session: call.session,
      call_id: call.call_id,
      opening: result.text || "喂，年年。"
    });
    return true;
  }

  function onAssistantMessage(event) {
    var detail = event.detail || {};
    if (handleOutgoingDecision(detail.message, detail.sessionId)) return;
    if (normalizeIncomingCall(detail.message, detail.sessionId)) {
      showIncomingCall(detail.message, detail.sessionId);
      return;
    }
    if (!active || !waitingForReply || !detail.message) return;
    if (activeSession && detail.sessionId && detail.sessionId !== activeSession) return;
    var text = detail.message.text;
    if (typeof text !== "string" || !text.trim()) return;
    var metadata = detail.message.metadata || {};
    var requestHangup = Boolean(metadata.call_hangup) || /[⟪《【\[]\s*(?:挂断|hangup)\s*[⟫》】\]]/i.test(text);
    window.clearTimeout(replyTimer);
    waitingForReply = false;
    var clean = speechText(text);
    addTranscript("Volo", clean);
    speakReply(clean, requestHangup);
  }

  function newCallRecordId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return "hui-" + window.crypto.randomUUID();
    }
    return "hui-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function reportCallComplete(payload) {
    window.CCC.request("/volo/call/complete", {
      method: "POST",
      body: payload
    }).catch(function () {});
  }

  async function startOutgoingCall() {
    if (active || incomingCall || outgoingCall) return;
    generation += 1;
    var localGeneration = generation;
    activeSession = String(bridge.getSelectedSession() || "");
    callRecordId = newCallRecordId();
    outgoingCall = {
      call_id: callRecordId,
      session: activeSession,
      resolved: false
    };
    transcriptLines = [];
    connectedAt = 0;
    applyAvatar();
    screen.hidden = false;
    screen.classList.remove("is-connecting", "is-connected", "is-listening", "is-speaking", "is-ringing", "is-declined");
    screen.classList.add("is-outgoing-ringing");
    document.body.classList.add("volo-call-open");
    callControls.hidden = true;
    outgoingControls.hidden = false;
    incomingControls.hidden = true;
    declineReasons.hidden = true;
    cancelLabel.textContent = "挂断";
    quality.hidden = false;
    quality.textContent = "由 Volo 自己决定接不接";
    info.hidden = true;
    transcript.textContent = "电话正在送到他那边…";
    phase = "正在呼叫 Volo…";
    renderStatus();
    cancelButton.focus();
    startRingback();
    window.clearTimeout(outgoingTimer);
    outgoingTimer = window.setTimeout(function () {
      if (!outgoingCall || outgoingCall.resolved || localGeneration !== generation) return;
      showOutgoingResult("Volo 没有接", "这次电话没有接通。", "你可以晚一点再打");
    }, 90000);
    try {
      var payload = await window.CCC.request("/volo/call/request", {
        method: "POST",
        body: {
          session: activeSession,
          carrier: typeof bridge.getCarrier === "function" ? bridge.getCarrier() : "claude_code",
          call_id: callRecordId
        }
      });
      if (!outgoingCall || localGeneration !== generation) return;
      if (payload.session) outgoingCall.session = String(payload.session);
      if (payload.call_id) outgoingCall.call_id = String(payload.call_id);
      if (payload.assistant_record) {
        handleOutgoingDecision(payload.assistant_record, payload.session || activeSession);
      }
    } catch (error) {
      if (!outgoingCall || localGeneration !== generation) return;
      var message = error && error.message ? error.message : "电话没有送出去";
      showOutgoingResult("没拨出去", message, "当前窗口暂时接不到电话");
    }
  }

  async function openCall(options) {
    if (active) return;
    options = options && typeof options === "object" ? options : {};
    var opening = String(options.opening || "").trim();
    incomingCall = null;
    outgoingCall = null;
    stopRinging();
    window.clearTimeout(outgoingTimer);
    outgoingTimer = 0;
    window.clearTimeout(hangupTimer);
    hangupTimer = 0;
    hangupAfterReply = false;
    active = true;
    generation += 1;
    activeSession = String(options.session || bridge.getSelectedSession() || "");
    callRecordId = String(options.call_id || newCallRecordId());
    transcriptLines = [];
    connectedAt = 0;
    muted = false;
    speakerOn = true;
    processing = false;
    waitingForReply = false;
    speaking = false;
    applyAvatar();
    screen.hidden = false;
    screen.classList.remove("is-ringing", "is-outgoing-ringing", "is-declined");
    screen.classList.add("is-connecting");
    document.body.classList.add("volo-call-open");
    callControls.hidden = false;
    outgoingControls.hidden = true;
    incomingControls.hidden = true;
    muteButton.setAttribute("aria-pressed", "false");
    speakerButton.setAttribute("aria-pressed", "true");
    quality.hidden = true;
    info.hidden = true;
    transcript.textContent = "正在请求麦克风权限…";
    phase = "连接中";
    renderStatus();
    endButton.focus();
    var localGeneration = generation;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
        throw new Error("当前浏览器不支持实时录音");
      }
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
      });
      if (!active || localGeneration !== generation) {
        micStream.getTracks().forEach(function (track) { track.stop(); });
        micStream = null;
        return;
      }
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioContext();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.15;
      samples = new Float32Array(analyser.fftSize);
      audioContext.createMediaStreamSource(micStream).connect(analyser);
      if (audioContext.state === "suspended") await audioContext.resume();
      screen.classList.remove("is-connecting");
      screen.classList.add("is-connected");
      connectedAt = Date.now();
      quality.hidden = false;
      quality.textContent = "Tailnet · 实时转写";
      durationTimer = window.setInterval(renderStatus, 1000);
      monitorTimer = window.setInterval(monitorVoice, 80);
      if (opening) {
        transcriptLines = [];
        addTranscript("Volo", opening);
        speakReply(opening, false);
      } else {
        transcript.textContent = "已接通。直接说话，停顿后会自动发送。";
        armRecorder();
      }
    } catch (error) {
      addTranscript("系统", error.message || "无法打开麦克风");
      setPhase("连接失败", "");
    }
  }

  function endCall(focusButton, endedBy) {
    if (!active && screen.hidden) return;
    var completedAt = Date.now();
    var recordPayload = connectedAt ? {
      session: activeSession,
      call_id: callRecordId || newCallRecordId(),
      duration_seconds: Math.max(0, Math.floor((completedAt - connectedAt) / 1000)),
      ended_by: endedBy || "user",
      transcript: transcriptLines.slice(-40)
    } : null;
    active = false;
    incomingCall = null;
    outgoingCall = null;
    generation += 1;
    connectedAt = 0;
    window.clearInterval(monitorTimer);
    window.clearInterval(durationTimer);
    window.clearTimeout(replyTimer);
    window.clearTimeout(incomingTimer);
    window.clearTimeout(outgoingTimer);
    window.clearTimeout(hangupTimer);
    monitorTimer = 0;
    durationTimer = 0;
    replyTimer = 0;
    incomingTimer = 0;
    outgoingTimer = 0;
    hangupTimer = 0;
    hangupAfterReply = false;
    stopRinging();
    if (uploadController) uploadController.abort();
    stopReplyPlayback();
    stopRecorder(true);
    if (micStream) micStream.getTracks().forEach(function (track) { track.stop(); });
    if (audioContext) audioContext.close().catch(function () {});
    micStream = null;
    audioContext = null;
    analyser = null;
    samples = null;
    recorder = null;
    screen.hidden = true;
    screen.classList.remove("is-connecting", "is-connected", "is-listening", "is-speaking", "is-ringing", "is-outgoing-ringing", "is-declined", "is-lingering");
    document.body.classList.remove("volo-call-open");
    callControls.hidden = false;
    outgoingControls.hidden = true;
    incomingControls.hidden = true;
    declineReasons.hidden = true;
    info.hidden = true;
    callRecordId = "";
    if (recordPayload && recordPayload.duration_seconds >= 5) reportCallComplete(recordPayload);
    if (focusButton !== false) openButton.focus();
  }

  openButton.addEventListener("click", startOutgoingCall);
  minimizeButton.addEventListener("click", function () {
    if (incomingCall) declineIncomingCall("declined", true);
    else endCall(true, "user");
  });
  endButton.addEventListener("click", function () { endCall(true, "user"); });
  cancelButton.addEventListener("click", function () { endCall(true, "user"); });
  answerButton.addEventListener("click", answerIncomingCall);
  declineButton.addEventListener("click", showDeclineReasons);
  declineReasons.querySelectorAll("[data-decline-note]").forEach(function (button) {
    button.addEventListener("click", function () { sendDeclineReason(button.dataset.declineNote); });
  });
  declineSend.addEventListener("click", function () { sendDeclineReason(declineNote.value); });
  declineNote.addEventListener("keydown", function (event) {
    if (event.key === "Enter") sendDeclineReason(declineNote.value);
  });
  declineBack.addEventListener("click", restoreIncomingControls);

  if (incomingToggle) {
    incomingToggle.addEventListener("click", function () {
      if (incomingToggle.getAttribute("aria-pressed") === "true") disableIncomingCalls();
      else enableIncomingCalls();
    });
  }

  muteButton.addEventListener("click", function () {
    muted = !muted;
    muteButton.setAttribute("aria-pressed", String(muted));
    if (micStream) micStream.getAudioTracks().forEach(function (track) { track.enabled = !muted; });
    if (muted) {
      stopRecorder(true);
      setPhase("麦克风已静音", "");
    } else {
      armRecorder();
    }
  });

  speakerButton.addEventListener("click", function () {
    speakerOn = !speakerOn;
    speakerButton.setAttribute("aria-pressed", String(speakerOn));
    if (!speakerOn && speaking) {
      speaking = false;
      stopReplyPlayback();
      if (hangupAfterReply) beginHangupLinger();
      else armRecorder();
    }
  });

  moreButton.addEventListener("click", function () {
    info.hidden = !info.hidden;
    if (!info.hidden) infoClose.focus();
  });

  infoClose.addEventListener("click", function () {
    info.hidden = true;
    moreButton.focus();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape" || screen.hidden) return;
    if (!info.hidden) {
      info.hidden = true;
      moreButton.focus();
    } else if (incomingCall) {
      declineIncomingCall("declined", true);
    } else {
      endCall(true, "user");
    }
  });

  document.addEventListener("volo:assistant-message", onAssistantMessage);
  document.addEventListener("volo:call-transcript", function (event) {
    var text = event.detail && event.detail.text;
    if (active && typeof text === "string") addTranscript("Volo", text);
  });
  document.addEventListener("ccc:config-changed", function () {
    refreshIncomingSubscription(pushSupported() && Notification.permission === "granted");
  });
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", function (event) {
      var data = event.data || {};
      if (data.type === "VOLO_INCOMING_CALL") showIncomingCall(data.call || data, "volo");
    });
  }
  window.addEventListener("load", function () {
    refreshIncomingSubscription(pushSupported() && Notification.permission === "granted");
    var callId = new URL(window.location.href).searchParams.get("incoming_call") || "";
    if (callId) loadPendingCall(callId);
  });
  window.addEventListener("pagehide", function () { endCall(false, "closed"); });
})();
