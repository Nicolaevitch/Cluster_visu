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

  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}

async function apiGet(path) {
  const r = await fetch(path, {
    headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
  });

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

// ─── bloc passage ─────────────────────────────────────────────────────────────

function renderPassageBlock(label, accentBg, accentColor, accentBorder, passage) {
  const beforeId = uid();
  const afterId = uid();

  const hasBefore = (passage.context_before || "").trim().length > 0;
  const hasAfter = (passage.context_after || "").trim().length > 0;
  const content = (passage.content || "").trim();

  const ctxToggle = (targetId, labelText) => `
    <button
      type="button"
      onclick="(function(el){el.style.display=el.style.display==='none'?'block':'none'})(document.getElementById('${targetId}'))"
      style="font-size:11px; color:#666; background:none; border:none; cursor:pointer; text-decoration:underline; padding:0; white-space:nowrap;"
    >
      ${htmlEscape(labelText)}
    </button>
  `;

  return `
    <div style="display:flex; flex-direction:column; border:1.5px solid ${accentBorder}; border-radius:8px; overflow:hidden; min-width:0;">

      <div style="background:${accentBg}; color:${accentColor}; font-size:12px; font-weight:600; padding:6px 12px; display:flex; justify-content:space-between; align-items:center; letter-spacing:0.03em; flex-shrink:0;">
        <span>${htmlEscape(label)}</span>
        <span style="font-weight:400; font-size:10px; opacity:0.75;">
          passage_id ${htmlEscape(passage.passage_id ?? "—")}
        </span>
      </div>

      ${
        hasBefore
          ? `
        <div style="background:#f8f8f8; border-top:1px solid #e0e0e0; padding:5px 12px; display:flex; justify-content:space-between; align-items:center; flex-shrink:0;">
          <span style="font-size:11px; color:#888;">Contexte avant</span>
          ${ctxToggle(beforeId, "afficher / masquer")}
        </div>
        <div id="${beforeId}" style="display:none; background:#f3f3f3; border-top:1px solid #e0e0e0; padding:8px 12px; flex-shrink:0;">
          <pre style="margin:0; font-size:11px; color:#666; white-space:pre-wrap; font-family:monospace; line-height:1.5;">${htmlEscape(
            passage.context_before
          )}</pre>
        </div>
      `
          : ""
      }

      <div style="background:#ffffff; border-top:1px solid #e0e0e0; padding:12px; flex:1;">
        ${
          content
            ? `
          <pre style="margin:0; font-size:13px; color:#1a1a1a; white-space:pre-wrap; font-family:monospace; line-height:1.65;">${htmlEscape(
            content
          )}</pre>
        `
            : `
          <span style="font-size:12px; color:#aaa; font-style:italic;">— passage vide —</span>
        `
        }
      </div>

      ${
        hasAfter
          ? `
        <div style="background:#f8f8f8; border-top:1px solid #e0e0e0; padding:5px 12px; display:flex; justify-content:space-between; align-items:center; flex-shrink:0;">
          <span style="font-size:11px; color:#888;">Contexte après</span>
          ${ctxToggle(afterId, "afficher / masquer")}
        </div>
        <div id="${afterId}" style="display:none; background:#f3f3f3; border-top:1px solid #e0e0e0; padding:8px 12px; flex-shrink:0;">
          <pre style="margin:0; font-size:11px; color:#666; white-space:pre-wrap; font-family:monospace; line-height:1.5;">${htmlEscape(
            passage.context_after
          )}</pre>
        </div>
      `
          : ""
      }

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
            <td style="padding:5px 8px; color:#666;">${htmlEscape(
              a.comment ?? ""
            )}</td>
            <td style="padding:5px 8px; color:#999; white-space:nowrap;">${htmlEscape(
              a.created_at ?? ""
            )}</td>
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
        ${renderPassageBlock(
          "Source",
          "#dbeeff",
          "#0c3b6e",
          "#5b9fd6",
          srcPassage
        )}
        ${renderPassageBlock(
          "Cible",
          "#daf0e6",
          "#0a3d26",
          "#3aab72",
          tgtPassage
        )}
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
                <input type="text" id="source_author" placeholder="Auteur source" class="align-input" />
                <input type="text" id="source_text" placeholder="Livre / texte source" class="align-input" />
                <input type="number" id="source_alignment_id" placeholder="Alignment ID" class="align-input" />
              </div>

              <div class="align-filter-block target-block">
                <h3>Cible</h3>
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
        <div id="resultsMeta" class="muted small"></div>
      </div>
      <div id="results"></div>
    </section>
  `;
}

function collectSearchParams(statusFilters) {
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

  params.append("limit", "50");

  return params;
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

    if (!resultsDiv || !metaDiv) return;

    resultsDiv.innerHTML = `<p class="muted">Chargement…</p>`;
    metaDiv.textContent = "";

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
  }

  renderPageSkeleton();
  bindEvents();
  await fetchAndRender();
}