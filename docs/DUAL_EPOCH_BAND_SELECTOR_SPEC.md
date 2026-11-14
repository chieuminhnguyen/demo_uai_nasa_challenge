# TECHNICAL SPECIFICATION & AI PROMPT: DUAL-EPOCH (T1 vs T2) & BAND SELECTOR
**Project:** NASA Space Apps Challenge 2026 — Planet X & SPHEREx Sky Explorer  
**Feature:** Dual-Epoch ($T_1$ vs $T_2$) & Band Selector (D1..D6)  
**Target Scope:** Standalone Input Controller & Data Pairing Module (Khối 1 của Cột Inspector Drawer)  
**Target Files:**
1. `index.html` (UI Markup)
2. `css/styles.css` (Visual Styling)
3. `js/app.js` (State Management & Event Orchestration)

---

## 1. BỐI CẢNH & MỤC TIÊU CỦA MODULE (OBJECTIVE)

### 1.1. Hiện trạng hệ thống (Current Baseline):
- Người dùng nhập tọa độ `(RA, Dec, FOV)`.
- Hệ thống gọi `/api/irsa/sia` lấy danh sách quan sát từ NASA IRSA SIAv2 (trả về 20–60 frames tại tọa độ đó).
- Hiện tại, giao diện chỉ có **1 dropdown đơn lẻ** (`#irsaFrameSelect`) và **1 ô Canvas đơn lẻ** (`#cutoutPreviewCanvas`), chỉ cho phép xem một ảnh duy nhất tại một thời điểm.

### 1.2. Mục tiêu nâng cấp (Target Goal):
Nâng cấp ô chọn frame đơn lẻ thành một **Module Độc Lập: Bộ chọn 2 Thời điểm ($T_1$ vs $T_2$) & Dải phổ (D1..D6)**:
1. **Lọc Dải phổ (Band Filter D1..D6):** Cho phép chọn 1 trong 6 cảm biến SPHEREx (`D1: 0.8–1.1µm`, `D2: 1.1–1.6µm`, `D3: 1.6–2.4µm`, `D4: 2.4–3.8µm`, `D5: 3.8–4.4µm`, `D6: 4.4–5.0µm`).
2. **Cặp thời điểm ($T_1$ vs $T_2$):** Phân loại các frame thuộc dải phổ đã chọn theo dòng thời gian (`t_min_mjd`), cung cấp 2 dropdown:
   - $T_1$ (Baseline - Kỷ nguyên gốc)
   - $T_2$ (Follow-up - Kỷ nguyên đối chứng)
3. **Thước đo khoảng cách thời gian (Baseline Badge):** Tự động tính và hiển thị khoảng cách thời gian $\Delta t = |T_2 - T_1|$ tính theo ngày và năm (VD: `⏱️ Baseline: Δt = 402.8 ngày (~1.1 năm)`).
4. **Nút "Auto Max Baseline":** 1-click tự động chọn frame cũ nhất làm $T_1$ và frame mới nhất làm $T_2$ để đạt khoảng cách thời gian lớn nhất.
5. **Dual Canvas Preview:** Hiển thị song song 2 ảnh cắt FITS thu nhỏ của $T_1$ và $T_2$ ngay tại cột Inspector.
6. **Chuẩn hóa đầu ra (Clean Output Event):** Phát ra sự kiện chuẩn `onDualEpochSelected({ epoch1, epoch2, fits1, fits2, baselineDays, detector })` làm tiền đề độc lập cho các tính năng so sánh sau này (Blink, Difference).

---

## 2. HƯỚNG DẪN TRIỂN KHAI CHI TIẾT (STEP-BY-STEP IMPLEMENTATION)

---

### BƯỚC 1: CẬP NHẬT GIAO DIỆN HTML (`index.html`)

