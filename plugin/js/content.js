"use strict";

// executa no contexto da pagina (document_start)
// detecta: canvas fingerprint, html5 storage, hijacking, supercookies

(function () {

  if (window.__privacyGuardInjected) return;
  window.__privacyGuardInjected = true;

  // helper para enviar mensagem ao background
  function send(type, data) {
    try {
      browser.runtime.sendMessage({ type, data });
    } catch (e) {}
  }

  // canvas fingerprinting
  // detecta quando a pagina usa o canvas para gerar uma impressao digital

  let canvasReported = false;

  function reportCanvas() {
    if (canvasReported) return;
    canvasReported = true;
    send("canvasFingerprintDetected", { url: window.location.href });
  }

  const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function (...args) {
    reportCanvas();
    return origToDataURL.apply(this, args);
  };

  const origToBlob = HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob = function (...args) {
    reportCanvas();
    return origToBlob.apply(this, args);
  };

  // leitura de pixels indica fingerprint
  const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData = function (...args) {
    reportCanvas();
    return origGetImageData.apply(this, args);
  };

  // html5 storage (localstorage e sessionstorage)

  const origSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    const storageType = this === localStorage ? "localStorage" : "sessionStorage";
    send("storageDetected", {
      key,
      value: String(value).substring(0, 120),
      storageType,
      url: window.location.href
    });
    return origSetItem.apply(this, [key, value]);
  };

  // leitura de itens ja existentes apos dom carregar
  window.addEventListener("DOMContentLoaded", () => {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        send("storageDetected", {
          key,
          value: (localStorage.getItem(key) || "").substring(0, 120),
          storageType: "localStorage",
          existing: true,
          url: window.location.href
        });
      }
    } catch (e) {}

    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (!key) continue;
        send("storageDetected", {
          key,
          value: (sessionStorage.getItem(key) || "").substring(0, 120),
          storageType: "sessionStorage",
          existing: true,
          url: window.location.href
        });
      }
    } catch (e) {}
  });

  // supercookies via armazenamento avancado

  if (window.indexedDB && window.indexedDB.open) {
    const origIDBOpen = window.indexedDB.open.bind(window.indexedDB);
    window.indexedDB.open = function (name, version) {
      send("supercookieDetected", {
        type: "IndexedDB",
        name: String(name),
        url: window.location.href
      });
      return origIDBOpen(name, version);
    };
  }

  if (window.caches && window.caches.open) {
    const origCacheOpen = window.caches.open.bind(window.caches);
    window.caches.open = function (name) {
      send("supercookieDetected", {
        type: "Cache API",
        name: String(name),
        url: window.location.href
      });
      return origCacheOpen(name);
    };
  }

  // deteccao de hijacking e hooks maliciosos

  function reportHijacking(type, details, severity) {
    send("hijackingDetected", { type, details, severity });
  }

  // monitora scripts injetados dinamicamente no dom
  function checkScript(node) {
    const src = (node.src || "").toLowerCase();
    if (!src) return;

    // padroes tipicos de beef hook
    if (
      src.includes("hook.js") ||
      src.includes("/beef") ||
      src.includes("beefhook") ||
      (src.includes("/hook") && src.endsWith(".js"))
    ) {
      reportHijacking(
        "BeEF Hook Script",
        `script suspeito detectado: ${node.src.substring(0, 100)}`,
        "high"
      );
    }

    // scripts carregando de portas nao-padrao
    try {
      const url = new URL(node.src);
      const port = parseInt(url.port);
      const suspiciousPorts = [3000, 4444, 6789, 8080, 8888, 1234, 9090, 31337];
      if (port && suspiciousPorts.includes(port)) {
        reportHijacking(
          "Script em Porta Suspeita",
          `script carregando da porta ${port}: ${node.src.substring(0, 100)}`,
          "medium"
        );
      }
    } catch (e) {}
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeName === "SCRIPT") checkScript(node);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("script[src]").forEach(checkScript);
  });

  // eval com codigo extenso indica ofuscacao
  const origEval = window.eval;
  window.eval = function (code) {
    if (typeof code === "string" && code.length > 500) {
      reportHijacking(
        "eval() Suspeito",
        `chamada eval() com ${code.length} caracteres detectada`,
        "medium"
      );
    }
    return origEval.call(this, code);
  };
  Object.defineProperty(window.eval, "toString", {
    value: () => "function eval() { [native code] }"
  });

  // websocket para dominios ou portas suspeitas (beef usa websocket)
  if (window.WebSocket) {
    const OrigWS = window.WebSocket;
    window.WebSocket = function (url, protocols) {
      try {
        const wsUrl = new URL(url);
        const port = parseInt(wsUrl.port);
        const suspiciousPorts = [3000, 4444, 6789, 8880, 9999, 31337];
        const pageDomain = window.location.hostname;

        if (port && suspiciousPorts.includes(port)) {
          reportHijacking(
            "WebSocket em Porta Suspeita",
            `websocket para porta ${port}: ${url.substring(0, 100)}`,
            "high"
          );
        } else if (
          wsUrl.hostname &&
          wsUrl.hostname !== pageDomain &&
          wsUrl.hostname !== "localhost" &&
          wsUrl.hostname !== "127.0.0.1"
        ) {
          reportHijacking(
            "WebSocket Cross-Domain",
            `websocket conectando a dominio externo: ${wsUrl.hostname}`,
            "low"
          );
        }
      } catch (e) {}

      return protocols !== undefined
        ? new OrigWS(url, protocols)
        : new OrigWS(url);
    };
    window.WebSocket.prototype = OrigWS.prototype;
    window.WebSocket.CONNECTING = OrigWS.CONNECTING;
    window.WebSocket.OPEN = OrigWS.OPEN;
    window.WebSocket.CLOSING = OrigWS.CLOSING;
    window.WebSocket.CLOSED = OrigWS.CLOSED;
  }

  // manipulacao de document.domain (tecnica classica de xss)
  try {
    const domainDesc =
      Object.getOwnPropertyDescriptor(Document.prototype, "domain") ||
      Object.getOwnPropertyDescriptor(HTMLDocument.prototype, "domain");

    if (domainDesc && domainDesc.set) {
      Object.defineProperty(document, "domain", {
        configurable: true,
        get: domainDesc.get,
        set: function (value) {
          reportHijacking(
            "Manipulacao de document.domain",
            `document.domain alterado para: ${value}`,
            "medium"
          );
          domainDesc.set.call(this, value);
        }
      });
    }
  } catch (e) {}

  // iframes ocultos indicam possivel clickjacking
  window.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("iframe").forEach((iframe) => {
      const style = window.getComputedStyle(iframe);
      const isHidden =
        style.opacity === "0" ||
        style.visibility === "hidden" ||
        parseInt(style.width) < 2 ||
        parseInt(style.height) < 2;

      if (isHidden && iframe.src) {
        reportHijacking(
          "iframe Oculto",
          `iframe oculto apontando para: ${iframe.src.substring(0, 100)}`,
          "medium"
        );
      }
    });
  });

})();
