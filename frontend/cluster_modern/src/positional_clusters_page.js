// =============================================================================
// positional_clusters_page.js  — v3
// Pagination liste + détail, filtre annotation (statut latest toutes annotations)
// =============================================================================

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _getToken()     { return localStorage.getItem("token") || ""; }
function _getUserEmail() { return localStorage.getItem("user_email") || ""; }
function _isVisitor()    { return localStorage.getItem("visitor_mode") === "true"; }

function _htmlEscape(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function _handleUnauthorized() {
  localStorage.removeItem("token");
  localStorage.removeItem("user_email");
  localStorage.removeItem("visitor_mode");
  if (window.location.hash !== "#/login") window.location.hash = "#/login";
}

async function _apiGet(path) {
  const r = await fetch(path, {
    headers: _getToken() ? { Authorization: `Bearer ${_getToken()}` } : {},
  });
  if (r.status === 401) { _handleUnauthorized(); throw new Error("Session expirée."); }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}

async function _apiPost(path, body) {
  const r = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(_getToken() ? { Authorization: `Bearer ${_getToken()}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (r.status === 401) { _handleUnauthorized(); throw new Error("Session expirée."); }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const PC_ANNOT_STATUS_OPTIONS = ["UNREVIEWED","OUI","NON","DOUTEUX","DISCARDED"];
const PC_FILTER_LABELS        = ["a_annoter","conflit","autre"];
const PC_MODES                = ["strict","loose"];
const PC_PAGE_SIZE_LIST       = 50;

const PC_HEAD_SIZE_TRANCHES = [
  { value: "",           label: "Toutes tailles" },
  { value: "lt1000",     label: "< 1 000 (normaux)" },
  { value: "1000_5000",  label: "1 000 – 5 000 (grands)" },
  { value: "5000_10000", label: "5 000 – 10 000 (très grands)" },
  { value: "gt10000",    label: "> 10 000 (extrêmes)" },
];
const PC_PAGE_SIZE_DETAIL     = 50;

// ---------------------------------------------------------------------------
// Pagination helper
// ---------------------------------------------------------------------------

function _renderPagination(total, limit, offset, onPageClick) {
  if (total <= limit) return "";

  const totalPages  = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit);

  let html = `<div class="pagination" style="display:flex;gap:6px;flex-wrap:wrap;margin:12px 0;align-items:center;">`;
  html += `<span class="muted small">${total} résultat(s) — page ${currentPage + 1}/${totalPages}</span>`;

  // Fenêtre glissante : toujours afficher max ~9 numéros
  const delta = 4;
  let pages = new Set([0, totalPages - 1]);
  for (let i = Math.max(0, currentPage - delta); i <= Math.min(totalPages - 1, currentPage + delta); i++) {
    pages.add(i);
  }
  pages = [...pages].sort((a, b) => a - b);

  let prev = -1;
  for (const p of pages) {
    if (prev !== -1 && p - prev > 1) html += `<span class="muted">…</span>`;
    const active = p === currentPage ? 'style="font-weight:bold;text-decoration:underline;"' : "";
    html += `<button class="btn small js-pc-page" data-page="${p}" ${active} type="button">${p + 1}</button>`;
    prev = p;
  }

  html += `</div>`;
  return html;
}

function _attachPagination(container, onPageClick) {
  container.querySelectorAll(".js-pc-page").forEach(btn => {
    btn.addEventListener("click", () => onPageClick(Number(btn.getAttribute("data-page"))));
  });
}

// ---------------------------------------------------------------------------
// URL params
// ---------------------------------------------------------------------------

function _getPcParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    mode:          p.get("pc_mode")         || "strict",
    filterStrict:  p.get("pc_fs")           || "",
    filterLoose:   p.get("pc_fl")           || "",
    composition:   p.get("pc_comp")         || "",
    annotStatus:   p.get("pc_annot")        || "",
    headSize:      p.get("pc_hs")           || "",
    listPage:      parseInt(p.get("pc_lp")) || 0,
    detailPage:    parseInt(p.get("pc_dp")) || 0,
  };
}

function _setPcParams(patch) {
  const cur = _getPcParams();
  const next = { ...cur, ...patch };
  const url = new URL(window.location.href);
  const set = (k, v) => v ? url.searchParams.set(k, v) : url.searchParams.delete(k);
  set("pc_mode",  next.mode);
  set("pc_fs",    next.filterStrict);
  set("pc_fl",    next.filterLoose);
  set("pc_comp",  next.composition);
  set("pc_annot", next.annotStatus);
  set("pc_hs",    next.headSize);
  set("pc_lp",    next.listPage  > 0 ? next.listPage  : "");
  set("pc_dp",    next.detailPage > 0 ? next.detailPage : "");
  history.replaceState({}, "", url.toString());
}

function _getCurrentPcClusterIdFromDOM() {
  const el = document.querySelector("#pcClusterPage");
  const n = Number(el?.getAttribute("data-cluster-id"));
  return Number.isFinite(n) ? n : null;
}

function _getCurrentPcModeFromDOM() {
  return document.querySelector("#pcClusterPage")?.getAttribute("data-mode") || "strict";
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

async function _fetchPcCompositionSummary() {
  return _apiGet("/api/positional-clusters/composition_summary");
}
async function _fetchPcCompositionValues() {
  return _apiGet("/api/positional-clusters/composition_values");
}
async function _fetchPcAnnotationDistribution(clusterId, mode) {
  return _apiGet(`/api/positional-clusters/${clusterId}/annotation_distribution?mode=${mode}`);
}
async function _fetchPcAlignmentAnnotationsLatest(alignmentId) {
  if (!alignmentId) return { items: [] };
  return _apiGet(`/api/positional-clusters/alignments/${alignmentId}/annotations/latest`);
}
async function _fetchPcNextCluster(clusterId, params) {
  const q = new URLSearchParams();
  if (params.filterStrict) q.set("filter_label_strict", params.filterStrict);
  if (params.filterLoose)  q.set("filter_label_loose",  params.filterLoose);
  if (params.composition)  q.set("annotation_composition", params.composition);
  if (params.headSize)     q.set("head_size_tranche", params.headSize);
  if (params.mode)         q.set("mode", params.mode);
  return _apiGet(`/api/positional-clusters/${clusterId}/next?${q}`);
}

// ---------------------------------------------------------------------------
// Rendu : récapitulatif composition
// ---------------------------------------------------------------------------

function _renderPcCompositionTable(title, items, filterLabel) {
  const filtered = filterLabel ? items.filter(r => r.filter_label === filterLabel) : items;

  if (!filtered.length) return `
    <div class="summary-card"><h2>${_htmlEscape(title)}</h2>
    <div class="muted small">Aucune donnée.</div></div>`;

  const total = filtered.reduce((s, r) => s + r.nb_clusters, 0);
  return `
    <div class="summary-card">
      <h2>${_htmlEscape(title)}</h2>
      <div class="summary-scroll-box">
        <table class="summary-table">
          <thead><tr>
            <th>annotation_composition</th><th>filter_label</th><th>nb_clusters</th>
          </tr></thead>
          <tbody>
            ${filtered.map(r => `<tr>
              <td><b>${_htmlEscape(r.annotation_composition ?? "—")}</b></td>
              <td>${_htmlEscape(r.filter_label ?? "—")}</td>
              <td>${_htmlEscape(r.nb_clusters)}</td>
            </tr>`).join("")}
          </tbody>
          <tfoot><tr><td colspan="2"><b>Total</b></td><td><b>${total}</b></td></tr></tfoot>
        </table>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Rendu : distribution annotations
// ---------------------------------------------------------------------------

function _renderPcAnnotDistributionBlock(items) {
  if (!items?.length) return `
    <details class="dist-details">
      <summary><b>Répartition des annotations humaines</b></summary>
      <div class="muted small" style="margin-top:8px;">Aucune donnée.</div>
    </details>`;

  return `
    <details class="dist-details" open>
      <summary><b>Répartition des annotations humaines</b></summary>
      <table class="dist-table" style="margin-top:10px;">
        <thead><tr><th>Status</th><th>Nb alignements</th></tr></thead>
        <tbody>
          ${items.map(r => `<tr>
            <td><b>${_htmlEscape(r.status)}</b></td>
            <td>${_htmlEscape(r.nb_alignments)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </details>`;
}

// ---------------------------------------------------------------------------
// Rendu : propagation
// ---------------------------------------------------------------------------

function _renderPcPropagateBlock() {
  if (_isVisitor()) return `
    <div style="margin-top:10px;padding:8px 12px;background:#f5f5f5;border-radius:6px;">
      <span class="muted small"><i>Mode visiteur — propagation désactivée</i></span>
    </div>`;

  return `
    <details class="prop-details" open style="margin-top:10px;">
      <summary><b>Propager une annotation à tous les alignements</b></summary>
      <div class="row" style="gap:12px;align-items:flex-end;flex-wrap:wrap;margin-top:10px;">
        <div>
          <div class="muted small"><b>Status</b></div>
          <select id="pcPropStatus" style="min-width:220px;padding:8px;">
            ${PC_ANNOT_STATUS_OPTIONS.map(s => `<option value="${s}">${s}</option>`).join("")}
          </select>
        </div>
        <div style="flex:1;min-width:260px;">
          <div class="muted small"><b>Commentaire</b></div>
          <input id="pcPropComment" type="text" style="width:100%;padding:8px;" placeholder="(optionnel)"/>
        </div>
        <button class="btn" id="btnPcPropagate" type="button">Propager à tous les alignements</button>
      </div>
      <div id="pcPropMsg" class="muted small" style="margin-top:8px;"></div>
    </details>`;
}

// ---------------------------------------------------------------------------
// Rendu : éditeur annotation
// ---------------------------------------------------------------------------

function _renderPcAnnotEditor(alignmentId, label, items) {
  if (_isVisitor()) return `
    <div class="annot-box" data-aid="${_htmlEscape(alignmentId)}" data-label="${_htmlEscape(label)}">
      <div class="annot-head"><div class="muted small"><i>Mode visiteur</i></div></div>
    </div>`;

  const myEmail = _getUserEmail().toLowerCase();
  const my = (items || []).find(x => (x.email || "").toLowerCase() === myEmail);
  const currentStatus  = my?.status  || "UNREVIEWED";
  const currentComment = my?.comment || "";

  return `
    <div class="annot-box" data-aid="${_htmlEscape(alignmentId)}" data-label="${_htmlEscape(label)}">
      <div class="annot-head">
        <div class="muted small">
          <b>Mon statut :</b> <span class="pill">${_htmlEscape(currentStatus)}</span>
          ${my?.created_at ? `<span class="muted small">— ${_htmlEscape(my.created_at)}</span>` : ""}
        </div>
        <button class="btn small js-pc-toggle-annot" type="button">Modifier</button>
      </div>
      <div class="annot-editor" style="display:none;margin-top:10px;">
        <div class="row" style="gap:12px;align-items:flex-end;flex-wrap:wrap;">
          <div>
            <div class="muted small"><b>Status</b></div>
            <select class="js-pc-annot-status" style="min-width:220px;padding:8px;">
              ${PC_ANNOT_STATUS_OPTIONS.map(s =>
                `<option value="${s}" ${s===currentStatus?"selected":""}>${s}</option>`
              ).join("")}
            </select>
          </div>
          <div style="flex:1;min-width:260px;">
            <div class="muted small"><b>Commentaire</b></div>
            <input class="js-pc-annot-comment" type="text" style="width:100%;padding:8px;"
                   value="${_htmlEscape(currentComment)}" placeholder="(optionnel)"/>
          </div>
          <button class="btn js-pc-save-annot" type="button">Enregistrer</button>
        </div>
        <div class="js-pc-annot-msg muted small" style="margin-top:8px;"></div>
      </div>
    </div>`;
}

function _renderPcAnnotationsTable(items) {
  if (!items?.length) return `<div class="muted small">Aucune annotation.</div>`;
  return `
    <table class="ann-table">
      <thead><tr><th>Utilisateur</th><th>Status</th><th>Commentaire</th><th>Date</th></tr></thead>
      <tbody>
        ${items.map(a => `<tr>
          <td>${_htmlEscape(a.email ?? "")}</td>
          <td><b>${_htmlEscape(a.status ?? "")}</b></td>
          <td>${_htmlEscape(a.comment ?? "")}</td>
          <td class="muted small">${_htmlEscape(a.created_at ?? "")}</td>
        </tr>`).join("")}
      </tbody>
    </table>`;
}

function _renderPcPassageTable(passage, titleLabel) {
  return `
    <div class="passage-card">
      <div class="passage-title">
        <b>${_htmlEscape(titleLabel)}</b>
        <span class="muted">passage_id: ${_htmlEscape(passage?.passage_id ?? "—")}</span>
      </div>
      <table class="passage-table">
        <thead><tr>
          <th>Context_before</th><th>Content</th><th>Context_after</th>
        </tr></thead>
        <tbody><tr>
          <td><pre class="cell-pre">${_htmlEscape(passage?.context_before ?? "")}</pre></td>
          <td><pre class="cell-pre">${_htmlEscape(passage?.content ?? "")}</pre></td>
          <td><pre class="cell-pre">${_htmlEscape(passage?.context_after ?? "")}</pre></td>
        </tr></tbody>
      </table>
      <div class="passage-meta-band">
        <span><b>Auteur:</b> ${_htmlEscape(passage?.authors ?? "—")}</span>
        <span><b>Oeuvre:</b> ${_htmlEscape(passage?.work_title ?? "—")}</span>
        <span><b>Date:</b>   ${_htmlEscape(passage?.work_date ?? "—")}</span>
      </div>
    </div>`;
}

function _renderPcAlignmentSection(aln, annItems) {
  const label = `Alignment #${aln.alignment_id} (${aln.source_role ?? "?"})`;
  const latestStatus = aln.latest_human_status || "UNREVIEWED";

  const srcPassage = {
    passage_id: aln.source_passage_id,
    context_before: aln.source_context_before,
    content: aln.source_content,
    context_after: aln.source_context_after,
  };
  const tgtPassage = {
    passage_id: aln.target_passage_id,
    context_before: aln.target_context_before,
    content: aln.target_content,
    context_after: aln.target_context_after,
    authors: aln.target_authors,
    work_title: aln.target_work_title,
    work_date: aln.target_work_date,
  };

  return `
    <details class="align-details" open>
      <summary class="align-summary">
        <span class="summary-title">${_htmlEscape(label)}</span>
        <span class="muted small">role: ${_htmlEscape(aln.source_role ?? "—")}</span>
        <span class="pill muted small">Statut latest: ${_htmlEscape(latestStatus)}</span>
        ${aln.computed_status
          ? `<span class="pill muted small">Calculé: ${_htmlEscape(aln.computed_status)}</span>`
          : ""}
      </summary>
      <div class="align-body">
        ${_renderPcAnnotEditor(aln.alignment_id, label, annItems || [])}
        <div class="ann-block" style="margin-top:12px;">
          <div class="ann-title"><b>Annotations (latest par user)</b></div>
          ${_renderPcAnnotationsTable(annItems)}
        </div>
        <div class="stack-passages" style="margin-top:12px;">
          ${_renderPcPassageTable(srcPassage, "Passage source")}
          ${_renderPcPassageTable(tgtPassage, "Passage target")}
        </div>
      </div>
    </details>`;
}

// ---------------------------------------------------------------------------
// Bind éditeurs
// ---------------------------------------------------------------------------

function _attachPcAnnotEditors() {
  const once = (el, k) => { if (el[`__pc_${k}`]) return false; el[`__pc_${k}`] = true; return true; };

  document.querySelectorAll(".js-pc-toggle-annot").forEach(btn => {
    if (!once(btn, "toggle")) return;
    btn.addEventListener("click", () => {
      const ed = btn.closest(".annot-box")?.querySelector(".annot-editor");
      if (ed) ed.style.display = ed.style.display === "none" ? "block" : "none";
    });
  });

  document.querySelectorAll(".js-pc-save-annot").forEach(btn => {
    if (!once(btn, "save")) return;
    btn.addEventListener("click", async () => {
      const box    = btn.closest(".annot-box");
      const aid    = Number(box?.getAttribute("data-aid") || 0);
      const label  = box?.getAttribute("data-label") || "";
      const status = box?.querySelector(".js-pc-annot-status")?.value || "UNREVIEWED";
      const comment= box?.querySelector(".js-pc-annot-comment")?.value || "";
      const msg    = box?.querySelector(".js-pc-annot-msg");

      if (!aid) { if (msg) msg.textContent = "Erreur: alignment_id manquant."; return; }
      if (msg) msg.textContent = "Enregistrement...";
      btn.disabled = true;

      try {
        await _apiPost(`/api/positional-clusters/alignments/${aid}/annotate`, { status, comment });
        const latest = await _fetchPcAlignmentAnnotationsLatest(aid);

        const annBlock = box.closest(".align-body")?.querySelector(".ann-block");
        if (annBlock) annBlock.innerHTML = `
          <div class="ann-title"><b>Annotations (latest par user)</b></div>
          ${_renderPcAnnotationsTable(latest.items || [])}`;

        box.outerHTML = _renderPcAnnotEditor(aid, label, latest.items || []);
        _attachPcAnnotEditors();

        // Refresh distribution
        const cid  = _getCurrentPcClusterIdFromDOM();
        const mode = _getCurrentPcModeFromDOM();
        if (cid) {
          try {
            const dist = await _fetchPcAnnotationDistribution(cid, mode);
            const el = document.querySelector("#pcAnnotDist");
            if (el) el.innerHTML = _renderPcAnnotDistributionBlock(dist.items || []);
          } catch { /* non bloquant */ }
        }
      } catch (e) {
        if (msg) msg.textContent = String(e);
      } finally { btn.disabled = false; }
    });
  });
}

// ---------------------------------------------------------------------------
// Bind propagation
// ---------------------------------------------------------------------------

function _attachPcPropagate() {
  const btn = document.querySelector("#btnPcPropagate");
  if (!btn || btn.__pc_prop) return;
  btn.__pc_prop = true;

  btn.addEventListener("click", async () => {
    const cid     = _getCurrentPcClusterIdFromDOM();
    const mode    = _getCurrentPcModeFromDOM();
    const status  = document.querySelector("#pcPropStatus")?.value  || "UNREVIEWED";
    const comment = document.querySelector("#pcPropComment")?.value || "";
    const msg     = document.querySelector("#pcPropMsg");

    if (!cid) { if (msg) msg.textContent = "Erreur: cluster_id introuvable."; return; }
    if (msg) msg.textContent = "Propagation en cours...";
    btn.disabled = true;

    try {
      const res = await _apiPost(
        `/api/positional-clusters/${cid}/propagate?mode=${mode}`,
        { status, comment }
      );

      try {
        const dist = await _fetchPcAnnotationDistribution(cid, mode);
        const el = document.querySelector("#pcAnnotDist");
        if (el) el.innerHTML = _renderPcAnnotDistributionBlock(dist.items || []);
      } catch { /* non bloquant */ }

      const aids = [...new Set(
        Array.from(document.querySelectorAll(".annot-box"))
          .map(el => Number(el.getAttribute("data-aid") || 0)).filter(Boolean)
      )];
      for (const aid of aids) {
        const latest = await _fetchPcAlignmentAnnotationsLatest(aid);
        const box = document.querySelector(`.annot-box[data-aid="${aid}"]`);
        const lbl = box?.getAttribute("data-label") || "";
        const annBlock = box?.closest(".align-body")?.querySelector(".ann-block");
        if (annBlock) annBlock.innerHTML = `
          <div class="ann-title"><b>Annotations (latest par user)</b></div>
          ${_renderPcAnnotationsTable(latest.items || [])}`;
        if (box) box.outerHTML = _renderPcAnnotEditor(aid, lbl, latest.items || []);
      }
      _attachPcAnnotEditors();
      if (msg) msg.textContent = `Terminé ✅ (${res.n_alignments_annotated || 0} alignements).`;
    } catch (e) {
      if (msg) msg.textContent = String(e);
    } finally { btn.disabled = false; }
  });
}

// ---------------------------------------------------------------------------
// Bind next cluster
// ---------------------------------------------------------------------------

function _attachPcNextClusterButton(clusterId) {
  const btn = document.querySelector("#btnPcNextCluster");
  const msg = document.querySelector("#pcNextClusterMsg");
  if (!btn || btn.__pc_next) return;
  btn.__pc_next = true;

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    if (msg) msg.textContent = "Recherche...";
    try {
      const p = _getPcParams();
      const res = await _fetchPcNextCluster(clusterId, {
        filterStrict: p.filterStrict,
        filterLoose:  p.filterLoose,
        composition:  p.composition,
        headSize:     p.headSize,
        mode:         p.mode,
      });
      if (res.next_cluster_id) {
        window.location.hash = `#/positional-cluster/${res.next_cluster_id}`;
      } else {
        if (msg) msg.textContent = "Aucun cluster suivant.";
      }
    } catch (e) {
      if (msg) msg.textContent = String(e);
    } finally { btn.disabled = false; }
  });
}

// ---------------------------------------------------------------------------
// PAGE LISTE
// ---------------------------------------------------------------------------

export async function renderPositionalClustersPage(appEl) {
  const p = _getPcParams();

  appEl.innerHTML = `
    <div class="wrap">
      <h1>Clusters Positionnels</h1>
      <div class="row" style="justify-content:space-between;margin-bottom:10px;">
        <div class="muted small">
          ${_isVisitor() ? `Mode : <b>Visiteur</b>` : `Connecté : <b>${_htmlEscape(_getUserEmail()||"—")}</b>`}
        </div>
        <div style="display:flex;gap:12px;">
          <a href="#/home" class="btn">Accueil</a>
          <a href="#/" class="btn">Clusters</a>
          <a href="#/login">Changer d'utilisateur</a>
        </div>
      </div>

      <div id="pcSummaryStrict" style="margin-bottom:12px;">Chargement...</div>
      <div id="pcSummaryLoose"  style="margin-bottom:16px;">Chargement...</div>

      <div class="row" style="flex-wrap:wrap;gap:16px;margin-bottom:12px;align-items:flex-end;">
        <div>
          <div class="muted small"><b>Mode</b></div>
          <select id="pcModeFilter" style="padding:6px;min-width:120px;">
            ${PC_MODES.map(m => `<option value="${m}" ${m===p.mode?"selected":""}>${m}</option>`).join("")}
          </select>
        </div>
        <div>
          <div class="muted small"><b>filter_label</b></div>
          <select id="pcLabelFilter" style="padding:6px;min-width:160px;">
            <option value="">Tous</option>
            ${PC_FILTER_LABELS.map(l =>
              `<option value="${l}" ${l===p.filterStrict||l===p.filterLoose?"selected":""}>${l}</option>`
            ).join("")}
          </select>
        </div>
        <div>
          <div class="muted small"><b>annotation_composition</b></div>
          <select id="pcCompositionFilter" style="padding:6px;min-width:220px;">
            <option value="">Toutes</option>
          </select>
        </div>
        <div>
          <div class="muted small"><b>Taille passage de tête</b></div>
          <select id="pcHeadSizeFilter" style="padding:6px;min-width:200px;">
            <option value="">Toutes tailles</option>
            <option value="lt1000">< 1 000 (normaux)</option>
            <option value="1000_5000">1 000 – 5 000 (grands)</option>
            <option value="5000_10000">5 000 – 10 000 (très grands)</option>
            <option value="gt10000">> 10 000 (extrêmes)</option>
          </select>
        </div>
        <span id="pcStatus" class="muted small">Chargement...</span>
      </div>

      <div id="pcPaginationTop"></div>
      <div id="pcTable"></div>
      <div id="pcPaginationBot"></div>
    </div>`;

  // Chargement récapitulatifs + valeurs composition en parallèle
  const [summaryData, compValues] = await Promise.all([
    _fetchPcCompositionSummary().catch(() => ({ items: [] })),
    _fetchPcCompositionValues().catch(() => ({ items: [] })),
  ]);

  const allItems    = summaryData.items || [];
  const labelFilter = document.querySelector("#pcLabelFilter")?.value || "";

  document.querySelector("#pcSummaryStrict").innerHTML =
    _renderPcCompositionTable("Récapitulatif — Strict", allItems.filter(r => r.mode === "strict"), labelFilter);
  document.querySelector("#pcSummaryLoose").innerHTML =
    _renderPcCompositionTable("Récapitulatif — Loose",  allItems.filter(r => r.mode === "loose"),  labelFilter);

  // Sélectionner la bonne option taille
  const headSizeSel = document.querySelector("#pcHeadSizeFilter");
  if (headSizeSel && p.headSize) {
    const opt = headSizeSel.querySelector(`option[value="${p.headSize}"]`);
    if (opt) opt.selected = true;
  }

  // Remplir select composition
  const compSel = document.querySelector("#pcCompositionFilter");
  (compValues.items || []).forEach(v => {
    const opt = document.createElement("option");
    opt.value = v; opt.textContent = v;
    if (v === p.composition) opt.selected = true;
    compSel.appendChild(opt);
  });

  // Fonction de chargement paginé
  async function _loadList(pageIndex) {
    _setPcParams({ listPage: pageIndex });
    const offset = pageIndex * PC_PAGE_SIZE_LIST;
    const mode   = document.querySelector("#pcModeFilter")?.value || "strict";
    const label  = document.querySelector("#pcLabelFilter")?.value || "";
    const comp   = document.querySelector("#pcCompositionFilter")?.value || "";

    const apiP = new URLSearchParams({ limit: PC_PAGE_SIZE_LIST, offset });
    if (mode === "strict" && label) apiP.set("filter_label_strict", label);
    if (mode === "loose"  && label) apiP.set("filter_label_loose",  label);
    if (comp) apiP.set("annotation_composition", comp);
    const headSize = document.querySelector("#pcHeadSizeFilter")?.value || "";
    if (headSize) apiP.set("head_size_tranche", headSize);

    let data;
    try {
      data = await _apiGet(`/api/positional-clusters?${apiP}`);
    } catch (e) {
      document.querySelector("#pcStatus").textContent = String(e);
      return;
    }

    const items = data.items || [];
    const total = data.total ?? 0;
    document.querySelector("#pcStatus").textContent =
      `${total} cluster(s) total — page ${pageIndex+1}/${Math.ceil(total/PC_PAGE_SIZE_LIST)||1}`;

    const cols = ["cluster_id","source_title","source_text_date","nb_passages",
                  "nb_alignments_strict","nb_alignments_loose",
                  "filter_label_strict","filter_label_loose","annotation_composition","head_size"];

    let html = `<table><thead><tr>${cols.map(c=>`<th>${_htmlEscape(c)}</th>`).join("")}</tr></thead><tbody>`;
    for (const row of items) {
      html += "<tr>";
      for (const c of cols) {
        if (c === "cluster_id") {
          html += `<td><a href="#/positional-cluster/${row.cluster_id}">${_htmlEscape(row.cluster_id)}</a></td>`;
        } else {
          html += `<td>${_htmlEscape(row[c])}</td>`;
        }
      }
      html += "</tr>";
    }
    html += "</tbody></table>";
    document.querySelector("#pcTable").innerHTML = html;

    const pagHtml = _renderPagination(total, PC_PAGE_SIZE_LIST, offset, _loadList);
    document.querySelector("#pcPaginationTop").innerHTML = pagHtml;
    document.querySelector("#pcPaginationBot").innerHTML = pagHtml;
    _attachPagination(document.querySelector("#pcPaginationTop"), _loadList);
    _attachPagination(document.querySelector("#pcPaginationBot"), _loadList);
  }

  // Bind filtres
  ["#pcModeFilter","#pcLabelFilter","#pcCompositionFilter","#pcHeadSizeFilter"].forEach(sel => {
    document.querySelector(sel)?.addEventListener("change", () => {
      _setPcParams({
        mode:         document.querySelector("#pcModeFilter")?.value || "strict",
        filterStrict: document.querySelector("#pcModeFilter")?.value === "strict"
                        ? (document.querySelector("#pcLabelFilter")?.value || "") : "",
        filterLoose:  document.querySelector("#pcModeFilter")?.value === "loose"
                        ? (document.querySelector("#pcLabelFilter")?.value || "") : "",
        composition:  document.querySelector("#pcCompositionFilter")?.value || "",
        headSize:     document.querySelector("#pcHeadSizeFilter")?.value || "",
        listPage: 0,
      });
      // Refresh récapitulatifs aussi
      const lbl = document.querySelector("#pcLabelFilter")?.value || "";
      document.querySelector("#pcSummaryStrict").innerHTML =
        _renderPcCompositionTable("Récapitulatif — Strict", allItems.filter(r=>r.mode==="strict"), lbl);
      document.querySelector("#pcSummaryLoose").innerHTML =
        _renderPcCompositionTable("Récapitulatif — Loose",  allItems.filter(r=>r.mode==="loose"),  lbl);
      _loadList(0);
    });
  });

  await _loadList(p.listPage);
}

// ---------------------------------------------------------------------------
// PAGE DÉTAIL
// ---------------------------------------------------------------------------

export async function renderPositionalClusterDetailPage(appEl, clusterId) {
  const p = _getPcParams();
  let currentMode       = p.mode        || "strict";
  let currentAnnot      = p.annotStatus || "";
  let currentDetailPage = p.detailPage  || 0;

  appEl.innerHTML = `
    <div class="wrap" id="pcClusterPage"
         data-cluster-id="${_htmlEscape(clusterId)}"
         data-mode="${_htmlEscape(currentMode)}">

      <div style="margin-bottom:12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
        <a href="#/positional-clusters">&larr; Retour</a>
        <button id="btnPcNextCluster" class="btn" type="button">Cluster suivant</button>
        <span id="pcNextClusterMsg" class="muted small"></span>
      </div>

      <h1>Cluster Positionnel ${_htmlEscape(clusterId)}</h1>

      <div class="row" style="justify-content:space-between;margin-bottom:10px;">
        <div class="muted small">
          ${_isVisitor() ? `Mode : <b>Visiteur</b>` : `Connecté : <b>${_htmlEscape(_getUserEmail()||"—")}</b>`}
        </div>
        <div><a href="#/login">Changer d'utilisateur</a></div>
      </div>

      <!-- Sélecteurs mode + filtre statut annotation -->
      <div class="row" style="gap:20px;margin-bottom:12px;align-items:center;flex-wrap:wrap;">
        <div style="display:flex;gap:8px;align-items:center;">
          <label><b>Mode alignements :</b></label>
          <select id="pcModeSelect" style="padding:6px;">
            ${PC_MODES.map(m => `<option value="${m}" ${m===currentMode?"selected":""}>${m}</option>`).join("")}
          </select>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <label><b>Filtre statut annotation :</b></label>
          <select id="pcAnnotStatusFilter" style="padding:6px;min-width:180px;">
            <option value="">Tous</option>
            ${PC_ANNOT_STATUS_OPTIONS.map(s =>
              `<option value="${s}" ${s===currentAnnot?"selected":""}>${s}</option>`
            ).join("")}
          </select>
        </div>
      </div>

      <div id="pcDetailStatus">Chargement...</div>
      <div id="pcTopSummary"></div>
      <div id="pcAnnotDist"></div>
      <div id="pcPropagateBox"></div>
      <div id="pcContent"></div>
    </div>`;

  // Bind mode
  document.querySelector("#pcModeSelect")?.addEventListener("change", async (e) => {
    currentMode = e.target.value;
    currentAnnot = "";
    currentDetailPage = 0;
    document.querySelector("#pcAnnotStatusFilter").value = "";
    document.querySelector("#pcClusterPage")?.setAttribute("data-mode", currentMode);
    _setPcParams({ mode: currentMode, annotStatus: "", detailPage: 0 });
    await _loadPcDetail(0);
  });

  // Bind filtre annotation
  document.querySelector("#pcAnnotStatusFilter")?.addEventListener("change", async (e) => {
    currentAnnot = e.target.value;
    currentDetailPage = 0;
    _setPcParams({ annotStatus: currentAnnot, detailPage: 0 });
    await _loadPcDetail(0);
  });

  _attachPcNextClusterButton(clusterId);

  // Chargement du détail paginé
  async function _loadPcDetail(pageIndex) {
    currentDetailPage = pageIndex;
    _setPcParams({ detailPage: pageIndex });

    const statusEl    = document.querySelector("#pcDetailStatus");
    const topSumEl    = document.querySelector("#pcTopSummary");
    const distEl      = document.querySelector("#pcAnnotDist");
    const propagateEl = document.querySelector("#pcPropagateBox");
    const contentEl   = document.querySelector("#pcContent");

    if (statusEl) statusEl.textContent = "Chargement...";

    const offset = pageIndex * PC_PAGE_SIZE_DETAIL;
    const apiParams = new URLSearchParams({
      mode: currentMode,
      limit: PC_PAGE_SIZE_DETAIL,
      offset,
    });
    if (currentAnnot) apiParams.set("annotation_status", currentAnnot);

    let data;
    try {
      data = await _apiGet(`/api/positional-clusters/${clusterId}/head?${apiParams}`);
      if (statusEl) statusEl.textContent = "Chargé.";
    } catch (e) {
      if (statusEl) statusEl.textContent = `Erreur: ${e}`;
      return;
    }

    const cluster    = data.cluster;
    const alignments = data.alignments || [];
    const total      = data.total_alignments ?? 0;

    // Tableau résumé cluster + passage de tête
    if (topSumEl) {
      topSumEl.innerHTML = `
        <div class="summary-card">
          <table class="summary-table">
            <thead><tr>
              <th>cluster_id</th><th>Source</th><th>Date</th><th>Auteurs</th>
              <th>Nb passages</th><th>Nb aligns strict</th><th>Nb aligns loose</th>
              <th>filter strict</th><th>filter loose</th><th>Composition</th>
            </tr></thead>
            <tbody><tr>
              <td><b>${_htmlEscape(cluster.cluster_id)}</b></td>
              <td>${_htmlEscape(cluster.source_title||cluster.source_filename||"—")}</td>
              <td>${_htmlEscape(cluster.source_text_date??"—")}</td>
              <td>${_htmlEscape(cluster.source_authors??"—")}</td>
              <td>${_htmlEscape(cluster.nb_passages??"—")}</td>
              <td>${_htmlEscape(cluster.nb_alignments_strict??"—")}</td>
              <td>${_htmlEscape(cluster.nb_alignments_loose??"—")}</td>
              <td><b>${_htmlEscape(cluster.filter_label_strict??"—")}</b></td>
              <td><b>${_htmlEscape(cluster.filter_label_loose??"—")}</b></td>
              <td>${_htmlEscape(cluster.annotation_composition??"—")}</td>
            </tr></tbody>
          </table>
        </div>
        <div class="passage-card" style="margin-top:12px;">
          <div class="passage-title">
            <b>Passage de tête</b>
            <span class="muted">passage_id: ${_htmlEscape(cluster.head_passage_id??"—")}</span>
            <span class="muted small">bytes: ${_htmlEscape(cluster.head_start_byte??"?")} → ${_htmlEscape(cluster.head_end_byte??"?")}</span>
          </div>
          <table class="passage-table">
            <thead><tr><th>Context_before</th><th>Content</th><th>Context_after</th></tr></thead>
            <tbody><tr>
              <td><pre class="cell-pre">${_htmlEscape(cluster.head_context_before??"")}</pre></td>
              <td><pre class="cell-pre">${_htmlEscape(cluster.head_content??"")}</pre></td>
              <td><pre class="cell-pre">${_htmlEscape(cluster.head_context_after??"")}</pre></td>
            </tr></tbody>
          </table>
          <div class="passage-meta-band">
            <span><b>Auteurs:</b> ${_htmlEscape(cluster.source_authors??"—")}</span>
            <span><b>Oeuvre:</b>  ${_htmlEscape(cluster.source_title??cluster.source_filename??"—")}</span>
            <span><b>Date:</b>    ${_htmlEscape(cluster.source_text_date??"—")}</span>
          </div>
        </div>`;
    }

    // Distribution annotations
    try {
      const dist = await _fetchPcAnnotationDistribution(clusterId, currentMode);
      if (distEl) distEl.innerHTML = _renderPcAnnotDistributionBlock(dist.items || []);
    } catch {
      if (distEl) distEl.innerHTML = _renderPcAnnotDistributionBlock([]);
    }

    // Propagation
    if (propagateEl) propagateEl.innerHTML = _renderPcPropagateBlock();

    // Annotations humaines en parallèle
    const annByAid = new Map();
    await Promise.all(alignments.map(async aln => {
      try {
        const res = await _fetchPcAlignmentAnnotationsLatest(aln.alignment_id);
        annByAid.set(aln.alignment_id, res.items || []);
      } catch {
        annByAid.set(aln.alignment_id, []);
      }
    }));

    // Rendu alignements + pagination
    if (contentEl) {
      const pagHtml = _renderPagination(total, PC_PAGE_SIZE_DETAIL, offset, _loadPcDetail);

      contentEl.innerHTML = `
        <h2 class="big-title">
          Alignements du passage de tête
          <span class="muted" style="font-size:0.8em;">[mode : ${_htmlEscape(currentMode.toUpperCase())}]</span>
          <span class="muted small">(${total} alignement(s) total${currentAnnot ? ` — filtre: ${currentAnnot}` : ""})</span>
        </h2>
        ${pagHtml}
        <div id="pcAlignmentList">
          ${alignments.length === 0
            ? `<div class="muted">Aucun alignement pour ce filtre / cette page.</div>`
            : alignments.map(aln =>
                _renderPcAlignmentSection(aln, annByAid.get(aln.alignment_id) || [])
              ).join("")
          }
        </div>
        ${pagHtml}`;

      // Bind pagination dans contentEl
      contentEl.querySelectorAll(".js-pc-page").forEach(btn => {
        btn.addEventListener("click", () => _loadPcDetail(Number(btn.getAttribute("data-page"))));
      });
    }

    _attachPcAnnotEditors();
    _attachPcPropagate();
  }

  await _loadPcDetail(currentDetailPage);
}