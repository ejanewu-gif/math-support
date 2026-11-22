#!/usr/bin/env python3
"""Render 115年國小數學 1-6 年級 PDFs to 200 DPI PNGs, detect 25 question bounding boxes per grade,
crop razor-sharp question card images into question_images_v2/math/115_g{g}/q{nn}.png,
and extract question text into raw_data/questions_115_raw.json."""
import json
import os
import re
import subprocess
import xml.etree.ElementTree as ET
import numpy as np
from PIL import Image

BASE = "/home/antigravity/remedial-math-navigator"
PDF_DIR = f"{BASE}/raw_data/pdfs_115"
IMG_OUT = f"{BASE}/question_images_v2/math"
TMP_PAGES = "/tmp/pages_115"
os.makedirs(TMP_PAGES, exist_ok=True)

DPI = 200

def trim_whitespace(img: Image.Image, pad: int = 16) -> Image.Image:
    arr = np.array(img.convert("RGB"))
    # non-white pixels (threshold < 245)
    mask = np.any(arr < 245, axis=2)
    if not mask.any():
        return img
    ys, xs = np.where(mask)
    y0, y1 = max(0, ys.min() - pad), min(arr.shape[0], ys.max() + pad)
    x0, x1 = max(0, xs.min() - pad), min(arr.shape[1], xs.max() + pad)
    return img.crop((x0, y0, x1, y1))

def process_grade(grade: int):
    pdf_path = f"{PDF_DIR}/115_math_g{grade}.pdf"
    out_dir = f"{IMG_OUT}/115_g{grade}"
    os.makedirs(out_dir, exist_ok=True)

    # 1. Render PDF pages to PNG at 200 DPI
    prefix = f"{TMP_PAGES}/g{grade}_page"
    subprocess.run(["pdftoppm", "-png", "-r", str(DPI), pdf_path, prefix], check=True)
    page_files = sorted([f for f in os.listdir(TMP_PAGES) if f.startswith(f"g{grade}_page-") and f.endswith(".png")])
    page_imgs = [Image.open(os.path.join(TMP_PAGES, pf)) for pf in page_files]

    # 2. Get bbox XML via pdftotext -bbox-layout (strip invalid XML control chars)
    xml_str = subprocess.check_output(["pdftotext", "-bbox-layout", pdf_path, "-"]).decode("utf-8", errors="ignore")
    xml_str = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", xml_str)
    root = ET.fromstring(xml_str)
    ns = {"x": "http://www.w3.org/1999/xhtml"}
    pages_xml = root.findall(".//x:page", ns)

    # Collect all words per page
    q_markers = {}  # q_num -> (page_idx, col, yMin, xMin, page_w, page_h)
    all_page_words = []

    for p_idx, page_el in enumerate(pages_xml):
        pw = float(page_el.attrib["width"])
        ph = float(page_el.attrib["height"])
        mid_x = pw / 2.0
        words = []
        for w_el in page_el.findall(".//x:word", ns):
            txt = (w_el.text or "").strip()
            if not txt:
                continue
            xmin = float(w_el.attrib["xMin"])
            ymin = float(w_el.attrib["yMin"])
            xmax = float(w_el.attrib["xMax"])
            ymax = float(w_el.attrib["yMax"])
            words.append((xmin, ymin, xmax, ymax, txt))
        all_page_words.append((pw, ph, words))

        # Find question numbers "1." .. "25." (including glued like "8.「...") at left edge of col
        for xmin, ymin, xmax, ymax, txt in words:
            m = re.match(r"^(\d{1,2})\.(?:$|[^\d])", txt)
            if not m:
                continue
            qnum = int(m.group(1))
            if not (1 <= qnum <= 25):
                continue
            # Must be near column start: left col (< 100pt) or right col (mid_x .. mid_x + 100pt)
            col = 0 if xmin < mid_x else 1
            col_left = 0 if col == 0 else mid_x
            if (xmin - col_left) > 100:
                continue
            # Avoid footer false positives
            if ymin < 20 or ymin > ph - 50:
                continue
            if qnum not in q_markers:
                q_markers[qnum] = (p_idx, col, ymin, xmin, pw, ph)

    # Group markers by (page_idx, col) and sort by yMin
    col_groups = {}
    for qnum, info in q_markers.items():
        p_idx, col, ymin, xmin, pw, ph = info
        col_groups.setdefault((p_idx, col), []).append((ymin, qnum, xmin, pw, ph))
    for k in col_groups:
        col_groups[k].sort()

    # Build crop boxes and extract text for each question
    results = []
    for (p_idx, col), items in sorted(col_groups.items()):
        img = page_imgs[p_idx]
        iw, ih = img.size
        pw, ph, words = all_page_words[p_idx]
        sx, sy = iw / pw, ih / ph
        mid_x = pw / 2.0

        # Column horizontal bounds (leave small margin from center divider & page edges)
        cx0 = 28.0 if col == 0 else (mid_x + 6.0)
        cx1 = (mid_x - 6.0) if col == 0 else (pw - 28.0)

        for idx, (ymin, qnum, xmin, _, _) in enumerate(items):
            y0 = max(18.0, ymin - 10.0)
            if idx + 1 < len(items):
                y1 = items[idx + 1][0] - 8.0
            else:
                y1 = ph - 48.0  # above page footer

            # Crop image
            box = (int(cx0 * sx), int(y0 * sy), int(cx1 * sx), int(y1 * sy))
            crop = img.crop(box)
            crop = trim_whitespace(crop, pad=16)
            rel_img = f"question_images_v2/math/115_g{grade}/q{qnum:02d}.png"
            crop.save(os.path.join(BASE, rel_img), optimize=True)

            # Extract text inside this bbox
            q_words = [
                (w[1], w[0], w[4])
                for w in words
                if w[0] >= cx0 - 5 and w[2] <= cx1 + 5 and w[1] >= y0 - 2 and w[3] <= y1 + 4
            ]
            # Sort by line (bucket y by ~8pt) then x
            q_words.sort(key=lambda t: (round(t[0] / 9.0), t[1]))
            q_text = " ".join(t[2] for t in q_words)
            results.append({
                "grade": grade,
                "q_num": qnum,
                "image": rel_img,
                "img_size": [crop.width, crop.height],
                "text": q_text
            })

    results.sort(key=lambda r: r["q_num"])
    found_nums = [r["q_num"] for r in results]
    missing = [n for n in range(1, 26) if n not in found_nums]
    print(f"Grade {grade}: cropped {len(results)}/25 questions. Missing: {missing}")
    return results

def main():
    all_q = []
    for g in range(1, 7):
        all_q.extend(process_grade(g))
    out_json = f"{BASE}/raw_data/questions_115_raw.json"
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(all_q, f, ensure_ascii=False, indent=2)
    print(f"TOTAL cropped: {len(all_q)}/150 questions -> {out_json}")

if __name__ == "__main__":
    main()
