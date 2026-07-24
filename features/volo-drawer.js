(function () {
  "use strict";

  function create() {
    var drawer = document.getElementById("voloDrawer");
    var button = document.getElementById("voloDrawerButton");
    var closeButton = document.getElementById("voloDrawerClose");
    var scrim = document.getElementById("voloDrawerScrim");
    var primaryAction = document.getElementById("voloNewChatButton");
    var bound = false;

    function setOpen(open, restoreFocus) {
      drawer.classList.toggle("is-open", open);
      scrim.classList.toggle("is-open", open);
      drawer.style.transform = open ? "translateX(0)" : "";
      drawer.style.pointerEvents = open ? "auto" : "";
      scrim.style.pointerEvents = open ? "auto" : "";
      scrim.style.opacity = open ? "1" : "";
      drawer.setAttribute("aria-hidden", String(!open));
      drawer.toggleAttribute("inert", !open);
      button.setAttribute("aria-expanded", String(open));
      if (open) {
        window.setTimeout(function () { primaryAction.focus(); }, 80);
      } else if (restoreFocus) {
        button.focus();
      }
    }

    function bind() {
      if (bound) return;
      bound = true;
      button.onclick = function () {
        setOpen(button.getAttribute("aria-expanded") !== "true", false);
      };
      closeButton.onclick = function () { setOpen(false, true); };
      scrim.onclick = function () { setOpen(false, true); };
      window.addEventListener("hashchange", function () {
        if (window.location.hash !== "#volo") setOpen(false, false);
      });
    }

    return {
      bind: bind,
      setOpen: setOpen
    };
  }

  window.VoloDrawer = { create: create };
})();
