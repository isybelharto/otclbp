(function () {
  'use strict';

  function showPortalError(message) {
    const content = document.querySelector('.content');
    if (!content || content.dataset.errorShown === 'true') return;
    content.dataset.errorShown = 'true';
    content.innerHTML = '<div class="notice"><h2>Corporate Client portal could not be loaded</h2><p>'
      + String(message || 'Please refresh the page and sign in again.').replace(/[&<>"\']/g, function (value) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[value];
      })
      + '</p><p><button class="btn btn-primary" type="button" id="portal-retry">Reload portal</button></p></div>';
    const retry = document.getElementById('portal-retry');
    if (retry) retry.onclick = function () { window.location.reload(); };
  }

  window.addEventListener('error', function (event) {
    if (event.target && event.target !== window) return;
    window.setTimeout(function () { showPortalError(event.message); }, 0);
  });
  window.addEventListener('unhandledrejection', function (event) {
    const reason = event.reason && event.reason.message ? event.reason.message : 'An unexpected portal error occurred.';
    window.setTimeout(function () { showPortalError(reason); }, 0);
  });
})();
