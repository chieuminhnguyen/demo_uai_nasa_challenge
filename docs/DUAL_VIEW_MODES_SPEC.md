# TECHNICAL SPECIFICATION & AI PROMPT: HIGH-VISIBILITY & NEWBIE-FRIENDLY DUAL VIEW MODES
**Project:** NASA Space Apps Challenge 2026 — Planet X & SPHEREx Sky Explorer  
**Workflow Step:** BƯỚC 3 / 5 — Hai chế độ So sánh trực quan (Dual View Modes)  
**Key Upgrade:** HÌNH ẢNH SIÊU TO RÕ RÀNG (440px–540px) + Phím phóng đại 1x–4x + Trải nghiệm Newbie không rối mắt.

---

## 1. YÊU CẦU TRỌNG TÂM: HÌNH ẢNH TO RÕ & DỄ QUAN SÁT CHO NGƯỜI MỚI

1. **Kích thước ảnh khổng lồ (Large Canvas Dimensions):**
   - **Ảnh thu nhỏ tại Cột Inspector Drawer:** Tăng từ $96 \times 96\text{px}$ lên **$140 \times 140\text{px}$** (To hơn 50%, nhìn rõ ngay trên thanh công cụ mà không cần căng mắt).
   - **Chế độ Song song (Side-by-Side Split View):** Mỗi ảnh có kích thước lên đến **$440 \times 440\text{px}$** (Hai ảnh đặt cạnh nhau trong khung mở rộng $1150\text{px}$).
   - **Chế độ Chớp nháy (Blink Comparator):** Khung ảnh trung tâm siêu to **$540 \times 540\text{px}$** (Mắt người nhìn rõ mồn một từng bước nhảy của ngôi sao).
2. **Kỹ thuật chống nhòe khi phóng to (`Pixelated Rendering`):**
   - Ép buộc áp dụng `image-rendering: pixelated; image-rendering: crisp-edges;` và `ctx.imageSmoothingEnabled = false;`.
   - Khi phóng to từ ma trận gốc $58 \times 58\text{px}$ lên $540\text{px}$, các pixel của cảm biến SPHEREx hiển thị thành từng khối vuông sắc lẹm chuẩn Sci-Fi, tuyệt đối không bị mờ nhòe (blurry/fuzzy).
3. **Bộ nút điều chỉnh độ phóng đại (Magnification Level 1x – 4x):**
   - Cung cấp 3 mức: `[1x Tiêu chuẩn]`, `[2x Phóng to]`, `[4x Soi chi tiết từng hạt pixel]`.
4. **Giao diện Newbie súc tích:**
   - Dòng mẹo hướng dẫn to, rõ: *"Những ngôi sao ở xa sẽ đứng im. Đốm sáng nào nhảy vị trí chính là Hành tinh!"*
   - Màu sắc nhận diện: 🔵 Xanh dương = Ảnh Cũ (Quá khứ), 🟠 Cam hổ phách = Ảnh Mới (Hiện tại).
   - Bảng đo sáng tự động đọc kết quả bằng tiếng Việt tự nhiên.

---

## 2. GIAO DIỆN HTML CHI TIẾT (`index.html`)

Nâng cấp toàn diện `#fitsZoomModal` với không gian rộng rãi ($1150\text{px}$):

