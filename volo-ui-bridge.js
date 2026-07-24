(function () {
  "use strict";

  var drawerButton = document.getElementById("voloDrawerButton");
  var personButton = document.getElementById("voloChatPerson");
  var carrierPill = document.getElementById("voloCarrierPill");
  var presence = document.getElementById("voloPresence");
  var emojiButton = document.getElementById("voloEmojiButton");
  var emojiPanel = document.getElementById("voloEmojiPanel");
  var input = document.getElementById("voloInput");

  function openHistory() {
    if (drawerButton && drawerButton.getAttribute("aria-expanded") !== "true") {
      drawerButton.click();
    }
  }

  function closeEmoji() {
    if (!emojiPanel || !emojiButton) return;
    emojiPanel.hidden = true;
    emojiButton.setAttribute("aria-expanded", "false");
  }

  if (personButton) personButton.addEventListener("click", openHistory);
  if (carrierPill) carrierPill.addEventListener("click", openHistory);

  if (emojiButton && emojiPanel && input) {
    emojiButton.addEventListener("click", function () {
      emojiPanel.hidden = !emojiPanel.hidden;
      emojiButton.setAttribute("aria-expanded", String(!emojiPanel.hidden));
    });
    emojiPanel.addEventListener("click", function (event) {
      var option = event.target.closest("button");
      if (!option) return;
      var start = input.selectionStart == null ? input.value.length : input.selectionStart;
      var end = input.selectionEnd == null ? start : input.selectionEnd;
      input.setRangeText(option.textContent, start, end, "end");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      closeEmoji();
      input.focus();
    });
    document.addEventListener("click", function (event) {
      if (!emojiPanel.hidden && !emojiPanel.contains(event.target) && !emojiButton.contains(event.target)) {
        closeEmoji();
      }
    });
  }

  document.addEventListener("ccc:session-selected", function (event) {
    var session = event.detail && event.detail.session;
    if (presence) presence.textContent = session ? session + " · 在线" : "在线";
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && emojiPanel && !emojiPanel.hidden) {
      closeEmoji();
      emojiButton.focus();
    }
  });
})();
