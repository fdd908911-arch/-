(function () {
  "use strict";

  var selectedSession = window.CCC.getSelectedSession();
  if (!window.VoloCarrier || !window.VoloChat || !window.VoloComposer || !window.VoloDrawer || !window.VoloMusic || !window.VoloSessions || !window.VoloVoice || !window.VoloUsage) {
    throw new Error("Volo feature modules must load before volo.js");
  }
  var chat = null;
  var composer = null;
  var music = null;
  var sessionRoster = null;
  var carrierView = null;
  var drawer = window.VoloDrawer.create();
  var voice = window.VoloVoice.create({
    sendMessage: function (text) { return sendMessage(text); },
    emitClawd: emitClawd,
    isMusicBusy: function () { return Boolean(music && music.isBusy()); },
    isSending: function () { return Boolean(chat && chat.isSending()); }
  });
  music = window.VoloMusic.create({
    sendMessage: function (text) { return sendMessage(text); },
    emitClawd: emitClawd,
    getSelectedSession: function () { return selectedSession; },
    isVoiceBusy: function () { return voice.isBusy(); },
    isSending: function () { return Boolean(chat && chat.isSending()); }
  });
  var usage = window.VoloUsage.create();
  chat = window.VoloChat.create({
    emitClawd: emitClawd,
    getSelectedSession: function () { return selectedSession; },
    getSessionCount: function () { return sessionRoster ? sessionRoster.count() : 0; },
    music: music,
    onGatewayReply: function (payload) {
      emitClawd("happy", payload.tools && payload.tools.length ? "Volo 用工具看过啦" : "Volo 回信啦", {
        duration: 1200,
        priority: 3
      });
      usage.load();
    },
    onSendingChange: function () { if (composer) composer.resize(); },
    renderSessions: function () { if (sessionRoster) sessionRoster.render(); },
    setConnectionState: function (online, label) {
      if (sessionRoster) sessionRoster.setConnectionState(online, label);
    }
  });
  composer = window.VoloComposer.create({
    emitClawd: emitClawd,
    getSelectedSession: function () { return selectedSession; },
    isSending: function () { return chat.isSending(); },
    onSubmit: function () { sendMessage(); }
  });
  carrierView = window.VoloCarrier.create({ composer: composer, usage: usage });
  sessionRoster = window.VoloSessions.create({
    chat: chat,
    getSelectedSession: function () { return selectedSession; },
    onRestore: restoreSelectedSession,
    onSelect: selectSession
  });
  document.addEventListener("volo:carrier-change", function (event) {
    var carrier = event.detail && event.detail.carrier === "api"
      ? "gateway"
      : "claude_code";
    sessionRoster.selectCarrier(carrier);
  });

  function emitClawd(state, phrase, options) {
    document.dispatchEvent(
      new CustomEvent("clawd:action", {
        detail: Object.assign({ state: state, phrase: phrase || "" }, options || {})
      })
    );
  }

  function currentCarrier() {
    return sessionRoster.isGatewaySession(selectedSession) ? "gateway" : "claude_code";
  }

  async function restoreSelectedSession(sessionId) {
    selectedSession = sessionId;
    window.CCC.setSelectedSession(sessionId);
    composer.selectSession(sessionId);
    carrierView.update(currentCarrier());
    await chat.loadHistory(sessionId);
  }

  async function selectSession(sessionId) {
    if (!sessionId) {
      return;
    }
    selectedSession = sessionId;
    window.CCC.setSelectedSession(sessionId);
    composer.selectSession(sessionId);
    carrierView.update(currentCarrier());
    sessionRoster.render();
    await chat.selectSession(sessionId);
    drawer.setOpen(false, false);
    composer.focus();
  }

  async function sendMessage(explicitValue) {
    var attempt = composer.prepareSend(explicitValue);
    if (!attempt) return false;
    var sessionId = attempt.sessionId;
    var carrier = currentCarrier();
    emitClawd("beacon", carrier === "gateway" ? "去找共同记忆" : "发到 " + sessionId, {
      duration: 900,
      priority: 3
    });
    var sent = await chat.send(sessionId, carrier, attempt.value);
    composer.finishSend(attempt, sent);
    return sent;
  }

  window.VoloCallBridge = {
    getSelectedSession: function () { return selectedSession; },
    getCarrier: function () { return currentCarrier(); },
    isSending: function () { return Boolean(chat && chat.isSending()); },
    selectSession: function (sessionId) { return selectSession(sessionId); },
    sendMessage: function (text) { return sendMessage(text); }
  };

  composer.bind();
  drawer.bind();
  sessionRoster.bind();
  chat.bind();
  voice.bind();
  music.bind();
  usage.bind();
  composer.resize();
  chat.render(false);
  sessionRoster.load();
})();