```html
<!-- CỬA SỔ PHÓNG TO & SO SÁNH ẢNH TO RÕ CHO NGƯỜI MỚI (MODAL CONTAINER) -->
<div class="fits-zoom-container wide-compare-modal">
  
  <!-- Header Modal -->
  <div class="fits-zoom-header">
    <div class="fits-zoom-title-group">
      <div class="fits-zoom-tag-row">
        <span class="zoom-epoch-tag tag-mode-badge">🛰️ TRẠM SO SÁNH ẢNH ĐA THỜI ĐIỂM SPHEREx</span>
        <span id="fitsZoomBandBadge" class="zoom-meta-tag">CẢM BIẾN D6 (4.41–5.01 µm)</span>
        <span id="fitsZoomBaseline" class="zoom-meta-tag tag-clean">⏱️ Cách nhau: 402 ngày</span>
      </div>
      <h2 id="fitsZoomTitle">KÍNH SO SÁNH ĐỐI CHỨNG (HIỂN THỊ SIÊU TO RÕ)</h2>
    </div>
    <button id="btnCloseFitsZoom" class="btn-close-modal" title="Đóng cửa sổ">✕</button>
  </div>

  <!-- 1. DÒNG HƯỚNG DẪN DỄ HIỂU DÀNH CHO NGƯỜI MỚI -->
  <div class="newbie-tip-banner">
    <span class="tip-icon">💡</span>
    <span class="tip-text">
      <b>Mẹo phát hiện:</b> Các ngôi sao ở xa sẽ <b>đứng bất động</b>. Đốm sáng nào <b>nhảy vị trí</b> giữa 2 lần chụp chính là <b>Hành tinh hoặc Tiểu hành tinh</b> đang di chuyển!
    </span>
  </div>

  <!-- 2. THANH ĐIỀU HƯỚNG CHẾ ĐỘ & BỘ PHÓNG ĐẠI (CONTROLS BAR) -->
  <div class="zoom-mode-switcher-bar">
    <!-- Nút chọn chế độ xem to rõ -->
    <div class="mode-buttons-big">
      <button type="button" id="btnModeSplit" class="btn-mode-card active">
        <span class="btn-mode-icon">◫</span>
        <div class="btn-mode-texts">
          <span class="btn-mode-title">1. ĐẶT CẠNH NHAU (440px)</span>
          <span class="btn-mode-desc">Soi chi tiết cả 2 ảnh cùng lúc</span>
        </div>
      </button>

      <button type="button" id="btnModeBlink" class="btn-mode-card">
        <span class="btn-mode-icon">🎬</span>
        <div class="btn-mode-texts">
          <span class="btn-mode-title">2. XEM NHẤP NHÁY (540px)</span>
          <span class="btn-mode-desc">Chớp tắt bắt chuyển động như Clyde Tombaugh</span>
        </div>
      </button>
    </div>

    <!-- Bộ phóng đại quang học (Magnification Pills) -->
    <div class="zoom-mag-group">
      <span class="mag-label">🔍 Độ phóng đại:</span>
      <button type="button" class="btn-mag-pill active" data-mag="1">1x Chuẩn</button>
      <button type="button" class="btn-mag-pill" data-mag="1.5">1.5x To</button>
      <button type="button" class="btn-mag-pill" data-mag="2">2x Siêu To</button>
    </div>

    <!-- Bộ điều tốc chớp nháy (Chỉ hiện ở Blink Mode) -->
    <div id="blinkControlsWrap" class="blink-speed-panel hidden">
      <button type="button" id="btnBlinkPlayPause" class="btn-play-pause">⏸️ Tạm Dừng</button>
      <div class="speed-slider-group">
        <span class="speed-icon">🐢 Chậm</span>
        <input type="range" id="blinkSpeedSlider" min="0.5" max="4.0" step="0.5" value="2.0" class="speed-range-input" />
        <span class="speed-icon">🐇 Nhanh</span>
      </div>
      <div id="blinkStatusLed" class="blink-status-led led-t1">
        <span class="led-dot">●</span> ĐANG HIỆN: ẢNH CŨ
      </div>
    </div>
  </div>

  <!-- 3. KHU VỰC HIỂN THỊ CANVAS SIÊU TO RÕ -->
  <div class="fits-zoom-body" id="fitsZoomBody">
    
    <!-- VIEW A: ĐẶT CẠNH NHAU (SIDE-BY-SIDE: 2 CANVAS 440x440) -->
    <div id="viewSplitWrapper" class="split-stage-wrap">
      <!-- Cột Ảnh Cũ (T1) -->
      <div class="canvas-box-card card-old">
        <div class="canvas-header-pill pill-old">
          <span class="pill-title">🔵 1. ẢNH QUÁ KHỨ (LẦN CHỤP TRƯỚC)</span>
          <span id="labelDateT1" class="pill-date">--</span>
        </div>
        <div class="canvas-interactive-wrapper" id="wrapSplitT1">
          <canvas id="canvasSplitT1" width="440" height="440"></canvas>
          <div id="crosshairT1" class="friendly-crosshair"></div>
        </div>
      </div>

      <!-- Cầu nối so sánh thời gian ở giữa -->
      <div class="time-bridge-badge">
        <span class="bridge-icon">⚡</span>
        <span id="labelDeltaDays" class="bridge-days">Cách nhau: -- ngày</span>
      </div>

      <!-- Cột Ảnh Mới (T2) -->
      <div class="canvas-box-card card-new">
        <div class="canvas-header-pill pill-new">
          <span class="pill-title">🟠 2. ẢNH HIỆN TẠI (LẦN CHỤP SAU)</span>
          <span id="labelDateT2" class="pill-date">--</span>
        </div>
        <div class="canvas-interactive-wrapper" id="wrapSplitT2">
          <canvas id="canvasSplitT2" width="440" height="440"></canvas>
          <div id="crosshairT2" class="friendly-crosshair"></div>
        </div>
      </div>
    </div>

    <!-- VIEW B: CHỚP NHÁY TRUNG TÂM (BLINK VIEW: 1 CANVAS KHỔNG LỒ 540x540) -->
    <div id="viewBlinkWrapper" class="blink-stage-wrap hidden">
      <div class="canvas-interactive-wrapper blink-main-wrapper" id="wrapBlinkMain">
        <canvas id="canvasBlinkMain" width="540" height="540"></canvas>
        <div id="crosshairBlink" class="friendly-crosshair"></div>
        <div id="blinkScreenBanner" class="blink-screen-tag tag-old">🔵 ẢNH QUÁ KHỨ</div>
      </div>
    </div>

  </div>

  <!-- 4. THANH ĐO QUANG THÔNG TỰ ĐỘNG ĐỌC KẾT QUẢ TIẾNG VIỆT -->
  <div class="newbie-flux-summary">
    <div class="summary-col">
      <span class="sum-label">🎯 Vị trí đang chỉ:</span>
      <span id="hudFriendlyPixel" class="sum-val">Rê chuột lên ảnh để soi điểm</span>
    </div>
    <div class="summary-divider">|</div>
    <div class="summary-col">
      <span class="sum-label">🔵 Độ sáng ảnh cũ:</span>
      <span id="hudFriendlyFluxT1" class="sum-val val-blue">--</span>
    </div>
    <div class="summary-divider">➔</div>
    <div class="summary-col">
      <span class="sum-label">🟠 Độ sáng ảnh mới:</span>
      <span id="hudFriendlyFluxT2" class="sum-val val-orange">--</span>
    </div>
    <div class="summary-divider">|</div>
    <div class="summary-col">
      <span class="sum-label">✨ Biến đổi độ sáng:</span>
      <span id="hudFriendlyDelta" class="sum-val val-status">Đứng im bình thường</span>
    </div>
  </div>

</div>
```

