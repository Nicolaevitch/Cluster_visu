// ─── helpers ──────────────────────────────────────────────────────────────────

function htmlEscape(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getToken() {
  return localStorage.getItem("token") || "";
}

function getUserEmail() {
  return localStorage.getItem("user_email") || "";
}

async function apiPost(path, bodyObj) {
  const r = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: JSON.stringify(bodyObj),
  });

  if (r.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user_email");
    localStorage.removeItem("visitor_mode");
    window.location.hash = "#/login";
    throw new Error("Session expirée, veuillez vous reconnecter.");
  }

  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}

async function apiGet(path) {
  const r = await fetch(path, {
    headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
  });

  if (r.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user_email");
    localStorage.removeItem("visitor_mode");
    window.location.hash = "#/login";
    throw new Error("Session expirée, veuillez vous reconnecter.");
  }

  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}

let _uidCounter = 0;

function uid() {
  return `u${++_uidCounter}`;
}

// ─── pill de statut ───────────────────────────────────────────────────────────

const STATUS_COLORS = {
  OUI: { bg: "#EAF3DE", color: "#27500A" },
  NON: { bg: "#FCEBEB", color: "#791F1F" },
  DOUTEUX: { bg: "#FAEEDA", color: "#633806" },
  DISCARDED: { bg: "#E8E8E8", color: "#444" },
  UNREVIEWED: { bg: "#E8E8E8", color: "#444" },
};

function statusPill(status) {
  const s = (status || "UNREVIEWED").toUpperCase();
  const c = STATUS_COLORS[s] || STATUS_COLORS.UNREVIEWED;

  return `
    <span style="display:inline-block; background:${c.bg}; color:${c.color}; font-size:11px; font-weight:600; padding:3px 10px; border-radius:999px; letter-spacing:0.04em;">
      ${htmlEscape(s)}
    </span>
  `;
}

// ─── égalisation des hauteurs ─────────────────────────────────────────────────

function equalizePassageZones() {
  const cardIds = [...new Set(
    Array.from(document.querySelectorAll("[data-card]"))
      .map(el => el.getAttribute("data-card"))
  )];

  for (const cardId of cardIds) {
    for (const zone of ["before", "content", "after"]) {
      const els = document.querySelectorAll(
        `[data-zone="${zone}"][data-card="${cardId}"]`
      );
      if (els.length < 2) continue;

      els.forEach(el => {
        el.style.height = "";
        el.style.flexShrink = "";
      });

      const maxH = Math.max(...Array.from(els).map(el => el.scrollHeight));

      els.forEach(el => {
        el.style.height = `${maxH}px`;
        el.style.flexShrink = "0";
        el.style.overflowY = "auto";
      });
    }
  }
}

// ─── diff highlight ───────────────────────────────────────────────────────────

function highlightDiff(text, otherText, type) {
  if (!text) return "";

  if (!otherText || typeof diff_match_patch === "undefined") {
    return `<span style="font-weight:600;">${htmlEscape(text)}</span>`;
  }

  try {
    const dmp = new diff_match_patch();
    const diffs = dmp.diff_main(text, otherText);
    dmp.diff_cleanupSemantic(diffs);

    const color = type === "source" ? "#1a56db" : "#057a55";
    let html = "";

    for (const [op, fragment] of diffs) {
      const escaped = htmlEscape(fragment);
      if (op === 0) {
        html += `<span style="font-weight:600;">${escaped}</span>`;
      } else if (op === -1) {
        html += `<span style="font-weight:600; color:${color};">${escaped}</span>`;
      }
    }

    return html;
  } catch (e) {
    console.error("highlightDiff error:", e);
    return `<span style="font-weight:600;">${htmlEscape(text)}</span>`;
  }
}

// ─── bloc passage ─────────────────────────────────────────────────────────────

