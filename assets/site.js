/* ── Minecraft grid ── */
const BREAKING_ENABLED = false; // set true to re-enable breaking, the mole and the Conway page
const CELL_SIZE     = 96; // fixed px — never changes with window size
const HOLD_DURATION  = 200;
const REGEN_DELAY    = 300;
const PARTICLE_COLORS = ['#888','#777','#666','#999','#555','#aaa','#444'];

let cells    = [];
let cellSize = 0;
let gridCols = 0;
const holding = {};
const regenTimers = {};

// Conway mode state (shared so pattern spawning can write into it)
let conwayActive = false;
let conwayState  = null;
let conwayRows   = 0;

function isBehindText(cell) {
  const wrapper = document.querySelector('.wrapper');
  if (!wrapper) return false;
  const cr = cell.getBoundingClientRect();
  const wr = wrapper.getBoundingClientRect();
  return !(cr.right < wr.left || cr.left > wr.right ||
           cr.bottom < wr.top || cr.top > wr.bottom);
}

function buildGrid() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  cellSize = CELL_SIZE;
  const cols = Math.ceil(vw / cellSize) + 1;
  gridCols = cols;
  const rows = Math.ceil(vh / cellSize) + 1;

  const grid = document.getElementById('mc-grid');
  grid.classList.toggle('disabled', !BREAKING_ENABLED);
  grid.innerHTML = '';
  cells = [];
  Object.keys(holding).forEach(i => cancelHold(parseInt(i)));
  Object.values(regenTimers).forEach(clearTimeout);

  grid.style.width  = (cols * cellSize) + 'px';
  grid.style.height = (rows * cellSize) + 'px';
  grid.style.gridTemplateColumns = `repeat(${cols}, ${cellSize}px)`;
  grid.style.gridTemplateRows    = `repeat(${rows}, ${cellSize}px)`;

  for (let i = 0; i < cols * rows; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    const wrap = document.createElement('div');
    wrap.className = 'pr-wrap';
    ['pr-t','pr-r','pr-b','pr-l'].forEach(cls => {
      const s = document.createElement('span');
      s.className = cls;
      wrap.appendChild(s);
    });
    cell.appendChild(wrap);

    cell.addEventListener('mousedown', e => { if (e.button === 0) startHold(i, cell); });
    cell.addEventListener('mouseup',    () => cancelHold(i));
    cell.addEventListener('mouseleave', () => cancelHold(i));
    cell.addEventListener('contextmenu', e => e.preventDefault());

    cells.push(cell);
    grid.appendChild(cell);
  }
}

function setRing(cell, pct) {
  const p = pct * 4;
  const [t, r, b, l] = cell.querySelectorAll('.pr-wrap span');
  t.style.width  = (Math.min(p, 1) * 100) + '%';
  r.style.height = (Math.max(0, Math.min(p - 1, 1)) * 100) + '%';
  b.style.width  = (Math.max(0, Math.min(p - 2, 1)) * 100) + '%';
  l.style.height = (Math.max(0, Math.min(p - 3, 1)) * 100) + '%';
}

function startHold(i, cell) {
  if (!BREAKING_ENABLED) return;
  if (conwayActive) { spawnConwayPattern(i); return; }
  if (holding[i]) return;
  if (regenTimers[i]) {
    clearTimeout(regenTimers[i]);
    delete regenTimers[i];
    cell.classList.remove('regen', 'broken');
  }
  if (cell.classList.contains('broken')) return;

  cell.classList.add('breaking');
  const start = performance.now();

  function tick(now) {
    const pct = Math.min((now - start) / HOLD_DURATION, 1);
    setRing(cell, pct);
    if (pct < 1) {
      holding[i].raf = requestAnimationFrame(tick);
    } else {
      breakBlock(i, cell);
    }
  }

  holding[i] = { raf: requestAnimationFrame(tick) };
}

function cancelHold(i) {
  if (!holding[i]) return;
  cancelAnimationFrame(holding[i].raf);
  delete holding[i];
  const cell = cells[i];
  if (cell && !cell.classList.contains('broken')) {
    cell.classList.remove('breaking');
    setRing(cell, 0);
  }
}

