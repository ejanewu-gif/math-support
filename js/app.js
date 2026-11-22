/**
 * 國小數學學習扶助考古題診斷導航平台 — 主互動控制器
 * 三維互鎖導航（進度預警 / 指標題庫 / 歷年題本）＋ 謝老師弱點專題 ＋ 單題深度診斷 ＋ 組卷購物車
 */
(function () {
  const DB = window.MASTER_DB;
  if (!DB) {
    console.error("MASTER_DB 未載入！");
    return;
  }

  const state = {
    view: "exam",            // 'progress' | 'standards' | 'exam' | 'teacher'
    grade: 4,                // 1..6 (預設四年級方便展示)
    publisher: "kanghsuan",  // 'kanghsuan' | 'hanlin' | 'nanyi'
    selectedUnit: "ALL",
    domainFilter: "ALL",     // 'ALL' | '數與量' | '空間與形狀' | '關係' | '資料與不確定性'
    cogFilter: "ALL",        // 'ALL' | '概念理解' | '程序執行' | '解題思考'
    onlyHighRisk: false,
    searchQuery: "",
    teacherDomain: "ALL",
    cartIds: ["115_math_g4_q02", "115_math_g4_q03", "115_math_g4_q06"], // 預設放入 3 題代表題方便老師立即體驗列印
    printMode: "portrait",   // 學扶首選預設：A4 直向滿版 6 題
    printTitle: "國小數學學習扶助・個別化補救練習卷",
    includeAnswerKey: true,
    activeModalQ: null,
  };

  const PUB_LABELS = { kanghsuan: "康軒版", hanlin: "翰林版", nanyi: "南一版" };
  const GRADE_ZH = { 1: "一年級", 2: "二年級", 3: "三年級", 4: "四年級", 5: "五年級", 6: "六年級" };

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function heatClass(rate) {
    if (rate < 0.50) return "heat-red";
    if (rate < 0.70) return "heat-yellow";
    return "heat-green";
  }

  function heatBadge(rate) {
    const pct = Math.round(rate * 100);
    if (rate < 0.50) return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">紅燈高危 ${pct}%</span>`;
    if (rate < 0.70) return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">黃燈警戒 ${pct}%</span>`;
    return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">綠燈穩健 ${pct}%</span>`;
  }

  function getQuestionById(id) {
    return DB.questions.find((q) => q.id === id);
  }

  function isInCart(id) {
    return state.cartIds.includes(id);
  }

  function toggleCart(id) {
    if (isInCart(id)) {
      state.cartIds = state.cartIds.filter((x) => x !== id);
    } else {
      state.cartIds.push(id);
    }
    updateCartBadge();
    renderMain();
    if (state.activeModalQ && state.activeModalQ.id === id) {
      openModal(id);
    }
    if (!document.getElementById("cart-drawer").classList.contains("hidden")) {
      renderCartDrawer();
    }
  }

  function addManyToCart(ids) {
    let added = 0;
    ids.forEach((id) => {
      if (!state.cartIds.includes(id)) {
        state.cartIds.push(id);
        added++;
      }
    });
    updateCartBadge();
    renderMain();
    showToast(added > 0 ? `已將 ${added} 題加入組卷購物車！` : "這些題目皆已在購物車中");
  }

  function showToast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.remove("opacity-0", "translate-y-3", "pointer-events-none");
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => {
      el.classList.add("opacity-0", "translate-y-3", "pointer-events-none");
    }, 2200);
  }

  function updateCartBadge() {
    document.getElementById("cart-count-badge").textContent = state.cartIds.length;
  }

  function getFilteredQuestions(overrideGrade) {
    const g = overrideGrade !== undefined ? overrideGrade : state.grade;
    return DB.questions.filter((q) => {
      if (g !== "ALL" && q.grade !== g) return false;
      if (state.cogFilter !== "ALL" && q.cognitive_level !== state.cogFilter) return false;
      if (state.domainFilter !== "ALL" && q.domain !== state.domainFilter) return false;
      if (state.onlyHighRisk && q.pass_rate >= 0.50) return false;
      if (state.searchQuery.trim()) {
        const kw = state.searchQuery.trim().toLowerCase();
        const hay = `${q.basic_code} ${q.code_108} ${q.basic_text} ${q.concept_tag} ${q.title_preview} ${q.textbook_mapping.kanghsuan} ${q.textbook_mapping.hanlin} ${q.textbook_mapping.nanyi}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }

  function renderQuestionCard(q) {
    const inCart = isInCart(q.id);
    const errObj = DB.error_taxonomy[q.primary_error_code] || {};
    const hasTrap = q.high_risk_traps && q.high_risk_traps.length > 0;
    return `
      <article class="edu-card edu-card-interactive p-4 flex flex-col justify-between gap-3">
        <div>
          <div class="flex items-center justify-between gap-2 mb-2">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="px-2 py-0.5 rounded-md text-xs font-extrabold bg-emerald-900 text-white">${q.year}年 ${q.grade}年級 Q${q.q_num}</span>
              <span class="px-2 py-0.5 rounded-md text-xs font-bold bg-teal-50 text-teal-800 border border-teal-200">${esc(q.basic_code)}</span>
              <span class="px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700">${esc(q.cognitive_level)}</span>
            </div>
            ${heatBadge(q.pass_rate)}
          </div>

          <div class="q-img-frame p-2 mb-2.5 cursor-pointer h-44 bg-white" data-open-modal="${q.id}" title="點擊查看完整診斷與 AI 處方">
            <img src="${window.withCacheBust(q.image)}" alt="${q.id}" loading="lazy" class="max-h-40 w-auto" />
          </div>

          <div class="text-xs text-slate-600 space-y-1">
            <div class="font-semibold text-slate-800 line-clamp-1">${esc(q.basic_text)}</div>
            <div class="flex flex-wrap gap-1.5 pt-0.5">
              <span class="px-2 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200 font-medium">${PUB_LABELS[state.publisher]}：${esc(q.textbook_mapping[state.publisher])}</span>
              ${hasTrap ? `<span class="px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-bold">⚠ 低分組誘答 ${esc(q.primary_error_code)} ${esc(errObj.name || "")}</span>` : ""}
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2 pt-2 border-t border-slate-100">
          <button data-open-modal="${q.id}" class="flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 transition">
            🔍 深度診斷與 AI 處方
          </button>
          <button data-toggle-cart="${q.id}" class="py-2 px-3 rounded-xl text-xs font-bold border transition ${inCart ? "bg-amber-600 text-white border-amber-700 shadow-sm" : "bg-white hover:bg-amber-50 text-amber-800 border-amber-300"}">
            ${inCart ? "✓ 已入卷" : "＋ 加入練習卷"}
          </button>
        </div>
      </article>
    `;
  }

  /* =========================================================
     視角一【進度預警】：年級 ➔ 版本 (康軒/翰林/南一) ➔ 單元 ➔ 先備弱點預警
     ========================================================= */
  function renderProgressView() {
    const qs = getFilteredQuestions(state.grade);
    const unitGroups = {};
    qs.forEach((q) => {
      const uName = q.textbook_mapping[state.publisher];
      if (!unitGroups[uName]) unitGroups[uName] = [];
      unitGroups[uName].push(q);
    });
    const units = Object.keys(unitGroups).sort();
    const displayQs = state.selectedUnit !== "ALL" && unitGroups[state.selectedUnit]
      ? unitGroups[state.selectedUnit]
      : qs;

    return `
      <section class="space-y-5">
        <div class="edu-panel p-5">
          <div class="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div>
              <h2 class="text-lg font-extrabold text-slate-900">📅 視角一【進度預警】教科書單元防雷對照</h2>
              <p class="text-sm text-slate-600 mt-0.5">選擇任教年級與教科書版本，上課前先掌握該單元對應的學習扶助先備弱點與高危考題。</p>
            </div>
            <div class="flex items-center gap-2">
              ${["kanghsuan", "hanlin", "nanyi"].map((pub) => `
                <button data-set-pub="${pub}" class="px-3.5 py-2 rounded-xl text-sm font-bold border transition ${state.publisher === pub ? "bg-emerald-700 text-white border-emerald-800 shadow" : "bg-white text-slate-700 border-slate-300 hover:border-emerald-500"}">
                  ${PUB_LABELS[pub]}
                </button>
              `).join("")}
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <button data-set-unit="ALL" class="text-left p-3.5 rounded-xl border-2 transition ${state.selectedUnit === "ALL" ? "border-emerald-600 bg-emerald-50 shadow-md" : "border-slate-200 bg-white hover:border-emerald-300"}">
              <div class="text-xs font-bold text-emerald-700">${GRADE_ZH[state.grade]}・${PUB_LABELS[state.publisher]}</div>
              <div class="font-extrabold text-slate-900 mt-0.5">全部單元總覽</div>
              <div class="text-xs text-slate-500 mt-1">共 ${qs.length} 題｜紅燈高危 ${qs.filter((x) => x.pass_rate < 0.5).length} 題</div>
            </button>
            ${units.map((u) => {
              const list = unitGroups[u];
              const redCnt = list.filter((x) => x.pass_rate < 0.5).length;
              const active = state.selectedUnit === u;
              return `
                <button data-set-unit="${esc(u)}" class="text-left p-3.5 rounded-xl border-2 transition ${active ? "border-emerald-600 bg-emerald-50 shadow-md" : "border-slate-200 bg-white hover:border-emerald-300"}">
                  <div class="flex items-center justify-between gap-1">
                    <span class="text-xs font-bold text-slate-500">${esc(list[0].domain)}</span>
                    ${redCnt > 0 ? `<span class="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[11px] font-bold">⚠ ${redCnt} 高危</span>` : `<span class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[11px] font-bold">穩健</span>`}
                  </div>
                  <div class="font-extrabold text-slate-900 mt-1 text-sm">${esc(u)}</div>
                  <div class="text-xs text-slate-500 mt-1">收錄 ${list.length} 題・先備碼 ${esc(list[0].basic_code)}</div>
                </button>
              `;
            }).join("")}
          </div>
        </div>

        <div class="flex items-center justify-between">
          <h3 class="text-base font-extrabold text-slate-800">
            ${state.selectedUnit === "ALL" ? `${GRADE_ZH[state.grade]} ${PUB_LABELS[state.publisher]} 全部對應真題` : `單元防雷：${esc(state.selectedUnit)}`}（${displayQs.length} 題）
          </h3>
          <button data-add-list="${displayQs.map((x) => x.id).join(",")}" class="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300">
            ＋ 本區題目全數加入練習卷
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          ${displayQs.map(renderQuestionCard).join("")}
        </div>
      </section>
    `;
  }

  /* =========================================================
     視角二【指標題庫】：官方 108 課綱 ➔ 基本學習內容碼 (NC/SC/RC/DC) ➔ 子技能階梯
     ========================================================= */
  function renderStandardsView() {
    const stds = DB.standards.filter((s) => {
      if (s.grade !== state.grade) return false;
      if (state.domainFilter !== "ALL" && s.domain !== state.domainFilter) return false;
      if (state.searchQuery.trim()) {
        const kw = state.searchQuery.trim().toLowerCase();
        const hay = `${s.code_108} ${s.description_108} ${s.basic_contents.map((b) => b.code + b.text).join(" ")}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });

    const qByBasic = {};
    DB.questions.filter((q) => q.grade === state.grade).forEach((q) => {
      qByBasic[q.basic_code] = qByBasic[q.basic_code] || [];
      qByBasic[q.basic_code].push(q);
    });

    return `
      <section class="space-y-5">
        <div class="edu-panel p-5">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-lg font-extrabold text-slate-900">🎯 視角二【指標題庫】教育部 108 課綱 × 基本學習內容小指標</h2>
              <p class="text-sm text-slate-600 mt-0.5">直接整合自《國小數學基本學習內容.docx》，完整呈現 108 課綱條目 ➔ 基本學習內容碼（NC/SC/RC/DC）➔ 基本學習表現子技能階梯與對應真題。</p>
            </div>
            <div class="flex flex-wrap gap-1.5">
              ${["ALL", "數與量", "空間與形狀", "關係", "資料與不確定性"].map((dom) => `
                <button data-set-domain="${dom}" class="px-3 py-1.5 rounded-xl text-xs font-bold border transition ${state.domainFilter === dom ? "bg-emerald-700 text-white border-emerald-800 shadow" : "bg-white text-slate-700 border-slate-300 hover:border-emerald-500"}">
                  ${dom === "ALL" ? "全部領域" : dom}
                </button>
              `).join("")}
            </div>
          </div>
        </div>

        <div class="space-y-4">
          ${stds.map((s) => {
            const matchedQs = [];
            s.basic_contents.forEach((b) => {
              (qByBasic[b.code] || []).forEach((q) => matchedQs.push(q));
            });
            return `
              <div class="edu-card p-5">
                <div class="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-100">
                  <div>
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="px-2.5 py-0.5 rounded-lg text-xs font-extrabold bg-slate-900 text-white">${esc(s.code_108)}</span>
                      <span class="px-2 py-0.5 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800">${esc(s.domain)}</span>
                      ${s.performance_108 ? `<span class="px-2 py-0.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600">學習表現 ${esc(s.performance_108)}</span>` : ""}
                    </div>
                    <p class="text-sm text-slate-700 mt-2 leading-relaxed">${esc(s.description_108)}</p>
                  </div>
                  <div class="shrink-0">
                    <span class="px-3 py-1 rounded-full text-xs font-extrabold ${matchedQs.length > 0 ? "bg-amber-100 text-amber-900 border border-amber-300" : "bg-slate-100 text-slate-500"}">
                      115年對應真題：${matchedQs.length} 題
                    </span>
                  </div>
                </div>

                <div class="mt-3 space-y-2.5">
                  ${s.basic_contents.map((bc) => {
                    const qsForBc = qByBasic[bc.code] || [];
                    const prefix = bc.code.replace("C-", "CP-");
                    const perfs = s.basic_performances.filter((bp) => bp.code.startsWith(prefix));
                    return `
                      <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                        <div class="flex flex-wrap items-center justify-between gap-2">
                          <div class="flex items-center gap-2">
                            <span class="px-2 py-0.5 rounded-md text-xs font-extrabold bg-teal-700 text-white">${esc(bc.code)}</span>
                            <span class="text-sm font-bold text-slate-900">${esc(bc.text)}</span>
                          </div>
                          ${qsForBc.length > 0 ? `
                            <div class="flex flex-wrap gap-1.5">
                              ${qsForBc.map((q) => `
                                <button data-open-modal="${q.id}" class="px-2.5 py-1 rounded-lg text-xs font-bold border shadow-sm transition hover:scale-105 ${heatClass(q.pass_rate)}">
                                  115年 Q${q.q_num} (${Math.round(q.pass_rate * 100)}%)
                                </button>
                              `).join("")}
                            </div>
                          ` : `<span class="text-xs text-slate-400">（115年本卷未出題）</span>`}
                        </div>
                        ${perfs.length > 0 ? `
                          <ul class="mt-2 pl-4 space-y-1 text-xs text-slate-600 list-disc">
                            ${perfs.map((bp) => `<li><span class="font-mono font-semibold text-teal-800">${esc(bp.code)}</span> ${esc(bp.text)}</li>`).join("")}
                          </ul>
                        ` : ""}
                      </div>
                    `;
                  }).join("")}
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </section>
    `;
  }

  /* =========================================================
     視角三【歷年題本】：25 題全局看板熱圖 + 認知歷程篩選 + 題卡清單
     ========================================================= */
  function renderExamView() {
    const allGradeQs = DB.questions.filter((q) => q.grade === state.grade);
    const filteredQs = getFilteredQuestions(state.grade);
    const redQs = allGradeQs.filter((q) => q.pass_rate < 0.50);
    const yellowQs = allGradeQs.filter((q) => q.pass_rate >= 0.50 && q.pass_rate < 0.70);
    const greenQs = allGradeQs.filter((q) => q.pass_rate >= 0.70);

    return `
      <section class="space-y-5">
        <div class="edu-panel p-5">
          <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 class="text-lg font-extrabold text-slate-900">📊 視角三【歷年題本】115 年 ${GRADE_ZH[state.grade]}數學・25 題全局看板熱圖</h2>
              <p class="text-sm text-slate-600 mt-0.5">
                點擊任一題號方塊立即開啟高解析題卡、誘答陷阱長條圖與接地氣 AI 概念卡通處方。
                <span class="ml-1 text-xs text-slate-500">（註：115年目前為 AI 預估風險分佈，實測數據請見【謝老師弱點專題】）</span>
              </p>
            </div>
            <button data-add-list="${redQs.map((x) => x.id).join(",")}" class="px-3.5 py-2 rounded-xl text-xs font-extrabold bg-rose-600 hover:bg-rose-700 text-white shadow transition">
              🔥 一鍵加入本卷 ${redQs.length} 題紅燈高危題
            </button>
          </div>

          <!-- 25 題熱圖看板 -->
          <div class="grid grid-cols-5 sm:grid-cols-10 md:grid-cols-13 lg:grid-cols-25 gap-2 mb-4" style="grid-template-columns: repeat(auto-fill, minmax(78px, 1fr));">
            ${allGradeQs.map((q) => {
              const inCart = isInCart(q.id);
              return `
                <button data-open-modal="${q.id}" class="${heatClass(q.pass_rate)} rounded-xl p-2 text-center shadow-sm hover:shadow-md hover:-translate-y-0.5 transition relative">
                  ${inCart ? `<span class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-amber-600 text-white text-[10px] font-black flex items-center justify-center shadow">✓</span>` : ""}
                  <div class="text-xs font-black">Q${q.q_num}</div>
                  <div class="text-sm font-extrabold">${Math.round(q.pass_rate * 100)}%</div>
                  <div class="text-[10px] font-semibold opacity-80 truncate">${esc(q.basic_code)}</div>
                </button>
              `;
            }).join("")}
          </div>

          <!-- 圖例與認知歷程篩選 -->
          <div class="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200">
            <div class="flex flex-wrap items-center gap-3 text-xs font-bold">
              <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-rose-500 inline-block"></span>紅燈 &lt;50%（${redQs.length}題）</span>
              <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-amber-400 inline-block"></span>黃燈 50–69%（${yellowQs.length}題）</span>
              <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-emerald-500 inline-block"></span>綠燈 ≥70%（${greenQs.length}題）</span>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-xs font-bold text-slate-500">認知歷程：</span>
              ${["ALL", "概念理解", "程序執行", "解題思考"].map((c) => `
                <button data-set-cog="${c}" class="px-2.5 py-1 rounded-lg text-xs font-bold border transition ${state.cogFilter === c ? "bg-emerald-700 text-white border-emerald-800" : "bg-white text-slate-700 border-slate-300 hover:border-emerald-500"}">
                  ${c === "ALL" ? "全部" : c}
                </button>
              `).join("")}
              <label class="inline-flex items-center gap-1.5 text-xs font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 cursor-pointer">
                <input id="toggle-high-risk" type="checkbox" ${state.onlyHighRisk ? "checked" : ""} class="accent-rose-600" />
                僅看紅燈高危
              </label>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          ${filteredQs.map(renderQuestionCard).join("")}
        </div>
      </section>
    `;
  }

  /* =========================================================
     視角四【謝老師弱點專題】：20 個主題 + 27 份實測四選項分組統計表
     ========================================================= */
  function renderTeacherView() {
    const topics = DB.teacher_topics.filter((t) => {
      if (state.teacherDomain !== "ALL" && t.domain !== state.teacherDomain) return false;
      if (state.searchQuery.trim()) {
        const kw = state.searchQuery.trim().toLowerCase();
        if (!`${t.title} ${t.domain} ${t.highlights.join(" ")}`.toLowerCase().includes(kw)) return false;
      }
      return true;
    });

    return `
      <section class="space-y-5">
        <div class="edu-panel p-5">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-lg font-extrabold text-slate-900">📚 謝老師整理・歷年學扶弱點專題與實測統計</h2>
              <p class="text-sm text-slate-600 mt-0.5">直接萃取自專案雲端《謝老師整理學扶題目》Word 講義，收錄 <strong>${DB.meta.total_real_stat_tables} 份真實全體／高分組／低分組四選項選答率</strong>，非正解選項低分組 ≥15% 自動亮紅燈警示。</p>
            </div>
            <div class="flex flex-wrap gap-1.5">
              ${["ALL", "數概念與計算", "文字題與解題策略", "量與實測", "空間與形狀"].map((d) => `
                <button data-set-tdomain="${d}" class="px-3 py-1.5 rounded-xl text-xs font-bold border transition ${state.teacherDomain === d ? "bg-emerald-700 text-white border-emerald-800 shadow" : "bg-white text-slate-700 border-slate-300 hover:border-emerald-500"}">
                  ${d === "ALL" ? "全部領域" : d}
                </button>
              `).join("")}
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
          ${topics.map((t) => `
            <article class="edu-card p-5 flex flex-col justify-between gap-3">
              <div>
                <div class="flex items-center justify-between gap-2 mb-2">
                  <div class="flex items-center gap-2">
                    <span class="px-2.5 py-0.5 rounded-lg text-xs font-extrabold bg-emerald-800 text-white">${esc(t.domain)}</span>
                    <span class="text-xs font-bold text-slate-500">適用：${t.grades.map((g) => g + "年級").join("、")}</span>
                  </div>
                  <span class="px-2.5 py-0.5 rounded-full text-xs font-bold ${t.stat_table_count > 0 ? "bg-rose-100 text-rose-800 border border-rose-200" : "bg-slate-100 text-slate-600"}">
                    ${t.stat_table_count > 0 ? `實測統計表 ${t.stat_table_count} 份` : `圖示講義 ${t.image_count} 圖`}
                  </span>
                </div>
                <h3 class="text-base font-extrabold text-slate-900 mb-2">${esc(t.title)}</h3>

                ${t.highlights.length > 0 ? `
                  <div class="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs text-slate-700 space-y-1 mb-3">
                    ${t.highlights.slice(0, 3).map((h) => `<div class="line-clamp-2">• ${esc(h)}</div>`).join("")}
                  </div>
                ` : ""}

                ${t.stat_tables.length > 0 ? t.stat_tables.slice(0, 2).map((st, idx) => `
                  <div class="rounded-xl border border-slate-200 p-3 bg-white mb-2.5 shadow-sm">
                    <div class="flex items-center justify-between text-xs font-bold mb-2">
                      <span class="text-slate-800">實測題 #${idx + 1}（正解選項 (${st.correct_opt})｜全體通過率 ${Math.round(st.pass_rate * 100)}%）</span>
                      ${st.high_risk_traps.length > 0 ? `<span class="text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">🚨 高危誘答選項：(${st.high_risk_traps.join("), (")})</span>` : ""}
                    </div>
                    <div class="space-y-1.5">
                      ${st.options.map((op) => `
                        <div class="grid grid-cols-12 items-center gap-2 text-[11px]">
                          <div class="col-span-2 font-extrabold ${op.is_correct ? "text-emerald-700" : op.high_risk_trap ? "text-rose-700" : "text-slate-600"}">
                            (${op.opt})${op.is_correct ? " ★" : op.high_risk_trap ? " ⚠" : ""}
                          </div>
                          <div class="col-span-10 space-y-0.5">
                            <div class="flex items-center gap-1.5">
                              <span class="w-8 text-slate-400">全體</span>
                              <div class="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden"><div class="${op.is_correct ? "bg-emerald-500" : "bg-slate-400"} h-full" style="width:${Math.round(op.all * 100)}%"></div></div>
                              <span class="w-8 text-right font-semibold">${Math.round(op.all * 100)}%</span>
                            </div>
                            <div class="flex items-center gap-1.5">
                              <span class="w-8 text-rose-500 font-bold">低分</span>
                              <div class="flex-1 bg-rose-50 h-2 rounded-full overflow-hidden"><div class="${op.high_risk_trap ? "bg-rose-500" : op.is_correct ? "bg-emerald-400" : "bg-slate-300"} h-full" style="width:${Math.round(op.low * 100)}%"></div></div>
                              <span class="w-8 text-right font-bold ${op.high_risk_trap ? "text-rose-700" : "text-slate-600"}">${Math.round(op.low * 100)}%</span>
                            </div>
                          </div>
                        </div>
                      `).join("")}
                    </div>
                  </div>
                `).join("") : ""}
              </div>
            </article>
          `).join("")}
        </div>
      </section>
    `;
  }

  /* =========================================================
     單題深度診斷 Modal
     ========================================================= */
  function openModal(id) {
    const q = getQuestionById(id);
    if (!q) return;
    state.activeModalQ = q;
    const modal = document.getElementById("diagnostic-modal");
    const body = document.getElementById("modal-body");
    const inCart = isInCart(q.id);
    const errObj = DB.error_taxonomy[q.primary_error_code] || {};

    body.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
        <div>
          <div class="flex items-center gap-2 flex-wrap">
            <span class="px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-900 text-white">${q.year}年 ${GRADE_ZH[q.grade]}數學 第${q.q_num}題</span>
            <span class="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-teal-100 text-teal-900">${esc(q.basic_code)}</span>
            <span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700">108課綱 ${esc(q.code_108)}</span>
            <span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-800">${esc(q.cognitive_level)}</span>
            ${heatBadge(q.pass_rate)}
          </div>
          <h3 class="text-base font-extrabold text-slate-900 mt-2">${esc(q.basic_text)}</h3>
        </div>
        <div class="flex items-center gap-2">
          <button id="modal-print-script" class="px-3 py-2 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200">
            🎭 列印概念卡通教學單
          </button>
          <button id="modal-toggle-cart" class="px-3.5 py-2 rounded-xl text-xs font-bold border transition ${inCart ? "bg-amber-600 text-white border-amber-700" : "bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300"}">
            ${inCart ? "✓ 已加入練習卷" : "＋ 加入練習卷"}
          </button>
          <button id="modal-close-btn" class="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">✕</button>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 mt-5">
        <!-- 左欄：高解析題卡 + 教科書對照 + 縱向鏈結 -->
        <div class="lg:col-span-6 space-y-4">
          <div class="q-img-frame p-4 bg-white shadow-inner">
            <img src="${window.withCacheBust(q.image)}" alt="${q.id}" class="max-h-72 w-auto" />
          </div>

          <div class="edu-card p-4">
            <div class="text-xs font-extrabold text-slate-500 mb-2">📚 三大版本教科書進度對照</div>
            <div class="grid grid-cols-3 gap-2 text-xs">
              <div class="p-2 rounded-lg bg-sky-50 border border-sky-200"><div class="font-bold text-sky-900">康軒版</div><div class="text-slate-700 mt-0.5">${esc(q.textbook_mapping.kanghsuan)}</div></div>
              <div class="p-2 rounded-lg bg-emerald-50 border border-emerald-200"><div class="font-bold text-emerald-900">翰林版</div><div class="text-slate-700 mt-0.5">${esc(q.textbook_mapping.hanlin)}</div></div>
              <div class="p-2 rounded-lg bg-amber-50 border border-amber-200"><div class="font-bold text-amber-900">南一版</div><div class="text-slate-700 mt-0.5">${esc(q.textbook_mapping.nanyi)}</div></div>
            </div>
          </div>

          <div class="edu-card p-4">
            <div class="text-xs font-extrabold text-slate-500 mb-2.5">🔗 108 課綱教材地位縱向鏈結（先備 ➔ 核心 ➔ 延伸）</div>
            <div class="space-y-2 text-xs">
              <div class="chain-box chain-pre"><span class="font-extrabold text-sky-800">⬆ 先備知識：</span>${esc(q.vertical_chain.prerequisite)}</div>
              <div class="chain-box chain-core"><span class="font-extrabold text-emerald-800">🎯 本題核心：</span>${esc(q.vertical_chain.core)}</div>
              <div class="chain-box chain-ext"><span class="font-extrabold text-purple-800">⬇ 延伸知識：</span>${esc(q.vertical_chain.extension)}</div>
            </div>
            ${q.sub_performances && q.sub_performances.length > 0 ? `
              <div class="mt-3 pt-2.5 border-t border-slate-100">
                <div class="text-[11px] font-bold text-slate-500 mb-1">子技能階梯（官方基本學習表現）：</div>
                <ul class="text-xs text-slate-700 space-y-1 list-disc pl-4">
                  ${q.sub_performances.map((sp) => `<li><span class="font-mono font-bold text-teal-700">${esc(sp.code)}</span> ${esc(sp.text)}</li>`).join("")}
                </ul>
              </div>
            ` : ""}
          </div>
        </div>

        <!-- 右欄：四選項高頻誘答陷阱 + 接地氣概念卡通 AI 處方 -->
        <div class="lg:col-span-6 space-y-4">
          <div class="edu-card p-4">
            <div class="flex items-center justify-between gap-2 mb-3">
              <div>
                <div class="text-sm font-extrabold text-slate-900">🎯 四選項高頻誘答陷阱與錯誤類型碼</div>
                <div class="text-[11px] text-slate-500">非正解選項若低分組 ≥ 15% 自動亮紅燈警示｜參考正解：(${q.answer})${q.answer_verified ? "（已核對）" : "（初判）"}</div>
              </div>
              <span class="px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-xs font-extrabold">${esc(q.primary_error_code)} ${esc(errObj.name || "")}</span>
            </div>
            <div class="space-y-3">
              ${q.options.map((op) => `
                <div class="p-2.5 rounded-xl border ${op.is_correct ? "bg-emerald-50/70 border-emerald-300" : op.high_risk_trap ? "bg-rose-50/70 border-rose-300" : "bg-slate-50 border-slate-200"}">
                  <div class="flex items-center justify-between text-xs font-bold mb-1.5">
                    <span class="${op.is_correct ? "text-emerald-900" : op.high_risk_trap ? "text-rose-800" : "text-slate-700"}">
                      選項 (${op.opt}) ${op.is_correct ? "★ 正解" : op.high_risk_trap ? `🚨 高危誘答陷阱（${esc(op.error_code)}）` : ""}
                    </span>
                    <span class="text-[11px] font-semibold text-slate-600">全體 ${Math.round(op.all * 100)}%｜高分 ${Math.round(op.high * 100)}%｜低分 ${Math.round(op.low * 100)}%</span>
                  </div>
                  <div class="grid grid-cols-3 gap-1.5 text-[10px] mb-1">
                    <div class="bg-white rounded p-1 border border-slate-200">全體 <div class="h-1.5 bg-slate-100 rounded mt-0.5"><div class="${op.is_correct ? "bg-emerald-500" : "bg-slate-500"} h-full rounded" style="width:${Math.round(op.all * 100)}%"></div></div></div>
                    <div class="bg-white rounded p-1 border border-slate-200">高分組 <div class="h-1.5 bg-sky-100 rounded mt-0.5"><div class="bg-sky-500 h-full rounded" style="width:${Math.round(op.high * 100)}%"></div></div></div>
                    <div class="bg-white rounded p-1 border border-slate-200">低分組 <div class="h-1.5 bg-rose-100 rounded mt-0.5"><div class="${op.high_risk_trap ? "bg-rose-600" : "bg-amber-400"} h-full rounded" style="width:${Math.round(op.low * 100)}%"></div></div></div>
                  </div>
                  ${!op.is_correct ? `<div class="text-[11px] text-slate-600">盲點分析：${esc(op.trap_note)}</div>` : ""}
                </div>
              `).join("")}
            </div>
          </div>

          <div class="edu-card p-4">
            <div class="text-sm font-extrabold text-emerald-900 mb-2">💬 接地氣・說人話 AI 備課處方（概念卡通劇本）</div>
            <div class="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 leading-relaxed mb-3">
              <span class="font-extrabold">💡 生活譬喻：</span>${esc(q.ai_prescription.life_metaphor)}
            </div>
            <div class="space-y-2 mb-3">
              ${q.ai_prescription.cartoon_script.map((s, i) => `
                <div class="${i === 0 ? "bubble-myth" : i === 1 ? "bubble-break" : "bubble-wrap"} p-2.5 text-xs">
                  <div class="font-extrabold text-slate-800 mb-0.5">${esc(s.role)}</div>
                  <div class="text-slate-700 leading-relaxed">「${esc(s.line)}」</div>
                </div>
              `).join("")}
            </div>
            <div class="bg-slate-50 rounded-xl p-3 border border-slate-200">
              <div class="text-xs font-extrabold text-slate-800 mb-1">🪜 課堂補救三步驟鷹架</div>
              <ol class="text-xs text-slate-700 list-decimal pl-4 space-y-1">
                ${q.ai_prescription.remedial_steps.map((st) => `<li>${esc(st)}</li>`).join("")}
              </ol>
            </div>
          </div>
        </div>
      </div>
    `;

    modal.classList.remove("hidden");
    document.getElementById("modal-close-btn").onclick = closeModal;
    document.getElementById("modal-toggle-cart").onclick = () => toggleCart(q.id);
    document.getElementById("modal-print-script").onclick = () => window.printCartoonScript(q);
  }

  function closeModal() {
    document.getElementById("diagnostic-modal").classList.add("hidden");
    state.activeModalQ = null;
  }

  /* =========================================================
     組卷購物車與列印設定抽屜
     ========================================================= */
  function renderCartDrawer() {
    const listEl = document.getElementById("cart-items-list");
    const qs = state.cartIds.map(getQuestionById).filter(Boolean);
    document.getElementById("cart-drawer-count").textContent = qs.length;

    const perPage = state.printMode === "landscape" ? 4 : 6;
    const pages = Math.max(1, Math.ceil(qs.length / perPage));
    document.getElementById("cart-page-estimate").textContent =
      qs.length === 0 ? "尚未選題" : `預計列印 ${pages} 頁練習卷（每頁 ${perPage} 題）${state.includeAnswerKey ? " ＋ 1 頁教師解答" : ""}`;

    if (qs.length === 0) {
      listEl.innerHTML = `<div class="text-center py-10 text-sm text-slate-400">購物車目前是空的，請從左側題庫點擊「＋ 加入練習卷」。</div>`;
      return;
    }

    listEl.innerHTML = qs.map((q, idx) => `
      <div class="p-3 rounded-xl border border-slate-200 bg-white shadow-sm flex items-center justify-between gap-2">
        <div class="min-w-0">
          <div class="text-xs font-extrabold text-slate-900">第 ${idx + 1} 題｜${q.year}年 ${q.grade}年級 Q${q.q_num}</div>
          <div class="text-[11px] text-slate-500 truncate">${esc(q.basic_code)}・${esc(q.concept_tag)}</div>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <button data-cart-move="${idx}:-1" class="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold" title="上移">↑</button>
          <button data-cart-move="${idx}:1" class="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold" title="下移">↓</button>
          <button data-toggle-cart="${q.id}" class="w-7 h-7 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold" title="移除">✕</button>
        </div>
      </div>
    `).join("");
  }

  function renderMain() {
    // Update nav tab styles
    document.querySelectorAll("[data-nav-view]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.navView === state.view);
    });
    // Update grade pills
    document.querySelectorAll("[data-set-grade]").forEach((btn) => {
      const active = Number(btn.dataset.setGrade) === state.grade;
      btn.className = active
        ? "px-3.5 py-1.5 rounded-xl text-sm font-extrabold bg-emerald-700 text-white shadow border border-emerald-800 transition"
        : "px-3.5 py-1.5 rounded-xl text-sm font-bold bg-white text-slate-700 border border-slate-300 hover:border-emerald-500 transition";
    });

    const container = document.getElementById("main-content");
    if (state.view === "progress") container.innerHTML = renderProgressView();
    else if (state.view === "standards") container.innerHTML = renderStandardsView();
    else if (state.view === "teacher") container.innerHTML = renderTeacherView();
    else container.innerHTML = renderExamView();
  }

  function bindGlobalEvents() {
    document.addEventListener("click", (e) => {
      const navBtn = e.target.closest("[data-nav-view]");
      if (navBtn) {
        state.view = navBtn.dataset.navView;
        renderMain();
        return;
      }
      const gradeBtn = e.target.closest("[data-set-grade]");
      if (gradeBtn) {
        state.grade = Number(gradeBtn.dataset.setGrade);
        state.selectedUnit = "ALL";
        renderMain();
        return;
      }
      const pubBtn = e.target.closest("[data-set-pub]");
      if (pubBtn) {
        state.publisher = pubBtn.dataset.setPub;
        state.selectedUnit = "ALL";
        renderMain();
        return;
      }
      const unitBtn = e.target.closest("[data-set-unit]");
      if (unitBtn) {
        state.selectedUnit = unitBtn.dataset.setUnit;
        renderMain();
        return;
      }
      const domBtn = e.target.closest("[data-set-domain]");
      if (domBtn) {
        state.domainFilter = domBtn.dataset.setDomain;
        renderMain();
        return;
      }
      const tdomBtn = e.target.closest("[data-set-tdomain]");
      if (tdomBtn) {
        state.teacherDomain = tdomBtn.dataset.setTdomain;
        renderMain();
        return;
      }
      const cogBtn = e.target.closest("[data-set-cog]");
      if (cogBtn) {
        state.cogFilter = cogBtn.dataset.setCog;
        renderMain();
        return;
      }
      const openBtn = e.target.closest("[data-open-modal]");
      if (openBtn) {
        openModal(openBtn.dataset.openModal);
        return;
      }
      const cartBtn = e.target.closest("[data-toggle-cart]");
      if (cartBtn) {
        toggleCart(cartBtn.dataset.toggleCart);
        return;
      }
      const addListBtn = e.target.closest("[data-add-list]");
      if (addListBtn) {
        const ids = addListBtn.dataset.addList.split(",").filter(Boolean);
        addManyToCart(ids);
        return;
      }
      const moveBtn = e.target.closest("[data-cart-move]");
      if (moveBtn) {
        const [idxStr, dirStr] = moveBtn.dataset.cartMove.split(":");
        const idx = Number(idxStr), dir = Number(dirStr);
        const target = idx + dir;
        if (target >= 0 && target < state.cartIds.length) {
          const tmp = state.cartIds[idx];
          state.cartIds[idx] = state.cartIds[target];
          state.cartIds[target] = tmp;
          renderCartDrawer();
        }
        return;
      }
    });

    document.addEventListener("change", (e) => {
      if (e.target.id === "toggle-high-risk") {
        state.onlyHighRisk = e.target.checked;
        renderMain();
      }
      if (e.target.name === "print-mode") {
        state.printMode = e.target.value;
        renderCartDrawer();
      }
      if (e.target.id === "print-include-ans") {
        state.includeAnswerKey = e.target.checked;
        renderCartDrawer();
      }
    });

    document.getElementById("global-search").addEventListener("input", (e) => {
      state.searchQuery = e.target.value;
      renderMain();
    });

    document.getElementById("open-cart-btn").addEventListener("click", () => {
      document.getElementById("cart-drawer").classList.remove("hidden");
      renderCartDrawer();
    });
    document.getElementById("close-cart-btn").addEventListener("click", () => {
      document.getElementById("cart-drawer").classList.add("hidden");
    });
    document.getElementById("clear-cart-btn").addEventListener("click", () => {
      state.cartIds = [];
      updateCartBadge();
      renderCartDrawer();
      renderMain();
    });
    document.getElementById("trigger-print-btn").addEventListener("click", () => {
      const titleInput = document.getElementById("print-title-input").value.trim();
      const qs = state.cartIds.map(getQuestionById).filter(Boolean);
      window.printWorksheet(qs, {
        mode: state.printMode,
        title: titleInput || state.printTitle,
        includeAnswerKey: state.includeAnswerKey,
      });
    });

    // Backdrop click closes modal
    document.getElementById("diagnostic-modal").addEventListener("click", (e) => {
      if (e.target.id === "diagnostic-modal") closeModal();
    });
  }

  // Init
  updateCartBadge();
  bindGlobalEvents();
  renderMain();
})();