function renderPassageBlock(label, accentBg, accentColor, accentBorder, passage, cardId, otherContent = "") {
  const content = (passage.content || "")
    .split("\n")
    .map(line => line.trimStart())
    .join("\n")
    .trim();
  const before = (passage.context_before || "").trim();
  const after = (passage.context_after || "").trim();

  return `
    <div style="display:flex; flex-direction:column; border:1.5px solid ${accentBorder}; border-radius:8px; overflow:hidden; min-width:0; background:#ffffff;">

      <div style="background:${accentBg}; color:${accentColor}; font-size:13px; font-weight:700; padding:8px 14px; letter-spacing:0.01em; flex-shrink:0; text-align:left;">
        ${htmlEscape(label)}
        <span style="font-weight:400; font-size:11px; opacity:0.65; margin-left:10px;">
          passage_id ${htmlEscape(passage.passage_id ?? "—")}
        </span>
      </div>

      <div data-zone="before" data-card="${cardId}" style="
        padding: 10px 14px;
        background: #ffffff;
        border-bottom: 1px solid #e8e8e8;
        flex-shrink: 0;
        text-align: left;
      ">
        ${before
          ? `<div style="font-size:13px; color:#1a1a1a; line-height:1.6; font-family:monospace; white-space:pre-wrap; text-align:left;">${htmlEscape(before)}</div>`
          : `<span style="font-size:11px; color:#bbb; font-style:italic;">— pas de contexte avant —</span>`
        }
      </div>

      <div data-zone="content" data-card="${cardId}" style="
        padding: 12px 14px;
        border-bottom: 1px solid #e8e8e8;
        background: #ffffff;
        flex-shrink: 0;
        text-align: left;
      ">
        <div style="border-left: 4px solid ${accentBorder}; padding: 6px 12px; background:#f9f9f9; display:block; width:100%; box-sizing:border-box;">
          ${content
            ? `<pre style="margin:0; font-size:14px; color:#1a1a1a; white-space:pre-wrap; font-family:monospace; line-height:1.65; text-align:left;">${highlightDiff(content, otherContent, label.toLowerCase())}</pre>`
            : `<span style="font-size:12px; color:#aaa; font-style:italic;">— passage vide —</span>`
          }
        </div>
      </div>

      <div data-zone="after" data-card="${cardId}" style="
        padding: 10px 14px;
        background: #ffffff;
        flex: 1;
        text-align: left;
      ">
        ${after
          ? `<div style="font-size:13px; color:#1a1a1a; line-height:1.6; font-family:monospace; white-space:pre-wrap; text-align:left;">${htmlEscape(after)}</div>`
          : `<span style="font-size:11px; color:#bbb; font-style:italic;">— pas de contexte après —</span>`
        }
      </div>

    </div>
  `;
}

// ─── historique des annotations ───────────────────────────────────────────────