**Vị trí:** Trong thẻ `<aside class="inspector-drawer">`, tìm khối `<!-- KHỐI 1: Gói ảnh cắt (Image Cutout) & Định danh thiên thể -->` (từ dòng chứa `id="cutoutPreviewCanvas"` đến hết `id="irsaFrameSelectorWrap"`).

**Thay thế vùng đó bằng đoạn mã HTML sau:**

```html
<!-- KHỐI 1: BỘ CHỌN ĐA THỜI ĐIỂM & ĐA PHỔ (DUAL-EPOCH & BAND SELECTOR) -->
<div class="drawer-section">
  <div class="section-header">
    <span class="section-title">⏱️ 1. SO SÁNH ĐA THỜI ĐIỂM & ĐA PHỔ</span>
    <span id="hudEpochBadge" class="section-tag">MULTI-EPOCH</span>
  </div>

  <!-- Trạng thái kết nối NASA IRSA -->
  <div id="irsaLiveStatusRow" style="display:flex; align-items:center; justify-content:space-between; gap:6px; margin-bottom:8px;">
    <span id="irsaLiveBadge" class="sync-badge syncing" style="font-size:10px; padding:2px 7px;">
      🛰️ NASA IRSA SIAv2: Đang kết nối...
    </span>
    <span id="irsaFrameCountBadge" style="font-size:10px; color:#7dd3fc; font-family:var(--font-mono);"></span>
  </div>

  <!-- PHẦN A: BỘ LỌC 6 CẢM BIẾN DETECTOR (D1 ĐẾN D6) -->
  <div class="epoch-control-group">
    <label class="epoch-label">🔬 DẢI PHỔ QUAN SÁT (DETECTOR D1–D6):</label>
    <div id="detectorPillsBar" class="detector-pills-row">
      <button type="button" class="det-pill-btn" data-det="1" title="D1: 0.75 - 1.11 µm">D1</button>
      <button type="button" class="det-pill-btn" data-det="2" title="D2: 1.11 - 1.63 µm">D2</button>
      <button type="button" class="det-pill-btn" data-det="3" title="D3: 1.63 - 2.43 µm">D3</button>
      <button type="button" class="det-pill-btn" data-det="4" title="D4: 2.43 - 3.82 µm (Băng nước H2O)">D4</button>
      <button type="button" class="det-pill-btn" data-det="5" title="D5: 3.82 - 4.42 µm">D5</button>
      <button type="button" class="det-pill-btn active" data-det="6" title="D6: 4.41 - 5.01 µm (Thiên thể lạnh / Planet X)">D6 🎯</button>
    </div>
  </div>

  <!-- PHẦN B: CHỌN CẶP THỜI ĐIỂM (T1 vs T2) -->
  <div class="epoch-control-group" style="margin-top:8px;">
    <div class="dual-epoch-grid">
      <!-- Cột T1 -->
      <div class="epoch-box epoch-box-t1">
        <div class="epoch-tag tag-t1">T1: BASELINE (GỐC)</div>
        <select id="epochSelectT1" class="astro-select select-epoch" title="Chọn thời điểm quan sát ban đầu"></select>
      </div>
      <!-- Cột T2 -->
      <div class="epoch-box epoch-box-t2">
        <div class="epoch-tag tag-t2">T2: FOLLOW-UP (MỚI)</div>
        <select id="epochSelectT2" class="astro-select select-epoch" title="Chọn thời điểm quan sát đối chứng"></select>
      </div>
    </div>
  </div>

  <!-- PHẦN C: THANH THỐNG KÊ BASELINE & NÚT AUTO MAX BASELINE -->
  <div class="baseline-action-row">
    <span id="baselineStatsBadge" class="baseline-badge">⏱️ Baseline: Δt = 0.0 ngày</span>
    <button type="button" id="btnAutoMaxBaseline" class="btn-micro" title="Tự động chọn 2 frame có khoảng cách thời gian lớn nhất">
      ⚡ Max Baseline
    </button>
  </div>

  <!-- PHẦN D: DUAL CANVAS PREVIEW (HIỂN THỊ 2 ẢNH CẮT FITS NHỎ T1 VÀ T2) -->
  <div class="dual-cutout-preview-row">
    <div class="cutout-preview-card card-t1">
      <span class="preview-mini-tag">T1 FITS</span>
      <canvas id="cutoutCanvasT1" width="96" height="96"></canvas>
      <span id="epochDateLabelT1" class="preview-date-label">--</span>
    </div>
    <div class="cutout-vs-divider">⚡</div>
    <div class="cutout-preview-card card-t2">
      <span class="preview-mini-tag">T2 FITS</span>
      <canvas id="cutoutCanvasT2" width="96" height="96"></canvas>
      <span id="epochDateLabelT2" class="preview-date-label">--</span>
    </div>
  </div>

  <!-- Tóm tắt thiên thể đang chọn -->
  <div class="target-meta-summary" style="margin-top:8px;">
    <h3 id="hudObjectName">90377 Sedna</h3>
    <p id="hudObjectDesc">Thiên thể xa xôi có quỹ đạo lệch tâm kỳ dị nhất Hệ Mặt Trời.</p>
  </div>
</div>
```

