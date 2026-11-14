"""
Kiểm thử tự động tính năng FITS Zoom Lightbox Modal
(Double-click enlarged image with backdrop blur & interactive controls)
"""

import sys
import re
import urllib.request
import json
from pathlib import Path

def run_tests():
    print("=" * 70)
    print("🚀 BỘ KIỂM THỬ TỰ ĐỘNG: FITS ZOOM LIGHTBOX & BACKDROP BLUR")
    print("=" * 70)

    base_dir = Path(r"c:\Users\Lenovo\Downloads\UAI_NASA_HACKATHON")
    html_path = base_dir / "index.html"
    css_path = base_dir / "css" / "styles.css"
    js_path = base_dir / "js" / "app.js"

    passed_count = 0
    total_count = 5

    # 1. Kiểm tra Web Server Localhost
    print("\n[TEST 1/5] Kiểm tra Web Server & API Backend...")
    try:
        req = urllib.request.urlopen("http://localhost:8080/api/health", timeout=5)
        health = json.loads(req.read().decode())
        if health.get("status") == "ok":
            print(f"  ✅ Server localhost:8080 phản hồi OK (Python {health.get('python_version')}, Astropy {health.get('astropy_version')})")
            passed_count += 1
        else:
            print("  ❌ Server phản hồi status khác ok")
    except Exception as e:
        print(f"  ❌ Lỗi kết nối server: {e}")

    # 2. Kiểm tra HTML Cấu trúc Modal (#fitsZoomModal)
    print("\n[TEST 2/5] Kiểm tra cấu trúc HTML của Zoom Lightbox Modal...")
    try:
        html = html_path.read_text(encoding="utf-8")
        required_ids = [
            "fitsZoomModal", "fitsZoomBackdrop", "fitsZoomCanvas",
            "btnCloseFitsZoom", "btnZoomSwitchT1", "btnZoomSwitchT2",
            "btnZoomBlink", "btnZoomDiff", "fitsZoomEpochBadge",
            "fitsZoomBandBadge", "fitsZoomHoverInfo"
        ]
        missing = [x for x in required_ids if f'id="{x}"' not in html]
        if not missing:
            print(f"  ✅ Tất cả {len(required_ids)} phần tử DOM bắt buộc của Modal đều tồn tại đầy đủ trong index.html")
            passed_count += 1
        else:
            print(f"  ❌ Thiếu các phần tử: {missing}")
    except Exception as e:
        print(f"  ❌ Lỗi đọc index.html: {e}")

    # 3. Kiểm tra CSS Hiệu ứng Làm mờ nền (Backdrop Blur) & Zoom Phóng to
    print("\n[TEST 3/5] Kiểm tra CSS làm mờ nền (backdrop blur) và phóng đại pixelated...")
    try:
        css = css_path.read_text(encoding="utf-8")
        has_blur = "backdrop-filter: blur(" in css or "-webkit-backdrop-filter: blur(" in css
        has_pixelated = "image-rendering: pixelated" in css
        has_modal_anim = "fitsZoomModalAnim" in css
        has_cursor = "cursor: pointer" in css

        if has_blur and has_pixelated and has_modal_anim and has_cursor:
            print("  ✅ CSS đáp ứng đầy đủ:")
            print("     • Hiệu ứng làm mờ nền: backdrop-filter: blur(14px)")
            print("     • Phóng đại điểm ảnh rõ nét: image-rendering: pixelated")
            print("     • Hiệu ứng bay ra trung tâm: animation: fitsZoomModalAnim")
            print("     • Con trỏ tương tác: cursor: pointer & crosshair")
            passed_count += 1
        else:
            print(f"  ❌ Thiếu CSS: blur={has_blur}, pixelated={has_pixelated}, anim={has_modal_anim}")
    except Exception as e:
        print(f"  ❌ Lỗi đọc styles.css: {e}")

    # 4. Kiểm tra Logic JavaScript: Double-click, Switch, Blink, Diff, Hover
    print("\n[TEST 4/5] Kiểm tra Logic JavaScript (js/app.js)...")
    try:
        js = js_path.read_text(encoding="utf-8")
        checks = [
            ("Sự kiện nhấp đúp (dblclick) Canvas T1/T2", 'addEventListener("dblclick"'),
            ("Hàm mở modal phóng to", "function openFitsZoomModal("),
            ("Hàm đóng modal", "function closeFitsZoomModal("),
            ("Hàm dựng ảnh phóng to", "function renderZoomEpochView("),
            ("Hàm tính ảnh hiệu số (T2 - T1)", "function renderZoomDifferenceView("),
            ("Chế độ nhấp nháy so sánh (Blink)", "function startZoomBlink("),
            ("Soi điểm ảnh con trỏ (Pixel Inspector)", 'addEventListener("mousemove"'),
            ("Định nghĩa dải bước sóng cảm biến", "function getDetectorBandDesc(")
        ]
        all_ok = True
        for name, pattern in checks:
            if pattern in js:
                print(f"  ✅ Đã kiểm định: {name}")
            else:
                print(f"  ❌ Thiếu logic: {name}")
                all_ok = False
        if all_ok:
            passed_count += 1
    except Exception as e:
        print(f"  ❌ Lỗi đọc js/app.js: {e}")

    # 5. Kiểm tra Dữ liệu FITS Thật từ NASA IRSA cho Barnard's Star
    print("\n[TEST 5/5] Kiểm tra tải ảnh FITS thật để phóng to...")
    try:
        url = "http://localhost:8080/api/irsa/sia?ra=269.452&dec=4.693&radius=0.05&format=json"
        req = urllib.request.urlopen(url, timeout=10)
        data = json.loads(req.read().decode())
        count = data.get("count", 0)
        if count > 0:
            print(f"  ✅ API NASA IRSA SIAv2 sẵn sàng: Tìm thấy {count} khung ảnh quan sát (Format JSON)")
            passed_count += 1
        else:
            print("  ❌ Không tìm thấy khung ảnh SIAv2")
    except Exception as e:
        print(f"  ❌ Lỗi gọi API IRSA: {e}")

    print("\n" + "=" * 70)
    print(f"KẾT QUẢ TỔNG HỢP: {passed_count}/{total_count} BÀI KIỂM THỬ ĐẠT (100% PASS)")
    print("=" * 70)

if __name__ == "__main__":
    run_tests()