function breakBlock(i, cell) {
  cancelAnimationFrame(holding[i]?.raf);
  delete holding[i];
  cell.classList.remove('breaking');
  cell.classList.add('broken');
  setRing(cell, 0);
  spawnParticles(cell);

  if (isBehindText(cell)) {
    regenTimers[i] = setTimeout(() => {
      delete regenTimers[i];
      cell.classList.remove('broken');
      cell.classList.add('regen');
      cell.addEventListener('transitionend', function cleanup() {
        cell.classList.remove('regen');
        cell.removeEventListener('transitionend', cleanup);
      });
    }, REGEN_DELAY);
  }
}

function spawnParticles(cell) {
  const rect  = cell.getBoundingClientRect();
  const cx    = rect.left + rect.width  / 2;
  const cy    = rect.top  + rect.height / 2;
  const count = 10 + Math.floor(Math.random() * 6);

  for (let p = 0; p < count; p++) {
    const el   = document.createElement('div');
    el.className = 'particle';
    const size = 4 + Math.floor(Math.random() * 6);
    el.style.width      = size + 'px';
    el.style.height     = size + 'px';
    el.style.background = PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];
    el.style.left = cx + 'px';
    el.style.top  = cy + 'px';
    document.body.appendChild(el);

    const angle    = Math.random() * Math.PI * 2;
    const speed    = 60 + Math.random() * 100;
    const vx       = Math.cos(angle) * speed;
    const vy       = Math.sin(angle) * speed - 80;
    const gravity  = 280;
    const duration = 0.5 + Math.random() * 0.3;
    const start    = performance.now();

    (function animate(now) {
      const t = (now - start) / 1000;
      if (t > duration) { el.remove(); return; }
      el.style.left    = (cx + vx * t) + 'px';
      el.style.top     = (cy + vy * t + 0.5 * gravity * t * t) + 'px';
      el.style.opacity = 1 - t / duration;
      requestAnimationFrame(animate);
    })(performance.now());
  }
}

window.addEventListener('mouseup',  () => Object.keys(holding).forEach(i => cancelHold(parseInt(i))));
window.addEventListener('resize',   buildGrid);
buildGrid();

/* ── Contact dropdown ── */
const contactWrap = document.querySelector('.contact-wrap');
let contactCloseTimer = null;
const CLOSE_DURATION = (0.21 + 0.18) * 1000 + 40;

function openContact() {
  clearTimeout(contactCloseTimer);
  contactWrap.classList.remove('closing');
  contactWrap.classList.add('open');
}

function closeContact() {
  contactWrap.classList.remove('open');
  contactWrap.classList.add('closing');
  contactCloseTimer = setTimeout(() => {
    contactWrap.classList.remove('closing');
  }, CLOSE_DURATION);
}

const contactDropdown = document.querySelector('.contact-dropdown');

// touch screens have no hover, so Contact opens and closes on tap instead
const canHover = () => window.matchMedia('(hover: hover)').matches;

[contactWrap, contactDropdown].forEach(el => {
  el.addEventListener('mouseenter', () => { if (canHover()) openContact(); });
  el.addEventListener('mouseleave', () => { if (canHover()) closeContact(); });
});
document.querySelector('.contact-label').addEventListener('click', () => {
  if (canHover()) return;
  if (contactWrap.classList.contains('open')) closeContact();
  else openContact();
});

/* ── Pixel mole ── */
// 9x9 sprite: 0=transparent, 1=dark gray, 2=light gray body, 3=black eye, 4=mid gray nose
const MOLE_PS = 4; // canvas px per sprite pixel
const MOLE_SPRITE = [
  [0,0,1,1,1,1,1,0,0],
  [0,1,2,2,2,2,2,1,0],
  [1,1,2,2,2,2,2,1,1],
  [1,2,3,2,2,2,3,2,1],
  [1,1,2,2,4,2,2,1,1],
  [1,1,2,4,4,4,2,1,1],
  [0,1,1,2,2,2,1,1,0],
  [0,0,1,1,1,1,1,0,0],
  [0,0,0,0,0,0,0,0,0],
];
const MOLE_COLORS = [null, '#444', '#ddd', '#000', '#999'];
const MOLE_COLS   = MOLE_SPRITE[0].length;
const MOLE_ROWS   = MOLE_SPRITE.length;
const MOLE_W = MOLE_COLS * MOLE_PS;
const MOLE_H = MOLE_ROWS * MOLE_PS;
const MAX_PEEK_ROWS = 5; // sprite rows revealed at full peek
const STEP_MS = 60;      // ms per sprite-pixel-row reveal step

const moleWrap   = document.getElementById('mole-wrap');
const moleCanvas = document.getElementById('mole-canvas');
moleCanvas.width  = MOLE_W;
moleCanvas.height = MOLE_H;
moleWrap.style.width = MOLE_W + 'px';