---

### BƯỚC 2: CẬP NHẬT PHONG CÁCH CSS (`css/styles.css`)

**Thêm đoạn CSS sau vào cuối file `css/styles.css`:**

```css
/* ==========================================================================
   MODULE: DUAL-EPOCH & BAND SELECTOR (NASA SCI-FI STYLING)
   ========================================================================== */

.epoch-control-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.epoch-label {
  font-size: 10px;
  font-weight: 700;
  color: #94a3b8;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

/* Thanh nút chọn Detector D1..D6 */
.detector-pills-row {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
}

.det-pill-btn {
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(56, 189, 248, 0.25);
  color: #94a3b8;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 10px;
  font-weight: 700;
  padding: 4px 0;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.18s ease;
  text-align: center;
}

.det-pill-btn:hover {
  background: rgba(56, 189, 248, 0.15);
  color: #e2e8f0;
  border-color: rgba(56, 189, 248, 0.5);
}

.det-pill-btn.active {
  background: rgba(14, 165, 233, 0.25);
  color: #38bdf8;
  border-color: #38bdf8;
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.3);
}

/* Lưới 2 Cột chọn Epoch T1 vs T2 */
.dual-epoch-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.epoch-box {
  background: rgba(15, 23, 42, 0.55);
  border-radius: 6px;
  padding: 6px;
  border: 1px solid rgba(148, 163, 184, 0.15);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.epoch-box-t1 {
  border-color: rgba(56, 189, 248, 0.35);
}

.epoch-box-t2 {
  border-color: rgba(245, 158, 11, 0.35);
}

.epoch-tag {
  font-size: 9px;
  font-weight: 800;
  font-family: var(--font-mono, monospace);
  letter-spacing: 0.5px;
}

.tag-t1 { color: #38bdf8; }
.tag-t2 { color: #f59e0b; }

.select-epoch {
  width: 100%;
  height: 26px;
  font-size: 10px;
  padding: 2px 4px;
  background: rgba(10, 15, 29, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.25);
  color: #f1f5f9;
  border-radius: 4px;
}

/* Thanh Baseline & Nút Auto Max Baseline */
.baseline-action-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-top: 6px;
  background: rgba(15, 23, 42, 0.7);
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px dashed rgba(56, 189, 248, 0.25);
}

.baseline-badge {
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  font-weight: 700;
  color: #4ade80;
}

.btn-micro {
  background: rgba(14, 165, 233, 0.2);
  border: 1px solid rgba(56, 189, 248, 0.4);
  color: #bae6fd;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-micro:hover {
  background: rgba(14, 165, 233, 0.4);
  border-color: #38bdf8;
  color: #ffffff;
}

/* Dual Cutout Preview Row */
.dual-cutout-preview-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 8px;
  padding: 8px 4px;
  background: rgba(10, 15, 29, 0.6);
  border-radius: 6px;
  border: 1px solid rgba(148, 163, 184, 0.12);
}

.cutout-preview-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  position: relative;
}

.cutout-preview-card canvas {
  width: 96px;
  height: 96px;
  border-radius: 4px;
  background: #020617;
  image-rendering: pixelated;
}

.card-t1 canvas {
  border: 1.5px solid rgba(56, 189, 248, 0.6);
}

.card-t2 canvas {
  border: 1.5px solid rgba(245, 158, 11, 0.6);
}

.preview-mini-tag {
  font-size: 8px;
  font-weight: 800;
  font-family: var(--font-mono, monospace);
  color: #94a3b8;
}

.card-t1 .preview-mini-tag { color: #38bdf8; }
.card-t2 .preview-mini-tag { color: #f59e0b; }

.preview-date-label {
  font-size: 9px;
  font-family: var(--font-mono, monospace);
  color: #cbd5e1;
  max-width: 96px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cutout-vs-divider {
  font-weight: 800;
  font-size: 13px;
  color: #7dd3fc;
  font-family: var(--font-mono, monospace);
  text-shadow: 0 0 6px rgba(56, 189, 248, 0.5);
}
```

