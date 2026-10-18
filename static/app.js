const login = document.querySelector("#login");
const app = document.querySelector("#app");
const main = document.querySelector("#main");
const sidenav = document.querySelector("#sidenav");
const builder = document.querySelector("#builder");
const scrim = document.querySelector("#scrim");
const toast = document.querySelector("#toast");

let catalog = null;
let state = null;
let projectTab = "plant";
let bomFilter = "All";
let saveTimer = 0;
let query = "";

const inr = new Intl.NumberFormat("en-IN");

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sectionMeta(id) {
  const builtIn = catalog.sections.find((section) => section.id === id);
  if (builtIn) return builtIn;
  const custom = state.custom.find((section) => section.id === id);
  if (!custom) return null;
  return { id: custom.id, nav: custom.title, title: custom.title, custom: true };
}

function visibleSections() {
  return state.order
    .map(sectionMeta)
    .filter((section) => section && !state.hidden.includes(section.id));
}

function progress() {
  const criteria = catalog.projects.flatMap((project) => project.criteria);
  const steps = catalog.projects.flatMap((project) =>
    project.steps.map((_, index) => `${project.id}-step-${index}`)
  );
  const phase = catalog.phase2.map((_, index) => `phase2-${index}`);
  const ids = [...criteria.map((item) => item.id), ...steps, ...phase];
  const doneChecks = ids.filter((id) => state.checks[id]).length;
  const daysDone = catalog.schedule.filter((day) => state.dayStatus[day.id] === "done").length;
  const testsPassed = catalog.tests.filter((test) => state.testResult[test.id] === "pass").length;
  const received = catalog.bom.filter((item) => state.bom[item.id]?.received).length;
  const total = ids.length + catalog.schedule.length + catalog.tests.length + catalog.bom.length;
  const complete = doneChecks + daysDone + testsPassed + received;
  return {
    pct: total ? Math.round((complete / total) * 100) : 0,
    daysDone,
    testsPassed,
    received,
    criteriaDone: criteria.filter((item) => state.checks[item.id]).length,
    criteriaTotal: criteria.length,
  };
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  window.setTimeout(() => toast.classList.add("hidden"), 2200);
}

function remember(text) {
  state.log.unshift({ at: new Date().toISOString(), text });
  state.log = state.log.slice(0, 40);
}

function queueSave() {
  document.querySelector("#save-state").textContent = "Saving…";
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(save, 350);
}