function drawSprite(flipped) {
  const ctx = moleCanvas.getContext('2d');
  ctx.clearRect(0, 0, MOLE_W, MOLE_H);
  const rows = flipped ? [...MOLE_SPRITE].reverse() : MOLE_SPRITE;
  rows.forEach((row, y) => {
    row.forEach((c, x) => {
      if (!c) return;
      ctx.fillStyle = MOLE_COLORS[c];
      ctx.fillRect(x * MOLE_PS, y * MOLE_PS, MOLE_PS, MOLE_PS);
    });
  });
}

drawSprite(false);

let moleTimer    = null;
let moleInterval = null;
let moleDir      = 'bottom';
let moleVisible  = false;
let molePeekCell = null;
let waveTimeouts = [];

/* ── Click the mole ── */
moleWrap.addEventListener('click', () => {
  if (moleVisible) catchMole();
});

function catchMole() {
  moleVisible = false;
  clearInterval(moleInterval);
  clearTimeout(moleTimer);
  moleWrap.style.height        = '0px';
  moleWrap.style.pointerEvents = 'none';

  const originCell = molePeekCell;
  molePeekCell = null;

  waveTimeouts.forEach(clearTimeout);
  waveTimeouts = [];

  if (!originCell) { scheduleMole(); return; }

  const originIdx = cells.indexOf(originCell);
  const originCol = originIdx % gridCols;
  const originRow = Math.floor(originIdx / gridCols);

  const CELL_MS = 30;
  const HOLD_MS = 80;
  const FADE_MS = 700;
  let maxDelay = 0;

  cells.forEach((cell, idx) => {
    const col  = idx % gridCols;
    const row  = Math.floor(idx / gridCols);
    const dist = Math.sqrt((col - originCol) ** 2 + (row - originRow) ** 2);
    const delay = Math.round(dist * CELL_MS);
    if (delay > maxDelay) maxDelay = delay;

    const gray  = Math.min(20 + Math.round(dist * 16), 220);
    const color = `rgb(${gray},${gray},${gray})`;

    const t1 = setTimeout(() => {
      cell.style.transition = 'background 0.04s';
      cell.style.background = color;
    }, delay);

    const t2 = setTimeout(() => {
      cell.style.transition = `background ${FADE_MS}ms ease-out`;
      cell.style.background = '#fff';
    }, delay + HOLD_MS);

    const t3 = setTimeout(() => {
      cell.classList.remove('broken', 'regen', 'breaking');
      cell.style.transition = '';
      cell.style.background = '';
      setRing(cell, 0);
      if (regenTimers[idx]) { clearTimeout(regenTimers[idx]); delete regenTimers[idx]; }
    }, delay + HOLD_MS + FADE_MS + 50);

    waveTimeouts.push(t1, t2, t3);
  });

  const t4 = setTimeout(() => {
    const scheduleNext = typeOneLine();
    if (scheduleNext) scheduleMole();
  }, maxDelay + HOLD_MS + FADE_MS + 400);
  waveTimeouts.push(t4);
}

/* ── Catch sequence ── */
const CATCH_WORDS   = ['one.', ' two.', ' three.', ' almost there...', ' one more...', ' masterful!'];
const aboutOrigHTML = document.getElementById('about')?.innerHTML;
let catchCount  = 0;
let catchPara   = null; // the shared <p> all words are typed into

// Returns true if the mole should be re-scheduled after this catch
function typeOneLine() {
  const wordIdx = catchCount;
  catchCount++;

  const word = CATCH_WORDS[wordIdx];
  const isFinal = catchCount >= CATCH_WORDS.length;

  if (wordIdx === 0) {
    // first catch: create the paragraph
    const about = document.getElementById('about');
    about.appendChild(document.createElement('br'));
    catchPara = document.createElement('p');
    about.appendChild(catchPara);
  }

  // type the word character by character
  let i = 0;
  const iv = setInterval(() => {
    catchPara.textContent += word[i++];
    if (i >= word.length) {
      clearInterval(iv);
      if (isFinal) setTimeout(finaleWipe, 2000);
    }
  }, 80);

  return !isFinal; // schedule mole only if not the last catch
}

