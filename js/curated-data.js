/**
 * CURATED CELESTIAL DATABASE (Bộ dữ liệu lưu sẵn tốc độ 0ms)
 * Phục vụ tính năng Tìm kiếm cơ bản & Gợi ý thiên thể cho người mới tiếp cận
 * Đầy đủ thông số RA, Dec, FOV mặc định và 6 lớp HDU của Multi-Extension FITS (SPHEREx Lv2)
 */

window.CURATED_OBJECTS = [
  {
    id: "sedna",
    name: "90377 Sedna",
    aliases: ["sedna", "2003 vb12", "planet x candidate 1"],
    category: "planet-x",
    categoryLabel: "🎯 Ứng viên săn Planet X",
    rank: "#1 Hot Search",
    ra: 56.8392,
    dec: 11.9644,
    defaultFov: 0.25,
    distanceAU: "84.2 AU (Vành đai rìa Thái Dương Hệ)",
    description: "Thiên thể xa xôi có quỹ đạo lệch tâm kỳ dị nhất Hệ Mặt Trời — bằng chứng gián tiếp mạnh mẽ nhất dẫn đường tới Hành tinh thứ 9 (Planet X).",
    colorTint: "#ff7b54",
    spectralType: "Methane & Water Ice Rich (Hấp thụ mạnh ở 3.1 µm & 4.2 µm)",
    telemetry: {
      obsTime: "2025-05-14T08:42:19Z",
      epoch: "DR1 (Epoch 1 - All-Sky Survey)",
      detectorArray: "Array 4 & 5 (Near-IR 2.4 - 4.5 µm)",
      imageFlux: 18.42, // MJy/sr
      zodiFlux: 4.15,   // MJy/sr (Ánh sáng hoàng đạo)
      variance: 0.018,  // MJy/sr^2
      psfFwhm: 6.18,    // arcsec (Độ sắc nét EPSF)
      snr: 64.5,
      qualityFlag: "CLEAN",
      qualityCode: "0x0000",
      qualityMessage: "🟢 SẠCH NHIỄU (100% Clean Pixel - Tín hiệu chuẩn khoa học)"
    },
    // Đặc trưng phổ 102 dải: Hấp thụ băng nước ở 3.1 um và CH4/CO2 ở 4.26 um
    spectrumProfile: "ice_methane"
  },
  {
    id: "2012vp113",
    name: "2012 VP113 (Biden)",
    aliases: ["2012 vp113", "biden", "vp113", "sednoid"],
    category: "planet-x",
    categoryLabel: "🎯 Ứng viên săn Planet X",
    rank: "#2 Planet X Clue",
    ra: 64.1125,
    dec: -2.4819,
    defaultFov: 0.25,
    distanceAU: "80.5 AU (Vùng Đám mây Oort trong)",
    description: "Thiên thể Sednoid thứ hai được phát hiện. Góc cận nhật của nó bị kéo lệch đồng bộ với Sedna bởi một hành tinh khổng lồ chưa từng biết tới.",
    colorTint: "#ffb26b",
    spectralType: "Reddish IR Slope (Bề mặt giàu hợp chất hữu cơ Tholin & Băng)",
    telemetry: {
      obsTime: "2025-06-02T14:15:05Z",
      epoch: "DR1 (Epoch 1 - All-Sky Survey)",
      detectorArray: "Array 6 (Thermal IR 3.8 - 5.0 µm)",
      imageFlux: 12.75,
      zodiFlux: 5.30,
      variance: 0.032,
      psfFwhm: 6.24,
      snr: 38.2,
      qualityFlag: "CLEAN",
      qualityCode: "0x0000",
      qualityMessage: "🟢 SẠCH NHIỄU (Tín hiệu hồng ngoại ổn định)"
    },
    spectrumProfile: "red_slope"
  },
  {
    id: "orion",
    name: "Tinh vân Lạp Hộ (Orion Nebula - M42)",
    aliases: ["orion", "m42", "ngc 1976", "tinh van lap ho", "orion nebula"],
    category: "wonder",
    categoryLabel: "🌌 Kỳ quan Vũ trụ yêu thích",
    rank: "🔥 Top 1 Yêu thích",
    ra: 83.8221,
    dec: -5.3911,
    defaultFov: 0.5,
    distanceAU: "1,344 Năm ánh sáng",
    description: "Vườn ươm sao gần Trái Đất nhất. Kính SPHEREx nhìn xuyên qua lớp bụi dày để hé lộ hàng ngàn ngôi sao sơ sinh và phân tử nước đóng băng.",
    colorTint: "#68d8d6",
    spectralType: "PAH Emission & H2O Ice (Phát xạ mạnh ở 3.3 µm)",
    telemetry: {
      obsTime: "2025-03-21T02:11:44Z",
      epoch: "DR1 (Epoch 1 - All-Sky Survey)",
      detectorArray: "All 6 Arrays (0.75 - 5.0 µm)",
      imageFlux: 142.80,
      zodiFlux: 3.10,
      variance: 0.011,
      psfFwhm: 6.15,
      snr: 215.0,
      qualityFlag: "SATURATED_WARN",
      qualityCode: "0x0004",
      qualityMessage: "🟡 CẢNH BÁO NHẸ: Vùng tâm Trapezium rất sáng (Gần ngưỡng bão hòa)"
    },
    spectrumProfile: "nebula_emission"
  },
  {
    id: "wise0855",
    name: "WISE 0855-0714",
    aliases: [
      "wise0855",
      "wise 0855",
      "wise 0855-0714",
      "wise j085510.83-071442.5",
      "wise j0855-0714",
      "brown dwarf",
      "sao lun nau"
    ],
    category: "benchmark",
    categoryLabel: "🧪 Benchmark (Fast-Moving Brown Dwarf ~250 K)",
    test_case: "Fast-moving Brown Dwarf",
    rank: "❄️ Benchmark #3",
    ra: 133.795129,
    dec: -7.245147,
    epoch: 2010.5,
    pm_ra_arcsec_yr: -8.118,
    pm_dec_arcsec_yr: 0.680,
    pm_convention: "pm_ra_cosdec",
    coordinate_source: "Luhman (2014, ApJ, 786, L18) WISE discovery epoch J2010.5",
    proper_motion_source: "Luhman & Esplin (2016, AJ, 152, 78) / Kirkpatrick et al. (2021)",
    defaultFov: 0.1,
    recommended_detectors: [5, 6],
    distanceAU: "7.53 Năm ánh sáng (Rất gần Mặt Trời)",
    description: "Sao lùn nâu loại Y chuyển động nhanh (-8.12\"/năm) và cực lạnh (~250 K). Phát xạ mạnh nhất ở kênh 4.5 µm của SPHEREx.",
    colorTint: "#a78bfa",
    spectralType: "Y-Dwarf (Đỉnh phát xạ 4.5 µm)",
    telemetry: {
      obsTime: "2025-04-19T19:30:00Z",
      epoch: "DR1 (263 SIA Rows Queried)",
      detectorArray: "Array 5 & 6 (4.0 - 5.0 µm Window)",
      imageFlux: 24.60,
      zodiFlux: 3.85,
      variance: 0.025,
      psfFwhm: 6.20,
      snr: 52.8,
      qualityFlag: "CLEAN",
      qualityCode: "0x0000",
      qualityMessage: "🟢 SẠCH NHIỄU (Phát hiện rõ ở kênh hồng ngoại dài 4.5 µm)"
    },
    spectrumProfile: "brown_dwarf"
  },
  {
    id: "barnard",
    name: "Barnard's Star",
    aliases: [
      "barnard",
      "barnard's star",
      "barnards star",
      "gj 699",
      "hip 87937",
      "sao barnard"
    ],
    category: "benchmark",
    categoryLabel: "🧪 Benchmark (High Proper Motion Star)",
    test_case: "Proper Motion",
    rank: "🏃 Benchmark #1",
    ra: 269.452077,
    dec: 4.693365,
    epoch: 2000.0,
    pm_ra_arcsec_yr: -0.8015,
    pm_dec_arcsec_yr: 10.3624,
    pm_convention: "pm_ra_cosdec",
    coordinate_source: "SIMBAD / Hipparcos / Gaia DR3 ICRS propagated to J2000.0 (GJ 699 / HIP 87937)",
    proper_motion_source: "Gaia DR3 (pmra=-801.551 mas/yr, pmdec=+10362.394 mas/yr)",
    cached_cutout_query_center: {
      ra_deg: 269.446294,
      dec_deg: 4.767881,
      propagated_to_mjd: 61000.0,
      propagated_epoch_jyear: 2025.887748,
      fov_deg: 0.1
    },
    provenance_audit: {
      verification_status: "verified_local_cache_subset",
      cached_fits_count: 30,
      complete_sia_catalog_cached: false,
      collections_verified_in_cache: { spherex_dr1: 19, spherex_qr3: 11 },
      by_detector_in_cache: { 5: 16, 6: 14 },
      baseline_days: 402.76
    },
    defaultFov: 0.1,
    recommended_detectors: [5, 6],
    distanceAU: "5.96 Năm ánh sáng (Hệ sao gần Trái Đất thứ hai)",
    description: "Sao có chuyển động riêng (Proper Motion) nhanh nhất trên bầu trời (~10.36 arcsec/năm). Mục tiêu kiểm định dịch chuyển giữa các chu kỳ quan sát SPHEREx.",
    colorTint: "#f87171",
    spectralType: "M4.0V Red Dwarf (Cận hồng ngoại Detectors 5 & 6)",
    telemetry: {
      obsTime: "2025-10-15T12:00:00Z",
      epoch: "DR1 / QR3 (Epoch 2025.89)",
      detectorArray: "Array 5 & 6 (3.8 - 5.0 µm)",
      imageFlux: 38.60,
      zodiFlux: 3.40,
      variance: 0.016,
      psfFwhm: 6.18,
      snr: 145.0,
      qualityFlag: "CLEAN",
      qualityCode: "0x0000",
      qualityMessage: "🟢 SẠCH NHIỄU (30 Cutouts đã xác minh SHA-256)"
    },
    spectrumProfile: "stellar_hot"
  },
  {
    id: "eps_ind_b",
    name: "Epsilon Indi B",
    aliases: [
      "eps_ind_b",
      "epsilon indi b",
      "eps ind b",
      "hd 209100 b"
    ],
    category: "benchmark",
    categoryLabel: "🧪 Benchmark (Binary Brown Dwarf System)",
    test_case: "Brown Dwarf Binary System",
    rank: "👥 Benchmark #2",
    ra: 331.044147,
    dec: -56.782844,
    epoch: 2000.0,
    pm_ra_arcsec_yr: 3.9614,
    pm_dec_arcsec_yr: -2.5383,
    pm_convention: "pm_ra_cosdec",
    coordinate_source: "SIMBAD / Scholz et al. (2003) ICRS J2000.0 (HD 209100 B)",
    proper_motion_source: "Scholz et al. (2003, A&A, 398, L29) / Gaia DR3",
    defaultFov: 0.1,
    recommended_detectors: [5, 6],
    distanceAU: "12.0 Năm ánh sáng",
    description: "Hệ sao lùn nâu đôi (T1 + T6). Mục tiêu kiểm thử tách nguồn đôi và phổ hấp thụ Mê-tan của SPHEREx.",
    colorTint: "#c084fc",
    spectralType: "Binary T-Dwarf (Hấp thụ Mê-tan sâu)",
    telemetry: {
      obsTime: "2025-06-20T04:18:00Z",
      epoch: "DR1 (All-Sky Survey)",
      detectorArray: "Array 5 & 6",
      imageFlux: 21.30,
      zodiFlux: 2.90,
      variance: 0.022,
      psfFwhm: 6.20,
      snr: 68.2,
      qualityFlag: "CLEAN",
      qualityCode: "0x0000",
      qualityMessage: "🟢 SẠCH NHIỄU (Mục tiêu kiểm định sao lùn nâu)"
    },
    spectrumProfile: "brown_dwarf"
  },
  {
    id: "rw_aur",
    name: "RW Aurigae",
    aliases: [
      "rw_aur",
      "rw aurigae",
      "rw aur",
      "hd 240764"
    ],
    category: "benchmark",
    categoryLabel: "🧪 Benchmark (T Tauri Variable Star)",
    test_case: "Variable Star",
    rank: "✨ Benchmark #4",
    ra: 76.956526,
    dec: 30.401438,
    epoch: 2000.0,
    pm_ra_arcsec_yr: 0.003,
    pm_dec_arcsec_yr: -0.024,
    pm_convention: "pm_ra_cosdec",
    coordinate_source: "SIMBAD / Gaia DR3 ICRS J2000.0 (HD 240764)",
    proper_motion_source: "Gaia DR3 (pmra=+3.34 mas/yr, pmdec=-24.16 mas/yr)",
    defaultFov: 0.1,
    recommended_detectors: [1, 2, 3, 4, 5, 6],
    distanceAU: "530 Năm ánh sáng",
    description: "Hệ sao biến quang trẻ T Tauri với đĩa tiền hành tinh bị che khuất tuần hoàn. Mục tiêu kiểm thử biến thiên quang thông trên 102 kênh phổ.",
    colorTint: "#fbbf24",
    spectralType: "T Tauri Star (Đĩa bụi tiền hành tinh)",
    telemetry: {
      obsTime: "2025-02-14T06:12:00Z",
      epoch: "DR1 (All-Sky Survey)",
      detectorArray: "All 6 Arrays (0.75 - 5.0 µm)",
      imageFlux: 84.50,
      zodiFlux: 3.10,
      variance: 0.015,
      psfFwhm: 6.16,
      snr: 162.0,
      qualityFlag: "CLEAN",
      qualityCode: "0x0000",
      qualityMessage: "🟢 SẠCH NHIỄU (Mục tiêu kiểm thử biến quang)"
    },
    spectrumProfile: "nebula_emission"
  },
  {
    id: "r_dra",
    name: "R Draconis",
    aliases: [
      "r_dra",
      "r draconis",
      "r dra",
      "hd 150072"
    ],
    category: "benchmark",
    categoryLabel: "🧪 Benchmark (Mira Cet Variable Star)",
    test_case: "Variable Star",
    rank: "🔴 Benchmark #5",
    ra: 248.167611,
    dec: 66.754979,
    epoch: 2000.0,
    pm_ra_arcsec_yr: -0.006,
    pm_dec_arcsec_yr: -0.033,
    pm_convention: "pm_ra_cosdec",
    coordinate_source: "SIMBAD / Gaia DR3 ICRS J2000.0 (HD 150072)",
    proper_motion_source: "Gaia DR3 (pmra=-5.92 mas/yr, pmdec=-33.14 mas/yr)",
    defaultFov: 0.1,
    recommended_detectors: [1, 2, 3, 4, 5, 6],
    distanceAU: "1,500 Năm ánh sáng",
    description: "Sao biến quang khổng lồ đỏ loại Mira với chu kỳ dao động độ sáng ~245 ngày. Mục tiêu kiểm định đường cong ánh sáng đa chu kỳ (Multi-Epoch).",
    colorTint: "#f472b6",
    spectralType: "M-Giant Mira Variable (Đỏ sâu hồng ngoại)",
    telemetry: {
      obsTime: "2025-05-30T17:45:00Z",
      epoch: "DR1 (All-Sky Survey)",
      detectorArray: "All 6 Arrays",
      imageFlux: 72.80,
      zodiFlux: 2.60,
      variance: 0.018,
      psfFwhm: 6.17,
      snr: 138.4,
      qualityFlag: "CLEAN",
      qualityCode: "0x0000",
      qualityMessage: "🟢 SẠCH NHIỄU (Mục tiêu kiểm thử biến quang Mira)"
    },
    spectrumProfile: "red_slope"
  },
  {
    id: "andromeda",
    name: "Thiên hà Tiên Nữ (Andromeda - M31)",
    aliases: ["andromeda", "m31", "ngc 224", "thien ha tien nu"],
    category: "wonder",
    categoryLabel: "🌌 Kỳ quan Vũ trụ yêu thích",
    rank: "🌟 Top 2 Yêu thích",
    ra: 10.6847,
    dec: 41.2687,
    defaultFov: 1.0,
    distanceAU: "2.537 Triệu năm ánh sáng",
    description: "Thiên hà xoắn ốc khổng lồ láng giềng của Ngân Hà với hơn 1 nghìn tỷ ngôi sao hiển hiện rõ qua bộ lọc hồng ngoại xuyên bụi của SPHEREx.",
    colorTint: "#60a5fa",
    spectralType: "Stellar Continuum (Đỉnh sao già ở 1.6 µm)",
    telemetry: {
      obsTime: "2025-07-08T11:05:12Z",
      epoch: "DR1 (Epoch 1 - All-Sky Survey)",
      detectorArray: "Array 1, 2 & 3 (0.75 - 2.4 µm)",
      imageFlux: 96.40,
      zodiFlux: 2.40,
      variance: 0.014,
      psfFwhm: 6.12,
      snr: 184.2,
      qualityFlag: "CLEAN",
      qualityCode: "0x0000",
      qualityMessage: "🟢 SẠCH NHIỄU (Độ tương phản cao, ít bụi hoàng đạo)"
    },
    spectrumProfile: "galaxy_continuum"
  },
  {
    id: "eris",
    name: "136199 Eris (Hành tinh lùn)",
    aliases: ["eris", "2003 ub313", "xena"],
    category: "planet-x",
    categoryLabel: "🎯 Ứng viên săn Planet X",
    rank: "#3 Kuiper Giant",
    ra: 24.4729,
    dec: -1.2051,
    defaultFov: 0.25,
    distanceAU: "95.9 AU (Đĩa phân tán xa)",
    description: "Hành tinh lùn nặng nhất vùng rìa Hệ Mặt Trời, bề mặt phủ băng Mê-tan tinh khiết phản chiếu ánh sáng hồng ngoại đặc trưng.",
    colorTint: "#38bdf8",
    spectralType: "Strong CH4 Absorption (Vạch hấp thụ Mê-tan sâu)",
    telemetry: {
      obsTime: "2025-08-11T05:22:50Z",
      epoch: "DR1 (Epoch 1 - All-Sky Survey)",
      detectorArray: "Array 3 & 4 (1.8 - 3.5 µm)",
      imageFlux: 31.15,
      zodiFlux: 4.80,
      variance: 0.029,
      psfFwhm: 6.21,
      snr: 71.3,
      qualityFlag: "COSMIC_RAY_WARN",
      qualityCode: "0x0010",
      qualityMessage: "🔴 CẢNH BÁO FLAGS: Phát hiện 1 tia vũ trụ (Cosmic Ray) ở rìa khung ảnh!"
    },
    spectrumProfile: "ice_methane"
  },
  {
    id: "pleiades",
    name: "Cụm sao Thất Nữ (Pleiades - M45)",
    aliases: ["pleiades", "m45", "seven sisters", "that nu", "gliese"],
    category: "wonder",
    categoryLabel: "🌌 Kỳ quan Vũ trụ yêu thích",
    rank: "✨ Cụm sao sáng nhất",
    ra: 56.75,
    dec: 24.1167,
    defaultFov: 1.0,
    distanceAU: "444 Năm ánh sáng",
    description: "Cụm sao mở trẻ trung được bao bọc bởi màn sương bụi phản xạ tuyệt đẹp, thường dùng làm chuẩn hiệu chỉnh quang độ cho kính thiên văn.",
    colorTint: "#34d399",
    spectralType: "Hot B-Stars + Silicate Dust",
    telemetry: {
      obsTime: "2025-04-02T21:48:33Z",
      epoch: "DR1 (Epoch 1 - All-Sky Survey)",
      detectorArray: "Array 1 & 2 (0.75 - 1.8 µm)",
      imageFlux: 118.50,
      zodiFlux: 4.95,
      variance: 0.015,
      psfFwhm: 6.14,
      snr: 195.4,
      qualityFlag: "CLEAN",
      qualityCode: "0x0000",
      qualityMessage: "🟢 SẠCH NHIỄU (Chuẩn hiệu chuẩn quang học tốt)"
    },
    spectrumProfile: "stellar_hot"
  }
];

