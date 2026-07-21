(function () {
  "use strict";

  function create(options) {
    options = options || {};
    var pill = document.getElementById("voloCarrierPill");

    function update(carrier) {
      var gateway = carrier === "gateway";
      pill.textContent = gateway ? "Volo · 陪我聊聊" : "Volo · Claude Code";
      pill.classList.toggle("is-gateway", gateway);
      options.composer.setPlaceholder(gateway ? "和 Volo 聊聊..." : "Reply to Volo...");
      options.usage.updateCarrier(gateway);
    }

    return { update: update };
  }

  window.VoloCarrier = { create: create };
})();