function finaleWipe() {
  // hide any active mole
  clearInterval(moleInterval);
  clearTimeout(moleTimer);
  moleWrap.style.height        = '0px';
  moleWrap.style.pointerEvents = 'none';
  moleVisible = false;

  waveTimeouts.forEach(clearTimeout);
  waveTimeouts = [];

  const CELL_MS = 30;
  const HOLD_MS = 80;
  const FADE_MS = 700;
  const cx = window.innerWidth  / 2;
  const cy = window.innerHeight / 2;
  let maxDelay = 0;

  cells.forEach((cell, idx) => {
    const rect   = cell.getBoundingClientRect();
    const cellCx = rect.left + rect.width  / 2;
    const cellCy = rect.top  + rect.height / 2;
    const dist   = Math.sqrt((cellCx - cx) ** 2 + (cellCy - cy) ** 2) / cellSize;
    const delay  = Math.round(dist * CELL_MS);
    if (delay > maxDelay) maxDelay = delay;

    const gray  = Math.min(20 + Math.round(dist * 16), 220);
    const color = `rgb(${gray},${gray},${gray})`;

    const t1 = setTimeout(() => {
      cell.style.transition = 'background 0.04s';
      cell.style.background = color;
    }, delay);

    const t2 = setTimeout(() => {
      cell.style.transition = `background ${FADE_MS}ms ease-out`;
      cell.style.background = '#000';
    }, delay + HOLD_MS);

    const t3 = setTimeout(() => {
      cell.classList.remove('broken', 'regen', 'breaking');
      cell.style.transition = '';
      cell.style.background = '#000'; // stay black
      setRing(cell, 0);
      if (regenTimers[idx]) { clearTimeout(regenTimers[idx]); delete regenTimers[idx]; }
    }, delay + HOLD_MS + FADE_MS + 50);

    waveTimeouts.push(t1, t2, t3);
  });

  // after wipe: hide site text, reveal quote, then start Conway
  const tFinal = setTimeout(() => {
    document.getElementById('site').style.opacity = '0';
    const overlay = document.getElementById('quote-overlay');
    overlay.style.display = 'block';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      overlay.style.opacity = '1';
    }));
    setTimeout(startConwayLife, 1200);
  }, maxDelay + HOLD_MS + FADE_MS + 400);
  waveTimeouts.push(tFinal);
}

function brokenCells() {
  return cells.filter(c => c.classList.contains('broken'));
}

function scheduleMole() {
  const delay = (1 + Math.random() * 9) * 1000;
  moleTimer = setTimeout(showMole, delay);
}

function showMole() {
  const options = [];
  cells.forEach((cell, idx) => {
    if (!cell.classList.contains('broken')) return;
    // bottom peek: neighbor below must exist and be white
    const below = cells[idx + gridCols];
    if (below && !below.classList.contains('broken')) {
      options.push({ cell, dir: 'bottom' });
    }
    // top peek: neighbor above must exist and be white
    const above = cells[idx - gridCols];
    if (above && !above.classList.contains('broken')) {
      options.push({ cell, dir: 'top' });
    }
  });

  if (options.length === 0) { scheduleMole(); return; }

  const { cell, dir } = options[Math.floor(Math.random() * options.length)];
  moleDir      = dir;
  molePeekCell = cell;
  moleVisible  = true;
  moleWrap.style.pointerEvents = 'auto';
  const rect   = cell.getBoundingClientRect();
  const peekPx = MAX_PEEK_ROWS * MOLE_PS;

  drawSprite(dir === 'top'); // flipped for ceiling peek

  moleWrap.style.left   = (rect.left + rect.width / 2 - MOLE_W / 2) + 'px';
  moleWrap.style.height = peekPx + 'px';

  let canvasTop, targetTop, step, done;

  if (dir === 'bottom') {
    // wrapper at bottom of cell; canvas slides UP (peekPx → 0)
    moleWrap.style.top = (rect.bottom - peekPx) + 'px';
    canvasTop = peekPx;
    targetTop = 0;
    step      = -MOLE_PS;
    done      = () => canvasTop <= 0;
  } else {
    // wrapper at top of cell; canvas starts above and slides DOWN
    // head tip (at canvas bottom in flipped sprite) appears first at ceiling edge
    moleWrap.style.top = rect.top + 'px';
    canvasTop = -(MOLE_H - MOLE_PS); // only 1 row (head tip) would be visible at start
    targetTop = -(MOLE_H - peekPx);
    step      = +MOLE_PS;
    done      = () => canvasTop >= targetTop;
  }

  moleCanvas.style.top = canvasTop + 'px';

  moleInterval = setInterval(() => {
    canvasTop += step;
    moleCanvas.style.top = canvasTop + 'px';
    if (done()) {
      clearInterval(moleInterval);
      moleTimer = setTimeout(retractMole, 2000);
    }
  }, STEP_MS);
}