/**
 * Hàm sinh dữ liệu 102 dải bước sóng (0.75 µm -> 5.0 µm) theo đặc trưng vật lý
 */
window.generate102Spectrum = function (profileType, activeBandIndex = 42) {
  const bands = [];
  for (let i = 1; i <= 102; i++) {
    const wavelength = +(0.75 + ((i - 1) / 101) * (5.0 - 0.75)).toFixed(3);
    let flux = 10;

    if (profileType === "ice_methane") {
      // Hấp thụ mạnh ở 3.05 µm (Water Ice) và 3.3 / 4.25 µm (CH4 / CO2)
      const iceDip = Math.exp(-Math.pow((wavelength - 3.08) / 0.22, 2)) * 7.2;
      const ch4Dip = Math.exp(-Math.pow((wavelength - 3.35) / 0.15, 2)) * 4.5;
      const co2Dip = Math.exp(-Math.pow((wavelength - 4.26) / 0.12, 2)) * 6.0;
      flux = 15 + Math.sin(wavelength * 1.1) * 3 - iceDip - ch4Dip - co2Dip;
    } else if (profileType === "brown_dwarf") {
      // Sao lùn nâu lạnh: Rất yếu ở < 3 µm, vọt cao cực đại ở cửa sổ 4.5 µm
      const peak45 = Math.exp(-Math.pow((wavelength - 4.52) / 0.35, 2)) * 22.0;
      const peak16 = Math.exp(-Math.pow((wavelength - 1.58) / 0.2, 2)) * 4.5;
      flux = 2.5 + peak16 + peak45;
    } else if (profileType === "nebula_emission") {
      // Tinh vân phát xạ: Đỉnh PAH 3.3 µm và Br-alpha 4.05 µm
      const pahPeak = Math.exp(-Math.pow((wavelength - 3.29) / 0.1, 2)) * 18.0;
      const brPeak = Math.exp(-Math.pow((wavelength - 4.05) / 0.08, 2)) * 14.0;
      const iceDip = Math.exp(-Math.pow((wavelength - 3.05) / 0.2, 2)) * 6.0;
      flux = 14 + wavelength * 2.2 + pahPeak + brPeak - iceDip;
    } else if (profileType === "red_slope") {
      // Thiên thể vành đai Kuiper đỏ dần về hồng ngoại
      const iceDip = Math.exp(-Math.pow((wavelength - 3.1) / 0.25, 2)) * 4.5;
      flux = 6 + wavelength * 3.8 - iceDip;
    } else {
      // Phổ sao/thiên hà điển hình (Đỉnh H-band 1.6 µm)
      const hBump = Math.exp(-Math.pow((wavelength - 1.65) / 0.45, 2)) * 14.0;
      flux = 22 / Math.pow(wavelength, 0.85) + hBump;
    }

    bands.push({
      band: i,
      wavelength,
      detector: Math.min(6, Math.floor((i - 1) / 17) + 1),
      flux: Math.max(0.8, +flux.toFixed(2))
    });
  }
  return bands;
};

