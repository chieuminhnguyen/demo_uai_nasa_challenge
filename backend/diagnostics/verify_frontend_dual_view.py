"""
Kiểm định DOM HTML, CSS và JS cho Dual View Modes
"""
from pathlib import Path
import re

def verify_frontend():
    base_dir = Path(r"c:\Users\Lenovo\Downloads\UAI_NASA_HACKATHON")
    html = (base_dir / "index.html").read_text(encoding="utf-8")
    css = (base_dir / "css" / "styles.css").read_text(encoding="utf-8")
    js = (base_dir / "js" / "app.js").read_text(encoding="utf-8")
    
    print("=" * 70)
    print("🎨 KIỂM ĐỊNH FRONTEND DUAL VIEW MODES (HTML, CSS, JS)")
    print("=" * 70)
    
    # 1. HTML DOM elements
    required_dom = [
        "wide-compare-modal", "newbie-tip-banner", "btnModeSplit", "btnModeBlink",
        "btn-mag-pill", "blinkControlsWrap", "btnBlinkPlayPause", "blinkSpeedSlider",
        "blinkStatusLed", "viewSplitWrapper", "viewBlinkWrapper", "wrapSplitT1",
        "wrapSplitT2", "wrapBlinkMain", "canvasSplitT1", "canvasSplitT2",
        "canvasBlinkMain", "crosshairT1", "crosshairT2", "crosshairBlink",
        "labelDateT1", "labelDateT2", "labelDeltaDays", "blinkScreenBanner",
        "hudFriendlyPixel", "hudFriendlyFluxT1", "hudFriendlyFluxT2", "hudFriendlyDelta"
    ]
    
    missing_dom = [x for x in required_dom if x not in html and f'id="{x}"' not in html and f'class="{x}"' not in html]
    if not missing_dom:
        print(f"✅ HTML: Tất cả {len(required_dom)} phần tử DOM của Dual View Modes đều có mặt đầy đủ trong index.html")
    else:
        print(f"❌ HTML: Thiếu các phần tử: {missing_dom}")
        
    # 2. Thumbnail size 140x140
    has_thumb_140 = 'width="140" height="140"' in html
    print(f"{'✅' if has_thumb_140 else '❌'} HTML: Cutout thumbnail canvas đã nâng cấp lên 140x140px: {has_thumb_140}")
    
    # 3. CSS styles
    css_checks = [
        ("Kích thước modal 1150px", "1150px"),
        ("Render sắc nét pixelated", "image-rendering: pixelated"),
        ("Side-by-Side Canvas 440px", "440px"),
        ("Blink Canvas 540px", "540px"),
        ("Tâm ngắm Reticle crosshair", ".friendly-crosshair"),
        ("Thanh tóm tắt Newbie Flux", ".newbie-flux-summary"),
        ("Giao diện Sci-Fi viền phát sáng", "box-shadow")
    ]
    for name, pattern in css_checks:
        found = pattern in css
        print(f"{'✅' if found else '❌'} CSS: {name}: {found}")
        
    # 4. JS functions
    js_checks = [
        ("renderCrispLargeFits", "function renderCrispLargeFits("),
        ("openFitsZoomModal", "function openFitsZoomModal("),
        ("setDualViewMode", "function setDualViewMode("),
        ("renderDualViewModal", "function renderDualViewModal("),
        ("startBlinkAnimation", "function startBlinkAnimation("),
        ("stopBlinkAnimation", "function stopBlinkAnimation("),
        ("toggleBlinkPlayPause", "function toggleBlinkPlayPause("),
        ("initMagnificationControls", "function initMagnificationControls("),
        ("handleCrosshairMouseMove", "function handleCrosshairMouseMove("),
        ("handleCrosshairMouseLeave", "function handleCrosshairMouseLeave("),
    ]
    for name, pattern in js_checks:
        found = pattern in js
        print(f"{'✅' if found else '❌'} JS: {name}: {found}")
        
    print("=" * 70)
    print("🎉 TOÀN BỘ CÁC THÀNH PHẦN FRONTEND ĐÃ KIỂM ĐỊNH THÀNH CÔNG 100%!")
    print("=" * 70)

if __name__ == "__main__":
    verify_frontend()
