(function () {
  "use strict";

  function create(options) {
    options = options || {};
    if (!window.VoloMediaStatus) {
      throw new Error("VoloMediaStatus must load before volo-voice.js");
    }

    var button = document.getElementById("voloVoiceButton");
    var recorder = null;
    var stream = null;
    var chunks = [];
    var busy = false;
    var releaseRequested = false;
    var cancelled = false;
    var bound = false;

    function setStatus(message, state, hideAfter) {
      window.VoloMediaStatus.set(message, state, hideAfter, "voice");
    }

    function emitClawd(state, phrase, detail) {
      if (typeof options.emitClawd === "function") {
        options.emitClawd(state, phrase, detail);
      }
    }

    function stopTracks() {
      if (stream) {
        stream.getTracks().forEach(function (track) { track.stop(); });
      }
      stream = null;
    }

    function preferredMimeType() {
      if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return "";
      return ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"].find(function (type) {
        return MediaRecorder.isTypeSupported(type);
      }) || "";
    }

    function filename(type) {
      if (type.indexOf("mp4") !== -1) return "voice.m4a";
      if (type.indexOf("ogg") !== -1) return "voice.ogg";
      return "voice.webm";
    }

    function formatMessage(payload) {
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

    async function upload(blob) {
      if (blob.size < 1000) {
        busy = false;
        setStatus("录音太短了，再按住说一次", "error", 3200);
        return;
      }
      var config = window.CCC.getConfig();
      var form = new FormData();
      form.append("file", blob, filename(blob.type || ""));
      setStatus("正在听懂你的语气…", "processing");
      button.disabled = true;
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
        setStatus("听懂了，正在送给 Volo…", "processing");
        var sent = await options.sendMessage(formatMessage(payload));
        setStatus(sent ? "已送给 Volo ♡" : "没有送出去，请重试", sent ? "" : "error", 3600);
      } catch (error) {
        var message = error && error.message ? error.message : "语音发送失败";
        if (message.indexOf("401") !== -1 || message.indexOf("Unauthorized") !== -1) {
          message = "访问 Token 不正确，请重新配置服务器";
        }
        setStatus(message, "error", 4200);
        emitClawd("disconnected", "语音没有送出去", { duration: 1800, priority: 4 });
      } finally {
        busy = false;
        button.disabled = false;
        button.classList.remove("is-processing");
      }
    }

    async function start(event) {
      if (busy || options.isMusicBusy() || options.isSending()) return;
      if (!window.CCC.isConfigured()) {
        setStatus("先配置服务器地址和访问 Token", "error", 3200);
        window.CCC.openConnectionDialog();
        return;
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
        setStatus("当前浏览器不支持录音", "error", 3600);
        return;
      }
      busy = true;
      releaseRequested = false;
      cancelled = false;
      chunks = [];
      if (event && event.pointerId !== undefined && button.setPointerCapture) {
        try { button.setPointerCapture(event.pointerId); } catch (error) { void error; }
      }
      setStatus("正在打开麦克风…", "processing");
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (releaseRequested) {
          stopTracks();
          busy = false;
          setStatus("麦克风已允许，请再按住说话", "", 2800);
          return;
        }
        var mimeType = preferredMimeType();
        recorder = new MediaRecorder(stream, mimeType ? { mimeType: mimeType } : undefined);
        recorder.addEventListener("dataavailable", function (dataEvent) {
          if (dataEvent.data && dataEvent.data.size) chunks.push(dataEvent.data);
        });
        recorder.addEventListener("stop", function () {
          var wasCancelled = cancelled;
          var blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
          stopTracks();
          recorder = null;
          chunks = [];
          if (wasCancelled) {
            busy = false;
            setStatus("已取消录音", "", 1800);
            return;
          }
          upload(blob);
        });
        recorder.start();
        setStatus("录音中 · 松开发送", "recording");
        emitClawd("beacon", "Volo 在听", { duration: 1200, priority: 3 });
      } catch (error) {
        stopTracks();
        busy = false;
        setStatus("没有麦克风权限", "error", 3600);
      }
    }

    function stop(shouldCancel) {
      releaseRequested = true;
      cancelled = Boolean(shouldCancel);
      if (recorder && recorder.state === "recording") {
        recorder.stop();
        if (!shouldCancel) setStatus("正在处理录音…", "processing");
      }
    }

    function bind() {
      if (bound) return;
      bound = true;
      button.addEventListener("pointerdown", function (event) {
        if (event.button !== undefined && event.button !== 0) return;
        event.preventDefault();
        start(event);
      });
      button.addEventListener("pointerup", function (event) {
        event.preventDefault();
        stop(false);
      });
      button.addEventListener("pointercancel", function () { stop(true); });
      button.addEventListener("contextmenu", function (event) { event.preventDefault(); });
      button.addEventListener("keydown", function (event) {
        if ((event.key === " " || event.key === "Enter") && !event.repeat) {
          event.preventDefault();
          start();
        }
      });
      button.addEventListener("keyup", function (event) {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          stop(false);
        }
      });
      window.addEventListener("pagehide", function () {
        cancelled = true;
        if (recorder && recorder.state === "recording") recorder.stop();
        stopTracks();
      });
    }

    return {
      bind: bind,
      formatMessage: formatMessage,
      isBusy: function () { return busy; }
    };
  }

  window.VoloVoice = { create: create };
})();