---

### BƯỚC 3: CẬP NHẬT LOGIC JAVASCRIPT (`js/app.js`)

#### 3.1. Cập nhật DOM Cache trong `cacheDOMElements()`:
Tìm hàm `cacheDOMElements()` trong `js/app.js` và thêm:

```javascript
// Dual-Epoch & Band Selector Controls
dom.detectorPillsBar = document.getElementById("detectorPillsBar");
dom.detPillBtns = document.querySelectorAll(".det-pill-btn");
dom.epochSelectT1 = document.getElementById("epochSelectT1");
dom.epochSelectT2 = document.getElementById("epochSelectT2");
dom.baselineStatsBadge = document.getElementById("baselineStatsBadge");
dom.btnAutoMaxBaseline = document.getElementById("btnAutoMaxBaseline");
dom.cutoutCanvasT1 = document.getElementById("cutoutCanvasT1");
dom.cutoutCanvasT2 = document.getElementById("cutoutCanvasT2");
dom.epochDateLabelT1 = document.getElementById("epochDateLabelT1");
dom.epochDateLabelT2 = document.getElementById("epochDateLabelT2");
```

#### 3.2. Cập nhật đối tượng trạng thái `irsaState`:
Thay thế `let irsaState = { ... }` ở đầu `js/app.js` bằng:

```javascript
let irsaState = {
  siaRows: [],              // Toàn bộ các dòng quan sát từ NASA IRSA SIAv2
  selectedDetector: 6,      // Detector đang chọn (1..6), mặc định 6
  filteredRows: [],         // Danh sách frame đã lọc theo detector và sort tăng dần theo MJD
  epoch1Row: null,          // Frame được chọn ở T1
  epoch2Row: null,          // Frame được chọn ở T2
  parsedFits1: null,        // FITS data đã parse của T1
  parsedFits2: null,        // FITS data đã parse của T2
  queryRa: 56.8392,
  queryDec: 11.9644,
  cutoutSize: 0.1,
  requestId: 0
};
```

#### 3.3. Các hàm logic chính cần bổ sung vào `js/app.js`:

```javascript
/**
 * Lọc danh sách frame theo Detector đã chọn và render danh sách vào Dropdown T1 & T2
 */
function populateEpochControlsForDetector(detectorNum) {
  irsaState.selectedDetector = detectorNum;

  // Cập nhật trạng thái active cho nút bấm D1..D6
  if (dom.detPillBtns) {
    dom.detPillBtns.forEach(btn => {
      btn.classList.toggle("active", parseInt(btn.dataset.det, 10) === detectorNum);
    });
  }

  // Lọc frame thuộc detector này và sắp xếp theo ngày chụp (t_min_mjd tăng dần)
  irsaState.filteredRows = (irsaState.siaRows || [])
    .filter(r => r.detector === detectorNum)
    .sort((a, b) => (a.t_min_mjd || 0) - (b.t_min_mjd || 0));

  if (!irsaState.filteredRows.length) {
    if (dom.epochSelectT1) dom.epochSelectT1.innerHTML = `<option value="">(0 frame D${detectorNum})</option>`;
    if (dom.epochSelectT2) dom.epochSelectT2.innerHTML = `<option value="">(0 frame D${detectorNum})</option>`;
    if (dom.baselineStatsBadge) dom.baselineStatsBadge.textContent = `⚠️ D${detectorNum}: Không có frame tại tọa độ này`;
    return;
  }

  // Tự động chọn cặp: T1 là frame cũ nhất (index 0), T2 là frame mới nhất (index cuối)
  const idx1 = 0;
  const idx2 = irsaState.filteredRows.length > 1 ? irsaState.filteredRows.length - 1 : 0;

  renderEpochOptions(dom.epochSelectT1, irsaState.filteredRows, idx1);
  renderEpochOptions(dom.epochSelectT2, irsaState.filteredRows, idx2);

  updateBaselineStats();
  triggerDualEpochCutoutFetch();
}

/**
 * Đổ dữ liệu frame vào thẻ <select>
 */
function renderEpochOptions(selectEl, rows, selectedIndex) {
  if (!selectEl) return;
  selectEl.innerHTML = rows.map((r, i) => {
    const dateStr = r.obs_date_iso ? r.obs_date_iso.split("T")[0] : `MJD ${(r.t_min_mjd || 0).toFixed(1)}`;
    const collection = (r.collection || "DR1").toUpperCase();
    return `<option value="${i}" ${i === selectedIndex ? "selected" : ""}>
      [${dateStr}] ${collection} (Δ=${(r.distToTarget * 3600).toFixed(0)}")
    </option>`;
  }).join("");
}

/**
 * Tính toán và hiển thị khoảng cách thời gian giữa T1 và T2 (Baseline Delta_t)
 */
function updateBaselineStats() {
  const i1 = parseInt(dom.epochSelectT1?.value, 10);
  const i2 = parseInt(dom.epochSelectT2?.value, 10);
  const r1 = irsaState.filteredRows[i1];
  const r2 = irsaState.filteredRows[i2];

  if (!r1 || !r2) {
    if (dom.baselineStatsBadge) dom.baselineStatsBadge.textContent = "⏱️ Baseline: Δt = 0.0 ngày";
    return;
  }

  irsaState.epoch1Row = r1;
  irsaState.epoch2Row = r2;

  const mjd1 = r1.t_min_mjd || 0;
  const mjd2 = r2.t_min_mjd || 0;
  const deltaDays = Math.abs(mjd2 - mjd1);
  const years = (deltaDays / 365.25).toFixed(1);

  if (dom.baselineStatsBadge) {
    if (deltaDays < 0.001) {
      dom.baselineStatsBadge.textContent = `⏱️ Baseline: Cùng ngày chụp (Δt = 0 ngày)`;
      dom.baselineStatsBadge.style.color = "#f59e0b";
    } else {
      dom.baselineStatsBadge.textContent = `⏱️ Baseline: Δt = ${deltaDays.toFixed(1)} ngày (~${years} năm) • D${irsaState.selectedDetector}`;
      dom.baselineStatsBadge.style.color = "#4ade80";
    }
  }

  // Cập nhật nhãn ngày tháng dưới mỗi ảnh
  if (dom.epochDateLabelT1) dom.epochDateLabelT1.textContent = r1.obs_date_iso?.split("T")[0] || `MJD ${mjd1.toFixed(0)}`;
  if (dom.epochDateLabelT2) dom.epochDateLabelT2.textContent = r2.obs_date_iso?.split("T")[0] || `MJD ${mjd2.toFixed(0)}`;
}

/**
 * Nút 1-Click: Tự động chọn 2 frame có độ chênh ngày lớn nhất
 */
function handleAutoMaxBaseline() {
  if (irsaState.filteredRows.length < 2) return;
  if (dom.epochSelectT1) dom.epochSelectT1.value = 0;
  if (dom.epochSelectT2) dom.epochSelectT2.value = irsaState.filteredRows.length - 1;
  updateBaselineStats();
  triggerDualEpochCutoutFetch();
}

/**
 * Tải đồng thời 2 file FITS Cutout từ NASA IRSA và render lên 2 Canvas T1 và T2
 */
async function triggerDualEpochCutoutFetch() {
  const r1 = irsaState.epoch1Row;
  const r2 = irsaState.epoch2Row;
  if (!r1 || !r2 || !window.SpherexFitsParser) return;

  const reqId = ++irsaState.requestId;

  if (dom.irsaLiveBadge) {
    dom.irsaLiveBadge.textContent = `⏳ Đang tải song song 2 FITS (T1 & T2 • D${irsaState.selectedDetector})...`;
    dom.irsaLiveBadge.className = "sync-badge syncing";
  }

  try {
    const cutoutUrl1 = `/api/irsa/cutout?access_url=${encodeURIComponent(r1.access_url)}&ra=${irsaState.queryRa}&dec=${irsaState.queryDec}&size=${irsaState.cutoutSize}&mode=compact`;
    const cutoutUrl2 = `/api/irsa/cutout?access_url=${encodeURIComponent(r2.access_url)}&ra=${irsaState.queryRa}&dec=${irsaState.queryDec}&size=${irsaState.cutoutSize}&mode=compact`;

    // Gọi song song 2 request mạng cùng lúc
    const [resp1, resp2] = await Promise.all([
      fetch(cutoutUrl1),
      fetch(cutoutUrl2)
    ]);

    if (reqId !== irsaState.requestId) return;
    if (!resp1.ok || !resp2.ok) throw new Error("Cutout HTTP error");

    const [buf1, buf2] = await Promise.all([resp1.arrayBuffer(), resp2.arrayBuffer()]);
    if (reqId !== irsaState.requestId) return;

    irsaState.parsedFits1 = window.SpherexFitsParser.parseMultiExtensionFits(buf1);
    irsaState.parsedFits2 = window.SpherexFitsParser.parseMultiExtensionFits(buf2);

    // Vẽ lên Canvas T1
    if (dom.cutoutCanvasT1 && irsaState.parsedFits1) {
      window.SpherexFitsParser.renderFitsToCanvas(irsaState.parsedFits1, dom.cutoutCanvasT1, {
        subtractZodi: skyEngine.shader.subtractZodi,
        brightness: skyEngine.shader.brightness,
        contrast: skyEngine.shader.contrast,
        colormap: "infrared"
      });
    }

    // Vẽ lên Canvas T2
    if (dom.cutoutCanvasT2 && irsaState.parsedFits2) {
      window.SpherexFitsParser.renderFitsToCanvas(irsaState.parsedFits2, dom.cutoutCanvasT2, {
        subtractZodi: skyEngine.shader.subtractZodi,
        brightness: skyEngine.shader.brightness,
        contrast: skyEngine.shader.contrast,
        colormap: "infrared"
      });
    }

    // Hiển thị frame T2 lên Canvas bầu trời chính
    const offCanvas = window.SpherexFitsParser.renderFitsToCanvas(irsaState.parsedFits2, null, {
      subtractZodi: skyEngine.shader.subtractZodi,
      brightness: skyEngine.shader.brightness,
      contrast: skyEngine.shader.contrast,
      colormap: "infrared"
    });
    skyEngine.setRealFitsCutout(irsaState.parsedFits2, offCanvas, skyEngine.ra, skyEngine.dec, irsaState.cutoutSize);

    if (dom.irsaLiveBadge) {
      dom.irsaLiveBadge.textContent = `🟢 LIVE FITS T1 & T2 (D${irsaState.selectedDetector} • Δt=${Math.abs((r2.t_min_mjd||0)-(r1.t_min_mjd||0)).toFixed(0)}d)`;
      dom.irsaLiveBadge.className = "sync-badge synced";
    }
  } catch (err) {
    if (reqId !== irsaState.requestId) return;
    if (dom.irsaLiveBadge) {
      dom.irsaLiveBadge.textContent = `⚠️ Lỗi tải FITS (${err.message})`;
      dom.irsaLiveBadge.className = "sync-badge syncing";
    }
  }
}
```

#### 3.4. Gắn sự kiện trong hàm `bindEventListeners()`:
Trong hàm `bindEventListeners()` của `js/app.js`:

```javascript
// 1. Sự kiện bấm chọn nút Detector D1..D6
if (dom.detPillBtns) {
  dom.detPillBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const det = parseInt(btn.dataset.det, 10);
      if (!isNaN(det)) {
        populateEpochControlsForDetector(det);
      }
    });
  });
}

// 2. Sự kiện thay đổi dropdown T1 hoặc T2
if (dom.epochSelectT1) {
  dom.epochSelectT1.addEventListener("change", () => {
    updateBaselineStats();
    triggerDualEpochCutoutFetch();
  });
}

if (dom.epochSelectT2) {
  dom.epochSelectT2.addEventListener("change", () => {
    updateBaselineStats();
    triggerDualEpochCutoutFetch();
  });
}

// 3. Sự kiện bấm nút Auto Max Baseline
if (dom.btnAutoMaxBaseline) {
  dom.btnAutoMaxBaseline.addEventListener("click", handleAutoMaxBaseline);
}
```

#### 3.5. Kết nối luồng tìm kiếm ban đầu (`fetchRealIrsaDataForTarget`):
Tại cuối hàm `fetchRealIrsaDataForTarget` (khi đã nhận được `rows = window.SpherexFitsParser.parseSiaCsv(...)`):
Thay vì gọi `loadAndRenderRealFitsFrame`, hãy kích hoạt module mới:

```javascript
irsaState.siaRows = rows;
// Ưu tiên chọn detector khuyên dùng của mục tiêu (hoặc mặc định D6)
const defaultDet = (matchedObj?.recommended_detectors && matchedObj.recommended_detectors[0]) || 6;
populateEpochControlsForDetector(defaultDet);
```

---

## 3. TIÊU CHÍ NGHIỆM THU & KIỂM THỬ (ACCEPTANCE CRITERIA)

| Mục tiêu kiểm thử | Thao tác kiểm tra | Kết quả kỳ vọng |
| :--- | :--- | :--- |
| **1. Khởi động mục tiêu** | Bấm chọn `90377 Sedna` hoặc `Barnard's Star` | Nút `D6` tự động active. Dropdown $T_1$ và $T_2$ tự động điền danh sách các frame. |
| **2. Chuyển đổi Detector** | Bấm qua `D5`, `D4`, `D1` | Cả 2 dropdown $T_1, T_2$ lập tức cập nhật danh sách quan sát riêng của detector đó. |
| **3. Baseline calculation** | Chọn $T_1$ ngày cũ và $T_2$ ngày mới | Huy hiệu xanh hiện: `⏱️ Baseline: Δt = ... ngày`. |
| **4. Auto Max Baseline** | Bấm nút `⚡ Max Baseline` | $T_1$ nhảy về ngày cũ nhất, $T_2$ nhảy về ngày mới nhất, $\Delta t$ đạt giá trị lớn nhất. |
| **5. Dual Canvas Preview** | Kiểm tra 2 ô vuông xem trước | Cả 2 ô canvas $T_1$ và $T_2$ render ảnh FITS 32-bit thật, có nhãn ngày tháng rõ ràng. |