async function save() {
  const response = await fetch("/api/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });
  if (response.status === 401) {
    showLogin();
    return;
  }
  const y = window.scrollY;
  state = await response.json();
  document.querySelector("#save-state").textContent = "Saved on the server";
  render();
  window.scrollTo(0, y);
}

function pill(text) {
  const lower = text.toLowerCase();
  let kind = "neutral";
  if (lower.includes("below") || lower.includes("in range") || lower === "phase 2") kind = "ok";
  if (lower.includes("over") || lower.includes("out of stock") || lower.includes("if needed") || lower.includes("optional")) kind = "warn";
  if (lower.includes("high")) kind = "bad";
  return `<span class="pill ${kind}">${esc(text)}</span>`;
}

function statusSelect(id) {
  const current = state.dayStatus[id] || "not_started";
  const options = [
    ["not_started", "Not started"],
    ["in_progress", "In progress"],
    ["blocked", "Blocked"],
    ["done", "Done"],
  ];
  return `<select class="status" data-day="${id}">${options
    .map(([value, label]) => `<option value="${value}" ${value === current ? "selected" : ""}>${label}</option>`)
    .join("")}</select>`;
}

function resultSelect(id) {
  const current = state.testResult[id] || "";
  return `<select class="status" data-test="${id}">
    <option value="" ${current === "" ? "selected" : ""}>Open</option>
    <option value="pass" ${current === "pass" ? "selected" : ""}>Pass</option>
    <option value="fail" ${current === "fail" ? "selected" : ""}>Fail</option>
  </select>`;
}

function check(id, text) {
  return `<label class="check"><input type="checkbox" data-check="${id}" ${state.checks[id] ? "checked" : ""}><span>${esc(text)}</span></label>`;
}

function renderOverview() {
  const stats = progress();
  const apps = catalog.apps
    .map(
      (item) => `<article class="card"><div class="card-head"><h3>${esc(item.name)}</h3>${pill(item.role)}</div>
        <div class="section-body"><p class="muted">${esc(item.sensors)}</p><p>${esc(item.ai)}</p></div></article>`
    )
    .join("");
  return `<section class="section" id="section-overview">
    <div class="kpi-grid">
      ${catalog.kpis.map((item) => `<article class="kpi"><span>${esc(item.label)}</span><strong>${esc(item.value)}</strong><span>${esc(item.hint)}</span></article>`).join("")}
    </div>
    <div class="card">
      <div class="section-head"><h2>Build snapshot</h2><span class="pill ok">${stats.pct}% tracked</span></div>
      <div class="section-body">
        <p>${esc(catalog.project.platform)}. Prepared for ${esc(catalog.project.owner)} on ${esc(catalog.project.date)}. Difficulty ${esc(catalog.project.difficulty)}, window ${esc(catalog.project.window)}, hardware target ${esc(catalog.project.budgetTarget)}.</p>
        <div class="chips">
          <span class="chip">${stats.daysDone}/10 days done</span>
          <span class="chip">${stats.criteriaDone}/${stats.criteriaTotal} acceptance checks</span>
          <span class="chip">${stats.testsPassed}/${catalog.tests.length} tests passed</span>
          <span class="chip">${stats.received}/${catalog.bom.length} parts received</span>
        </div>
      </div>
    </div>
    <div class="card-grid three" style="margin-top:12px">${apps}</div>
  </section>`;
}

function renderMilestones() {
  const doneDays = new Set(catalog.schedule.filter((day) => state.dayStatus[day.id] === "done").map((day) => day.day));
  let currentSet = false;
  const steps = catalog.milestones
    .map((item) => {
      const dayNumber = Number(item.day.replace("Day ", ""));
      const done = doneDays.has(dayNumber);
      let klass = "";
      if (done) klass = "done";
      else if (!currentSet) {
        klass = "current";
        currentSet = true;
      }
      return `<button class="path-step ${klass}" type="button" data-goto="schedule"><b>${esc(item.code)} · ${esc(item.day)}</b><strong>${esc(item.title)}</strong><span class="muted">${esc(item.detail)}</span></button>`;
    })
    .join("");
  return `<section class="section card" id="section-milestones"><div class="section-head"><h2>Release path</h2></div><div class="section-body"><div class="path">${steps}</div></div></section>`;
}

function renderSchedule() {
  const rows = catalog.schedule
    .map(
      (day) => `<tr>
        <td>Day ${day.day}</td>
        <td><strong>${esc(day.title)}</strong><div class="muted">${esc(day.work)}</div></td>
        <td>${esc(day.deliverable)}</td>
        <td>${statusSelect(day.id)}</td>
      </tr>`
    )
    .join("");
  return `<section class="section card" id="section-schedule"><div class="section-head"><h2>10-day plan</h2><span class="muted">A tight 7-day plan runs days 5–6 together and shortens the soak to 24 h.</span></div><div class="table-wrap"><table><thead><tr><th>Day</th><th>Work</th><th>Deliverable</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function renderProjects() {
  const project = catalog.projects.find((item) => item.id === projectTab);
  const tabs = catalog.projects
    .map((item) => `<button class="tab ${item.id === projectTab ? "active" : ""}" type="button" data-project="${item.id}">${esc(item.name)}</button>`)
    .join("");
  const steps = project.steps.map((step, index) => check(`${project.id}-step-${index}`, step)).join("");
  const criteria = project.criteria.map((item) => check(item.id, item.text)).join("");
  return `<section class="section card" id="section-projects">
    <div class="section-head"><h2>Acceptance</h2></div>
    <div class="tabs">${tabs}</div>
    <div class="section-body split">
      <div><h3>Build steps</h3>${steps}</div>
      <div><h3>Done when</h3>${criteria}</div>
    </div>
  </section>`;
}

function renderTests() {
  const rows = catalog.tests
    .map((test) => {
      const result = state.testResult[test.id] || "";
      return `<tr class="${result}"><td>${esc(test.id)}</td><td>${esc(test.area)}</td><td>${esc(test.name)}</td><td>${esc(test.expect)}</td><td>${resultSelect(test.id)}</td></tr>`;
    })
    .join("");
  return `<section class="section card" id="section-tests"><div class="section-head"><h2>Test matrix</h2></div><div class="table-wrap"><table><thead><tr><th>ID</th><th>Area</th><th>Test</th><th>Expected</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function renderBom() {
  const groups = ["All", "Core", "Optional", "Phase 2"];
  const rows = catalog.bom.filter((item) => bomFilter === "All" || item.group === bomFilter);
  const selected = rows.reduce((sum, item) => sum + item.price * item.qty, 0);
  const received = catalog.bom.filter((item) => state.bom[item.id]?.received).reduce((sum, item) => sum + item.price, 0);
  const body = rows
    .map((item) => {
      const flags = state.bom[item.id] || {};
      return `<tr>
        <td><strong>${esc(item.item)}</strong><div class="muted">${esc(item.note)}</div></td>
        <td>${esc(item.group)}</td>
        <td>${esc(item.seller)}</td>
        <td>₹${inr.format(item.price)}</td>
        <td>${pill(item.check)}</td>
        <td><label class="check"><input type="checkbox" data-bom="${item.id}" data-flag="ordered" ${flags.ordered ? "checked" : ""}>Ordered</label>
            <label class="check"><input type="checkbox" data-bom="${item.id}" data-flag="received" ${flags.received ? "checked" : ""}>Received</label></td>
      </tr>`;
    })
    .join("");
  const filters = groups
    .map((group) => `<button class="btn ${group === bomFilter ? "btn-brand" : "btn-neutral"}" type="button" data-bom-filter="${group}">${group}</button>`)
    .join(" ");
  return `<section class="section card" id="section-bom">
    <div class="section-head"><h2>Bill of materials</h2><span class="muted">Showing ₹${inr.format(selected)} · received ₹${inr.format(received)}</span></div>
    <div class="section-body">${filters}<p class="muted">Prices are GST-included live listings from 18 Oct 2026. Shipping is extra. Core subtotal is ₹1,656.</p></div>
    <div class="table-wrap"><table><thead><tr><th>Item</th><th>Group</th><th>Seller</th><th>Price</th><th>Check</th><th>Procurement</th></tr></thead><tbody>${body}</tbody></table></div>
  </section>`;
}

function renderBudget() {
  const budget = catalog.budget
    .map((row) => `<tr><td>${esc(row.scenario)}</td><td>${esc(row.hosting)}</td><td>${esc(row.ai)}</td><td><strong>${esc(row.total)}</strong></td></tr>`)
    .join("");
  const volumes = catalog.volumes
    .map((row) => `<tr><td>${esc(row.label)}</td><td><strong>${esc(row.unit)}</strong></td><td>${esc(row.note)}</td></tr>`)
    .join("");
  return `<section class="section card" id="section-budget"><div class="section-head"><h2>Cost and volume</h2></div>
    <div class="table-wrap"><table><thead><tr><th>Monthly scenario</th><th>Hosting</th><th>AI</th><th>Total</th></tr></thead><tbody>${budget}</tbody></table></div>
    <div class="table-wrap"><table><thead><tr><th>Hardware volume</th><th>Per unit</th><th>Basis</th></tr></thead><tbody>${volumes}</tbody></table></div></section>`;
}

function renderRisks() {
  const rows = catalog.risks
    .map((risk) => `<tr><td><strong>${esc(risk.risk)}</strong></td><td>${esc(risk.impact)}</td><td>${pill(risk.likelihood)}</td><td>${esc(risk.mitigation)}</td></tr>`)
    .join("");
  return `<section class="section card" id="section-risks"><div class="section-head"><h2>Risks</h2></div><div class="table-wrap"><table><thead><tr><th>Risk</th><th>Impact</th><th>Likelihood</th><th>Mitigation</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function renderWiring() {
  const rows = catalog.pins
    .map((pin) => `<tr><td>${esc(pin.module)}</td><td>${esc(pin.pin)}</td><td><strong>${esc(pin.esp)}</strong></td><td>${esc(pin.note)}</td></tr>`)
    .join("");
  return `<section class="section card" id="section-wiring"><div class="section-head"><h2>Pinout</h2><span class="muted">ESP32 DevKit V1, USB powered in v1</span></div><div class="table-wrap"><table><thead><tr><th>Module</th><th>Module pin</th><th>ESP32</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function renderDecisions() {
  const cards = catalog.decisions
    .map((item, index) => `<article class="card"><div class="card-head"><h3>${index + 1}. ${esc(item.title)}</h3></div><div class="section-body"><p>${esc(item.why)}</p></div></article>`)
    .join("");
  return `<section class="section" id="section-decisions"><div class="decision-grid">${cards}</div></section>`;
}

function renderPhase2() {
  const items = catalog.phase2.map((item, index) => check(`phase2-${index}`, item)).join("");
  return `<section class="section card" id="section-phase2"><div class="section-head"><h2>Phase 2 backlog</h2><span class="muted">After v1 acceptance</span></div><div class="section-body">${items}</div></section>`;
}

function renderFixes() {
  const rows = catalog.troubleshooting
    .map((item) => `<tr><td><strong>${esc(item.symptom)}</strong></td><td>${esc(item.fix)}</td></tr>`)
    .join("");
  return `<section class="section card" id="section-troubleshooting"><div class="section-head"><h2>Troubleshooting</h2></div><div class="table-wrap"><table><thead><tr><th>Symptom</th><th>Fix</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function renderCustom(section) {
  const custom = state.custom.find((item) => item.id === section.id);
  return `<section class="section card" id="section-${section.id}">
    <div class="section-head"><h2>${esc(custom.title)}</h2><button class="btn btn-neutral" type="button" data-remove-custom="${custom.id}">Remove</button></div>
    <div class="section-body"><p style="white-space:pre-wrap">${esc(custom.body)}</p></div>
  </section>`;
}

function renderNotes() {
  const log = state.log
    .map((entry) => `<li><time>${esc(new Date(entry.at).toLocaleString())}</time>${esc(entry.text)}</li>`)
    .join("");
  return `<section class="section card" id="section-notes">
    <div class="section-head"><h2>Build notes</h2></div>
    <div class="section-body split">
      <form id="note-form">
        <label for="note">Shared note</label>
        <textarea id="note" class="note-box" maxlength="240" placeholder="What changed on the bench"></textarea>
        <button class="btn btn-brand" type="submit">Add note</button>
      </form>
      <ul class="log">${log || "<li class='muted'>No notes yet.</li>"}</ul>
    </div>
  </section>`;
}

const renderers = {
  overview: renderOverview,
  milestones: renderMilestones,
  schedule: renderSchedule,
  projects: renderProjects,
  tests: renderTests,
  bom: renderBom,
  budget: renderBudget,
  risks: renderRisks,
  wiring: renderWiring,
  decisions: renderDecisions,
  phase2: renderPhase2,
  troubleshooting: renderFixes,
};

function renderNav() {
  const sections = state.order.map(sectionMeta).filter((section) => section && !state.hidden.includes(section.id));
  sidenav.innerHTML = sections
    .map(
      (section) =>
        `<button class="nav-link" type="button" data-goto="${section.id}"><span>${esc(section.nav)}</span></button>`
    )
    .join("");
}

function render() {
  const sections = visibleSections();
  const page = `
    <div class="page-head">
      <div>
        <p class="eyebrow">${esc(catalog.project.version)} · ${esc(catalog.project.date)}</p>
        <h1>${esc(catalog.project.name)}</h1>
        <p class="muted">Developer record for progress, parts and acceptance. Changes save to this host, so another computer sees the same board.</p>
      </div>
    </div>
    ${sections
      .map((section) => (section.custom ? renderCustom(section) : renderers[section.id]()))
      .join("")}
    ${renderNotes()}`;
  main.innerHTML = page;
  if (query) {
    [...main.querySelectorAll(".section")].forEach((section) => {
      if (!section.textContent.toLowerCase().includes(query)) section.classList.add("hidden");
    });
  }
  renderNav();
  const stats = progress();
  document.querySelector("#progress-label").textContent = `${stats.pct}% of tracked work complete`;
  renderBuilder();
}

function renderBuilder() {
  const list = document.querySelector("#builder-list");
  list.innerHTML = state.order
    .map((id) => {
      const section = sectionMeta(id);
      if (!section) return "";
      const shown = !state.hidden.includes(id);
      return `<li class="builder-row">
        <label class="check"><input type="checkbox" data-show="${id}" ${shown ? "checked" : ""}><span>${esc(section.title)}</span></label>
        <span class="builder-actions">
          <button class="btn btn-neutral" type="button" data-move="${id}" data-dir="-1">Up</button>
          <button class="btn btn-neutral" type="button" data-move="${id}" data-dir="1">Down</button>
        </span>
      </li>`;
    })
    .join("");
}

function showLogin() {
  app.classList.add("hidden");
  login.classList.remove("hidden");
}

function showApp() {
  login.classList.add("hidden");
  app.classList.remove("hidden");
  render();
}

function openBuilder(open) {
  builder.classList.toggle("hidden", !open);
  scrim.classList.toggle("hidden", !open);
}

document.querySelector("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = document.querySelector("#code").value;
  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const body = await response.json();
  if (!response.ok) {
    document.querySelector("#login-error").textContent = body.error || "Could not sign in.";
    return;
  }
  await boot();
});

document.querySelector("#logout").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  showLogin();
});

document.querySelector("#search").addEventListener("input", (event) => {
  query = event.target.value.trim().toLowerCase();
  render();
});

document.querySelector("#open-builder").addEventListener("click", () => openBuilder(true));
document.querySelector("#close-builder").addEventListener("click", () => openBuilder(false));
scrim.addEventListener("click", () => {
  openBuilder(false);
  sidenav.classList.remove("open");
});
document.querySelector("#nav-toggle").addEventListener("click", () => sidenav.classList.toggle("open"));
document.querySelector("#jump-notes").addEventListener("click", () => {
  document.querySelector("#section-notes")?.scrollIntoView({ behavior: "smooth" });
});

document.querySelector("#custom-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const title = document.querySelector("#custom-title").value.trim();
  const body = document.querySelector("#custom-body").value.trim();
  const id = `custom-${Date.now().toString(36)}`;
  state.custom.push({ id, title, body });
  state.order.push(id);
  remember(`Added section “${title}”`);
  event.target.reset();
  queueSave();
  showToast("Section added");
});

document.querySelector("#builder-list").addEventListener("click", (event) => {
  const move = event.target.closest("[data-move]");
  if (!move) return;
  const id = move.dataset.move;
  const dir = Number(move.dataset.dir);
  const index = state.order.indexOf(id);
  const next = index + dir;
  if (index < 0 || next < 0 || next >= state.order.length) return;
  const [item] = state.order.splice(index, 1);
  state.order.splice(next, 0, item);
  queueSave();
});

document.querySelector("#builder-list").addEventListener("change", (event) => {
  const box = event.target.closest("[data-show]");
  if (!box) return;
  const id = box.dataset.show;
  if (box.checked) state.hidden = state.hidden.filter((item) => item !== id);
  else if (!state.hidden.includes(id)) state.hidden.push(id);
  queueSave();
});

main.addEventListener("change", (event) => {
  const target = event.target;
  if (target.dataset.check) {
    state.checks[target.dataset.check] = target.checked;
    queueSave();
  }
  if (target.dataset.day) {
    state.dayStatus[target.dataset.day] = target.value;
    queueSave();
  }
  if (target.dataset.test) {
    if (target.value) state.testResult[target.dataset.test] = target.value;
    else delete state.testResult[target.dataset.test];
    queueSave();
  }
  if (target.dataset.bom) {
    const current = state.bom[target.dataset.bom] || { ordered: false, received: false };
    current[target.dataset.flag] = target.checked;
    state.bom[target.dataset.bom] = current;
    queueSave();
  }
});

main.addEventListener("click", (event) => {
  const project = event.target.closest("[data-project]");
  if (project) {
    projectTab = project.dataset.project;
    render();
    return;
  }
  const filter = event.target.closest("[data-bom-filter]");
  if (filter) {
    bomFilter = filter.dataset.bomFilter;
    render();
    return;
  }
  const remove = event.target.closest("[data-remove-custom]");
  if (remove) {
    const id = remove.dataset.removeCustom;
    state.custom = state.custom.filter((item) => item.id !== id);
    state.order = state.order.filter((item) => item !== id);
    state.hidden = state.hidden.filter((item) => item !== id);
    remember("Removed a custom section");
    queueSave();
    return;
  }
  const goto = event.target.closest("[data-goto]");
  if (goto) {
    document.getElementById(`section-${goto.dataset.goto}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    sidenav.classList.remove("open");
  }
});

main.addEventListener("submit", (event) => {
  if (event.target.id !== "note-form") return;
  event.preventDefault();
  const text = document.querySelector("#note").value.trim();
  if (!text) return;
  remember(text);
  queueSave();
});

sidenav.addEventListener("click", (event) => {
  const goto = event.target.closest("[data-goto]");
  if (!goto) return;
  document.getElementById(`section-${goto.dataset.goto}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  sidenav.classList.remove("open");
});

async function boot() {
  const response = await fetch("/api/bootstrap");
  if (response.status === 401) {
    showLogin();
    return;
  }
  const body = await response.json();
  catalog = body.catalog;
  state = body.state;
  showApp();
}

boot();
