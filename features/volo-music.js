(function () {
  "use strict";

  function create(options) {
    options = options || {};
    if (!window.VoloMediaStatus) {
      throw new Error("VoloMediaStatus must load before volo-music.js");
    }
    var musicButton = document.getElementById("voloMusicButton");
    var musicInput = document.getElementById("voloMusicInput");
    var nowPlaying = document.getElementById("voloNowPlaying");
    var nowPlayingMain = document.getElementById("voloNowPlayingMain");
    var nowPlayingCover = document.getElementById("voloNowPlayingCover");
    var nowPlayingTitle = document.getElementById("voloNowPlayingTitle");
    var nowPlayingArtist = document.getElementById("voloNowPlayingArtist");
    var nowPlayingToggle = document.getElementById("voloNowPlayingToggle");
    var nowPlayingSeek = document.getElementById("voloNowPlayingSeek");
    var nowPlayingCurrent = document.getElementById("voloNowPlayingCurrent");
    var nowPlayingDuration = document.getElementById("voloNowPlayingDuration");
    var lyricsView = document.getElementById("voloLyricsView");
    var lyricsClose = document.getElementById("voloLyricsClose");
    var lyricsCover = document.getElementById("voloLyricsCover");
    var lyricsTitle = document.getElementById("voloLyricsTitle");
    var lyricsArtist = document.getElementById("voloLyricsArtist");
    var lyricsLines = document.getElementById("voloLyricsLines");
    var lyricsToggle = document.getElementById("voloLyricsToggle");
    var lyricsSeek = document.getElementById("voloLyricsSeek");
    var lyricsCurrent = document.getElementById("voloLyricsCurrent");
    var lyricsDuration = document.getElementById("voloLyricsDuration");
    var voloView = document.getElementById("voloView");

    var busy = false;
    var activeAudio = null;
    var activeButton = null;
    var activeId = "";
    var activeMusic = null;
    var lastStateAt = 0;
    var analysisById = Object.create(null);
    var lyricsById = Object.create(null);
    var selectedLyricsMusic = null;
    var selectedLyricLines = [];
    var selectedLyricIndex = -1;
    var seekPreview = null;
    var toastTimer = 0;
    var bound = false;

    function emitClawd(state, phrase, detail) {
      if (typeof options.emitClawd === "function") {
        options.emitClawd(state, phrase, detail);
      }
    }

    function notify(message) {
      if (typeof options.notify === "function") {
        options.notify(message);
        return;
      }
      var toast = document.getElementById("toast");
      var toastText = document.getElementById("toastText");
      if (!toast || !toastText) return;
      window.clearTimeout(toastTimer);
      toastText.textContent = message;
      toast.hidden = false;
      requestAnimationFrame(function () { toast.classList.add("visible"); });
      toastTimer = window.setTimeout(function () {
        toast.classList.remove("visible");
        window.setTimeout(function () {
          if (!toast.classList.contains("visible")) toast.hidden = true;
        }, 190);
      }, 2400);
    }

    function setStatus(message, state, hideAfter) {
      window.VoloMediaStatus.set(message, state, hideAfter, "music");
    }

    function wait(milliseconds) {
      return new Promise(function (resolve) { window.setTimeout(resolve, milliseconds); });
    }

    function formatDuration(seconds) {
      var total = Math.max(0, Math.round(Number(seconds) || 0));
      var minutes = Math.floor(total / 60);
      var remainder = total % 60;
      return minutes ? minutes + "分" + String(remainder).padStart(2, "0") + "秒" : remainder + "秒";
    }

    function formatAnalysisMessage(job) {
      var result = job.result || {};
      var affect = result.affect || {};
      var modeNames = { major: "大调", minor: "小调" };
      var lines = [
        "[音乐听感]",
        "曲目：" + (job.filename || result.source || "未命名音频"),
        "结构：" + (result.total_notes || 0) + " 个音符 · " + formatDuration(result.duration_sec)
      ];
      if (result.bpm !== undefined || result.key) {
        lines.push(
          "节奏调性：" +
          (result.bpm !== undefined ? result.bpm + " BPM" : "BPM 未知") +
          (result.key ? " · " + result.key + " " + (modeNames[result.mode] || result.mode || "") : "")
        );
      }
      if (affect.valence !== undefined && affect.arousal !== undefined) {
        lines.push("听感轴：valence " + affect.valence + " · arousal " + affect.arousal);
      }
      if (Array.isArray(result.segments) && result.segments.length) {
        lines.push("六段能量：" + result.segments.map(function (segment) {
          return Math.round((Number(segment.avg_energy) || 0) * 100);
        }).join(" → "));
      }
      if (result.spectral_centroid_hz !== undefined) {
        lines.push(
          "频谱轮廓：质心 " + Math.round(result.spectral_centroid_hz) + " Hz" +
          (result.spectral_bandwidth_hz !== undefined
            ? " · 带宽 " + Math.round(result.spectral_bandwidth_hz) + " Hz"
            : "")
        );
      }
      var pitchTimeline = result.pitch_timeline || {};
      if (pitchTimeline.text) {
        lines.push(
          "音高时间线（约每 " +
          (Number(pitchTimeline.resolution_sec) || 0).toFixed(2) +
          " 秒一个复调中心）：",
          String(pitchTimeline.text)
        );
        if (pitchTimeline.caveat) lines.push("说明：" + String(pitchTimeline.caveat));
      }
      if (result.spectrogram_url) lines.push("Mel 频谱图：已生成");
      if (result.analysis) lines.push("", result.analysis);
      return lines.join("\n");
    }

    async function analysisRequest(path, settings) {
      var config = window.CCC.getConfig();
      settings = settings || {};
      settings.headers = Object.assign({}, settings.headers || {}, { "X-Auth-Token": config.token });
      settings.cache = "no-store";
      var response = await fetch("/api/music" + path, settings);
      var payload = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        throw new Error(payload.detail || payload.error || "HTTP " + response.status);
      }
      return payload;
    }

    async function pollAnalysisJob(jobId) {
      var deadline = Date.now() + 15 * 60 * 1000;
      while (Date.now() < deadline) {
        var job = await analysisRequest("/v1/jobs/" + encodeURIComponent(jobId));
        if (job.status === "complete") return job;
        if (job.status === "failed") throw new Error(job.error || "音乐分析失败");
        setStatus(job.status === "queued" ? "音乐已排队，Volo 正在等…" : "Volo 正在听音乐的形状…", "processing");
        await wait(1800);
      }
      throw new Error("音乐分析超时，请稍后重试");
    }

    async function analyzeFile(file) {
      if (!file) return;
      if (file.size > 30 * 1024 * 1024) {
        setStatus("歌曲不能超过 30MB", "error", 4000);
        return;
      }
      busy = true;
      musicButton.disabled = true;
      var form = new FormData();
      form.append("file", file, file.name || "music.mp3");
      setStatus("正在把音乐送到另一副耳朵…", "processing");
      emitClawd("conducting", "Volo 开始听歌", { duration: 1600, priority: 3 });
      try {
        var created = await analysisRequest("/v1/jobs", { method: "POST", body: form });
        var job = await pollAnalysisJob(created.id);
        setStatus("听完了，正在告诉 Volo…", "processing");
        var sent = await options.sendMessage(formatAnalysisMessage(job));
        setStatus(sent ? "Volo 听完这首了 ♡" : "听完了，但没有发出去", sent ? "" : "error", 4200);
        if (sent) emitClawd("grooving", "这首歌有形状了", { duration: 1800, priority: 3 });
      } catch (error) {
        var message = error && error.message ? error.message : "音乐分析失败";
        if (message.indexOf("401") !== -1 || message.indexOf("Unauthorized") !== -1) {
          message = "访问 Token 不正确，请重新配置服务器";
        }
        setStatus(message, "error", 4800);
        emitClawd("confused", "音乐没有听清", { duration: 1800, priority: 4 });
      } finally {
        busy = false;
        musicButton.disabled = false;
        musicButton.classList.remove("is-processing");
        musicInput.value = "";
      }
    }

    function parseMarker(value) {
      var text = String(value || "");
      var match = text.match(/\[music:(\d+):([^:\]]*):([^:\]]*):([^\]]*)\]([^\n]*)/);
      if (!match) return { text: text, music: null };
      return {
        text: text.replace(match[0], "").trim(),
        music: {
          id: match[1],
          title: match[2].trim() || "未命名歌曲",
          artist: match[3].trim() || "未知歌手",
          cover: /^https:\/\//i.test(match[4].trim()) ? match[4].trim() : "",
          note: match[5].trim()
        }
      };
    }

    function structuredMusic(message) {
      var metadata = message && message.metadata || {};
      var value = message && message.music || metadata.music;
      if (!value || typeof value !== "object" || !value.id || !value.title) return null;
      return {
        id: String(value.id),
        title: String(value.title),
        artist: String(value.artist || "未知歌手"),
        cover: /^https:\/\//i.test(String(value.cover || "")) ? String(value.cover) : "",
        note: String(value.note || "")
      };
    }

    function contentForMessage(message) {
      var structured = structuredMusic(message);
      return structured
        ? { text: String(message.text || "").trim(), music: structured }
        : parseMarker(message.text);
    }

    function analysisState(music) {
      var songId = String(music.id);
      if (!analysisById[songId]) {
        analysisById[songId] = {
          music: music,
          status: "missing",
          phase: "",
          result: null,
          error: "",
          open: false,
          requesting: false,
          spectrumLoading: false,
          spectrumUrl: "",
          pollTimer: 0
        };
      } else {
        analysisById[songId].music = music;
      }
      return analysisById[songId];
    }

    function analysisStatusText(state) {
      if (state.status === "complete") return "频谱分析完成";
      if (state.status === "failed") return "分析失败";
      if (state.phase === "downloading") return "正在读取歌曲…";
      if (state.phase === "uploading") return "正在送往分析 VPS…";
      if (state.phase === "analyzing") return "正在计算频谱与节奏…";
      if (state.status === "queued" || state.status === "running") return "已进入分析队列…";
      return "还没有分析这首歌";
    }

    function analysisSummary(result) {
      result = result || {};
      var modeNames = { major: "大调", minor: "小调" };
      var parts = [];
      if (result.bpm !== undefined) parts.push(Math.round(Number(result.bpm) || 0) + " BPM");
      if (result.key) parts.push(result.key + (result.mode ? " " + (modeNames[result.mode] || result.mode) : ""));
      if (result.total_notes !== undefined) parts.push(result.total_notes + " 个音符");
      if (result.spectral_centroid_hz !== undefined) {
        parts.push("质心 " + Math.round(Number(result.spectral_centroid_hz) || 0) + " Hz");
      }
      if (result.spectral_bandwidth_hz !== undefined) {
        parts.push("带宽 " + Math.round(Number(result.spectral_bandwidth_hz) || 0) + " Hz");
      }
      return parts.join(" · ");
    }

    function renderAnalysisViews(songId, extraCard) {
      var state = analysisById[String(songId)];
      if (!state) return;
      var cards = Array.prototype.slice.call(document.querySelectorAll(".volo-music-card"));
      if (extraCard && cards.indexOf(extraCard) === -1) cards.push(extraCard);
      cards.forEach(function (card) {
        if (card.dataset.musicId !== String(songId)) return;
        var panel = card.querySelector(".volo-music-analysis");
        var action = card.querySelector(".volo-music-analyze");
        if (!panel || !action) return;
        panel.hidden = !state.open;
        panel.classList.toggle("is-loading", state.status === "queued" || state.status === "running");
        panel.classList.toggle("is-error", state.status === "failed");
        action.textContent = state.status === "complete" ? "频谱" :
          (state.status === "queued" || state.status === "running" ? "分析中" : "频谱");
        action.setAttribute("aria-expanded", String(state.open));
        var status = panel.querySelector(".volo-music-analysis-status");
        var summary = panel.querySelector(".volo-music-analysis-summary");
        var retry = panel.querySelector(".volo-music-analysis-retry");
        var image = panel.querySelector(".volo-music-spectrum");
        var energy = panel.querySelector(".volo-music-energy");
        status.textContent = analysisStatusText(state);
        summary.textContent = state.status === "failed"
          ? (state.error || "稍后可以重试")
          : analysisSummary(state.result);
        summary.hidden = !summary.textContent;
        retry.hidden = state.status !== "failed";
        image.hidden = !state.spectrumUrl;
        if (state.spectrumUrl && image.src !== state.spectrumUrl) image.src = state.spectrumUrl;
        energy.replaceChildren();
        var segments = state.result && Array.isArray(state.result.segments) ? state.result.segments : [];
        segments.forEach(function (segment, index) {
          var bar = document.createElement("span");
          var amount = Math.max(4, Math.min(100, Math.round((Number(segment.avg_energy) || 0) * 100)));
          bar.style.setProperty("--energy", amount + "%");
          bar.title = "第 " + (index + 1) + " 段能量 " + amount;
          energy.appendChild(bar);
        });
        energy.hidden = !segments.length;
      });
    }

    function loadSpectrum(state) {
      if (state.spectrumUrl || state.spectrumLoading || state.status !== "complete") return;
      state.spectrumLoading = true;
      window.CCC.musicSpectrumBlob(state.music.id).then(function (blob) {
        if (state.spectrumUrl) URL.revokeObjectURL(state.spectrumUrl);
        state.spectrumUrl = URL.createObjectURL(blob);
      }).catch(function (error) {
        state.error = error.message || "频谱图读取失败";
      }).finally(function () {
        state.spectrumLoading = false;
        renderAnalysisViews(state.music.id);
      });
    }

    function applyAnalysis(music, payload) {
      var state = analysisState(music);
      state.status = String(payload.status || "missing");
      state.phase = String(payload.phase || "");
      state.result = payload.result || null;
      state.error = String(payload.error || "");
      renderAnalysisViews(music.id);
      if (state.status === "complete") {
        window.clearTimeout(state.pollTimer);
        loadSpectrum(state);
      } else if (state.status === "queued" || state.status === "running") {
        window.clearTimeout(state.pollTimer);
        state.pollTimer = window.setTimeout(function () {
          refreshAnalysis(music);
        }, 2400);
      }
    }

    function refreshAnalysis(music) {
      var state = analysisState(music);
      if (state.requesting) return;
      state.requesting = true;
      window.CCC.musicAnalysis(music.id).then(function (payload) {
        applyAnalysis(music, payload);
      }).catch(function (error) {
        state.status = "failed";
        state.error = error.message || "分析状态读取失败";
        renderAnalysisViews(music.id);
      }).finally(function () {
        state.requesting = false;
      });
    }

    function ensureAnalysis(music, force) {
      var state = analysisState(music);
      state.open = true;
      renderAnalysisViews(music.id);
      if (state.requesting || (state.status === "complete" && !force)) {
        loadSpectrum(state);
        return;
      }
      state.requesting = true;
      state.status = "queued";
      state.phase = "waiting";
      state.error = "";
      renderAnalysisViews(music.id);
      window.CCC.startMusicAnalysis(music, Boolean(force)).then(function (payload) {
        applyAnalysis(music, payload);
      }).catch(function (error) {
        state.status = "failed";
        state.phase = "failed";
        state.error = error.message || "音乐分析失败";
        renderAnalysisViews(music.id);
      }).finally(function () {
        state.requesting = false;
      });
    }

    function formatTime(value) {
      var seconds = Math.max(0, Number(value) || 0);
      return Math.floor(seconds / 60) + ":" + String(Math.floor(seconds % 60)).padStart(2, "0");
    }

    function setCover(node, music) {
      if (!node || node.dataset.musicId === String(music.id)) return;
      node.dataset.musicId = String(music.id);
      node.replaceChildren();
      node.classList.toggle("is-fallback", !music.cover);
      if (!music.cover) return;
      var image = document.createElement("img");
      image.src = music.cover;
      image.alt = "";
      image.referrerPolicy = "no-referrer";
      image.addEventListener("error", function () {
        image.remove();
        node.classList.add("is-fallback");
      });
      node.appendChild(image);
    }

    function parseLrcLines(raw) {
      var result = [];
      String(raw || "").split(/\r?\n/).forEach(function (source) {
        var stamps = [];
        var matcher = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
        var match;
        while ((match = matcher.exec(source))) {
          var fraction = match[3] ? Number("0." + match[3]) : 0;
          stamps.push(Number(match[1]) * 60 + Number(match[2]) + fraction);
        }
        if (!stamps.length) return;
        var text = source.replace(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g, "").trim();
        if (!text) return;
        stamps.forEach(function (time) { result.push({ time: time, text: text, translation: "" }); });
      });
      result.sort(function (left, right) { return left.time - right.time; });
      return result;
    }

    function mergeTranslatedLyrics(lyric, translated) {
      var lines = parseLrcLines(lyric);
      var translatedLines = parseLrcLines(translated);
      var translationByTime = Object.create(null);
      translatedLines.forEach(function (line) {
        translationByTime[Math.round(line.time * 10)] = line.text;
      });
      lines.forEach(function (line) {
        line.translation = translationByTime[Math.round(line.time * 10)] || "";
      });
      return lines;
    }

    function renderSynchronizedLyrics(music, entry) {
      if (!selectedLyricsMusic || selectedLyricsMusic.id !== music.id) return;
      lyricsLines.replaceChildren();
      selectedLyricLines = entry.lines || [];
      selectedLyricIndex = -1;
      if (entry.status === "loading") {
        var loading = document.createElement("p");
        loading.className = "volo-lyrics-empty";
        loading.textContent = "正在读取歌词…";
        lyricsLines.appendChild(loading);
        return;
      }
      if (!selectedLyricLines.length) {
        var empty = document.createElement("p");
        empty.className = "volo-lyrics-empty";
        empty.textContent = entry.error || "暂无同步歌词";
        lyricsLines.appendChild(empty);
        return;
      }
      selectedLyricLines.forEach(function (line, index) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "volo-synced-line";
        button.dataset.index = String(index);
        button.dataset.time = String(line.time);
        var original = document.createElement("span");
        original.textContent = line.text;
        button.appendChild(original);
        if (line.translation && line.translation !== line.text) {
          var translation = document.createElement("small");
          translation.textContent = line.translation;
          button.appendChild(translation);
        }
        button.addEventListener("click", function () {
          var target = Number(button.dataset.time) || 0;
          if (activeAudio && activeId === music.id) {
            activeAudio.currentTime = target;
            activeAudio.play().catch(function () {});
          } else {
            startPlayback(music, null, target);
          }
        });
        lyricsLines.appendChild(button);
      });
      updatePlayerUI();
    }

    function loadSynchronizedLyrics(music) {
      selectedLyricsMusic = music;
      lyricsTitle.textContent = music.title;
      lyricsArtist.textContent = music.artist;
      setCover(lyricsCover, music);
      var cached = lyricsById[music.id];
      if (cached) {
        renderSynchronizedLyrics(music, cached);
        return;
      }
      var loading = { status: "loading", lines: [], error: "" };
      lyricsById[music.id] = loading;
      renderSynchronizedLyrics(music, loading);
      window.CCC.musicInfo(music.id).then(function (info) {
        var entry = {
          status: "ready",
          lines: mergeTranslatedLyrics(info.lyric, info.translated_lyric),
          error: ""
        };
        lyricsById[music.id] = entry;
        renderSynchronizedLyrics(music, entry);
      }).catch(function (error) {
        var entry = { status: "failed", lines: [], error: "歌词读取失败 · " + error.message };
        lyricsById[music.id] = entry;
        renderSynchronizedLyrics(music, entry);
      });
    }

    function openLyrics(music) {
      if (!music) return;
      lyricsView.hidden = false;
      lyricsView.setAttribute("aria-hidden", "false");
      voloView.classList.add("is-lyrics-open");
      loadSynchronizedLyrics(music);
      updatePlayerUI();
      window.setTimeout(function () { lyricsClose.focus(); }, 40);
    }

    function closeLyrics() {
      lyricsView.hidden = true;
      lyricsView.setAttribute("aria-hidden", "true");
      voloView.classList.remove("is-lyrics-open");
    }

    function updateRange(input, ratio) {
      var value = Math.max(0, Math.min(1, Number(ratio) || 0));
      input.value = String(Math.round(value * 1000));
      input.style.setProperty("--music-progress", (value * 100).toFixed(2) + "%");
    }

    function setPlayButton(button, playing) {
      if (!button) return;
      button.classList.toggle("is-playing", Boolean(playing));
      button.textContent = playing ? "暂停" : "播放";
      button.setAttribute("aria-label", (playing ? "暂停 " : "播放 ") + button.dataset.title);
    }

    function syncPlayButtons() {
      var playing = Boolean(activeAudio && !activeAudio.paused && !activeAudio.ended);
      document.querySelectorAll(".volo-music-play").forEach(function (button) {
        setPlayButton(button, playing && button.dataset.musicId === activeId);
      });
    }

    function updateLyricHighlight(currentTime) {
      if (lyricsView.hidden || !selectedLyricsMusic || selectedLyricsMusic.id !== activeId) return;
      var nextIndex = -1;
      for (var index = selectedLyricLines.length - 1; index >= 0; index -= 1) {
        if (currentTime + 0.12 >= selectedLyricLines[index].time) {
          nextIndex = index;
          break;
        }
      }
      if (nextIndex === selectedLyricIndex) return;
      selectedLyricIndex = nextIndex;
      lyricsLines.querySelectorAll(".volo-synced-line").forEach(function (line, index) {
        line.classList.toggle("is-active", index === nextIndex);
      });
      var active = lyricsLines.querySelector('.volo-synced-line[data-index="' + nextIndex + '"]');
      if (active) active.scrollIntoView({ block: "center", behavior: "smooth" });
    }

    function updatePlayerUI() {
      var hasActive = Boolean(activeMusic && activeAudio);
      nowPlaying.hidden = !hasActive;
      var current = hasActive && Number.isFinite(activeAudio.currentTime) ? activeAudio.currentTime : 0;
      var duration = hasActive && Number.isFinite(activeAudio.duration) ? activeAudio.duration : 0;
      var playing = hasActive && !activeAudio.paused && !activeAudio.ended;
      var ratio = duration ? current / duration : 0;
      if (hasActive) {
        nowPlayingTitle.textContent = activeMusic.title;
        nowPlayingArtist.textContent = activeMusic.artist;
        setCover(nowPlayingCover, activeMusic);
        nowPlayingToggle.textContent = playing ? "暂停" : "播放";
        nowPlayingToggle.setAttribute("aria-label", (playing ? "暂停 " : "播放 ") + activeMusic.title);
        if (seekPreview === null) {
          updateRange(nowPlayingSeek, ratio);
          nowPlayingCurrent.textContent = formatTime(current);
        }
        nowPlayingDuration.textContent = formatTime(duration);
        nowPlayingSeek.disabled = !duration;
      }

      var lyricsMatches = Boolean(selectedLyricsMusic && hasActive && selectedLyricsMusic.id === activeId);
      var lyricsPlaying = lyricsMatches && playing;
      lyricsToggle.textContent = lyricsPlaying ? "暂停" : "播放";
      lyricsToggle.setAttribute("aria-label", (lyricsPlaying ? "暂停 " : "播放 ") + (selectedLyricsMusic ? selectedLyricsMusic.title : "歌曲"));
      lyricsSeek.disabled = !lyricsMatches || !duration;
      if (seekPreview === null) {
        updateRange(lyricsSeek, lyricsMatches ? ratio : 0);
        lyricsCurrent.textContent = formatTime(lyricsMatches ? current : 0);
      }
      lyricsDuration.textContent = formatTime(lyricsMatches ? duration : 0);
      syncPlayButtons();
      updateLyricHighlight(current);
    }

    function reportState(music, status, audio) {
      if (!window.CCC || !window.CCC.updateMusicState) return;
      var now = Date.now();
      if (status === "playing" && now - lastStateAt < 4000) return;
      lastStateAt = now;
      window.CCC.updateMusicState({
        status: status,
        id: music.id,
        title: music.title,
        artist: music.artist,
        cover: music.cover || "",
        position_ms: audio && Number.isFinite(audio.currentTime) ? Math.round(audio.currentTime * 1000) : 0,
        duration_ms: audio && Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : 0,
        device: "hui-v40-web",
        session: typeof options.getSelectedSession === "function" ? options.getSelectedSession() : ""
      }).then(function (response) {
        if (response.analysis) applyAnalysis(music, response.analysis);
      }).catch(function () {});
    }

    function startPlayback(music, button, seekTime) {
      if (activeAudio && activeId === music.id) {
        if (Number.isFinite(seekTime)) activeAudio.currentTime = Math.max(0, seekTime);
        activeAudio.play().catch(function () {});
        return;
      }
      if (activeAudio) activeAudio.pause();
      var audio = new Audio(window.CCC.musicStreamUrl(music.id));
      audio.preload = "metadata";
      activeAudio = audio;
      activeButton = button;
      activeId = music.id;
      activeMusic = music;
      lastStateAt = 0;
      var pendingSeek = Number.isFinite(seekTime) ? Math.max(0, seekTime) : null;
      audio.addEventListener("loadedmetadata", function () {
        if (pendingSeek !== null) {
          audio.currentTime = Math.min(pendingSeek, Number.isFinite(audio.duration) ? audio.duration : pendingSeek);
          pendingSeek = null;
        }
        updatePlayerUI();
      });
      audio.addEventListener("durationchange", updatePlayerUI);
      audio.addEventListener("play", function () {
        reportState(music, "playing", audio);
        ensureAnalysis(music, false);
        updatePlayerUI();
      });
      audio.addEventListener("pause", function () {
        if (!audio.ended) reportState(music, "paused", audio);
        updatePlayerUI();
      });
      audio.addEventListener("timeupdate", function () {
        reportState(music, "playing", audio);
        updatePlayerUI();
      });
      audio.addEventListener("ended", function () {
        reportState(music, "ended", audio);
        updatePlayerUI();
      });
      audio.addEventListener("error", function () {
        reportState(music, "error", audio);
        updatePlayerUI();
        notify("这首歌暂时无法播放");
      });
      updatePlayerUI();
      audio.play().catch(function (error) {
        notify("播放失败 · " + (error.message || "请重新配对"));
      });
    }

    function togglePlayback(music, button) {
      if (activeAudio && activeId === music.id) {
        if (activeAudio.paused) activeAudio.play().catch(function () {});
        else activeAudio.pause();
        return;
      }
      startPlayback(music, button, null);
    }

    function createCard(music) {
      var card = document.createElement("section");
      card.className = "volo-music-card";
      card.dataset.musicId = String(music.id);
      card.setAttribute("aria-label", music.title + " · " + music.artist);
      var artwork = document.createElement("span");
      artwork.className = "volo-music-artwork";
      artwork.setAttribute("aria-hidden", "true");
      if (music.cover) {
        var image = document.createElement("img");
        image.src = music.cover;
        image.alt = "";
        image.loading = "lazy";
        image.referrerPolicy = "no-referrer";
        image.addEventListener("error", function () {
          image.remove();
          artwork.classList.add("is-fallback");
        });
        artwork.appendChild(image);
      } else {
        artwork.classList.add("is-fallback");
      }
      var copy = document.createElement("span");
      copy.className = "volo-music-copy";
      var kicker = document.createElement("small");
      kicker.textContent = "VOLO 点给你";
      var title = document.createElement("strong");
      title.textContent = music.title;
      var artist = document.createElement("span");
      artist.textContent = music.artist;
      copy.append(kicker, title, artist);
      if (music.note) {
        var note = document.createElement("p");
        note.className = "volo-music-note";
        note.textContent = music.note;
        copy.appendChild(note);
      }
      var actions = document.createElement("span");
      actions.className = "volo-music-actions";
      var play = document.createElement("button");
      play.type = "button";
      play.className = "volo-music-action volo-music-play";
      play.dataset.title = music.title;
      play.dataset.musicId = String(music.id);
      setPlayButton(play, activeId === music.id && activeAudio && !activeAudio.paused);
      play.addEventListener("click", function () { togglePlayback(music, play); });
      var lyrics = document.createElement("button");
      lyrics.type = "button";
      lyrics.className = "volo-music-action";
      lyrics.textContent = "歌词";
      var analyze = document.createElement("button");
      analyze.type = "button";
      analyze.className = "volo-music-action volo-music-analyze";
      analyze.textContent = "频谱";
      analyze.setAttribute("aria-expanded", "false");
      var open = document.createElement("a");
      open.className = "volo-music-open";
      open.href = "https://music.163.com/song?id=" + encodeURIComponent(music.id);
      open.target = "_blank";
      open.rel = "noopener noreferrer";
      open.setAttribute("aria-label", "在网易云音乐打开 " + music.title);
      open.textContent = "网易云 ↗";
      actions.append(play, lyrics, analyze, open);
      lyrics.addEventListener("click", function () { openLyrics(music); });
      var analysisPanel = document.createElement("section");
      analysisPanel.className = "volo-music-analysis";
      analysisPanel.hidden = true;
      var analysisHead = document.createElement("header");
      var analysisStatus = document.createElement("strong");
      analysisStatus.className = "volo-music-analysis-status";
      var retry = document.createElement("button");
      retry.type = "button";
      retry.className = "volo-music-analysis-retry";
      retry.textContent = "重试";
      retry.hidden = true;
      analysisHead.append(analysisStatus, retry);
      var summary = document.createElement("p");
      summary.className = "volo-music-analysis-summary";
      var energy = document.createElement("div");
      energy.className = "volo-music-energy";
      energy.setAttribute("aria-label", "六段能量");
      energy.hidden = true;
      var spectrum = document.createElement("img");
      spectrum.className = "volo-music-spectrum";
      spectrum.alt = music.title + " 的 Mel 频谱图";
      spectrum.loading = "lazy";
      spectrum.hidden = true;
      analysisPanel.append(analysisHead, summary, energy, spectrum);
      analyze.addEventListener("click", function () {
        var state = analysisState(music);
        if (state.open) {
          state.open = false;
          renderAnalysisViews(music.id);
        } else {
          ensureAnalysis(music, false);
        }
      });
      retry.addEventListener("click", function () { ensureAnalysis(music, true); });
      card.append(artwork, copy, actions, analysisPanel);
      renderAnalysisViews(music.id, card);
      return card;
    }

    function handleSeekInput(slider) {
      if (!activeAudio || !Number.isFinite(activeAudio.duration)) return;
      seekPreview = Math.max(0, Math.min(1, Number(slider.value) / 1000));
      updateRange(nowPlayingSeek, seekPreview);
      updateRange(lyricsSeek, seekPreview);
      var previewTime = seekPreview * activeAudio.duration;
      nowPlayingCurrent.textContent = formatTime(previewTime);
      lyricsCurrent.textContent = formatTime(previewTime);
    }

    function handleSeekChange() {
      if (seekPreview !== null && activeAudio && Number.isFinite(activeAudio.duration)) {
        activeAudio.currentTime = seekPreview * activeAudio.duration;
      }
      seekPreview = null;
      updatePlayerUI();
    }

    function bind() {
      if (bound) return;
      bound = true;
      musicButton.addEventListener("click", function () {
        if (busy || options.isVoiceBusy() || options.isSending()) return;
        if (!window.CCC.isConfigured()) {
          setStatus("先配置服务器地址和访问 Token", "error", 3200);
          window.CCC.openConnectionDialog();
          return;
        }
        musicInput.click();
      });
      musicInput.addEventListener("change", function () {
        analyzeFile(musicInput.files && musicInput.files[0]);
      });
      nowPlayingMain.addEventListener("click", function () {
        if (activeMusic) openLyrics(activeMusic);
      });
      nowPlayingToggle.addEventListener("click", function () {
        if (activeMusic) togglePlayback(activeMusic, activeButton);
      });
      lyricsClose.addEventListener("click", closeLyrics);
      lyricsToggle.addEventListener("click", function () {
        if (!selectedLyricsMusic) return;
        if (activeAudio && activeId === selectedLyricsMusic.id) {
          togglePlayback(selectedLyricsMusic, activeButton);
        } else {
          startPlayback(selectedLyricsMusic, null, null);
        }
      });
      [nowPlayingSeek, lyricsSeek].forEach(function (slider) {
        slider.addEventListener("input", function () { handleSeekInput(slider); });
        slider.addEventListener("change", handleSeekChange);
      });
      window.addEventListener("hashchange", function () {
        if (window.location.hash !== "#volo") closeLyrics();
      });
      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && !lyricsView.hidden) closeLyrics();
      });
      window.addEventListener("pagehide", destroy);
    }

    function destroy() {
      Object.keys(analysisById).forEach(function (songId) {
        var state = analysisById[songId];
        window.clearTimeout(state.pollTimer);
        if (state.spectrumUrl) URL.revokeObjectURL(state.spectrumUrl);
      });
      window.clearTimeout(toastTimer);
    }

    return {
      bind: bind,
      contentForMessage: contentForMessage,
      createCard: createCard,
      isBusy: function () { return busy; }
    };
  }

  window.VoloMusic = { create: create };
})();
