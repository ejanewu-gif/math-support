#!/usr/bin/env python3
"""Parse 謝老師整理學扶題目/*.docx to extract real 全體/高分組/低分組 option statistics,
misconception notes, and embedded diagrams into raw_data/teacher_topics.json."""
import json
import os
import re
import zipfile
import docx

BASE = "/home/antigravity/remedial-math-navigator"
DOCX_DIR = f"{BASE}/raw_data/teacher_docx"
OUT_JSON = f"{BASE}/raw_data/teacher_topics.json"

DOMAIN_MAP = {
    "數概念與計算": ["基數與序數", "兩個計數單位", "大數的數概念", "因數與倍數", "分數", "分數乘以分數", "整數除以整數", "概算", "加法結合律", "加減互逆", "運算次序的約定", "關係"],
    "文字題與解題策略": ["文字題語意", "比較型問題", "兩步驟問題", "兩步驟問題(1)", "分小數兩步驟", "多步驟問題併式", "具體物教學"],
    "量與實測": ["個別單位比較", "量感", "直尺測量", "報讀時刻", "報讀磅秤", "容量", "複名數的命名", "重量(化聚和複名數加減)", "速率", "比例尺"],
    "空間與形狀": ["正方形和長方形", "四邊形的定義與性質", "長方形周長面積公式", "圖形面積", "圓", "圓周率", "扇形"],
}

def get_domain(topic_name: str) -> str:
    for dom, names in DOMAIN_MAP.items():
        if topic_name in names:
            return dom
    return "數與量"

def clean(t: str) -> str:
    return re.sub(r"\s+", " ", t).strip()

def parse_float(s: str):
    s = s.replace(" ", "").replace("%", "")
    try:
        v = float(s)
        return round(v / 100.0, 2) if v > 1.0 else round(v, 2)
    except Exception:
        return None

def extract_stat_table(tbl):
    """Detect a 4-option stat table containing 全體 / 高分組 / 低分組."""
    rows = [[clean(c.text) for c in r.cells] for r in tbl.rows]
    if len(rows) < 4 or len(rows[0]) < 5:
        return None
    header_joined = "".join(rows[0])
    if "選" not in header_joined and "項" not in header_joined:
        return None

    # Find which option has * (correct answer)
    correct_opt = None
    for idx in range(1, min(5, len(rows[0]))):
        if "*" in rows[0][idx] or "＊" in rows[0][idx]:
            correct_opt = idx

    all_vals, high_vals, low_vals = None, None, None
    for r in rows[1:]:
        label = r[0].replace(" ", "")
        vals = [parse_float(r[i]) for i in range(1, 5)]
        if any(v is None for v in vals):
            continue
        if "全體" in label:
            all_vals = vals
        elif "高分" in label:
            high_vals = vals
        elif "低分" in label:
            low_vals = vals

    if not (all_vals and high_vals and low_vals):
        return None

    # If no explicit *, assume highest high-group rate is correct
    if correct_opt is None:
        correct_opt = high_vals.index(max(high_vals)) + 1

    options = []
    high_risk_traps = []
    for i in range(4):
        opt_num = i + 1
        is_corr = (opt_num == correct_opt)
        is_trap = (not is_corr) and (low_vals[i] >= 0.15)
        if is_trap:
            high_risk_traps.append(opt_num)
        options.append({
            "opt": opt_num,
            "all": all_vals[i],
            "high": high_vals[i],
            "low": low_vals[i],
            "is_correct": is_corr,
            "high_risk_trap": is_trap
        })

    return {
        "correct_opt": correct_opt,
        "pass_rate": all_vals[correct_opt - 1],
        "high_pass_rate": high_vals[correct_opt - 1],
        "low_pass_rate": low_vals[correct_opt - 1],
        "high_risk_traps": high_risk_traps,
        "options": options
    }

def main():
    files = sorted([f for f in os.listdir(DOCX_DIR) if f.endswith(".docx")])
    topics = []
    total_stat_tables = 0

    for fname in files:
        topic_name = fname[:-5]
        fpath = os.path.join(DOCX_DIR, fname)
        try:
            doc = docx.Document(fpath)
        except Exception as e:
            print(f"Skip {fname}: {e}")
            continue

        # Collect key text snippets (non-empty paragraphs)
        paras = [clean(p.text) for p in doc.paragraphs if clean(p.text)]
        # Also extract stat tables
        stat_tables = []
        for tbl in doc.tables:
            st = extract_stat_table(tbl)
            if st:
                stat_tables.append(st)
        total_stat_tables += len(stat_tables)

        # Detect grade mentions
        grade_matches = set(re.findall(r"([一二三四五六])年級", " ".join(paras[:40])))
        g_map = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6}
        grades = sorted([g_map[g] for g in grade_matches if g in g_map])

        # Count embedded media
        with zipfile.ZipFile(fpath) as z:
            img_count = sum(1 for n in z.namelist() if n.startswith("word/media/"))

        # Pick clean preview highlights
        highlights = []
        for p in paras:
            if len(p) >= 8 and not p.startswith("選項"):
                highlights.append(p[:140])
            if len(highlights) >= 6:
                break

        topics.append({
            "id": f"topic_{len(topics)+1:02d}",
            "title": topic_name,
            "domain": get_domain(topic_name),
            "grades": grades if grades else [3, 4],
            "image_count": img_count,
            "stat_table_count": len(stat_tables),
            "stat_tables": stat_tables[:6],
            "highlights": highlights
        })

    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(topics, f, ensure_ascii=False, indent=2)
    print(f"Parsed {len(topics)} teacher topics, extracted {total_stat_tables} real stat tables -> {OUT_JSON}")

if __name__ == "__main__":
    main()