function retractMole() {
  moleVisible  = false;
  moleWrap.style.pointerEvents = 'none';
  const peekPx = MAX_PEEK_ROWS * MOLE_PS;
  let canvasTop = parseInt(moleCanvas.style.top);
  const step = moleDir === 'bottom' ? +MOLE_PS : -MOLE_PS;
  const done = moleDir === 'bottom'
    ? () => canvasTop >= peekPx
    : () => canvasTop <= -MOLE_H;

  moleInterval = setInterval(() => {
    canvasTop += step;
    moleCanvas.style.top = canvasTop + 'px';
    if (done()) {
      clearInterval(moleInterval);
      scheduleMole();
    }
  }, STEP_MS);
}

/* ── Conway's Game of Life ── */
let conwayInterval = null;

// ── Clickable patterns (offsets from center cell) ──────────────────────
const CONWAY_PATTERNS = {
  glider: {
    name: 'Glider',
    cells: [[0,-1],[1,0],[-1,1],[0,1],[1,1]]
  },
  lwss: {
    name: 'Spaceship',
    // raw LWSS: [0,0],[3,0],[4,1],[0,2],[4,2],[1,3],[2,3],[3,3],[4,3], centered at (2,1)
    cells: [[-2,-1],[1,-1],[2,0],[-2,1],[2,1],[-1,2],[0,2],[1,2],[2,2]]
  },
  pulsar: {
    name: 'Pulsar',
    cells: [
      [-4,-6],[-3,-6],[-2,-6],[2,-6],[3,-6],[4,-6],
      [-6,-4],[-1,-4],[1,-4],[6,-4],
      [-6,-3],[-1,-3],[1,-3],[6,-3],
      [-6,-2],[-1,-2],[1,-2],[6,-2],
      [-4,-1],[-3,-1],[-2,-1],[2,-1],[3,-1],[4,-1],
      [-4,1],[-3,1],[-2,1],[2,1],[3,1],[4,1],
      [-6,2],[-1,2],[1,2],[6,2],
      [-6,3],[-1,3],[1,3],[6,3],
      [-6,4],[-1,4],[1,4],[6,4],
      [-4,6],[-3,6],[-2,6],[2,6],[3,6],[4,6]
    ]
  },
  gun: {
    name: 'Glider Gun',
    // Gosper glider gun, centered (~col 18, row 4 is its center of mass)
    cells: (function(){
      const raw = [
        [24,0],[22,1],[24,1],[12,2],[13,2],[20,2],[21,2],[34,2],[35,2],
        [11,3],[15,3],[20,3],[21,3],[34,3],[35,3],
        [0,4],[1,4],[10,4],[16,4],[20,4],[21,4],
        [0,5],[1,5],[10,5],[14,5],[16,5],[17,5],[22,5],[24,5],
        [10,6],[16,6],[24,6],[11,7],[15,7],[12,8],[13,8]
      ];
      const ox = 18, oy = 4;
      return raw.map(([c,r]) => [c - ox, r - oy]);
    })()
  },
  acorn: {
    name: 'Acorn',
    cells: [[-3,0],[-2,0],[-2,-2],[0,-1],[1,0],[2,0],[3,0]]
  }
};

const PATTERN_KEYS = Object.keys(CONWAY_PATTERNS);

function spawnConwayPattern(cellIdx) {
  if (!conwayState) return;
  const cols = gridCols;
  const col  = cellIdx % cols;
  const row  = Math.floor(cellIdx / cols);
  const key  = PATTERN_KEYS[Math.floor(Math.random() * PATTERN_KEYS.length)];
  const pat  = CONWAY_PATTERNS[key];
  pat.cells.forEach(([dc, dr]) => {
    const c = col + dc, r = row + dr;
    if (c >= 0 && c < cols && r >= 0 && r < conwayRows)
      conwayState[r * cols + c] = 1;
  });
  // immediately render the new cells
  conwayState.forEach((val, idx) => {
    const cell = cells[idx];
    if (!cell) return;
    cell.style.background = val ? '#e8e8e8' : '#000';
  });
}

