function htmlEscape(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

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
    .map(([status, label]) => `
      <label class="status-check">
        <input type="checkbox" class="js-status-filter" value="${status}" ${statusFilters[status] ? "checked" : ""} />
        <span>${htmlEscape(label)}</span>
      </label>
    `)
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
            placeholder="Recherche rapide : auteur ou texte..."
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
    .filter(([, checked]) => checked)
    .map(([status]) => status);

  if (activeStatuses.length === 1) {
    params.append("status", activeStatuses[0]);
  }

  params.append("limit", "50");
  return params;
}

function renderResults(rows) {
  const div = document.getElementById("results");

  if (!rows || rows.length === 0) {
    div.innerHTML = `<p class="muted">Aucun résultat.</p>`;
    return;
  }

  div.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Source</th>
            <th>Cible</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r) => `
            <tr>
              <td>
                <b>${htmlEscape(r.alignment_id)}</b>
              </td>
              <td>
                <div><b>${htmlEscape(r.source_title || "")}</b></div>
                <div class="muted small">${htmlEscape(r.source_authors || "")}</div>
                <div class="muted small">${htmlEscape(r.source_date || "")}</div>
                <div class="excerpt">${htmlEscape(r.source_excerpt || "")}</div>
              </td>
              <td>
                <div><b>${htmlEscape(r.target_title || "")}</b></div>
                <div class="muted small">${htmlEscape(r.target_authors || "")}</div>
                <div class="muted small">${htmlEscape(r.target_date || "")}</div>
                <div class="excerpt">${htmlEscape(r.target_excerpt || "")}</div>
              </td>
              <td>
                <span class="pill">${htmlEscape(r.latest_status || "UNREVIEWED")}</span>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

export async function renderAlignmentsPage(app) {
  let showAdvanced = true;
  let statusFilters = { ...DEFAULT_STATUS_FILTERS };

  function renderPageSkeleton() {
    app.innerHTML = `
      <div class="wrap alignment-page">
        <div style="margin-bottom:12px;">
          <a href="#/">&larr; Retour</a>
        </div>

        <h1>Annotation par alignment</h1>

        <div class="row" style="justify-content: space-between; margin-bottom: 10px;">
          <div class="muted small">
            Recherche et filtrage des alignments
          </div>
          <div>
            <a href="#/">Retour aux clusters</a>
          </div>
        </div>

        ${buildFiltersHtml(statusFilters, showAdvanced)}
      </div>
    `;
  }

  async function fetchAndRender() {
    const resultsDiv = document.getElementById("results");
    const metaDiv = document.getElementById("resultsMeta");

    resultsDiv.innerHTML = `<p class="muted">Chargement...</p>`;
    metaDiv.textContent = "";

    try {
      const params = collectSearchParams(statusFilters);
      const res = await fetch(`/api/alignments/search?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }
      const data = await res.json();

      renderResults(data.results || []);
      metaDiv.textContent = `${data.count || 0} résultat(s) affiché(s)`;
    } catch (e) {
      resultsDiv.innerHTML = `<pre>${htmlEscape(String(e))}</pre>`;
    }
  }

  function bindEvents() {
    const form = document.getElementById("alignSearchForm");
    const resetBtn = document.getElementById("resetBtn");
    const toggleAdvancedBtn = document.getElementById("toggleAdvancedBtn");

    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      await fetchAndRender();
    });

    resetBtn?.addEventListener("click", () => {
      renderAlignmentsPage(app);
    });

    toggleAdvancedBtn?.addEventListener("click", () => {
      showAdvanced = !showAdvanced;
      renderPageSkeleton();
      bindEvents();
    });

    document.querySelectorAll(".js-status-filter").forEach((el) => {
      el.addEventListener("change", (e) => {
        const input = e.target;
        statusFilters[input.value] = input.checked;
      });
    });
  }

  renderPageSkeleton();
  bindEvents();
  await fetchAndRender();
}