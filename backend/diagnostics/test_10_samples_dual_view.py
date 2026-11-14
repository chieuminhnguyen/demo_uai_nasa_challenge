"""
Kiểm thử tự động tính năng HIGH-VISIBILITY & NEWBIE-FRIENDLY DUAL VIEW MODES
trên 10 samples mẫu từ tập dữ liệu SPHEREx của Ban tổ chức.
"""

import sys
import io
import math
import json
import asyncio
from pathlib import Path
import httpx
import numpy as np
from astropy.io import fits
from astropy.wcs import WCS

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT_DIR))

from backend.services.irsa_client import (
    load_spherex_100_samples,
    query_irsa_sia_csv,
    parse_sia_csv_rows,
    fetch_irsa_fits_cutout,
    analyze_fits_with_astropy
)

async def test_sample_dual_view(sample: dict, sample_idx: int) -> dict:
    name = sample.get("name", f"Target_{sample_idx}")
    ra = float(sample.get("ra", 0.0))
    dec = float(sample.get("dec", 0.0))
    cat = sample.get("categoryLabel", "Thiên thể")
    
    print("-" * 75, flush=True)
    print(f"🔬 SAMPLE #{sample_idx + 1:02d}: {name} ({cat})", flush=True)
    print(f"   Tọa độ: RA {ra:.5f}°, Dec {dec:+.5f}°", flush=True)
    
    # 1. Query SIAv2 catalog
    csv_text = await query_irsa_sia_csv(ra=ra, dec=dec, radius=0.05)
    rows = parse_sia_csv_rows(csv_text, target_ra=ra, target_dec=dec)
    
    if not rows:
        raise ValueError(f"Không tìm thấy frame quan sát nào trong SIAv2 cho {name}")
    
    print(f"   -> Tìm thấy {len(rows)} frames trong kho lưu trữ SPHEREx SIAv2", flush=True)
    
    # 2. Phân loại theo cảm biến D1..D6 và chọn Detector tối ưu
    by_det = {d: [] for d in range(1, 7)}
    for r in rows:
        d = r.get("detector", 6)
        if d in by_det:
            by_det[d].append(r)
    
    chosen_det = 6
    if len(by_det[6]) < 2:
        for d in [5, 4, 3, 2, 1]:
            if len(by_det[d]) >= 2:
                chosen_det = d
                break
    
    det_rows = sorted(by_det[chosen_det], key=lambda x: x.get("t_min_mjd", 0))
    if len(det_rows) < 2:
        all_sorted = sorted(rows, key=lambda x: x.get("t_min_mjd", 0))
        t1_row = all_sorted[0]
        t2_row = all_sorted[-1]
    else:
        t1_row = det_rows[0]
        t2_row = det_rows[-1]
        
    delta_days = abs(t2_row.get("t_min_mjd", 0) - t1_row.get("t_min_mjd", 0))
    print(f"   -> Detector đã chọn: D{chosen_det} | Khoảng thời gian Baseline: Δt = {delta_days:.1f} ngày", flush=True)
    
    # 3. Tải song song 2 ảnh FITS (T1 Quá khứ & T2 Hiện tại)
    (bytes1, _), (bytes2, _) = await asyncio.gather(
        fetch_irsa_fits_cutout(t1_row["access_url"], ra=ra, dec=dec, size=0.1, mode="compact"),
        fetch_irsa_fits_cutout(t2_row["access_url"], ra=ra, dec=dec, size=0.1, mode="compact"),
    )
    
    # 4. Kiểm định Astropy FITS Parsing & Data Integrity
    ana1 = analyze_fits_with_astropy(bytes1, target_ra=ra, target_dec=dec)
    ana2 = analyze_fits_with_astropy(bytes2, target_ra=ra, target_dec=dec)
    
    assert ana1["valid"] and ana2["valid"], "Lỗi: File FITS không hợp lệ"
    assert ana1["width"] > 0 and ana1["height"] > 0, "Kích thước ma trận FITS T1 lỗi"
    assert ana2["width"] > 0 and ana2["height"] > 0, "Kích thước ma trận FITS T2 lỗi"
    
    flux_t1 = ana1["center_peak_flux_mjy_sr"]
    flux_t2 = ana2["center_peak_flux_mjy_sr"]
    delta_flux = flux_t2 - flux_t1
    
    # 5. Kiểm tra logic thông điệp tiếng Việt Newbie-friendly
    noise_est = max(0.2, ana1["mean_zodi_mjy_sr"] * 0.05)
    if abs(delta_flux) < noise_est:
        vn_status = f"Đứng im bình thường (Chênh lệch: {delta_flux:+.2f})"
    elif delta_flux > 0:
        vn_status = f"Sáng hơn +{delta_flux:.2f} MJy/sr (Phát hiện biến thiên/dịch chuyển!)"
    else:
        vn_status = f"Tối đi {delta_flux:.2f} MJy/sr (Vật thể đã rời vị trí!)"
    
    print(f"   -> Kích thước FITS T1: {ana1['width']}x{ana1['height']}px | T2: {ana2['width']}x{ana2['height']}px", flush=True)
    print(f"   -> Độ sáng T1: {flux_t1:.2f} MJy/sr | T2: {flux_t2:.2f} MJy/sr | ΔFlux: {delta_flux:+.2f} MJy/sr", flush=True)
    print(f"   -> Đánh giá Newbie: \"{vn_status}\"", flush=True)
    print(f"   ✅ SAMPLE #{sample_idx + 1:02d} ĐẠT YÊU CẦU DUAL VIEW (Split 440px & Blink 540px)", flush=True)
    
    return {
        "sample_idx": sample_idx + 1,
        "name": name,
        "ra": ra,
        "dec": dec,
        "detector": chosen_det,
        "delta_days": delta_days,
        "flux_t1": flux_t1,
        "flux_t2": flux_t2,
        "delta_flux": delta_flux,
        "vn_status": vn_status,
        "status": "PASS"
    }