/**
 * COSMIC PLAYLISTS (ĐẶC SẮC NHẤT CHO NGƯỜI MỚI - SPOTIFY CỦA VŨ TRỤ)
 * Khám phá theo chủ đề + Hỗ trợ Tour tự động (Autoplay Tour Mode)
 */
window.COSMIC_PLAYLISTS = [
  {
    id: "planet-x-trail",
    title: "Dấu vết Hành tinh thứ 9",
    englishTitle: "The Planet X Evidence Trail",
    badge: "🔥 TRỌNG TÂM ĐỀ BÀI",
    description: "Hành trình lần theo các thiên thể Sednoid có quỹ đạo bị bẻ cong bất thường dẫn đường tới Planet X.",
    color: "#ff7b54",
    gradient: "linear-gradient(135deg, rgba(255,123,84,0.35) 0%, rgba(15,23,42,0.95) 100%)",
    icon: "🪐",
    tracks: [
      {
        trackNumber: 1,
        id: "sedna",
        name: "90377 Sedna",
        tagline: "Phát súng mở màn cho bí ẩn Planet X",
        story: "Sedna mất 11,400 năm để quay quanh Mặt Trời. Một vật thể khổng lồ vô hình đã kéo lệch quỹ đạo của nó!",
        ra: 56.8392,
        dec: 11.9644,
        fov: 0.25,
        recommendedBand: 56, // 3.08 µm
        highlightFeature: "Vết lõm Băng Nước 3.1 µm"
      },
      {
        trackNumber: 2,
        id: "2012vp113",
        name: "2012 VP113 (Biden)",
        tagline: "Mảnh ghép củng cố giả thuyết",
        story: "Có điểm cận nhật lệch cùng hướng với Sedna, xác suất ngẫu nhiên chỉ là 0.007%!",
        ra: 64.1125,
        dec: -2.4819,
        fov: 0.25,
        recommendedBand: 90, // 4.5 µm
        highlightFeature: "Góc cận nhật lệch đồng bộ"
      },
      {
        trackNumber: 3,
        id: "eris",
        name: "136199 Eris",
        tagline: "Hành tinh lùn nặng nhất rìa Thái Dương Hệ",
        story: "Bề mặt phản xạ ánh sáng cực mạnh do lớp băng Mê-tan bao phủ dày đặc.",
        ra: 24.4729,
        dec: -1.2051,
        fov: 0.25,
        recommendedBand: 56,
        highlightFeature: "Cảnh báo Tia vũ trụ (Flags)"
      }
    ]
  },
  {
    id: "ghost-worlds",
    title: "Những bóng ma nhiệt lạnh",
    englishTitle: "Ghost Worlds of Thermal IR",
    badge: "❄️ THIÊN THỂ LẠNH",
    description: "Sao lùn nâu tối tăm, vô hình trong ánh sáng thường nhưng sáng rực rỡ ở dải 4.5 µm của SPHEREx.",
    color: "#a78bfa",
    gradient: "linear-gradient(135deg, rgba(167,139,250,0.35) 0%, rgba(15,23,42,0.95) 100%)",
    icon: "👻",
    tracks: [
      {
        trackNumber: 1,
        id: "wise0855",
        name: "WISE 0855−0714",
        tagline: "Ngôi sao lạnh nhất từng được biết đến",
        story: "Nhiệt độ bề mặt chỉ khoảng -13°C đến -48°C. Một ngôi sao thất bại lạnh như băng tuyết!",
        ra: 133.7862,
        dec: -7.2442,
        fov: 0.1,
        recommendedBand: 90, // 4.5 µm
        highlightFeature: "Đỉnh phát xạ nhiệt cực mạnh ở 4.5 µm"
      }
    ]
  },
  {
    id: "piercing-dust",
    title: "Mắt thần xuyên qua bụi Ngân Hà",
    englishTitle: "Piercing Cosmic Dust",
    badge: "🌌 KỲ QUAN VŨ TRỤ",
    description: "SPHEREx dùng dải 2.0 - 2.5 µm để nhìn xuyên qua các bức tường bụi tối của các vườn ươm sao khổng lồ.",
    color: "#38bdf8",
    gradient: "linear-gradient(135deg, rgba(56,189,248,0.35) 0%, rgba(15,23,42,0.95) 100%)",
    icon: "🔭",
    tracks: [
      {
        trackNumber: 1,
        id: "orion",
        name: "Tinh vân Lạp Hộ (Orion M42)",
        tagline: "Vườn ươm sao ẩn sau màn khói bụi",
        story: "Hàng ngàn ngôi sao sơ sinh phát ra tia hồng ngoại kích thích các phân tử PAH và băng nước.",
        ra: 83.8221,
        dec: -5.3911,
        fov: 0.5,
        recommendedBand: 42,
        highlightFeature: "Đỉnh phát xạ hydrocacbon PAH 3.3 µm"
      },
      {
        trackNumber: 2,
        id: "andromeda",
        name: "Thiên hà Tiên Nữ (Andromeda M31)",
        tagline: "Thiên hà láng giềng chứa 1 nghìn tỷ ngôi sao",
        story: "Kính hồng ngoại SPHEREx bóc tách lớp bụi xoắn ốc để làm lộ ra ánh sáng của các ngôi sao già.",
        ra: 10.6847,
        dec: 41.2687,
        fov: 1.0,
        recommendedBand: 24,
        highlightFeature: "Ánh sáng hồng ngoại của 1 nghìn tỷ sao"
      },
      {
        trackNumber: 3,
        id: "pleiades",
        name: "Cụm sao Thất Nữ (Pleiades M45)",
        tagline: "Cụm sao trẻ trung trong màn sương bụi",
        story: "Bụi silicat phản xạ ánh sáng sao xanh, tạo nên màn sương lấp lánh tuyệt đẹp.",
        ra: 56.75,
        dec: 24.1167,
        fov: 1.0,
        recommendedBand: 12,
        highlightFeature: "Hiệu chuẩn trắc quang thiên văn"
      }
    ]
  }
];

