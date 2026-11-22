/**
 * 物理毫米 97% 滿版真題練習卷列印引擎
 * 雙層 @page 動態注入 + 快取穿透 withCacheBust()
 */
(function () {
  const CACHE_VER = (window.MASTER_DB && window.MASTER_DB.meta && window.MASTER_DB.meta.img_cache_version) || "20261120v2";

  window.withCacheBust = function (imgPath) {
    if (!imgPath) return "";
    const sep = imgPath.includes("?") ? "&" : "?";
    return `${imgPath}${sep}v=${CACHE_VER}`;
  };

  /**
   * 雙層 @page 動態注入：徹底解決 Chromium 橫向列印鎖死與下半頁空白問題
   */
  function injectDynamicPageRule(orientation) {
    let styleEl = document.getElementById("dynamic-page-rule");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "dynamic-page-rule";
      document.head.appendChild(styleEl);
    }
    const sizeRule = orientation === "landscape" ? "A4 landscape" : "A4 portrait";
    const marginRule = orientation === "script" ? "10mm" : "4mm";
    styleEl.textContent = `
      @media print {
        @page {
          size: ${sizeRule};
          margin: ${marginRule};
        }
      }
    `;
    document.body.classList.remove("print-mode-portrait", "print-mode-landscape", "print-mode-script");
    if (orientation === "landscape") {
      document.body.classList.add("print-mode-landscape");
    } else if (orientation === "script") {
      document.body.classList.add("print-mode-script");
    } else {
      document.body.classList.add("print-mode-portrait");
    }
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * 產生並觸發真題練習卷列印
   * @param {Array} questions - 題目物件陣列
   * @param {Object} opts - { mode: 'portrait'|'landscape', title, includeAnswerKey }
   */
  window.printWorksheet = function (questions, opts = {}) {
    if (!questions || questions.length === 0) {
      alert("請先從題庫加入至少 1 題到組卷購物車，再進行列印！");
      return;
    }

    const mode = opts.mode === "landscape" ? "landscape" : "portrait";
    const perPage = mode === "landscape" ? 4 : 6;
    const title = opts.title || "國小數學學習扶助・個別化補救練習卷";
    const includeAnswerKey = opts.includeAnswerKey !== false;

    injectDynamicPageRule(mode);

    const root = document.getElementById("print-root");
    const totalPages = Math.ceil(questions.length / perPage);
    let html = "";

    for (let p = 0; p < totalPages; p++) {
      const slice = questions.slice(p * perPage, (p + 1) * perPage);
      html += `
        <section class="print-sheet">
          <div class="sheet-header">
            <div class="sheet-title">${escapeHtml(title)}</div>
            <div class="sheet-meta">
              <span>班級：________</span>
              <span>座號：____</span>
              <span>姓名：____________</span>
              <span>日期：____/____</span>
              <span>第 ${p + 1}/${totalPages} 頁</span>
            </div>
          </div>
          <div class="sheet-grid">
            ${slice.map((q, idx) => {
              const seq = p * perPage + idx + 1;
              return `
                <div class="sheet-q-card">
                  <div class="sheet-q-bar">
                    <span>第 ${seq} 題（${q.year}年 ${q.grade}年級 第${q.q_num}題）</span>
                    <span class="sheet-q-tag">${escapeHtml(q.basic_code)}｜${escapeHtml(q.concept_tag)}</span>
                  </div>
                  <div class="sheet-q-img-wrap">
                    <img src="${window.withCacheBust(q.image)}" alt="第${seq}題" />
                  </div>
                  <div class="sheet-work-box">
                    <span class="sheet-work-label">算式與思考區（一步一腳印列式）：</span>
                    <span class="sheet-ans-box">答：(　　)</span>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
          <div class="sheet-footer">
            學習扶助素養診斷導航平台｜${mode === "portrait" ? "A4直向6題滿版省紙模式 (97%覆蓋)" : "A4橫向4題大字考卷模式"}
          </div>
        </section>
      `;
    }

    if (includeAnswerKey) {
      html += `
        <section class="print-sheet" style="height:auto; padding: 6mm 4mm;">
          <div class="sheet-header">
            <div class="sheet-title">${escapeHtml(title)} — 教師診斷解答與補救速查頁</div>
            <div class="sheet-meta"><span>共 ${questions.length} 題</span></div>
          </div>
          <table style="width:100%; border-collapse:collapse; font-size:8.5pt; margin-top:2mm;">
            <thead>
              <tr style="background:#f1f5f9;">
                <th style="border:0.7pt solid #64748b; padding:1.5mm;">卷次</th>
                <th style="border:0.7pt solid #64748b; padding:1.5mm;">原題來源</th>
                <th style="border:0.7pt solid #64748b; padding:1.5mm;">參考答案</th>
                <th style="border:0.7pt solid #64748b; padding:1.5mm;">基本學習內容碼</th>
                <th style="border:0.7pt solid #64748b; padding:1.5mm;">主要錯誤碼</th>
                <th style="border:0.7pt solid #64748b; padding:1.5mm; text-align:left;">補救教學關鍵提示</th>
              </tr>
            </thead>
            <tbody>
              ${questions.map((q, idx) => {
                const errObj = window.MASTER_DB.error_taxonomy[q.primary_error_code] || {};
                return `
                  <tr>
                    <td style="border:0.6pt solid #94a3b8; padding:1.3mm; text-align:center; font-weight:700;">${idx + 1}</td>
                    <td style="border:0.6pt solid #94a3b8; padding:1.3mm; text-align:center;">${q.year}年 ${q.grade}年級 Q${q.q_num}</td>
                    <td style="border:0.6pt solid #94a3b8; padding:1.3mm; text-align:center; font-weight:700;">(${q.answer})${q.answer_verified ? "" : "*"}</td>
                    <td style="border:0.6pt solid #94a3b8; padding:1.3mm; text-align:center;">${escapeHtml(q.basic_code)}</td>
                    <td style="border:0.6pt solid #94a3b8; padding:1.3mm; text-align:center;">${escapeHtml(q.primary_error_code)} ${escapeHtml(errObj.name || "")}</td>
                    <td style="border:0.6pt solid #94a3b8; padding:1.3mm;">${escapeHtml(q.ai_prescription.remedial_steps[0] || "")}</td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
          <div style="font-size:7.5pt; color:#64748b; margin-top:2mm;">* 註：115 年官方試卷未附答案卷，標註 * 者為系統初判參考答案，課堂使用前建議教師快速核對。</div>
        </section>
      `;
    }

    root.innerHTML = html;

    // 等待所有題卡圖片載入完成再觸發列印，避免出現空白格
    const imgs = Array.from(root.querySelectorAll("img"));
    Promise.all(imgs.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((res) => { img.onload = res; img.onerror = res; });
    })).then(() => {
      setTimeout(() => window.print(), 120);
    });
  };

  /**
   * 單題「概念卡通 AI 備課處方單」列印（可直接發給學生分角色照著唸）
   */
  window.printCartoonScript = function (q) {
    if (!q) return;
    injectDynamicPageRule("script");
    const root = document.getElementById("print-root");
    const errObj = window.MASTER_DB.error_taxonomy[q.primary_error_code] || {};
    root.innerHTML = `
      <section class="print-sheet" style="padding:4mm;">
        <div class="sheet-header">
          <div class="sheet-title">概念卡通診斷對話單｜${q.year}年 ${q.grade}年級數學 第${q.q_num}題</div>
          <div class="sheet-meta"><span>指標：${escapeHtml(q.basic_code)}（${escapeHtml(q.code_108)}）</span></div>
        </div>
        <div style="border:1pt solid #94a3b8; border-radius:2mm; padding:3mm; margin:3mm 0; text-align:center;">
          <img src="${window.withCacheBust(q.image)}" style="max-width:100%; max-height:62mm; object-fit:contain;" />
        </div>
        <div style="background:#fef3c7; border:1pt solid #f59e0b; border-radius:2mm; padding:3mm; margin-bottom:3mm;">
          <div style="font-weight:800; font-size:10pt; margin-bottom:1mm;">💡 接地氣生活譬喻</div>
          <div style="font-size:9.5pt; line-height:1.5;">${escapeHtml(q.ai_prescription.life_metaphor)}</div>
        </div>
        <div style="border:1pt solid #0f6b54; border-radius:2mm; padding:3mm; margin-bottom:3mm;">
          <div style="font-weight:800; font-size:10pt; color:#0f6b54; margin-bottom:2mm;">🎭 三生爭辯概念卡通劇本（可直接請三位同學分角色朗讀！）</div>
          ${q.ai_prescription.cartoon_script.map((s) => `
            <div style="margin-bottom:2mm; padding:2mm; border-left:3pt solid #0f6b54; background:#f8fafc;">
              <div style="font-weight:700; font-size:9pt;">${escapeHtml(s.role)}</div>
              <div style="font-size:9.5pt; line-height:1.5;">「${escapeHtml(s.line)}」</div>
            </div>
          `).join("")}
        </div>
        <div style="border:1pt solid #cbd5e1; border-radius:2mm; padding:3mm;">
          <div style="font-weight:800; font-size:9.5pt; margin-bottom:1.5mm;">🪜 補救教學三步驟鷹架（防範 ${escapeHtml(q.primary_error_code)} ${escapeHtml(errObj.name || "")}）</div>
          <ol style="margin:0; padding-left:5mm; font-size:9pt; line-height:1.6;">
            ${q.ai_prescription.remedial_steps.map((st) => `<li>${escapeHtml(st)}</li>`).join("")}
          </ol>
        </div>
      </section>
    `;
    const img = root.querySelector("img");
    const go = () => setTimeout(() => window.print(), 120);
    if (!img || img.complete) go();
    else { img.onload = go; img.onerror = go; }
  };
})();
