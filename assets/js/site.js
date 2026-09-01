(function () {
  // Dark / light mode toggle
  var toggle = document.querySelector('[data-theme-toggle]');
  var root = document.documentElement;
  var theme = matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light';
  root.setAttribute('data-theme', theme);

  function setIcon() {
    if (!toggle) return;
    toggle.setAttribute('aria-label', 'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' mode');
    toggle.innerHTML =
      theme === 'dark'
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  }
  setIcon();
  if (toggle) {
    toggle.addEventListener('click', function () {
      theme = theme === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', theme);
      setIcon();
    });
  }

  // Mobile nav toggle
  var navToggle = document.querySelector('[data-nav-toggle]');
  var navRow = document.querySelector('[data-nav-row]');
  if (navToggle && navRow) {
    navToggle.addEventListener('click', function () {
      var open = navRow.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      navToggle.innerHTML = open
        ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>'
        : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>';
    });
  }

  // Scroll reveal
  var revealEls = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && revealEls.length) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  }

  // Current year in footer
  var yearEl = document.querySelector('[data-year]');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // --- Google Analytics 4 lead events ------------------------------------
  // The base gtag.js tag is loaded in <head> on every page (see
  // build/partials.py). These helpers record the actions that actually
  // represent a lead so they can be marked as key events in GA4.
  function track(eventName, params) {
    if (typeof window.gtag !== 'function') return;
    window.gtag('event', eventName, params || {});
  }

  // --- Meta Pixel lead events --------------------------------------------
  // The base pixel (PageView) loads in <head> when META_PIXEL_ID is set in
  // build/partials.py. These standard events let Meta Ads optimize toward and
  // report real quote requests instead of raw traffic. Guarded on fbq so the
  // site behaves normally when the pixel is absent, blocked, or not yet added.
  function fbTrack(eventName, params) {
    if (typeof window.fbq !== 'function') return;
    window.fbq('track', eventName, params || {});
  }

  // Click-to-call and click-to-email, anywhere on the site.
  document.addEventListener('click', function (e) {
    var link = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!link) return;
    var href = link.getAttribute('href') || '';
    if (href.indexOf('tel:') === 0) {
      track('phone_click', {
        link_url: href,
        page_location: window.location.href
      });
      fbTrack('Contact', { contact_method: 'phone' });
    } else if (href.indexOf('mailto:') === 0) {
      track('email_click', {
        link_url: href,
        page_location: window.location.href
      });
      fbTrack('Contact', { contact_method: 'email' });
    }
  });

  // SMS / contact form consent recordkeeping
  // Stamps the exact time, page, and checkbox state present at submission
  // into hidden fields so a full consent record travels with every lead,
  // whatever backend the form is ultimately wired to.
  var contactForm = document.querySelector('[data-consent-form]');
  if (contactForm) {
    var smsCheckbox = contactForm.querySelector('[data-sms-checkbox]');
    var tsField = contactForm.querySelector('[data-consent-timestamp]');
    var pageField = contactForm.querySelector('[data-consent-page]');
    var stateField = contactForm.querySelector('[data-consent-checked]');
    var statusBox = document.getElementById('form-status');
    var submitBtn = contactForm.querySelector('button[type="submit"]');

    function showStatus(message, isError) {
      if (!statusBox) return;
      statusBox.textContent = message;
      statusBox.style.display = 'block';
      statusBox.style.background = isError ? '#fdecea' : '#eaf6ec';
      statusBox.style.color = isError ? '#8a1f11' : '#1e6b32';
      statusBox.style.border = isError ? '1px solid #f3b4ab' : '1px solid #a8dab5';
    }

    contactForm.addEventListener('submit', function (e) {
      // Stamp the consent record fields at the moment of submission.
      if (tsField) tsField.value = new Date().toISOString();
      if (pageField) pageField.value = window.location.href;
      if (stateField) stateField.value = smsCheckbox && smsCheckbox.checked ? 'yes' : 'no';

      // Submit via fetch so we control the redirect ourselves (relative path),
      // instead of depending on Web3Forms' redirect field, which only honors a
      // target on the same domain the form was submitted from. Falls back to
      // native form submission (and the hidden `redirect` field) if fetch is
      // unavailable for any reason.
      if (typeof fetch !== 'function') return;
      e.preventDefault();
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending…'; }
      if (statusBox) statusBox.style.display = 'none';

      var formData = new FormData(contactForm);
      fetch(contactForm.action, {
        method: 'POST',
        body: formData,
        headers: { Accept: 'application/json' }
      })
        .then(function (response) { return response.json(); })
        .then(function (data) {
          if (data && data.success) {
            // Record the lead in GA4, then move to the thank-you page. The
            // event_callback lets the hit land before navigation; the timer is
            // a fallback so the redirect never stalls if GA is blocked.
            var redirected = false;
            function goToThankYou() {
              if (redirected) return;
              redirected = true;
              window.location.href = 'thank-you.html';
            }
            // Meta's Lead event. Sent before the GA4 hit so it is queued even
            // if the redirect fires quickly; fbq batches its own delivery.
            fbTrack('Lead', { content_name: 'contact_quote_request' });
            if (typeof window.gtag === 'function') {
              window.gtag('event', 'generate_lead', {
                form_name: 'contact_quote_request',
                page_location: window.location.href,
                event_callback: goToThankYou
              });
              window.setTimeout(goToThankYou, 900);
            } else {
              goToThankYou();
            }
          } else {
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Send Request'; }
            showStatus('Something went wrong sending your request. Please call or text 480.789.1844, or email Chris@desertshieldinsurance.com directly.', true);
          }
        })
        .catch(function () {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Send Request'; }
          showStatus('Something went wrong sending your request. Please call or text 480.789.1844, or email Chris@desertshieldinsurance.com directly.', true);
        });
    });
  }
})();