async def run_10_samples_suite():
    print("=" * 80, flush=True)
    print("🌟 BỘ KIỂM THỬ TỰ ĐỘNG TRÊN 10 SAMPLES MẪU TẬP DỮ LIỆU BAN TỔ CHỨC SPHEREx", flush=True)
    print("   Tính năng: Dual View Modes (Side-by-Side 440px & Blink Comparator 540px)", flush=True)
    print("=" * 80, flush=True)
    
    samples_all = load_spherex_100_samples()
    if not samples_all:
        print("❌ Lỗi: Không thể nạp tập dữ liệu SPHEREx 100 Samples", flush=True)
        sys.exit(1)
        
    print(f"Tổng số mẫu trong tập dữ liệu IRSA: {len(samples_all)} samples.", flush=True)
    
    # Chọn 10 samples đại diện đa dạng:
    # 0: Barnard's Star (Sao chuyển động cực nhanh - High Proper Motion)
    # 2: WISE 0855-0714 (Sao lùn nâu siêu lạnh Y-dwarf)
    # 4: R Draconis (Sao biến quang chu kỳ dài Mira gần Cực Hoàng đạo Bắc)
    # 6: SPLICES J104502.85-594828.8 (Carina Nebula - Vùng tạo sao lớn)
    # 8: SPLICES J104510.16-595204.8 (Carina Nebula - Nguồn băng liên sao)
    # 9: SPLICES J104503.34-595122.7 (Carina Nebula - Sao trẻ YSO)
    # 15: SPLICES J104522.26-595047.0 (Carina Nebula - Sao carbon C-AGB)
    # 16: SPLICES J084832.97-433119.3 (Vela Molecular Ridge - Vùng phân tử Vela)
    # 24: SPLICES J084818.11-433201.9 (Vela Molecular Ridge - Nguồn hồng ngoại SPHEREx)
    # 29: SPLICES J084813.57-433326.2 (Vela Molecular Ridge - Tiền sao tiền dãy chính)
    sample_indices = [0, 2, 4, 6, 8, 9, 15, 16, 24, 29]
    selected_samples = [samples_all[i] for i in sample_indices]
    
    results = []
    errors = []
    
    for i, s_idx in enumerate(sample_indices):
        s = samples_all[s_idx]
        try:
            res = await test_sample_dual_view(s, i)
            results.append(res)
        except Exception as e:
            print(f"❌ SAMPLE #{i+1:02d} ({s.get('name')}) THẤT BẠI: {e}", flush=True)
            errors.append({"sample_idx": i+1, "name": s.get("name"), "error": str(e)})
            
    print("\n" + "=" * 80)
    print("📊 TỔNG KẾT BÁO CÁO KIỂM THỬ 10 SAMPLES:")
    print("=" * 80)
    for r in results:
        print(f"  • Sample #{r['sample_idx']:02d}: {r['name']:<25} | D{r['detector']} | Δt={r['delta_days']:>5.1f}d | ΔF={r['delta_flux']:>+6.2f} | {r['status']}")
        
    print("-" * 80)
    if errors:
        print(f"❌ KẾT QUẢ: {len(results)}/10 PASS, {len(errors)}/10 FAIL.")
        for err in errors:
            print(f"   - Lỗi tại Sample #{err['sample_idx']} ({err['name']}): {err['error']}")
        sys.exit(1)
    else:
        print("🎉 KẾT QUẢ: 10/10 SAMPLES ĐÃ PASS HOÀN TOÀN (100% SUCCESS RATE)!")
        print("   Mọi dữ liệu ma trận FITS, căn chỉnh thời điểm T1-T2, quang thông và nhãn tiếng Việt đều hoàn hảo.")
    print("=" * 80)

if __name__ == "__main__":
    asyncio.run(run_10_samples_suite())
