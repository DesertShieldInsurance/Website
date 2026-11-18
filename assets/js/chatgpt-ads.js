(function () {
  'use strict';

  var PIXEL_ID = 'UrshoiaEUbeeuP85R9NV8T';
  var RECEIPT = 'dsi_chatgpt_quote_receipt_v1';
  var RECEIPT_AGE_MS = 120000;
  var CONFIRMATION = '/thank-you.html';
  var FRAME = '/chatgpt-quote-measurement.html';

  function optedOut() {
    return navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1';
  }

  function attribution(params) {
    var attrib = {};
    var click = params.get('oppref');
    if (click && click.trim() && click.length <= 2048 && !/[\u0000-\u001f\u007f<>]/.test(click)) {
      attrib.oppref = click;
    }
    // Preserve a matching Ads Manager test session across the quote and confirmation pages.
    var test = params.get('oaiq_test_session_id');
    if (params.get('oaiq_test_pixel_id') === PIXEL_ID && /^[A-Za-z0-9_-]{1,128}$/.test(test || '')) {
      attrib.oaiq_test_session_id = test;
      attrib.oaiq_test_pixel_id = PIXEL_ID;
    }
    return attrib;
  }

  function recordAcceptedQuote(id) {
    try {
      sessionStorage.removeItem(RECEIPT);
      if (optedOut()) return;
      var params = attribution(new URLSearchParams(location.search));
      if (!params.oppref && !params.oaiq_test_session_id) return;
      sessionStorage.setItem(RECEIPT, JSON.stringify({ id: id, at: Date.now(), params: params }));
    } catch (_) { /* Restricted storage or tracking must not disrupt a quote. */ }
  }

  function readReceipt(consume) {
    var receipt = JSON.parse(sessionStorage.getItem(RECEIPT));
    if (consume) sessionStorage.removeItem(RECEIPT);
    if (!receipt || !/^(?:[a-f0-9-]{36}|lead-\d+)$/.test(receipt.id) ||
        !Number.isFinite(receipt.at) || receipt.at > Date.now() ||
        Date.now() - receipt.at > RECEIPT_AGE_MS) return null;
    var params = attribution(new URLSearchParams(receipt.params));
    if (!params.oppref && !params.oaiq_test_session_id) return null;
    return { id: receipt.id, params: params };
  }

  function measure() {
    if (window.parent === window || window.parent.location.pathname !== CONFIRMATION) return;
    var receipt = readReceipt(true);
    if (!receipt || optedOut()) return;

    // Give the official SDK its documented URL-based attribution input in a
    // form-free document with no Google/Meta tags. No attribution goes on
    // the actual thank-you URL or into the frame's initial HTTP request.
    history.replaceState(null, '', FRAME + '?' + new URLSearchParams(receipt.params));
    var queue = function () { queue.q.push(arguments); };
    queue.q = [];
    window.oaiq = queue;
    queue('init', { pixelId: PIXEL_ID });
    queue('measure', 'lead_created', { type: 'customer_action' }, { event_id: receipt.id, opt_out: true });
    var sdk = document.createElement('script');
    sdk.async = true;
    sdk.src = 'https://bzrcdn.openai.com/sdk/oaiq.min.js';
    document.head.appendChild(sdk);
  }

  try {
    if (location.pathname === FRAME) {
      measure();
    } else if (location.pathname === CONFIRMATION) {
      if (window.parent !== window || optedOut() || !readReceipt(false)) return;
      var frame = document.createElement('iframe');
      frame.src = FRAME;
      frame.referrerPolicy = 'no-referrer';
      frame.hidden = true;
      frame.title = 'Ad conversion measurement';
      document.body.appendChild(frame);
    } else {
      window.dsiChatGptAds = { recordAcceptedQuote: recordAcceptedQuote };
    }
  } catch (_) { /* Measurement never changes the confirmation flow. */ }
})();
