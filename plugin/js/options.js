"use strict";

// navegacao por abas

document.querySelectorAll(".nav-link").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const tabId = link.dataset.tab;

    document.querySelectorAll(".nav-link").forEach((l) => l.classList.remove("active"));
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));

    link.classList.add("active");
    document.getElementById("tab-" + tabId).classList.add("active");
  });
});

document.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();
  await loadCustomBlockList();
  setupSettingsHandlers();
  setupBlockListHandlers();
  setupReportHandlers();
});

// configuracoes

async function loadSettings() {
  const result = await browser.storage.local.get(["settings", "whitelist"]);
  const settings = result.settings || {
    blockingEnabled: true,
    blockTrackers: true,
    blockCustomList: true
  };
  const whitelist = result.whitelist || [];

  document.getElementById("settingBlocking").checked = settings.blockingEnabled !== false;
  document.getElementById("settingTrackers").checked = settings.blockTrackers !== false;
  document.getElementById("settingCustom").checked   = settings.blockCustomList !== false;
  document.getElementById("whitelistInput").value    = whitelist.join("\n");
}

function setupSettingsHandlers() {
  document.getElementById("btnSaveSettings").addEventListener("click", async () => {
    const settings = {
      blockingEnabled: document.getElementById("settingBlocking").checked,
      blockTrackers:   document.getElementById("settingTrackers").checked,
      blockCustomList: document.getElementById("settingCustom").checked
    };
    await browser.storage.local.set({ settings });
    showStatus("salvo");
  });

  document.getElementById("btnSaveWhitelist").addEventListener("click", async () => {
    const raw = document.getElementById("whitelistInput").value;
    const whitelist = raw
      .split("\n")
      .map((d) => d.trim().toLowerCase())
      .filter((d) => d.length > 0);

    await browser.storage.local.set({ whitelist });
    showStatus("lista branca salva");
  });
}

function showStatus(msg) {
  const status = document.getElementById("saveStatus");
  status.textContent = msg;
  setTimeout(() => (status.textContent = ""), 2000);
}

// lista de bloqueio personalizada

async function loadCustomBlockList() {
  const result = await browser.storage.local.get("customBlockList");
  const list = result.customBlockList || [];
  renderCustomList(list);
}

function renderCustomList(list) {
  const container = document.getElementById("customBlockList");
  document.getElementById("customListCount").textContent = list.length;

  if (list.length === 0) {
    container.innerHTML = '<div class="empty-state">nenhum dominio personalizado adicionado</div>';
    return;
  }

  container.innerHTML = list
    .map(
      (domain, i) => `
      <div class="domain-row">
        <span>${escHtml(domain)}</span>
        <button class="btn-danger" data-remove="${i}">remover</button>
      </div>`
    )
    .join("");

  container.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const idx = parseInt(btn.dataset.remove);
      const r = await browser.storage.local.get("customBlockList");
      const lst = r.customBlockList || [];
      lst.splice(idx, 1);
      await browser.storage.local.set({ customBlockList: lst });
      renderCustomList(lst);
    });
  });
}

function setupBlockListHandlers() {
  document.getElementById("btnAddDomain").addEventListener("click", addDomain);
  document.getElementById("blockDomainInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addDomain();
  });

  document.getElementById("btnExport").addEventListener("click", exportList);
  document.getElementById("btnImport").addEventListener("click", () => {
    document.getElementById("importFile").click();
  });
  document.getElementById("importFile").addEventListener("change", importList);
}

async function addDomain() {
  const input = document.getElementById("blockDomainInput");
  const domain = input.value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0];

  if (!domain || !domain.includes(".")) {
    input.style.borderColor = "#e74c3c";
    setTimeout(() => (input.style.borderColor = ""), 1500);
    return;
  }

  const result = await browser.storage.local.get("customBlockList");
  const list = result.customBlockList || [];

  if (!list.includes(domain)) {
    list.push(domain);
    await browser.storage.local.set({ customBlockList: list });
    renderCustomList(list);
  }

  input.value = "";
}

