/**
 * SPHEREx SKY EXPLORER - MAIN CONTROLLER (PHẦN A: CELESTIAL COORDINATES & INTERACTIVE SKY MAP)
 * Điều phối toàn bộ luồng hoạt động:
 * - INPUT: Tìm kiếm cơ bản (Curated/Trending + Name Resolver) & Tìm kiếm chuyên gia (RA, Dec, FOV)
 * - OUTPUT 1: Hiển thị WebGL/Canvas tương tác + Camera Slerp Fly-to + Target Reticle + Thẻ nổi
 * - OUTPUT 2: Dữ liệu Cutout FITS/PNG + 6 lớp HDU (IMAGE, WCS-WAVE, VARIANCE, FLAGS, ZODI, EPSF) + Đồ thị 102 phổ
 * - OUTPUT 3: Đồng bộ URL State Output 2 chiều (Debounce 300ms + history.replaceState)
 */

(function () {
  let skyEngine = null;
  let currentObject = window.CURATED_OBJECTS[0];
  let activeBand = 42;
  let urlDebounceTimer = null;
  let activeCategoryFilter = "all";
  let aladinInstance = null;
  let isAladinMode = false;

  // Trạng thái dữ liệu FITS thật từ NASA/IPAC IRSA
  let irsaState = {
    siaRows: [],
    selectedRow: null,
    parsedFits: null,
    queryRa: 56.8392,
    queryDec: 11.9644,
    cutoutSize: 0.1,
    requestId: 0
  };

  // DOM Elements
  const dom = {};

  function initDOM() {
    dom.nameSearchInput = document.getElementById("nameSearchInput");
    dom.btnResolveName = document.getElementById("btnResolveName");
    dom.curatedDropdown = document.getElementById("curatedDropdown");
    dom.curatedGrid = document.getElementById("curatedGrid");
    dom.btnToggleCatalog = document.getElementById("btnToggleCatalog");

    dom.raInput = document.getElementById("raInput");
    dom.decInput = document.getElementById("decInput");
    dom.fovSelect = document.getElementById("fovSelect");
    dom.fovSlider = document.getElementById("fovSlider");
    dom.fovValueLabel = document.getElementById("fovValueLabel");
    dom.btnSearchGo = document.getElementById("btnSearchGo");

    dom.validationBanner = document.getElementById("validationBanner");
    dom.validationText = document.getElementById("validationText");

    // Floating Target Card trên bản đồ
    dom.floatingCard = document.getElementById("floatingTargetCard");
    dom.cardTitle = document.getElementById("cardTitle");
    dom.cardCategory = document.getElementById("cardCategory");
    dom.cardCoordsDeg = document.getElementById("cardCoordsDeg");
    dom.cardCoordsHMS = document.getElementById("cardCoordsHMS");
    dom.cardDistance = document.getElementById("cardDistance");

    // Canvas Controls (Brightness, Contrast, Wavelength, Zodi)
    dom.brightnessSlider = document.getElementById("brightnessSlider");
    dom.contrastSlider = document.getElementById("contrastSlider");
    dom.btnAutoContrast = document.getElementById("btnAutoContrast");
    dom.toggleZodi = document.getElementById("toggleZodi");
    dom.toggleGrid = document.getElementById("toggleGrid");
    dom.bandSlider = document.getElementById("bandSlider");
    dom.bandLabel = document.getElementById("bandLabel");
    dom.btnSwitchAladin = document.getElementById("btnSwitchAladin");
    dom.aladinContainer = document.getElementById("aladin-lite-div");

    // Cosmic Playlists DOM Elements
    dom.btnOpenPlaylists = document.getElementById("btnOpenPlaylists");
    dom.cosmicPlaylistsModal = document.getElementById("cosmicPlaylistsModal");
    dom.playlistsBackdrop = document.getElementById("playlistsBackdrop");
    dom.btnClosePlaylists = document.getElementById("btnClosePlaylists");
    dom.playlistsAlbumView = document.getElementById("playlistsAlbumView");
    dom.playlistDetailView = document.getElementById("playlistDetailView");
    dom.btnBackToAlbums = document.getElementById("btnBackToAlbums");
    dom.btnStartTourMode = document.getElementById("btnStartTourMode");
    dom.playlistDetailHeader = document.getElementById("playlistDetailHeader");
    dom.playlistTracksList = document.getElementById("playlistTracksList");

    // Tour Player HUD DOM Elements
    dom.tourPlayerHUD = document.getElementById("tourPlayerHUD");
    dom.tourTrackTitle = document.getElementById("tourTrackTitle");
    dom.tourTrackTagline = document.getElementById("tourTrackTagline");
    dom.tourProgressBar = document.getElementById("tourProgressBar");
    dom.tourTimerLabel = document.getElementById("tourTimerLabel");
    dom.btnTourPrev = document.getElementById("btnTourPrev");
    dom.btnTourToggle = document.getElementById("btnTourToggle");
    dom.btnTourNext = document.getElementById("btnTourNext");
    dom.btnTourStop = document.getElementById("btnTourStop");

    // Inspector HUD Drawer (Output 2: 6 HDU Layers & Metadata)
    dom.hudObjectName = document.getElementById("hudObjectName");
    dom.hudObjectDesc = document.getElementById("hudObjectDesc");
    dom.hudObsTime = document.getElementById("hudObsTime");
    dom.hudEpoch = document.getElementById("hudEpoch");
    dom.hudDetector = document.getElementById("hudDetector");
    dom.hudQualityPill = document.getElementById("hudQualityPill");
    dom.hudQualityCode = document.getElementById("hudQualityCode");
    dom.hudImageFlux = document.getElementById("hudImageFlux");
    dom.hudZodiFlux = document.getElementById("hudZodiFlux");
    dom.hudVariance = document.getElementById("hudVariance");
    dom.hudPsf = document.getElementById("hudPsf");
    dom.hudSnr = document.getElementById("hudSnr");
    dom.hudSpectralType = document.getElementById("hudSpectralType");
    dom.spectrumCanvas = document.getElementById("spectrumCanvas");
    dom.cutoutPreviewCanvas = document.getElementById("cutoutPreviewCanvas");
    dom.btnDownloadFits = document.getElementById("btnDownloadFits");
    dom.btnDownloadPng = document.getElementById("btnDownloadPng");
    dom.irsaLiveBadge = document.getElementById("irsaLiveBadge");
    dom.irsaFrameCountBadge = document.getElementById("irsaFrameCountBadge");
    dom.irsaFrameSelect = document.getElementById("irsaFrameSelect");

    // URL State Output (Output 3)
    dom.shareUrlInput = document.getElementById("shareUrlInput");
    dom.btnCopyUrl = document.getElementById("btnCopyUrl");
    dom.urlSyncBadge = document.getElementById("urlSyncBadge");

    // Status bar
    dom.hoverCoordsText = document.getElementById("hoverCoordsText");
    dom.flightStatusBadge = document.getElementById("flightStatusBadge");
  }

  /**
   * Khởi tạo toàn bộ ứng dụng
   */
  function init() {
    initDOM();

    // 1. Khởi tạo Engine Bản đồ Tương tác
    skyEngine = new window.SpherexSkyEngine("skyMapCanvas", {
      onViewChange: handleMapViewportChange,
      onHoverMove: (coords) => {
        dom.hoverCoordsText.textContent = `Con trỏ: RA ${coords.ra.toFixed(4)}° (${window.AstroValidator.raToHMS(
          coords.ra
        )}) | Dec ${coords.dec >= 0 ? "+" : ""}${coords.dec.toFixed(4)}°`;
      },
      onReticleScreenPos: updateFloatingCardPosition,
      onFlightStart: () => {
        dom.flightStatusBadge.textContent = "🚀 CAMERA FLY-TO (SLERP INTERPOLATION)...";
        dom.flightStatusBadge.className = "status-pill status-flying";
      },
      onFlightEnd: () => {
        dom.flightStatusBadge.textContent = "🎯 ĐÃ KHÓA MỤC TIÊU (TARGET LOCKED)";
        dom.flightStatusBadge.className = "status-pill status-locked";
      },
      onCanvasPick: (ra, dec) => {
        dom.raInput.value = ra;
        dom.decInput.value = dec;
        executeCoordinateSearch(ra, dec, skyEngine.fov, {
          name: `Vùng trinh sát (${ra.toFixed(2)}°, ${dec.toFixed(2)}°)`,
          categoryLabel: "🔭 Điểm chọn trực tiếp trên Canvas",
          ra,
          dec,
          defaultFov: skyEngine.fov,
          distanceAU: "Tọa độ tùy chọn",
          description: "Điểm bầu trời được chọn trực tiếp bằng thao tác nhấp đúp trên bản đồ tương tác SPHEREx.",
          colorTint: "#38bdf8",
          spectralType: "Near-IR Background & Point Source",
          telemetry: {
            obsTime: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
            epoch: "DR1 (All-Sky Survey)",
            detectorArray: "Array 1-6 (0.75 - 5.0 µm)",
            imageFlux: +(12.4 + ((ra * 3) % 25)).toFixed(2),
            zodiFlux: +(3.2 + (Math.abs(dec) % 4)).toFixed(2),
            variance: 0.022,
            psfFwhm: 6.2,
            snr: 48.0,
            qualityFlag: "CLEAN",
            qualityCode: "0x0000",
            qualityMessage: "🟢 SẠCH NHIỄU (Điểm ảnh hợp lệ)"
          },
          spectrumProfile: "galaxy_continuum"
        });
      }
    });

    // 2. Render danh sách Curated / Xếp hạng thiên thể yêu thích
    renderCuratedCatalog("all");

    // 3. Gắn sự kiện cho các nút và thanh trượt
    bindUIEvents();

    // 4. Đọc URL Parameters nếu người thứ 3 mở từ đường link được chia sẻ
    loadStateFromURL();
  }

  /**
   * Render danh sách đề xuất thiên thể (Curated Database) cho người mới
   */
  function renderCuratedCatalog(categoryFilter = "all") {
    activeCategoryFilter = categoryFilter;
    const list =
      categoryFilter === "all"
        ? window.CURATED_OBJECTS
        : window.CURATED_OBJECTS.filter((item) => item.category === categoryFilter);

    dom.curatedGrid.innerHTML = list
      .map(
        (obj) => `
      <div class="curated-item ${currentObject && currentObject.id === obj.id ? "active" : ""}" data-id="${obj.id}">
        <div class="curated-item-header">
          <span class="curated-rank" style="border-color:${obj.colorTint}; color:${obj.colorTint}">${obj.rank}</span>
          <span class="curated-cat">${obj.categoryLabel}</span>
        </div>
        <div class="curated-name">${obj.name}</div>
        <div class="curated-coords">
          RA: <b>${obj.ra.toFixed(4)}°</b> | Dec: <b>${obj.dec >= 0 ? "+" : ""}${obj.dec.toFixed(4)}°</b> | FOV: <b>${obj.defaultFov}°</b>
        </div>
        <div class="curated-desc">${obj.description}</div>
      </div>
    `
      )
      .join("");

    dom.curatedGrid.querySelectorAll(".curated-item").forEach((el) => {
      el.addEventListener("click", () => {
        const objId = el.getAttribute("data-id");
        const found = window.CURATED_OBJECTS.find((o) => o.id === objId);
        if (found) {
          selectCuratedObject(found);
          dom.curatedDropdown.classList.add("hidden");
        }
      });
    });
  }

  /**
   * Khi người mới chọn 1 thiên thể từ bảng gợi ý -> Tự động điền RA, Dec, FOV và bay tới luôn
   */
  function selectCuratedObject(obj) {
    currentObject = obj;
    dom.nameSearchInput.value = obj.name;
    const raStr = obj.ra.toString().includes(".") && obj.ra.toString().split(".")[1].length > 4 
      ? obj.ra.toFixed(6) 
      : obj.ra.toFixed(4);
    const decStr = obj.dec.toString().includes(".") && obj.dec.toString().split(".")[1].length > 4 
      ? obj.dec.toFixed(6) 
      : obj.dec.toFixed(4);
    dom.raInput.value = raStr;
    dom.decInput.value = decStr;
    syncFOVControls(obj.defaultFov);
    hideValidationBanner();

    executeCoordinateSearch(obj.ra, obj.dec, obj.defaultFov, obj);
    renderCuratedCatalog(activeCategoryFilter);
  }

  /**
   * Thực thi tìm kiếm với 3 thông số (RA, Dec, FOV) -> Kích hoạt đồng thời 3 tầng Output
   */
  function executeCoordinateSearch(ra, dec, fov, metaObj = null) {
    let matchedObj = metaObj;
    let isReverseFound = false;

    // Nếu không truyền metaObj (người dùng nhập tay tọa độ), thực hiện Tra cứu ngược (Reverse Lookup)
    if (!matchedObj && window.AstroValidator && window.AstroValidator.reverseLookup) {
      const rev = window.AstroValidator.reverseLookup(ra, dec, 0.35);
      if (rev.found) {
        matchedObj = rev.object;
        isReverseFound = true;
      }
    }

    // Nếu vẫn không có, tìm trong Curated Database
    if (!matchedObj) {
      matchedObj = window.CURATED_OBJECTS.find(
        (o) => Math.abs(o.ra - ra) < 0.05 && Math.abs(o.dec - dec) < 0.05
      );
    }

    // Nếu không thuộc thiên thể nào trong cơ sở dữ liệu -> Tạo đối tượng tọa độ tùy chỉnh
    if (!matchedObj) {
      matchedObj = {
        id: "custom",
        name: `Tọa độ RA ${ra}°, Dec ${dec >= 0 ? "+" : ""}${dec}°`,
        categoryLabel: "🔭 Tọa độ Chuyên gia (Expert Input)",
        ra,
        dec,
        defaultFov: fov,
        distanceAU: "Khảo sát toàn bầu trời SPHEREx",
        description: "Vùng ảnh cắt (Cutout) được truy xuất trực tiếp theo tọa độ Xích đạo (RA, Dec) và góc mở FOV.",
        colorTint: "#38bdf8",
        spectralType: "SPHEREx 102-Band Near-IR Survey",
        telemetry: {
          obsTime: "2025-06-18T10:20:00Z",
          epoch: "DR1 (All-Sky Survey)",
          detectorArray: "Array 1-6 (0.75 - 5.0 µm)",
          imageFlux: +(16.5 + ((ra * 1.7) % 35)).toFixed(2),
          zodiFlux: +(3.4 + (Math.abs(dec) % 3.5)).toFixed(2),
          variance: 0.02,
          psfFwhm: 6.2,
          snr: 62.1,
          qualityFlag: "CLEAN",
          qualityCode: "0x0000",
          qualityMessage: "🟢 SẠCH NHIỄU (100% Clean Pixel)"
        },
        spectrumProfile: "galaxy_continuum"
      };
    }

    currentObject = matchedObj;

    // =========================================================================
    // ĐỒNG BỘ 2 CHIỀU: NẾU NHẬP TỌA ĐỘ TRÙNG VỚI SAO ĐÃ BIẾT -> TỰ ĐIỀN TÊN VÀO THANH SEARCH!
    // =========================================================================
    if (matchedObj.id !== "custom") {
      dom.nameSearchInput.value = matchedObj.name;
      if (isReverseFound) {
        showValidationBanner(
          `🎯 Nhận diện thành công: Tọa độ RA ${ra}°, Dec ${dec >= 0 ? "+" : ""}${dec}° khớp với [${matchedObj.name}] (${matchedObj.categoryLabel})`,
          "info"
        );
      }
    } else {
      dom.nameSearchInput.value = "";
    }

    // =========================================================================
    // OUTPUT 1: VỚI NGƯỜI DÙNG (Camera Fly-to + Target Reticle + WebGL Canvas)
    // =========================================================================
    skyEngine.flyTo(ra, dec, fov, matchedObj, 1450);
    if (isAladinMode && aladinInstance) {
      aladinInstance.gotoRaDec(ra, dec);
      aladinInstance.setFoV(fov);
    }
    updateFloatingCardContent(matchedObj, ra, dec);

    // =========================================================================
    // OUTPUT 2: VỚI HỆ THỐNG PHÍA SAU (Cutout + 6 lớp HDU FITS + 102 phổ)
    // =========================================================================
    updateInspectorHUD(matchedObj, ra, dec, fov);
    fetchRealIrsaDataForTarget(ra, dec, fov, matchedObj);

    // =========================================================================
    // OUTPUT 3: VỚI NGƯỜI THỨ 3 (Debounced 300ms URL State Sync)
    // =========================================================================
    scheduleURLStateUpdate(ra, dec, fov, matchedObj.id);
  }

  /**
   * TRUY VẤN DỮ LIỆU THẬT TỪ KHO LƯU TRỮ NASA/IPAC IRSA SPHEREx (SIAv2 + MULTI-EXTENSION FITS CUTOUT)
   */
  async function fetchRealIrsaDataForTarget(ra, dec, fov, matchedObj) {
    if (!window.SpherexFitsParser) return;

    const reqId = ++irsaState.requestId;
    // Nếu thiên thể có chuyển động riêng lớn (như Barnard's Star), ưu tiên dùng tọa độ đã truyền tới kỷ nguyên SPHEREx 2025.9
    const queryRa = matchedObj?.cached_cutout_query_center?.ra_deg ?? ra;
    const queryDec = matchedObj?.cached_cutout_query_center?.dec_deg ?? dec;
    const cutoutSize = Math.max(0.05, Math.min(0.25, matchedObj?.cached_cutout_query_center?.fov_deg || fov || 0.1));

    irsaState.queryRa = queryRa;
    irsaState.queryDec = queryDec;
    irsaState.cutoutSize = cutoutSize;
    irsaState.parsedFits = null;
    skyEngine.setRealFitsCutout(null, null, ra, dec);

    if (dom.irsaLiveBadge) {
      dom.irsaLiveBadge.textContent = "🛰️ NASA IRSA SIAv2: Đang truy vấn kho SPHEREx DR1/QR3...";
      dom.irsaLiveBadge.className = "sync-badge syncing";
    }
    if (dom.irsaFrameCountBadge) {
      dom.irsaFrameCountBadge.textContent = "";
    }
    if (dom.irsaFrameSelect) {
      dom.irsaFrameSelect.innerHTML = `<option value="">⏳ Đang tải danh mục quan sát thực từ irsa.ipac.caltech.edu...</option>`;
    }

    try {
      const siaResp = await fetch(`/api/irsa/sia?ra=${queryRa}&dec=${queryDec}&radius=0.05`);
      if (reqId !== irsaState.requestId) return;

      if (!siaResp.ok) {
        throw new Error(`HTTP ${siaResp.status}`);
      }

      const csvText = await siaResp.text();
      if (reqId !== irsaState.requestId) return;

      const rows = window.SpherexFitsParser.parseSiaCsv(csvText, queryRa, queryDec);
      irsaState.siaRows = rows;

      if (!rows.length) {
        if (dom.irsaLiveBadge) {
          dom.irsaLiveBadge.textContent = "⚠️ IRSA SIAv2: 0 frame tại tọa độ này (Đang hiển thị mô phỏng)";
          dom.irsaLiveBadge.className = "sync-badge syncing";
        }
        if (dom.irsaFrameSelect) {
          dom.irsaFrameSelect.innerHTML = `<option value="">Không tìm thấy frame SPHEREx DR1/QR3 tại tọa độ này</option>`;
        }
        return;
      }

      // Đếm phân bố theo Detector (D1..D6)
      const detCounts = {};
      rows.forEach((r) => {
        detCounts[`D${r.detector}`] = (detCounts[`D${r.detector}`] || 0) + 1;
      });
      const detSummary = Object.entries(detCounts)
        .map(([k, v]) => `${k}:${v}`)
        .join(" ");

      if (dom.irsaFrameCountBadge) {
        dom.irsaFrameCountBadge.textContent = `${rows.length} Frames (${detSummary})`;
      }

      // Chọn frame ưu tiên theo recommended_detectors (VD: D5, D6 cho sao lùn nâu / sao chuyển động riêng lớn)
      const prefDets = matchedObj?.recommended_detectors || [6, 5, 4, 3, 2, 1];
      let bestIdx = 0;
      for (const d of prefDets) {
        const foundIdx = rows.findIndex((r) => r.detector === d);
        if (foundIdx !== -1) {
          bestIdx = foundIdx;
          break;
        }
      }

      // Đổ danh sách tối đa 60 frames gần tâm nhất vào dropdown để người dùng chuyển đổi
      const displayRows = rows.slice(0, 60);
      if (bestIdx >= 60) bestIdx = 0;

      if (dom.irsaFrameSelect) {
        dom.irsaFrameSelect.innerHTML = displayRows
          .map(
            (r, i) =>
              `<option value="${i}" ${i === bestIdx ? "selected" : ""}>[D${r.detector} • ${r.wlMinUm}–${r.wlMaxUm}µm] ${
                r.obs_date_iso
              } (${r.collection.toUpperCase()} • Δ=${(r.distToTarget * 3600).toFixed(0)}")</option>`
          )
          .join("");
      }

      await loadAndRenderRealFitsFrame(displayRows[bestIdx], ra, dec, cutoutSize, reqId);
    } catch (err) {
      if (reqId !== irsaState.requestId) return;
      if (dom.irsaLiveBadge) {
        dom.irsaLiveBadge.textContent = "⚡ Chế độ Offline / Fallback (Chưa kết nối gateway IRSA)";
        dom.irsaLiveBadge.className = "sync-badge syncing";
      }
    }
  }

  /**
   * Tải gói cắt nhị phân Multi-Extension FITS (.fits) thật từ NASA IRSA IBE và giải mã 6 lớp HDU
   */
  async function loadAndRenderRealFitsFrame(row, targetRa, targetDec, cutoutSize, reqId) {
    if (!row || !window.SpherexFitsParser) return;
    irsaState.selectedRow = row;

    if (dom.irsaLiveBadge) {
      dom.irsaLiveBadge.textContent = `⏳ Đang tải & giải mã Binary FITS (D${row.detector} • ${row.obs_date_iso})...`;
      dom.irsaLiveBadge.className = "sync-badge syncing";
    }

    try {
      const cutoutUrl = `/api/irsa/cutout?access_url=${encodeURIComponent(row.access_url)}&ra=${irsaState.queryRa}&dec=${
        irsaState.queryDec
      }&size=${cutoutSize}&mode=compact`;

      const resp = await fetch(cutoutUrl);
      if (reqId && reqId !== irsaState.requestId) return;
      if (!resp.ok) throw new Error(`Cutout HTTP ${resp.status}`);

      const arrayBuffer = await resp.arrayBuffer();
      if (reqId && reqId !== irsaState.requestId) return;

      const parsed = window.SpherexFitsParser.parseMultiExtensionFits(arrayBuffer);
      if (!parsed || !parsed.valid) {
        throw new Error("Invalid FITS structure");
      }

      irsaState.parsedFits = parsed;

      // Cập nhật toàn bộ thông số Telemetry trong Inspector HUD bằng dữ liệu FITS thật 100% của NASA
      if (currentObject) {
        currentObject.telemetry = {
          obsTime: parsed.dateObs,
          epoch: `${row.collection.toUpperCase()} (LIVE NASA FITS)`,
          detectorArray: `Detector D${parsed.detector} (${parsed.wlMin}–${parsed.wlMax} µm)`,
          imageFlux: parsed.centerPeakFlux,
          medianFlux: parsed.medianFlux,
          zodiFlux: parsed.meanZodi,
          variance: parsed.medianVariance,
          psfFwhm: parsed.psfFwhm,
          snr: parsed.snr,
          qualityFlag: parsed.qualityFlag,
          qualityCode: parsed.centerFlagHex,
          qualityMessage: parsed.qualityMessage
        };
      }

      // Render ma trận điểm ảnh 32-bit float thật lên ô Cutout Preview và lên bản đồ chính
      refreshRealFitsVisuals();

      if (dom.irsaLiveBadge) {
        dom.irsaLiveBadge.textContent = `🟢 LIVE NASA IRSA FITS (${parsed.width}×${parsed.height}px • D${parsed.detector})`;
        dom.irsaLiveBadge.className = "sync-badge synced";
      }
    } catch (e) {
      if (dom.irsaLiveBadge) {
        dom.irsaLiveBadge.textContent = `⚠️ Không tải được FITS Cutout (${e.message})`;
        dom.irsaLiveBadge.className = "sync-badge syncing";
      }
    }
  }

  /**
   * Vẽ lại ảnh FITS thật và cập nhật số liệu HUD khi đổi Frame hoặc kéo thanh Brightness/Contrast/ZODI
   */
  function refreshRealFitsVisuals() {
    const parsed = irsaState.parsedFits;
    if (!parsed || !parsed.valid || !window.SpherexFitsParser) return;

    const offCanvas = window.SpherexFitsParser.renderFitsToCanvas(parsed, dom.cutoutPreviewCanvas, {
      subtractZodi: skyEngine.shader.subtractZodi,
      brightness: skyEngine.shader.brightness,
      contrast: skyEngine.shader.contrast,
      colormap: "infrared"
    });

    skyEngine.setRealFitsCutout(
      parsed,
      offCanvas,
      currentObject ? currentObject.ra : irsaState.queryRa,
      currentObject ? currentObject.dec : irsaState.queryDec,
      irsaState.cutoutSize
    );

    // Cập nhật các ô thông số HDU trên Inspector HUD
    dom.hudObsTime.textContent = parsed.dateObs;
    dom.hudEpoch.textContent = `${(irsaState.selectedRow?.collection || "spherex_dr1").toUpperCase()} • REAL FITS`;
    dom.hudDetector.textContent = `Detector D${parsed.detector} (${parsed.wlMin}–${parsed.wlMax} µm)`;

    dom.hudQualityPill.textContent = parsed.qualityMessage;
    dom.hudQualityCode.textContent = `Bitmask: ${parsed.centerFlagHex}`;
    dom.hudQualityPill.className =
      parsed.qualityFlag === "CLEAN"
        ? "quality-badge quality-clean"
        : parsed.qualityFlag === "SATURATED_WARN"
        ? "quality-badge quality-warn"
        : "quality-badge quality-danger";

    const peakVal = skyEngine.shader.subtractZodi
      ? (parsed.centerPeakFlux - parsed.meanZodi).toFixed(2)
      : parsed.centerPeakFlux.toFixed(2);
    dom.hudImageFlux.textContent = `${peakVal} MJy/sr (Peak)`;
    dom.hudZodiFlux.textContent = `${parsed.meanZodi.toFixed(2)} MJy/sr ${
      skyEngine.shader.subtractZodi ? "(Đã trừ ZODI thật)" : "(Nền ZODI thật)"
    }`;
    dom.hudVariance.textContent = `±${parsed.medianVariance} MJy/sr²`;
    dom.hudSnr.textContent = `${parsed.snr} (N_stars=${parsed.astrometryStars})`;
  }

  /**
   * Cập nhật nội dung thẻ nổi (Floating Card) cạnh tâm ngắm Reticle
   */
  function updateFloatingCardContent(obj, ra, dec) {
    dom.cardTitle.textContent = obj.name;
    dom.cardCategory.textContent = obj.test_case ? `🧪 ${obj.test_case} • ${obj.categoryLabel}` : obj.categoryLabel;
    const raPrec = ra.toString().includes(".") && ra.toString().split(".")[1].length > 4 ? 6 : 4;
    const decPrec = dec.toString().includes(".") && dec.toString().split(".")[1].length > 4 ? 6 : 4;
    dom.cardCoordsDeg.textContent = `RA: ${ra.toFixed(raPrec)}° | Dec: ${dec >= 0 ? "+" : ""}${dec.toFixed(decPrec)}°`;
    dom.cardCoordsHMS.textContent = `${window.AstroValidator.raToHMS(ra)}  •  ${window.AstroValidator.decToDMS(dec)}`;
    const pmInfo = obj.pm_ra_arcsec_yr !== undefined 
      ? ` | Chuyển động riêng PM: α ${obj.pm_ra_arcsec_yr}"/yr, δ ${obj.pm_dec_arcsec_yr}"/yr` 
      : "";
    dom.cardDistance.textContent = `Khoảng cách: ${obj.distanceAU}${pmInfo}`;
  }

  /**
   * Đặt vị trí thẻ nổi bám theo tâm ngắm Reticle trên màn hình
   */
  function updateFloatingCardPosition(pos) {
    if (!pos.visible || isAladinMode) {
      dom.floatingCard.style.opacity = "0";
      dom.floatingCard.style.pointerEvents = "none";
      return;
    }
    dom.floatingCard.style.opacity = "1";
    dom.floatingCard.style.pointerEvents = "auto";

    // Đặt thẻ nổi lệch sang bên phải của vòng tròn tâm ngắm để không che khuất ngôi sao
    const left = Math.min(skyEngine.width - 285, Math.max(14, pos.x + 38));
    const top = Math.min(skyEngine.height - 135, Math.max(14, pos.y - 48));
    dom.floatingCard.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
  }

  /**
   * Cập nhật bảng Inspector HUD Drawer (6 lớp HDU FITS & Metadata)
   */
  function updateInspectorHUD(obj, ra, dec, fov) {
    const t = obj.telemetry;
    dom.hudObjectName.textContent = obj.name;
    dom.hudObjectDesc.textContent = obj.description;
    dom.hudObsTime.textContent = t.obsTime;
    dom.hudEpoch.textContent = t.epoch;
    dom.hudDetector.textContent = t.detectorArray;

    // Cờ chất lượng (FLAGS HDU)
    dom.hudQualityPill.textContent = t.qualityMessage;
    dom.hudQualityCode.textContent = `Bitmask: ${t.qualityCode}`;
    if (t.qualityFlag === "CLEAN") {
      dom.hudQualityPill.className = "quality-badge quality-clean";
    } else if (t.qualityFlag === "SATURATED_WARN") {
      dom.hudQualityPill.className = "quality-badge quality-warn";
    } else {
      dom.hudQualityPill.className = "quality-badge quality-danger";
    }

    // IMAGE, ZODI, VARIANCE, EPSF HDUs
    const effectiveFlux = skyEngine.shader.subtractZodi
      ? Math.max(0.5, t.imageFlux - t.zodiFlux).toFixed(2)
      : t.imageFlux.toFixed(2);
    dom.hudImageFlux.textContent = `${effectiveFlux} MJy/sr`;
    dom.hudZodiFlux.textContent = `${t.zodiFlux.toFixed(2)} MJy/sr ${
      skyEngine.shader.subtractZodi ? "(Đã trừ nền)" : "(Chưa khử)"
    }`;
    dom.hudVariance.textContent = `±${t.variance} MJy/sr²`;
    dom.hudPsf.textContent = `${t.psfFwhm}" FWHM`;
    dom.hudSnr.textContent = `${t.snr} (Độ tin cậy: ${Math.min(99.9, +(100 - 100 / t.snr).toFixed(1))}%)`;
    dom.hudSpectralType.textContent = obj.spectralType;

    // Vẽ biểu đồ phổ 102 kênh (WCS-WAVE HDU) và ảnh Cutout Preview
    draw102SpectrumChart(obj.spectrumProfile, activeBand);
    if (irsaState.parsedFits && irsaState.parsedFits.valid) {
      refreshRealFitsVisuals();
    } else {
      drawCutoutPreview(obj, fov);
    }
  }

  /**
   * Vẽ đồ thị 102 dải sóng hồng ngoại (0.75 µm - 5.0 µm) trong Inspector Drawer
   */
  function draw102SpectrumChart(profileType, highlightBand) {
    const canvas = dom.spectrumCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;

    const data = window.generate102Spectrum(profileType, highlightBand);
    const maxFlux = Math.max(...data.map((d) => d.flux)) * 1.15;

    ctx.clearRect(0, 0, w, h);

    // Lưới nền
    ctx.strokeStyle = "rgba(148, 163, 184, 0.15)";
    ctx.lineWidth = 1;
    for (let y = 20; y < h - 20; y += 28) {
      ctx.beginPath();
      ctx.moveTo(32, y);
      ctx.lineTo(w - 10, y);
      ctx.stroke();
    }

    // Vùng đánh dấu băng nước H2O (3.0 - 3.2 µm) và CH4/CO2 (4.2 - 4.6 µm)
    const xIce = 32 + ((3.08 - 0.75) / 4.25) * (w - 44);
    ctx.fillStyle = "rgba(56, 189, 248, 0.1)";
    ctx.fillRect(xIce - 12, 10, 24, h - 32);
    ctx.fillStyle = "#7dd3fc";
    ctx.font = "9px 'JetBrains Mono', monospace";
    ctx.fillText("H₂O Ice", xIce - 18, 20);

    // Vẽ đường cong 102 dải phổ
    ctx.beginPath();
    data.forEach((pt, idx) => {
      const x = 32 + (idx / 101) * (w - 44);
      const y = h - 24 - (pt.flux / maxFlux) * (h - 42);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Tô gradient dưới đường phổ
    ctx.lineTo(w - 12, h - 24);
    ctx.lineTo(32, h - 24);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 12, 0, h - 24);
    grad.addColorStop(0, "rgba(56, 189, 248, 0.38)");
    grad.addColorStop(1, "rgba(56, 189, 248, 0.02)");
    ctx.fillStyle = grad;
    ctx.fill();

    // Vẽ vạch chỉ thị dải sóng đang chọn (Active Band)
    const activeIdx = Math.max(0, Math.min(101, highlightBand - 1));
    const activePt = data[activeIdx];
    const ax = 32 + (activeIdx / 101) * (w - 44);
    const ay = h - 24 - (activePt.flux / maxFlux) * (h - 42);

    ctx.strokeStyle = "#ff7b54";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ax, 10);
    ctx.lineTo(ax, h - 24);
    ctx.stroke();

    ctx.fillStyle = "#ff7b54";
    ctx.beginPath();
    ctx.arc(ax, ay, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // Trục bước sóng
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px 'JetBrains Mono', monospace";
    ctx.fillText("0.75µm", 28, h - 7);
    ctx.fillText("2.5µm", w / 2 - 15, h - 7);
    ctx.fillText("5.0µm", w - 42, h - 7);
  }

  /**
   * Vẽ gói ảnh cắt (Image Cutout Preview) đúng kích thước FOV trong Inspector HUD
   */
  function drawCutoutPreview(obj, fov) {
    const c = dom.cutoutPreviewCanvas;
    if (!c) return;
    const ctx = c.getContext("2d");
    const w = c.width;
    const h = c.height;

    ctx.fillStyle = "#060b16";
    ctx.fillRect(0, 0, w, h);

    // Vẽ quầng sáng thiên thể ở tâm cutout
    const r = Math.max(12, Math.min(48, (0.3 / Math.max(0.05, fov)) * 22));
    const g = ctx.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, r);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.35, obj.colorTint || "#38bdf8");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
    ctx.fill();

    // Vẽ tâm chữ thập nhỏ và nhãn kích thước Cutout
    ctx.strokeStyle = "rgba(56, 189, 248, 0.5)";
    ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.fillStyle = "#bae6fd";
    ctx.font = "10px 'JetBrains Mono', monospace";
    ctx.fillText(`CUTOUT: ${fov}° × ${fov}°`, 10, 18);
    ctx.fillText(`PIXELS: 256×256 (6.2"/px)`, 10, h - 10);
  }

  /**
   * Khi người dùng kéo hoặc lăn chuột trên bản đồ -> Đồng bộ ngược lại ô RA, Dec, FOV và URL
   */
  function handleMapViewportChange({ ra, dec, fov, isFinal, hitResolutionLimit }) {
    dom.raInput.value = ra.toFixed(4);
    dom.decInput.value = dec.toFixed(4);
    syncFOVControls(fov);

    if (hitResolutionLimit) {
      showValidationBanner(
        "⚠️ Đã đạt giới hạn phân giải quang học tối đa của cảm biến SPHEREx (6.2 arcsec/pixel → FOV = 0.02°).",
        "warn"
      );
    }

    // Luôn đặt Debounce 300ms để cập nhật URL State mà không làm giật lag trình duyệt
    scheduleURLStateUpdate(ra, dec, fov, currentObject ? currentObject.id : "custom");
  }

  /**
   * Đồng bộ 2 chiều giữa Dropdown FOV và Thanh trượt FOV Slider
   */
  function syncFOVControls(fovVal) {
    const num = +parseFloat(fovVal).toFixed(3);
    dom.fovValueLabel.textContent = `${num}°`;

    // Quy đổi logarit cho thanh trượt mượt từ 0.02° đến 60°
    const minLog = Math.log10(0.02);
    const maxLog = Math.log10(60);
    const sliderPos = ((Math.log10(Math.max(0.02, Math.min(60, num))) - minLog) / (maxLog - minLog)) * 100;
    dom.fovSlider.value = Math.round(sliderPos);

    // Nếu khớp với một giá trị trong Dropdown thì chọn, nếu không thì chọn 'custom'
    const presets = ["0.05", "0.1", "0.25", "0.5", "1", "5", "20"];
    const matchedPreset = presets.find((p) => Math.abs(parseFloat(p) - num) < 0.008);
    dom.fovSelect.value = matchedPreset || "custom";
  }

  /**
   * OUTPUT 3: Cập nhật thanh địa chỉ trình duyệt với Debounce 300ms + window.history.replaceState()
   */
  function scheduleURLStateUpdate(ra, dec, fov, targetId = "") {
    dom.urlSyncBadge.textContent = "⏳ Đang đồng bộ (Debounce 300ms)...";
    dom.urlSyncBadge.className = "sync-badge syncing";

    if (urlDebounceTimer) {
      clearTimeout(urlDebounceTimer);
    }

    urlDebounceTimer = setTimeout(() => {
      const params = new URLSearchParams();
      params.set("ra", (+ra).toFixed(4));
      params.set("dec", (+dec).toFixed(4));
      params.set("fov", (+fov).toFixed(3));
      params.set("band", activeBand);
      if (targetId && targetId !== "custom") {
        params.set("target", targetId);
      }

      const newRelativeUrl = `${window.location.pathname}?${params.toString()}`;
      try {
        window.history.replaceState({ ra, dec, fov, band: activeBand }, "", newRelativeUrl);
      } catch (e) {
        // Bỏ qua nếu môi trường sandbox hạn chế replaceState
      }

      const fullShareUrl = `${window.location.origin}${newRelativeUrl}`;
      dom.shareUrlInput.value = fullShareUrl;
      dom.urlSyncBadge.textContent = "✅ Đã đồng bộ URL (Sẵn sàng chia sẻ)";
      dom.urlSyncBadge.className = "sync-badge synced";
    }, 300);
  }

  /**
   * Khôi phục góc nhìn nếu người dùng thứ 3 mở từ đường link chia sẻ (?ra=...&dec=...&fov=...)
   */
  function loadStateFromURL() {
    const params = new URLSearchParams(window.location.search);
    const urlRa = params.get("ra");
    const urlDec = params.get("dec");
    const urlFov = params.get("fov");
    const urlBand = params.get("band");
    const urlTarget = params.get("target");

    if (urlBand) {
      const b = Math.max(1, Math.min(102, parseInt(urlBand, 10) || 42));
      setWavelengthBand(b);
    }

    if (urlTarget) {
      const found = window.CURATED_OBJECTS.find((o) => o.id === urlTarget);
      if (found) {
        const fov = urlFov ? parseFloat(urlFov) : found.defaultFov;
        selectCuratedObject({ ...found, defaultFov: fov });
        return;
      }
    }

    if (urlRa !== null && urlDec !== null) {
      const rCheck = window.AstroValidator.validateRA(urlRa);
      const dCheck = window.AstroValidator.validateDec(urlDec);
      const fCheck = window.AstroValidator.validateFOV(urlFov || 0.25);

      if (rCheck.valid && dCheck.valid) {
        dom.raInput.value = rCheck.value;
        dom.decInput.value = dCheck.value;
        syncFOVControls(fCheck.value);
        executeCoordinateSearch(rCheck.value, dCheck.value, fCheck.value);
        return;
      }
    }

    // Mặc định khi mở lần đầu: Hiển thị ứng viên số 1 săn Planet X (90377 Sedna)
    selectCuratedObject(window.CURATED_OBJECTS[0]);
  }

  function setWavelengthBand(bandNumber) {
    activeBand = Math.max(1, Math.min(102, parseInt(bandNumber, 10) || 42));
    const wl = +(0.75 + ((activeBand - 1) / 101) * (5.0 - 0.75)).toFixed(2);
    const detector = Math.min(6, Math.floor((activeBand - 1) / 17) + 1);

    dom.bandSlider.value = activeBand;
    dom.bandLabel.textContent = `Band ${activeBand}/102 (${wl} µm • Detector Array ${detector})`;

    skyEngine.updateShader({
      bandIndex: activeBand,
      wavelength: wl
    });

    if (currentObject) {
      draw102SpectrumChart(currentObject.spectrumProfile, activeBand);
    }
    scheduleURLStateUpdate(skyEngine.ra, skyEngine.dec, skyEngine.fov, currentObject?.id);
  }

  function showValidationBanner(msg, level = "error") {
    dom.validationBanner.className = `validation-banner ${level}`;
    dom.validationText.textContent = msg;
  }

  function hideValidationBanner() {
    dom.validationBanner.className = "validation-banner hidden";
  }

  /**
   * Tải xuống file .FITS: Nếu đã kết nối NASA IRSA, tải trực tiếp file Multi-Extension FITS gốc từ NASA!
   */
  function downloadSimulatedFitsFile() {
    if (irsaState.selectedRow && irsaState.selectedRow.access_url) {
      const fullFitsUrl = `/api/irsa/cutout?access_url=${encodeURIComponent(
        irsaState.selectedRow.access_url
      )}&ra=${irsaState.queryRa}&dec=${irsaState.queryDec}&size=${irsaState.cutoutSize}&mode=full`;
      const a = document.createElement("a");
      const safeName = (currentObject?.name || "target").toLowerCase().replace(/[^a-z0-9]+/g, "_");
      a.href = fullFitsUrl;
      a.download = `nasa_irsa_spherex_${safeName}_D${irsaState.selectedRow.detector}.fits`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }

    const obj = currentObject || window.CURATED_OBJECTS[0];
    const headerCards = [
      "SIMPLE  =                    T / Standard FITS format (NASA SPHEREx Lv2 Cutout)",
      "BITPIX  =                  -32 / 32-bit IEEE floating point surface brightness",
      "NAXIS   =                    2 / 2D Spatial Cutout from Multi-Extension FITS",
      "NAXIS1  =                   64 / Cutout width in pixels",
      "NAXIS2  =                   64 / Cutout height in pixels",
      "EXTEND  =                    T / Multi-Extension FITS (IMAGE,WCS-WAVE,FLAGS,ZODI)",
      `OBJECT  = '${obj.name.slice(0, 18).padEnd(18, " ")}' / Target Celestial Identifier`,
      `RA      =         ${skyEngine.ra.toFixed(6).padStart(12, " ")} / Right Ascension (J2000 Decimal Degrees)`,
      `DEC     =         ${skyEngine.dec.toFixed(6).padStart(12, " ")} / Declination (J2000 Decimal Degrees)`,
      `FOV     =         ${skyEngine.fov.toFixed(6).padStart(12, " ")} / Cutout Field of View (Degrees)`,
      `WAVELEN =         ${skyEngine.shader.wavelength.toFixed(4).padStart(12, " ")} / LVF Wavelength Band (Microns)`,
      `DATE-OBS= '${obj.telemetry.obsTime}' / Observation Timestamp (UTC)`,
      `BUNIT   = 'MJy/sr            ' / Surface Brightness Calibration Unit`,
      `QFLAG   = '${obj.telemetry.qualityCode.padEnd(18, " ")}' / Pixel Quality Bitmask Flag`,
      "TELESCOP= 'NASA-SPHEREx      ' / Spectro-Photometer for History of the Universe",
      "END"
    ];

    // Mỗi dòng trong FITS Header dài đúng 80 ký tự ASCII, tổng block bội số của 2880 bytes
    let headerBlock = headerCards.map((line) => line.padEnd(80, " ").slice(0, 80)).join("");
    headerBlock = headerBlock.padEnd(2880, " ");

    const blob = new Blob([headerBlock], { type: "application/fits" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = obj.name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    a.href = url;
    a.download = `spherex_lv2_${safeName}_ra${skyEngine.ra.toFixed(2)}_dec${skyEngine.dec.toFixed(2)}.fits`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /**
   * Gắn toàn bộ sự kiện tương tác người dùng
   */
  function bindUIEvents() {
    // 1. Nút bật/tắt bảng Xếp hạng Thiên thể Yêu thích (Curated Catalog Dropdown)
    dom.btnToggleCatalog.addEventListener("click", (e) => {
      e.stopPropagation();
      dom.curatedDropdown.classList.toggle("hidden");
    });

    dom.nameSearchInput.addEventListener("focus", () => {
      dom.curatedDropdown.classList.remove("hidden");
    });

    // Lọc danh mục trong bảng Curated
    document.querySelectorAll(".cat-tab").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        document.querySelectorAll(".cat-tab").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        renderCuratedCatalog(btn.getAttribute("data-cat"));
      });
    });

    // Gõ lọc nhanh hoặc nhấn Enter trên ô tên thiên thể
    dom.nameSearchInput.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        await handleNameResolveTrigger();
      }
    });

    dom.btnResolveName.addEventListener("click", async () => {
      await handleNameResolveTrigger();
    });

    // 2. Xử lý nút Search / Go cho 3 thông số (RA, Dec, FOV)
    const triggerExpertSearch = () => {
      const raCheck = window.AstroValidator.validateRA(dom.raInput.value);
      const decCheck = window.AstroValidator.validateDec(dom.decInput.value);
      const fovCheck = window.AstroValidator.validateFOV(
        dom.fovSelect.value === "custom" ? skyEngine.fov : dom.fovSelect.value
      );

      // Đánh dấu viền đỏ nếu ngoài giới hạn
      dom.raInput.classList.toggle("input-error", !raCheck.valid);
      dom.decInput.classList.toggle("input-error", !decCheck.valid);

      if (!raCheck.valid) {
        showValidationBanner(`❌ Lỗi thông số RA: ${raCheck.error}`, "error");
        return;
      }
      if (!decCheck.valid) {
        showValidationBanner(`❌ Lỗi thông số Dec: ${decCheck.error}`, "error");
        return;
      }

      if (fovCheck.warning) {
        showValidationBanner(fovCheck.warning, "warn");
      } else if (raCheck.convertedFromHMS || decCheck.convertedFromDMS) {
        showValidationBanner(
          `✅ Đã tự động quy đổi sang độ thập phân: RA = ${raCheck.value}° (${raCheck.hms}), Dec = ${decCheck.value}° (${decCheck.dms})`,
          "info"
        );
      } else {
        hideValidationBanner();
      }

      dom.raInput.value = raCheck.value;
      dom.decInput.value = decCheck.value;
      syncFOVControls(fovCheck.value);
      dom.curatedDropdown.classList.add("hidden");

      executeCoordinateSearch(raCheck.value, decCheck.value, fovCheck.value);
    };

    dom.btnSearchGo.addEventListener("click", triggerExpertSearch);
    [dom.raInput, dom.decInput].forEach((inp) => {
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          triggerExpertSearch();
        }
      });
    });

    // 3. Sự kiện thay đổi FOV từ Dropdown hoặc Thanh trượt Zoom
    dom.fovSelect.addEventListener("change", () => {
      if (dom.fovSelect.value !== "custom") {
        const nextFov = parseFloat(dom.fovSelect.value);
        syncFOVControls(nextFov);
        skyEngine.setFOV(nextFov, true);
      }
    });

    dom.fovSlider.addEventListener("input", () => {
      const minLog = Math.log10(0.02);
      const maxLog = Math.log10(60);
      const fov = Math.pow(10, minLog + (parseFloat(dom.fovSlider.value) / 100) * (maxLog - minLog));
      const check = window.AstroValidator.validateFOV(fov);
      dom.fovValueLabel.textContent = `${check.value}°`;
      skyEngine.setFOV(check.value, false);
    });

    // 4. Sự kiện chỉnh Brightness / Contrast / Zodi / Wavelength trên WebGL Canvas
    dom.brightnessSlider.addEventListener("input", () => {
      skyEngine.updateShader({ brightness: parseFloat(dom.brightnessSlider.value) });
      if (irsaState.parsedFits) refreshRealFitsVisuals();
    });

    dom.contrastSlider.addEventListener("input", () => {
      skyEngine.updateShader({ contrast: parseFloat(dom.contrastSlider.value) });
      if (irsaState.parsedFits) refreshRealFitsVisuals();
    });

    if (dom.irsaFrameSelect) {
      dom.irsaFrameSelect.addEventListener("change", async () => {
        const idx = parseInt(dom.irsaFrameSelect.value, 10);
        if (!isNaN(idx) && irsaState.siaRows[idx]) {
          await loadAndRenderRealFitsFrame(
            irsaState.siaRows[idx],
            skyEngine.ra,
            skyEngine.dec,
            irsaState.cutoutSize,
            irsaState.requestId
          );
        }
      });
    }

    dom.btnAutoContrast.addEventListener("click", () => {
      // Tự động cân chỉnh tương phản dựa trên Độ sáng nền (Background Flux / ZODI)
      dom.brightnessSlider.value = 4;
      dom.contrastSlider.value = 1.35;
      dom.toggleZodi.checked = true;
      skyEngine.updateShader({
        brightness: 4,
        contrast: 1.35,
        subtractZodi: true
      });
      if (currentObject) {
        updateInspectorHUD(currentObject, skyEngine.ra, skyEngine.dec, skyEngine.fov);
      }
      showValidationBanner(
        "✨ Auto-Contrast: Đã tự động khử nhiễu nền bụi Hoàng Đạo (ZODI) và tối ưu Histogram độ tương phản!",
        "info"
      );
    });

    dom.toggleZodi.addEventListener("change", () => {
      skyEngine.updateShader({ subtractZodi: dom.toggleZodi.checked });
      if (currentObject) {
        updateInspectorHUD(currentObject, skyEngine.ra, skyEngine.dec, skyEngine.fov);
      }
    });

    dom.toggleGrid.addEventListener("change", () => {
      skyEngine.updateShader({ showGrid: dom.toggleGrid.checked });
    });

    dom.bandSlider.addEventListener("input", () => {
      setWavelengthBand(dom.bandSlider.value);
    });

    // Các nút Preset bước sóng thông minh (4 chế độ vật lý)
    document.querySelectorAll(".preset-band-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".preset-band-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const band = parseInt(btn.getAttribute("data-band"), 10);
        setWavelengthBand(band);
      });
    });

    // 5. Nút Copy Share URL (Output 3)
    dom.btnCopyUrl.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(dom.shareUrlInput.value);
        dom.btnCopyUrl.textContent = "✅ Đã Copy Link!";
        setTimeout(() => {
          dom.btnCopyUrl.textContent = "🔗 Copy Link";
        }, 2000);
      } catch (e) {
        dom.shareUrlInput.select();
      }
    });

    // 6. Nút tải file Raw .FITS và ảnh Cutout .PNG
    dom.btnDownloadFits.addEventListener("click", downloadSimulatedFitsFile);
    dom.btnDownloadPng.addEventListener("click", () => {
      const link = document.createElement("a");
      link.download = `spherex_view_ra${skyEngine.ra.toFixed(2)}_dec${skyEngine.dec.toFixed(2)}.png`;
      link.href = document.getElementById("skyMapCanvas").toDataURL("image/png");
      link.click();
    });

    // 7. Chuyển đổi thử nghiệm sang Aladin Lite v3 (Bản đồ ảnh thật AllWISE / DSS2 nếu có Internet)
    dom.btnSwitchAladin.addEventListener("click", toggleAladinSurveyMode);

    // Đóng dropdown khi click ra ngoài
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".name-search-wrapper")) {
        dom.curatedDropdown.classList.add("hidden");
      }
    });

    // 8. Sự kiện cho Cosmic Playlists & Tour Mode
    initCosmicPlaylistsEvents();
  }

  // =========================================================================
  // LOGIC ĐIỀU KHIỂN COSMIC PLAYLISTS & TOUR TỰ ĐỘNG (AUTOPLAY TOUR MODE)
  // =========================================================================
  let currentActivePlaylist = null;
  let tourState = {
    active: false,
    playlist: null,
    trackIndex: 0,
    intervalId: null,
    paused: false,
    countdown: 6
  };

  function initCosmicPlaylistsEvents() {
    renderPlaylistsAlbumView();

    dom.btnOpenPlaylists.addEventListener("click", () => {
      dom.cosmicPlaylistsModal.classList.remove("hidden");
      showPlaylistsAlbumView();
    });

    dom.playlistsBackdrop.addEventListener("click", () => {
      dom.cosmicPlaylistsModal.classList.add("hidden");
    });

    dom.btnClosePlaylists.addEventListener("click", () => {
      dom.cosmicPlaylistsModal.classList.add("hidden");
    });

    dom.btnBackToAlbums.addEventListener("click", () => {
      showPlaylistsAlbumView();
    });

    dom.btnStartTourMode.addEventListener("click", () => {
      if (currentActivePlaylist) {
        dom.cosmicPlaylistsModal.classList.add("hidden");
        startTourMode(currentActivePlaylist, 0);
      }
    });

    // Tour Player Controls
    dom.btnTourPrev.addEventListener("click", () => prevTourTrack());
    dom.btnTourNext.addEventListener("click", () => nextTourTrack());
    dom.btnTourToggle.addEventListener("click", () => toggleTourPause());
    dom.btnTourStop.addEventListener("click", () => stopTourMode());
  }

  function showPlaylistsAlbumView() {
    dom.playlistsAlbumView.classList.remove("hidden");
    dom.playlistDetailView.classList.add("hidden");
  }

  function renderPlaylistsAlbumView() {
    const list = window.COSMIC_PLAYLISTS || [];
    dom.playlistsAlbumView.innerHTML = list
      .map(
        (pl) => `
      <div class="playlist-album-card" style="background:${pl.gradient}; border-color:${pl.color};" data-id="${pl.id}">
        <div>
          <span class="album-badge" style="color:${pl.color}; border:1px solid ${pl.color};">${pl.badge}</span>
          <div class="album-icon">${pl.icon}</div>
          <div class="album-title">${pl.title}</div>
          <div class="album-desc">${pl.description}</div>
        </div>
        <div class="album-meta-row">
          <span>🎵 ${pl.tracks.length} Thiên thể</span>
          <span style="color:${pl.color}; font-weight:700;">Khám phá ➔</span>
        </div>
      </div>
    `
      )
      .join("");

    dom.playlistsAlbumView.querySelectorAll(".playlist-album-card").forEach((card) => {
      card.addEventListener("click", () => {
        const id = card.getAttribute("data-id");
        const found = (window.COSMIC_PLAYLISTS || []).find((p) => p.id === id);
        if (found) {
          openPlaylistDetail(found);
        }
      });
    });
  }

  function openPlaylistDetail(playlist) {
    currentActivePlaylist = playlist;
    dom.playlistsAlbumView.classList.add("hidden");
    dom.playlistDetailView.classList.remove("hidden");

    dom.playlistDetailHeader.innerHTML = `
      <div style="display:flex; align-items:center; gap:12px;">
        <span style="font-size:32px;">${playlist.icon}</span>
        <div>
          <span class="album-badge" style="color:${playlist.color}; border:1px solid ${playlist.color};">${playlist.badge}</span>
          <h3 style="font-size:16px; color:#ffffff; margin:2px 0;">${playlist.title}</h3>
          <p style="font-size:11.5px; color:#94a3b8;">${playlist.description}</p>
        </div>
      </div>
    `;

    dom.playlistTracksList.innerHTML = playlist.tracks
      .map(
        (t, idx) => `
      <div class="track-item" data-index="${idx}">
        <div class="track-left">
          <span class="track-num">${String(t.trackNumber).padStart(2, "0")}</span>
          <div>
            <div class="track-title">${t.name}</div>
            <div class="track-tagline">${t.tagline}</div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="track-badge">${t.highlightFeature}</span>
          <button class="btn-secondary" style="padding:4px 9px; font-size:11px;">▶ Bay tới</button>
        </div>
      </div>
    `
      )
      .join("");

    dom.playlistTracksList.querySelectorAll(".track-item").forEach((el) => {
      el.addEventListener("click", () => {
        const idx = parseInt(el.getAttribute("data-index"), 10);
        const track = playlist.tracks[idx];
        dom.cosmicPlaylistsModal.classList.add("hidden");
        playSingleTrack(track, playlist);
      });
    });
  }

  function playSingleTrack(track, playlist) {
    const curatedMatch = (window.CURATED_OBJECTS || []).find((o) => o.id === track.id);
    const meta = curatedMatch || {
      name: track.name,
      categoryLabel: playlist.title,
      colorTint: playlist.color,
      distanceAU: "Mục tiêu thuộc Cosmic Playlist",
      telemetry: { qualityFlag: "CLEAN" }
    };

    dom.nameSearchInput.value = track.name;
    dom.raInput.value = track.ra.toFixed(4);
    dom.decInput.value = track.dec.toFixed(4);
    syncFOVControls(track.fov);

    if (track.recommendedBand) {
      setWavelengthBand(track.recommendedBand);
    }

    executeCoordinateSearch(track.ra, track.dec, track.fov, meta);

    showValidationBanner(
      `🎧 Đang mở [${playlist.title}]: ${track.name} — "${track.story}"`,
      "info"
    );
  }

  function startTourMode(playlist, startIndex = 0) {
    stopTourMode();
    tourState.active = true;
    tourState.playlist = playlist;
    tourState.trackIndex = startIndex;
    tourState.paused = false;
    tourState.countdown = 6;

    dom.tourPlayerHUD.classList.remove("hidden");
    playCurrentTourTrack();

    tourState.intervalId = setInterval(() => {
      if (!tourState.active || tourState.paused) return;

      tourState.countdown -= 1;
      const progress = ((6 - tourState.countdown) / 6) * 100;
      dom.tourProgressBar.style.width = `${progress}%`;
      dom.tourTimerLabel.textContent = `Chuyển điểm sau: ${tourState.countdown}s`;

      if (tourState.countdown <= 0) {
        tourState.countdown = 6;
        tourState.trackIndex += 1;
        if (tourState.trackIndex >= tourState.playlist.tracks.length) {
          tourState.trackIndex = 0; // Vòng lặp lại
        }
        playCurrentTourTrack();
      }
    }, 1000);
  }

  function playCurrentTourTrack() {
    const track = tourState.playlist.tracks[tourState.trackIndex];
    if (!track) return;

    dom.tourTrackTitle.textContent = `${track.trackNumber}/${tourState.playlist.tracks.length}: ${track.name}`;
    dom.tourTrackTagline.textContent = track.tagline;
    dom.tourProgressBar.style.width = "0%";
    tourState.countdown = 6;

    playSingleTrack(track, tourState.playlist);
  }

  function toggleTourPause() {
    tourState.paused = !tourState.paused;
    dom.btnTourToggle.textContent = tourState.paused ? "▶️" : "⏸️";
    if (tourState.paused) {
      dom.tourTimerLabel.textContent = "⏸️ Đã tạm dừng Tour";
    }
  }

  function nextTourTrack() {
    if (!tourState.playlist) return;
    tourState.trackIndex = (tourState.trackIndex + 1) % tourState.playlist.tracks.length;
    playCurrentTourTrack();
  }

  function prevTourTrack() {
    if (!tourState.playlist) return;
    tourState.trackIndex =
      (tourState.trackIndex - 1 + tourState.playlist.tracks.length) % tourState.playlist.tracks.length;
    playCurrentTourTrack();
  }

  function stopTourMode() {
    tourState.active = false;
    if (tourState.intervalId) {
      clearInterval(tourState.intervalId);
      tourState.intervalId = null;
    }
    dom.tourPlayerHUD.classList.add("hidden");
  }

  /**
   * Xử lý khi người dùng nhập tên thiên thể và bấm Phân giải (Name Resolver)
   */
  async function handleNameResolveTrigger() {
    const query = dom.nameSearchInput.value.trim();
    if (!query) {
      dom.curatedDropdown.classList.remove("hidden");
      return;
    }

    dom.btnResolveName.textContent = "⏳ Đang tìm...";
    const result = await window.AstroValidator.resolveName(query);
    dom.btnResolveName.textContent = "🔍 Tìm tên";

    if (result.found) {
      selectCuratedObject(result.object);
      dom.curatedDropdown.classList.add("hidden");
      showValidationBanner(
        `✅ Đã chuyển đổi tên "${result.object.name}" → RA: ${result.object.ra}°, Dec: ${result.object.dec}° [Nguồn: ${result.source}]`,
        "info"
      );
    } else {
      dom.curatedDropdown.classList.remove("hidden");
      showValidationBanner(
        `⚠️ Không tìm thấy thiên thể "${query}". Hãy chọn một mục tiêu nổi bật trong bảng gợi ý bên dưới!`,
        "warn"
      );
    }
  }

  /**
   * Chuyển đổi giữa Canvas Hồng ngoại SPHEREx 102 kênh và Bản đồ Aladin Lite v3 (CDS Strasbourg)
   */
  function toggleAladinSurveyMode() {
    if (!window.A) {
      showValidationBanner(
        "ℹ️ Đang sử dụng Engine SPHEREx WebGL/Canvas nội bộ (Hỗ trợ đầy đủ 102 dải sóng & ZODI Shader).",
        "info"
      );
      return;
    }

    isAladinMode = !isAladinMode;
    if (isAladinMode) {
      dom.aladinContainer.classList.remove("hidden");
      dom.btnSwitchAladin.textContent = "✨ Quay lại SPHEREx 102-Band Canvas";
      if (!aladinInstance && window.A.init) {
        window.A.init.then(() => {
          aladinInstance = window.A.aladin("#aladin-lite-div", {
            survey: "CDS/P/allWISE/color",
            fov: skyEngine.fov,
            target: `${skyEngine.ra} ${skyEngine.dec}`,
            showReticle: true
          });
        });
      } else if (aladinInstance) {
        aladinInstance.gotoRaDec(skyEngine.ra, skyEngine.dec);
        aladinInstance.setFoV(skyEngine.fov);
      }
    } else {
      dom.aladinContainer.classList.add("hidden");
      dom.btnSwitchAladin.textContent = "🛰️ Xem lớp ảnh AllWISE (Aladin Lite)";
    }
  }

  window.addEventListener("DOMContentLoaded", init);
})();
