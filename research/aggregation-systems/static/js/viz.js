/* Interactive figures for the aggregation systems page. Everything is simulated live in the browser. */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var INK = '#111', GREEN = '#86c56b', YELLOW = '#f6d26b', ORANGE = '#f28a5c';
  var MOORE = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  var VON_NEUMANN = [[0, -1], [-1, 0], [1, 0], [0, 1]];

  function key(x, y) { return x + ',' + y; }
  function unkey(k) { return k.split(',').map(Number); }

  function whenVisible(el, onChange) {
    if (!('IntersectionObserver' in window)) { onChange(true); return; }
    new IntersectionObserver(function (entries) { onChange(entries[0].isIntersecting); }, { threshold: 0.15 }).observe(el);
  }

  function setupCanvas(canvas, w, h) {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  /* ── Page header: four rules growing to 500 iterations, on a loop ──
     Same rules, neighbourhood, starting cross and iteration count as the essay's figure. */
  function heroFigure(root) {
    var RULES = [[1], [1, 2], [1, 3], [1, 2, 3]];
    var ITERATIONS = 500, HALF = 26, GROW_MS = 8000, HOLD_MS = 2600, FADE_MS = 700;
    var COLOR = { alive: INK, candidate: GREEN, potential: YELLOW, dead: ORANGE };
    var row = root.querySelector('[data-panels]');
    var fallback = root.querySelector('img');
    fallback.style.display = 'none';
    row.style.display = '';
    var panels = RULES.map(function (rule) {
      var el = document.createElement('div');
      el.className = 'viz-hero-panel';
      el.innerHTML = '<canvas></canvas><div class="viz-panel-label"></div>';
      el.querySelector('.viz-panel-label').textContent = '4: {' + rule.join(', ') + '}';
      row.appendChild(el);
      return { rule: rule, canvas: el.querySelector('canvas') };
    });
    var phase = 'grow', phaseStart = null, onScreen = false, frame = null, grown = 0, pausedAt = null;

    function kind(panel, x, y) {
      var k = key(x, y);
      if (panel.cells[k]) return 'alive';
      var n = panel.counts[k] || 0;
      if (panel.rule.indexOf(n) >= 0) return 'candidate';
      if (n === 0) return 'empty';
      return panel.rule.some(function (v) { return v > n; }) ? 'potential' : 'dead';
    }
    function paint(panel, x, y) {
      var s = panel.scale, px = (x + HALF) * s, py = (y + HALF) * s, c = COLOR[kind(panel, x, y)];
      if (x < -HALF || y < -HALF || x > HALF || y > HALF || !c) return;
      panel.ctx.fillStyle = c;
      panel.ctx.fillRect(px, py, s + 0.5, s + 0.5);
    }
    function place(panel, x, y) {
      panel.cells[key(x, y)] = true;
      VON_NEUMANN.forEach(function (d) {
        var k = key(x + d[0], y + d[1]);
        panel.counts[k] = (panel.counts[k] || 0) + 1;
      });
      paint(panel, x, y);
      VON_NEUMANN.forEach(function (d) { paint(panel, x + d[0], y + d[1]); });
    }
    function grow(panel) {
      var options = [];
      Object.keys(panel.counts).forEach(function (k) {
        if (panel.cells[k] || panel.rule.indexOf(panel.counts[k]) < 0) return;
        var c = unkey(k);
        if (Math.abs(c[0]) < HALF && Math.abs(c[1]) < HALF) options.push(c);
      });
      if (!options.length) return;
      var pick = options[Math.floor(Math.random() * options.length)];
      place(panel, pick[0], pick[1]);
    }
    function reset() {
      grown = 0;
      panels.forEach(function (panel) {
        var size = panel.canvas.clientWidth || 200;
        panel.ctx = setupCanvas(panel.canvas, size, size);
        panel.scale = size / (2 * HALF + 1);
        panel.ctx.clearRect(0, 0, size, size);
        panel.cells = {};
        panel.counts = {};
        [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { place(panel, d[0], d[1]); });
      });
    }
    function opacity(v, ms) {
      row.style.transition = 'opacity ' + ms + 'ms ease';
      row.style.opacity = v;
    }
    function tick(now) {
      frame = null;
      if (!onScreen) return;
      if (phaseStart === null) phaseStart = now;
      var t = now - phaseStart;
      if (phase === 'grow') {
        /* Eases out, so the first cells appear quickly and the end settles gently. */
        var u = Math.min(t / GROW_MS, 1), target = Math.round(ITERATIONS * (1 - Math.pow(1 - u, 1.6)));
        while (grown < target) {
          panels.forEach(grow);
          grown++;
        }
        if (u >= 1) { phase = 'hold'; phaseStart = now; }
      } else if (phase === 'hold') {
        if (t >= HOLD_MS) { phase = 'fade'; phaseStart = now; opacity(0, FADE_MS); }
      } else if (t >= FADE_MS) {
        reset();
        opacity(1, FADE_MS);
        phase = 'grow';
        phaseStart = now;
      }
      frame = requestAnimationFrame(tick);
    }
    reset();
    if (reduceMotion) {
      while (grown < ITERATIONS) { panels.forEach(grow); grown++; }
      return;
    }
    whenVisible(root, function (v) {
      onScreen = v;
      if (v) {
        /* Pick up where it left off after being scrolled away. */
        if (pausedAt !== null && phaseStart !== null) phaseStart += performance.now() - pausedAt;
        pausedAt = null;
        if (!frame) frame = requestAnimationFrame(tick);
      } else {
        pausedAt = performance.now();
      }
    });
    window.addEventListener('resize', function () {
      phase = 'grow';
      phaseStart = null;
      reset();
    });
  }

  /* ── Figure 1: the five bias types grown side by side ──
     Same rule as biasmodAggregationSystem: any empty Moore neighbour is a candidate, chosen with
     weight (neighbours + 1)^alpha. Runs stop at a boundary size of BOUND cells. */
  function biasFigure(root) {
    var BOUND = 40, HALF = 32, STEPS_PER_SECOND = 130;
    var TYPES = [
      { label: 'Unbiased', alpha: 0 }, { label: 'Linear', alpha: 1 }, { label: 'α = 2', alpha: 2 },
      { label: 'α = 4', alpha: 4 }, { label: 'α = 8', alpha: 8 }
    ];
    var grid = root.querySelector('[data-panels]');
    var panels = TYPES.map(function (type) {
      var el = document.createElement('div');
      el.className = 'viz-panel';
      el.innerHTML = '<canvas></canvas><div class="viz-panel-label"><b></b> <span></span></div>';
      el.querySelector('b').textContent = type.label;
      grid.appendChild(el);
      return { type: type, canvas: el.querySelector('canvas'), out: el.querySelector('span') };
    });
    var onScreen = false, frame = null, lastTime = null;

    function reset(panel) {
      panel.cells = {};
      panel.cand = {};
      panel.minX = panel.maxX = panel.minY = panel.maxY = 0;
      panel.count = 0;
      panel.done = false;
      var size = panel.canvas.clientWidth || 150;
      panel.ctx = setupCanvas(panel.canvas, size, size);
      panel.scale = size / (2 * HALF + 1);
      panel.ctx.clearRect(0, 0, size, size);
      place(panel, 0, 0);
      label(panel);
    }
    function place(panel, x, y) {
      var k = key(x, y);
      panel.cells[k] = true;
      delete panel.cand[k];
      panel.count++;
      panel.minX = Math.min(panel.minX, x);
      panel.maxX = Math.max(panel.maxX, x);
      panel.minY = Math.min(panel.minY, y);
      panel.maxY = Math.max(panel.maxY, y);
      MOORE.forEach(function (d) {
        var n = key(x + d[0], y + d[1]);
        if (!panel.cells[n]) panel.cand[n] = (panel.cand[n] || 0) + 1;
      });
      var s = panel.scale;
      panel.ctx.fillStyle = INK;
      panel.ctx.fillRect((x + HALF) * s, (y + HALF) * s, Math.ceil(s), Math.ceil(s));
    }
    function step(panel) {
      var keys = Object.keys(panel.cand), total = 0, weights = new Array(keys.length), i;
      for (i = 0; i < keys.length; i++) {
        weights[i] = Math.pow(panel.cand[keys[i]] + 1, panel.type.alpha);
        total += weights[i];
      }
      var pick = Math.random() * total;
      for (i = 0; i < keys.length - 1; i++) {
        pick -= weights[i];
        if (pick <= 0) break;
      }
      var c = unkey(keys[i]);
      place(panel, c[0], c[1]);
      var w = panel.maxX - panel.minX + 1, h = panel.maxY - panel.minY + 1;
      if (Math.max(w, h) >= BOUND) panel.done = true;
    }
    function label(panel) {
      var area = (panel.maxX - panel.minX + 1) * (panel.maxY - panel.minY + 1);
      panel.out.textContent = 'ρ = ' + (panel.count / area).toFixed(3);
    }
    function tick(now) {
      frame = null;
      var running = false;
      /* Steps follow elapsed time, so every screen finishes in about the same few seconds. */
      var steps = lastTime === null ? 1 : Math.min(40, Math.max(1, Math.round((now - lastTime) / 1000 * STEPS_PER_SECOND)));
      lastTime = now;
      panels.forEach(function (panel) {
        for (var i = 0; i < steps && !panel.done; i++) step(panel);
        label(panel);
        running = running || !panel.done;
      });
      if (running && onScreen) frame = requestAnimationFrame(tick);
      else lastTime = null;
    }
    function restart() {
      panels.forEach(reset);
      if (reduceMotion) {
        panels.forEach(function (panel) { while (!panel.done) step(panel); label(panel); });
      } else if (onScreen && !frame) {
        frame = requestAnimationFrame(tick);
      }
    }
    root.querySelector('[data-restart]').addEventListener('click', restart);
    whenVisible(root, function (v) {
      onScreen = v;
      if (v && !frame && !reduceMotion) frame = requestAnimationFrame(tick);
    });
    restart();
  }

  /* ── Figure 2: play a totalistic rule yourself, with the essay's cell colours ── */
  function ruleFigure(root) {
    var N = 25, MID = 12;
    var canvas = root.querySelector('canvas');
    var status = root.querySelector('[data-status]');
    var autoBtn = root.querySelector('[data-auto]');
    var boxes = root.querySelectorAll('input[type="checkbox"]');
    var cells, count, timer = null, auto = false, onScreen = false, started = false, size = 0;

    function rule() {
      var r = [];
      boxes.forEach(function (b) { if (b.checked) r.push(Number(b.value)); });
      return r;
    }
    function neighbours(x, y) {
      var n = 0;
      VON_NEUMANN.forEach(function (d) { if (cells[key(x + d[0], y + d[1])]) n++; });
      return n;
    }
    function classify(x, y, r) {
      if (cells[key(x, y)]) return 'alive';
      var n = neighbours(x, y);
      if (r.indexOf(n) >= 0) return 'candidate';
      if (n === 0) return 'empty';
      return r.some(function (v) { return v > n; }) ? 'potential' : 'dead';
    }
    function candidates(r) {
      var list = [];
      for (var x = 0; x < N; x++) for (var y = 0; y < N; y++) if (classify(x, y, r) === 'candidate') list.push([x, y]);
      return list;
    }
    function touchesEdge() {
      return Object.keys(cells).some(function (k) {
        var c = unkey(k);
        return c[0] === 0 || c[1] === 0 || c[0] === N - 1 || c[1] === N - 1;
      });
    }
    function draw() {
      size = canvas.clientWidth;
      var ctx = setupCanvas(canvas, size, size), s = size / N, r = rule();
      var COLOR = { alive: INK, candidate: GREEN, potential: YELLOW, dead: ORANGE };
      ctx.clearRect(0, 0, size, size);
      for (var x = 0; x < N; x++) {
        for (var y = 0; y < N; y++) {
          var c = COLOR[classify(x, y, r)];
          if (c) { ctx.fillStyle = c; ctx.fillRect(x * s, y * s, s, s); }
        }
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 1;
      for (var i = 0; i <= N; i++) {
        ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, size); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(size, i * s); ctx.stroke();
      }
      var left = candidates(r).length;
      var text = 'Rule 4: {' + r.join(', ') + '}, ' + count + ' cells. ';
      if (left === 0) { text += 'No green cells remain: this is a terminal state.'; setAuto(false); }
      else if (touchesEdge()) { text += 'Growth reached the edge of this grid.'; setAuto(false); }
      else text += left + ' candidate' + (left === 1 ? '' : 's') + '. Click a green cell to place it.';
      status.textContent = text;
    }
    function setAuto(on) {
      auto = on;
      autoBtn.textContent = on ? 'Pause' : 'Play';
      clearTimeout(timer);
      if (on && onScreen) timer = setTimeout(stepAuto, 150);
    }
    function placeRandom() {
      var list = candidates(rule());
      if (!list.length || touchesEdge()) return false;
      var c = list[Math.floor(Math.random() * list.length)];
      cells[key(c[0], c[1])] = true;
      count++;
      return true;
    }
    function stepAuto() {
      if (!auto || !onScreen) return;
      placeRandom();
      draw();
      if (auto) timer = setTimeout(stepAuto, 150);
    }
    function reset() {
      cells = {};
      count = 0;
      [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        cells[key(MID + d[0], MID + d[1])] = true;
        count++;
      });
    }
    canvas.addEventListener('click', function (e) {
      var box = canvas.getBoundingClientRect();
      var x = Math.floor((e.clientX - box.left) / box.width * N), y = Math.floor((e.clientY - box.top) / box.height * N);
      if (classify(x, y, rule()) !== 'candidate' || touchesEdge()) return;
      setAuto(false);
      cells[key(x, y)] = true;
      count++;
      draw();
    });
    autoBtn.addEventListener('click', function () { setAuto(!auto); });
    root.querySelector('[data-step-once]').addEventListener('click', function () { setAuto(false); placeRandom(); draw(); });
    root.querySelector('[data-restart]').addEventListener('click', function () { setAuto(false); reset(); draw(); });
    boxes.forEach(function (b) {
      b.addEventListener('change', function () { setAuto(false); reset(); draw(); });
    });
    window.addEventListener('resize', draw);
    whenVisible(root, function (v) {
      onScreen = v;
      if (v && !started && !reduceMotion) { started = true; setAuto(true); }
      else if (v && auto) setAuto(true);
    });
    reset();
    draw();
  }

  /* ── Figure 3: the multiway system of the 8-neighbour rule {2} ──
     Same rule and starting cells as the essay. States equal up to translation, rotation or reflection
     are merged. Terminal states are the ones with no candidate cells left. */
  function multiwayFigure(root) {
    var MAX_DEPTH = 9;
    var START = [[0, -1], [0, 0], [0, 1], [1, 0]];
    var SYMMETRIES = [
      function (p) { return [p[0], p[1]]; }, function (p) { return [-p[0], p[1]]; },
      function (p) { return [p[0], -p[1]]; }, function (p) { return [-p[0], -p[1]]; },
      function (p) { return [p[1], p[0]]; }, function (p) { return [-p[1], p[0]]; },
      function (p) { return [p[1], -p[0]]; }, function (p) { return [-p[1], -p[0]]; }
    ];
    function canonical(state) {
      var best = null;
      SYMMETRIES.forEach(function (f) {
        var pts = state.map(f);
        var mx = Math.min.apply(null, pts.map(function (p) { return p[0]; }));
        var my = Math.min.apply(null, pts.map(function (p) { return p[1]; }));
        var s = pts.map(function (p) { return (p[0] - mx) + ',' + (p[1] - my); }).sort().join(';');
        if (best === null || s < best) best = s;
      });
      return best;
    }
    function candidatesOf(state) {
      var occ = {}, counts = {};
      state.forEach(function (p) { occ[key(p[0], p[1])] = true; });
      state.forEach(function (p) {
        MOORE.forEach(function (d) {
          var k = key(p[0] + d[0], p[1] + d[1]);
          if (!occ[k]) counts[k] = (counts[k] || 0) + 1;
        });
      });
      return Object.keys(counts).filter(function (k) { return counts[k] === 2; }).map(unkey);
    }
    function build() {
      var nodes = [], index = {}, edges = [], layers = [];
      function node(state, depth) {
        var c = canonical(state);
        if (index[c] !== undefined) return index[c];
        index[c] = nodes.length;
        nodes.push({ id: nodes.length, state: c.split(';').map(unkey), depth: depth, parents: [], children: [], terminal: false });
        (layers[depth] = layers[depth] || []).push(nodes.length - 1);
        return nodes.length - 1;
      }
      node(START, 0);
      for (var d = 0; d <= MAX_DEPTH; d++) {
        (layers[d] || []).forEach(function (id) {
          var n = nodes[id], cands = candidatesOf(n.state);
          n.terminal = cands.length === 0;
          if (d === MAX_DEPTH) return;
          cands.forEach(function (c) {
            var child = node(n.state.concat([c]), d + 1);
            if (n.children.indexOf(child) < 0) {
              n.children.push(child);
              nodes[child].parents.push(id);
              edges.push([id, child]);
            }
          });
        });
      }
      return { nodes: nodes, edges: edges, layers: layers };
    }

    var graph = null, depth = 1, selected = null, timer = null, started = false, onScreen = false, playing = false;
    var canvas = root.querySelector('[data-graph]');
    var mini = root.querySelector('[data-state]');
    var slider = root.querySelector('input[type="range"]');
    var status = root.querySelector('[data-status]');
    var detail = root.querySelector('[data-detail]');
    var playBtn = root.querySelector('[data-play]');
    var W = 0, H = 0;

    function layout() {
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      var top = 12, gap = (H - 24) / Math.max(depth, 1);
      for (var d = 0; d <= depth; d++) {
        var layer = graph.layers[d] || [];
        /* Order each layer by where its parents sit, to reduce edge crossings. */
        layer.slice().map(function (id) {
          var n = graph.nodes[id], sum = 0;
          n.parents.forEach(function (p) { sum += graph.nodes[p].x; });
          return { id: id, order: n.parents.length ? sum / n.parents.length : W / 2 };
        }).sort(function (a, b) { return a.order - b.order; }).forEach(function (item, i, all) {
          var n = graph.nodes[item.id];
          var span = Math.min(W - 16, 40 + all.length * 12);
          n.x = W / 2 + (all.length > 1 ? (i / (all.length - 1) - 0.5) * span : 0);
          n.y = top + gap * d;
        });
      }
    }
    function ancestors(id) {
      var seen = {}, stack = [id];
      while (stack.length) {
        var n = stack.pop();
        if (seen[n]) continue;
        seen[n] = true;
        graph.nodes[n].parents.forEach(function (p) { stack.push(p); });
      }
      return seen;
    }
    function drawState(n) {
      var size = mini.clientWidth;
      var ctx = setupCanvas(mini, size, size);
      ctx.clearRect(0, 0, size, size);
      if (!n) return;
      var xs = n.state.map(function (p) { return p[0]; }), ys = n.state.map(function (p) { return p[1]; });
      var cands = candidatesOf(n.state);
      cands.forEach(function (c) { xs.push(c[0]); ys.push(c[1]); });
      var minX = Math.min.apply(null, xs), minY = Math.min.apply(null, ys);
      var span = Math.max(Math.max.apply(null, xs) - minX, Math.max.apply(null, ys) - minY) + 3;
      var s = size / span;
      function cell(p, color) {
        ctx.fillStyle = color;
        ctx.fillRect((p[0] - minX + 1) * s, (p[1] - minY + 1) * s, s - 1, s - 1);
      }
      cands.forEach(function (c) { cell(c, GREEN); });
      n.state.forEach(function (c) { cell(c, INK); });
    }
    function draw() {
      layout();
      var ctx = setupCanvas(canvas, W, H);
      ctx.clearRect(0, 0, W, H);
      var live = selected !== null && graph.nodes[selected].depth <= depth ? ancestors(selected) : {};
      var count = 0, terminals = 0;
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = 'rgba(100,116,139,0.35)';
      ctx.beginPath();
      graph.edges.forEach(function (e) {
        var a = graph.nodes[e[0]], b = graph.nodes[e[1]];
        if (b.depth > depth) return;
        count++;
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      });
      ctx.stroke();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = '#c0261c';
      ctx.beginPath();
      graph.edges.forEach(function (e) {
        var b = graph.nodes[e[1]];
        if (b.depth > depth || !live[e[0]] || !live[e[1]]) return;
        var a = graph.nodes[e[0]];
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      });
      ctx.stroke();
      var states = 0;
      graph.nodes.forEach(function (n) {
        if (n.depth > depth) return;
        states++;
        if (n.terminal) terminals++;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.terminal ? 3.4 : 1.9, 0, 2 * Math.PI);
        ctx.fillStyle = n.terminal ? '#c0261c' : (live[n.id] ? '#c0261c' : '#475569');
        ctx.fill();
      });
      /* The essay counts the starting state as iteration 1. */
      status.textContent = 'Iteration ' + (depth + 1) + ': ' + states + ' states, ' + count + ' transitions, ' + terminals + ' terminal.';
      var n = selected !== null && graph.nodes[selected].depth <= depth ? graph.nodes[selected] : null;
      drawState(n);
      detail.textContent = n
        ? 'Iteration ' + (n.depth + 1) + (n.terminal ? ': a terminal state, with no candidates left.' : ': ' + candidatesOf(n.state).length + ' candidate cells, shown in green.')
        : 'Click a point in the graph.';
    }
    function setDepth(d) {
      depth = d;
      slider.value = d + 1;
      draw();
    }
    function setPlaying(on) {
      playing = on;
      playBtn.textContent = on ? 'Pause' : 'Play';
      clearTimeout(timer);
      if (on) timer = setTimeout(advance, 650);
    }
    function advance() {
      if (!playing) return;
      if (depth >= MAX_DEPTH) { setPlaying(false); return; }
      setDepth(depth + 1);
      timer = setTimeout(advance, 650);
    }
    function firstTerminal() {
      for (var i = 0; i < graph.nodes.length; i++) if (graph.nodes[i].terminal) return i;
      return null;
    }
    function init() {
      graph = build();
      selected = firstTerminal();
      root.__multiway = { states: graph.nodes.length, edges: graph.edges.length, terminals: graph.nodes.filter(function (n) { return n.terminal; }).map(function (n) { return n.depth; }) };
      slider.addEventListener('input', function () { setPlaying(false); setDepth(Number(slider.value) - 1); });
      playBtn.addEventListener('click', function () {
        if (!playing && depth >= MAX_DEPTH) setDepth(1);
        setPlaying(!playing);
      });
      canvas.addEventListener('click', function (e) {
        var box = canvas.getBoundingClientRect(), x = e.clientX - box.left, y = e.clientY - box.top, best = 196, pick = null;
        graph.nodes.forEach(function (n) {
          if (n.depth > depth) return;
          var d = (n.x - x) * (n.x - x) + (n.y - y) * (n.y - y);
          if (d < best) { best = d; pick = n.id; }
        });
        if (pick !== null) { setPlaying(false); selected = pick; draw(); }
      });
      window.addEventListener('resize', draw);
      setDepth(reduceMotion ? MAX_DEPTH : 1);
    }
    whenVisible(root, function (v) {
      onScreen = v;
      if (v && !started && !reduceMotion) { started = true; setPlaying(true); }
    });
    init();
  }

  document.querySelectorAll('[data-viz="hero"]').forEach(heroFigure);
  document.querySelectorAll('[data-viz="bias"]').forEach(biasFigure);
  document.querySelectorAll('[data-viz="rule"]').forEach(ruleFigure);
  document.querySelectorAll('[data-viz="multiway"]').forEach(multiwayFigure);
})();