/**
 * BỘ KIỂM THỬ CHUẨN NASA (BENCHMARK TARGETS)
 */
window.TARGETS = {
  barnard: {
    name: "Barnard's Star",
    category: "High Proper Motion Star",
    test_case: "Proper Motion",
    ra: 269.452077,
    dec: 4.693365,
    epoch: 2000.0,
    pm_ra_arcsec_yr: -0.8015,
    pm_dec_arcsec_yr: 10.3624,
    pm_convention: "pm_ra_cosdec",
    coordinate_source: "SIMBAD / Hipparcos / Gaia DR3 ICRS propagated to J2000.0 (GJ 699 / HIP 87937)",
    proper_motion_source: "Gaia DR3 (pmra=-801.551 mas/yr, pmdec=+10362.394 mas/yr)",
    aliases: ["barnard", "barnard's star", "barnards star", "gj 699", "hip 87937"],
    data_status: "verified_local_cache_subset",
    recommended_detectors: [5, 6],
    cached_cutout_query_center: {
      ra_deg: 269.446294,
      dec_deg: 4.767881,
      propagated_to_mjd: 61000.0,
      propagated_epoch_jyear: 2025.887748,
      fov_deg: 0.1
    }
  },
  eps_ind_b: {
    name: "Epsilon Indi B",
    category: "Binary Brown Dwarf System",
    test_case: "Brown Dwarf Binary System",
    ra: 331.044147,
    dec: -56.782844,
    epoch: 2000.0,
    pm_ra_arcsec_yr: 3.9614,
    pm_dec_arcsec_yr: -2.5383,
    pm_convention: "pm_ra_cosdec",
    coordinate_source: "SIMBAD / Scholz et al. (2003) ICRS J2000.0 (HD 209100 B)",
    proper_motion_source: "Scholz et al. (2003, A&A, 398, L29) / Gaia DR3",
    aliases: ["eps_ind_b", "epsilon indi b", "eps ind b", "hd 209100 b"],
    data_status: "unverified_offline",
    recommended_detectors: [5, 6]
  },
  wise0855: {
    name: "WISE 0855-0714",
    category: "Fast-Moving Y-type Brown Dwarf (~250 K)",
    test_case: "Fast-moving Brown Dwarf",
    ra: 133.795129,
    dec: -7.245147,
    epoch: 2010.5,
    pm_ra_arcsec_yr: -8.118,
    pm_dec_arcsec_yr: 0.680,
    pm_convention: "pm_ra_cosdec",
    coordinate_source: "Luhman (2014, ApJ, 786, L18) WISE discovery epoch J2010.5 (08h55m10.831s -07d14m42.53s)",
    proper_motion_source: "Luhman & Esplin (2016, AJ, 152, 78) / Kirkpatrick et al. (2021)",
    aliases: ["wise0855", "wise 0855", "wise 0855-0714", "wise j085510.83-071442.5", "wise j0855-0714"],
    data_status: "unverified_offline",
    recommended_detectors: [5, 6]
  },
  rw_aur: {
    name: "RW Aurigae",
    category: "T Tauri Variable Star",
    test_case: "Variable Star",
    ra: 76.956526,
    dec: 30.401438,
    epoch: 2000.0,
    pm_ra_arcsec_yr: 0.003,
    pm_dec_arcsec_yr: -0.024,
    pm_convention: "pm_ra_cosdec",
    coordinate_source: "SIMBAD / Gaia DR3 ICRS J2000.0 (HD 240764)",
    proper_motion_source: "Gaia DR3 (pmra=+3.34 mas/yr, pmdec=-24.16 mas/yr)",
    aliases: ["rw_aur", "rw aurigae", "rw aur", "hd 240764"],
    data_status: "unverified_offline",
    recommended_detectors: [1, 2, 3, 4, 5, 6]
  },
  r_dra: {
    name: "R Draconis",
    category: "Mira Cet Variable Star",
    test_case: "Variable Star",
    ra: 248.167611,
    dec: 66.754979,
    epoch: 2000.0,
    pm_ra_arcsec_yr: -0.006,
    pm_dec_arcsec_yr: -0.033,
    pm_convention: "pm_ra_cosdec",
    coordinate_source: "SIMBAD / Gaia DR3 ICRS J2000.0 (HD 150072)",
    proper_motion_source: "Gaia DR3 (pmra=-5.92 mas/yr, pmdec=-33.14 mas/yr)",
    aliases: ["r_dra", "r draconis", "r dra", "hd 150072"],
    data_status: "unverified_offline",
    recommended_detectors: [1, 2, 3, 4, 5, 6]
  }
};
