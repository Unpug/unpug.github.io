/* The figure beside the presentation. Each slide sets a scene; the figure moves smoothly between them. */
(function () {
  'use strict';

  var canvas = document.querySelector('.love-stage canvas');
  var ctx = canvas.getContext('2d');
  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  var original = document.querySelector('.original');
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var INK = '#1a1a1a', GRAY = '#a8a29e', RED = '#b3261e', FAINT = '#d6d3d1', TEXT = '#57534e';
  var W = 0, H = 0, time = 0, scene = 0, progress = 0;

  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(t) { return t * t * (3 - 2 * t); }

  /* Small seeded generator, so both people look the same on every visit. */
  function rng(seed) {
    var s = seed;
    return function () {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
  }
  function gaussianFrom(r) { return Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r()); }

  /* ── People: tiled regions with holes ── */
  var N = 11;
  function person(seed, side, holeKeys) {
    var r = rng(seed), phase = r() * 6.28, cells = [], map = {};
    for (var x = 0; x < N; x++) {
      for (var y = 0; y < N; y++) {
        var dx = x - (N - 1) / 2, dy = y - (N - 1) / 2, a = Math.atan2(dy, dx);
        var limit = 4.15 + 0.85 * Math.sin(3 * a + phase) + 0.45 * Math.sin(5 * a + phase * 2) + (r() - 0.5) * 0.5;
        if (Math.sqrt(dx * dx + dy * dy) <= limit) {
          var cell = { x: x, y: y, shade: 0.82 + r() * 0.18, order: r(), towardOther: side * dx };
          cells.push(cell);
          map[x + ',' + y] = cell;
        }
      }
    }
    var ranked = cells.slice().sort(function (a, b) { return b.towardOther - a.towardOther; });
    ranked.forEach(function (c, i) { c.seen = i / ranked.length; });
    return { cells: cells, map: map, holes: holeKeys.map(function (k) { return map[k]; }).filter(Boolean) };
  }
  var A = person(7, 1, ['6,4', '4,6', '7,6']);
  var B = person(31, -1, ['4,5', '6,6']);
  /* The tiles B gives in the exchange, one per event. */
  var GIFTS = ['3,6', '5,3', '6,4'].map(function (k) { return B.map[k]; }).filter(Boolean);

  function layout(p) {
    var unit = Math.min(W * 0.46, H * 0.62) / N * p.scale;
    var size = unit * N;
    var mid = W / 2;
    return {
      unit: unit, size: size,
      ax: mid - p.sep * W * 0.5 - size / 2,
      bx: mid + p.sep * W * 0.5 - size / 2,
      y: H * p.centerY - size / 2
    };
  }
  function cellPos(L, who, c) {
    return { x: (who === A ? L.ax : L.bx) + c.x * L.unit, y: L.y + c.y * L.unit };
  }

  /* ── Scene values the figure eases between ── */
  var DEFAULTS = {
    people: 1, sep: 0.5, scale: 1, centerY: 0.5, otherFade: 1, reveal: 1, holes: 0, cover: 0,
    exchange: 0, timeline: 0, field: 0, specific: 0, fan: 0, past: 1, future: 1, narrow: 0,
    effort: 0, away: 0, balance: 0, noise: 0, action: 0, history: 0
  };
  var SCENES = [
    { sep: 0.58 },
    { sep: 0.52, holes: 0.5 },
    { sep: 0.52, otherFade: 0.14 },
    { sep: 0.52, holes: 1, otherFade: 0.14 },
    { sep: 0.42, holes: 1, exchange: 1 },
    { sep: 0.42, holes: 1, exchange: 1, timeline: 1, centerY: 0.42 },
    { sep: 0.52, scale: 0.78, holes: 0.4, field: 1, otherFade: 0.2 },
    { sep: 0.52, scale: 0.78, holes: 0.4, field: 1, specific: 1 },
    { people: 0, fan: 1 },
    { people: 0, fan: 1, future: 0 },
    { sep: 0.46, cover: 1, holes: 0.4 },
    { sep: 0.46, cover: 1, holes: 0.4, history: 1, centerY: 0.42 },
    { people: 0, fan: 1, past: 0.35 },
    { people: 0, fan: 1, narrow: 1 },
    { sep: 0.52, scale: 0.72, effort: 1, holes: 0.5 },
    { sep: 0.52, scale: 0.72, effort: 1, away: 1, holes: 0.5 },
    { sep: 0.52, scale: 0.72, balance: 1, holes: 0.5, centerY: 0.42 },
    { people: 0, noise: 1 },
    { sep: 0.3, scale: 0.98, holes: 0.25 },
    { people: 0 },
    { people: 0, action: 1 }
  ];
  var now = {};
  Object.keys(DEFAULTS).forEach(function (k) { now[k] = SCENES[0][k] !== undefined ? SCENES[0][k] : DEFAULTS[k]; });

  /* ── Drawing helpers ── */
  /* Writes "E_AB" with AB as a true subscript. */
  function label(text, x, y, opts) {
    opts = opts || {};
    var size = opts.size || 16, style = (opts.italic ? 'italic ' : '') + '500 ';
    var parts = text.split(/_([A-Za-z,]+)/);
    function font(sub) { ctx.font = style + (sub ? size * 0.72 : size) + 'px "Cormorant Garamond", serif'; }
    var width = 0;
    parts.forEach(function (part, i) { font(i % 2); width += ctx.measureText(part).width; });
    var align = opts.align || 'center';
    var cursor = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
    ctx.fillStyle = opts.color || TEXT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    parts.forEach(function (part, i) {
      font(i % 2);
      ctx.fillText(part, cursor, y + (i % 2 ? size * 0.26 : 0));
      cursor += ctx.measureText(part).width;
    });
  }
  function arrow(x1, y1, x2, y2, color, width) {
    var a = Math.atan2(y2 - y1, x2 - x1), h = 5 + width * 1.5;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2 - Math.cos(a) * h * 0.6, y2 - Math.sin(a) * h * 0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - Math.cos(a - 0.45) * h, y2 - Math.sin(a - 0.45) * h);
    ctx.lineTo(x2 - Math.cos(a + 0.45) * h, y2 - Math.sin(a + 0.45) * h);
    ctx.closePath();
    ctx.fill();
  }

  /* ── The exchange: tiles from B travel into A's holes ── */
  var CYCLE = 3.6;
  function exchangeState(t) {
    var count = Math.min(GIFTS.length, A.holes.length);
    var total = count * CYCLE + 1.5;
    var u = t % total, event = Math.floor(u / CYCLE);
    if (event >= count) return { done: count, moving: -1, m: 0, count: count, total: total, u: u };
    var m = clamp(((u % CYCLE) - 0.4) / 1.8, 0, 1);
    return { done: event, moving: event, m: ease(m), count: count, total: total, u: u };
  }

  function drawPeople(p) {
    if (p.people < 0.01) return;
    var L = layout(p);
    var ex = exchangeState(time);
    var useExchange = p.exchange > 0.5;
    var kappa = lerp(0.18, 1, ease(progress));
    var gap = Math.max(0.5, L.unit * 0.05);

    function drawOne(who, alpha) {
      who.cells.forEach(function (c) {
        var pos = cellPos(L, who, c);
        var s = L.unit - gap;
        var isHole = who.holes.indexOf(c) >= 0;
        var gift = GIFTS.indexOf(c);
        var filled = isHole;
        var given = false;

        if (useExchange && who === A && isHole) {
          var i = A.holes.indexOf(c);
          filled = i >= ex.done;
          if (i === ex.moving) filled = true;
          if (i < ex.done) { ctx.globalAlpha = alpha * p.people; ctx.fillStyle = GRAY; ctx.fillRect(pos.x, pos.y, s, s); return; }
        }
        if (useExchange && who === B && gift >= 0) given = gift < ex.done || gift === ex.moving;

        if ((isHole && filled) || given) {
          var strength = given ? 1 : p.holes;
          ctx.globalAlpha = alpha * p.people;
          if (strength < 0.99) {
            ctx.fillStyle = who === A ? INK : GRAY;
            ctx.globalAlpha = alpha * p.people * c.shade * (1 - strength);
            ctx.fillRect(pos.x, pos.y, s, s);
          }
          var pulse = 0.72 + 0.28 * Math.sin(time * 1.8 + c.x);
          ctx.globalAlpha = alpha * p.people * strength * pulse;
          ctx.strokeStyle = RED;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(pos.x + 1, pos.y + 1, s - 2, s - 2);
          return;
        }

        var visible = who === B && p.cover > 0.01 ? (c.seen <= kappa ? 1 : 1 - p.cover) : 1;
        ctx.globalAlpha = alpha * p.people * c.shade;
        if (visible > 0.02) {
          ctx.fillStyle = who === A ? INK : GRAY;
          ctx.globalAlpha = alpha * p.people * c.shade * visible;
          ctx.fillRect(pos.x, pos.y, s, s);
        }
        if (visible < 0.98) {
          ctx.globalAlpha = alpha * p.people * (1 - visible);
          ctx.strokeStyle = FAINT;
          ctx.lineWidth = 1;
          ctx.strokeRect(pos.x + 0.5, pos.y + 0.5, s - 1, s - 1);
        }
      });
      ctx.globalAlpha = 1;
    }
    drawOne(A, 1);
    drawOne(B, p.otherFade);

    /* The tile in flight, on a gentle arc. */
    if (useExchange && ex.moving >= 0 && ex.m > 0 && ex.m < 1) {
      var from = cellPos(L, B, GIFTS[ex.moving]), to = cellPos(L, A, A.holes[ex.moving]);
      var x = lerp(from.x, to.x, ex.m), y = lerp(from.y, to.y, ex.m) - Math.sin(ex.m * Math.PI) * L.unit * 2.5;
      ctx.globalAlpha = p.exchange * p.people;
      ctx.fillStyle = GRAY;
      ctx.fillRect(x, y, L.unit - gap, L.unit - gap);
      ctx.globalAlpha = 1;
    }

    ctx.globalAlpha = p.people;
    label('A', L.ax + L.size / 2, L.y + L.size + 18, { size: 19, italic: true, color: INK });
    ctx.globalAlpha = p.people * p.otherFade;
    label('B', L.bx + L.size / 2, L.y + L.size + 18, { size: 19, italic: true, color: INK });
    ctx.globalAlpha = 1;

    if (p.timeline > 0.01) drawTimeline(p, L, ex);
    if (p.field > 0.01) drawField(p, L);
    if (p.cover > 0.01) {
      ctx.globalAlpha = p.cover;
      label('κ_A(B) = ' + kappa.toFixed(2), L.bx + L.size / 2, L.y - 16, { size: 18, color: INK });
      ctx.globalAlpha = 1;
    }
    if (p.history > 0.01) drawHistory(p, L);
    if (p.effort > 0.01) drawEffort(p, L);
    if (p.balance > 0.01) drawBalance(p, L);
  }

  function drawTimeline(p, L, ex) {
    var y = L.y + L.size + 60, x0 = W * 0.14, x1 = W * 0.86;
    ctx.globalAlpha = p.timeline;
    ctx.strokeStyle = FAINT;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    var span = (x1 - x0) / ex.total;
    for (var i = 0; i < ex.count; i++) {
      var a = x0 + (i * CYCLE + 0.4) * span, b = x0 + (i * CYCLE + 2.2) * span;
      ctx.strokeStyle = i <= ex.done - 1 || i === ex.moving ? RED : GRAY;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(a, y); ctx.lineTo(b, y); ctx.stroke();
      label('P' + (i + 1), (a + b) / 2, y + 17, { size: 15 });
    }
    var tx = x0 + ex.u * span;
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.arc(tx, y, 3.5, 0, 6.3); ctx.fill();
    label('t', tx, y - 14, { size: 16, italic: true, color: INK });
    ctx.globalAlpha = 1;
  }

  var PULLS = (function () {
    var r = rng(11), list = [];
    for (var i = 0; i < 11; i++) list.push({ angle: 1.05 + (i / 10) * 4.2 + (r() - 0.5) * 0.2, reach: 0.72 + r() * 0.32, phase: r() * 6.3, size: 0.8 + r() * 0.8 });
    return list;
  })();
  function drawField(p, L) {
    var cx = L.ax + L.size / 2, cy = L.y + L.size / 2, R = Math.max(L.size * 0.56, 40);
    ctx.globalAlpha = p.field;
    PULLS.forEach(function (f) {
      var ang = f.angle + Math.sin(time * 0.25 + f.phase) * 0.04;
      var far = R + Math.min(W, H) * 0.12 * f.reach + Math.sin(time * 0.6 + f.phase) * 6;
      arrow(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R, cx + Math.cos(ang) * far, cy + Math.sin(ang) * far, GRAY, 1);
      ctx.fillStyle = GRAY;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(ang) * (far + 7), cy + Math.sin(ang) * (far + 7), 2.5 * f.size, 0, 6.3);
      ctx.fill();
    });
    ctx.globalAlpha = p.specific;
    if (p.specific > 0.01) {
      arrow(L.ax + L.size + 2, cy, L.bx - 4, cy, RED, 2);
      label('f_A,B', W / 2, cy - 15, { size: 17, color: RED, italic: true });
    }
    ctx.globalAlpha = 1;
  }

  function drawHistory(p, L) {
    var y = L.y + L.size + 62, x0 = W * 0.14, x1 = W * 0.86;
    var shown = Math.round(lerp(1, 12, ease(progress)));
    ctx.globalAlpha = p.history;
    ctx.strokeStyle = FAINT;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    for (var i = 0; i < 12; i++) {
      var x = lerp(x0, x1, (i + 0.5) / 12);
      ctx.fillStyle = i < shown ? INK : FAINT;
      ctx.fillRect(x - 4, y - 4, 8, 8);
    }
    label('H_A,B(t): the relational history so far', W / 2, y + 22, { size: 16 });
    ctx.globalAlpha = 1;
  }

  function drawEffort(p, L) {
    var cy = L.y + L.size / 2, ax = L.ax + L.size + 2, bx = L.bx - 2, mid = (ax + bx) / 2;
    var pulse = 1 + 0.06 * Math.sin(time * 1.5);
    ctx.globalAlpha = p.effort;
    arrow(ax, cy, ax + (mid - ax - 5) * pulse * 0.96, cy, RED, 2.5);
    arrow(bx, cy, bx - (bx - mid - 5) * pulse * 0.96, cy, RED, 2.5);
    label('E_A', (ax + mid) / 2, cy - 15, { size: 17, color: RED, italic: true });
    label('E_B', (bx + mid) / 2, cy - 15, { size: 17, color: RED, italic: true });
    if (p.away > 0.01) {
      ctx.globalAlpha = p.away;
      [-0.4, 0.4].forEach(function (d) {
        var y = cy + d * L.size;
        arrow(L.ax - 3, y, Math.max(6, L.ax - L.size * 0.28), y, INK, 1.5);
        arrow(L.bx + L.size + 3, y, Math.min(W - 6, L.bx + L.size + L.size * 0.28), y, INK, 1.5);
      });
      label('D_A', Math.max(20, L.ax - 12), cy, { size: 17, italic: true, color: INK });
      label('D_B', Math.min(W - 20, L.bx + L.size + 12), cy, { size: 17, italic: true, color: INK });
    }
    ctx.globalAlpha = 1;
  }

  function balanceValues() {
    return { E: 1, D: 1 + 0.5 * Math.sin(time * 0.55) };
  }
  function drawBalance(p, L) {
    var v = balanceValues(), y = L.y + L.size + 62, mid = W / 2, scale = W * 0.2;
    ctx.globalAlpha = p.balance;
    ctx.fillStyle = RED;
    ctx.fillRect(mid - 8 - v.E * scale, y - 5, v.E * scale, 10);
    ctx.fillStyle = INK;
    ctx.fillRect(mid + 8, y - 5, v.D * scale, 10);
    label('E_AB', mid - 8 - v.E * scale - 4, y + 19, { size: 17, italic: true, color: RED, align: 'left' });
    label('D_AB', mid + 8 + v.D * scale + 4, y + 19, { size: 17, italic: true, color: INK, align: 'right' });
    var holds = v.E >= v.D;
    label(holds ? 'E_AB ≥ D_AB: pulled together' : 'E_AB < D_AB: drifting apart', mid, y + 43, { size: 17, color: holds ? RED : INK });
    ctx.globalAlpha = 1;
  }

  /* ── Past and future: one fixed path, many possible ones ── */
  var FAN = (function () {
    var r = rng(5), past = [], paths = [], v = 0;
    for (var i = 0; i <= 60; i++) { v += gaussianFrom(r) * 0.016; past.push(v); }
    var start = v;
    for (var k = 0; k < 26; k++) {
      var path = [0], w = 0;
      for (var j = 1; j <= 60; j++) { w += gaussianFrom(r) * 0.015; path.push(w); }
      paths.push(path);
    }
    return { past: past, paths: paths, start: start };
  })();
  function drawFan(p) {
    if (p.fan < 0.01) return;
    var cy = H * 0.5, split = W * 0.46, xl = W * 0.06, xr = W * 0.95, vs = H * 0.55;
    var kappa = 1;
    if (p.narrow > 0.01) kappa = lerp(1, 0.14 + 0.86 * (0.5 + 0.5 * Math.sin(time * 0.5)), p.narrow);
    /* Var is proportional to 1/kappa, so the spread goes as 1/sqrt(kappa). */
    var spread = p.narrow > 0.01 ? lerp(1, 0.55 / Math.sqrt(kappa), p.narrow) : 1;
    var nowY = cy - FAN.start * vs * 0.6;

    ctx.globalAlpha = p.fan;
    ctx.strokeStyle = FAINT;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(split, H * 0.12); ctx.lineTo(split, H * 0.86); ctx.stroke();
    ctx.setLineDash([]);
    label('past', (xl + split) / 2, H * 0.92, { size: 17 });
    label('now', split, H * 0.08, { size: 17, color: INK, italic: true });
    label('future', (split + xr) / 2, H * 0.92, { size: 17 });

    ctx.globalAlpha = p.fan * p.future;
    ctx.lineWidth = 1;
    ctx.strokeStyle = RED;
    FAN.paths.forEach(function (path) {
      ctx.globalAlpha = p.fan * p.future * 0.3;
      ctx.beginPath();
      path.forEach(function (val, i) {
        var x = lerp(split, xr, i / 60), y = nowY - val * vs * spread;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });

    ctx.globalAlpha = p.fan * p.past;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    FAN.past.forEach(function (val, i) {
      var x = lerp(xl, split, i / 60), y = cy - val * vs * 0.6;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.arc(split, nowY, 3.5, 0, 6.3); ctx.fill();

    if (p.narrow > 0.5) {
      ctx.globalAlpha = p.fan * p.narrow;
      label('κ_A(B) = ' + kappa.toFixed(2), (split + xr) / 2, H * 0.08, { size: 18, color: RED });
    }
    ctx.globalAlpha = 1;
  }

  /* ── Closeness with noise: dx = (E − D) dt + σ dW ── */
  var noisePaths = [], noiseClock = 0;
  function resetNoise() {
    noisePaths = [];
    for (var i = 0; i < 6; i++) noisePaths.push([0]);
    noiseClock = 0;
  }
  resetNoise();
  function stepNoise(dt) {
    var mu = 0.14, sigma = 0.11, h = 1 / 90;
    noiseClock += dt;
    var steps = Math.min(4, Math.round(dt * 90) || 1);
    for (var s = 0; s < steps; s++) {
      if (noisePaths[0].length > 500) { resetNoise(); return; }
      noisePaths.forEach(function (path) {
        var last = path[path.length - 1];
        path.push(last + mu * h + sigma * Math.sqrt(h) * gaussianFrom(Math.random));
      });
    }
  }
  function drawNoise(p) {
    if (p.noise < 0.01) return;
    var x0 = W * 0.08, x1 = W * 0.94, base = H * 0.72, top = H * 0.12, T = 500 / 90, muScale = (base - top) / (0.14 * T * 1.45);
    ctx.globalAlpha = p.noise;
    ctx.strokeStyle = FAINT;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, base); ctx.lineTo(x1, base); ctx.moveTo(x0, base); ctx.lineTo(x0, top); ctx.stroke();
    label('t', x1, base + 16, { size: 17, italic: true });
    label('x_AB', x0 + 4, top - 12, { size: 17, italic: true, align: 'left' });

    ctx.strokeStyle = GRAY;
    ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.moveTo(x0, base); ctx.lineTo(x1, base - 0.14 * T * muScale); ctx.stroke();
    ctx.setLineDash([]);
    label('expected drift, when effort outweighs pressure', (x0 + x1) / 2, H * 0.86, { size: 16 });

    noisePaths.forEach(function (path, k) {
      ctx.strokeStyle = k === 0 ? RED : INK;
      ctx.globalAlpha = p.noise * (k === 0 ? 1 : 0.28);
      ctx.lineWidth = k === 0 ? 1.8 : 1;
      ctx.beginPath();
      path.forEach(function (v, i) {
        var x = lerp(x0, x1, i / 500), y = clamp(base - v * muScale, 8, H - 8);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  /* ── The promise: a wandering path relaxing to the minimizer of the action ──
     Discretized action: sum ½|Δx|²/h + V(x)·h, with both ends fixed. D(t) and E_us(t) don't depend on
     x, so they shift the action's value but not the minimizer. V is a Gaussian well at x_you. */
  var M = 70, H_STEP = 1 / (M - 1);
  var YOU = [0.78, 0.36], START = [0.12, 0.8];
  var path = null, relaxed = 0, walker = 0;
  function resetAction() {
    path = [];
    var r = rng(19);
    var modes = [[0.2, 2], [0.14, 3], [0.1, 5], [0.05, 8]].map(function (m) { return [m[0], m[1], r() * 6.3, r() * 6.3]; });
    for (var i = 0; i < M; i++) {
      var t = i / (M - 1), env = Math.sin(Math.PI * t);
      var wx = 0, wy = 0;
      modes.forEach(function (m) {
        wx += m[0] * Math.sin(m[1] * Math.PI * t + m[2]);
        wy += m[0] * Math.sin(m[1] * Math.PI * t + m[3]);
      });
      path.push([lerp(START[0], YOU[0], t) + wx * env, lerp(START[1], YOU[1], t) + wy * env]);
    }
    relaxed = 0;
    walker = 0;
  }
  resetAction();
  function gradV(q) {
    var dx = q[0] - YOU[0], dy = q[1] - YOU[1], s2 = 0.05, e = 6 * Math.exp(-(dx * dx + dy * dy) / (2 * s2));
    return [e * dx / s2, e * dy / s2];
  }
  function relaxStep() {
    var lr = 0.0006, change = 0;
    var next = path.map(function (q) { return [q[0], q[1]]; });
    for (var i = 1; i < M - 1; i++) {
      var g = gradV(path[i]);
      for (var d = 0; d < 2; d++) {
        var grad = (2 * path[i][d] - path[i - 1][d] - path[i + 1][d]) / H_STEP + g[d] * H_STEP;
        next[i][d] = path[i][d] - lr * grad;
        change += Math.abs(lr * grad);
      }
    }
    path = next;
    return change / M;
  }
  function drawAction(p, dt) {
    if (p.action < 0.01) return;
    if (p.action > 0.8) {
      var moved = 0;
      for (var k = 0; k < 14; k++) moved = relaxStep();
      if (moved < 0.00025) relaxed = Math.min(1, relaxed + dt * 0.8);
      if (relaxed >= 1) walker = Math.min(1, walker + dt / 4);
    }
    function pt(q) { return [W * 0.06 + q[0] * W * 0.88, H * 0.06 + q[1] * H * 0.86]; }
    ctx.globalAlpha = p.action;

    /* The well, as faint contour rings around x_you. */
    var you = pt(YOU);
    for (var ring = 1; ring <= 4; ring++) {
      ctx.strokeStyle = FAINT;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(you[0], you[1], ring * Math.min(W, H) * 0.055, 0, 6.3);
      ctx.stroke();
    }

    ctx.strokeStyle = RED;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    path.forEach(function (q, i) {
      var c = pt(q);
      if (i === 0) ctx.moveTo(c[0], c[1]); else ctx.lineTo(c[0], c[1]);
    });
    ctx.stroke();

    var size = Math.min(W, H) * 0.046;
    var start = pt(START);
    ctx.fillStyle = FAINT;
    ctx.beginPath(); ctx.arc(start[0], start[1], 3.5, 0, 6.3); ctx.fill();
    label('x(t₀)', start[0], start[1] + 17, { size: 16, italic: true });

    /* You, and the tile of me that arrives to sit beside you. */
    ctx.fillStyle = GRAY;
    ctx.fillRect(you[0] + 1, you[1] - size / 2, size, size);
    label('you', you[0] + 1 + size / 2, you[1] - size / 2 - 13, { size: 17, italic: true, color: INK });
    var w = ease(walker), at = Math.min(M - 1, w * (M - 1)), i0 = Math.floor(at), i1 = Math.min(M - 1, i0 + 1), f = at - i0;
    var me = pt([lerp(path[i0][0], path[i1][0], f), lerp(path[i0][1], path[i1][1], f)]);
    ctx.fillStyle = INK;
    ctx.fillRect(me[0] - size - 1 + (1 - w) * (size / 2 + 1), me[1] - size / 2, size, size);
    if (walker >= 1) label('me', you[0] - 1 - size / 2, you[1] + size / 2 + 13, { size: 17, italic: true, color: INK });
    ctx.globalAlpha = 1;
  }

  /* ── Scroll: which slide are we on, and how far through it ── */
  function readScroll() {
    var stage = document.querySelector('.love-stage').getBoundingClientRect();
    var stacked = window.innerWidth <= 1040;
    var mark = stacked ? stage.bottom + (window.innerHeight - stage.bottom) * 0.35 : window.innerHeight * 0.5;
    var active = 0;
    slides.forEach(function (s, i) { if (s.getBoundingClientRect().top <= mark) active = i; });
    var box = slides[active].getBoundingClientRect();
    progress = clamp((mark - box.top) / Math.max(box.height, 1), 0, 1);
    /* The figure fades as the original slides come up from below the promise. */
    var originalTop = original.getBoundingClientRect().top;
    canvas.style.opacity = clamp((originalTop - window.innerHeight * 0.45) / (window.innerHeight * 0.5), 0, 1);
    var nextScene = Number(slides[active].getAttribute('data-scene'));
    if (nextScene !== scene) {
      if (nextScene === 20) resetAction();
      if (nextScene === 17) resetNoise();
      scene = nextScene;
    }
  }

  function resize() {
    var dpr = window.devicePixelRatio || 1;
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function render(dt) {
    var target = SCENES[scene] || {};
    var k = 1 - Math.exp(-dt * 3.2);
    Object.keys(now).forEach(function (key) {
      var goal = target[key] !== undefined ? target[key] : DEFAULTS[key];
      now[key] = lerp(now[key], goal, k);
    });
    if (now.balance > 0.5) {
      var v = balanceValues();
      now.sep = lerp(now.sep, 0.52 + (v.D - v.E) * 0.14, k);
    }
    ctx.clearRect(0, 0, W, H);
    drawPeople(now);
    drawFan(now);
    drawNoise(now);
    drawAction(now, dt);
  }

  /* ── The original slides ── */
  (function () {
    var image = document.querySelector('[data-slide-image]');
    var count = document.querySelector('[data-slide-count]');
    var prev = document.querySelector('[data-slide-prev]');
    var next = document.querySelector('[data-slide-next]');
    var TOTAL = 21, at = 1;
    function src(n) { return 'slides/slide-' + (n < 10 ? '0' : '') + n + '.jpg'; }
    function go(n) {
      at = clamp(n, 1, TOTAL);
      image.src = src(at);
      image.alt = 'Slide ' + at + ' of ' + TOTAL + ' of the original presentation.';
      count.textContent = at + ' / ' + TOTAL;
      prev.disabled = at === 1;
      next.disabled = at === TOTAL;
      if (at < TOTAL) new Image().src = src(at + 1);
    }
    prev.addEventListener('click', function () { go(at - 1); });
    next.addEventListener('click', function () { go(at + 1); });
    go(1);
  })();

  var last = null;
  function frame(stamp) {
    if (last === null) last = stamp;
    var dt = Math.min(0.05, (stamp - last) / 1000);
    last = stamp;
    time += dt;
    readScroll();
    if (now.noise > 0.5) stepNoise(dt);
    render(dt);
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  if (still) {
    /* No motion: settle each scene at once, and redraw only on scroll. */
    var settle = function () {
      readScroll();
      if (scene === 20) { for (var i = 0; i < 400; i++) relaxStep(); walker = 1; relaxed = 1; }
      Object.keys(now).forEach(function (key) {
        var t = SCENES[scene] || {};
        now[key] = t[key] !== undefined ? t[key] : DEFAULTS[key];
      });
      render(0);
    };
    window.addEventListener('scroll', settle, { passive: true });
    window.addEventListener('resize', settle);
    settle();
  } else {
    requestAnimationFrame(frame);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);
})();
