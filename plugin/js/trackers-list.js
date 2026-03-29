"use strict";

// lista de rastreadores conhecidos, organizados por categoria
// baseada em easyprivacy e disconnect.me

const TRACKERS = {

  // rastreadores de anuncios (advertising)
  advertising: [
    "doubleclick.net",
    "googlesyndication.com",
    "googleadservices.com",
    "googletagservices.com",
    "amazon-adsystem.com",
    "media.net",
    "criteo.com",
    "appnexus.com",
    "adnxs.com",
    "pubmatic.com",
    "rubiconproject.com",
    "openx.net",
    "turn.com",
    "xaxis.com",
    "casalemedia.com",
    "adsrvr.org",
    "taboola.com",
    "outbrain.com",
    "sovrn.com",
    "sharethrough.com",
    "adform.net",
    "advertising.com",
    "zedo.com",
    "mathtag.com",
    "33across.com",
    "conversantmedia.com",
    "mookie1.com",
    "specificclick.net",
    "yieldmanager.com",
    "adtech.de",
    "oath.com",
    "verizonmedia.com"
  ],

  // rastreadores de analytics
  analytics: [
    "google-analytics.com",
    "googletagmanager.com",
    "hotjar.com",
    "mixpanel.com",
    "segment.io",
    "segment.com",
    "amplitude.com",
    "chartbeat.com",
    "parsely.com",
    "comscore.com",
    "scorecardresearch.com",
    "quantserve.com",
    "pingdom.net",
    "newrelic.com",
    "nr-data.net",
    "omtrdc.net",
    "2o7.net",
    "fullstory.com",
    "mouseflow.com",
    "crazyegg.com",
    "optimizely.com",
    "heap.io",
    "logrocket.com"
  ],

  // rastreadores de redes sociais (social)
  social: [
    "connect.facebook.net",
    "facebook.com",
    "fbcdn.net",
    "graph.facebook.com",
    "analytics.twitter.com",
    "static.ads-twitter.com",
    "ads.twitter.com",
    "t.co",
    "addthis.com",
    "sharethis.com",
    "disqus.com"
  ],

  // rastreadores de marketing e crm
  marketing: [
    "hubspot.com",
    "hs-analytics.net",
    "hs-scripts.com",
    "hsforms.net",
    "marketo.net",
    "mktoresp.com",
    "eloqua.com",
    "pardot.com",
    "intercom.io",
    "intercomcdn.com"
  ],

  // rastreadores de dados e fingerprinting
  data: [
    "demdex.net",
    "bluekai.com",
    "exelator.com",
    "krxd.net",
    "lotame.com",
    "liveramp.com",
    "eyeota.net",
    "doubleverify.com",
    "adsafeprotected.com",
    "moatads.com",
    "acuityplatform.com",
    "nexac.com",
    "everesttech.net"
  ]

};

// lista plana com todos os dominios de todas as categorias
const ALL_TRACKERS = Object.values(TRACKERS).flat();

// retorna a categoria de um dominio, ou null se nao for rastreador
function getTrackerCategory(domain) {
  if (!domain) return null;
  const d = domain.toLowerCase();
  for (const [category, list] of Object.entries(TRACKERS)) {
    if (list.some(t => d === t || d.endsWith("." + t))) {
      return category;
    }
  }
  return null;
}

// verifica se um dominio e rastreador conhecido
function isKnownTracker(domain) {
  return getTrackerCategory(domain) !== null;
}
