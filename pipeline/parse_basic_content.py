#!/usr/bin/env python3
"""Parse 國小數學基本學習內容.docx into structured JSON of MOE 108 課綱 + 基本學習內容 + 基本學習表現."""
import json
import re
import docx

DOC_PATH = "/home/antigravity/remedial-math-navigator/raw_data/國小數學基本學習內容.docx"
OUT_PATH = "/home/antigravity/remedial-math-navigator/raw_data/basic_learning_standards.json"

def clean(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()

def main():
    doc = docx.Document(DOC_PATH)
    standards = []
    current = None

    # Regex patterns for 108 課綱 codes (e.g. N-1-1, S-4-8, R-5-2, D-6-1)
    code_108_re = re.compile(r"^([NSRDG])-(\d)-(\d+[a-zA-Z]?)$")
    # 基本學習內容 codes (e.g. NC-1-1-1, SC-4-8-1, RC-5-2-1, DC-6-1-1)
    basic_code_re = re.compile(r"([NSRDG]C-\d+-\d+-\d+)\s*([^NSRDG\n]*(?:(?![NSRDG]C-\d+-\d+-\d+).)*)")
    # 基本學習表現 codes (e.g. NCP-1-1-1-1, SCP-4-8-1-1)
    perf_code_re = re.compile(r"([NSRDG]CP-\d+-\d+-\d+-\d+)\s*(.+)")

    for tbl in doc.tables:
        if len(tbl.rows) == 1 and len(tbl.columns) >= 2:
            c0 = clean(tbl.rows[0].cells[0].text)
            m = code_108_re.match(c0)
            if m:
                domain_map = {"N": "數與量", "S": "空間與形狀", "R": "關係", "D": "資料與不確定性", "G": "空間與形狀"}
                current = {
                    "code_108": c0,
                    "domain_letter": m.group(1),
                    "domain": domain_map.get(m.group(1), "其他"),
                    "grade": int(m.group(2)),
                    "description_108": clean(tbl.rows[0].cells[1].text),
                    "performance_108": clean(tbl.rows[0].cells[2].text) if len(tbl.columns) >= 3 else "",
                    "basic_contents": [],
                    "basic_performances": [],
                }
                standards.append(current)
                continue

        if current is not None and len(tbl.rows) >= 2 and len(tbl.columns) == 1:
            header = clean(tbl.rows[0].cells[0].text)
            body = tbl.rows[1].cells[0].text
            if "基本學習內容" in header:
                for line in body.splitlines():
                    line = clean(line)
                    if not line:
                        continue
                    m = re.match(r"^([NSRDG]C-\d+-\d+-\d+)\s*(.+)$", line)
                    if m:
                        current["basic_contents"].append({
                            "code": m.group(1),
                            "text": m.group(2).strip()
                        })
                    elif current["basic_contents"]:
                        current["basic_contents"][-1]["text"] += " " + line
            elif "基本學習表現" in header:
                for line in body.splitlines():
                    line = clean(line)
                    if not line:
                        continue
                    m = re.match(r"^([NSRDG]CP-\d+-\d+-\d+-\d+)\s*(.+)$", line)
                    if m:
                        current["basic_performances"].append({
                            "code": m.group(1),
                            "text": m.group(2).strip()
                        })
                    elif current["basic_performances"]:
                        current["basic_performances"][-1]["text"] += " " + line

    # Deduplicate by code_108 (merge if repeated)
    merged = {}
    for s in standards:
        k = s["code_108"]
        if k not in merged:
            merged[k] = s
        else:
            existing_bc = {b["code"] for b in merged[k]["basic_contents"]}
            for b in s["basic_contents"]:
                if b["code"] not in existing_bc:
                    merged[k]["basic_contents"].append(b)
            existing_bp = {b["code"] for b in merged[k]["basic_performances"]}
            for b in s["basic_performances"]:
                if b["code"] not in existing_bp:
                    merged[k]["basic_performances"].append(b)

    result = sorted(merged.values(), key=lambda x: (x["grade"], x["code_108"]))
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    bc_total = sum(len(s["basic_contents"]) for s in result)
    bp_total = sum(len(s["basic_performances"]) for s in result)
    by_grade = {}
    for s in result:
        by_grade[s["grade"]] = by_grade.get(s["grade"], 0) + len(s["basic_contents"])
    print(f"Parsed {len(result)} 108-curriculum entries, {bc_total} 基本學習內容 (NC/SC/RC/DC), {bp_total} 基本學習表現.")
    print("基本學習內容 count by grade:", by_grade)
    print("Sample entry:", json.dumps(result[0], ensure_ascii=False, indent=2)[:600])

if __name__ == "__main__":
    main()
