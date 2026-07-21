(function () {
  "use strict";

  var DRAFT_KEY = "island-chat.ccc-drafts.v1";

  function create(options) {
    options = options || {};
    var form = document.getElementById("voloComposer");
    var input = document.getElementById("voloInput");
    var sendButton = document.getElementById("voloSendButton");
    var drafts = readDrafts();
    var currentSession = "";
    var bound = false;

    function readDrafts() {
      try {
        var value = JSON.parse(localStorage.getItem(DRAFT_KEY));
        return value && typeof value === "object" ? value : {};
      } catch (error) {
        return {};
      }
    }

    function writeDrafts() {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
      } catch (error) {
        void error;
      }
    }

    function selectedSession() {
      return typeof options.getSelectedSession === "function" ? options.getSelectedSession() : "";
    }

    function isSending() {
      return typeof options.isSending === "function" && options.isSending();
    }

    function resize() {
      input.style.height = "auto";
      var height = Math.min(input.scrollHeight, 120);
      input.style.height = Math.max(height, 28) + "px";
      input.style.overflowY = input.scrollHeight > 120 ? "auto" : "hidden";
      sendButton.disabled = isSending() || !selectedSession() || input.value.trim().length === 0;
    }

    function selectSession(sessionId) {
      if (currentSession) drafts[currentSession] = input.value;
      currentSession = sessionId || "";
      input.value = currentSession ? drafts[currentSession] || "" : "";
      writeDrafts();
      resize();
    }

    function prepareSend(explicitValue) {
      var sessionId = selectedSession();
      var fromComposer = typeof explicitValue !== "string";
      var value = String(fromComposer ? input.value : explicitValue || "").trim();
      if (!sessionId || !value || isSending()) return null;
      var attempt = {
        fromComposer: fromComposer,
        sessionId: sessionId,
        value: value
      };
      if (fromComposer) {
        input.value = "";
        drafts[sessionId] = "";
        writeDrafts();
      }
      resize();
      return attempt;
    }

    function finishSend(attempt, sent) {
      if (!attempt) return;
      if (!sent && attempt.fromComposer) {
        var liveDraft = String(drafts[attempt.sessionId] || "").trim();
        var restored = liveDraft ? attempt.value + "\n" + liveDraft : attempt.value;
        drafts[attempt.sessionId] = restored;
        writeDrafts();
        if (currentSession === attempt.sessionId) input.value = restored;
      }
      resize();
    }

    function bind() {
      if (bound) return;
      bound = true;
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        if (typeof options.onSubmit === "function") options.onSubmit();
      });
      input.addEventListener("input", function () {
        if (currentSession) {
          drafts[currentSession] = input.value;
          writeDrafts();
        }
        resize();
        if (input.value.trim() && typeof options.emitClawd === "function") {
          options.emitClawd("typing", "", { duration: 900, priority: 1 });
        }
      });
      input.addEventListener("keydown", function (event) {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
          event.preventDefault();
          if (typeof options.onSubmit === "function") options.onSubmit();
        }
      });
    }

    return {
      bind: bind,
      finishSend: finishSend,
      focus: function () { input.focus(); },
      prepareSend: prepareSend,
      resize: resize,
      selectSession: selectSession,
      setPlaceholder: function (value) { input.placeholder = value; }
    };
  }

  window.VoloComposer = { create: create };
})();
