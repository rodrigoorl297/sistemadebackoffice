/**
 * SOU + BLU – base href para file://, subpastas e deploy em /public_html.
 * Deve ser o primeiro script no <head> (sem defer).
 */
(function () {
  var h = document.head || document.documentElement;
  if (!h || h.querySelector('base[data-soublu]')) return;
  var b = document.createElement('base');
  b.setAttribute('data-soublu', '1');
  var p = (location.pathname || '').replace(/\\/g, '/');
  var bh;
  if (location.protocol === 'file:') {
    bh = p.indexOf('/pages/') !== -1 ? '../' : './';
  } else {
    var i = p.indexOf('/pages/');
    var bp;
    if (i !== -1) {
      bp = i === 0 ? '/' : p.slice(0, i + 1);
    } else if (!p || p === '/') {
      bp = '/';
    } else if (p.endsWith('/')) {
      bp = p;
    } else {
      var ls = p.lastIndexOf('/');
      var fn = p.slice(ls + 1);
      bp = fn.indexOf('.') !== -1 ? p.slice(0, ls + 1) : p + '/';
    }
    if (bp.charAt(0) !== '/') bp = '/' + bp;
    bh = location.origin + bp;
    if (bh.slice(-1) !== '/') bh += '/';
  }
  b.href = bh;
  h.insertBefore(b, h.firstChild);

  /** Resolve caminho a partir da raiz do app (images/, css/, js/). */
  window.soubluAsset = function (rel) {
    try {
      return new URL(String(rel || '').replace(/^\//, ''), b.href).href;
    } catch (e) {
      return rel;
    }
  };

  function fixLogoImages() {
    document.querySelectorAll('img[data-soublu-logo], img[src*="images/logo"]').forEach(function (img) {
      var raw = img.getAttribute('data-soublu-logo') || img.getAttribute('src') || 'images/logo.png';
      if (raw.indexOf('logo') === -1) return;
      var rel = raw.replace(/^\.\.\//, '');
      img.src = window.soubluAsset(rel);
      img.onerror = function () {
        if (this.dataset.fallbackDone) return;
        this.dataset.fallbackDone = '1';
        this.src = window.soubluAsset('images/logo.png');
      };
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fixLogoImages);
  } else {
    fixLogoImages();
  }
})();
