"use strict";

document.addEventListener("DOMContentLoaded", async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  const stats = await browser.runtime.sendMessage({
    type: "getTabStats",
    tabId: tab.id
  });

  renderAll(stats, tab.url);

  setupToggle("toggleDomains", "domainsList");
  setupToggle("toggleCookies", "cookiesList");
  setupToggle("toggleScore", "scoreDetail");

  document.getElementById("btnOptions").addEventListener("click", () => {
    browser.runtime.openOptionsPage();
    window.close();
  });

  setupBlockToggle();
});

// renderizacao principal

function renderAll(stats, tabUrl) {
  renderScore(stats.privacy);
  renderSummary(stats, tabUrl);
  renderAlerts(stats);
  renderDomains(stats);
  renderCookies(stats);
  renderScoreDetail(stats.privacy);
}

function renderScore(privacy) {
  const ring  = document.getElementById("scoreRing");
  const val   = document.getElementById("scoreValue");
  const label = document.getElementById("scoreLabel");

  val.textContent   = privacy.score;
  label.textContent = privacy.label;
  ring.style.borderColor = privacy.color;
  val.style.color        = privacy.color;
}

function renderSummary(stats, tabUrl) {
  const trackers   = stats.thirdPartyRequests.filter(r => r.isTracker).length;
  const thirdParty = stats.thirdPartyRequests.filter(r => r.thirdParty && !r.isTracker).length;
  const cookies    = stats.cookies.length;
  const blocked    = stats.blockedRequests;

  document.getElementById("numTrackers").textContent  = trackers;
  document.getElementById("numThirdParty").textContent = thirdParty;
  document.getElementById("numCookies").textContent    = cookies;
  document.getElementById("numBlocked").textContent    = blocked;

  try {
    const url = new URL(tabUrl || stats.url || "");
    document.getElementById("scoreUrl").textContent =
      url.hostname + url.pathname.substring(0, 30);
  } catch (e) {
    document.getElementById("scoreUrl").textContent = tabUrl || "";
  }
}

// construcao de alertas por tipo

function buildAlerts(stats) {
  const alerts = [];

  const trackers = stats.thirdPartyRequests.filter(r => r.isTracker && !r.blocked);
  if (trackers.length > 0) {
    alerts.push({
      severity: "high",
      icon: "!",
      title: `${trackers.length} rastreador(es) ativo(s)`,
      detail: trackers.slice(0, 3).map(r => r.domain).join(", ") +
              (trackers.length > 3 ? "..." : "")
    });
  }

  const blocked = stats.thirdPartyRequests.filter(r => r.blocked);
  if (blocked.length > 0) {
    alerts.push({
      severity: "info",
      icon: "x",
      title: `${blocked.length} rastreador(es) bloqueado(s)`,
      detail: blocked.slice(0, 2).map(r => r.domain).join(", ") +
              (blocked.length > 2 ? "..." : "")
    });
  }

  if (stats.canvasFingerprints > 0) {
    alerts.push({
      severity: "high",
      icon: "!",
      title: "Canvas Fingerprinting detectado",
      detail: "esta pagina leu pixels do canvas para identificar o navegador"
    });
  }

  const thirdCookies = stats.cookies.filter(c => c.thirdParty);
  if (thirdCookies.length > 0) {
    alerts.push({
      severity: "medium",
      icon: "~",
      title: `${thirdCookies.length} cookie(s) de terceiros`,
      detail: [...new Set(thirdCookies.map(c => c.domain))].slice(0, 3).join(", ")
    });
  }

  const supercookies = stats.cookies.filter(c => c.supercookie);
  if (supercookies.length > 0) {
    alerts.push({
      severity: "high",
      icon: "!",
      title: `${supercookies.length} supercookie(s) detectado(s)`,
      detail: "cookies persistentes com HttpOnly + Secure + SameSite=None"
    });
  }

  if (stats.storageItems.length > 0) {
    alerts.push({
      severity: "medium",
      icon: "~",
      title: `HTML5 Storage (${stats.storageItems.length} item(s))`,
      detail: stats.storageItems.slice(0, 2)
        .map(s => `${s.storageType}: ${s.key}`).join(", ")
    });
  }

  if (stats.supercookies.length > 0) {
    alerts.push({
      severity: "medium",
      icon: "~",
      title: `armazenamento avancado (${stats.supercookies.length})`,
      detail: stats.supercookies.map(s => s.type).join(", ")
    });
  }

  if (stats.cookieSync.length > 0) {
    alerts.push({
      severity: "high",
      icon: "!",
      title: `sincronismo de cookies (${stats.cookieSync.length} dominio(s))`,
      detail: stats.cookieSync.slice(0, 2).map(s => s.description).join(" | ")
    });
  }

  stats.hijackingAttempts.forEach(h => {
    alerts.push({
      severity: h.severity || "medium",
      icon: h.severity === "high" ? "!" : "~",
      title: h.type,
      detail: h.details
    });
  });

  return alerts;
}

