(function () {
  "use strict";

  var STORAGE_KEY = "island-chat.together-avatars.v1";
  var MAX_AVATAR_BYTES = 4 * 1024 * 1024;
  var openButton = document.getElementById("voloTogetherButton");
  var sheet = document.getElementById("voloTogetherSheet");
  var closeButton = document.getElementById("voloTogetherClose");
  var backdrop = document.getElementById("voloTogetherBackdrop");
  var startButton = document.getElementById("voloTogetherStart");
  var liveBadge = document.getElementById("voloTogetherLive");
  var friendState = document.getElementById("voloFriendState");
  var note = document.getElementById("voloTogetherNote");
  var userAvatarInput = document.getElementById("voloUserAvatarInput");
  var friendAvatarInput = document.getElementById("voloFriendAvatarInput");
  var userAvatar = document.getElementById("voloUserAvatar");
  var friendAvatar = document.getElementById("voloFriendAvatar");
  var audioInput = document.getElementById("voloTogetherAudio");
  var audio = document.getElementById("voloTogetherPlayer");
  var playButton = document.getElementById("voloTogetherPlay");
  var seek = document.getElementById("voloTogetherSeek");
  var currentTime = document.getElementById("voloTogetherCurrent");
  var duration = document.getElementById("voloTogetherDuration");
  var trackTitle = document.getElementById("voloTogetherTrackTitle");
  var trackArtist = document.getElementById("voloTogetherTrackArtist");
  var vinylButton = document.getElementById("voloVinylButton");
  var lyricsPanel = document.getElementById("voloLyricsPanel");
  var lyricsBack = document.getElementById("voloLyricsBack");
  var lyricsTitle = document.getElementById("voloLyricsTitle");
  var lyricsLines = document.getElementById("voloLyricsLines");
  var lyricsEmpty = document.getElementById("voloLyricsEmpty");
  var lyricsInput = document.getElementById("voloLyricsInput");
  var error = document.getElementById("voloTogetherError");
  var audioUrl = "";
  var roomActive = false;
  var lastFocused = null;
  var lyricItems = [];
  var activeLyricIndex = -1;

  if (!openButton || !sheet || !audio) {
    return;
  }

  function formatTime(value) {
    var seconds = Math.max(0, Math.floor(Number(value) || 0));
    return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
  }

  function setError(message) {
    error.textContent = message || "";
    error.hidden = !message;
  }

  function setAvatar(element, dataUrl) {
    if (!dataUrl) {
      element.classList.remove("has-photo");
      element.style.removeProperty("background-image");
      return;
    }
    element.style.backgroundImage = 'url("' + dataUrl.replace(/"/g, "%22") + '")';
    element.classList.add("has-photo");
  }

  function loadAvatars() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      setAvatar(userAvatar, saved.user || "");
      setAvatar(friendAvatar, saved.friend || "");
    } catch (storageError) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  function saveAvatar(kind, dataUrl) {
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      saved[kind] = dataUrl;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      setError("");
    } catch (storageError) {
      setError("头像已经显示，但浏览器空间不足，刷新后可能不会保留。");
    }
  }

  function handleAvatar(input, element, kind) {
    var file = input.files && input.files[0];
    if (!file) {
      return;
    }
    if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.type)) {
      setError("请选择 JPG、PNG、WebP 或 GIF 图片。");
      input.value = "";
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError("头像不能超过 4 MB。");
      input.value = "";
      return;
    }
    var reader = new FileReader();
    reader.addEventListener("load", function () {
      var dataUrl = String(reader.result || "");
      setAvatar(element, dataUrl);
      saveAvatar(kind, dataUrl);
    });
    reader.addEventListener("error", function () {
      setError("这张图片没有读取成功，请换一张试试。");
    });
    reader.readAsDataURL(file);
    input.value = "";
  }

  function openSheet() {
    lastFocused = document.activeElement;
    sheet.hidden = false;
    document.body.classList.add("volo-together-open");
    sheet.classList.remove("is-opening");
    void sheet.offsetWidth;
    sheet.classList.add("is-opening");
    closeButton.focus();
  }

  function closeSheet() {
    closeLyrics();
    sheet.hidden = true;
    sheet.classList.remove("is-opening");
    document.body.classList.remove("volo-together-open");
    if (lastFocused && typeof lastFocused.focus === "function") {
      lastFocused.focus();
    }
  }

  function updateRoom() {
    liveBadge.classList.toggle("is-live", roomActive);
    liveBadge.querySelector("span").textContent = roomActive ? "正在一起听" : "等待开始";
    friendState.textContent = roomActive ? "已加入 · 同步中" : "等待加入";
    note.textContent = roomActive
      ? audio.src
        ? "Volo 正和你听到同一个位置"
        : "Volo 已经来了，选一首歌吧"
      : "两个人，同一首歌，同一个进度";
    startButton.textContent = roomActive ? "结束一起听" : "邀请 Volo 一起听";
    startButton.classList.toggle("is-active", roomActive);
  }

  function updatePlayback() {
    var isPlaying = !audio.paused && !audio.ended;
    playButton.classList.toggle("is-playing", isPlaying);
    playButton.setAttribute("aria-label", isPlaying ? "暂停" : "播放");
    sheet.classList.toggle("is-playing", isPlaying);
  }

  function updateProgress() {
    var total = Number.isFinite(audio.duration) ? audio.duration : 0;
    var position = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    var value = total ? Math.round((position / total) * 1000) : 0;
    seek.value = String(value);
    seek.style.setProperty("--together-progress", value / 10 + "%");
    currentTime.textContent = formatTime(position);
    duration.textContent = formatTime(total);
    updateActiveLyric(position);
  }

  function cleanTrackName(name) {
    return name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "未命名音乐";
  }

  function closeLyrics() {
    if (lyricsPanel) {
      lyricsPanel.hidden = true;
    }
  }

  function openLyrics() {
    lyricsTitle.textContent = trackTitle.textContent || "歌词";
    lyricsPanel.hidden = false;
    requestAnimationFrame(function () {
      var active = lyricsLines.querySelector(".volo-lyric-line.is-active");
      if (active) {
        active.scrollIntoView({ block: "center" });
      }
    });
  }

  function resetLyrics() {
    lyricItems = [];
    activeLyricIndex = -1;
    lyricsLines.classList.remove("has-lyrics");
    lyricsLines.replaceChildren(lyricsEmpty);
  }

  function parseLyrics(text) {
    var parsed = [];
    String(text || "").split(/\r?\n/).forEach(function (sourceLine) {
      var line = sourceLine.trim();
      if (!line || /^\[(ar|al|ti|by|offset):/i.test(line)) {
        return;
      }
      var timestamps = [];
      var matcher = /\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]/g;
      var match;
      while ((match = matcher.exec(line))) {
        timestamps.push(Number(match[1]) * 60 + Number(match[2]));
      }
      var content = line.replace(/\[[^\]]+\]/g, "").trim();
      if (!content) {
        return;
      }
      if (timestamps.length) {
        timestamps.forEach(function (time) {
          parsed.push({ time: time, text: content });
        });
      } else {
        parsed.push({ time: null, text: content });
      }
    });
    if (parsed.some(function (item) { return item.time !== null; })) {
      parsed = parsed
        .filter(function (item) { return item.time !== null; })
        .sort(function (first, second) { return first.time - second.time; });
    }
    return parsed;
  }

  function renderLyrics() {
    lyricsLines.classList.toggle("has-lyrics", lyricItems.length > 0);
    if (!lyricItems.length) {
      lyricsLines.replaceChildren(lyricsEmpty);
      return;
    }
    var fragment = document.createDocumentFragment();
    lyricItems.forEach(function (item, index) {
      var line = item.time === null
        ? document.createElement("p")
        : document.createElement("button");
      line.className = "volo-lyric-line";
      line.textContent = item.text;
      line.dataset.lyricIndex = String(index);
      if (item.time !== null) {
        line.type = "button";
        line.dataset.time = String(item.time);
      }
      fragment.appendChild(line);
    });
    lyricsLines.replaceChildren(fragment);
    updateActiveLyric(audio.currentTime || 0);
  }

  function updateActiveLyric(position) {
    if (!lyricItems.length || lyricItems[0].time === null) {
      return;
    }
    var nextIndex = -1;
    for (var index = 0; index < lyricItems.length; index += 1) {
      if (lyricItems[index].time <= position + 0.08) {
        nextIndex = index;
      } else {
        break;
      }
    }
    if (nextIndex === activeLyricIndex) {
      return;
    }
    activeLyricIndex = nextIndex;
    lyricsLines.querySelectorAll(".volo-lyric-line").forEach(function (line, index) {
      line.classList.toggle("is-active", index === activeLyricIndex);
    });
    var active = lyricsLines.querySelector(".volo-lyric-line.is-active");
    if (active && !lyricsPanel.hidden) {
      active.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function selectLyrics() {
    var file = lyricsInput.files && lyricsInput.files[0];
    if (!file) {
      return;
    }
    if (!/\.(lrc|txt)$/i.test(file.name) && file.type !== "text/plain") {
      setError("请选择 LRC 或 TXT 歌词文件。");
      lyricsInput.value = "";
      return;
    }
    var reader = new FileReader();
    reader.addEventListener("load", function () {
      lyricItems = parseLyrics(reader.result);
      activeLyricIndex = -1;
      renderLyrics();
      setError(lyricItems.length ? "" : "这个文件里没有读取到歌词。");
    });
    reader.addEventListener("error", function () {
      setError("歌词没有读取成功，请换一个文件试试。");
    });
    reader.readAsText(file);
    lyricsInput.value = "";
  }

  function selectAudio() {
    var file = audioInput.files && audioInput.files[0];
    if (!file) {
      return;
    }
    if (!file.type.startsWith("audio/")) {
      setError("请选择音频文件。");
      audioInput.value = "";
      return;
    }
    audio.pause();
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    audioUrl = URL.createObjectURL(file);
    audio.src = audioUrl;
    trackTitle.textContent = cleanTrackName(file.name);
    trackArtist.textContent = roomActive ? "你与 Volo · 本地音乐" : "本地音乐 · 等待 Volo 加入";
    playButton.disabled = false;
    setError("");
    lyricsTitle.textContent = trackTitle.textContent;
    resetLyrics();
    updateProgress();
    updateRoom();
    audioInput.value = "";
  }

  openButton.addEventListener("click", openSheet);
  closeButton.addEventListener("click", closeSheet);
  backdrop.addEventListener("click", closeSheet);

  startButton.addEventListener("click", function () {
    roomActive = !roomActive;
    updateRoom();
    trackArtist.textContent = audio.src
      ? roomActive
        ? "你与 Volo · 本地音乐"
        : "本地音乐 · 等待 Volo 加入"
      : "音乐只在这台设备播放";
  });

  userAvatarInput.addEventListener("change", function () {
    handleAvatar(userAvatarInput, userAvatar, "user");
  });

  friendAvatarInput.addEventListener("change", function () {
    handleAvatar(friendAvatarInput, friendAvatar, "friend");
  });

  audioInput.addEventListener("change", selectAudio);
  vinylButton.addEventListener("click", openLyrics);
  lyricsBack.addEventListener("click", closeLyrics);
  lyricsInput.addEventListener("change", selectLyrics);
  lyricsLines.addEventListener("click", function (event) {
    var line = event.target.closest(".volo-lyric-line[data-time]");
    if (!line || !audio.src) {
      return;
    }
    audio.currentTime = Number(line.dataset.time) || 0;
    updateProgress();
  });

  playButton.addEventListener("click", function () {
    if (!audio.src) {
      audioInput.click();
      return;
    }
    if (audio.paused) {
      audio.play().catch(function () {
        setError("浏览器暂时无法播放这个文件，请换一种音频格式。");
      });
    } else {
      audio.pause();
    }
  });

  seek.addEventListener("input", function () {
    if (!Number.isFinite(audio.duration) || !audio.duration) {
      return;
    }
    audio.currentTime = (Number(seek.value) / 1000) * audio.duration;
    updateProgress();
  });

  audio.addEventListener("loadedmetadata", updateProgress);
  audio.addEventListener("durationchange", updateProgress);
  audio.addEventListener("timeupdate", updateProgress);
  audio.addEventListener("play", updatePlayback);
  audio.addEventListener("pause", updatePlayback);
  audio.addEventListener("ended", updatePlayback);
  audio.addEventListener("error", function () {
    setError("这个音频没有加载成功，请换一首试试。");
    playButton.disabled = true;
    updatePlayback();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !lyricsPanel.hidden) {
      closeLyrics();
      return;
    }
    if (event.key === "Escape" && !sheet.hidden) {
      closeSheet();
    }
  });

  window.addEventListener("beforeunload", function () {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
  });

  loadAvatars();
  updateRoom();
  updatePlayback();
  updateProgress();
  resetLyrics();
})();