function renderAnnotHistory(items) {
  if (!items || items.length === 0) {
    return `<p style="font-size:12px; color:#888; margin:6px 0 0;">Aucune annotation enregistrée.</p>`;
  }

  return `
    <table style="width:100%; border-collapse:collapse; font-size:12px; margin-top:6px;">
      <thead>
        <tr style="border-bottom:1px solid #e0e0e0;">
          <th style="text-align:left; padding:4px 8px; color:#888; font-weight:500;">Utilisateur</th>
          <th style="text-align:left; padding:4px 8px; color:#888; font-weight:500;">Statut</th>
          <th style="text-align:left; padding:4px 8px; color:#888; font-weight:500;">Commentaire</th>
          <th style="text-align:left; padding:4px 8px; color:#888; font-weight:500;">Date</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (a) => `
          <tr style="border-bottom:1px solid #f0f0f0;">
            <td style="padding:5px 8px;">${htmlEscape(a.email ?? "")}</td>
            <td style="padding:5px 8px;">${statusPill(a.status)}</td>
            <td style="padding:5px 8px; color:#666;">${htmlEscape(a.comment ?? "")}</td>
            <td style="padding:5px 8px; color:#999; white-space:nowrap;">${htmlEscape(a.created_at ?? "")}</td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

// ─── annotation rapide ────────────────────────────────────────────────────────

function renderQuickAnnotButtons(alignmentId, currentComment = "") {
  if (localStorage.getItem("visitor_mode") === "true") {
    return `<span style="font-size:12px; color:#888; font-style:italic;">Mode visiteur — annotation désactivée</span>`;
  }

  return `
    <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
      <input
        id="com-${alignmentId}"
        type="text"
        value="${htmlEscape(currentComment || "")}"
        placeholder="Commentaire optionnel"
        style="width:220px; padding:6px 10px; border:1px solid #ccc; border-radius:6px; font-size:13px; background:#fff; color:#1a1a1a; box-sizing:border-box;"
      />

      ${[
        { status: "OUI", label: "OUI" },
        { status: "NON", label: "NON" },
        { status: "DOUTEUX", label: "DOUTEUX" },
        { status: "UNREVIEWED", label: "UNREVIEWED" },
      ]
        .map(
          ({ status, label }) => `
        <button
          type="button"
          onclick="quickAnnotate(${alignmentId}, '${status}')"
          style="
            padding:6px 14px;
            border:1px solid #999;
            border-radius:6px;
            background:#fff;
            font-size:13px;
            cursor:pointer;
            font-weight:600;
            color:#1a1a1a;
          ">
          ${label}
        </button>
      `
        )
        .join("")}

      <span id="msg-${alignmentId}" style="font-size:12px; color:#888; min-width:120px;"></span>
    </div>
  `;
}

// ─── carte d'un alignment ─────────────────────────────────────────────────────

function renderAlignmentCard(r) {
  const aid = r.alignment_id;
  const status = (r.latest_status || "UNREVIEWED").toUpperCase();

  const histId = `hist-${aid}`;
  const histContentId = `histc-${aid}`;

  const srcPassage = {
    passage_id: r.source_passage_id,
    context_before: r.source_context_before ?? "",
    content: r.source_content ?? r.source_excerpt ?? "",
    context_after: r.source_context_after ?? "",
  };

  const tgtPassage = {
    passage_id: r.target_passage_id,
    context_before: r.target_context_before ?? "",
    content: r.target_content ?? r.target_excerpt ?? "",
    context_after: r.target_context_after ?? "",
  };

  return `
    <div style="border:2px solid #d0d0d0; border-radius:10px; margin-bottom:20px; overflow:hidden; background:#fff; box-shadow:0 1px 4px rgba(0,0,0,0.06);">

      <div style="display:flex; align-items:center; gap:10px; padding:12px 16px; background:#f5f5f5; border-bottom:1px solid #e0e0e0; flex-wrap:wrap;">
        <span style="font-size:12px; color:#999; font-weight:400;">alignment</span>
        <span style="font-size:15px; font-weight:700; color:#1a1a1a; letter-spacing:-0.01em;">
          #${htmlEscape(aid)}
        </span>

        <div style="flex:1;"></div>

        <div id="pill-${aid}">${statusPill(status)}</div>

        ${renderQuickAnnotButtons(aid, r.latest_comment ?? "")}
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; border-bottom:1px solid #e0e0e0;">
        <div style="padding:10px 16px; border-right:1px solid #e0e0e0;">
          <div style="font-size:13px; font-weight:600; color:#1a1a1a; margin-bottom:2px;">
            ${htmlEscape(r.source_title || "—")}
          </div>
          <div style="font-size:12px; color:#555;">
            ${htmlEscape(r.source_authors || "")}
          </div>
          <div style="font-size:11px; color:#888;">
            ${htmlEscape(r.source_date || "")}
          </div>
        </div>

        <div style="padding:10px 16px;">
          <div style="font-size:13px; font-weight:600; color:#1a1a1a; margin-bottom:2px;">
            ${htmlEscape(r.target_title || "—")}
          </div>
          <div style="font-size:12px; color:#555;">
            ${htmlEscape(r.target_authors || "")}
          </div>
          <div style="font-size:11px; color:#888;">
            ${htmlEscape(r.target_date || "")}
          </div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; padding:14px 16px; border-bottom:1px solid #e0e0e0; background:#fafafa;">
        ${renderPassageBlock("Source", "#dbeeff", "#0c3b6e", "#5b9fd6", srcPassage, aid, tgtPassage.content)}
        ${renderPassageBlock("Cible", "#daf0e6", "#0a3d26", "#3aab72", tgtPassage, aid, srcPassage.content)}
      </div>

      <div style="padding:10px 16px 12px;">
        <button
          type="button"
          onclick="toggleHist('${histId}', '${histContentId}', ${aid})"
          style="font-size:12px; color:#555; background:none; border:none; cursor:pointer; text-decoration:underline; text-underline-offset:2px; padding:0;">
          Historique des annotations
        </button>

        <div id="${histId}" style="display:none; margin-top:6px;">
          <div id="${histContentId}">
            <p style="font-size:12px; color:#888; margin:0;">Chargement…</p>
          </div>
        </div>
      </div>

    </div>
  `;
}

// ─── fonctions globales appelées par onclick ──────────────────────────────────

window.quickAnnotate = async function (aid, status) {
  const msgEl = document.getElementById(`msg-${aid}`);
  const commentEl = document.getElementById(`com-${aid}`);
  const comment = commentEl?.value || "";

  if (msgEl) {
    msgEl.textContent = "Enregistrement…";
    msgEl.style.color = "#888";
  }

  try {
    await apiPost(`/api/alignments/${aid}/annotate`, {
      status,
      comment: comment || "",
      user_email: getUserEmail(),
    });

    const pillEl = document.getElementById(`pill-${aid}`);
    if (pillEl) pillEl.innerHTML = statusPill(status);

    const cacheKey = `__hist_${aid}`;
    window[cacheKey] = false;

    const histPanel = document.getElementById(`hist-${aid}`);
    if (histPanel && histPanel.style.display !== "none") {
      const contentEl = document.getElementById(`histc-${aid}`);
      if (contentEl) {
        const data = await apiGet(`/api/alignments/${aid}/annotations/history`);
        contentEl.innerHTML = renderAnnotHistory(data.items || []);
        window[cacheKey] = true;
      }
    }

    if (msgEl) {
      msgEl.textContent = "Enregistré ✓";
      msgEl.style.color = "#287a2e";

      setTimeout(() => {
        msgEl.textContent = "";
        msgEl.style.color = "#888";
      }, 1200);
    }
  } catch (e) {
    if (msgEl) {
      msgEl.textContent = String(e);
      msgEl.style.color = "#c00";
    }
  }
};

window.toggleHist = async function (panelId, contentId, aid) {
  const panel = document.getElementById(panelId);
  if (!panel) return;

  const isOpen = panel.style.display !== "none";
  panel.style.display = isOpen ? "none" : "block";

  const cacheKey = `__hist_${aid}`;

  if (!isOpen && !window[cacheKey]) {
    window[cacheKey] = true;

    const contentEl = document.getElementById(contentId);
    if (contentEl) {
      try {
        const data = await apiGet(`/api/alignments/${aid}/annotations/history`);
        contentEl.innerHTML = renderAnnotHistory(data.items || []);
      } catch (e) {
        window[cacheKey] = false;
        contentEl.innerHTML = `
          <p style="font-size:12px; color:#c00;">
            ${htmlEscape(String(e))}
          </p>
        `;
      }
    }
  }
};

// ─── rendu de la liste ────────────────────────────────────────────────────────

function renderResults(rows) {
  const div = document.getElementById("results");

  if (!rows || rows.length === 0) {
    div.innerHTML = `<p style="padding:12px 0; color:#888;">Aucun résultat.</p>`;
    return;
  }

  div.innerHTML = rows.map((r) => renderAlignmentCard(r)).join("");

  requestAnimationFrame(() => equalizePassageZones());
}

// ─── corpus options ───────────────────────────────────────────────────────────

const CORPUS_OPTIONS = [
  { value: "", label: "Tous les corpus" },
  { value: "modern_0", label: "modern_0" },
  { value: "modern_pamphlet", label: "modern_pamphlet" },
  { value: "modern_letter", label: "modern_letter" },
  { value: "modern_dico", label: "modern_dico" },
  { value: "modern_press", label: "modern_press" },
];

function buildCorpusSelect(id, label) {
  return `
    <div>
      <label style="font-size:12px; color:#666; display:block; margin-bottom:4px;">${label}</label>
      <select id="${id}" class="align-input" style="min-height:unset; padding:8px 10px;">
        ${CORPUS_OPTIONS.map(o => `<option value="${o.value}">${o.label}</option>`).join("")}
      </select>
    </div>
  `;
}

// ─── filtres ──────────────────────────────────────────────────────────────────

const DEFAULT_STATUS_FILTERS = {
  OUI: true,
  NON: false,
  DOUTEUX: true,
  UNREVIEWED: true,
  DISCARDED: false,
};

function buildStatusCheckboxes(statusFilters) {
  const labels = {
    OUI: "Correct",
    NON: "Incorrect",
    DOUTEUX: "Douteux",
    UNREVIEWED: "Non-révisé",
    DISCARDED: "Ignoré",
  };

  return Object.entries(labels)
    .map(
      ([status, label]) => `
    <label class="status-check">
      <input
        type="checkbox"
        class="js-status-filter"
        value="${status}"
        ${statusFilters[status] ? "checked" : ""}
      />
      <span>${htmlEscape(label)}</span>
    </label>
  `
    )
    .join("");
}

function buildFiltersHtml(statusFilters, showAdvanced) {
  return `
    <section class="align-search-card">
      <form id="alignSearchForm" class="align-search-form">
        <div class="align-quick-row">
          <input
            type="text"
            id="q"
            name="q"
            placeholder="Recherche rapide : auteur ou texte…"
            class="align-input align-input-main"
          />
          <button type="submit" class="btn">Rechercher</button>
          <button type="button" id="resetBtn" class="btn btn-secondary">Réinitialiser</button>
        </div>

        <div class="align-advanced-toggle">
          <button type="button" id="toggleAdvancedBtn" class="link-btn">
            ${showAdvanced ? "▼ Masquer" : "► Afficher"} la recherche avancée
          </button>
        </div>

        <div id="advancedFilters" style="display:${showAdvanced ? "block" : "none"};">
          <div class="align-advanced-box">

            <div class="align-grid-2">
              <div class="align-filter-block source-block">
                <h3>Source</h3>
                ${buildCorpusSelect("source_corpus", "Corpus source")}
                <input type="text" id="source_author" placeholder="Auteur source" class="align-input" />
                <input type="text" id="source_text" placeholder="Livre / texte source" class="align-input" />
                <input type="number" id="source_alignment_id" placeholder="Alignment ID" class="align-input" />
              </div>

              <div class="align-filter-block target-block">
                <h3>Cible</h3>
                ${buildCorpusSelect("target_corpus", "Corpus cible")}
                <input type="text" id="target_author" placeholder="Auteur cible" class="align-input" />
                <input type="text" id="target_text" placeholder="Livre / texte cible" class="align-input" />
                <input type="number" id="target_alignment_id" placeholder="Alignment ID" class="align-input" />
              </div>
            </div>

            <div class="align-grid-2 common-period-row">
              <div class="align-filter-block">
                <h3>Commun</h3>
                <input type="text" id="common_author" placeholder="Auteur (source ou cible)" class="align-input" />
                <input type="text" id="common_text" placeholder="Livre / texte (source ou cible)" class="align-input" />
                <input type="number" id="common_alignment_id" placeholder="Alignment ID" class="align-input" />
                <input type="number" id="triangle_id" placeholder="Triangle ID" class="align-input" />
              </div>

              <div class="align-filter-block">
                <h3>Période de publication</h3>
                <div class="align-grid-2">
                  <input type="number" id="year_start" placeholder="Année début" class="align-input" />
                  <input type="number" id="year_end" placeholder="Année fin" class="align-input" />
                </div>
              </div>
            </div>

            <div class="align-filter-block">
              <h3>Statut des annotations</h3>
              <div class="status-check-grid">
                ${buildStatusCheckboxes(statusFilters)}
              </div>
            </div>

          </div>
        </div>
      </form>
    </section>

    <section class="align-results-card">
      <div class="align-results-head">
        <h2>Résultats</h2>
        <div style="display:flex; align-items:center; gap:16px;">
          <div id="resultsMeta" class="muted small"></div>
          <button
            type="button"
            id="exportCsvBtn"
            style="
              padding:6px 14px;
              border:1px solid #15803d;
              border-radius:6px;
              background:#fff;
              color:#15803d;
              font-size:13px;
              font-weight:600;
              cursor:pointer;
              display:none;
            ">
            ⬇ Exporter CSV
          </button>
        </div>
      </div>
      <div id="results"></div>
    </section>
  `;
}

function collectSearchParams(statusFilters, forExport = false) {
  const params = new URLSearchParams();

  const fields = [
    "q",
    "source_author",
    "source_text",
    "source_alignment_id",
    "target_author",
    "target_text",
    "target_alignment_id",
    "common_author",
    "common_text",
    "common_alignment_id",
    "year_start",
    "year_end",
    "triangle_id",
    "source_corpus",
    "target_corpus",
  ];

  for (const field of fields) {
    const el = document.getElementById(field);
    if (!el) continue;

    const value = el.value?.trim?.() ?? el.value;

    if (value !== "" && value != null) {
      params.append(field, value);
    }
  }

  const activeStatuses = Object.entries(statusFilters)
    .filter(([, v]) => v)
    .map(([s]) => s);

  if (activeStatuses.length === 1) {
    params.append("status", activeStatuses[0]);
  }

  if (!forExport) {
    params.append("limit", "50");
  }

  return params;
}

// ─── export CSV ───────────────────────────────────────────────────────────────

async function triggerCsvExport(statusFilters) {
  const btn = document.getElementById("exportCsvBtn");
  if (btn) {
    btn.textContent = "⏳ Export en cours…";
    btn.disabled = true;
  }

  try {
    const params = collectSearchParams(statusFilters, true);
    const url = `/api/alignments/export?${params.toString()}`;

    const r = await fetch(url, {
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    });

    if (r.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user_email");
      localStorage.removeItem("visitor_mode");
      window.location.hash = "#/login";
      return;
    }

    if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);

    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "alignments_export.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);

  } catch (e) {
    alert(`Erreur export : ${String(e)}`);
  } finally {
    if (btn) {
      btn.textContent = "⬇ Exporter CSV";
      btn.disabled = false;
    }
  }
}

