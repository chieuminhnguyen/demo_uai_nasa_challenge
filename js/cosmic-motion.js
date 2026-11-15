/**
 * COSMIC MOTION ANIMATION — CORE PLAYER (P0 FEATURE #3)
 * - Strictly real NASA/IPAC IRSA SPHEREx Observation Epochs (zero synthetic/AI frame interpolation)
 * - Dual Transition Modes: Blink (100% direct cut) & Cross-Fade (last 35% alpha blend + mandatory warning)
 * - Dual Time Sliders: MJD-proportional Physical Timeline (with Data Gap shading) & Discrete Step Slider (step=1)
 * - Clyde Tombaugh Playback Speed (0.5 Hz - 4.0 Hz / 0.5x - 4x) & Loop / Continuous Playback
 * - Real Difference Layer I_diff = I(t_i) - I(t_0) & WCS North-Up registration
 * - Direct HTML5 Canvas WebM & GIF89a Export
 */

(function () {
  const DEFAULT_CANVAS_SIZE = 540;

  class CosmicMotionPlayer {
    constructor(options = {}) {
      this.callbacks = options.callbacks || {};
      this.getShaderOpts = options.getShaderOpts || (() => ({
        subtractZodi: true,
        brightness: 0,
        contrast: 1.15
      }));

      this.state = {
        active: false,
        targetName: "Target",
        ra: 0,
        dec: 0,
        size: 0.1,
        detector: 6,
        epochs: [],
        mjdMin: 0,
        mjdMax: 0,
        baselineDays: 0,
        dataGaps: [],
        targetMotionMeta: null,
        currentIndex: 0,
        isPlaying: false,
        loop: true,
        playbackHz: 2.0,
        transitionMode: "blink", // "blink" | "crossfade"
        showDiff: false,
        wcsAlign: true,
        loadedCount: 0,
        phase: 0,
        lastTickTime: 0,
        rafId: null,
        loadSessionId: 0,
        isExporting: false,
        exportCancelRequested: false
      };

      // Cache parsed FITS & aligned grids across target switches: key = `${access_url}|${ra}|${dec}|${size}`
      this.fitsCache = new Map();
      this.dom = {};
      this._timelineDragging = false;
    }

    initDOM() {
      this.dom = {
        canvas: document.getElementById("canvasMotionMain"),
        crossfadeBanner: document.getElementById("motionCrossfadeWarning"),
        btnPlayPause: document.getElementById("btnMotionPlayPause"),
        btnPrev: document.getElementById("btnMotionPrev"),
        btnNext: document.getElementById("btnMotionNext"),
        btnLoop: document.getElementById("btnMotionLoop"),
        modeBlinkBtn: document.getElementById("btnMotionModeBlink"),
        modeCrossfadeBtn: document.getElementById("btnMotionModeCrossfade"),
        btnToggleDiff: document.getElementById("btnMotionToggleDiff"),
        btnToggleWcs: document.getElementById("btnMotionToggleWcs"),
        speedSlider: document.getElementById("motionSpeedSlider"),
        speedLabel: document.getElementById("motionSpeedLabel"),
        speedPills: document.querySelectorAll(".btn-motion-speed-pill"),
        discreteSlider: document.getElementById("motionDiscreteSlider"),
        discreteLabel: document.getElementById("motionDiscreteStepLabel"),
        physicalTimelineCanvas: document.getElementById("motionPhysicalTimeline"),
        timelineTooltip: document.getElementById("motionTimelineTooltip"),
        timelineSpanLabel: document.getElementById("motionTimelineSpanLabel"),
        loadProgressLabel: document.getElementById("motionLoadProgress"),
        hudTimestampUtc: document.getElementById("motionHudUtc"),
        hudMjd: document.getElementById("motionHudMjd"),
        hudBand: document.getElementById("motionHudBand"),
        hudPlaybackRate: document.getElementById("motionHudPlaybackRate"),
        hudPhysicalDt: document.getElementById("motionHudPhysicalDt"),
        hudApparentMotion: document.getElementById("motionHudApparentMotion"),
        hudDiffStats: document.getElementById("motionHudDiffStats"),
        btnExportWebm: document.getElementById("btnMotionExportWebm"),
        btnExportGif: document.getElementById("btnMotionExportGif"),
        exportStatusLabel: document.getElementById("motionExportStatus")
      };

      this._bindEvents();
    }

    _bindEvents() {
      const d = this.dom;
      if (d.btnPlayPause) d.btnPlayPause.addEventListener("click", () => this.togglePlay());
      if (d.btnPrev) d.btnPrev.addEventListener("click", () => this.stepBy(-1));
      if (d.btnNext) d.btnNext.addEventListener("click", () => this.stepBy(1));
      if (d.btnLoop) {
        d.btnLoop.addEventListener("click", () => {
          this.state.loop = !this.state.loop;
          this._syncControlUI();
        });
      }

      if (d.modeBlinkBtn) d.modeBlinkBtn.addEventListener("click", () => this.setTransitionMode("blink"));
      if (d.modeCrossfadeBtn) d.modeCrossfadeBtn.addEventListener("click", () => this.setTransitionMode("crossfade"));

      if (d.btnToggleDiff) {
        d.btnToggleDiff.addEventListener("click", () => {
          this.state.showDiff = !this.state.showDiff;
          this._syncControlUI();
          this.renderFrame();
        });
      }

      if (d.btnToggleWcs) {
        d.btnToggleWcs.addEventListener("click", () => {
          this.state.wcsAlign = !this.state.wcsAlign;
          this._invalidateDiffCache();
          this._syncControlUI();
          this.renderFrame();
        });
      }

      if (d.speedSlider) {
        d.speedSlider.addEventListener("input", () => {
          const hz = parseFloat(d.speedSlider.value) || 2.0;
          this.setPlaybackHz(hz);
        });
      }

      if (d.speedPills) {
        d.speedPills.forEach((pill) => {
          pill.addEventListener("click", () => {
            const hz = parseFloat(pill.dataset.hz) || 2.0;
            this.setPlaybackHz(hz);
          });
        });
      }

      if (d.discreteSlider) {
        d.discreteSlider.addEventListener("input", () => {
          const idx = parseInt(d.discreteSlider.value, 10);
          if (!isNaN(idx)) {
            this.pause();
            this.jumpToEpoch(idx);
          }
        });
      }

      if (d.physicalTimelineCanvas) {
        const handleTimelinePick = (clientX, isClick = false) => {
          const rect = d.physicalTimelineCanvas.getBoundingClientRect();
          const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
          const nearest = this._findNearestEpochForRatio(ratio);
          if (nearest) {
            if (isClick || this._timelineDragging) {
              this.pause();
              this.jumpToEpoch(nearest.epoch_index);
            }
            this._updateTimelineTooltip(ratio, nearest, rect.width);
          }
        };

        d.physicalTimelineCanvas.addEventListener("mousedown", (e) => {
          this._timelineDragging = true;
          handleTimelinePick(e.clientX, true);
        });
        window.addEventListener("mousemove", (e) => {
          if (this._timelineDragging) {
            handleTimelinePick(e.clientX, true);
          }
        });
        window.addEventListener("mouseup", () => {
          this._timelineDragging = false;
        });
        d.physicalTimelineCanvas.addEventListener("mousemove", (e) => {
          if (!this._timelineDragging) {
            const rect = d.physicalTimelineCanvas.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
            const nearest = this._findNearestEpochForRatio(ratio);
            if (nearest) this._updateTimelineTooltip(ratio, nearest, rect.width);
          }
        });
        d.physicalTimelineCanvas.addEventListener("mouseleave", () => {
          if (d.timelineTooltip && !this._timelineDragging) {
            d.timelineTooltip.classList.add("hidden");
          }
        });
      }

      if (d.btnExportWebm) d.btnExportWebm.addEventListener("click", () => this.exportWebM());
      if (d.btnExportGif) d.btnExportGif.addEventListener("click", () => this.exportGIF());
    }

    _invalidateDiffCache() {
      this.state.epochs.forEach((ep) => {
        ep.diffBaseline = null;
      });
    }

    /**
     * Load real Observation Epochs sequence for the active sky region & detector.
     */
    async loadSequence({ ra, dec, size = 0.1, detector = 6, targetName = "Target", fallbackRows = [], preloadedFitsMap = null, initialEpochIndex = 0 }) {
      const sessionId = ++this.state.loadSessionId;
      this.pause();

      this.state.targetName = targetName;
      this.state.ra = ra;
      this.state.dec = dec;
      this.state.size = size;
      this.state.detector = detector;
      this.state.epochs = [];
      this.state.loadedCount = 0;
      this.state.currentIndex = 0;
      this.state.phase = 0;

      if (this.dom.loadProgressLabel) {
        this.dom.loadProgressLabel.textContent = "⏳ Loading real observation epochs...";
      }

      let payload = null;
      try {
        const resp = await fetch(
          `/api/irsa/epochs?ra=${encodeURIComponent(ra)}&dec=${encodeURIComponent(dec)}&radius=0.05&detector=${detector}&size=${size}`
        );
        if (sessionId !== this.state.loadSessionId) return;
        if (resp.ok) {
          payload = await resp.json();
        }
      } catch (err) {
        // Fall back to client-side SIA rows if gateway request fails
      }

      if (sessionId !== this.state.loadSessionId) return;

      if (!payload || !Array.isArray(payload.epochs) || !payload.epochs.length) {
        payload = this._buildClientFallbackEpochs(fallbackRows, ra, dec, detector, size);
      }

      this.state.epochs = (payload.epochs || []).map((ep) => ({
        ...ep,
        parsedFits: null,
        alignedGrid: null,
        diffBaseline: null,
        loadStatus: "pending"
      }));
      this.state.mjdMin = payload.mjd_min || 0;
      this.state.mjdMax = payload.mjd_max || 0;
      this.state.baselineDays = payload.baseline_days || 0;
      this.state.dataGaps = payload.data_gaps || [];
      this.state.targetMotionMeta = payload.target_motion_meta || null;

      // Seed any already-parsed FITS (e.g., from T1/T2 or fitsCache)
      this.state.epochs.forEach((ep) => {
        const cacheKey = `${ep.access_url}|${ra}|${dec}|${size}`;
        const cached = (preloadedFitsMap && preloadedFitsMap.get(cacheKey)) || this.fitsCache.get(cacheKey);
        if (cached && cached.valid) {
          ep.parsedFits = cached;
          ep.loadStatus = "ready";
          this.state.loadedCount++;
        }
      });

      const clampedStart = Math.max(0, Math.min(Math.max(0, this.state.epochs.length - 1), initialEpochIndex || 0));
      this.state.currentIndex = clampedStart;

      this._syncControlUI();
      this._renderPhysicalTimeline();
      this.renderFrame();

      if (this.state.epochs.length > 0) {
        await this._streamEpochCutouts(sessionId);
      }
    }

    _buildClientFallbackEpochs(rows, ra, dec, detector, size) {
      const filtered = (rows || [])
        .filter((r) => !detector || r.detector === detector)
        .sort((a, b) => (a.t_min_mjd || 0) - (b.t_min_mjd || 0));

      const mjds = filtered.map((r) => r.t_min_mjd || 0).filter((m) => m > 0);
      const mjdMin = mjds.length ? Math.min(...mjds) : 0;
      const mjdMax = mjds.length ? Math.max(...mjds) : 0;
      const span = Math.max(0, mjdMax - mjdMin);
      const gaps = [];
      let prev = null;

      const epochs = filtered.map((r, idx) => {
        const mjd = r.t_min_mjd || 0;
        const dt = prev !== null && mjd > 0 ? +(mjd - prev).toFixed(5) : 0;
        const cum = mjdMin > 0 && mjd > 0 ? +(mjd - mjdMin).toFixed(5) : 0;
        const ratio = span > 1e-6 ? (mjd - mjdMin) / span : 0.5;
        if (prev !== null && dt >= 30) {
          gaps.push({
            from_epoch_index: idx - 1,
            to_epoch_index: idx,
            start_mjd: prev,
            end_mjd: mjd,
            gap_days: +dt.toFixed(2),
            gap_months: +(dt / 30.4375).toFixed(1),
            start_ratio: (prev - mjdMin) / span,
            end_ratio: ratio
          });
        }
        prev = mjd;
        return {
          epoch_index: idx,
          epoch_id: `${r.obs_id || `SPX_${idx}`}#D${r.detector}#${mjd.toFixed(5)}`,
          obs_id: r.obs_id || `SPX_${idx}`,
          timestamp_utc: r.obs_date_iso || window.SpherexFitsParser?.mjdToIso(mjd) || "--",
          mjd,
          delta_t_days: dt,
          cumulative_days: cum,
          timeline_ratio: ratio,
          detector: r.detector || detector,
          band: `D${r.detector || detector} (${r.wlMinUm || 4.41}–${r.wlMaxUm || 5.01} µm)`,
          collection: r.collection || "spherex_dr1",
          access_url: r.access_url,
          cutout_url: `/api/irsa/cutout?access_url=${encodeURIComponent(r.access_url)}&ra=${ra}&dec=${dec}&size=${size}&mode=compact`,
          apparent_motion: null
        };
      });

      return {
        mjd_min: mjdMin,
        mjd_max: mjdMax,
        baseline_days: span,
        data_gaps: gaps,
        target_motion_meta: null,
        epochs
      };
    }

    async _streamEpochCutouts(sessionId) {
      const epochs = this.state.epochs;
      if (!epochs.length || !window.SpherexFitsParser) return;

      // Priority order: first, last, cached locally, evenly-spaced landmarks, then remaining
      const n = epochs.length;
      const ordered = [];
      const seen = new Set();
      const pushIdx = (i) => {
        if (i >= 0 && i < n && !seen.has(i)) {
          seen.add(i);
          ordered.push(i);
        }
      };

      pushIdx(this.state.currentIndex);
      pushIdx(0);
      pushIdx(n - 1);
      epochs.forEach((ep, i) => {
        if (ep.cached_locally) pushIdx(i);
      });
      const step = Math.max(1, Math.floor(n / 8));
      for (let i = 0; i < n; i += step) pushIdx(i);
      for (let i = 0; i < n; i++) pushIdx(i);

      const queue = ordered.filter((i) => epochs[i].loadStatus !== "ready");
      const concurrency = 4;

      const worker = async () => {
        while (queue.length > 0) {
          if (sessionId !== this.state.loadSessionId) return;
          const idx = queue.shift();
          const ep = epochs[idx];
          if (!ep || ep.loadStatus === "ready") continue;

          ep.loadStatus = "loading";
          try {
            const resp = await fetch(ep.cutout_url);
            if (sessionId !== this.state.loadSessionId) return;
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const buf = await resp.arrayBuffer();
            if (sessionId !== this.state.loadSessionId) return;

            const parsed = window.SpherexFitsParser.parseMultiExtensionFits(buf);
            if (parsed && parsed.valid) {
              ep.parsedFits = parsed;
              ep.loadStatus = "ready";
              this.state.loadedCount++;
              const cacheKey = `${ep.access_url}|${this.state.ra}|${this.state.dec}|${this.state.size}`;
              this.fitsCache.set(cacheKey, parsed);
            } else {
              ep.loadStatus = "error";
            }
          } catch (e) {
            ep.loadStatus = "error";
          }

          if (sessionId !== this.state.loadSessionId) return;
          this._updateProgressUI();
          this._renderPhysicalTimeline();
          if (idx === this.state.currentIndex || !this.state.isPlaying) {
            this.renderFrame();
          }
          if (idx === this.state.currentIndex && ep.parsedFits && this.callbacks.onEpochChanged) {
            this.callbacks.onEpochChanged(ep, ep.parsedFits);
          }
        }
      };

      this._updateProgressUI();
      await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, queue.length)) }, () => worker()));

      if (sessionId === this.state.loadSessionId) {
        this._updateProgressUI(true);
        this.renderFrame();
      }
    }

    _updateProgressUI(done = false) {
      if (!this.dom.loadProgressLabel) return;
      const total = this.state.epochs.length;
      const ready = this.state.loadedCount;
      const errCount = this.state.epochs.filter((e) => e.loadStatus === "error").length;
      if (!total) {
        this.dom.loadProgressLabel.textContent = "0 real epochs available";
        return;
      }
      if (done) {
        this.dom.loadProgressLabel.textContent =
          errCount > 0
            ? `✅ ${ready}/${total} Real FITS Loaded (${errCount} uncached/unavailable)`
            : `✅ ${ready}/${total} Real FITS Epochs Ready (0 Interpolated)`;
      } else {
        this.dom.loadProgressLabel.textContent = `⏳ Streaming Real FITS: ${ready}/${total} epochs...`;
      }
    }

    activate() {
      this.state.active = true;
      this._syncControlUI();
      this._renderPhysicalTimeline();
      this.renderFrame();
    }

    deactivate() {
      this.state.active = false;
      this.pause();
    }

    play() {
      if (this.state.epochs.length < 2 || this.state.isExporting) return;
      if (this.state.currentIndex >= this.state.epochs.length - 1 && !this.state.loop) {
        this.state.currentIndex = 0;
      }
      this.state.isPlaying = true;
      this.state.phase = 0;
      this.state.lastTickTime = performance.now();
      this._syncControlUI();
      this._startLoop();
    }

    pause() {
      this.state.isPlaying = false;
      this.state.phase = 0;
      if (this.state.rafId) {
        cancelAnimationFrame(this.state.rafId);
        this.state.rafId = null;
      }
      this._syncControlUI();
      if (this.state.active) this.renderFrame();
    }

    togglePlay() {
      if (this.state.isPlaying) this.pause();
      else this.play();
    }

    setPlaybackHz(hz) {
      this.state.playbackHz = Math.max(0.5, Math.min(4.0, +Number(hz).toFixed(1)));
      this._syncControlUI();
      this.renderFrame();
    }

    setTransitionMode(mode) {
      this.state.transitionMode = mode === "crossfade" ? "crossfade" : "blink";
      this._syncControlUI();
      this.renderFrame();
    }

    stepBy(delta) {
      const n = this.state.epochs.length;
      if (!n) return;
      this.pause();
      let nextIdx = this.state.currentIndex + delta;
      if (this.state.loop) {
        nextIdx = ((nextIdx % n) + n) % n;
      } else {
        nextIdx = Math.max(0, Math.min(n - 1, nextIdx));
      }
      this.jumpToEpoch(nextIdx);
    }

    jumpToEpoch(idx) {
      const n = this.state.epochs.length;
      if (!n) return;
      const clamped = Math.max(0, Math.min(n - 1, idx));
      this.state.currentIndex = clamped;
      this.state.phase = 0;
      this._syncControlUI();
      this._renderPhysicalTimeline();
      this.renderFrame();

      const ep = this.state.epochs[clamped];
      if (ep && this.callbacks.onEpochChanged) {
        this.callbacks.onEpochChanged(ep, ep.parsedFits);
      }
    }

    _getNextPlayableIndex(fromIdx) {
      const epochs = this.state.epochs;
      const n = epochs.length;
      if (n <= 1) return null;

      // Prefer next ready epoch if some epochs failed offline; otherwise sequential step
      for (let offset = 1; offset <= n; offset++) {
        const candidate = fromIdx + offset;
        if (candidate >= n) {
          if (!this.state.loop) return null;
          const wrapped = candidate % n;
          if (epochs[wrapped]?.loadStatus !== "error") return wrapped;
        } else if (epochs[candidate]?.loadStatus !== "error") {
          return candidate;
        }
      }
      return this.state.loop ? (fromIdx + 1) % n : null;
    }

    _startLoop() {
      if (this.state.rafId) cancelAnimationFrame(this.state.rafId);
      const stepFrame = (now) => {
        if (!this.state.isPlaying || !this.state.active) return;

        const periodMs = 1000 / Math.max(0.5, this.state.playbackHz);
        const elapsed = now - this.state.lastTickTime;
        let phase = elapsed / periodMs;

        if (phase >= 1.0) {
          const steps = Math.floor(phase);
          this.state.lastTickTime = now - (elapsed % periodMs);
          phase = (elapsed % periodMs) / periodMs;

          let nextIdx = this.state.currentIndex;
          let stoppedAtEnd = false;
          for (let s = 0; s < steps; s++) {
            const cand = this._getNextPlayableIndex(nextIdx);
            if (cand === null) {
              stoppedAtEnd = true;
              break;
            }
            nextIdx = cand;
          }

          this.state.currentIndex = nextIdx;
          this._syncControlUI();
          this._renderPhysicalTimeline();

          const ep = this.state.epochs[nextIdx];
          if (ep && this.callbacks.onEpochChanged) {
            this.callbacks.onEpochChanged(ep, ep.parsedFits);
          }

          if (stoppedAtEnd) {
            this.pause();
            return;
          }
        }

        this.state.phase = phase;
        this.renderFrame();
        this.state.rafId = requestAnimationFrame(stepFrame);
      };

      this.state.rafId = requestAnimationFrame(stepFrame);
    }

    _getAlignedGridForEpoch(ep) {
      if (!ep || !ep.parsedFits || !ep.parsedFits.valid) return null;
      if (!this.state.wcsAlign) return ep.parsedFits;
      if (!ep.alignedGrid && window.SpherexFitsParser?.resampleFitsToSkyGrid) {
        ep.alignedGrid = window.SpherexFitsParser.resampleFitsToSkyGrid(
          ep.parsedFits,
          this.state.ra,
          this.state.dec,
          this.state.size,
          60
        );
      }
      return ep.alignedGrid || ep.parsedFits;
    }

    _getDifferenceForEpoch(ep, baselineEp, subtractZodi) {
      if (!ep || !baselineEp || !window.SpherexFitsParser?.computeDifferenceMatrix) return null;
      const gCur = this._getAlignedGridForEpoch(ep);
      const gBase = this._getAlignedGridForEpoch(baselineEp);
      if (!gCur || !gBase) return null;
      if (!ep.diffBaseline || ep.diffBaseline.subtractZodi !== subtractZodi) {
        const diff = window.SpherexFitsParser.computeDifferenceMatrix(gCur, gBase, subtractZodi);
        if (diff) {
          diff.subtractZodi = subtractZodi;
          ep.diffBaseline = diff;
        }
      }
      return ep.diffBaseline;
    }

    _getBaselineReadyEpoch() {
      return this.state.epochs.find((e) => e.parsedFits && e.parsedFits.valid) || null;
    }

    /**
     * Render the active Epoch (and optional Cross-Fade / I_diff + Telemetry HUD) onto a canvas.
     */
    renderFrame(targetCanvas = null, overrideParams = null) {
      const canvas = targetCanvas || this.dom.canvas;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      const W = canvas.width || DEFAULT_CANVAS_SIZE;
      const H = canvas.height || DEFAULT_CANVAS_SIZE;

      const idx = overrideParams?.index ?? this.state.currentIndex;
      const phase = overrideParams?.phase ?? this.state.phase;
      const isPlaying = overrideParams?.isPlaying ?? this.state.isPlaying;
      const epochs = this.state.epochs;
      const ep = epochs[idx];

      ctx.save();
      ctx.fillStyle = "#020612";
      ctx.fillRect(0, 0, W, H);

      if (!ep) {
        ctx.fillStyle = "#7dd3fc";
        ctx.font = "bold 13px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.fillText("NO REAL OBSERVATION EPOCHS LOADED", W / 2, H / 2);
        ctx.restore();
        return;
      }

      const shaderOpts = this.getShaderOpts();
      const baseEp = this._getBaselineReadyEpoch();
      const stretchRef = baseEp?.parsedFits || ep.parsedFits;

      const topHudH = 44;
      const botHudH = 54;
      const imgY = topHudH;
      const imgH = H - topHudH - botHudH;
      const imgW = W;

      let activeDiffStats = null;
      let isCrossFadingNow = false;
      let crossFadeAlpha = 0;

      if (ep.parsedFits && ep.parsedFits.valid && window.SpherexFitsParser) {
        const drawEpochTexture = (epochObj, alpha) => {
          if (!epochObj?.parsedFits?.valid) return;
          let off = null;
          if (this.state.showDiff && baseEp) {
            const diffObj = this._getDifferenceForEpoch(epochObj, baseEp, shaderOpts.subtractZodi);
            if (diffObj) {
              if (epochObj === ep) activeDiffStats = diffObj;
              off = window.SpherexFitsParser.renderDiffToOffscreen(diffObj, {
                contrast: shaderOpts.contrast
              });
            }
          }
          if (!off) {
            const gridOrRaw = this._getAlignedGridForEpoch(epochObj);
            off = window.SpherexFitsParser.renderFitsToOffscreen(gridOrRaw, {
              ...shaderOpts,
              colormap: "infrared",
              stretchRef
            });
          }
          if (!off) return;
          ctx.save();
          ctx.imageSmoothingEnabled = false;
          ctx.globalAlpha = alpha;
          ctx.drawImage(off, 0, imgY, imgW, imgH);
          ctx.restore();
        };

        // Always draw Epoch(i) at 100%
        drawEpochTexture(ep, 1.0);

        // Cross-Fade Mode: ONLY blend alpha in the final 35% of the cycle (phase >= 0.65)
        if (this.state.transitionMode === "crossfade" && isPlaying && phase >= 0.65) {
          const nextIdx = this._getNextPlayableIndex(idx);
          const nextEp = nextIdx !== null ? epochs[nextIdx] : null;
          if (nextEp && nextEp !== ep && nextEp.parsedFits?.valid) {
            crossFadeAlpha = Math.min(1, Math.max(0, (phase - 0.65) / 0.35));
            isCrossFadingNow = true;
            drawEpochTexture(nextEp, crossFadeAlpha);
          }
        }
      } else {
        ctx.fillStyle = "#060d1e";
        ctx.fillRect(0, imgY, imgW, imgH);
        ctx.fillStyle = ep.loadStatus === "error" ? "#fbbf24" : "#38bdf8";
        ctx.font = "bold 12px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.fillText(
          ep.loadStatus === "error"
            ? "REAL FITS CUTOUT UNAVAILABLE OFFLINE (NOT INTERPOLATED)"
            : `LOADING REAL SPHEREx FITS EPOCH ${idx + 1}/${epochs.length}...`,
          W / 2,
          imgY + imgH / 2
        );
      }

      // Draw Center Crosshair Reticle
      const cx = W / 2;
      const cy = imgY + imgH / 2;
      ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 16, cy);
      ctx.lineTo(cx - 5, cy);
      ctx.moveTo(cx + 5, cy);
      ctx.lineTo(cx + 16, cy);
      ctx.moveTo(cx, cy - 16);
      ctx.lineTo(cx, cy - 5);
      ctx.moveTo(cx, cy + 5);
      ctx.lineTo(cx, cy + 16);
      ctx.stroke();

      // Compass orientation when WCS North-Up aligned
      if (this.state.wcsAlign) {
        ctx.fillStyle = "rgba(186, 230, 253, 0.85)";
        ctx.font = "bold 10px 'JetBrains Mono', monospace";
        ctx.textAlign = "left";
        ctx.fillText("N ↑  E ← (WCS ALIGNED)", 10, imgY + 16);
      }

      // Mandatory Cross-Fade Non-Observational Warning Badge burned onto Canvas (also captured in WebM/GIF!)
      if (this.state.transitionMode === "crossfade") {
        const warnText = isCrossFadingNow
          ? `⚠ VISUAL CROSS-FADE (NON-OBSERVATIONAL TRANSITION • α=${Math.round(crossFadeAlpha * 100)}%)`
          : "⚠ VISUAL CROSS-FADE (NON-OBSERVATIONAL TRANSITION)";
        ctx.fillStyle = "rgba(180, 83, 9, 0.92)";
        ctx.fillRect(8, imgY + imgH - 26, W - 16, 20);
        ctx.strokeStyle = "#fbbf24";
        ctx.lineWidth = 1;
        ctx.strokeRect(8, imgY + imgH - 26, W - 16, 20);
        ctx.fillStyle = "#fef3c7";
        ctx.font = "bold 10px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.fillText(warnText, W / 2, imgY + imgH - 12);
      } else if (this.state.showDiff) {
        ctx.fillStyle = "rgba(6, 78, 59, 0.88)";
        ctx.fillRect(8, imgY + imgH - 26, 285, 20);
        ctx.fillStyle = "#6ee7b7";
        ctx.font = "bold 10px 'JetBrains Mono', monospace";
        ctx.textAlign = "left";
        ctx.fillText("I_diff = I(Epoch_i) - I(Baseline) • DIPOLE VIEW", 14, imgY + imgH - 12);
      }

      // TOP HUD BAR: Observation Timestamp (ISO UTC & MJD) + Band + Epoch Index
      ctx.fillStyle = "rgba(4, 8, 20, 0.95)";
      ctx.fillRect(0, 0, W, topHudH);
      ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
      ctx.beginPath();
      ctx.moveTo(0, topHudH);
      ctx.lineTo(W, topHudH);
      ctx.stroke();

      ctx.textAlign = "left";
      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 11px 'JetBrains Mono', monospace";
      ctx.fillText(
        `${this.state.targetName.toUpperCase()} • ${ep.band} • EPOCH ${idx + 1}/${epochs.length}`,
        10,
        16
      );
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "600 10.5px 'JetBrains Mono', monospace";
      ctx.fillText(
        `UTC: ${ep.timestamp_utc}   |   MJD: ${ep.mjd.toFixed(5)}   |   ${(ep.collection || "DR1").toUpperCase()}`,
        10,
        34
      );

      // BOTTOM HUD BAR: Explicitly SEPARATED Playback Rate vs Physical Motion Δt
      ctx.fillStyle = "rgba(4, 8, 20, 0.96)";
      ctx.fillRect(0, H - botHudH, W, botHudH);
      ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
      ctx.beginPath();
      ctx.moveTo(0, H - botHudH);
      ctx.lineTo(W, H - botHudH);
      ctx.stroke();

      ctx.textAlign = "left";
      ctx.fillStyle = "#7dd3fc";
      ctx.font = "bold 10px 'JetBrains Mono', monospace";
      ctx.fillText(
        `PLAYBACK RATE: ${this.state.playbackHz.toFixed(1)} Hz (${this.state.playbackHz.toFixed(1)} epochs/s • ${this.state.playbackHz.toFixed(1)}x)`,
        10,
        H - 36
      );

      ctx.fillStyle = ep.delta_t_days >= 30 ? "#fbbf24" : "#34d399";
      const dtLabel =
        idx === 0
          ? "PHYSICAL MOTION Δt: 0.00 d (Baseline Epoch 0)"
          : `PHYSICAL MOTION Δt: +${ep.delta_t_days.toFixed(2)} days from prev (Σ +${ep.cumulative_days.toFixed(1)} d)`;
      ctx.fillText(dtLabel, 10, H - 20);

      ctx.fillStyle = "#94a3b8";
      ctx.font = "600 9.5px 'JetBrains Mono', monospace";
      let motionLine = `OBS ID: ${ep.obs_id} • NO FRAME INTERPOLATION`;
      if (ep.apparent_motion) {
        motionLine = `PM: ${ep.apparent_motion.total_pm_arcsec_yr}"/yr • Δθ(prev): ${ep.apparent_motion.shift_from_prev_arcsec}" • Δθ(total): ${ep.apparent_motion.shift_from_baseline_arcsec}"`;
      } else if (activeDiffStats) {
        motionLine = `I_diff: +${activeDiffStats.peakPos} / ${activeDiffStats.peakNeg} MJy/sr (RMS ${activeDiffStats.rms})`;
      }
      ctx.fillText(motionLine, 10, H - 6);

      ctx.restore();

      // Mirror HUD telemetry into crisp DOM readouts
      this._updateDomTelemetry(ep, idx, activeDiffStats);
    }

    _updateDomTelemetry(ep, idx, activeDiffStats) {
      const d = this.dom;
      if (!ep) return;
      if (d.hudTimestampUtc) d.hudTimestampUtc.textContent = ep.timestamp_utc || "--";
      if (d.hudMjd) d.hudMjd.textContent = `MJD ${ep.mjd ? ep.mjd.toFixed(5) : "--"}`;
      if (d.hudBand) d.hudBand.textContent = `${ep.band} (${(ep.collection || "DR1").toUpperCase()})`;
      if (d.hudPlaybackRate) {
        d.hudPlaybackRate.textContent = `${this.state.playbackHz.toFixed(1)} Hz (${this.state.playbackHz.toFixed(1)} epochs/s • ${this.state.playbackHz.toFixed(1)}x)`;
      }
      if (d.hudPhysicalDt) {
        d.hudPhysicalDt.textContent =
          idx === 0
            ? `0.00 days (Baseline Epoch 0)`
            : `+${ep.delta_t_days.toFixed(2)} days (Σ +${ep.cumulative_days.toFixed(1)} d)`;
        d.hudPhysicalDt.style.color = ep.delta_t_days >= 30 ? "#fbbf24" : "#34d399";
      }
      if (d.hudApparentMotion) {
        if (ep.apparent_motion) {
          d.hudApparentMotion.textContent = `${ep.apparent_motion.total_pm_arcsec_yr}"/yr • Δθ=${ep.apparent_motion.shift_from_baseline_arcsec}"`;
        } else {
          d.hudApparentMotion.textContent = "Catalog PM unavailable (Field monitoring)";
        }
      }
      if (d.hudDiffStats) {
        if (activeDiffStats) {
          d.hudDiffStats.textContent = `I_diff: +${activeDiffStats.peakPos} / ${activeDiffStats.peakNeg} MJy/sr (Sep ${activeDiffStats.sepPx} px)`;
        } else {
          d.hudDiffStats.textContent = this.state.showDiff ? "Computing I_diff..." : "Off (Raw Real Epochs)";
        }
      }
    }

    _syncControlUI() {
      const d = this.dom;
      const n = this.state.epochs.length;

      if (d.btnPlayPause) {
        d.btnPlayPause.textContent = this.state.isPlaying ? "⏸ Pause" : "▶ Play";
        d.btnPlayPause.classList.toggle("playing", this.state.isPlaying);
      }
      if (d.btnLoop) {
        d.btnLoop.textContent = this.state.loop ? "🔁 Loop: ON" : "🔁 Loop: OFF";
        d.btnLoop.classList.toggle("active", this.state.loop);
      }
      if (d.modeBlinkBtn) d.modeBlinkBtn.classList.toggle("active", this.state.transitionMode === "blink");
      if (d.modeCrossfadeBtn) d.modeCrossfadeBtn.classList.toggle("active", this.state.transitionMode === "crossfade");
      if (d.crossfadeBanner) {
        d.crossfadeBanner.classList.toggle("hidden", this.state.transitionMode !== "crossfade");
      }
      if (d.btnToggleDiff) {
        d.btnToggleDiff.classList.toggle("active", this.state.showDiff);
        d.btnToggleDiff.textContent = this.state.showDiff ? "🔬 I_diff: ON" : "🔬 I_diff Overlay";
      }
      if (d.btnToggleWcs) {
        d.btnToggleWcs.classList.toggle("active", this.state.wcsAlign);
        d.btnToggleWcs.textContent = this.state.wcsAlign ? "🧭 WCS North-Up: ON" : "🧭 Raw Detector";
      }
      if (d.speedSlider) d.speedSlider.value = String(this.state.playbackHz);
      if (d.speedLabel) {
        d.speedLabel.textContent = `${this.state.playbackHz.toFixed(1)} Hz (${this.state.playbackHz.toFixed(1)}x)`;
      }
      if (d.speedPills) {
        d.speedPills.forEach((p) => {
          p.classList.toggle("active", Math.abs(parseFloat(p.dataset.hz) - this.state.playbackHz) < 0.05);
        });
      }
      if (d.discreteSlider) {
        d.discreteSlider.min = "0";
        d.discreteSlider.max = String(Math.max(0, n - 1));
        d.discreteSlider.step = "1";
        d.discreteSlider.value = String(this.state.currentIndex);
        d.discreteSlider.disabled = n <= 1;
      }
      if (d.discreteLabel) {
        d.discreteLabel.textContent = n ? `Epoch ${this.state.currentIndex + 1} / ${n} (Step = 1)` : "0 / 0";
      }
      if (d.timelineSpanLabel) {
        d.timelineSpanLabel.textContent = n
          ? `MJD ${this.state.mjdMin.toFixed(2)} → ${this.state.mjdMax.toFixed(2)} (${this.state.baselineDays.toFixed(1)} days • ${this.state.dataGaps.length} Data Gap${this.state.dataGaps.length === 1 ? "" : "s"})`
          : "No MJD timeline";
      }
    }

    _findNearestEpochForRatio(ratio) {
      const epochs = this.state.epochs;
      if (!epochs.length) return null;
      let best = epochs[0];
      let bestDist = Infinity;
      for (const ep of epochs) {
        const dist = Math.abs((ep.timeline_ratio ?? 0.5) - ratio);
        if (dist < bestDist) {
          bestDist = dist;
          best = ep;
        }
      }
      return best;
    }

    _updateTimelineTooltip(ratio, nearestEp, trackWidth) {
      const tip = this.dom.timelineTooltip;
      if (!tip || !nearestEp) return;
      const inGap = this.state.dataGaps.find((g) => ratio > g.start_ratio + 0.01 && ratio < g.end_ratio - 0.01);
      tip.classList.remove("hidden");
      tip.style.left = `${Math.max(70, Math.min(trackWidth - 70, ratio * trackWidth))}px`;
      tip.textContent = inGap
        ? `DATA GAP (${inGap.gap_days}d / ~${inGap.gap_months} mo) → Snap to Epoch ${nearestEp.epoch_index + 1} (MJD ${nearestEp.mjd.toFixed(2)})`
        : `Epoch ${nearestEp.epoch_index + 1}/${this.state.epochs.length} • ${nearestEp.timestamp_utc.split("T")[0]} (MJD ${nearestEp.mjd.toFixed(2)})`;
    }

    /**
     * Draw MJD-Proportional Physical Timeline showing real epoch positions and ~6-month Data Gaps.
     */
    _renderPhysicalTimeline() {
      const canvas = this.dom.physicalTimelineCanvas;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cssW = Math.max(320, Math.round(rect.width || canvas.width || 620));
      const cssH = 44;
      if (canvas.width !== cssW || canvas.height !== cssH) {
        canvas.width = cssW;
        canvas.height = cssH;
      }

      const ctx = canvas.getContext("2d");
      const padX = 12;
      const trackW = cssW - padX * 2;
      const trackY = 18;
      const trackH = 12;

      ctx.clearRect(0, 0, cssW, cssH);
      ctx.fillStyle = "#040814";
      ctx.fillRect(0, 0, cssW, cssH);

      // Base track
      ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
      ctx.fillRect(padX, trackY, trackW, trackH);
      ctx.strokeStyle = "rgba(56, 189, 248, 0.3)";
      ctx.strokeRect(padX, trackY, trackW, trackH);

      // Highlight Data Gaps (> 30 days)
      this.state.dataGaps.forEach((gap) => {
        const x1 = padX + gap.start_ratio * trackW;
        const x2 = padX + gap.end_ratio * trackW;
        const gw = Math.max(4, x2 - x1);
        ctx.fillStyle = "rgba(245, 158, 11, 0.16)";
        ctx.fillRect(x1, trackY, gw, trackH);

        // Hatch stripes
        ctx.save();
        ctx.beginPath();
        ctx.rect(x1, trackY, gw, trackH);
        ctx.clip();
        ctx.strokeStyle = "rgba(245, 158, 11, 0.45)";
        ctx.lineWidth = 1;
        for (let sx = x1 - trackH; sx < x2 + trackH; sx += 6) {
          ctx.beginPath();
          ctx.moveTo(sx, trackY + trackH);
          ctx.lineTo(sx + trackH, trackY);
          ctx.stroke();
        }
        ctx.restore();

        if (gw > 56) {
          ctx.fillStyle = "#fbbf24";
          ctx.font = "bold 9px 'JetBrains Mono', monospace";
          ctx.textAlign = "center";
          ctx.fillText(`GAP ${Math.round(gap.gap_days)}d (~${gap.gap_months}m)`, x1 + gw / 2, 12);
        }
      });

      // Draw every real Observation Epoch marker at exact (mjd_i - mjd_min)/(mjd_max - mjd_min)
      this.state.epochs.forEach((ep, idx) => {
        const x = padX + (ep.timeline_ratio ?? 0.5) * trackW;
        const isCurrent = idx === this.state.currentIndex;
        if (isCurrent) return; // Draw active playhead on top last

        ctx.fillStyle =
          ep.loadStatus === "ready"
            ? "#38bdf8"
            : ep.loadStatus === "error"
            ? "#64748b"
            : "#eab308";
        ctx.fillRect(x - 1, trackY - 2, 2.5, trackH + 4);
      });

      // Active playhead marker
      const cur = this.state.epochs[this.state.currentIndex];
      if (cur) {
        const px = padX + (cur.timeline_ratio ?? 0.5) * trackW;
        ctx.fillStyle = "#00e5ff";
        ctx.fillRect(px - 2, trackY - 6, 4, trackH + 12);
        ctx.beginPath();
        ctx.arc(px, trackY + trackH / 2, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.strokeStyle = "#00e5ff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Bottom labels
      ctx.fillStyle = "#94a3b8";
      ctx.font = "9px 'JetBrains Mono', monospace";
      ctx.textAlign = "left";
      ctx.fillText(`MJD ${this.state.mjdMin.toFixed(1)}`, padX, cssH - 2);
      ctx.textAlign = "right";
      ctx.fillText(`MJD ${this.state.mjdMax.toFixed(1)}`, cssW - padX, cssH - 2);
    }

    /**
     * Export WebM directly from HTML5 Canvas captureStream() + MediaRecorder.
     */
    async exportWebM() {
      const canvas = this.dom.canvas;
      const readyIndices = this.state.epochs
        .map((e, i) => (e.parsedFits?.valid ? i : -1))
        .filter((i) => i >= 0);

      if (!readyIndices.length) {
        if (this.dom.exportStatusLabel) this.dom.exportStatusLabel.textContent = "⚠️ No loaded FITS frames to export.";
        return;
      }
      if (typeof canvas.captureStream !== "function" || typeof MediaRecorder === "undefined") {
        if (this.dom.exportStatusLabel) this.dom.exportStatusLabel.textContent = "⚠️ Browser does not support Canvas MediaRecorder.";
        return;
      }

      this.pause();
      this.state.isExporting = true;
      this._setExportButtonsDisabled(true);

      const mimeType =
        ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) =>
          MediaRecorder.isTypeSupported(m)
        ) || "video/webm";

      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 3_500_000 });
      const chunks = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };

      const donePromise = new Promise((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
      });

      recorder.start();

      const periodMs = 1000 / Math.max(0.5, this.state.playbackHz);
      const subSteps = this.state.transitionMode === "crossfade" ? 12 : 1;
      const stepWaitMs = periodMs / subSteps;

      for (let k = 0; k < readyIndices.length; k++) {
        const idx = readyIndices[k];
        if (this.dom.exportStatusLabel) {
          this.dom.exportStatusLabel.textContent = `🎥 Recording WebM: ${k + 1}/${readyIndices.length}...`;
        }
        for (let s = 0; s < subSteps; s++) {
          const phase = s / subSteps;
          this.renderFrame(canvas, { index: idx, phase, isPlaying: true });
          await new Promise((r) => setTimeout(r, stepWaitMs));
        }
      }

      recorder.stop();
      const blob = await donePromise;
      this._triggerDownload(blob, "webm");
      if (this.dom.exportStatusLabel) {
        this.dom.exportStatusLabel.textContent = `✅ Exported WebM (${readyIndices.length} real epochs)`;
      }

      this.state.isExporting = false;
      this._setExportButtonsDisabled(false);
      this.renderFrame();
    }

    /**
     * Export Animated GIF89a directly from HTML5 Canvas frames.
     */
    async exportGIF() {
      const canvas = this.dom.canvas;
      const readyIndices = this.state.epochs
        .map((e, i) => (e.parsedFits?.valid ? i : -1))
        .filter((i) => i >= 0);

      if (!readyIndices.length || !window.CosmicGifEncoder) {
        if (this.dom.exportStatusLabel) this.dom.exportStatusLabel.textContent = "⚠️ No loaded FITS frames to export.";
        return;
      }

      this.pause();
      this.state.isExporting = true;
      this._setExportButtonsDisabled(true);

      const exportDim = 420;
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = exportDim;
      tempCanvas.height = exportDim;
      const tCtx = tempCanvas.getContext("2d", { willReadFrequently: true });

      const periodMs = 1000 / Math.max(0.5, this.state.playbackHz);
      const capturedFrames = [];

      for (let k = 0; k < readyIndices.length; k++) {
        const idx = readyIndices[k];
        if (this.dom.exportStatusLabel) {
          this.dom.exportStatusLabel.textContent = `🎞️ Capturing GIF: ${k + 1}/${readyIndices.length}...`;
        }

        if (this.state.transitionMode === "crossfade" && k < readyIndices.length - 1) {
          // 65% pure real observation + 4 cross-fade steps in final 35%
          this.renderFrame(tempCanvas, { index: idx, phase: 0.1, isPlaying: true });
          capturedFrames.push({
            rgba: new Uint8ClampedArray(tCtx.getImageData(0, 0, exportDim, exportDim).data),
            width: exportDim,
            height: exportDim,
            delayMs: Math.max(40, Math.round(periodMs * 0.65))
          });

          const fadeSteps = 4;
          const fadeStepDelay = Math.max(30, Math.round((periodMs * 0.35) / fadeSteps));
          for (let f = 1; f <= fadeSteps; f++) {
            const phase = 0.65 + (f / fadeSteps) * 0.34;
            this.renderFrame(tempCanvas, { index: idx, phase, isPlaying: true });
            capturedFrames.push({
              rgba: new Uint8ClampedArray(tCtx.getImageData(0, 0, exportDim, exportDim).data),
              width: exportDim,
              height: exportDim,
              delayMs: fadeStepDelay
            });
          }
        } else {
          this.renderFrame(tempCanvas, { index: idx, phase: 0, isPlaying: true });
          capturedFrames.push({
            rgba: new Uint8ClampedArray(tCtx.getImageData(0, 0, exportDim, exportDim).data),
            width: exportDim,
            height: exportDim,
            delayMs: Math.max(40, Math.round(periodMs))
          });
        }

        if (k % 4 === 0) await new Promise((r) => setTimeout(r, 0));
      }

      if (this.dom.exportStatusLabel) {
        this.dom.exportStatusLabel.textContent = `⚙️ Encoding GIF89a (${capturedFrames.length} frames)...`;
      }
      await new Promise((r) => setTimeout(r, 10));

      const blob = window.CosmicGifEncoder.encodeFrames(capturedFrames, { loop: this.state.loop });
      this._triggerDownload(blob, "gif");

      if (this.dom.exportStatusLabel) {
        this.dom.exportStatusLabel.textContent = `✅ Exported GIF (${readyIndices.length} real epochs)`;
      }

      this.state.isExporting = false;
      this._setExportButtonsDisabled(false);
      this.renderFrame();
    }

    _setExportButtonsDisabled(disabled) {
      if (this.dom.btnExportWebm) this.dom.btnExportWebm.disabled = disabled;
      if (this.dom.btnExportGif) this.dom.btnExportGif.disabled = disabled;
    }

    _triggerDownload(blob, ext) {
      const slug = (this.state.targetName || "spherex")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `spherex_cosmic_motion_${slug}_D${this.state.detector}_${this.state.transitionMode}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  }

  window.CosmicMotionPlayer = CosmicMotionPlayer;
})();
