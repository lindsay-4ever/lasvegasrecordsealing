// Lead source: remembers where a visitor came from (an ad campaign, a search,
// social media, another website, or directly), so it can be saved with their
// lead if they submit the eligibility form.
//
// - Stays in this browser (localStorage) and goes only to our own database
//   with the form. It is never sent to Google, Meta or anyone else.
// - Keeps the most recent arrival that wasn't direct, for up to 90 days, so a
//   visitor who clicks an ad and comes back later still counts as that ad.
// - Saves campaign labels (utm_*), the referring site's domain and the first
//   page they landed on. Ad platforms' click IDs are used only to recognize a
//   paid click and are not saved.
//
// Paid ads must be tagged for their campaigns to show (see supabase/SETUP.md,
// "Lead source"). Google Ads clicks are recognized as paid even untagged.
(function () {
  'use strict';
  var KEY = 'lvrs_source';
  var MAX_AGE_DAYS = 90;
  var UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var SEARCH = /(^|\.)(google|bing|yahoo|duckduckgo|ecosia|yandex|baidu|startpage|qwant|aol|ask)\.|(^|\.)search\.brave\.com$/;
  var SOCIAL = /(^|\.)(facebook\.com|fb\.com|fb\.me|instagram\.com|threads\.net|t\.co|x\.com|twitter\.com|linkedin\.com|lnkd\.in|tiktok\.com|youtube\.com|youtu\.be|reddit\.com|pinterest\.com|nextdoor\.com|snapchat\.com)$/;
  var SOCIAL_SOURCE = /^(facebook|fb|meta|instagram|ig|threads|tiktok|twitter|x|linkedin|youtube|reddit|pinterest|nextdoor|snapchat)$/i;
  var PAID_MEDIUM = /^(cpc|ppc|paid|paid[_ -]?search|paid[_ -]?social|paidsocial|cpm|cpv|display|banner|ads?|sem|retargeting|remarketing)$/i;

  function clip(v, n) { v = (v == null ? '' : String(v)).trim(); return v ? v.slice(0, n) : null; }
  function host(url) { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { return ''; } }

  function classify(p, ref) {
    var medium = (p.utm_medium || '').toLowerCase();
    var source = (p.utm_source || '').toLowerCase();
    // Google Ads (auto-tagging) and Microsoft Ads click IDs always mean a paid search click.
    if (p.gclid || p.gbraid || p.wbraid || p.gad_source || p.msclkid) return 'paid_search';
    if (PAID_MEDIUM.test(medium)) {
      if (/social/.test(medium) || SOCIAL_SOURCE.test(source)) return 'paid_social';
      if (/^(cpm|cpv|display|banner)$/.test(medium)) return 'paid_other';
      if (/google|bing|microsoft|yahoo|duckduckgo/.test(source) || /search|cpc|ppc|sem/.test(medium)) return 'paid_search';
      return 'paid_other';
    }
    if (medium === 'email' || medium === 'newsletter') return 'email';
    if (/social/.test(medium) || (SOCIAL_SOURCE.test(source) && medium !== 'organic')) return 'organic_social';
    if (medium === 'organic') return 'organic_search';
    if (ref && SEARCH.test(ref)) return 'organic_search';
    if (ref && SOCIAL.test(ref)) return 'organic_social';
    if (p.fbclid) return 'organic_social';   // a Facebook/Instagram link without ad tags
    if (ref || source) return 'referral';
    return 'direct';
  }

  function read() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && s.source_seen_at && (Date.now() - Date.parse(s.source_seen_at)) / 864e5 <= MAX_AGE_DAYS) return s;
    } catch (e) { /* storage unavailable */ }
    return null;
  }

  function capture() {
    var q = new URLSearchParams(location.search);
    var p = {};
    UTM.concat(['gclid', 'gbraid', 'wbraid', 'gad_source', 'msclkid', 'fbclid']).forEach(function (k) { var v = q.get(k); if (v) p[k] = v; });
    var ref = host(document.referrer);
    var self = location.hostname.toLowerCase().replace(/^www\./, '');
    if (ref === self) ref = '';                 // moving between our own pages isn't a new arrival
    var channel = classify(p, ref);
    var touch = {
      source_channel: channel,
      utm_source: clip(p.utm_source, 150) || (p.gclid || p.gbraid || p.wbraid || p.gad_source ? 'google' : p.msclkid ? 'bing' : null),
      utm_medium: clip(p.utm_medium, 150),
      utm_campaign: clip(p.utm_campaign, 150),
      utm_content: clip(p.utm_content, 150),
      utm_term: clip(p.utm_term, 150),
      referrer_domain: clip(ref, 253),
      landing_page: clip(location.pathname, 300),
      source_seen_at: new Date().toISOString(),
    };
    if (channel !== 'direct' || !read()) {
      try { localStorage.setItem(KEY, JSON.stringify(touch)); } catch (e) { /* storage unavailable */ }
    }
    return touch;
  }

  var current = capture();
  // The eligibility form calls this when it saves a lead.
  window.lvrsLeadSource = function () { return read() || current; };
})();