async function exportList() {
  const result = await browser.storage.local.get("customBlockList");
  const list = result.customBlockList || [];
  const blob = new Blob([list.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "privacy-guard-blocklist.txt";
  a.click();
  URL.revokeObjectURL(url);
}

async function importList(e) {
  const file = e.target.files[0];
  if (!file) return;

  const text = await file.text();
  const domains = text
    .split("\n")
    .map((d) => d.trim().toLowerCase())
    .filter((d) => d.length > 0 && d.includes(".") && !d.startsWith("#"));

  const result = await browser.storage.local.get("customBlockList");
  const existing = result.customBlockList || [];
  const merged = [...new Set([...existing, ...domains])];

  await browser.storage.local.set({ customBlockList: merged });
  renderCustomList(merged);
  e.target.value = "";
}

// relatorio

function setupReportHandlers() {
  document.getElementById("btnRefreshReport").addEventListener("click", async () => {
    const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab) return;

    const stats = await browser.runtime.sendMessage({
      type: "getTabStats",
      tabId: tab.id
    });

    renderReport(stats);
    document.getElementById("reportContent").style.display = "block";
  });
}

function renderReport(stats) {
  const privacy = stats.privacy;

  const scoreEl = document.getElementById("reportScore");
  scoreEl.innerHTML = `
    <span style="color:${privacy.color}">${privacy.score}/100 — ${privacy.label}</span>
    <div style="font-size:13px;color:#aaa;margin-top:8px">
      ${privacy.deductions.map(d =>
        `<div style="display:flex;justify-content:space-between;padding:2px 0">
           <span>${escHtml(d.reason)}</span>
           <span style="color:#e74c3c">-${d.value}</span>
         </div>`
      ).join("")}
    </div>`;

  renderReportSection(
    "reportTrackers",
    stats.thirdPartyRequests.filter(r => r.isTracker || r.thirdParty),
    (r) => `
      <div class="report-row">
        <span class="report-badge ${r.blocked ? 'rb-info' : r.isTracker ? 'rb-high' : 'rb-medium'}">
          ${r.blocked ? "bloqueado" : r.isTracker ? r.category || "rastreador" : "3a parte"}
        </span>
        <span class="mono">${escHtml(r.domain)}</span>
        <span class="muted">${escHtml(r.type)}</span>
      </div>`,
    "nenhum rastreador detectado"
  );

  renderReportSection(
    "reportCookies",
    stats.cookies,
    (c) => `
      <div class="report-row">
        <span class="report-badge ${c.thirdParty ? 'rb-high' : 'rb-info'}">${c.thirdParty ? "3a parte" : "1a parte"}</span>
        ${c.supercookie ? '<span class="report-badge rb-tracker">super</span>' : ""}
        <span class="report-badge ${c.session ? 'rb-low' : 'rb-medium'}">${c.session ? "sessao" : "persistente"}</span>
        <span class="mono">${escHtml(c.name)}</span>
        <span class="muted">${escHtml(c.domain)}</span>
      </div>`,
    "nenhum cookie detectado"
  );

  renderReportSection(
    "reportHijacking",
    stats.hijackingAttempts,
    (h) => `
      <div class="report-row">
        <span class="report-badge rb-${h.severity || 'medium'}">${h.severity || "?"}</span>
        <div>
          <div class="white">${escHtml(h.type)}</div>
          <div class="muted">${escHtml(h.details)}</div>
        </div>
      </div>`,
    "nenhuma ameaca detectada"
  );

  const allStorage = [
    ...stats.storageItems,
    ...stats.supercookies.map(s => ({ key: s.name || "?", storageType: s.type, value: "" }))
  ];

  renderReportSection(
    "reportStorage",
    allStorage,
    (s) => `
      <div class="report-row">
        <span class="report-badge rb-medium">${escHtml(s.storageType)}</span>
        <span class="mono">${escHtml(s.key)}</span>
        ${s.value ? `<span class="muted">${escHtml(s.value.substring(0, 40))}${s.value.length > 40 ? "..." : ""}</span>` : ""}
      </div>`,
    "nenhum armazenamento detectado"
  );

  renderReportSection(
    "reportCookieSync",
    stats.cookieSync,
    (s) => `
      <div class="report-row">
        <span class="report-badge rb-high">sync</span>
        <div>
          <span class="mono">${escHtml(s.domain)}</span>
          <div class="muted">${escHtml(s.description)}</div>
        </div>
      </div>`,
    "nenhum sincronismo detectado"
  );
}

function renderReportSection(id, items, renderFn, emptyMsg) {
  const el = document.getElementById(id);
  if (!items || items.length === 0) {
    el.innerHTML = `<div class="empty-state">${emptyMsg}</div>`;
  } else {
    el.innerHTML = items.map(renderFn).join("");
  }
}

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
