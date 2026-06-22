/**
 * skip-account.js
 * Shared auth + saved-calculations module for Skip the Surprise.
 *
 * Uses Supabase passwordless email OTP (no magic-link redirects).
 * Safe to include on any page: fails gracefully if CDN is blocked.
 *
 * Exports on window.SkipAccount:
 *   currentUser()
 *   sendCode(email)
 *   verifyCode(email, code)
 *   signOut()
 *   saveCalculation({ calculator, title, inputs, results })
 *   listMyCalculations()
 *   deleteCalculation(id)
 *   openAuthModal(onSuccess)
 *   closeAuthModal()
 */

(function () {
  'use strict';

  var SUPABASE_URL = 'https://eiarfecnutloupdyapkx.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_XdYrFxZbr8qyf-K2_NUf4g_nmyJT8tS';

  var _client = null;
  var _authModalSuccessCallback = null;
  var _pendingEmail = '';

  /* ------------------------------------------------------------------
     Supabase client -- lazy-init so CDN failures are caught gracefully
  ------------------------------------------------------------------ */
  function getClient() {
    if (_client) return _client;
    try {
      if (typeof window.supabase === 'undefined' || typeof window.supabase.createClient !== 'function') {
        throw new Error('Supabase SDK not loaded');
      }
      _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      return _client;
    } catch (e) {
      console.warn('[SkipAccount] Supabase client unavailable:', e.message);
      return null;
    }
  }

  /* ------------------------------------------------------------------
     Auth helpers
  ------------------------------------------------------------------ */
  function currentUser() {
    var client = getClient();
    if (!client) return null;
    try {
      var session = client.auth.session ? client.auth.session() : null;
      if (session && session.user) return session.user;
      // v2 API
      var stored = client.auth.getSession ? null : null;
      return null;
    } catch (e) {
      return null;
    }
  }

  function getSessionAsync() {
    return new Promise(function (resolve) {
      var client = getClient();
      if (!client) return resolve(null);
      try {
        // Supabase JS v2
        if (client.auth.getSession) {
          client.auth.getSession().then(function (res) {
            resolve(res && res.data && res.data.session ? res.data.session : null);
          }).catch(function () { resolve(null); });
        } else {
          // v1 fallback
          resolve(client.auth.session ? client.auth.session() : null);
        }
      } catch (e) {
        resolve(null);
      }
    });
  }

  function getUserAsync() {
    return getSessionAsync().then(function (session) {
      return session ? session.user : null;
    });
  }

  function sendCode(email) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Auth service unavailable'));
    return client.auth.signInWithOtp({ email: email, options: { shouldCreateUser: true } })
      .then(function (res) {
        if (res.error) throw res.error;
        return res;
      });
  }

  function verifyCode(email, code) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Auth service unavailable'));
    return client.auth.verifyOtp({ email: email, token: code, type: 'email' })
      .then(function (res) {
        if (res.error) throw res.error;
        // Upsert profile row
        var user = res.data && res.data.user ? res.data.user : null;
        if (user) {
          upsertProfile(user);
        }
        return res;
      });
  }

  function signOut() {
    var client = getClient();
    if (!client) return Promise.resolve();
    return client.auth.signOut().then(function () {
      updateNavAccountLink();
    }).catch(function () {});
  }

  function upsertProfile(user) {
    var client = getClient();
    if (!client || !user) return;
    try {
      client.from('skip_profiles').upsert(
        { user_id: user.id, email: user.email },
        { onConflict: 'user_id' }
      ).then(function () {}).catch(function () {});
    } catch (e) {}
  }

  /* ------------------------------------------------------------------
     Saved calculations
  ------------------------------------------------------------------ */
  function saveCalculation(opts) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Service unavailable'));
    return getUserAsync().then(function (user) {
      if (!user) return Promise.reject(new Error('Not signed in'));
      return client.from('skip_saved_calculations').insert({
        user_id: user.id,
        calculator: opts.calculator || 'unknown',
        title: opts.title || 'Saved calculation',
        inputs: opts.inputs || {},
        results: opts.results || {}
      }).then(function (res) {
        if (res.error) throw res.error;
        return res;
      });
    });
  }

  function listMyCalculations() {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Service unavailable'));
    return getUserAsync().then(function (user) {
      if (!user) return Promise.reject(new Error('Not signed in'));
      return client
        .from('skip_saved_calculations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .then(function (res) {
          if (res.error) throw res.error;
          return res.data || [];
        });
    });
  }

  function deleteCalculation(id) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Service unavailable'));
    return getUserAsync().then(function (user) {
      if (!user) return Promise.reject(new Error('Not signed in'));
      return client
        .from('skip_saved_calculations')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)
        .then(function (res) {
          if (res.error) throw res.error;
          return res;
        });
    });
  }

  /* ------------------------------------------------------------------
     Auth modal
  ------------------------------------------------------------------ */
  var MODAL_ID = 'skip-auth-modal';

  function injectModalStyles() {
    if (document.getElementById('skip-auth-modal-styles')) return;
    var style = document.createElement('style');
    style.id = 'skip-auth-modal-styles';
    style.textContent = [
      '.skip-modal-backdrop{position:fixed;inset:0;background:rgba(17,24,39,0.6);z-index:9000;display:flex;align-items:center;justify-content:center;padding:1rem;}',
      '.skip-modal{background:#fff;border-radius:16px;padding:2rem;max-width:420px;width:100%;box-shadow:0 20px 50px rgba(0,0,0,0.18);position:relative;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
      '.skip-modal-close{position:absolute;top:1rem;right:1rem;background:none;border:none;font-size:1.3rem;color:#9ca3af;cursor:pointer;line-height:1;padding:0.25rem 0.5rem;border-radius:6px;}',
      '.skip-modal-close:hover{background:#f3f4f6;color:#374151;}',
      '.skip-modal-title{font-size:1.2rem;font-weight:700;color:#111827;margin-bottom:0.4rem;}',
      '.skip-modal-sub{font-size:0.875rem;color:#6b7280;margin-bottom:1.5rem;line-height:1.5;}',
      '.skip-modal-label{display:block;font-size:0.8rem;font-weight:600;color:#374151;margin-bottom:0.35rem;}',
      '.skip-modal-input{width:100%;padding:0.65rem 0.85rem;border:1.5px solid #d1d5db;border-radius:8px;font-size:0.95rem;font-family:inherit;color:#111827;outline:none;box-sizing:border-box;transition:border-color 0.15s;}',
      '.skip-modal-input:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,0.1);}',
      '.skip-modal-input.error{border-color:#dc2626;box-shadow:0 0 0 3px rgba(220,38,38,0.1);}',
      '.skip-modal-error{font-size:0.78rem;color:#dc2626;margin-top:0.35rem;min-height:1.1em;font-weight:500;}',
      '.skip-modal-btn{width:100%;margin-top:1rem;padding:0.8rem 1.5rem;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:0.95rem;font-weight:600;font-family:inherit;cursor:pointer;transition:background 0.15s;}',
      '.skip-modal-btn:hover{background:#1e4976;}',
      '.skip-modal-btn:disabled{background:#9ca3af;cursor:not-allowed;}',
      '.skip-modal-back{background:none;border:none;color:#2563eb;font-size:0.82rem;font-weight:600;font-family:inherit;cursor:pointer;padding:0;margin-top:0.75rem;}',
      '.skip-modal-back:hover{text-decoration:underline;}',
      '.skip-modal-hint{font-size:0.78rem;color:#9ca3af;margin-top:0.5rem;text-align:center;}'
    ].join('');
    document.head.appendChild(style);
  }

  function buildModal() {
    injectModalStyles();
    var backdrop = document.createElement('div');
    backdrop.id = MODAL_ID;
    backdrop.className = 'skip-modal-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-label', 'Sign in to Skip the Surprise');

    backdrop.innerHTML = [
      '<div class="skip-modal">',
        '<button class="skip-modal-close" aria-label="Close" id="skip-modal-close-btn">&#x2715;</button>',
        '<div id="skip-auth-step1">',
          '<div class="skip-modal-title">Save your results</div>',
          '<p class="skip-modal-sub">Enter your email and we will send you a 6-digit code. No password needed.</p>',
          '<label class="skip-modal-label" for="skip-auth-email">Email address</label>',
          '<input class="skip-modal-input" type="email" id="skip-auth-email" placeholder="you@example.com" autocomplete="email"/>',
          '<div class="skip-modal-error" id="skip-auth-email-error"></div>',
          '<button class="skip-modal-btn" id="skip-auth-send-btn">Send code</button>',
          '<p class="skip-modal-hint">We will only use your email to save your calculations.</p>',
        '</div>',
        '<div id="skip-auth-step2" style="display:none;">',
          '<div class="skip-modal-title">Check your email</div>',
          '<p class="skip-modal-sub" id="skip-auth-step2-sub">Enter the 6-digit code we sent.</p>',
          '<label class="skip-modal-label" for="skip-auth-code">6-digit code</label>',
          '<input class="skip-modal-input" type="text" id="skip-auth-code" placeholder="123456" maxlength="6" inputmode="numeric" autocomplete="one-time-code"/>',
          '<div class="skip-modal-error" id="skip-auth-code-error"></div>',
          '<button class="skip-modal-btn" id="skip-auth-verify-btn">Verify and save</button>',
          '<button class="skip-modal-back" id="skip-auth-back-btn">Use a different email</button>',
        '</div>',
      '</div>'
    ].join('');

    document.body.appendChild(backdrop);

    // Close on backdrop click
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) closeAuthModal();
    });

    document.getElementById('skip-modal-close-btn').addEventListener('click', closeAuthModal);

    // Escape key
    document.addEventListener('keydown', handleModalEscape);

    // Step 1: send code
    document.getElementById('skip-auth-send-btn').addEventListener('click', function () {
      var email = document.getElementById('skip-auth-email').value.trim();
      var errEl = document.getElementById('skip-auth-email-error');
      var input = document.getElementById('skip-auth-email');
      errEl.textContent = '';
      input.classList.remove('error');

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errEl.textContent = 'Please enter a valid email address.';
        input.classList.add('error');
        return;
      }

      var btn = document.getElementById('skip-auth-send-btn');
      btn.disabled = true;
      btn.textContent = 'Sending...';
      _pendingEmail = email;

      sendCode(email).then(function () {
        document.getElementById('skip-auth-step1').style.display = 'none';
        var step2 = document.getElementById('skip-auth-step2');
        step2.style.display = '';
        document.getElementById('skip-auth-step2-sub').textContent =
          'We sent a code to ' + email + '. Check your inbox (and spam folder).';
        document.getElementById('skip-auth-code').focus();
      }).catch(function (err) {
        errEl.textContent = err.message || 'Could not send code. Please try again.';
        btn.disabled = false;
        btn.textContent = 'Send code';
      });
    });

    // Step 2: verify
    document.getElementById('skip-auth-verify-btn').addEventListener('click', function () {
      var code = document.getElementById('skip-auth-code').value.trim();
      var errEl = document.getElementById('skip-auth-code-error');
      var input = document.getElementById('skip-auth-code');
      errEl.textContent = '';
      input.classList.remove('error');

      if (!code || code.length < 6) {
        errEl.textContent = 'Enter the 6-digit code from your email.';
        input.classList.add('error');
        return;
      }

      var btn = document.getElementById('skip-auth-verify-btn');
      btn.disabled = true;
      btn.textContent = 'Verifying...';

      verifyCode(_pendingEmail, code).then(function () {
        closeAuthModal();
        updateNavAccountLink();
        if (typeof _authModalSuccessCallback === 'function') {
          _authModalSuccessCallback();
          _authModalSuccessCallback = null;
        }
      }).catch(function (err) {
        var msg = err.message || 'Invalid or expired code. Please try again.';
        if (msg.toLowerCase().indexOf('expired') !== -1 || msg.toLowerCase().indexOf('invalid') !== -1) {
          msg = 'That code is invalid or expired. Request a new one.';
        }
        errEl.textContent = msg;
        input.classList.add('error');
        btn.disabled = false;
        btn.textContent = 'Verify and save';
      });
    });

    // Enter key in code field
    document.getElementById('skip-auth-code').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') document.getElementById('skip-auth-verify-btn').click();
    });
    document.getElementById('skip-auth-email').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') document.getElementById('skip-auth-send-btn').click();
    });

    // Back button
    document.getElementById('skip-auth-back-btn').addEventListener('click', function () {
      document.getElementById('skip-auth-step2').style.display = 'none';
      document.getElementById('skip-auth-step1').style.display = '';
      document.getElementById('skip-auth-send-btn').disabled = false;
      document.getElementById('skip-auth-send-btn').textContent = 'Send code';
      document.getElementById('skip-auth-email-error').textContent = '';
      document.getElementById('skip-auth-code-error').textContent = '';
      document.getElementById('skip-auth-code').value = '';
    });
  }

  function handleModalEscape(e) {
    if (e.key === 'Escape') closeAuthModal();
  }

  function openAuthModal(onSuccess) {
    if (typeof onSuccess === 'function') {
      _authModalSuccessCallback = onSuccess;
    }
    var existing = document.getElementById(MODAL_ID);
    if (existing) {
      existing.style.display = 'flex';
      // Reset to step 1
      var s1 = document.getElementById('skip-auth-step1');
      var s2 = document.getElementById('skip-auth-step2');
      if (s1) s1.style.display = '';
      if (s2) s2.style.display = 'none';
      var sendBtn = document.getElementById('skip-auth-send-btn');
      if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Send code'; }
      return;
    }
    buildModal();
  }

  function closeAuthModal() {
    var modal = document.getElementById(MODAL_ID);
    if (modal) modal.style.display = 'none';
    document.removeEventListener('keydown', handleModalEscape);
  }

  /* ------------------------------------------------------------------
     Nav account link -- adds/updates "Account" link in nav if present
  ------------------------------------------------------------------ */
  function updateNavAccountLink() {
    getUserAsync().then(function (user) {
      var existing = document.getElementById('skip-nav-account-link');
      var navLinks = document.querySelector('.nav-links');
      if (!navLinks) return;

      if (user) {
        if (!existing) {
          var tag = navLinks.tagName.toLowerCase();
          if (tag === 'ul') {
            var li = document.createElement('li');
            li.innerHTML = '<a id="skip-nav-account-link" href="/account/" style="color:var(--blue-600,#2563eb);font-weight:600;" aria-label="My saved calculations">My Account</a>';
            navLinks.appendChild(li);
          } else {
            var a = document.createElement('a');
            a.id = 'skip-nav-account-link';
            a.href = '/account/';
            a.className = 'nav-link';
            a.setAttribute('aria-label', 'My saved calculations');
            a.style.color = 'var(--blue-600,#2563eb)';
            a.style.fontWeight = '600';
            a.textContent = 'My Account';
            navLinks.appendChild(a);
          }
        } else {
          existing.href = '/account/';
          existing.textContent = 'My Account';
        }
      } else {
        if (existing && existing.parentElement) {
          var parent = existing.parentElement;
          // If parent is a li, remove the li; otherwise remove the a itself
          if (parent.tagName.toLowerCase() === 'li') {
            parent.parentElement && parent.parentElement.removeChild(parent);
          } else {
            parent.removeChild(existing);
          }
        }
      }
    });
  }

  /* ------------------------------------------------------------------
     Init: set up auth state listener, update nav
  ------------------------------------------------------------------ */
  function init() {
    var client = getClient();
    if (!client) return;

    // Listen for auth state changes
    try {
      if (client.auth.onAuthStateChange) {
        client.auth.onAuthStateChange(function (event) {
          if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
            updateNavAccountLink();
          }
        });
      }
    } catch (e) {}

    // Initial nav update
    updateNavAccountLink();
  }

  // Run init after DOM + Supabase SDK are ready
  function waitForSupabaseAndInit() {
    if (typeof window.supabase !== 'undefined' && typeof window.supabase.createClient === 'function') {
      init();
    } else {
      setTimeout(waitForSupabaseAndInit, 150);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForSupabaseAndInit);
  } else {
    waitForSupabaseAndInit();
  }

  /* ------------------------------------------------------------------
     Public API
  ------------------------------------------------------------------ */
  window.SkipAccount = {
    currentUser: currentUser,
    getUserAsync: getUserAsync,
    sendCode: sendCode,
    verifyCode: verifyCode,
    signOut: signOut,
    saveCalculation: saveCalculation,
    listMyCalculations: listMyCalculations,
    deleteCalculation: deleteCalculation,
    openAuthModal: openAuthModal,
    closeAuthModal: closeAuthModal
  };

})();
