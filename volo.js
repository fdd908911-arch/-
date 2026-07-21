(function () {
  "use strict";

  var drawer = document.getElementById("voloDrawer");
  var drawerButton = document.getElementById("voloDrawerButton");
  var drawerClose = document.getElementById("voloDrawerClose");
  var drawerScrim = document.getElementById("voloDrawerScrim");
  var newChatButton = document.getElementById("voloNewChatButton");
  var carrierPill = document.getElementById("voloCarrierPill");

  var selectedSession = window.CCC.getSelectedSession();
  if (!window.VoloChat || !window.VoloComposer || !window.VoloMusic || !window.VoloSessions || !window.VoloVoice || !window.VoloUsage) {
    throw new Error("Volo feature modules must load before volo.js");
  }
  var chat = null;
  var composer = null;
  var music = null;
  var sessionRoster = null;
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
  sessionRoster = window.VoloSessions.create({
    chat: chat,
    getSelectedSession: function () { return selectedSession; },
    onRestore: restoreSelectedSession,
    onSelect: selectSession
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

  function updateCarrierPresentation() {
    if (!carrierPill) return;
    var gateway = currentCarrier() === "gateway";
    carrierPill.textContent = gateway ? "Volo · 陪我聊聊" : "Volo · Claude Code";
    carrierPill.classList.toggle("is-gateway", gateway);
    composer.setPlaceholder(gateway ? "和 Volo 聊聊..." : "Reply to Volo...");
    usage.updateCarrier(gateway);
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

  async function restoreSelectedSession(sessionId) {
    selectedSession = sessionId;
    window.CCC.setSelectedSession(sessionId);
    composer.selectSession(sessionId);
    updateCarrierPresentation();
    await chat.loadHistory(sessionId);
  }

  async function selectSession(sessionId) {
    if (!sessionId) {
      return;
    }
    selectedSession = sessionId;
    window.CCC.setSelectedSession(sessionId);
    composer.selectSession(sessionId);
    updateCarrierPresentation();
    sessionRoster.render();
    await chat.selectSession(sessionId);
    setDrawerOpen(false, false);
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

  composer.bind();
  sessionRoster.bind();
  chat.bind();
  voice.bind();
  music.bind();
  usage.bind();
  window.addEventListener("hashchange", function () {
    if (window.location.hash !== "#volo") {
      setDrawerOpen(false, false);
    }
  });

  composer.resize();
  chat.render(false);
  sessionRoster.load();
})();
