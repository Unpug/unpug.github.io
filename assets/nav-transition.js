/* Glides the sidebar from where it was on the last page to where it is on this one.
   It only animates transform, which the browser runs off the main thread, so a busy page can't make it stutter.
   This script has to load in <head>, so its listener is ready before the page first draws. */
(function () {
  'use strict';

  var KEY = 'site-nav-position';
  var GROUP = '::view-transition-group(site-nav)';

  function position() {
    var nav = document.querySelector('nav');
    if (!nav) return null;
    var box = nav.getBoundingClientRect();
    return { x: box.left, y: box.top };
  }

  window.addEventListener('pageswap', function (event) {
    if (!event.viewTransition) return;
    var from = position();
    if (from) sessionStorage.setItem(KEY, JSON.stringify(from));
  });

  window.addEventListener('pagereveal', function (event) {
    var saved = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!event.viewTransition || !saved) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var from = JSON.parse(saved);
    event.viewTransition.ready.then(function () {
      var to = position();
      if (!to) return;
      var settled = getComputedStyle(document.documentElement, GROUP).transform;
      if (settled === 'none') settled = '';
      document.documentElement.animate(
        { transform: ['translate(' + (from.x - to.x) + 'px, ' + (from.y - to.y) + 'px) ' + settled, settled || 'none'] },
        { duration: 550, easing: 'cubic-bezier(.22, 1, .36, 1)', pseudoElement: GROUP }
      );
    });
  });
})();
