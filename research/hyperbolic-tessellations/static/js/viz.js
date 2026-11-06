/* Interactive figures for the hyperbolic tessellations page. Everything is computed live in the browser. */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Complex arithmetic: numbers are [re, im] ── */
  function mul(a, b) { return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]; }
  function conj(a) { return [a[0], -a[1]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function div(a, b) {
    var d = b[0] * b[0] + b[1] * b[1];
    return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
  }
  function abs2(a) { return a[0] * a[0] + a[1] * a[1]; }

  /* Disk isometry sending a to 0, as in Theorem 3.4 with theta = 0. */
  function mobius(a, z) { return div(sub(z, a), sub([1, 0], mul(conj(a), z))); }

  /* ── WebGL helpers ── */
  var VERTEX = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';

  /* Folds a disk point into the (pi/p, pi/q, pi/2) triangle by reflecting across its three mirrors,
     counting reflections. The mirrors are the real axis, the line at angle pi/p, and a circle orthogonal
     to the unit circle. Parity of the count gives the black/white colouring. */
  var FOLD = [
    'precision highp float;',
    'uniform vec2 uRes;',
    'vec2 cmul(vec2 a, vec2 b) { return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }',
    'vec2 cconj(vec2 a) { return vec2(a.x, -a.y); }',
    'vec2 cdiv(vec2 a, vec2 b) { return cmul(a, cconj(b)) / dot(b, b); }',
    'float fold(vec2 w, float c, float r, float wedge) {',
    '  float par = 0.0;',
    '  for (int i = 0; i < 90; i++) {',
    '    float k = floor(atan(w.y, w.x) / wedge + 0.5);',
    '    float t = -k * wedge;',
    '    w = cmul(w, vec2(cos(t), sin(t)));',
    '    if (w.y < 0.0) { w.y = -w.y; par += 1.0; }',
    '    vec2 d = w - vec2(c, 0.0);',
    '    float dd = dot(d, d);',
    '    if (dd >= r * r) break;',
    '    w = vec2(c, 0.0) + d * (r * r / dd);',
    '    par += 1.0;',
    '  }',
    '  return mod(par, 2.0);',
    '}'
  ].join('\n');

  function makeGL(canvas, fragment) {
    var gl = canvas.getContext('webgl', { antialias: false, preserveDrawingBuffer: true });
    if (!gl) return null;
    function shader(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    return {
      gl: gl,
      u: function (name) { return gl.getUniformLocation(prog, name); },
      /* Renders above display size and lets the browser scale down, for smooth edges. */
      resize: function () {
        var scale = Math.min(2 * (window.devicePixelRatio || 1), 3);
        var w = Math.round(canvas.clientWidth * scale), h = Math.round(canvas.clientHeight * scale);
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        gl.viewport(0, 0, w, h);
        gl.uniform2f(this.u('uRes'), w, h);
      },
      draw: function () { gl.drawArrays(gl.TRIANGLES, 0, 3); }
    };
  }

  function whenVisible(el, onChange) {
    if (!('IntersectionObserver' in window)) { onChange(true); return; }
    new IntersectionObserver(function (entries) { onChange(entries[0].isIntersecting); }).observe(el);
  }

  /* ── Figure 1: {p, q} tiling you can drag with a Möbius isometry ── */
  function tilingFigure(root) {
    var canvas = root.querySelector('canvas');
    var fallback = root.querySelector('img');
    var view;
    try {
      view = makeGL(canvas, FOLD + [
        '',
        'uniform float uC, uR, uWedge;',
        'uniform vec4 uM;',
        'void main() {',
        '  vec2 p = (gl_FragCoord.xy / uRes * 2.0 - 1.0) * 1.02;',
        '  float n = dot(p, p);',
        '  if (n >= 1.0) { gl_FragColor = vec4(vec3(n < 1.012 ? 0.1 : 1.0), 1.0); return; }',
        '  vec2 a = uM.xy, b = uM.zw;',
        '  vec2 z = cdiv(cmul(cconj(a), p) - b, a - cmul(cconj(b), p));',
        '  float par = fold(z, uC, uR, uWedge);',
        '  float col = par < 0.5 ? 1.0 : 0.1;',
        '  col = mix(0.55, col, smoothstep(0.0, 0.035, 1.0 - n));',
        '  gl_FragColor = vec4(vec3(col), 1.0);',
        '}'
      ].join('\n'));
    } catch (e) { view = null; }
    if (!view) { canvas.style.display = 'none'; root.querySelector('.viz-controls').style.display = 'none'; return; }
    fallback.style.display = 'none';

    var p = 7, q = 3, alpha = [1, 0], beta = [0, 0], valid = true;
    var idle = !reduceMotion, onScreen = false, t = 0, frame = null;
    var status = root.querySelector('[data-status]');
    var pLabel = root.querySelector('[data-p]'), qLabel = root.querySelector('[data-q]');

    function translation(a) {
      var s = 1 / Math.sqrt(1 - abs2(a));
      return [[s, 0], [a[0] * s, a[1] * s]];
    }
    function compose(m1, m2) {
      return [add(mul(m1[0], m2[0]), mul(m1[1], conj(m2[1]))), add(mul(m1[0], m2[1]), mul(m1[1], conj(m2[0])))];
    }
    function gcd(a, b) { return b ? gcd(b, a % b) : a; }

    function render() {
      view.resize();
      var gl = view.gl;
      if (!valid) { gl.clearColor(1, 1, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT); return; }
      var sp = Math.sin(Math.PI / p), cq = Math.cos(Math.PI / q);
      var r = Math.sqrt(sp * sp / (cq * cq - sp * sp));
      gl.uniform1f(view.u('uR'), r);
      gl.uniform1f(view.u('uC'), Math.sqrt(1 + r * r));
      gl.uniform1f(view.u('uWedge'), 2 * Math.PI / p);
      gl.uniform4f(view.u('uM'), alpha[0], alpha[1], beta[0], beta[1]);
      view.draw();
    }

    function update() {
      pLabel.textContent = p;
      qLabel.textContent = q;
      var num = p + q, den = p * q, g = gcd(num, den);
      var sum = '1/' + p + ' + 1/' + q + ' = ' + (num / g) + '/' + (den / g);
      valid = 2 * num < den;
      if (valid) status.textContent = sum + ' < 1/2, so this tiling exists in the hyperbolic plane.';
      else if (2 * num === den) status.textContent = sum + ' = 1/2. This one tiles the flat Euclidean plane, not the hyperbolic plane.';
      else status.textContent = sum + ' > 1/2. This one tiles the sphere, not the hyperbolic plane.';
      canvas.classList.toggle('is-empty', !valid);
      render();
    }

    root.querySelectorAll('[data-step]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var d = btn.getAttribute('data-step').split(':');
        if (d[0] === 'p') p = Math.min(12, Math.max(3, p + Number(d[1])));
        else q = Math.min(12, Math.max(3, q + Number(d[1])));
        update();
      });
    });

    function pointerToDisk(e) {
      var box = canvas.getBoundingClientRect();
      var x = ((e.clientX - box.left) / box.width * 2 - 1) * 1.02;
      var y = (1 - (e.clientY - box.top) / box.height * 2) * 1.02;
      var n = Math.sqrt(x * x + y * y);
      return n > 0.97 ? [x / n * 0.97, y / n * 0.97] : [x, y];
    }
    var last = null;
    canvas.addEventListener('pointerdown', function (e) {
      idle = false;
      last = pointerToDisk(e);
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!last || !valid) return;
      var now = pointerToDisk(e);
      /* Apply the isometry that carries the old pointer position to the new one. */
      var move = compose(translation(now), translation([-last[0], -last[1]]));
      var next = compose(move, [alpha, beta]);
      if (abs2(next[0]) < 4e6) { alpha = next[0]; beta = next[1]; }
      last = now;
      render();
    });
    ['pointerup', 'pointercancel'].forEach(function (name) {
      canvas.addEventListener(name, function () { last = null; });
    });

    /* Until touched, drift gently along a closed path. */
    function tick() {
      frame = null;
      if (!idle || !onScreen) return;
      t += 0.004;
      var m = translation([0.42 * Math.cos(t), 0.42 * Math.sin(0.7 * t)]);
      alpha = m[0];
      beta = m[1];
      render();
      frame = requestAnimationFrame(tick);
    }
    whenVisible(canvas, function (v) {
      onScreen = v;
      if (v && idle && !frame) frame = requestAnimationFrame(tick);
    });
    window.addEventListener('resize', render);
    update();
  }

  /* ── Figure 2: the modular group acting on its fundamental domain, in both models ── */
  function modularFigure(root) {
    var FRAG = FOLD + [
      '',
      'uniform float uDisk;',
      'uniform vec4 uG;',
      'const vec2 RHO = vec2(0.5, 0.8660254);',
      'const vec2 ROT = vec2(0.5, 0.8660254);',
      'void main() {',
      '  vec2 s = gl_FragCoord.xy / uRes;',
      '  vec2 z; float depth;',
      '  if (uDisk > 0.5) {',
      '    float aspect = uRes.x / uRes.y;',
      '    vec2 w = vec2((s.x * 2.0 - 1.0) * aspect, s.y * 2.0 - 1.0) * 1.03;',
      '    float n = dot(w, w);',
      '    if (n >= 1.0) { gl_FragColor = vec4(vec3(n < 1.012 ? 0.1 : 1.0), 1.0); return; }',
      '    z = cmul(vec2(0.0, 1.0), cdiv(vec2(1.0, 0.0) + w, vec2(1.0, 0.0) - w));',
      '    depth = (1.0 - n) * 5.0;',
      '  } else {',
      '    z = vec2((s.x - 0.5) * 4.0, s.y * 3.0);',
      '    depth = z.y * 5.0;',
      '    if (z.y < 0.012) { gl_FragColor = vec4(vec3(0.1), 1.0); return; }',
      '  }',
      /* Send rho to the disk centre with |z| = 1 on the real axis and Re z = 1/2 on the line at pi/3,
         so that the mirrors of the fold are the mirrors of the extended modular group. */
      '  vec2 w0 = cmul(ROT, cconj(cdiv(z - RHO, z - cconj(RHO))));',
      '  float par = fold(w0, 2.0, 1.7320508, 2.0943951);',
      '  vec3 col = vec3(par < 0.5 ? 1.0 : 0.8);',
      '  vec2 q = cdiv(uG.w * z - vec2(uG.y, 0.0), uG.x * vec2(1.0, 0.0) - uG.z * z);',
      '  if (dot(q, q) >= 1.0 && abs(q.x) <= 0.5) col = par < 0.5 ? vec3(0.98, 0.75, 0.3) : vec3(0.85, 0.46, 0.05);',
      '  col = mix(vec3(0.72), col, smoothstep(0.0, 0.25, depth));',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n');

    var canvases = root.querySelectorAll('canvas');
    var views = [];
    try {
      views = [makeGL(canvases[0], FRAG), makeGL(canvases[1], FRAG)];
    } catch (e) { views = [null]; }
    if (!views[0] || !views[1]) { root.style.display = 'none'; return; }

    var G = [1, 0, 0, 1], word = [], busy = false;
    var wordLabel = root.querySelector('[data-word]');

    function times(g, m) {
      return [g[0] * m[0] + g[1] * m[2], g[0] * m[1] + g[1] * m[3], g[2] * m[0] + g[3] * m[2], g[2] * m[1] + g[3] * m[3]];
    }
    function render(m) {
      views.forEach(function (view, i) {
        view.resize();
        view.gl.uniform1f(view.u('uDisk'), i);
        view.gl.uniform4f(view.u('uG'), m[0], m[1], m[2], m[3]);
        view.draw();
      });
    }
    /* Each generator as a path of isometries, so the domain visibly travels to its image. */
    var PATHS = {
      T: function (t) { return [1, t, 0, 1]; },
      'T⁻¹': function (t) { return [1, -t, 0, 1]; },
      S: function (t) { var a = t * Math.PI / 2; return [Math.cos(a), -Math.sin(a), Math.sin(a), Math.cos(a)]; }
    };
    function label() {
      wordLabel.textContent = word.length ? 'γ = ' + word.join(' ') : 'γ = identity';
    }
    function apply(name) {
      if (busy || word.length >= 14) return;
      var path = PATHS[name], start = performance.now(), base = G;
      word.unshift(name);
      label();
      function finish() {
        var end = path(1).map(Math.round);
        G = times(end, base);
        busy = false;
        render(G);
      }
      if (reduceMotion) { finish(); return; }
      busy = true;
      (function step(now) {
        var u = Math.min((now - start) / 650, 1);
        if (u >= 1) { finish(); return; }
        render(times(path(u * u * (3 - 2 * u)), base));
        requestAnimationFrame(step);
      })(start);
    }
    root.querySelectorAll('[data-gen]').forEach(function (btn) {
      btn.addEventListener('click', function () { apply(btn.getAttribute('data-gen')); });
    });
    root.querySelector('[data-reset]').addEventListener('click', function () {
      if (busy) return;
      G = [1, 0, 0, 1];
      word = [];
      label();
      render(G);
    });
    window.addEventListener('resize', function () { render(G); });
    label();
    render(G);
  }

  /* ── Figure 3: a geodesic triangle whose area is its angle defect ── */
  function triangleFigure(root) {
    var canvas = root.querySelector('canvas');
    var ctx = canvas.getContext('2d');
    var verts = [[-0.5, -0.34], [0.62, -0.2], [0.02, 0.62]];
    var drag = -1, size = 0;
    var out = {
      a: root.querySelector('[data-a]'), b: root.querySelector('[data-b]'), c: root.querySelector('[data-c]'),
      sum: root.querySelector('[data-sum]'), area: root.querySelector('[data-area]')
    };

    function toPx(z) { return [size / 2 + z[0] * size * 0.48, size / 2 - z[1] * size * 0.48]; }

    function geodesic(a, b) {
      var w = mobius(a, b), pts = [];
      for (var i = 0; i <= 40; i++) pts.push(mobius([-a[0], -a[1]], [w[0] * i / 40, w[1] * i / 40]));
      return pts;
    }
    function angleAt(i) {
      var a = verts[i];
      var u = mobius(a, verts[(i + 1) % 3]), v = mobius(a, verts[(i + 2) % 3]);
      var d = Math.abs(Math.atan2(u[1], u[0]) - Math.atan2(v[1], v[0]));
      return d > Math.PI ? 2 * Math.PI - d : d;
    }
    function draw() {
      var dpr = window.devicePixelRatio || 1;
      size = canvas.clientWidth;
      canvas.width = canvas.height = Math.round(size * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      var c = toPx([0, 0]), R = size * 0.48;
      ctx.beginPath();
      ctx.arc(c[0], c[1], R, 0, 2 * Math.PI);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#1a1a1a';
      ctx.stroke();

      ctx.beginPath();
      [0, 1, 2].forEach(function (i) {
        geodesic(verts[i], verts[(i + 1) % 3]).forEach(function (z, j) {
          var p = toPx(z);
          if (i === 0 && j === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
        });
      });
      ctx.closePath();
      ctx.fillStyle = 'rgba(217, 119, 6, 0.22)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#b45309';
      ctx.stroke();

      var names = ['α', 'β', 'γ'];
      verts.forEach(function (z, i) {
        var p = toPx(z);
        ctx.beginPath();
        ctx.arc(p[0], p[1], 7, 0, 2 * Math.PI);
        ctx.fillStyle = '#1a1a1a';
        ctx.fill();
        ctx.font = '600 15px Inter, sans-serif';
        var cx = (verts[0][0] + verts[1][0] + verts[2][0]) / 3, cy = (verts[0][1] + verts[1][1] + verts[2][1]) / 3;
        var dx = z[0] - cx, dy = z[1] - cy, n = Math.sqrt(dx * dx + dy * dy) || 1;
        ctx.fillText(names[i], p[0] + dx / n * 16 - 5, p[1] - dy / n * 16 + 5);
      });

      var ang = [angleAt(0), angleAt(1), angleAt(2)], sum = ang[0] + ang[1] + ang[2];
      function deg(x) { return (x * 180 / Math.PI).toFixed(1) + '°'; }
      out.a.textContent = deg(ang[0]);
      out.b.textContent = deg(ang[1]);
      out.c.textContent = deg(ang[2]);
      out.sum.textContent = deg(sum);
      out.area.textContent = (Math.PI - sum).toFixed(3);
    }
    function pointer(e) {
      var box = canvas.getBoundingClientRect();
      return [(e.clientX - box.left - box.width / 2) / (box.width * 0.48), -(e.clientY - box.top - box.height / 2) / (box.width * 0.48)];
    }
    canvas.addEventListener('pointerdown', function (e) {
      var z = pointer(e), best = 0.12;
      drag = -1;
      verts.forEach(function (v, i) {
        var d = Math.sqrt(abs2(sub(v, z)));
        if (d < best) { best = d; drag = i; }
      });
      if (drag >= 0) canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', function (e) {
      if (drag < 0) return;
      var z = pointer(e), n = Math.sqrt(abs2(z));
      verts[drag] = n > 0.97 ? [z[0] / n * 0.97, z[1] / n * 0.97] : z;
      draw();
    });
    ['pointerup', 'pointercancel'].forEach(function (name) {
      canvas.addEventListener(name, function () { drag = -1; });
    });
    window.addEventListener('resize', draw);
    draw();
  }

  document.querySelectorAll('[data-viz="tiling"]').forEach(tilingFigure);
  document.querySelectorAll('[data-viz="modular"]').forEach(modularFigure);
  document.querySelectorAll('[data-viz="triangle"]').forEach(triangleFigure);
})();
