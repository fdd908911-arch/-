(function () {
  "use strict";

  var SETTINGS_KEY = "island-chat.volo-settings.v1";
  var TOGETHER_KEY = "island-chat.together-avatars.v1";
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
  var userAvatar = document.getElementById("voloCallUserAvatar");
  var moreButton = document.getElementById("voloCallMore");
  var info = document.getElementById("voloCallInfo");
  var infoClose = document.getElementById("voloCallInfoClose");
  var connectTimer = 0;
  var durationTimer = 0;
  var connectedAt = 0;
  var active = false;

  if (!openButton || !screen) {
    return;
  }

  function readStoredAvatar(key, field) {
    try {
      var settings = JSON.parse(localStorage.getItem(key) || "{}");
      return typeof settings[field] === "string" ? settings[field] : "";
    } catch (storageError) {
      return "";
    }
  }

  function applyAvatar() {
    setAvatar(avatar, readStoredAvatar(SETTINGS_KEY, "avatar"));
    setAvatar(userAvatar, readStoredAvatar(TOGETHER_KEY, "user"));
  }

  function setAvatar(element, dataUrl) {
    element.classList.toggle("has-photo", Boolean(dataUrl));
    if (dataUrl) {
      element.style.backgroundImage = 'url("' + dataUrl.replace(/"/g, "%22") + '")';
      return;
    }
    element.style.removeProperty("background-image");
  }

  function formatDuration(milliseconds) {
    var seconds = Math.max(0, Math.floor(milliseconds / 1000));
    var minutes = Math.floor(seconds / 60);
    var remainder = seconds % 60;
    return String(minutes).padStart(2, "0") + ":" + String(remainder).padStart(2, "0");
  }

  function updateDuration() {
    if (!connectedAt) {
      return;
    }
    status.textContent = formatDuration(Date.now() - connectedAt);
  }

  function connectCall() {
    if (!active) {
      return;
    }
    screen.classList.remove("is-connecting");
    screen.classList.add("is-connected");
    connectedAt = Date.now();
    transcript.textContent = "已接通，正在等待对话…";
    quality.hidden = false;
    updateDuration();
    window.clearInterval(durationTimer);
    durationTimer = window.setInterval(updateDuration, 1000);
  }

  function openCall() {
    active = true;
    connectedAt = 0;
    applyAvatar();
    screen.hidden = false;
    screen.classList.remove("is-connected");
    screen.classList.add("is-connecting");
    document.body.classList.add("volo-call-open");
    status.textContent = "正在呼叫…";
    transcript.textContent = "正在连接实时文字…";
    quality.hidden = true;
    info.hidden = true;
    muteButton.setAttribute("aria-pressed", "false");
    speakerButton.setAttribute("aria-pressed", "true");
    window.clearTimeout(connectTimer);
    connectTimer = window.setTimeout(connectCall, 1350);
    endButton.focus();
  }

  function endCall() {
    active = false;
    connectedAt = 0;
    window.clearTimeout(connectTimer);
    window.clearInterval(durationTimer);
    connectTimer = 0;
    durationTimer = 0;
    screen.hidden = true;
    screen.classList.remove("is-connecting", "is-connected");
    document.body.classList.remove("volo-call-open");
    info.hidden = true;
    openButton.focus();
  }

  function toggleControl(button) {
    var pressed = button.getAttribute("aria-pressed") === "true";
    button.setAttribute("aria-pressed", String(!pressed));
  }

  openButton.addEventListener("click", openCall);
  minimizeButton.addEventListener("click", endCall);
  endButton.addEventListener("click", endCall);

  muteButton.addEventListener("click", function () {
    toggleControl(muteButton);
  });

  speakerButton.addEventListener("click", function () {
    toggleControl(speakerButton);
  });

  moreButton.addEventListener("click", function () {
    info.hidden = !info.hidden;
    if (!info.hidden) {
      infoClose.focus();
    }
  });

  infoClose.addEventListener("click", function () {
    info.hidden = true;
    moreButton.focus();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !screen.hidden) {
      if (!info.hidden) {
        info.hidden = true;
        moreButton.focus();
      } else {
        endCall();
      }
    }
  });

  document.addEventListener("volo:call-transcript", function (event) {
    var text = event.detail && event.detail.text;
    if (!active || typeof text !== "string" || !text.trim()) {
      return;
    }
    transcript.textContent = text.trim();
  });
})();

