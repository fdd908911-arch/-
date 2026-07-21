(function () {
  "use strict";

  var DRAFT_KEY = "island-chat.ccc-drafts.v1";
  var composer = document.getElementById("voloComposer");
  var input = document.getElementById("voloInput");
  var sendButton = document.getElementById("voloSendButton");
  var drawer = document.getElementById("voloDrawer");
  var drawerButton = document.getElementById("voloDrawerButton");
  var drawerClose = document.getElementById("voloDrawerClose");
  var drawerScrim = document.getElementById("voloDrawerScrim");
  var newChatButton = document.getElementById("voloNewChatButton");
  var carrierPill = document.getElementById("voloCarrierPill");

  var selectedSession = window.CCC.getSelectedSession();
  var drafts = readDrafts();
  if (!window.VoloChat || !window.VoloMusic || !window.VoloSessions || !window.VoloVoice || !window.VoloUsage) {
    throw new Error("Volo feature modules must load before volo.js");
  }
  var chat = null;
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
    onSendingChange: resizeInput,
    renderSessions: function () { if (sessionRoster) sessionRoster.render(); },
    setConnectionState: function (online, label) {
      if (sessionRoster) sessionRoster.setConnectionState(online, label);
    }
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

  function currentCarrier() {
    return sessionRoster.isGatewaySession(selectedSession) ? "gateway" : "claude_code";
  }

  function updateCarrierPresentation() {
    if (!carrierPill) return;
    var gateway = currentCarrier() === "gateway";
    carrierPill.textContent = gateway ? "Volo · 陪我聊聊" : "Volo · Claude Code";
    carrierPill.classList.toggle("is-gateway", gateway);
    input.placeholder = gateway ? "和 Volo 聊聊..." : "Reply to Volo...";
    usage.updateCarrier(gateway);
  }


  function resizeInput() {
    input.style.height = "auto";
    var height = Math.min(input.scrollHeight, 120);
    input.style.height = Math.max(height, 28) + "px";
    input.style.overflowY = input.scrollHeight > 120 ? "auto" : "hidden";
    sendButton.disabled = chat.isSending() || !selectedSession || input.value.trim().length === 0;
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
    input.value = drafts[sessionId] || "";
    updateCarrierPresentation();
    resizeInput();
    await chat.loadHistory(sessionId);
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
    window.CCC.setSelectedSession(sessionId);
    input.value = drafts[sessionId] || "";
    updateCarrierPresentation();
    resizeInput();
    sessionRoster.render();
    await chat.selectSession(sessionId);
    setDrawerOpen(false, false);
    input.focus();
  }

  async function sendMessage(explicitValue) {
    var sessionId = selectedSession;
    var carrier = currentCarrier();
    var fromComposer = typeof explicitValue !== "string";
    var value = (fromComposer ? input.value : explicitValue).trim();
    if (!sessionId || !value || chat.isSending()) {
      return false;
    }
    if (fromComposer) {
      input.value = "";
      drafts[sessionId] = "";
      writeDrafts();
    }
    resizeInput();
    emitClawd("beacon", carrier === "gateway" ? "去找共同记忆" : "发到 " + sessionId, {
      duration: 900,
      priority: 3
    });
    var sent = await chat.send(sessionId, carrier, value);
    if (!sent && fromComposer) {
      input.value = value;
      drafts[sessionId] = value;
      writeDrafts();
    }
    resizeInput();
    return sent;
  }

  composer.addEventListener("submit", function (event) {
    event.preventDefault();
    sendMessage();
  });
  sessionRoster.bind();
  chat.bind();
  voice.bind();
  music.bind();
  usage.bind();
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
  window.addEventListener("hashchange", function () {
    if (window.location.hash !== "#volo") {
      setDrawerOpen(false, false);
    }
  });

  resizeInput();
  chat.render(false);
  sessionRoster.load();
})();
