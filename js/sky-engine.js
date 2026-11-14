/**
 * SPHEREx INTERACTIVE SKY MAP ENGINE (WebGL / Accelerated Canvas + Slerp Camera)
 * Hỗ trợ:
 * - Nội suy bay mượt Slerp + Parabolic Zoom Arc (1.5s)
 * - Kéo rê chuột (Pan) & Lăn chuột thu phóng (Zoom FOV 0.02° -> 60°)
 * - Hiệu chỉnh Brightness / Contrast / Khử bụi ZODI / Đổi phổ 102 kênh thời gian thực
 * - Vẽ lưới tọa độ Xích đạo (RA/Dec Grid) & Tâm ngắm Sci-Fi Target Reticle + Pulse Ring
 */

class SpherexSkyEngine {
  constructor(canvasId, callbacks = {}) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");
    this.callbacks = callbacks;

    // Trạng thái Camera hiện tại
    this.ra = 56.8392;
    this.dec = 11.9644;
    this.fov = 0.25;

    // Mục tiêu đang được đánh dấu (Target Reticle)
    this.target = {
      ra: 56.8392,
      dec: 11.9644,
      name: "90377 Sedna",
      categoryLabel: "🎯 Ứng viên săn Planet X",
      color: "#ff7b54",
      qualityFlag: "CLEAN"
    };

    // Thông số xử lý ảnh thời gian thực (Shader state)
    this.shader = {
      brightness: 0,       // -50 -> +50
      contrast: 1.15,      // 0.5 -> 2.5
      subtractZodi: false, // Bật/tắt khử ánh sáng hoàng đạo (Lớp ZODI)
      bandIndex: 42,       // Band 1 -> 102 (0.75 -> 5.0 µm)
      wavelength: 2.46,    // µm
      showGrid: true
    };

    // Trạng thái bay Slerp (Fly-to animation)
    this.flight = null;
    this.pulseStartTime = performance.now();

    // Lớp ảnh Cutout FITS thực từ NASA IRSA (nếu đã tải thành công)
    this.realFitsLayer = null;