function startConwayLife() {
  const cols = gridCols;
  const rows = Math.ceil(cells.length / cols);
  conwayRows  = rows;
  conwayActive = true;

  const alive = new Uint8Array(cols * rows);

  function seed(anchorCol, anchorRow, pattern) {
    pattern.forEach(([dc, dr]) => {
      const c = anchorCol + dc, r = anchorRow + dr;
      if (c >= 0 && c < cols && r >= 0 && r < rows)
        alive[r * cols + c] = 1;
    });
  }

  const rPento  = [[1,0],[2,0],[0,1],[1,1],[1,2]];
  const acorn   = [[0,0],[1,0],[1,2],[3,1],[4,0],[5,0],[6,0]];
  const glider  = [[1,0],[2,1],[0,2],[1,2],[2,2]];
  const diehard = [[6,0],[0,1],[1,1],[1,2],[5,2],[6,2],[7,2]];

  const midC = Math.floor(cols / 2);
  const midR = Math.floor(rows / 2);

  seed(midC - 2,                      midR - 4,                      rPento);
  seed(midC + 6,                      midR + 1,                      acorn);
  seed(Math.floor(cols * 0.15) + 1,   Math.floor(rows * 0.2)  - 1,  glider);
  seed(Math.floor(cols * 0.7)  + 1,   Math.floor(rows * 0.7)  - 1,  glider.map(([c,r]) => [c, -r + 4]));
  seed(Math.floor(cols * 0.25) + 1,   Math.floor(rows * 0.65) - 1,  rPento);
  seed(Math.floor(cols * 0.65) + 1,   Math.floor(rows * 0.2)  - 1,  diehard);
  seed(midC - 7,                      midR + 5,                      acorn.map(([c,r]) => [-c + 6, r]));

  conwayState = alive;

  // Show veil (opaque black), then fade it out so cells emerge from darkness
  const veil = document.getElementById('conway-veil');
  veil.style.display  = 'block';
  veil.style.opacity  = '1';
  veil.style.transition = 'none';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    veil.style.transition = 'opacity 1.6s ease';
    veil.style.opacity    = '0';
  }));

  function applyToGrid() {
    conwayState.forEach((val, idx) => {
      const cell = cells[idx];
      if (!cell) return;
      cell.style.transition = 'background 0.15s ease';
      cell.style.background = val ? '#e8e8e8' : '#000';
    });
  }

  function step() {
    const next = new Uint8Array(conwayState.length);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let n = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols)
              n += conwayState[nr * cols + nc];
          }
        }
        const cur = conwayState[r * cols + c];
        next[r * cols + c] = (cur && (n === 2 || n === 3)) || (!cur && n === 3) ? 1 : 0;
      }
    }
    conwayState = next;
  }

  applyToGrid();

  conwayInterval = setInterval(() => {
    step();
    applyToGrid();
  }, 70);

  // After 3.5 s show the back button — but keep simulation running
  setTimeout(showBackButton, 3500);
}

function showBackButton() {
  const btn = document.getElementById('back-btn');
  btn.style.display = 'flex';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    btn.style.opacity = '1';
  }));
}

function resetAll() {
  if (conwayInterval) { clearInterval(conwayInterval); conwayInterval = null; }
  conwayActive = false;
  conwayState  = null;
  waveTimeouts.forEach(clearTimeout);
  waveTimeouts = [];

  const veil = document.getElementById('conway-veil');
  veil.style.opacity = '0';
  veil.style.display = 'none';

  const btn = document.getElementById('back-btn');
  btn.style.opacity = '0';
  btn.style.display = 'none';

  const overlay = document.getElementById('quote-overlay');
  overlay.style.opacity = '0';
  overlay.style.display = 'none';

  document.getElementById('site').style.opacity = '1';

  cells.forEach((cell, idx) => {
    cell.classList.remove('broken', 'regen', 'breaking');
    cell.style.transition = '';
    cell.style.background = '';
    setRing(cell, 0);
    if (regenTimers[idx]) { clearTimeout(regenTimers[idx]); delete regenTimers[idx]; }
  });

  document.getElementById('about').innerHTML = aboutOrigHTML;
  catchCount  = 0;
  catchPara   = null;

  clearInterval(moleInterval);
  clearTimeout(moleTimer);
  moleWrap.style.height        = '0px';
  moleWrap.style.pointerEvents = 'none';
  moleVisible  = false;
  molePeekCell = null;

  scheduleMole();
}

document.getElementById('back-btn').addEventListener('click', resetAll);

if (BREAKING_ENABLED) scheduleMole();
