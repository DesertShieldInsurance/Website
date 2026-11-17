'use strict';
// Quick quote option for the client intake page.
// Four simple questions submitted through the same Web3Forms inbox used by the
// short quote pages. The detailed secure intake (app.js) is unchanged and is
// still reached with #trucking, #personal or #business.
(function () {
  var FULL = ['trucking', 'personal', 'business'];
  var ACCESS_KEY = 'd0034898-1f7a-4f92-9621-72331a834350';
  var ENDPOINT = 'https://api.web3forms.com/submit';
  var SMS_LANGUAGE = 'By checking this box, I agree to receive SMS/text messages from Desert Shield Insurance LLC at the mobile number provided, including messages related to my inquiry, quotes, account, services, and follow-up communications. Message frequency may vary. Message and data rates may apply. Reply STOP to opt out and HELP for help. Consent is not a condition of purchase.';
  var FAIL = 'Something went wrong sending your request. Please call or text 480.789.1844, or email Chris@desertshieldinsurance.com directly.';
  var $ = function (id) { return document.getElementById(id); };

  function setMode(mode) {
    var quick = mode === 'quick';
    $('quickPanel').hidden = !quick;
    $('quickNote').hidden = !quick;
    $('fullPanel').hidden = quick;
    $('fullControls').hidden = quick;
    $('modeQuick').setAttribute('aria-pressed', String(quick));
    $('modeFull').setAttribute('aria-pressed', String(!quick));
    document.title = (quick ? 'Quick Quote' : 'Client Intake') + ' | Desert Shield Insurance';
  }
  function modeFromHash() {
    return FULL.indexOf(location.hash.slice(1)) >= 0 ? 'full' : 'quick';
  }
  function goFull() {
    var t = ($('formType') && FULL.indexOf($('formType').value) >= 0) ? $('formType').value : 'trucking';
    if (location.hash.slice(1) === t) setMode('full'); else location.hash = t;
  }

  document.addEventListener('DOMContentLoaded', function () {
    setMode(modeFromHash());
    addEventListener('hashchange', function () { setMode(modeFromHash()); });
    $('modeQuick').onclick = function () {
      history.replaceState(null, '', location.pathname + location.search + '#quick');
      setMode('quick');
    };
    $('modeFull').onclick = goFull;
    $('quickToFull').onclick = function (e) { e.preventDefault(); goFull(); };

    var form = $('quickForm'), box = $('quickStatus'), btn = $('quickSubmit');
    var types = form.querySelector('.quote-types');
    function show(msg, ok) { box.textContent = msg; box.className = 'quick-status' + (ok ? ' ok' : ''); box.hidden = false; }
    form.addEventListener('change', function () { if (form.querySelector('[name=quote_type]:checked')) types.classList.remove('invalid'); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      box.hidden = true;
      var name = $('qName'), phone = $('qPhone'), email = $('qEmail');
      var picked = Array.prototype.map.call(form.querySelectorAll('[name=quote_type]:checked'), function (c) { return c.value; });
      var errors = [];
      [name, phone, email].forEach(function (i) { i.removeAttribute('aria-invalid'); });
      if (!name.value.trim()) { errors.push('Enter a business or insured name.'); name.setAttribute('aria-invalid', 'true'); }
      if (phone.value.replace(/\D/g, '').length < 10) { errors.push('Enter a 10-digit phone number.'); phone.setAttribute('aria-invalid', 'true'); }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) { errors.push('Enter a valid email address.'); email.setAttribute('aria-invalid', 'true'); }
      if (!picked.length) { errors.push('Check at least one type of quote.'); types.classList.add('invalid'); }
      if (errors.length) { show(errors.join(' ')); var bad = form.querySelector('[aria-invalid=true]'); if (bad) bad.focus(); return; }

      var leadId = window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'lead-' + Date.now();
      var sms = $('qSms').checked;
      var fd = new FormData();
      fd.append('access_key', ACCESS_KEY);
      fd.append('subject', 'New quick quote request (' + picked.join(', ') + ') — Desert Shield Insurance');
      fd.append('from_name', 'Desert Shield Insurance Website');
      fd.append('botcheck', form.querySelector('[name=botcheck]').value);
      fd.append('insured_name', name.value.trim());
      fd.append('name', name.value.trim());
      fd.append('phone', phone.value.trim());
      fd.append('email', email.value.trim());
      fd.append('quote_types', picked.join(', '));
      fd.append('topic', picked.join(', '));
      fd.append('lead_type', 'quick_quote');
      fd.append('form_source', 'client-intake quick quote');
      fd.append('quote_request_id', leadId);
      fd.append('sms_opt_in', sms ? 'yes' : 'no');
      fd.append('sms_checkbox_checked', sms ? 'yes' : 'no');
      fd.append('sms_consent_language', SMS_LANGUAGE);
      fd.append('consent_timestamp', new Date().toISOString());
      fd.append('consent_page_url', location.origin + location.pathname);
      if (window.dsiAttribution) {
        var a = window.dsiAttribution.get();
        Object.keys(a).forEach(function (k) { fd.append('attribution_' + k, a[k]); });
      }

      btn.disabled = true; btn.textContent = 'Sending…';
      fetch(ENDPOINT, { method: 'POST', body: fd, headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data || !data.success) throw new Error('rejected');
          try {
            document.cookie = 'dsi_lead_success=' + encodeURIComponent(leadId) +
              '; Path=/; SameSite=Lax; Max-Age=120' + (location.protocol === 'https:' ? '; Secure' : '');
          } catch (_) {}
          show('Thanks — your request was sent. Chris will contact you shortly.', true);
          location.href = '/thank-you.html';
        })
        .catch(function () { btn.disabled = false; btn.textContent = 'Request my quote'; show(FAIL); });
    });
  });
})();
