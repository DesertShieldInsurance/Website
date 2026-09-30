(function () {
  'use strict';
  // Campaign identifiers only. Never copy form answers, URL fragments or PII.
  var keys = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term',
    'gclid','gbraid','wbraid','campaign_id','adgroup_id','keyword','matchtype','network'];
  var storageKey = 'dsi_campaign_attribution_v1';
  var data = {};
  try {
    var cookie = document.cookie.split('; ').find(function (item) { return item.indexOf(storageKey + '=') === 0; });
    var saved = JSON.parse(cookie ? decodeURIComponent(cookie.slice(storageKey.length + 1)) : '{}');
    if (saved.captured_at && Date.now() - Date.parse(saved.captured_at) < 30 * 86400000) data = saved;
  } catch (_) { /* Attribution never prevents quoting in restricted browsers. */ }
  var search = new URLSearchParams(location.search);
  var incoming = {};
  keys.forEach(function (key) {
    var value = search.get(key);
    if (value && value.length <= 250 && !/[\u0000-\u001f<>]/.test(value)) incoming[key] = value;
  });
  if (Object.keys(incoming).length) {
    data = incoming;
    data.captured_at = new Date().toISOString();
    data.landing_path = location.pathname;
    try {
      var encoded = encodeURIComponent(JSON.stringify(data));
      // Session-only first-party cookie, not a persistent customer identifier.
      if (encoded.length <= 3500) document.cookie = storageKey + '=' + encoded + '; Path=/; SameSite=Lax' +
        (location.protocol === 'https:' ? '; Secure' : '');
    } catch (_) {}
  }
  window.dsiAttribution = {
    get: function () { return JSON.parse(JSON.stringify(data)); },
    addToForm: function (form) {
      Object.keys(data).forEach(function (key) {
        var name = 'attribution_' + key;
        var input = form.querySelector('input[name="' + name + '"]');
        if (!input) { input = document.createElement('input'); input.type = 'hidden'; input.name = name; form.append(input); }
        input.value = data[key];
      });
    }
  };
})();
