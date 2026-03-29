"use strict";

// armazenamento de estatisticas por aba
const tabStats = {};

// helpers

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch (e) {
    return "";
  }
}

function getRootDomain(hostname) {
  const parts = hostname.split(".");
  return parts.length >= 2 ? parts.slice(-2).join(".") : hostname;
}

function isThirdParty(requestDomain, tabDomain) {
  if (!tabDomain || !requestDomain) return false;
  return getRootDomain(requestDomain) !== getRootDomain(tabDomain);
}

function getDefaultStats(url) {
  return {
    url: url || "",
    domain: extractDomain(url || ""),
    thirdPartyRequests: [],
    cookies: [],
    storageItems: [],
    canvasFingerprints: 0,
    hijackingAttempts: [],
    blockedRequests: 0,
    cookieSync: [],
    supercookies: [],
    timestamp: Date.now()
  };
}

function getTabStats(tabId) {
  if (!tabStats[tabId]) {
    tabStats[tabId] = getDefaultStats();
  }
  return tabStats[tabId];
}

// configuracoes

async function getSettings() {
  const result = await browser.storage.local.get("settings");
  return result.settings || {
    blockingEnabled: true,
    blockTrackers: true,
    blockCustomList: true
  };
}

async function getCustomBlockList() {
  const result = await browser.storage.local.get("customBlockList");
  return result.customBlockList || [];
}

// listeners de navegacao

browser.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) return;
  tabStats[details.tabId] = getDefaultStats(details.url);
});

browser.tabs.onRemoved.addListener((tabId) => {
  delete tabStats[tabId];
});

// interceptacao de requisicoes

browser.webRequest.onBeforeRequest.addListener(
  async (details) => {
    if (details.tabId < 0) return {};

    const stats = getTabStats(details.tabId);
    const requestDomain = extractDomain(details.url);
    const tabDomain = stats.domain;
    const thirdParty = isThirdParty(requestDomain, tabDomain);
    const knownTracker = isKnownTracker(requestDomain);
    const trackerCategory = getTrackerCategory(requestDomain);

    const settings = await getSettings();
    const customList = await getCustomBlockList();
    const inCustomList = customList.some(
      (d) => requestDomain === d || requestDomain.endsWith("." + d)
    );

    const shouldBlock =
      settings.blockingEnabled &&
      ((settings.blockTrackers && knownTracker) ||
        (settings.blockCustomList && inCustomList));

    const alreadyTracked = stats.thirdPartyRequests.find(
      (r) => r.domain === requestDomain
    );

    if (shouldBlock) {
      stats.blockedRequests++;
      if (!alreadyTracked) {
        stats.thirdPartyRequests.push({
          url: details.url.substring(0, 120),
          domain: requestDomain,
          type: details.type,
          isTracker: knownTracker,
          category: trackerCategory,
          isCustomBlocked: inCustomList,
          thirdParty: thirdParty,
          blocked: true
        });
      }
      return { cancel: true };
    }

    if (thirdParty && !alreadyTracked) {
      stats.thirdPartyRequests.push({
        url: details.url.substring(0, 120),
        domain: requestDomain,
        type: details.type,
        isTracker: knownTracker,
        category: trackerCategory,
        isCustomBlocked: false,
        thirdParty: true,
        blocked: false
      });
    }

    return {};
  },
  { urls: ["<all_urls>"] },
  ["blocking"]
);

// deteccao de cookies via headers de resposta

browser.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.tabId < 0) return;

    const stats = getTabStats(details.tabId);
    const requestDomain = extractDomain(details.url);
    const thirdParty = isThirdParty(requestDomain, stats.domain);

    for (const header of details.responseHeaders || []) {
      if (header.name.toLowerCase() !== "set-cookie") continue;

      const cookieStr = header.value || "";
      const lower = cookieStr.toLowerCase();

      const isSession =
        !lower.includes("expires=") && !lower.includes("max-age=");

      // supercookie: persistente + httponly + secure + samesite=none
      const isSupercookie =
        !isSession &&
        lower.includes("httponly") &&
        lower.includes("secure") &&
        lower.includes("samesite=none");

      const cookieName = cookieStr.split("=")[0].trim();

      stats.cookies.push({
        name: cookieName,
        domain: requestDomain,
        thirdParty,
        session: isSession,
        supercookie: isSupercookie,
        raw: cookieStr.substring(0, 150)
      });
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

// deteccao de sincronismo de cookies

browser.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (details.tabId < 0) return;

    const stats = getTabStats(details.tabId);
    const requestDomain = extractDomain(details.url);
    const thirdParty = isThirdParty(requestDomain, stats.domain);

    if (!thirdParty) return;

    // cookie enviado no header para dominio de terceiro
    const cookieHeader = (details.requestHeaders || []).find(
      (h) => h.name.toLowerCase() === "cookie"
    );

    if (cookieHeader && cookieHeader.value) {
      const alreadyLogged = stats.cookieSync.find(
        (s) => s.domain === requestDomain && s.type === "headerCookie"
      );
      if (!alreadyLogged) {
        const count = (cookieHeader.value.match(/;/g) || []).length + 1;
        stats.cookieSync.push({
          domain: requestDomain,
          cookieCount: count,
          type: "headerCookie",
          description: `enviando ${count} cookie(s) para dominio de terceiro`
        });
      }
    }

    // parametros de id na url (padrao de cookie sync)
    try {
      const url = new URL(details.url);
      const trackingParams = ["uid", "userid", "user_id", "uuid", "guid", "cid", "client_id", "visitor_id"];
      for (const param of trackingParams) {
        if (url.searchParams.has(param) && url.searchParams.get(param).length > 8) {
          const alreadyLogged = stats.cookieSync.find(
            (s) => s.domain === requestDomain && s.param === param
          );
          if (!alreadyLogged) {
            stats.cookieSync.push({
              domain: requestDomain,
              param,
              type: "urlParam",
              description: `id de rastreamento "${param}" enviado para ${requestDomain}`
            });
          }
          break;
        }
      }
    } catch (e) {}
  },
  { urls: ["<all_urls>"] },
  ["requestHeaders"]
);

