(function () {
  "use strict";

  function create(options) {
    options = options || {};
    var pill = document.getElementById("voloCarrierPill");
    var badge = document.getElementById("voloCarrierBadge");

    function update(carrier) {
      var gateway = carrier === "gateway";
      pill.textContent = gateway ? "Volo · 陪我聊聊" : "当前窗口";
      pill.classList.toggle("is-gateway", gateway);
      if (badge) badge.textContent = gateway ? "API" : "当前窗口";
      options.composer.setPlaceholder(gateway ? "和 Volo 聊聊..." : "发送到当前窗口…");
      options.usage.updateCarrier(gateway);
      document.dispatchEvent(
        new CustomEvent("volo:carrier-selected", {
          detail: { carrier: gateway ? "api" : "claude" }
        })
      );
    }

    return { update: update };
  }

  window.VoloCarrier = { create: create };
})();
