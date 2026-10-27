/* Canonical raster URL resolver for the website and generated Android page. */
(function (root, factory) {
  const media = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = media;
  root.SmartCardsMedia = media;
})(typeof globalThis === 'object' ? globalThis : this, function (root) {
  'use strict';
  const DEFAULT_API_ORIGIN = 'https://cards.artial.dev';

  function origin() {
    const url = new URL(root.SMARTCARDS_API_ORIGIN || DEFAULT_API_ORIGIN);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      throw new TypeError('Invalid SmartCards API origin');
    return url.origin + '/';
  }

  function storagePath(source) {
    let value = source.trim();
    if (value.startsWith('assets/')) return '/api/v1/files/illustrations/web-v1/' + value;
    if (value.startsWith('/assets/')) return '/api/v1/files/illustrations/web-v1' + value;
    if (value.startsWith('trener/img/')) return '/api/v1/files/illustrations/web-v1/' + value;
    if (value.startsWith('img/')) return '/api/v1/files/illustrations/web-v1/trener/' + value;
    if (value.startsWith('/illustrations/')) return '/api/v1/files' + value;
    if (value.startsWith('illustrations/') || value.startsWith('generated/')) return '/api/v1/files/' + value;
    return value;
  }

  function resolve(source) {
    if (typeof source !== 'string' || !source.trim()) return '';
    const value = source.trim();
    if (value.startsWith('<') || /^data:image\/svg\+xml[;,]/i.test(value)) return source;
    // The application logo is a repository-native SVG, rather than a Storage raster.
    if (/^\/?assets\/[^?#]+\.svg(?:[?#]|$)/i.test(value)) return value;
    if (/^https?:\/\//i.test(value)) {
      const absolute = new URL(value);
      if (absolute.pathname.startsWith('/illustrations/') || absolute.pathname.startsWith('/api/v1/files/')
          || absolute.pathname.startsWith('/api/v1/hints/'))
        return new URL(storagePath(absolute.pathname) + absolute.search + absolute.hash, origin()).href;
      return absolute.href;
    }
    if (value.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(value))
      throw new TypeError('Expected a relative Storage image path');
    return new URL(storagePath(value), origin()).href;
  }

  function bind(document) {
    if (!document || typeof document.querySelectorAll !== 'function') return;
    document.querySelectorAll('[data-storage-src]').forEach(element => {
      const url = resolve(element.getAttribute('data-storage-src'));
      if (element.tagName === 'META') element.setAttribute('content', url);
      else element.setAttribute('src', url);
    });
  }
  if (root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', () => bind(root.document));
    else bind(root.document);
  }
  return Object.freeze({ resolve, bind, defaultOrigin: DEFAULT_API_ORIGIN });
});