// calculo de pontuacao de privacidade

function calculatePrivacyScore(stats) {
  let score = 100;
  const deductions = [];

  const trackerCount = stats.thirdPartyRequests.filter((r) => r.isTracker).length;
  if (trackerCount > 0) {
    const d = Math.min(trackerCount * 5, 35);
    score -= d;
    deductions.push({ reason: `${trackerCount} rastreador(es) conhecido(s)`, value: d });
  }

  const thirdPartyCount = stats.thirdPartyRequests.filter(
    (r) => r.thirdParty && !r.isTracker
  ).length;
  if (thirdPartyCount > 0) {
    const d = Math.min(thirdPartyCount * 2, 15);
    score -= d;
    deductions.push({ reason: `${thirdPartyCount} dominio(s) de terceiro`, value: d });
  }

  const thirdPartyCookies = stats.cookies.filter((c) => c.thirdParty).length;
  if (thirdPartyCookies > 0) {
    const d = Math.min(thirdPartyCookies * 3, 15);
    score -= d;
    deductions.push({ reason: `${thirdPartyCookies} cookie(s) de terceiros`, value: d });
  }

  const supercookieCount = stats.cookies.filter((c) => c.supercookie).length;
  if (supercookieCount > 0) {
    const d = Math.min(supercookieCount * 5, 10);
    score -= d;
    deductions.push({ reason: `${supercookieCount} supercookie(s)`, value: d });
  }

  if (stats.canvasFingerprints > 0) {
    score -= 15;
    deductions.push({ reason: "canvas fingerprinting detectado", value: 15 });
  }

  if (stats.storageItems.length > 0) {
    score -= 5;
    deductions.push({ reason: `html5 storage usado (${stats.storageItems.length} item(s))`, value: 5 });
  }

  if (stats.supercookies.length > 0) {
    score -= 5;
    deductions.push({ reason: `armazenamento persistente avancado (${stats.supercookies.length})`, value: 5 });
  }

  if (stats.cookieSync.length > 0) {
    const d = Math.min(stats.cookieSync.length * 10, 20);
    score -= d;
    deductions.push({ reason: `sincronismo de cookies (${stats.cookieSync.length} dominio(s))`, value: d });
  }

  const highSeverity = stats.hijackingAttempts.filter((h) => h.severity === "high").length;
  const medSeverity = stats.hijackingAttempts.filter((h) => h.severity === "medium").length;
  if (highSeverity > 0) {
    const d = Math.min(highSeverity * 20, 40);
    score -= d;
    deductions.push({ reason: `ameaca de hijacking (alta) x${highSeverity}`, value: d });
  }
  if (medSeverity > 0) {
    const d = Math.min(medSeverity * 10, 20);
    score -= d;
    deductions.push({ reason: `ameaca de hijacking (media) x${medSeverity}`, value: d });
  }

  score = Math.max(0, Math.round(score));

  let label, color;
  if (score >= 80)      { label = "Excelente"; color = "#27ae60"; }
  else if (score >= 60) { label = "Bom";       color = "#f39c12"; }
  else if (score >= 40) { label = "Regular";   color = "#e67e22"; }
  else if (score >= 20) { label = "Ruim";      color = "#e74c3c"; }
  else                  { label = "Critico";   color = "#8e44ad"; }

  return { score, label, color, deductions };
}

// comunicacao com popup e content scripts

browser.runtime.onMessage.addListener((message, sender) => {
  if (message.type === "getTabStats") {
    const stats = getTabStats(message.tabId);
    const privacy = calculatePrivacyScore(stats);
    return Promise.resolve({ ...stats, privacy });
  }

  if (!sender.tab) return;

  const stats = getTabStats(sender.tab.id);

  if (message.type === "storageDetected") {
    const { key, storageType } = message.data;
    const exists = stats.storageItems.find(
      (s) => s.key === key && s.storageType === storageType
    );
    if (!exists) stats.storageItems.push(message.data);
  }

  if (message.type === "canvasFingerprintDetected") {
    stats.canvasFingerprints++;
  }

  if (message.type === "hijackingDetected") {
    const { type, details } = message.data;
    const exists = stats.hijackingAttempts.find(
      (h) => h.type === type && h.details === details
    );
    if (!exists) stats.hijackingAttempts.push(message.data);
  }

  if (message.type === "supercookieDetected") {
    const exists = stats.supercookies.find(
      (s) => s.type === message.data.type && s.name === message.data.name
    );
    if (!exists) stats.supercookies.push(message.data);
  }
});
