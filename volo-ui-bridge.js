(function () {
  "use strict";

  var drawerButton = document.getElementById("voloDrawerButton");
  var personButton = document.getElementById("voloChatPerson");
  var carrierPill = document.getElementById("voloCarrierPill");
  var presence = document.getElementById("voloPresence");

  function openHistory() {
    if (drawerButton && drawerButton.getAttribute("aria-expanded") !== "true") {
      drawerButton.click();
    }
  }

  if (personButton) personButton.addEventListener("click", openHistory);
  if (carrierPill) carrierPill.addEventListener("click", openHistory);


  document.addEventListener("ccc:session-selected", function (event) {
    var session = event.detail && event.detail.session;
    if (presence) presence.textContent = session ? session + " · 在线" : "在线";
  });
})();