---

## 3. PHONG CÁCH CSS CHO KHUNG HÌNH TO RÕ (`css/styles.css`)

```css
/* ==========================================================================
   MODULE: HIGH-VISIBILITY & NEWBIE DUAL VIEW MODES
   ========================================================================== */

/* Nới rộng kích thước khung Modal lên 1150px để chứa thoải mái 2 ảnh to */
.wide-compare-modal {
  width: 1150px !important;
  max-width: 96vw !important;
  max-height: 94vh !important;
  background: #040814 !important;
  border: 1.5px solid rgba(56, 189, 248, 0.5) !important;
}

/* Mẹo hướng dẫn nổi bật */
.newbie-tip-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(30, 58, 138, 0.4);
  border-left: 4px solid #38bdf8;
  padding: 10px 16px;
  margin: 0 16px 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  color: #e0f2fe;
}
.tip-icon { font-size: 22px; }

/* Nút chuyển chế độ to, bắt mắt */
.zoom-mode-switcher-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px;
  background: rgba(15, 23, 42, 0.85);
  border-bottom: 1px solid rgba(56, 189, 248, 0.25);
}

.mode-buttons-big { display: flex; gap: 10px; }

.btn-mode-card {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(15, 23, 42, 0.9);
  border: 1.5px solid rgba(148, 163, 184, 0.3);
  border-radius: 8px;
  padding: 8px 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
}

.btn-mode-card.active {
  background: rgba(14, 165, 233, 0.25);
  border-color: #38bdf8;
  box-shadow: 0 0 14px rgba(56, 189, 248, 0.4);
}

.btn-mode-icon { font-size: 24px; }
.btn-mode-title { display: block; font-size: 12px; font-weight: 800; color: #f8fafc; }
.btn-mode-desc { display: block; font-size: 10px; color: #94a3b8; }
.btn-mode-card.active .btn-mode-title { color: #38bdf8; }

/* Bộ nút chỉnh Zoom Magnification */
.zoom-mag-group {
  display: flex;
  align-items: center;
  gap: 6px;
}
.mag-label { font-size: 11px; color: #94a3b8; font-weight: 700; }

.btn-mag-pill {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.3);
  color: #cbd5e1;
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
}
.btn-mag-pill.active {
  background: #0284c7;
  color: #ffffff;
  border-color: #38bdf8;
}

/* Bố cục Side-by-Side Canvas Siêu To Rõ */
.split-stage-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 12px 16px;
}

.canvas-box-card {
  background: #0b1120;
  border-radius: 10px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card-old { border: 2.5px solid rgba(56, 189, 248, 0.7); box-shadow: 0 0 20px rgba(56, 189, 248, 0.15); }
.card-new { border: 2.5px solid rgba(245, 158, 11, 0.7); box-shadow: 0 0 20px rgba(245, 158, 11, 0.15); }

.canvas-header-pill {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 800;
}
.pill-old { background: rgba(56, 189, 248, 0.2); color: #7dd3fc; }
.pill-new { background: rgba(245, 158, 11, 0.2); color: #fde047; }

/* Ép ảnh Canvas to rõ và KHÔNG BỊ MỜ */
.canvas-interactive-wrapper canvas {
  display: block;
  background: #010409;
  border-radius: 6px;
  image-rendering: pixelated !important;
  image-rendering: -moz-crisp-edges !important;
  image-rendering: crisp-edges !important;
}

#canvasSplitT1, #canvasSplitT2 {
  width: 440px !important;
  height: 440px !important;
}

#canvasBlinkMain {
  width: 540px !important;
  height: 540px !important;
}

/* Tâm ngắm đồng bộ to, phát sáng, viền đậm */
.friendly-crosshair {
  position: absolute;
  width: 26px;
  height: 26px;
  border: 2.5px solid #ef4444;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  display: none;
  box-shadow: 0 0 12px rgba(239, 68, 68, 1.0);
}
.friendly-crosshair::before,
.friendly-crosshair::after {
  content: "";
  position: absolute;
  background: #ef4444;
}
.friendly-crosshair::before { top: -8px; bottom: -8px; left: 11.5px; width: 2.5px; }
.friendly-crosshair::after { left: -8px; right: -8px; top: 11.5px; height: 2.5px; }

/* Thanh tóm tắt quang thông ở đáy modal */
.newbie-flux-summary {
  display: flex;
  align-items: center;
  justify-content: space-around;
  background: rgba(10, 15, 29, 0.98);
  border: 1px solid rgba(56, 189, 248, 0.35);
  border-radius: 8px;
  padding: 10px 20px;
  margin: 8px 16px 14px 16px;
  font-size: 13px;
}
```