function renderAlerts(stats) {
  const list = document.getElementById("alertsList");
  const alerts = buildAlerts(stats);

  if (alerts.length === 0) {
    list.innerHTML = '<div class="empty-state">nenhum alerta nesta pagina</div>';
    return;
  }

  list.innerHTML = alerts
    .map(a => `
      <div class="alert-item alert-${a.severity}">
        <span class="alert-icon">${escHtml(a.icon)}</span>
        <div class="alert-text">
          <strong>${escHtml(a.title)}</strong>
          ${escHtml(a.detail)}
        </div>
      </div>`)
    .join("");
}

function renderDomains(stats) {
  const list = document.getElementById("domainsList");

  if (stats.thirdPartyRequests.length === 0) {
    list.innerHTML = '<div class="empty-state">nenhum dominio de terceiro detectado</div>';
    return;
  }

  list.innerHTML = stats.thirdPartyRequests
    .sort((a, b) => {
      if (a.blocked !== b.blocked) return a.blocked ? -1 : 1;
      if (a.isTracker !== b.isTracker) return a.isTracker ? -1 : 1;
      return 0;
    })
    .map(r => {
      let badgeClass, badgeText;
      if (r.blocked)         { badgeClass = "badge-blocked"; badgeText = "bloqueado"; }
      else if (r.isTracker)  { badgeClass = "badge-tracker"; badgeText = r.category || "rastreador"; }
      else if (r.thirdParty) { badgeClass = "badge-third";   badgeText = "3a parte"; }
      else                   { badgeClass = "badge-first";   badgeText = "1a parte"; }

      return `
        <div class="domain-item">
          <span class="domain-badge ${badgeClass}">${escHtml(badgeText)}</span>
          <span class="domain-name">${escHtml(r.domain)}</span>
          <span class="domain-type">${escHtml(r.type)}</span>
        </div>`;
    })
    .join("");
}

function renderCookies(stats) {
  const list = document.getElementById("cookiesList");

  if (stats.cookies.length === 0) {
    list.innerHTML = '<div class="empty-state">nenhum cookie detectado</div>';
    return;
  }

  list.innerHTML = stats.cookies
    .map(c => {
      const tags = [];
      if (c.thirdParty)  tags.push('<span class="tag tag-3rd">3a parte</span>');
      if (c.supercookie) tags.push('<span class="tag tag-super">super</span>');
      if (c.session)     tags.push('<span class="tag tag-session">sessao</span>');
      else               tags.push('<span class="tag tag-persist">persistente</span>');

      return `
        <div class="cookie-item">
          ${tags.join("")}
          <span class="cookie-name">${escHtml(c.name)}</span>
          <span class="cookie-domain">${escHtml(c.domain)}</span>
        </div>`;
    })
    .join("");
}

function renderScoreDetail(privacy) {
  const container = document.getElementById("scoreDetail");

  if (!privacy.deductions || privacy.deductions.length === 0) {
    container.innerHTML = '<div class="empty-state">nenhuma deducao — pagina limpa</div>';
    return;
  }

  container.innerHTML =
    privacy.deductions
      .map(d => `
        <div class="deduction-item">
          <span>${escHtml(d.reason)}</span>
          <span class="deduction-value">-${d.value}</span>
        </div>`)
      .join("") +
    `<div class="deduction-item deduction-total">
       <strong>pontuacao final</strong>
       <strong style="color:${privacy.color}">${privacy.score}/100 — ${privacy.label}</strong>
     </div>`;
}

// utilitarios

function setupToggle(btnId, targetId) {
  const btn    = document.getElementById(btnId);
  const target = document.getElementById(targetId);
  if (!btn || !target) return;

  btn.addEventListener("click", () => {
    const hidden = target.classList.toggle("hidden");
    btn.textContent = hidden ? "mostrar" : "ocultar";
  });
}

async function setupBlockToggle() {
  const btn    = document.getElementById("btnToggleBlock");
  const status = document.getElementById("blockingStatus");
  const result = await browser.storage.local.get("settings");
  const settings = result.settings || { blockingEnabled: true };

  function updateUI(enabled) {
    status.innerHTML = `Bloqueio: <strong>${enabled ? "Ativo" : "Pausado"}</strong>`;
    btn.textContent  = enabled ? "Pausar" : "Ativar";
    btn.classList.toggle("paused", !enabled);
  }

  updateUI(settings.blockingEnabled !== false);

  btn.addEventListener("click", async () => {
    const r = await browser.storage.local.get("settings");
    const s = r.settings || { blockingEnabled: true, blockTrackers: true, blockCustomList: true };
    s.blockingEnabled = !s.blockingEnabled;
    await browser.storage.local.set({ settings: s });
    updateUI(s.blockingEnabled);
  });
}

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