    // Tương tác chuột (Pan & Zoom)
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0, ra: 0, dec: 0 };
    this.hoverCoords = null;

    // Sinh danh sách 2,200 ngôi sao nền cố định trên thiên cầu (Deterministic Seed)
    this.stars = this._generateCelestialCatalog(2200);

    this._initEvents();
    this._resize();
    window.addEventListener("resize", () => this._resize());
    this._startRenderLoop();
  }

  /**
   * Khởi tạo 2,200 ngôi sao trên toàn thiên cầu (0..360 RA, -90..+90 Dec)
   */
  _generateCelestialCatalog(count) {
    let seed = 42102;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    const stars = [];
    const starColors = [
      { r: 165, g: 215, b: 255, temp: "hot" },   // Sao xanh nóng (0.75 - 1.5 µm)
      { r: 255, g: 248, b: 235, temp: "mid" },   // Sao trắng vàng
      { r: 255, g: 195, b: 130, temp: "cool" },  // Sao cam đỏ
      { r: 255, g: 120, b: 95, temp: "cold" }    // Sao lùn đỏ/nâu (sáng mạnh ở > 3.5 µm)
    ];

    for (let i = 0; i < count; i++) {
      const ra = rand() * 360;
      // Phân bố đều trên mặt cầu theo arcsin
      const dec = (Math.asin(2 * rand() - 1) * 180) / Math.PI;
      const mag = Math.pow(rand(), 2.2) * 3.2 + 0.5;
      const c = starColors[Math.floor(rand() * starColors.length)];
      stars.push({ ra, dec, size: mag, color: c });
    }

    // Thêm cụm sao dày đặc xung quanh các thiên thể trong Curated DB để khi zoom vào FOV 0.1 - 0.5 rất chi tiết
    (window.CURATED_OBJECTS || []).forEach((obj) => {
      const clusterCount = obj.category === "spherex-irsa" ? 12 : 65;
      for (let j = 0; j < clusterCount; j++) {
        const spread = 0.65;
        const ra = (obj.ra + (rand() - 0.5) * spread * 2 + 360) % 360;
        const dec = Math.max(-89.9, Math.min(89.9, obj.dec + (rand() - 0.5) * spread * 2));
        const size = rand() * 2.4 + 0.6;
        const c = starColors[Math.floor(rand() * starColors.length)];
        stars.push({ ra, dec, size, color: c, localCluster: true });
      }
    });

    return stars;
  }

  _resize() {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.width = rect.width;
    this.height = rect.height;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * Khoảng cách góc ngắn nhất trên vòng tròn RA (xử lý qua mốc 360° -> 0°)
   */
  _deltaRA(ra1, ra2) {
    let diff = ((ra2 - ra1 + 540) % 360) - 180;
    return diff;
  }

  /**
   * Chiếu tọa độ Thiên cầu (RA, Dec) sang tọa độ màn hình Canvas (X, Y)
   */
  project(ra, dec) {
    const scale = Math.min(this.width, this.height) / Math.max(0.015, this.fov);
    const dRa = this._deltaRA(this.ra, ra);
    const cosDec = Math.cos((this.dec * Math.PI) / 180);
    // Trong thiên văn, RA tăng về bên trái (Hướng Đông trên bầu trời)
    const x = this.width / 2 - dRa * Math.max(0.18, cosDec) * scale;
    const y = this.height / 2 - (dec - this.dec) * scale;
    return { x, y, scale };
  }

  /**
   * Ngược lại: Đổi vị trí chuột (X, Y) trên Canvas ra tọa độ (RA, Dec)
   */
  unproject(x, y) {
    const scale = Math.min(this.width, this.height) / Math.max(0.015, this.fov);
    const cosDec = Math.max(0.18, Math.cos((this.dec * Math.PI) / 180));
    const dRa = -(x - this.width / 2) / (scale * cosDec);
    const dDec = -(y - this.height / 2) / scale;
    const ra = ((this.ra + dRa) % 360 + 360) % 360;
    const dec = Math.max(-90, Math.min(90, this.dec + dDec));
    return { ra: +ra.toFixed(4), dec: +dec.toFixed(4) };
  }

  /**
   * Kích hoạt Camera Fly-to mượt mà (Slerp + Parabolic Zoom Arc trong 1.5 giây)
   */
  flyTo(targetRa, targetDec, targetFov, targetMeta = null, duration = 1450) {
    const startRa = this.ra;
    const startDec = this.dec;
    const startFov = this.fov;
    const dRa = this._deltaRA(startRa, targetRa);
    const dDec = targetDec - startDec;
    const angularDist = Math.hypot(dRa, dDec);

    if (targetMeta) {
      this.target = {
        ra: targetRa,
        dec: targetDec,
        name: targetMeta.name || `RA ${targetRa}°, Dec ${targetDec}°`,
        categoryLabel: targetMeta.categoryLabel || "🔭 Tọa độ tùy chỉnh",
        color: targetMeta.colorTint || "#38bdf8",
        qualityFlag: targetMeta.telemetry?.qualityFlag || "CLEAN",
        distanceAU: targetMeta.distanceAU || "Vùng quan sát SPHEREx"
      };
    }

    // Nếu khoảng cách xa, nâng đỉnh parabol FOV để tạo hiệu ứng zoom-out rồi lao xuống
    const peakFov = Math.min(
      60,
      Math.max(startFov, targetFov, Math.min(18, angularDist * 0.35 + Math.max(startFov, targetFov) * 1.6))
    );

    this.flight = {
      startTime: performance.now(),
      duration: angularDist < 0.001 && Math.abs(startFov - targetFov) < 0.001 ? 150 : duration,
      startRa,
      startDec,
      startFov,
      dRa,
      dDec,
      targetRa,
      targetDec,
      targetFov,
      peakFov
    };

    if (this.callbacks.onFlightStart) {
      this.callbacks.onFlightStart({ ra: targetRa, dec: targetDec, fov: targetFov });
    }
  }

  setFOV(newFov, animate = true) {
    const clamped = Math.max(0.02, Math.min(60, parseFloat(newFov) || 0.25));
    if (animate) {
      this.flyTo(this.ra, this.dec, clamped, null, 450);
    } else {
      this.fov = clamped;
      this._notifyViewChange();
    }
  }

  updateShader(partial) {
    Object.assign(this.shader, partial);
    if (this.realFitsLayer && this.realFitsLayer.parsedFits && window.SpherexFitsParser) {
      const dummy = document.createElement("canvas");
      dummy.width = 96;
      dummy.height = 96;
      this.realFitsLayer.offCanvas = window.SpherexFitsParser.renderFitsToCanvas(
        this.realFitsLayer.parsedFits,
        dummy,
        {
          subtractZodi: this.shader.subtractZodi,
          brightness: this.shader.brightness,
          contrast: this.shader.contrast,
          colormap: "infrared"
        }
      );
    }
  }

  /**
   * Gắn gói ảnh cắt FITS thật từ NASA IRSA lên đúng tọa độ (RA, Dec) trên bản đồ tương tác
   */
  setRealFitsCutout(parsedFits, offCanvas, ra, dec, cutoutSizeDeg = 0.1) {
    if (!parsedFits || !offCanvas) {
      this.realFitsLayer = null;
      return;
    }
    this.realFitsLayer = {
      parsedFits,
      offCanvas,
      ra,
      dec,
      cutoutSizeDeg
    };
  }

  _initEvents() {
    // Kéo chuột để Pan bản đồ
    this.canvas.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      this.flight = null; // Dừng bay tự động nếu người dùng chủ động cầm kéo
      this.isDragging = true;
      this.dragStart = {
        x: e.clientX,
        y: e.clientY,
        ra: this.ra,
        dec: this.dec
      };
      this.canvas.style.cursor = "grabbing";
    });

    window.addEventListener("mousemove", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      if (mx >= 0 && my >= 0 && mx <= this.width && my <= this.height) {
        this.hoverCoords = this.unproject(mx, my);
        if (this.callbacks.onHoverMove) {
          this.callbacks.onHoverMove(this.hoverCoords);
        }
      }

      if (!this.isDragging) return;
      const dx = e.clientX - this.dragStart.x;
      const dy = e.clientY - this.dragStart.y;
      const scale = Math.min(this.width, this.height) / Math.max(0.015, this.fov);
      const cosDec = Math.max(0.18, Math.cos((this.dec * Math.PI) / 180));

      this.ra = ((this.dragStart.ra + dx / (scale * cosDec)) % 360 + 360) % 360;
      this.dec = Math.max(-90, Math.min(90, this.dragStart.dec + dy / scale));
      this._notifyViewChange(false, false, true);
    });

    window.addEventListener("mouseup", () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.canvas.style.cursor = "grab";
        this._notifyViewChange(true, false, true);
      }
    });

    // Lăn chuột để Zoom (FOV)
    this.canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.flight = null;
        const zoomFactor = e.deltaY > 0 ? 1.16 : 0.86;
        const nextFov = Math.max(0.02, Math.min(60, +(this.fov * zoomFactor).toFixed(3)));
        const hitLimit = this.fov <= 0.021 && e.deltaY < 0;
        this.fov = nextFov;
        this._notifyViewChange(false, hitLimit, true);
      },
      { passive: false }
    );

    // Double click trên bản đồ để chọn tọa độ mới ngay tại điểm click
    this.canvas.addEventListener("dblclick", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clicked = this.unproject(e.clientX - rect.left, e.clientY - rect.top);
      if (this.callbacks.onCanvasPick) {
        this.callbacks.onCanvasPick(clicked.ra, clicked.dec);
      }
    });
  }

  _notifyViewChange(isFinal = false, hitResolutionLimit = false, isUserInteraction = false) {
    if (this.callbacks.onViewChange) {
      this.callbacks.onViewChange({
        ra: +this.ra.toFixed(6),
        dec: +this.dec.toFixed(6),
        fov: +this.fov.toFixed(3),
        isFinal,
        hitResolutionLimit,
        isUserInteraction
      });
    }
  }

  _startRenderLoop() {
    const tick = (now) => {
      this._updateFlight(now);
      this._render(now);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  _updateFlight(now) {
    if (!this.flight) return;
    const elapsed = now - this.flight.startTime;
    const t = Math.min(1, elapsed / this.flight.duration);

    // Cubic ease-in-out cho chuyển động mượt mà như điện ảnh
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    this.ra = ((this.flight.startRa + this.flight.dRa * ease) % 360 + 360) % 360;
    this.dec = Math.max(-90, Math.min(90, this.flight.startDec + this.flight.dDec * ease));

    // Nội suy Parabol cho FOV (hơi mở rộng góc nhìn ở giữa đường bay rồi đáp xuống)
    const arc = Math.sin(t * Math.PI);
    const linearFov = this.flight.startFov + (this.flight.targetFov - this.flight.startFov) * ease;
    this.fov = +(linearFov + (this.flight.peakFov - linearFov) * arc * 0.45).toFixed(3);

    this._notifyViewChange(false);

    if (t >= 1) {
      this.ra = this.flight.targetRa;
      this.dec = this.flight.targetDec;
      this.fov = this.flight.targetFov;
      this.flight = null;
      this.pulseStartTime = performance.now(); // Kích hoạt hiệu ứng sóng xung kích khi đáp xuống
      this._notifyViewChange(true);
      if (this.callbacks.onFlightEnd) {
        this.callbacks.onFlightEnd({ ra: this.ra, dec: this.dec, fov: this.fov });
      }
    }
  }

  /**
   * Vẽ toàn bộ khung cảnh vũ trụ hồng ngoại SPHEREx lên Canvas
   */
  _render(now) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    if (!w || !h) return;

    // 1. Tính màu nền dựa trên Độ sáng (Brightness), Tương phản (Contrast), Bước sóng (Wavelength) & Lớp ZODI
    const wlNorm = (this.shader.wavelength - 0.75) / (5.0 - 0.75); // 0 -> 1
    const zodiBoost = this.shader.subtractZodi ? 0 : 18 + wlNorm * 14;
    const brightOffset = this.shader.brightness * 1.4;

    const bgR = Math.max(2, Math.min(65, 6 + wlNorm * 16 + zodiBoost * 0.8 + brightOffset));
    const bgG = Math.max(3, Math.min(65, 9 + (1 - Math.abs(wlNorm - 0.5)) * 10 + zodiBoost * 0.65 + brightOffset));
    const bgB = Math.max(6, Math.min(85, 18 + (1 - wlNorm) * 20 + zodiBoost * 0.9 + brightOffset));

    const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, Math.max(w, h) * 0.75);
    bgGrad.addColorStop(0, `rgb(${Math.round(bgR + 8)}, ${Math.round(bgG + 8)}, ${Math.round(bgB + 12)})`);
    bgGrad.addColorStop(1, `rgb(${Math.round(bgR * 0.45)}, ${Math.round(bgG * 0.45)}, ${Math.round(bgB * 0.55)})`);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // 2. Vẽ Lưới tọa độ Xích đạo (Equatorial RA/Dec Grid)
    if (this.shader.showGrid) {
      this._drawCoordinateGrid(ctx, w, h);
    }

    // 3. Vẽ Quầng bụi Hồng ngoại / Tinh vân tại vị trí các thiên thể Curated
    this._drawDeepSkyStructures(ctx, wlNorm);

    // 4. Vẽ các ngôi sao nền (biến thiên độ sáng theo bước sóng hồng ngoại & Contrast)
    this._drawStars(ctx, w, h, wlNorm);

    // 4B. Vẽ Gói Ảnh Cắt FITS Thật từ NASA IRSA (nếu có ở tọa độ mục tiêu)
    if (this.realFitsLayer && this.realFitsLayer.offCanvas) {
      this._drawRealFitsStamp(ctx);
    }

    // 5. Nếu dữ liệu có cờ lỗi Tia vũ trụ (Cosmic Ray Flag), vẽ vệt tia vũ trụ để minh họa trực quan
    if (this.target && this.target.qualityFlag === "COSMIC_RAY_WARN") {
      this._drawCosmicRayArtifact(ctx);
    }

    // 6. Vẽ Tâm ngắm Sci-Fi Target Reticle + Sóng xung kích (Pulse Ring) tại mục tiêu đã chọn
    if (this.target) {
      this._drawTargetReticle(ctx, now);
    }

    // 7. Vẽ thước tỷ lệ góc (FOV Angular Scale Bar) ở góc dưới bản đồ
    this._drawScaleHUD(ctx, w, h);
  }

  _drawCoordinateGrid(ctx, w, h) {
    // Chọn bước nhảy lưới tùy theo mức thu phóng FOV
    let step = 10;
    if (this.fov <= 0.15) step = 0.02;
    else if (this.fov <= 0.4) step = 0.05;
    else if (this.fov <= 1.2) step = 0.2;
    else if (this.fov <= 5) step = 1;
    else if (this.fov <= 20) step = 5;

    ctx.save();
    ctx.strokeStyle = "rgba(56, 189, 248, 0.13)";
    ctx.fillStyle = "rgba(148, 163, 184, 0.65)";
    ctx.font = "10px 'JetBrains Mono', Consolas, monospace";
    ctx.lineWidth = 1;

    const startRa = Math.floor((this.ra - this.fov * 1.5) / step) * step;
    const endRa = this.ra + this.fov * 1.5;

    for (let r = startRa; r <= endRa; r += step) {
      const normR = ((r % 360) + 360) % 360;
      const p = this.project(normR, this.dec);
      if (p.x >= 0 && p.x <= w) {
        ctx.beginPath();
        ctx.moveTo(p.x, 0);
        ctx.lineTo(p.x, h);
        ctx.stroke();
        ctx.fillText(`RA ${normR.toFixed(step < 1 ? 2 : 0)}°`, p.x + 4, 16);
      }
    }

    const startDec = Math.max(-90, Math.floor((this.dec - this.fov * 1.5) / step) * step);
    const endDec = Math.min(90, this.dec + this.fov * 1.5);

    for (let d = startDec; d <= endDec; d += step) {
      const p = this.project(this.ra, d);
      if (p.y >= 0 && p.y <= h) {
        ctx.beginPath();
        ctx.moveTo(0, p.y);
        ctx.lineTo(w, p.y);
        ctx.stroke();
        const sign = d >= 0 ? "+" : "";
        ctx.fillText(`Dec ${sign}${d.toFixed(step < 1 ? 2 : 0)}°`, 8, p.y - 5);
      }
    }
    ctx.restore();
  }

  _drawDeepSkyStructures(ctx, wlNorm) {
    const contrast = this.shader.contrast;
    (window.CURATED_OBJECTS || []).forEach((obj) => {
      const p = this.project(obj.ra, obj.dec);
      if (p.x < -300 || p.x > this.width + 300 || p.y < -300 || p.y > this.height + 300) return;

      const baseRadius = Math.max(16, Math.min(260, (0.09 / Math.max(0.02, this.fov)) * 95));

      // Tính độ phản hồi bước sóng: Sao lùn nâu/Planet X sáng rực ở bước sóng > 3.8 µm, băng nước tối đi ở 3.1 µm
      let bandResponse = 1.0;
      if (obj.spectrumProfile === "brown_dwarf") {
        bandResponse = 0.4 + wlNorm * 1.4;
      } else if (obj.spectrumProfile === "ice_methane") {
        const isIceBand = Math.abs(this.shader.wavelength - 3.1) < 0.22;
        bandResponse = isIceBand ? 0.35 : 1.15;
      }

      const alpha = Math.min(0.85, 0.35 * contrast * bandResponse);
      const grad = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, baseRadius);
      grad.addColorStop(0, obj.colorTint);
      grad.addColorStop(0.35, this._hexToRgba(obj.colorTint, alpha));
      grad.addColorStop(1, "rgba(0,0,0,0)");

      ctx.save();
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, baseRadius, 0, Math.PI * 2);
      ctx.fill();

      // Vẽ nhân sáng của thiên thể
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(2.5, Math.min(7, baseRadius * 0.08 * bandResponse)), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  _drawStars(ctx, w, h, wlNorm) {
    const contrast = this.shader.contrast;
    const brightFactor = 1 + this.shader.brightness / 75;

    ctx.save();
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      // Lọc nhanh những ngôi sao nằm ngoài khung nhìn
      if (Math.abs(this._deltaRA(this.ra, s.ra)) > this.fov * 1.8) continue;
      if (Math.abs(s.dec - this.dec) > this.fov * 1.8) continue;

      const p = this.project(s.ra, s.dec);
      if (p.x < -10 || p.x > w + 10 || p.y < -10 || p.y > h + 10) continue;

      // Sao lạnh (đỏ/nâu) sáng hơn ở hồng ngoại dài, sao nóng sáng hơn ở hồng ngoại ngắn
      let wlFactor = 1.0;
      if (s.color.temp === "cold") wlFactor = 0.6 + wlNorm * 1.1;
      if (s.color.temp === "hot") wlFactor = 1.3 - wlNorm * 0.55;

      const radius = Math.max(0.7, Math.min(4.2, s.size * wlFactor * Math.pow(0.35 / Math.max(0.05, this.fov), 0.18)));
      const alpha = Math.min(1, Math.max(0.15, (0.55 * contrast * brightFactor * wlFactor)));

      ctx.fillStyle = `rgba(${s.color.r}, ${s.color.g}, ${s.color.b}, ${alpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawCosmicRayArtifact(ctx) {
    const p = this.project(this.target.ra + 0.04, this.target.dec - 0.03);
    ctx.save();
    ctx.strokeStyle = "#f43f5e";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(p.x - 18, p.y - 12);
    ctx.lineTo(p.x + 22, p.y + 14);
    ctx.stroke();

    ctx.strokeStyle = "rgba(244, 63, 94, 0.7)";
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(p.x - 24, p.y - 18, 52, 36);
    ctx.fillStyle = "#fda4af";
    ctx.font = "bold 10px 'JetBrains Mono', monospace";
    ctx.fillText("⚠️ COSMIC RAY ARTIFACT (FLAG 0x0010)", p.x - 24, p.y - 23);
    ctx.restore();
  }

  /**
   * Vẽ trực tiếp ma trận điểm ảnh FITS thật của NASA SPHEREx lên bản đồ tại tọa độ mục tiêu
   */
  _drawRealFitsStamp(ctx) {
    const layer = this.realFitsLayer;
    const p = this.project(layer.ra, layer.dec);
    const stampPx = Math.max(44, Math.min(1200, layer.cutoutSizeDeg * p.scale));
    if (
      p.x + stampPx / 2 < 0 ||
      p.x - stampPx / 2 > this.width ||
      p.y + stampPx / 2 < 0 ||
      p.y - stampPx / 2 > this.height
    ) {
      return;
    }

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 0.92;
    const x0 = p.x - stampPx / 2;
    const y0 = p.y - stampPx / 2;
    ctx.drawImage(layer.offCanvas, x0, y0, stampPx, stampPx);

    // Khung viền đánh dấu vùng FITS Cutout thật từ NASA IRSA
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = "rgba(34, 197, 94, 0.85)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(x0, y0, stampPx, stampPx);
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(6, 78, 59, 0.88)";
    ctx.fillRect(x0, y0 - 18, Math.min(stampPx, 240), 17);
    ctx.fillStyle = "#86efac";
    ctx.font = "bold 10px 'JetBrains Mono', Consolas, monospace";
    ctx.fillText(
      `🛰️ LIVE IRSA FITS (D${layer.parsedFits.detector} • ${layer.parsedFits.width}×${layer.parsedFits.height}px)`,
      x0 + 5,
      y0 - 6
    );
    ctx.restore();
  }

  _drawTargetReticle(ctx, now) {
    const p = this.project(this.target.ra, this.target.dec);
    if (p.x < -100 || p.x > this.width + 100 || p.y < -100 || p.y > this.height + 100) return;

    ctx.save();

    // 1. Hiệu ứng Vòng tròn sóng xung kích (Pulse Rings)
    const elapsed = (now - this.pulseStartTime) % 2400;
    const pulseProgress = elapsed / 2400;
    const pulseRadius = 18 + pulseProgress * 58;
    const pulseAlpha = (1 - pulseProgress) * 0.65;

    ctx.strokeStyle = `rgba(56, 189, 248, ${pulseAlpha.toFixed(2)})`;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, pulseRadius, 0, Math.PI * 2);
    ctx.stroke();

    // 2. Vòng tròn tiêu điểm (Target Reticle)
    const r = 22;
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();

    // 3. Bốn thanh chữ thập (Sci-Fi Crosshair) chừa khoảng trống ở tâm để không che mất ngôi sao
    const gap = 8;
    const len = 34;
    ctx.beginPath();
    // Trái & Phải
    ctx.moveTo(p.x - len, p.y);
    ctx.lineTo(p.x - gap, p.y);
    ctx.moveTo(p.x + gap, p.y);
    ctx.lineTo(p.x + len, p.y);
    // Trên & Dưới
    ctx.moveTo(p.x, p.y - len);
    ctx.lineTo(p.x, p.y - gap);
    ctx.moveTo(p.x, p.y + gap);
    ctx.lineTo(p.x, p.y + len);
    ctx.stroke();

    // 4. Bốn góc vuông khóa mục tiêu (Corner Brackets)
    const b = 15;
    const cLen = 5;
    ctx.strokeStyle = this.target.color || "#ff7b54";
    ctx.lineWidth = 2;
    [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1]
    ].forEach(([sx, sy]) => {
      ctx.beginPath();
      ctx.moveTo(p.x + sx * b, p.y + sy * (b - cLen));
      ctx.lineTo(p.x + sx * b, p.y + sy * b);
      ctx.lineTo(p.x + sx * (b - cLen), p.y + sy * b);
      ctx.stroke();
    });

    ctx.restore();

    // Cập nhật vị trí cho thẻ nổi HTML (Floating Target Card) bên cạnh tâm ngắm
    if (this.callbacks.onReticleScreenPos) {
      this.callbacks.onReticleScreenPos({
        x: p.x,
        y: p.y,
        visible: p.x >= 0 && p.x <= this.width && p.y >= 0 && p.y <= this.height
      });
    }
  }

  _drawScaleHUD(ctx, w, h) {
    ctx.save();
    const barPx = 90;
    const barDeg = (barPx / Math.min(w, h)) * this.fov;
    const label =
      barDeg >= 1
        ? `${barDeg.toFixed(2)}°`
        : barDeg * 60 >= 1
        ? `${(barDeg * 60).toFixed(1)} arcmin (')`
        : `${(barDeg * 3600).toFixed(1)} arcsec (")`;

    const x0 = 20;
    const y0 = h - 22;
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, y0 - 5);
    ctx.lineTo(x0, y0);
    ctx.lineTo(x0 + barPx, y0);
    ctx.lineTo(x0 + barPx, y0 - 5);
    ctx.stroke();

    ctx.fillStyle = "#bae6fd";
    ctx.font = "11px 'JetBrains Mono', Consolas, monospace";
    ctx.fillText(`Thước góc: ${label}`, x0 + 6, y0 - 8);
    ctx.restore();
  }

  _hexToRgba(hex, alpha) {
    const clean = hex.replace("#", "");
    const num = parseInt(clean, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}

window.SpherexSkyEngine = SpherexSkyEngine;