// ─── page principale ──────────────────────────────────────────────────────────

export async function renderAlignmentsPage(app) {
  let showAdvanced = true;
  let statusFilters = { ...DEFAULT_STATUS_FILTERS };

  function renderPageSkeleton() {
    app.innerHTML = `
      <div class="wrap alignment-page">
        <div style="margin-bottom:12px;">
          <a href="#/">← Retour</a>
        </div>

        <h1>Annotation par alignment</h1>

        <div class="row" style="justify-content:space-between; margin-bottom:10px;">
          <div class="muted small">Recherche et filtrage des alignments</div>
          <div><a href="#/">Retour aux clusters</a></div>
        </div>

        ${buildFiltersHtml(statusFilters, showAdvanced)}
      </div>
    `;
  }

  async function fetchAndRender() {
    const resultsDiv = document.getElementById("results");
    const metaDiv = document.getElementById("resultsMeta");
    const exportBtn = document.getElementById("exportCsvBtn");

    if (!resultsDiv || !metaDiv) return;

    resultsDiv.innerHTML = `<p class="muted">Chargement…</p>`;
    metaDiv.textContent = "";
    if (exportBtn) exportBtn.style.display = "none";

    try {
      const params = collectSearchParams(statusFilters);

      const res = await fetch(`/api/alignments/search?${params.toString()}`, {
        headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }

      const data = await res.json();

      renderResults(data.results || []);

      const total = data.total ?? data.count ?? 0;
      const displayed = data.count ?? 0;

      if (total > displayed) {
        metaDiv.textContent = `${total.toLocaleString("fr-FR")} résultat(s) trouvé(s) — ${displayed} affiché(s)`;
      } else {
        metaDiv.textContent = `${total.toLocaleString("fr-FR")} résultat(s)`;
      }

      // Affiche le bouton export si des résultats existent
      if (exportBtn && total > 0) {
        exportBtn.style.display = "inline-block";
      }

    } catch (e) {
      resultsDiv.innerHTML = `<pre>${htmlEscape(String(e))}</pre>`;
    }
  }

  function bindEvents() {
    document
      .getElementById("alignSearchForm")
      ?.addEventListener("submit", async (e) => {
        e.preventDefault();
        await fetchAndRender();
      });

    document.getElementById("resetBtn")?.addEventListener("click", () => {
      renderAlignmentsPage(app);
    });

    document
      .getElementById("toggleAdvancedBtn")
      ?.addEventListener("click", () => {
        showAdvanced = !showAdvanced;
        renderPageSkeleton();
        bindEvents();
      });

    document.querySelectorAll(".js-status-filter").forEach((el) => {
      el.addEventListener("change", (e) => {
        statusFilters[e.target.value] = e.target.checked;
      });
    });

    document.getElementById("exportCsvBtn")?.addEventListener("click", () => {
      triggerCsvExport(statusFilters);
    });
  }

  renderPageSkeleton();
  bindEvents();
  await fetchAndRender();
}