---

## 4. LOGIC JAVASCRIPT HỖ TRỢ PHÓNG ĐẠI & RENDER SẮC NÉT (`js/app.js`)

Khi vẽ FITS lên các canvas to này, luôn đảm bảo `ctx.imageSmoothingEnabled = false;` để ma trận pixel cực kỳ sắc nét:

```javascript
// Render FITS lên Canvas to rõ không bị mờ
function renderCrispLargeFits(parsedFits, canvasEl) {
  if (!parsedFits || !parsedFits.valid || !canvasEl) return;
  const ctx = canvasEl.getContext("2d");
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.mozImageSmoothingEnabled = false;
  ctx.webkitImageSmoothingEnabled = false;
  ctx.msImageSmoothingEnabled = false;

  window.SpherexFitsParser.renderFitsToCanvas(parsedFits, canvasEl, {
    subtractZodi: skyEngine.shader.subtractZodi,
    brightness: skyEngine.shader.brightness,
    contrast: skyEngine.shader.contrast,
    colormap: "infrared"
  });
  ctx.restore();
}

// Xử lý bộ nút Magnification Pills [1x] [1.5x] [2x]
function initMagnificationControls() {
  const pills = document.querySelectorAll(".btn-mag-pill");
  const c1 = document.getElementById("canvasSplitT1");
  const c2 = document.getElementById("canvasSplitT2");
  const cBlink = document.getElementById("canvasBlinkMain");

  pills.forEach((pill) => {
    pill.addEventListener("click", () => {
      pills.forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      const scale = parseFloat(pill.dataset.mag) || 1.0;

      const baseSplit = 440;
      const baseBlink = 540;

      if (c1) { c1.style.width = `${Math.round(baseSplit * scale)}px`; c1.style.height = `${Math.round(baseSplit * scale)}px`; }
      if (c2) { c2.style.width = `${Math.round(baseSplit * scale)}px`; c2.style.height = `${Math.round(baseSplit * scale)}px`; }
      if (cBlink) { cBlink.style.width = `${Math.round(baseBlink * scale)}px`; cBlink.style.height = `${Math.round(baseBlink * scale)}px`; }
    });
  });
}
```
