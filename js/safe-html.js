(function attachSafeHTML(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PolicyChangeSafeHTML = api;
})(typeof globalThis === 'object' ? globalThis : this, function createSafeHTML() {
  'use strict';

  function escapeText(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    })[character]);
  }

  return Object.freeze({ escapeText });
});
