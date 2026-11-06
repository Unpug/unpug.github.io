/* The figures on the Current page are videos rendered from _render/figures.js.
   Each one plays only while it's near the screen. The numbers beside them follow the video. */
(function () {
  'use strict';

  var STILL = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (STILL) return;

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        var playing = entry.target.play();
        if (playing) playing.catch(function () {});
      } else {
        entry.target.pause();
      }
    });
  }, { rootMargin: '25% 0px' });
  document.querySelectorAll('.fig video').forEach(function (video) { observer.observe(video); });

  function fmt(n) { return n.toLocaleString('en-US'); }
  function figure(name) { return document.querySelector('[data-fig="' + name + '"]'); }

  function follow(name, update) {
    var video = figure(name).querySelector('video'), last = null;
    video.addEventListener('timeupdate', function () {
      var key = update.key(video.currentTime);
      if (key !== last) { last = key; update.show(key); }
    });
  }

  /* Matches the step timing in figures.pipeline. */
  var steps = figure('pipeline').querySelectorAll('.steps li');
  follow('pipeline', {
    key: function (t) { return t < 4 ? 0 : t < 8 ? 1 : t < 12 ? 2 : 3; },
    show: function (step) { steps.forEach(function (li, i) { li.classList.toggle('on', i === step); }); }
  });

  /* The counts were recorded while rendering, frame for frame. */
  fetch('media/tracks.json').then(function (r) { return r.json(); }).then(function (tracks) {
    var points = figure('flicker').querySelector('[data-points]'), voxels = figure('flicker').querySelector('[data-voxels]');
    follow('flicker', {
      key: function (t) { return Math.min(tracks.flicker.length - 1, Math.floor(t * 3.2)); },
      show: function (i) { points.textContent = fmt(tracks.flicker[i][0]); voxels.textContent = fmt(tracks.flicker[i][1]); }
    });
    var coverage = figure('drone').querySelector('[data-coverage]');
    follow('drone', {
      key: function (t) { return Math.min(tracks.drone.length - 1, Math.floor(t / 0.32)); },
      show: function (i) { coverage.textContent = fmt(tracks.drone[i]) + ' voxels mapped so far.'; }
    });
  }).catch(function () {});
})();
