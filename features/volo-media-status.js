(function () {
  "use strict";

  var status = document.getElementById("voloVoiceStatus");
  var voiceButton = document.getElementById("voloVoiceButton");
  var musicButton = document.getElementById("voloMusicButton");
  var timer = 0;

  function set(message, state, hideAfter, owner) {
    window.clearTimeout(timer);
    status.textContent = message || "";
    status.hidden = !message;
    status.className = "volo-voice-status" + (state ? " is-" + state : "");

    var voiceOwned = owner === "voice";
    var musicOwned = owner === "music";
    voiceButton.classList.toggle("is-recording", voiceOwned && state === "recording");
    voiceButton.classList.toggle("is-processing", voiceOwned && state === "processing");
    voiceButton.setAttribute("aria-pressed", String(voiceOwned && state === "recording"));
    voiceButton.setAttribute(
      "aria-label",
      voiceOwned && state === "recording" ? "松开发送语音" : "按住说话"
    );
    voiceButton.title = voiceOwned && state === "recording" ? "松开发送" : "按住说话";
    musicButton.classList.toggle("is-processing", musicOwned && state === "processing");

    if (hideAfter) {
      timer = window.setTimeout(function () {
        status.hidden = true;
      }, hideAfter);
    }
  }

  window.VoloMediaStatus = { set: set };
})();
