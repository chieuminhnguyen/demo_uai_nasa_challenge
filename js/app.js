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

  // Trạng thái dữ liệu FITS thật từ NASA/IPAC IRSA (Hỗ trợ Dual-Epoch T1 vs T2 & Band Selector D1..D6)
  let irsaState = {
    siaRows: [],              // Toàn bộ các dòng quan sát từ NASA IRSA SIAv2
    selectedDetector: 6,      // Detector đang chọn (1..6), mặc định 6
    filteredRows: [],         // Danh sách frame đã lọc theo detector và sort tăng dần theo MJD
    epoch1Row: null,          // Frame được chọn ở T1
    epoch2Row: null,          // Frame được chọn ở T2
    parsedFits1: null,        // FITS data đã parse của T1
    parsedFits2: null,        // FITS data đã parse của T2
    selectedRow: null,        // Tham chiếu frame chính (T2) cho HUD & tải FITS
    parsedFits: null,         // Tham chiếu FITS chính (T2) cho HUD & Shader
    queryRa: 56.8392,
    queryDec: 11.9644,
    cutoutSize: 0.1,
    requestId: 0
  };
  let isNameInputDirty = false;
  let isFovExplicitlyChanged = false;
  let isFloatingCardDismissed = false;
  let motionPlayer = null;
  let motionLoadedKey = "";
  let pendingMotionUrlState = null;

  function formatCoordPrecision(val) {
    const num = Number(val);
    if (isNaN(num)) return "0.0000";
    const s = num.toString();
    if (s.includes(".") && s.split(".")[1].length > 4) {
      return num.toFixed(6);
    }
    return num.toFixed(4);
  }

  // DOM Elements
  const dom = {};

  function initDOM() {
    dom.searchBarContainer = document.getElementById("searchBarContainer");
    dom.btnToggleExpertCoords = document.getElementById("btnToggleExpertCoords");
    dom.coordsInputsGroup = document.getElementById("coordsInputsGroup");
    dom.searchDivider = document.getElementById("searchDivider");

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
    dom.btnCloseFloatingCard = document.getElementById("btnCloseFloatingCard");
    dom.btnReopenFloatingCard = document.getElementById("btnReopenFloatingCard");
    dom.toggleTargetCard = document.getElementById("toggleTargetCard");
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
    dom.hudEpoch = document.getElementById("hudEpochBadge") || document.getElementById("hudEpoch");
    dom.hudEpochBadge = document.getElementById("hudEpochBadge");
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

    // Dual Cutout Cards & Wide Compare Dual View Modal (Step 3/5)
    dom.cardT1 = document.querySelector(".cutout-preview-card.card-t1");
    dom.cardT2 = document.querySelector(".cutout-preview-card.card-t2");
    dom.fitsZoomModal = document.getElementById("fitsZoomModal");
    dom.fitsZoomBackdrop = document.getElementById("fitsZoomBackdrop");
    dom.btnCloseFitsZoom = document.getElementById("btnCloseFitsZoom");
    dom.fitsZoomBandBadge = document.getElementById("fitsZoomBandBadge");
    dom.fitsZoomBaseline = document.getElementById("fitsZoomBaseline");
    dom.fitsZoomTitle = document.getElementById("fitsZoomTitle");
    dom.btnModeSplit = document.getElementById("btnModeSplit");
    dom.btnModeBlink = document.getElementById("btnModeBlink");
    dom.btnModeMotion = document.getElementById("btnModeMotion");
    dom.btnOpenMotionPlayer = document.getElementById("btnOpenMotionPlayer");
    dom.btnDockMotionPlayer = document.getElementById("btnDockMotionPlayer");
    dom.motionSummaryMini = document.getElementById("motionSummaryMini");
    dom.zoomMagGroup = document.querySelector(".zoom-mag-group");
    dom.btnMagPills = document.querySelectorAll(".btn-mag-pill");
    dom.blinkControlsWrap = document.getElementById("blinkControlsWrap");
    dom.btnBlinkPlayPause = document.getElementById("btnBlinkPlayPause");
    dom.blinkSpeedSlider = document.getElementById("blinkSpeedSlider");
    dom.blinkStatusLed = document.getElementById("blinkStatusLed");
    dom.fitsZoomBody = document.getElementById("fitsZoomBody");
    dom.viewSplitWrapper = document.getElementById("viewSplitWrapper");
    dom.viewBlinkWrapper = document.getElementById("viewBlinkWrapper");
    dom.viewMotionWrapper = document.getElementById("viewMotionWrapper");
    dom.wrapSplitT1 = document.getElementById("wrapSplitT1");
    dom.wrapSplitT2 = document.getElementById("wrapSplitT2");
    dom.wrapBlinkMain = document.getElementById("wrapBlinkMain");
    dom.canvasSplitT1 = document.getElementById("canvasSplitT1");
    dom.canvasSplitT2 = document.getElementById("canvasSplitT2");
    dom.canvasBlinkMain = document.getElementById("canvasBlinkMain");
    dom.crosshairT1 = document.getElementById("crosshairT1");
    dom.crosshairT2 = document.getElementById("crosshairT2");
    dom.crosshairBlink = document.getElementById("crosshairBlink");
    dom.labelDateT1 = document.getElementById("labelDateT1");
    dom.labelDateT2 = document.getElementById("labelDateT2");
    dom.labelDeltaDays = document.getElementById("labelDeltaDays");
    dom.blinkScreenBanner = document.getElementById("blinkScreenBanner");
    dom.hudFriendlyPixel = document.getElementById("hudFriendlyPixel");
    dom.hudFriendlyFluxT1 = document.getElementById("hudFriendlyFluxT1");
    dom.hudFriendlyFluxT2 = document.getElementById("hudFriendlyFluxT2");
    dom.hudFriendlyDelta = document.getElementById("hudFriendlyDelta");
    dom.fitsZoomSidebar = document.getElementById("fitsZoomSidebar");
    dom.cardSplitT1 = document.getElementById("cardSplitT1");
    dom.cardSplitT2 = document.getElementById("cardSplitT2");



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
        if (dom.flightStatusBadge) {
          dom.flightStatusBadge.textContent = "🚀 CAMERA FLY-TO (SLERP INTERPOLATION)...";
          dom.flightStatusBadge.className = "status-pill status-flying";
        }
      },
      onFlightEnd: () => {
        if (dom.flightStatusBadge) {
          dom.flightStatusBadge.textContent = "🎯 ĐÃ KHÓA MỤC TIÊU (TARGET LOCKED)";
          dom.flightStatusBadge.className = "status-pill status-locked";
        }
      },
      onCanvasPick: async (ra, dec) => {
        dom.raInput.value = formatCoordPrecision(ra);
        dom.decInput.value = formatCoordPrecision(dec);
        await executeCoordinateSearch(ra, dec, skyEngine.fov, null);
      }
    });

    // 2. Render danh sách Curated / Xếp hạng thiên thể yêu thích
    renderCuratedCatalog("all");

    // 2b. Khởi tạo Cosmic Motion Animation Player (P0 #3)
    if (window.CosmicMotionPlayer) {
      motionPlayer = new window.CosmicMotionPlayer({
        getShaderOpts: () => ({
          subtractZodi: skyEngine ? skyEngine.shader.subtractZodi : true,
          brightness: skyEngine ? skyEngine.shader.brightness : 0,
          contrast: skyEngine ? skyEngine.shader.contrast : 1.15
        }),
        callbacks: {
          onEpochChanged: (epoch, parsedFits) => {
            syncActiveMotionEpochToWorkspace(epoch, parsedFits);
          }
        }
      });
      motionPlayer.initDOM();
    }

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
    isNameInputDirty = false;
    isFovExplicitlyChanged = false;
    hideValidationBanner();
    executeCoordinateSearch(obj.ra, obj.dec, obj.defaultFov, obj);
  }

  /**
   * Thực thi tìm kiếm với 3 thông số (RA, Dec, FOV) -> Kích hoạt đồng thời 3 tầng Output
   * Đảm bảo tìm theo Tên (Cách 1) và tìm theo Tọa độ RA/Dec (Cách 2) cho ra kết quả GIỐNG HỆT NHAU 100%!
   */
  async function executeCoordinateSearch(ra, dec, fov, metaObj = null) {
    let matchedObj = metaObj;
    let isReverseFound = false;

    // Nếu không truyền metaObj (người dùng nhập tay tọa độ), thực hiện Tra cứu ngược (Local + Live SIMBAD TAP)
    if (!matchedObj && window.AstroValidator) {
      const localRev = window.AstroValidator.reverseLookup(ra, dec, 0.35);
      if (localRev.found) {
        matchedObj = localRev.object;
        isReverseFound = true;
      } else if (window.AstroValidator.reverseLookupAsync) {
        showValidationBanner(
          `🛰️ Đang tra cứu tên ngôi sao tại tọa độ (RA: ${ra}°, Dec: ${dec}°) trên danh mục thiên văn SIMBAD...`,
          "info"
        );
        const asyncRev = await window.AstroValidator.reverseLookupAsync(ra, dec, 0.35);
        if (asyncRev.found) {
          matchedObj = asyncRev.object;
          isReverseFound = true;
        }
      }
    }

    // Nếu vẫn không có, tìm trong Curated Database
    if (!matchedObj) {
      matchedObj = window.CURATED_OBJECTS.find(
        (o) => Math.abs(o.ra - ra) < 0.05 && Math.abs(o.dec - dec) < 0.05
      );
      if (matchedObj) isReverseFound = true;
    }

    // NẾU KHỚP VỚI THIÊN THỂ ĐÃ BIẾT -> CHUẨN HÓA (CANONICALIZE) TOÀN BỘ RA, DEC, FOV ĐỂ 2 CÁCH SEARCH ĐỒNG NHẤT 100%!
    if (matchedObj && matchedObj.id !== "custom") {
      const isSwitchingTarget = !currentObject || currentObject.id !== matchedObj.id;
      ra = matchedObj.ra;
      dec = matchedObj.dec;
      if (metaObj || isSwitchingTarget || !isFovExplicitlyChanged) {
        fov = matchedObj.defaultFov || fov;
      }
      isFovExplicitlyChanged = false;
    } else if (!matchedObj) {
      // Nếu không thuộc thiên thể nào trong cơ sở dữ liệu -> Tạo đối tượng tọa độ tùy chỉnh (làm tròn 4 chữ số để bất biến)
      const normRa = +Number(ra).toFixed(4);
      const normDec = +Number(dec).toFixed(4);
      matchedObj = {
        id: "custom",
        name: `Tọa độ RA ${normRa}°, Dec ${normDec >= 0 ? "+" : ""}${normDec}°`,
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
          imageFlux: +(16.5 + ((normRa * 1.7) % 35)).toFixed(2),
          zodiFlux: +(3.4 + (Math.abs(normDec) % 3.5)).toFixed(2),
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
    isNameInputDirty = false;

    // Đồng bộ chính xác cả 4 ô trên thanh Search Bar (Tên, RA, Dec, FOV)
    dom.raInput.value = formatCoordPrecision(ra);
    dom.decInput.value = formatCoordPrecision(dec);
    syncFOVControls(fov);

    if (matchedObj.id !== "custom") {
      dom.nameSearchInput.value = matchedObj.name;
      if (isReverseFound) {
        showValidationBanner(
          `🎯 Nhận diện thành công: Tọa độ khớp với [${matchedObj.name}] → Đã đồng bộ chuẩn RA: ${formatCoordPrecision(
            ra
          )}°, Dec: ${dec >= 0 ? "+" : ""}${formatCoordPrecision(dec)}°, FOV: ${fov}°`,
          "info"
        );
      }
    } else {
      dom.nameSearchInput.value = "";
    }

    renderCuratedCatalog(activeCategoryFilter);

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
    // Tính tọa độ truy vấn IRSA chuẩn xác (có xét Proper Motion tới kỷ nguyên SPHEREx 2025.89 = MJD 61000.0)
    let queryRa = ra;
    let queryDec = dec;
    if (matchedObj?.cached_cutout_query_center) {
      queryRa = matchedObj.cached_cutout_query_center.ra_deg;
      queryDec = matchedObj.cached_cutout_query_center.dec_deg;
    } else if (
      matchedObj &&
      matchedObj.pm_ra_arcsec_yr !== undefined &&
      matchedObj.pm_dec_arcsec_yr !== undefined
    ) {
      const dtYr = 2025.887748 - (matchedObj.epoch || 2000.0);
      const cosD = Math.max(1e-6, Math.cos((matchedObj.dec * Math.PI) / 180));
      queryRa = +(((matchedObj.ra + (matchedObj.pm_ra_arcsec_yr * dtYr) / 3600 / cosD) % 360 + 360) % 360).toFixed(6);
      queryDec = +Math.max(-90, Math.min(90, matchedObj.dec + (matchedObj.pm_dec_arcsec_yr * dtYr) / 3600)).toFixed(6);
    }

    // Luôn dùng kích thước Cutout chuẩn của mục tiêu để kết quả FITS (Peak Flux, ZODI, SNR) bất biến 100%
    const canonicalFov =
      matchedObj && matchedObj.id !== "custom"
        ? matchedObj.cached_cutout_query_center?.fov_deg || matchedObj.defaultFov || 0.1
        : fov || 0.1;
    const cutoutSize = Math.max(0.05, Math.min(0.25, canonicalFov));

    irsaState.queryRa = queryRa;
    irsaState.queryDec = queryDec;
    irsaState.cutoutSize = cutoutSize;
    irsaState.parsedFits1 = null;
    irsaState.parsedFits2 = null;
    irsaState.parsedFits = null;
    irsaState.epoch1Row = null;
    irsaState.epoch2Row = null;
    irsaState.selectedRow = null;
    skyEngine.setRealFitsCutout(null, null, ra, dec);

    if (dom.irsaLiveBadge) {
      dom.irsaLiveBadge.textContent = "🛰️ NASA IRSA SIAv2: Đang truy vấn kho SPHEREx DR1/QR3...";
      dom.irsaLiveBadge.className = "sync-badge syncing";
    }
    if (dom.irsaFrameCountBadge) {
      dom.irsaFrameCountBadge.textContent = "";
    }
    if (dom.epochSelectT1) {
      dom.epochSelectT1.innerHTML = `<option value="">⏳ Đang tải SIAv2...</option>`;
    }
    if (dom.epochSelectT2) {
      dom.epochSelectT2.innerHTML = `<option value="">⏳ Đang tải SIAv2...</option>`;
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
        if (dom.epochSelectT1) {
          dom.epochSelectT1.innerHTML = `<option value="">(0 frame)</option>`;
        }
        if (dom.epochSelectT2) {
          dom.epochSelectT2.innerHTML = `<option value="">(0 frame)</option>`;
        }
        if (dom.baselineStatsBadge) {
          dom.baselineStatsBadge.textContent = "⚠️ Không tìm thấy frame SPHEREx DR1/QR3 tại tọa độ này";
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

      motionLoadedKey = "";

      // Ưu tiên detector từ URL nếu có, sau đó tới detector khuyên dùng của mục tiêu có sẵn dữ liệu (hoặc mặc định D6)
      const prefDets = matchedObj?.recommended_detectors || [6, 5, 4, 3, 2, 1];
      let defaultDet = (matchedObj?.recommended_detectors && matchedObj.recommended_detectors[0]) || 6;
      if (pendingMotionUrlState && pendingMotionUrlState.det && rows.some((r) => r.detector === pendingMotionUrlState.det)) {
        defaultDet = pendingMotionUrlState.det;
      } else {
        for (const d of prefDets) {
          if (rows.some((r) => r.detector === d)) {
            defaultDet = d;
            break;
          }
        }
      }
      if (!rows.some((r) => r.detector === defaultDet)) {
        defaultDet = rows[0].detector || 6;
      }

      populateEpochControlsForDetector(defaultDet);
    } catch (err) {
      if (reqId !== irsaState.requestId) return;
      if (dom.irsaLiveBadge) {
        dom.irsaLiveBadge.textContent = "⚡ Chế độ Offline / Fallback (Chưa kết nối gateway IRSA)";
        dom.irsaLiveBadge.className = "sync-badge syncing";
      }
    }
  }

  /**
   * Lọc danh sách frame theo Detector đã chọn và render danh sách vào Dropdown T1 & T2
   */
  function populateEpochControlsForDetector(detectorNum) {
    irsaState.selectedDetector = detectorNum;

    // Cập nhật trạng thái active cho nút bấm D1..D6
    if (dom.detPillBtns) {
      dom.detPillBtns.forEach((btn) => {
        btn.classList.toggle("active", parseInt(btn.dataset.det, 10) === detectorNum);
      });
    }

    // Lọc frame thuộc detector này và sắp xếp theo ngày chụp (t_min_mjd tăng dần)
    irsaState.filteredRows = (irsaState.siaRows || [])
      .filter((r) => r.detector === detectorNum)
      .sort((a, b) => (a.t_min_mjd || 0) - (b.t_min_mjd || 0));

    if (!irsaState.filteredRows.length) {
      if (dom.epochSelectT1) dom.epochSelectT1.innerHTML = `<option value="">(0 frame D${detectorNum})</option>`;
      if (dom.epochSelectT2) dom.epochSelectT2.innerHTML = `<option value="">(0 frame D${detectorNum})</option>`;
      if (dom.baselineStatsBadge) {
        dom.baselineStatsBadge.textContent = `⚠️ D${detectorNum}: Không có frame tại tọa độ này`;
        dom.baselineStatsBadge.style.color = "#f59e0b";
      }
      if (dom.epochDateLabelT1) dom.epochDateLabelT1.textContent = "--";
      if (dom.epochDateLabelT2) dom.epochDateLabelT2.textContent = "--";
      if (currentObject) {
        drawCutoutPreview(currentObject, skyEngine ? skyEngine.fov : 0.25);
      }
      return;
    }

    // Tự động chọn cặp: T1 là frame cũ nhất (index 0), T2 là frame mới nhất (index cuối)
    const idx1 = 0;
    const idx2 = irsaState.filteredRows.length > 1 ? irsaState.filteredRows.length - 1 : 0;

    renderEpochOptions(dom.epochSelectT1, irsaState.filteredRows, idx1);
    renderEpochOptions(dom.epochSelectT2, irsaState.filteredRows, idx2);

    updateMotionSummaryMini();
    updateBaselineStats();
    triggerDualEpochCutoutFetch();

    // Nếu modal đang ở chế độ Cosmic Motion, nạp lại chuỗi Epoch của Detector mới
    if (dom.fitsZoomModal && !dom.fitsZoomModal.classList.contains("hidden") && dualViewState.mode === "motion") {
      ensureMotionSequenceLoaded(true);
    }

    // Nếu URL ban đầu yêu cầu mở thẳng Cosmic Motion ở Detector này
    if (pendingMotionUrlState && pendingMotionUrlState.det === detectorNum) {
      const targetEpoch = pendingMotionUrlState.epoch || 0;
      pendingMotionUrlState = null;
      openFitsZoomModal("motion", targetEpoch);
    }
  }

  function updateMotionSummaryMini() {
    if (!dom.motionSummaryMini) return;
    const rows = irsaState.filteredRows || [];
    if (!rows.length) {
      dom.motionSummaryMini.textContent = `D${irsaState.selectedDetector}: 0 real epochs`;
      return;
    }
    const minMjd = rows[0].t_min_mjd || 0;
    const maxMjd = rows[rows.length - 1].t_min_mjd || 0;
    const span = Math.max(0, maxMjd - minMjd);
    let maxGap = 0;
    for (let i = 1; i < rows.length; i++) {
      const g = (rows[i].t_min_mjd || 0) - (rows[i - 1].t_min_mjd || 0);
      if (g > maxGap) maxGap = g;
    }
    const gapText = maxGap >= 30 ? ` • Gap ${maxGap.toFixed(0)}d` : "";
    dom.motionSummaryMini.textContent = `D${irsaState.selectedDetector}: ${rows.length} Real Epochs • Span ${span.toFixed(1)}d${gapText}`;
  }

  /**
   * Đổ dữ liệu frame vào thẻ <select>
   */
  function renderEpochOptions(selectEl, rows, selectedIndex) {
    if (!selectEl) return;
    selectEl.innerHTML = rows
      .map((r, i) => {
        const dateStr = r.obs_date_iso ? r.obs_date_iso.split("T")[0] : `MJD ${(r.t_min_mjd || 0).toFixed(1)}`;
        const collection = (r.collection || "DR1").toUpperCase();
        return `<option value="${i}" ${i === selectedIndex ? "selected" : ""}>
      [${dateStr}] ${collection} (Δ=${(r.distToTarget * 3600).toFixed(0)}")
    </option>`;
      })
      .join("");
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
    irsaState.selectedRow = r2;

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
    if (dom.epochDateLabelT1) {
      dom.epochDateLabelT1.textContent = r1.obs_date_iso?.split("T")[0] || `MJD ${mjd1.toFixed(0)}`;
    }
    if (dom.epochDateLabelT2) {
      dom.epochDateLabelT2.textContent = r2.obs_date_iso?.split("T")[0] || `MJD ${mjd2.toFixed(0)}`;
    }
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
      const [resp1, resp2] = await Promise.all([fetch(cutoutUrl1), fetch(cutoutUrl2)]);

      if (reqId !== irsaState.requestId) return;
      if (!resp1.ok || !resp2.ok) throw new Error("Cutout HTTP error");

      const [buf1, buf2] = await Promise.all([resp1.arrayBuffer(), resp2.arrayBuffer()]);
      if (reqId !== irsaState.requestId) return;

      irsaState.parsedFits1 = window.SpherexFitsParser.parseMultiExtensionFits(buf1);
      irsaState.parsedFits2 = window.SpherexFitsParser.parseMultiExtensionFits(buf2);
      irsaState.parsedFits = irsaState.parsedFits2;
      irsaState.selectedRow = r2;

      if (motionPlayer) {
        if (irsaState.parsedFits1?.valid) {
          motionPlayer.fitsCache.set(`${r1.access_url}|${irsaState.queryRa}|${irsaState.queryDec}|${irsaState.cutoutSize}`, irsaState.parsedFits1);
        }
        if (irsaState.parsedFits2?.valid) {
          motionPlayer.fitsCache.set(`${r2.access_url}|${irsaState.queryRa}|${irsaState.queryDec}|${irsaState.cutoutSize}`, irsaState.parsedFits2);
        }
      }

      refreshRealFitsVisuals();

      if (dom.irsaLiveBadge) {
        dom.irsaLiveBadge.textContent = `🟢 LIVE FITS T1 & T2 (D${irsaState.selectedDetector} • Δt=${Math.abs(
          (r2.t_min_mjd || 0) - (r1.t_min_mjd || 0)
        ).toFixed(0)}d)`;
        dom.irsaLiveBadge.className = "sync-badge synced";
      }

      // Phát sự kiện chuẩn hóa (Clean Output Event) cho các module so sánh tiếp theo (Blink / Difference)
      window.dispatchEvent(
        new CustomEvent("spherex:dualEpochReady", {
          detail: {
            detector: irsaState.selectedDetector,
            epoch1Row: r1,
            epoch2Row: r2,
            parsedFits1: irsaState.parsedFits1,
            parsedFits2: irsaState.parsedFits2,
            deltaDays: Math.abs((r2.t_min_mjd || 0) - (r1.t_min_mjd || 0))
          }
        })
      );
    } catch (err) {
      if (reqId !== irsaState.requestId) return;
      if (dom.irsaLiveBadge) {
        dom.irsaLiveBadge.textContent = `⚠️ Lỗi tải FITS (${err.message})`;
        dom.irsaLiveBadge.className = "sync-badge syncing";
      }
    }
  }

  /**
   * Vẽ lại ảnh FITS thật (cả T1 và T2) và cập nhật số liệu HUD khi đổi Frame hoặc kéo thanh Brightness/Contrast/ZODI
   */
  function refreshRealFitsVisuals() {
    if (!window.SpherexFitsParser) return;

    const shaderOpts = {
      subtractZodi: skyEngine.shader.subtractZodi,
      brightness: skyEngine.shader.brightness,
      contrast: skyEngine.shader.contrast,
      colormap: "infrared"
    };

    // Vẽ lên Canvas T1
    if (dom.cutoutCanvasT1 && irsaState.parsedFits1 && irsaState.parsedFits1.valid) {
      window.SpherexFitsParser.renderFitsToCanvas(irsaState.parsedFits1, dom.cutoutCanvasT1, shaderOpts);
    }

    // Vẽ lên Canvas T2
    if (dom.cutoutCanvasT2 && irsaState.parsedFits2 && irsaState.parsedFits2.valid) {
      window.SpherexFitsParser.renderFitsToCanvas(irsaState.parsedFits2, dom.cutoutCanvasT2, shaderOpts);
    }

    const parsed = irsaState.parsedFits2 || irsaState.parsedFits;
    if (!parsed || !parsed.valid) return;

    if (dom.cutoutPreviewCanvas) {
      window.SpherexFitsParser.renderFitsToCanvas(parsed, dom.cutoutPreviewCanvas, shaderOpts);
    }

    const offCanvas = window.SpherexFitsParser.renderFitsToCanvas(parsed, null, shaderOpts);
    skyEngine.setRealFitsCutout(
      parsed,
      offCanvas,
      currentObject ? currentObject.ra : irsaState.queryRa,
      currentObject ? currentObject.dec : irsaState.queryDec,
      irsaState.cutoutSize
    );

    // Cập nhật các ô thông số HDU trên Inspector HUD
    dom.hudObsTime.textContent = parsed.dateObs;
    if (dom.hudEpoch) {
      dom.hudEpoch.textContent = `${(irsaState.selectedRow?.collection || "spherex_dr1").toUpperCase()} • D${parsed.detector}`;
    }
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

    // Nếu Modal phóng to & so sánh đối chứng đang mở, cập nhật ngay các Canvas lớn hoặc Cosmic Motion
    if (dom.fitsZoomModal && !dom.fitsZoomModal.classList.contains("hidden")) {
      if (dualViewState.mode === "motion" && motionPlayer) {
        motionPlayer.renderFrame();
      } else {
        renderDualViewModal();
      }
    }
  }

  // ==========================================================================
  // MODULE: HIGH-VISIBILITY & NEWBIE DUAL VIEW MODES (BƯỚC 3 / 5)
  // ==========================================================================
  function getDetectorBandDesc(d) {
    const descs = {
      1: "0.75–1.11 µm",
      2: "1.11–1.63 µm",
      3: "1.63–2.42 µm",
      4: "2.42–3.82 µm",
      5: "3.82–4.42 µm",
      6: "4.41–5.01 µm"
    };
    return descs[d] || "0.75–5.01 µm";
  }

  const dualViewState = {
    mode: "split", // "split" | "blink"
    isBlinking: false,
    blinkInterval: null,
    blinkCurrent: "T1",
    blinkSpeed: 2.0, // times per second
    magnification: 1.0
  };

  // Render FITS lên Canvas to rõ không bị mờ (Image Smoothing = False)
  function renderCrispLargeFits(parsedFits, canvasEl) {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext("2d");
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.mozImageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
    ctx.msImageSmoothingEnabled = false;

    const shaderOpts = {
      subtractZodi: dom.toggleZodi ? dom.toggleZodi.checked : true,
      brightness: dom.brightnessSlider ? parseFloat(dom.brightnessSlider.value) : 0,
      contrast: dom.contrastSlider ? parseFloat(dom.contrastSlider.value) : 1.15,
      colormap: "infrared"
    };

    if (parsedFits && parsedFits.valid && window.SpherexFitsParser) {
      window.SpherexFitsParser.renderFitsToCanvas(parsedFits, canvasEl, shaderOpts);
    } else {
      ctx.fillStyle = "#010409";
      ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
      ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
      ctx.lineWidth = 1;
      ctx.strokeRect(10, 10, canvasEl.width - 20, canvasEl.height - 20);
      ctx.fillStyle = "#7dd3fc";
      ctx.font = "12px monospace";
      ctx.textAlign = "center";
      ctx.fillText("Đang nạp ảnh FITS SPHEREx Level-2...", canvasEl.width / 2, canvasEl.height / 2);
    }
    ctx.restore();
  }

  function ensureMotionSequenceLoaded(forceReload = false, initialEpochIndex = 0) {
    if (!motionPlayer) return Promise.resolve();
    const det = irsaState.selectedDetector || 6;
    const ra = irsaState.targetRa || (skyEngine ? skyEngine.ra : 0);
    const dec = irsaState.targetDec || (skyEngine ? skyEngine.dec : 0);
    const size = irsaState.cutoutSize || 0.08;
    const targetName = (currentObject && currentObject.name) || dom.hudObjectName?.textContent || `RA ${ra.toFixed(3)}°, Dec ${dec.toFixed(3)}°`;
    const key = `${ra.toFixed(4)}|${dec.toFixed(4)}|${size}|D${det}|${(irsaState.filteredRows || []).length}`;

    if (!forceReload && motionLoadedKey === key && motionPlayer.state.epochs.length > 0) {
      if (Number.isInteger(initialEpochIndex) && initialEpochIndex >= 0 && initialEpochIndex < motionPlayer.state.epochs.length) {
        motionPlayer.jumpToEpoch(initialEpochIndex);
      }
      return Promise.resolve();
    }

    motionLoadedKey = key;
    const preloadedFitsMap = new Map();
    if (irsaState.epoch1Row && irsaState.parsedFits1) {
      preloadedFitsMap.set(`${irsaState.epoch1Row.access_url}|${ra}|${dec}|${size}`, irsaState.parsedFits1);
    }
    if (irsaState.epoch2Row && irsaState.parsedFits2) {
      preloadedFitsMap.set(`${irsaState.epoch2Row.access_url}|${ra}|${dec}|${size}`, irsaState.parsedFits2);
    }

    return motionPlayer.loadSequence({
      ra,
      dec,
      size,
      detector: det,
      targetName,
      fallbackRows: irsaState.filteredRows || [],
      preloadedFitsMap,
      initialEpochIndex
    });
  }

  function syncActiveMotionEpochToWorkspace(epoch, parsedFits) {
    if (!epoch) return;
    if (dom.hudObsTime) {
      dom.hudObsTime.textContent = epoch.timestamp_utc || `--`;
    }
    if (dom.hudEpochBadge && epoch.mjd !== undefined && epoch.mjd !== null) {
      const epIdx = Number.isInteger(epoch.epoch_index) ? epoch.epoch_index : 0;
      dom.hudEpochBadge.textContent = `EPOCH ${epIdx + 1}/${motionPlayer ? motionPlayer.state.epochs.length : "?"} • MJD ${Number(epoch.mjd).toFixed(3)}`;
    }
    if (parsedFits && parsedFits.stats) {
      irsaState.parsedFits = parsedFits;
      const st = parsedFits.stats;
      if (dom.hudImageFlux && Number.isFinite(st.peakFlux)) {
        dom.hudImageFlux.textContent = `${st.peakFlux.toFixed(2)} MJy/sr (Peak)`;
      }
      if (dom.hudZodiFlux && Number.isFinite(st.zodiBackground)) {
        dom.hudZodiFlux.textContent = `${st.zodiBackground.toFixed(2)} MJy/sr (Bg)`;
      }
      if (dom.hudVariance && Number.isFinite(st.sigma)) {
        dom.hudVariance.textContent = `±${st.sigma.toFixed(3)} MJy/sr (1σ)`;
      }
      if (dom.hudSnr && Number.isFinite(st.snr)) {
        dom.hudSnr.textContent = `${st.snr.toFixed(1)}σ`;
      }
      if (skyEngine && typeof skyEngine.setRealFitsCutout === "function") {
        skyEngine.setRealFitsCutout(
          parsedFits,
          irsaState.targetRa || skyEngine.ra,
          irsaState.targetDec || skyEngine.dec,
          irsaState.cutoutSize || 0.08
        );
      }
    }
    if (skyEngine) {
      scheduleURLStateUpdate(
        skyEngine.ra,
        skyEngine.dec,
        skyEngine.fov,
        currentObject ? currentObject.id : "custom"
      );
    }
  }

  function openFitsZoomModal(mode = "split", initialEpochIdx = 0) {
    if (!dom.fitsZoomModal) return;
    dom.fitsZoomModal.classList.remove("hidden");
    document.body.classList.add("modal-open");

    // Reset về tỷ lệ 1x Chuẩn fit viewport hoàn toàn, tránh scroll
    dualViewState.magnification = 1.0;
    if (dom.btnMagPills) {
      dom.btnMagPills.forEach((p) => p.classList.toggle("active", p.dataset.mag === "1"));
    }
    if (dom.canvasSplitT1) { dom.canvasSplitT1.style.width = ""; dom.canvasSplitT1.style.height = ""; }
    if (dom.canvasSplitT2) { dom.canvasSplitT2.style.width = ""; dom.canvasSplitT2.style.height = ""; }
    if (dom.canvasBlinkMain) { dom.canvasBlinkMain.style.width = ""; dom.canvasBlinkMain.style.height = ""; }
    if (dom.fitsZoomBody) { dom.fitsZoomBody.style.overflow = "hidden"; }

    setDualViewMode(mode, initialEpochIdx);
    if (mode !== "motion") {
      renderDualViewModal();
    }
  }

  function closeFitsZoomModal() {
    if (!dom.fitsZoomModal) return;
    stopBlinkAnimation();
    if (motionPlayer) {
      motionPlayer.deactivate();
    }
    dom.fitsZoomModal.classList.add("hidden");
    document.body.classList.remove("modal-open");
    if (skyEngine) {
      scheduleURLStateUpdate(
        skyEngine.ra,
        skyEngine.dec,
        skyEngine.fov,
        currentObject ? currentObject.id : "custom"
      );
    }
  }

  function setDualViewMode(mode, initialEpochIdx = 0) {
    dualViewState.mode = mode;

    if (dom.btnModeSplit) dom.btnModeSplit.classList.toggle("active", mode === "split");
    if (dom.btnModeBlink) dom.btnModeBlink.classList.toggle("active", mode === "blink");
    if (dom.btnModeMotion) dom.btnModeMotion.classList.toggle("active", mode === "motion");

    if (dom.viewSplitWrapper) dom.viewSplitWrapper.classList.toggle("hidden", mode !== "split");
    if (dom.viewBlinkWrapper) dom.viewBlinkWrapper.classList.toggle("hidden", mode !== "blink");
    if (dom.viewMotionWrapper) dom.viewMotionWrapper.classList.toggle("hidden", mode !== "motion");

    if (dom.blinkControlsWrap) dom.blinkControlsWrap.classList.toggle("hidden", mode !== "blink");
    if (dom.zoomMagGroup) dom.zoomMagGroup.classList.toggle("hidden", mode === "motion");

    if (mode === "split") {
      if (motionPlayer) motionPlayer.deactivate();
      // Chuyển thanh thông số điểm soi vào nằm giữa 2 tấm ảnh (trước card T2)
      if (dom.fitsZoomSidebar && dom.viewSplitWrapper && dom.cardSplitT2) {
        dom.viewSplitWrapper.insertBefore(dom.fitsZoomSidebar, dom.cardSplitT2);
      }
      stopBlinkAnimation();
      renderDualViewModal();
    } else if (mode === "blink") {
      if (motionPlayer) motionPlayer.deactivate();
      // Chuyển thanh thông số điểm soi sang bên phải ảnh Blink
      if (dom.fitsZoomSidebar && dom.viewBlinkWrapper) {
        dom.viewBlinkWrapper.appendChild(dom.fitsZoomSidebar);
      }
      startBlinkAnimation();
      renderDualViewModal();
    } else if (mode === "motion") {
      stopBlinkAnimation();
      const detNum = irsaState.selectedDetector || 6;
      if (dom.fitsZoomBandBadge) {
        dom.fitsZoomBandBadge.textContent = `CẢM BIẾN D${detNum} (${getDetectorBandDesc(detNum)})`;
      }
      if (dom.fitsZoomTitle) {
        const objTitle = currentObject?.name || "SPHEREx Target";
        dom.fitsZoomTitle.textContent = `🎬 Cosmic Motion Animation — ${objTitle}`;
      }
      if (motionPlayer) {
        motionPlayer.activate();
        ensureMotionSequenceLoaded(false, initialEpochIdx);
      }
    }

    if (skyEngine) {
      scheduleURLStateUpdate(
        skyEngine.ra,
        skyEngine.dec,
        skyEngine.fov,
        currentObject ? currentObject.id : "custom"
      );
    }
  }

  function renderDualViewModal() {
    const detNum = irsaState.selectedDetector || 6;
    if (dom.fitsZoomBandBadge) {
      dom.fitsZoomBandBadge.textContent = `CẢM BIẾN D${detNum} (${getDetectorBandDesc(detNum)})`;
    }

    const rawBaseline = dom.baselineStatsBadge ? dom.baselineStatsBadge.textContent : "--";
    const baselineText = rawBaseline.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").replace(/^.*Baseline:\s*/i, "").trim() || "--";
    if (dom.fitsZoomBaseline) {
      dom.fitsZoomBaseline.textContent = `Cách nhau: ${baselineText}`;
    }
    if (dom.labelDeltaDays) {
      dom.labelDeltaDays.textContent = `Cách nhau: ${baselineText}`;
    }

    const date1 = irsaState.epoch1Row?.date_obs || dom.epochDateLabelT1?.textContent || "--";
    const date2 = irsaState.epoch2Row?.date_obs || dom.epochDateLabelT2?.textContent || "--";
    if (dom.labelDateT1) dom.labelDateT1.textContent = date1;
    if (dom.labelDateT2) dom.labelDateT2.textContent = date2;

    // Render Side-by-Side Canvas T1 và T2
    if (dom.canvasSplitT1) {
      renderCrispLargeFits(irsaState.parsedFits1, dom.canvasSplitT1);
    }
    if (dom.canvasSplitT2) {
      renderCrispLargeFits(irsaState.parsedFits2, dom.canvasSplitT2);
    }

    // Render Blink Main Canvas
    if (dom.canvasBlinkMain) {
      const activeParsed = dualViewState.blinkCurrent === "T1" ? irsaState.parsedFits1 : irsaState.parsedFits2;
      renderCrispLargeFits(activeParsed, dom.canvasBlinkMain);
    }

    // Cập nhật trạng thái đo quang thông mặc định tâm
    updateCenterFriendlyFlux();
  }

  function updateCenterFriendlyFlux() {
    const p1 = irsaState.parsedFits1;
    const p2 = irsaState.parsedFits2;
    if (!p1 || !p1.width || !p2 || !p2.width) return;

    const cx = Math.floor(p1.width / 2);
    const cy = Math.floor(p1.height / 2);

    const f1 = p1.hdus?.["IMAGE"]?.matrix?.[cy * p1.width + cx] || NaN;
    const f2 = p2.hdus?.["IMAGE"]?.matrix?.[cy * p2.width + cx] || NaN;

    if (dom.hudFriendlyPixel) {
      dom.hudFriendlyPixel.textContent = `Tâm thiên thể [X: ${cx}, Y: ${cy}]`;
    }
    if (dom.hudFriendlyFluxT1) {
      dom.hudFriendlyFluxT1.textContent = !isNaN(f1) ? `${f1.toFixed(2)} MJy/sr` : "--";
    }
    if (dom.hudFriendlyFluxT2) {
      dom.hudFriendlyFluxT2.textContent = !isNaN(f2) ? `${f2.toFixed(2)} MJy/sr` : "--";
    }
    if (dom.hudFriendlyDelta && !isNaN(f1) && !isNaN(f2)) {
      const delta = f2 - f1;
      const noise = p1.meanZodi ? p1.meanZodi * 0.05 : 0.2;
      if (Math.abs(delta) < Math.max(0.2, noise)) {
        dom.hudFriendlyDelta.textContent = `Đứng im bình thường (Chênh lệch: ${delta >= 0 ? "+" : ""}${delta.toFixed(2)})`;
        dom.hudFriendlyDelta.className = "sum-val val-status";
      } else if (delta > 0) {
        dom.hudFriendlyDelta.textContent = `Sáng hơn +${delta.toFixed(2)} MJy/sr (Phát hiện biến thiên/dịch chuyển!)`;
        dom.hudFriendlyDelta.className = "sum-val val-orange";
      } else {
        dom.hudFriendlyDelta.textContent = `Tối đi ${delta.toFixed(2)} MJy/sr (Vật thể đã rời vị trí!)`;
        dom.hudFriendlyDelta.className = "sum-val val-blue";
      }
    }
  }

  function startBlinkAnimation() {
    stopBlinkAnimation();
    dualViewState.isBlinking = true;
    if (dom.btnBlinkPlayPause) {
      dom.btnBlinkPlayPause.textContent = "Tạm Dừng";
    }

    const speed = parseFloat(dom.blinkSpeedSlider?.value) || 2.0;
    const intervalMs = Math.round(1000 / speed);

    dualViewState.blinkInterval = setInterval(() => {
      dualViewState.blinkCurrent = dualViewState.blinkCurrent === "T1" ? "T2" : "T1";
      updateBlinkFrame();
    }, intervalMs);
  }

  function stopBlinkAnimation() {
    dualViewState.isBlinking = false;
    if (dualViewState.blinkInterval) {
      clearInterval(dualViewState.blinkInterval);
      dualViewState.blinkInterval = null;
    }
    if (dom.btnBlinkPlayPause) {
      dom.btnBlinkPlayPause.textContent = "Tiếp Tục";
    }
  }

  function toggleBlinkPlayPause() {
    if (dualViewState.isBlinking) {
      stopBlinkAnimation();
    } else {
      startBlinkAnimation();
    }
  }

  function updateBlinkFrame() {
    const isT1 = dualViewState.blinkCurrent === "T1";
    const parsed = isT1 ? irsaState.parsedFits1 : irsaState.parsedFits2;

    renderCrispLargeFits(parsed, dom.canvasBlinkMain);

    if (dom.blinkStatusLed) {
      dom.blinkStatusLed.className = `blink-status-led ${isT1 ? "led-t1" : "led-t2"}`;
      dom.blinkStatusLed.innerHTML = `<span class="led-dot">●</span> ĐANG HIỆN: ${isT1 ? "ẢNH CŨ (T1)" : "ẢNH MỚI (T2)"}`;
    }
    if (dom.blinkScreenBanner) {
      dom.blinkScreenBanner.className = `blink-screen-tag ${isT1 ? "tag-old" : "tag-new"}`;
      dom.blinkScreenBanner.textContent = isT1 ? "ẢNH QUÁ KHỨ (LẦN 1)" : "ẢNH HIỆN TẠI (LẦN 2)";
    }
  }

  function handleCrosshairMouseMove(e, wrapEl) {
    if (!wrapEl) return;
    const rect = wrapEl.getBoundingClientRect();
    const mouseX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const mouseY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

    const normX = mouseX / rect.width;
    const normY = mouseY / rect.height;

    [dom.crosshairT1, dom.crosshairT2, dom.crosshairBlink].forEach((ch) => {
      if (ch) {
        ch.style.left = `${(normX * 100).toFixed(2)}%`;
        ch.style.top = `${(normY * 100).toFixed(2)}%`;
        ch.style.display = "block";
      }
    });

    const p1 = irsaState.parsedFits1;
    const p2 = irsaState.parsedFits2;
    const w = p1?.width || p2?.width || 58;
    const h = p1?.height || p2?.height || 58;

    const px = Math.floor(normX * w);
    const py = Math.floor((1 - normY) * h);

    if (dom.hudFriendlyPixel) {
      dom.hudFriendlyPixel.textContent = `Pixel [X: ${px}, Y: ${py}]`;
    }

    let flux1 = NaN;
    let flux2 = NaN;

    if (p1 && p1.hdus && p1.hdus["IMAGE"] && p1.hdus["IMAGE"].matrix) {
      if (px >= 0 && px < p1.width && py >= 0 && py < p1.height) {
        flux1 = p1.hdus["IMAGE"].matrix[py * p1.width + px];
      }
    }
    if (p2 && p2.hdus && p2.hdus["IMAGE"] && p2.hdus["IMAGE"].matrix) {
      if (px >= 0 && px < p2.width && py >= 0 && py < p2.height) {
        flux2 = p2.hdus["IMAGE"].matrix[py * p2.width + px];
      }
    }

    if (dom.hudFriendlyFluxT1) {
      dom.hudFriendlyFluxT1.textContent = !isNaN(flux1) ? `${flux1.toFixed(2)} MJy/sr` : "--";
    }
    if (dom.hudFriendlyFluxT2) {
      dom.hudFriendlyFluxT2.textContent = !isNaN(flux2) ? `${flux2.toFixed(2)} MJy/sr` : "--";
    }

    if (dom.hudFriendlyDelta) {
      if (!isNaN(flux1) && !isNaN(flux2)) {
        const delta = flux2 - flux1;
        const noise = p1?.meanZodi ? p1.meanZodi * 0.05 : 0.2;
        if (Math.abs(delta) < Math.max(0.2, noise)) {
          dom.hudFriendlyDelta.textContent = `Đứng im bình thường (Chênh lệch: ${delta >= 0 ? "+" : ""}${delta.toFixed(2)})`;
          dom.hudFriendlyDelta.className = "sum-val val-status";
        } else if (delta > 0) {
          dom.hudFriendlyDelta.textContent = `Sáng hơn +${delta.toFixed(2)} MJy/sr (Phát hiện biến thiên/dịch chuyển!)`;
          dom.hudFriendlyDelta.className = "sum-val val-orange";
        } else {
          dom.hudFriendlyDelta.textContent = `Tối đi ${delta.toFixed(2)} MJy/sr (Vật thể đã rời vị trí!)`;
          dom.hudFriendlyDelta.className = "sum-val val-blue";
        }
      } else {
        dom.hudFriendlyDelta.textContent = "Đang nạp dữ liệu...";
      }
    }
  }

  function handleCrosshairMouseLeave() {
    [dom.crosshairT1, dom.crosshairT2, dom.crosshairBlink].forEach((ch) => {
      if (ch) ch.style.display = "none";
    });
  }

  function initMagnificationControls() {
    if (!dom.btnMagPills) return;
    dom.btnMagPills.forEach((pill) => {
      pill.addEventListener("click", () => {
        dom.btnMagPills.forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
        const scale = parseFloat(pill.dataset.mag) || 1.0;
        dualViewState.magnification = scale;

        if (scale === 1.0) {
          // Trả về chế độ Responsive Viewport-fit (Tự động fit không scroll)
          if (dom.canvasSplitT1) { dom.canvasSplitT1.style.width = ""; dom.canvasSplitT1.style.height = ""; }
          if (dom.canvasSplitT2) { dom.canvasSplitT2.style.width = ""; dom.canvasSplitT2.style.height = ""; }
          if (dom.canvasBlinkMain) { dom.canvasBlinkMain.style.width = ""; dom.canvasBlinkMain.style.height = ""; }
          if (dom.fitsZoomBody) { dom.fitsZoomBody.style.overflow = "hidden"; }
        } else {
          // Khi chủ động phóng to 1.5x hoặc 2x: mở cuộn nội bộ để soi chi tiết
          const baseSplit = Math.max(280, Math.min(370, window.innerHeight - 220));
          const baseBlink = Math.max(300, Math.min(440, window.innerHeight - 200));

          if (dom.canvasSplitT1) {
            dom.canvasSplitT1.style.width = `${Math.round(baseSplit * scale)}px`;
            dom.canvasSplitT1.style.height = `${Math.round(baseSplit * scale)}px`;
          }
          if (dom.canvasSplitT2) {
            dom.canvasSplitT2.style.width = `${Math.round(baseSplit * scale)}px`;
            dom.canvasSplitT2.style.height = `${Math.round(baseSplit * scale)}px`;
          }
          if (dom.canvasBlinkMain) {
            dom.canvasBlinkMain.style.width = `${Math.round(baseBlink * scale)}px`;
            dom.canvasBlinkMain.style.height = `${Math.round(baseBlink * scale)}px`;
          }
          if (dom.fitsZoomBody) { dom.fitsZoomBody.style.overflow = "auto"; }
        }
      });
    });
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

    if (dom.btnReopenFloatingCard) {
      dom.btnReopenFloatingCard.title = `Mở lại thông tin "${obj.name}" (Phím tắt: I)`;
    }

    // Khi chọn một thiên thể mới, tự động mở lại thẻ nếu trước đó người dùng đã tắt
    isFloatingCardDismissed = false;
    if (dom.toggleTargetCard) dom.toggleTargetCard.checked = true;
  }

  /**
   * Đặt vị trí thẻ nổi bám theo tâm ngắm Reticle trên màn hình
   */
  function updateFloatingCardPosition(pos) {
    if (!pos.visible || isAladinMode) {
      dom.floatingCard.style.opacity = "0";
      dom.floatingCard.style.pointerEvents = "none";
      if (dom.btnReopenFloatingCard) {
        dom.btnReopenFloatingCard.classList.add("hidden");
        dom.btnReopenFloatingCard.style.opacity = "0";
        dom.btnReopenFloatingCard.style.pointerEvents = "none";
      }
      return;
    }

    // Đặt thẻ nổi lệch sang bên phải của vòng tròn tâm ngắm để không che khuất ngôi sao
    const left = Math.min(skyEngine.width - 295, Math.max(14, pos.x + 38));
    const top = Math.min(skyEngine.height - 135, Math.max(14, pos.y - 48));

    if (isFloatingCardDismissed) {
      // Ẩn thẻ to
      dom.floatingCard.style.opacity = "0";
      dom.floatingCard.style.pointerEvents = "none";

      // Hiện nút mini huy hiệu "ℹ️ Hiện thẻ" bám ngay cạnh tâm ngắm
      if (dom.btnReopenFloatingCard) {
        dom.btnReopenFloatingCard.classList.remove("hidden");
        dom.btnReopenFloatingCard.style.opacity = "1";
        dom.btnReopenFloatingCard.style.pointerEvents = "auto";
        dom.btnReopenFloatingCard.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(pos.y - 14)}px, 0)`;
      }
    } else {
      // Hiện thẻ to
      dom.floatingCard.style.opacity = "1";
      dom.floatingCard.style.pointerEvents = "auto";
      dom.floatingCard.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;

      // Ẩn nút mini
      if (dom.btnReopenFloatingCard) {
        dom.btnReopenFloatingCard.classList.add("hidden");
        dom.btnReopenFloatingCard.style.opacity = "0";
        dom.btnReopenFloatingCard.style.pointerEvents = "none";
      }
    }
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
    const canvases = [dom.cutoutCanvasT1, dom.cutoutCanvasT2, dom.cutoutPreviewCanvas].filter(Boolean);
    canvases.forEach((c, idx) => {
      const ctx = c.getContext("2d");
      const w = c.width;
      const h = c.height;

      ctx.fillStyle = "#060b16";
      ctx.fillRect(0, 0, w, h);

      // Vẽ quầng sáng thiên thể ở tâm cutout (dịch nhẹ giữa T1 và T2 nếu thiên thể có chuyển động riêng lớn)
      const shiftPx = idx === 1 && obj.pm_dec_arcsec_yr ? Math.max(-6, Math.min(6, obj.pm_dec_arcsec_yr * 0.4)) : 0;
      const r = Math.max(12, Math.min(48, (0.3 / Math.max(0.05, fov)) * 22));
      const g = ctx.createRadialGradient(w / 2, h / 2 - shiftPx, 1, w / 2, h / 2 - shiftPx, r);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.35, obj.colorTint || "#38bdf8");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2 - shiftPx, r, 0, Math.PI * 2);
      ctx.fill();

      // Vẽ tâm chữ thập nhỏ và nhãn kích thước Cutout
      ctx.strokeStyle = idx === 1 ? "rgba(245, 158, 11, 0.55)" : "rgba(56, 189, 248, 0.5)";
      ctx.strokeRect(3, 3, w - 6, h - 6);
      ctx.fillStyle = "#bae6fd";
      ctx.font = "9px 'JetBrains Mono', monospace";
      ctx.fillText(`FOV ${fov}°`, 8, 15);
      ctx.fillText(`6.2"/px`, 8, h - 8);
    });
  }

  /**
   * Khi người dùng kéo hoặc lăn chuột trên bản đồ -> Đồng bộ ngược lại ô RA, Dec, FOV và URL
   */
  function handleMapViewportChange({ ra, dec, fov, isFinal, hitResolutionLimit, isUserInteraction }) {
    if (hitResolutionLimit) {
      showValidationBanner(
        "⚠️ Đã đạt giới hạn phân giải quang học tối đa của cảm biến SPHEREx (6.2 arcsec/pixel → FOV = 0.02°).",
        "warn"
      );
    }

    // Chỉ ghi đè ô nhập liệu RA, Dec, FOV khi người dùng chủ động kéo hoặc lăn chuột trên Canvas
    // Không làm mất độ chính xác 6 chữ số thập phân trong quá trình camera đang bay tự động (Slerp Fly-to)
    if (!isUserInteraction) {
      return;
    }

    dom.raInput.value = formatCoordPrecision(ra);
    dom.decInput.value = formatCoordPrecision(dec);
    syncFOVControls(fov);

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
      params.set("ra", formatCoordPrecision(ra));
      params.set("dec", formatCoordPrecision(dec));
      params.set("fov", (+fov).toFixed(3));
      params.set("band", activeBand);
      if (targetId && targetId !== "custom") {
        params.set("target", targetId);
      }
      if (dom.fitsZoomModal && !dom.fitsZoomModal.classList.contains("hidden") && dualViewState.mode === "motion") {
        params.set("view", "motion");
        params.set("det", String(irsaState.selectedDetector || 6));
        if (motionPlayer) {
          params.set("epoch", String(motionPlayer.state.currentIndex || 0));
        }
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
    const urlView = params.get("view");
    const urlDet = parseInt(params.get("det"), 10);
    const urlEpoch = parseInt(params.get("epoch"), 10);

    if (urlView === "motion") {
      pendingMotionUrlState = {
        det: Number.isFinite(urlDet) ? urlDet : null,
        epoch: Number.isFinite(urlEpoch) ? Math.max(0, urlEpoch) : 0
      };
    }

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
    // 0. Nút Bật/Tắt chế độ nhập Tọa độ Chuyên gia (Expert Coords Toggle)
    if (dom.btnToggleExpertCoords && dom.searchBarContainer) {
      dom.btnToggleExpertCoords.addEventListener("click", () => {
        const isBasicOnly = dom.searchBarContainer.classList.toggle("basic-only");
        if (!isBasicOnly) {
          dom.btnToggleExpertCoords.classList.add("active");
          dom.btnToggleExpertCoords.textContent = "🧭 Tọa độ: BẬT ▾";
          setTimeout(() => dom.raInput?.focus(), 60);
        } else {
          dom.btnToggleExpertCoords.classList.remove("active");
          dom.btnToggleExpertCoords.textContent = "🧭 Tọa độ (Expert)";
        }
      });
    }

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
    dom.nameSearchInput.addEventListener("input", () => {
      isNameInputDirty = true;
    });

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
    const triggerExpertSearch = async () => {
      // Nếu người dùng vừa gõ tên thiên thể mới vào ô Tên rồi bấm nút "🚀 Go / Search", tự động giải tên thiên thể đó luôn!
      if (isNameInputDirty && dom.nameSearchInput.value.trim()) {
        await handleNameResolveTrigger();
        return;
      }

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

      dom.curatedDropdown.classList.add("hidden");

      executeCoordinateSearch(raCheck.value, decCheck.value, fovCheck.value);
    };

    dom.btnSearchGo.addEventListener("click", triggerExpertSearch);
    [dom.raInput, dom.decInput].forEach((inp) => {
      inp.addEventListener("input", () => {
        isNameInputDirty = false;
      });
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          triggerExpertSearch();
        }
      });
    });

    // 3. Sự kiện thay đổi FOV từ Dropdown hoặc Thanh trượt Zoom
    dom.fovSelect.addEventListener("change", () => {
      isFovExplicitlyChanged = true;
      if (dom.fovSelect.value !== "custom") {
        const nextFov = parseFloat(dom.fovSelect.value);
        syncFOVControls(nextFov);
        skyEngine.setFOV(nextFov, true);
      }
    });

    dom.fovSlider.addEventListener("input", () => {
      isFovExplicitlyChanged = true;
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
      else if (dom.fitsZoomModal && !dom.fitsZoomModal.classList.contains("hidden") && dualViewState.mode === "motion" && motionPlayer) {
        motionPlayer.renderFrame();
      }
    });

    dom.contrastSlider.addEventListener("input", () => {
      skyEngine.updateShader({ contrast: parseFloat(dom.contrastSlider.value) });
      if (irsaState.parsedFits) refreshRealFitsVisuals();
      else if (dom.fitsZoomModal && !dom.fitsZoomModal.classList.contains("hidden") && dualViewState.mode === "motion" && motionPlayer) {
        motionPlayer.renderFrame();
      }
    });

    // 4b. Sự kiện Dual-Epoch (T1 vs T2) & Band Selector (D1..D6)
    if (dom.detPillBtns) {
      dom.detPillBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          const det = parseInt(btn.dataset.det, 10);
          if (!isNaN(det)) {
            populateEpochControlsForDetector(det);
          }
        });
      });
    }

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

    if (dom.btnAutoMaxBaseline) {
      dom.btnAutoMaxBaseline.addEventListener("click", handleAutoMaxBaseline);
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
      if (irsaState.parsedFits) refreshRealFitsVisuals();
      else if (dom.fitsZoomModal && !dom.fitsZoomModal.classList.contains("hidden") && dualViewState.mode === "motion" && motionPlayer) {
        motionPlayer.renderFrame();
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
      if (irsaState.parsedFits) refreshRealFitsVisuals();
      else if (dom.fitsZoomModal && !dom.fitsZoomModal.classList.contains("hidden") && dualViewState.mode === "motion" && motionPlayer) {
        motionPlayer.renderFrame();
      }
    });

    dom.toggleGrid.addEventListener("change", () => {
      skyEngine.updateShader({ showGrid: dom.toggleGrid.checked });
    });

    // Hàm điều khiển hiển thị Thẻ HUD mục tiêu
    function setFloatingCardVisibility(show) {
      isFloatingCardDismissed = !show;
      if (dom.toggleTargetCard) dom.toggleTargetCard.checked = show;
      if (isFloatingCardDismissed) {
        dom.floatingCard.style.opacity = "0";
        dom.floatingCard.style.pointerEvents = "none";
        if (dom.btnReopenFloatingCard) {
          dom.btnReopenFloatingCard.classList.remove("hidden");
          dom.btnReopenFloatingCard.style.opacity = "1";
          dom.btnReopenFloatingCard.style.pointerEvents = "auto";
        }
      } else {
        dom.floatingCard.style.opacity = "1";
        dom.floatingCard.style.pointerEvents = "auto";
        if (dom.btnReopenFloatingCard) {
          dom.btnReopenFloatingCard.classList.add("hidden");
          dom.btnReopenFloatingCard.style.opacity = "0";
          dom.btnReopenFloatingCard.style.pointerEvents = "none";
        }
      }
    }

    // Checkbox Bật / Tắt thẻ thông tin HUD ở thanh dock dưới
    if (dom.toggleTargetCard) {
      dom.toggleTargetCard.addEventListener("change", () => {
        setFloatingCardVisibility(dom.toggleTargetCard.checked);
      });
    }

    // Nút ✕ trên thẻ thông tin nổi để đóng nhanh
    if (dom.btnCloseFloatingCard) {
      dom.btnCloseFloatingCard.addEventListener("click", (e) => {
        e.stopPropagation();
        setFloatingCardVisibility(false);
      });
    }

    // Nút Mini "ℹ️ Hiện thẻ" bám cạnh tâm ngắm để mở lại thẻ nhanh
    if (dom.btnReopenFloatingCard) {
      dom.btnReopenFloatingCard.addEventListener("click", (e) => {
        e.stopPropagation();
        setFloatingCardVisibility(true);
      });
    }

    // Phím tắt bàn phím 'I' (Info) để bật/tắt nhanh thẻ thông tin
    document.addEventListener("keydown", (e) => {
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : "";
      if (activeTag === "input" || activeTag === "textarea" || activeTag === "select") return;
      if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        setFloatingCardVisibility(isFloatingCardDismissed); // Đảo trạng thái
      }
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
    if (dom.btnSwitchAladin) {
      dom.btnSwitchAladin.addEventListener("click", toggleAladinSurveyMode);
    }

    // Đóng dropdown khi click ra ngoài
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".name-search-wrapper")) {
        dom.curatedDropdown.classList.add("hidden");
      }
    });

    // 8. Sự kiện cho Cosmic Playlists & Tour Mode
    initCosmicPlaylistsEvents();

    // 9. Sự kiện cho Modal Phóng to Ảnh FITS Chi tiết (FITS Zoom Lightbox)
    initFitsZoomEvents();
  }

  function initFitsZoomEvents() {
    // 1. Double click hoặc click icon trên Canvas T1 & Card T1
    if (dom.cutoutCanvasT1) {
      dom.cutoutCanvasT1.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        openFitsZoomModal("split");
      });
    }
    if (dom.cardT1) {
      dom.cardT1.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        openFitsZoomModal("split");
      });
      const tagT1 = dom.cardT1.querySelector(".preview-mini-tag");
      if (tagT1) {
        tagT1.addEventListener("click", (e) => {
          e.stopPropagation();
          openFitsZoomModal("split");
        });
      }
    }

    // 2. Double click hoặc click icon trên Canvas T2 & Card T2
    if (dom.cutoutCanvasT2) {
      dom.cutoutCanvasT2.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        openFitsZoomModal("split");
      });
    }
    if (dom.cardT2) {
      dom.cardT2.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        openFitsZoomModal("split");
      });
      const tagT2 = dom.cardT2.querySelector(".preview-mini-tag");
      if (tagT2) {
        tagT2.addEventListener("click", (e) => {
          e.stopPropagation();
          openFitsZoomModal("split");
        });
      }
    }

    // 3. Đóng Modal phóng to & so sánh
    if (dom.btnCloseFitsZoom) {
      dom.btnCloseFitsZoom.addEventListener("click", closeFitsZoomModal);
    }
    if (dom.fitsZoomBackdrop) {
      dom.fitsZoomBackdrop.addEventListener("click", closeFitsZoomModal);
    }

    // 4. Chuyển đổi giữa chế độ Side-by-Side (Split), Chớp nháy (Blink) và Cosmic Motion Animation
    if (dom.btnModeSplit) {
      dom.btnModeSplit.addEventListener("click", () => setDualViewMode("split"));
    }
    if (dom.btnModeBlink) {
      dom.btnModeBlink.addEventListener("click", () => setDualViewMode("blink"));
    }
    if (dom.btnModeMotion) {
      dom.btnModeMotion.addEventListener("click", () => setDualViewMode("motion"));
    }
    if (dom.btnOpenMotionPlayer) {
      dom.btnOpenMotionPlayer.addEventListener("click", () => openFitsZoomModal("motion"));
    }
    if (dom.btnDockMotionPlayer) {
      dom.btnDockMotionPlayer.addEventListener("click", () => openFitsZoomModal("motion"));
    }

    // 5. Điều khiển Blink Play/Pause và Tốc độ nhấp nháy
    if (dom.btnBlinkPlayPause) {
      dom.btnBlinkPlayPause.addEventListener("click", toggleBlinkPlayPause);
    }
    if (dom.blinkSpeedSlider) {
      dom.blinkSpeedSlider.addEventListener("input", () => {
        if (dualViewState.isBlinking) {
          startBlinkAnimation();
        }
      });
    }

    // 6. Khởi tạo bộ nút Magnification Pills [1x Chuẩn] [1.5x To] [2x Siêu To]
    initMagnificationControls();

    // 7. Đồng bộ tâm ngắm Reticle (Crosshair) và Pixel Inspector
    if (dom.wrapSplitT1) {
      dom.wrapSplitT1.addEventListener("mousemove", (e) => handleCrosshairMouseMove(e, dom.wrapSplitT1));
      dom.wrapSplitT1.addEventListener("mouseleave", handleCrosshairMouseLeave);
    }
    if (dom.wrapSplitT2) {
      dom.wrapSplitT2.addEventListener("mousemove", (e) => handleCrosshairMouseMove(e, dom.wrapSplitT2));
      dom.wrapSplitT2.addEventListener("mouseleave", handleCrosshairMouseLeave);
    }
    if (dom.wrapBlinkMain) {
      dom.wrapBlinkMain.addEventListener("mousemove", (e) => handleCrosshairMouseMove(e, dom.wrapBlinkMain));
      dom.wrapBlinkMain.addEventListener("mouseleave", handleCrosshairMouseLeave);
    }

    // 8. Phím tắt toàn cục: ESC để đóng, Space để tạm dừng/bật Blink hoặc Cosmic Motion
    document.addEventListener("keydown", (e) => {
      if (dom.fitsZoomModal && !dom.fitsZoomModal.classList.contains("hidden")) {
        if (e.key === "Escape") {
          closeFitsZoomModal();
        } else if (e.code === "Space" && (e.target === document.body || e.target === dom.fitsZoomModal)) {
          e.preventDefault();
          if (dualViewState.mode === "motion" && motionPlayer) {
            motionPlayer.togglePlay();
          } else if (dualViewState.mode === "blink") {
            toggleBlinkPlayPause();
          } else {
            setDualViewMode("blink");
          }
        }
      }
    });
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

    if (dom.btnOpenPlaylists) {
      dom.btnOpenPlaylists.addEventListener("click", () => {
        dom.cosmicPlaylistsModal.classList.remove("hidden");
        showPlaylistsAlbumView();
      });
    }

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
      if (dom.aladinContainer) dom.aladinContainer.classList.remove("hidden");
      if (dom.btnSwitchAladin) dom.btnSwitchAladin.textContent = "✨ Quay lại SPHEREx 102-Band Canvas";
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
      if (dom.aladinContainer) dom.aladinContainer.classList.add("hidden");
      if (dom.btnSwitchAladin) dom.btnSwitchAladin.textContent = "🛰️ Xem lớp ảnh AllWISE (Aladin Lite)";
    }
  }

  window.addEventListener("DOMContentLoaded", init);
})();
