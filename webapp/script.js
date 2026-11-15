(() => {
  const canvas = document.querySelector('#data-canvas');
  const ctx = canvas.getContext('2d');
  const video = document.querySelector('#co-video');
  const stage = document.querySelector('#visual-stage');
  const screen = document.querySelector('#screen-bezel');
  const zone = document.querySelector('#zone-select');
  const announcer = document.querySelector('#announcer');
  const playButton = document.querySelector('#play-toggle');
  const restartButton = document.querySelector('#restart-button');
  const datasets = {
    carbon: { title: 'Carbon monoxide', detail: 'Atmospheric trace · satellite visualization', kind: 'carbon', base: 0.48, anomaly: 0.16 },
    wildfire: { title: 'Wildfire smoke', detail: 'Aerosol spread · illustrative sample data', kind: 'wildfire', base: 0.63, anomaly: 0.29 },
    ocean: { title: 'Ocean temperature', detail: 'Sea surface · illustrative sample data', kind: 'ocean', base: 0.35, anomaly: 0.12 }
  };
  const scale = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22]; // pentatonic steps
  let selected = null, colorFilter = 'all', selectedZone = 'all', audio = null, master = null;
  let playing = false, beat = 0, timer = null, animation = 0, reducedMotion = false, frame = 0;
  const STEP = .5, COLS = 24, ROWS = 24, SWEEP = 12, tracks = {}, sonic = {};
  let pos = 0, rate = 1, lastStep = -1, lastTs = 0, dur = 39.2, dragged = false, holding = false, noteSet = null, bus = null, droneG = null, droneF = null, sonicKey = '';
  const pixelCanvas = document.createElement('canvas');
  pixelCanvas.width = 64; pixelCanvas.height = 36;
  const pixelContext = pixelCanvas.getContext('2d', { willReadFrequently: true });
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

  function announce(message) { announcer.textContent = ''; requestAnimationFrame(() => { announcer.textContent = message; }); }
  function resizeCanvas() {
    const rect = stage.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  function valueAt(x, y, t = pos * .7) {
    const d = datasets[selected] || datasets.ocean;
    if (selected === 'carbon' && video.readyState >= 2) {
      try {
        pixelContext.drawImage(video, 0, 0, pixelCanvas.width, pixelCanvas.height);
        const pixel = pixelContext.getImageData(Math.floor(x * 63), Math.floor(y * 35), 1, 1).data;
        return clamp((pixel[0] * .2126 + pixel[1] * .7152 + pixel[2] * .0722) / 255, 0, 1);
      } catch { /* Keep the sonification available if a browser blocks video pixel sampling. */ }
    }
    const wave = Math.sin(x * 8 + t) * Math.cos(y * 6 - t * .7);
    const plume = Math.exp(-((x - .67 - Math.sin(t * .45) * .08) ** 2 / .06 + (y - .47) ** 2 / .2));
    const ocean = .5 + .24 * Math.sin(x * 5 + t * .35) + .19 * Math.cos(y * 4 - t * .22) + .1 * wave;
    const raw = selected === 'wildfire' ? .25 + .34 * (wave + 1) / 2 + plume * .46 : selected === 'ocean' ? ocean : .2 + .45 * (wave + 1) / 2 + plume * .3;
    return clamp((raw - d.base + .42) / .84, 0, 1);
  }
  function paint() {
    if (!selected || selected === 'carbon') return;
    const box = stage.getBoundingClientRect(), w = box.width, h = box.height;
    if (!w || !h) return;
    const cols = Math.max(32, Math.ceil(w / 10)), rows = Math.max(20, Math.ceil(h / 10));
    ctx.clearRect(0, 0, w, h);
    const gradient = ctx.createLinearGradient(0, h, w, 0);
    if (selected === 'wildfire') { gradient.addColorStop(0, '#282045'); gradient.addColorStop(.45, '#9e5e46'); gradient.addColorStop(1, '#ff5a2b'); }
    else { gradient.addColorStop(0, '#1a3a78'); gradient.addColorStop(.5, '#6f7cbd'); gradient.addColorStop(1, '#ffeb6c'); }
    ctx.fillStyle = '#1d1633'; ctx.fillRect(0, 0, w, h);
    for (let iy = 0; iy < rows; iy++) for (let ix = 0; ix < cols; ix++) {
      const x = (ix + .5) / cols, y = (iy + .5) / rows, val = valueAt(x, y);
      const hot = val > .79, matchesColor = colorFilter === 'all' || (colorFilter === 'warm' ? val > .58 : val <= .58);
      const matchesZone = selectedZone === 'all' || (selectedZone === 'north' ? y < .34 : selectedZone === 'center' ? y >= .34 && y < .68 : y >= .68);
      ctx.globalAlpha = (matchesColor && matchesZone ? .3 + val * .66 : .1) * (hot ? .95 : 1);
      ctx.fillStyle = gradient; ctx.fillRect(ix * w / cols, iy * h / rows, w / cols + 1, h / rows + 1);
      if (hot && matchesZone && matchesColor && ((ix + iy) % 13 === 0)) { ctx.globalAlpha = .65; ctx.fillStyle = '#ffeb6c'; ctx.beginPath(); ctx.arc(x * w, y * h, 1.6 + val * 2, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    if (selectedZone !== 'all') {
      const bounds = selectedZone === 'north' ? [0, h / 3] : selectedZone === 'center' ? [h / 3, h * 2 / 3] : [h * 2 / 3, h];
      ctx.strokeStyle = '#ffeb6c'; ctx.lineWidth = 2; ctx.setLineDash([7, 5]); ctx.strokeRect(2, bounds[0] + 1, w - 4, bounds[1] - bounds[0] - 2); ctx.setLineDash([]);
    }
    frame++;
  }
  function ensureAudio() {
    if (!audio) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) { announce('Web Audio is unavailable in this browser.'); return false; }
      audio = new AudioContext(); master = audio.createGain(); master.gain.value = Number(document.querySelector('#volume').value) / 100; master.connect(audio.destination); buildFx();
    }
    if (audio.state === 'suspended') audio.resume();
    return true;
  }
  // Una línea recorre la Tierra de norte a sur (SWEEP s por pasada). Cada medio segundo se toca lo que hay bajo ella, de oeste a este.
  const inside = (id, c, r) => id !== 'carbon' || ((c + .5) / COLS - .5) ** 2 + ((r + .5) / ROWS - .5) ** 2 < .25;
  const band = () => selectedZone === 'north' ? [0, 1 / 3] : selectedZone === 'center' ? [1 / 3, 2 / 3] : selectedZone === 'south' ? [2 / 3, 1] : [0, 1];
  const sweepY = p => { const [a, b] = band(); return a + (b - a) * ((p / SWEEP) % 1); };
  const rowOf = y => Math.min(ROWS - 1, Math.max(0, Math.floor(y * ROWS)));
  const passes = v => colorFilter === 'all' || (colorFilter === 'warm' ? v >= .45 : v < .45);
  function soft(id, i, c, r) { let t = 0, k = 0; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const cc = c + dc, rr = r + dr; if (cc < 0 || rr < 0 || cc >= COLS || rr >= ROWS) continue; t += cell(id, i, cc, rr); k++; } return t / k; }
  function profileAt(id, p) {
    const i = Math.floor(p / STEP), r = rowOf(sweepY(p)), cols = [];
    for (let c = 0; c < COLS; c++) if (inside(id, c, r)) cols.push(c);
    return { i, r, cols, vals: cols.map(c => soft(id, i, c, r)) };
  }
  function rebuildSonic() {
    const id = selected, n = stepsN(), arr = new Float32Array(n);
    for (let j = 0; j < n; j++) { const ok = profileAt(id, j * STEP + .001).vals.filter(passes); arr[j] = ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : 0; }
    const mx = Math.max(...arr, .01); for (let j = 0; j < n; j++) arr[j] /= mx;
    sonic[id] = arr;
  }
  function buildFx() { // eco suave + un colchón grave que se abre cuando hay más monóxido
    bus = audio.createGain(); bus.connect(master);
    const dl = audio.createDelay(1), fb = audio.createGain(), wet = audio.createGain(), damp = audio.createBiquadFilter();
    dl.delayTime.value = .32; fb.gain.value = .34; wet.gain.value = .3; damp.type = 'lowpass'; damp.frequency.value = 2200;
    bus.connect(dl); dl.connect(damp); damp.connect(fb); fb.connect(dl); damp.connect(wet); wet.connect(master);
    droneF = audio.createBiquadFilter(); droneF.type = 'lowpass'; droneF.frequency.value = 400; droneG = audio.createGain(); droneG.gain.value = 0;
    [[110, 'triangle', 1], [164.81, 'sine', .6]].forEach(([f, type, a]) => { const o = audio.createOscillator(), x = audio.createGain(); o.type = type; o.frequency.value = f; x.gain.value = a; o.connect(x); x.connect(droneF); o.start(); });
    droneF.connect(droneG); droneG.connect(master);
  }
  function voice(freq, when, vel, bell) {
    const o = audio.createOscillator(), o2 = audio.createOscillator(), g = audio.createGain(), g2 = audio.createGain(), lp = audio.createBiquadFilter();
    o.type = 'triangle'; o2.type = 'sine'; o.frequency.value = freq; o2.frequency.value = freq * (bell ? 2.76 : 2); g2.gain.value = bell ? .5 : .22;
    lp.type = 'lowpass'; lp.frequency.value = rate < 0 ? 900 : 4200;
    g.gain.setValueAtTime(.0001, when); g.gain.exponentialRampToValueAtTime(vel, when + .012); g.gain.exponentialRampToValueAtTime(.0001, when + (bell ? 1.1 : .75));
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(lp); lp.connect(bus);
    o.start(when); o2.start(when); o.stop(when + 1.2); o2.stop(when + 1.2);
  }
  function playStep(i) {
    if (!audio || !master || !bus || !selected || !tracks[selected]) return;
    const d = datasets[selected], prof = profileAt(selected, Math.max(0, i) * STEP + .001), n = prof.cols.length; if (!n) return;
    const picks = [0, 1, 2, 3].map(k => Math.min(n - 1, Math.floor((k + .5) / 4 * n)));
    const order = rate < 0 ? picks.slice().reverse() : picks, gap = .125 / Math.min(2, Math.abs(rate)), t0 = audio.currentTime + .02, items = [];
    order.forEach((idx, k) => {
      const v = prof.vals[idx], on = v >= .08 && passes(v); items.push({ c: prof.cols[idx], v, on });
      if (on) voice(220 * Math.pow(2, scale[Math.round(Math.pow(v, .75) * (scale.length - 1))] / 12), t0 + k * gap, .09 + v * .12, v > .8);
    });
    noteSet = { items, t0: performance.now(), gap: gap * 1000 };
    const mean = prof.vals.reduce((a, b) => a + b, 0) / n;
    if (droneF) droneF.frequency.setTargetAtTime(250 + mean * 1400, audio.currentTime, .4);
    if (i % 4 === 0) {
      const level = mean > .5 ? 'high' : mean > .25 ? 'elevated' : 'low', lat = prof.r < ROWS / 3 ? 'north' : prof.r < ROWS * 2 / 3 ? 'center' : 'south';
      document.querySelector('#data-readout').textContent = `${lat.toUpperCase()} · ${level.toUpperCase()} · ${Math.round(mean * 100)}%`;
      if (i % 16 === 0) announce(`${d.title}, ${lat} band: ${level} readings, ${Math.round(mean * 100)} percent.`);
    }
  }
  function setPlaying(next) {
    if (next && !ensureAudio()) return;
    playing = next; lastStep = -1;
    document.querySelectorAll('.record-card').forEach(button => button.classList.toggle('is-playing', playing && button.dataset.dataset === selected));
    document.querySelectorAll('.record-indicator').forEach(indicator => indicator.classList.toggle('is-playing', playing && indicator.dataset.indicator === selected));
    playButton.textContent = playing ? 'Ⅱ' : '▶';
    playButton.setAttribute('aria-label', playing ? 'Pause audio' : 'Play audio');
    const focusPlay = document.querySelector('#focus-play');
    focusPlay.textContent = playing ? 'Ⅱ Pause audio' : '▶ Play audio';
    focusPlay.setAttribute('aria-label', playing ? 'Pause audio' : 'Play audio');
    screen.classList.toggle('is-playing', playing);
    if (droneG) droneG.gain.setTargetAtTime(playing ? .05 : 0, audio.currentTime, .3);
  }
  function selectDataset(id) {
    const d = datasets[id]; if (!d) return;
    selected = id; pos = 0; rate = 1; lastStep = -1; holding = false; noteSet = null; frame = 0; selectedZone = 'all'; colorFilter = 'all';
    document.querySelectorAll('.record-card').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.dataset === id)));
    document.querySelectorAll('.color-button').forEach(button => { button.disabled = false; button.setAttribute('aria-pressed', String(button.dataset.color === 'all')); });
    zone.disabled = false; zone.value = 'all'; playButton.disabled = false; restartButton.disabled = false;
    rewBtn.disabled = fwdBtn.disabled = false; rewBtn.classList.remove('on'); fwdBtn.classList.remove('on'); scrubbers.forEach(x => { x.disabled = false; });
    document.querySelector('#focus-zone').disabled = false;
    document.querySelector('#focus-zone').value = 'all';
    document.querySelector('#focus-play').disabled = false;
    document.querySelectorAll('[data-focus-color]').forEach(button => { button.disabled = false; button.setAttribute('aria-pressed', String(button.dataset.focusColor === 'all')); });
    stage.dataset.kind = d.kind; stage.classList.add('has-data');
    document.querySelector('#screen-label').textContent = `NOW PLAYING · ${d.title.toUpperCase()}`;
    document.querySelector('#screen-index').textContent = id === 'carbon' ? '01' : id === 'wildfire' ? '02' : '03';
    document.querySelector('#stage-caption').textContent = `${d.title} · ${d.detail} · drag the globe or use ◀◀ ▶▶ to move through time`;
    document.querySelector('#data-readout').textContent = 'TUNING IN…';
    video.pause();
    if (id !== 'carbon' && !tracks[id]) buildProcedural(id);
    resizeCanvas(); paint();
    screen.classList.add('is-focused');
    setPlaying(true);
    announce(`${d.title} selected. Audio started. Use the rewind and forward buttons, the timeline, or the left and right arrow keys to move through time. Press Escape to return.`);
  }
  document.querySelectorAll('.record-card').forEach(button => button.addEventListener('click', () => selectDataset(button.dataset.dataset)));
  document.querySelectorAll('.color-button').forEach(button => button.addEventListener('click', () => {
    colorFilter = button.dataset.color; document.querySelectorAll('.color-button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    document.querySelectorAll('[data-focus-color]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.focusColor === colorFilter)));
    paint(); announce(`Listening to ${colorFilter === 'all' ? 'all colors' : `${colorFilter} tones`}.`);
  }));
  zone.addEventListener('change', () => { selectedZone = zone.value; document.querySelector('#focus-zone').value = selectedZone; paint(); announce(`Listening to ${selectedZone === 'all' ? 'the whole frame' : `the ${selectedZone} zone`}.`); });
  document.querySelector('#focus-zone').addEventListener('change', e => {
    selectedZone = e.target.value; zone.value = selectedZone; paint();
    announce(`Listening to ${selectedZone === 'all' ? 'the whole frame' : `the ${selectedZone} zone`}.`);
  });
  document.querySelectorAll('[data-focus-color]').forEach(button => button.addEventListener('click', () => {
    colorFilter = button.dataset.focusColor;
    document.querySelectorAll('[data-focus-color]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    document.querySelectorAll('.color-button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.color === colorFilter)));
    paint(); announce(`Listening to ${colorFilter === 'all' ? 'all colors' : `${colorFilter} tones`}.`);
  }));
  playButton.addEventListener('click', () => setPlaying(!playing));
  document.querySelector('#focus-play').addEventListener('click', () => setPlaying(!playing));
  restartButton.addEventListener('click', () => { rate = 1; rewBtn.classList.remove('on'); fwdBtn.classList.remove('on'); seek(0); if (!playing) return; setPlaying(true); announce('Visualization and audio restarted.'); });
  document.querySelector('#volume').addEventListener('input', e => { if (master) master.gain.setTargetAtTime(Number(e.target.value) / 100, audio.currentTime, .04); });
  function returnToJukebox() { screen.classList.remove('is-focused'); announce('Returned to the jukebox controls.'); }
  document.querySelector('#return-button').addEventListener('click', returnToJukebox);
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('#return-button')) { e.stopPropagation(); returnToJukebox(); } }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && screen.classList.contains('is-focused')) returnToJukebox(); });
  document.querySelector('#motion-toggle').addEventListener('click', e => {
    reducedMotion = !reducedMotion; e.currentTarget.setAttribute('aria-pressed', String(reducedMotion)); e.currentTarget.textContent = `Reduce motion: ${reducedMotion ? 'on' : 'off'}`;
    paint();
    announce(`Reduced motion ${reducedMotion ? 'on' : 'off'}.`);
  });
  canvas.addEventListener('click', e => {
    if (!selected || selected === 'carbon' || dragged) return;
    const rect = canvas.getBoundingClientRect(), x = (e.clientX - rect.left) / rect.width, y = (e.clientY - rect.top) / rect.height;
    const value = Math.round(valueAt(x, y) * 100), region = y < .34 ? 'north' : y > .67 ? 'south' : 'center';
    zone.value = region; selectedZone = region; paint();
    if (playing) playStep(Math.floor(pos / STEP));
    announce(`${datasets[selected].title}, ${region} region, data value ${value} percent. Audio pitch reflects this value.`);
  });
  canvas.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const b = stage.getBoundingClientRect(); canvas.dispatchEvent(new MouseEvent('click', { clientX: b.left + b.width / 2, clientY: b.top + b.height / 2 })); } });
  canvas.tabIndex = 0;
  window.addEventListener('resize', () => { resizeCanvas(); paint(); drawTrace(); });
  resizeCanvas();

  /* ===== Línea de tiempo única: video, sonido y línea en vivo cuelgan de `pos` ===== */
  const trace = document.querySelector('#trace-canvas'), tctx = trace.getContext('2d');
  const rewBtn = document.querySelector('#rew-button'), fwdBtn = document.querySelector('#fwd-button');
  const timeEl = document.querySelector('#time-readout'), scrubbers = [...document.querySelectorAll('.scrubber')];
  const fmt = n => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
  const stepsN = () => Math.max(1, Math.floor(dur / STEP));
  let scrubbing = false, dragX = null;

  function finish(id, out) {
    const srt = Float32Array.from(out).sort(), lo = srt[Math.floor(srt.length * .02)], hi = srt[Math.floor(srt.length * .985)];
    for (let k = 0; k < out.length; k++) out[k] = hi > lo ? Math.min(1, Math.max(0, (out[k] - lo) / (hi - lo))) : .5;
    tracks[id] = out; lastStep = -1; sonicKey = '';
  }
  function buildProcedural(id) {
    const n = stepsN(), out = new Float32Array(n * COLS * ROWS);
    for (let i = 0; i < n; i++) for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) out[(i * ROWS + r) * COLS + c] = valueAt((c + .5) / COLS, (r + .5) / ROWS, i * STEP * .7);
    finish(id, out);
  }
  // Recorre el video una vez (en un <video> oculto) y guarda cuánta señal hay en cada zona de la Tierra, paso a paso.
  async function scanCarbon() {
    const n0 = stepsN(), K = COLS * ROWS;
    try {
      const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.src = video.getAttribute('src');
      await new Promise((ok, no) => { v.addEventListener('loadeddata', ok, { once: true }); v.addEventListener('error', no, { once: true }); });
      dur = v.duration || dur;
      const n = stepsN(), out = new Float32Array(n * K), c = document.createElement('canvas'), q = 4;
      c.width = COLS * q; c.height = ROWS * q; const x = c.getContext('2d', { willReadFrequently: true });
      for (let i = 0; i < n; i++) {
        await new Promise(ok => { v.addEventListener('seeked', ok, { once: true }); v.currentTime = Math.min(dur - .05, i * STEP); });
        const R = v.videoHeight * .435; x.drawImage(v, v.videoWidth * .492 - R, v.videoHeight * .493 - R, 2 * R, 2 * R, 0, 0, c.width, c.height); // cuadrado que contiene el círculo de la Tierra
        const px = x.getImageData(0, 0, c.width, c.height).data;
        for (let r = 0; r < ROWS; r++) for (let cc = 0; cc < COLS; cc++) {
          let t = 0; for (let yy = 0; yy < q; yy++) for (let xx = 0; xx < q; xx++) { const k = ((r * q + yy) * c.width + cc * q + xx) * 4; t += Math.min(1, (px[k] * .2126 + px[k + 1] * .7152 + px[k + 2] * .0722) / 255 * .5 + Math.max(0, px[k] - px[k + 2]) / 255 * 1.5); }
          out[(i * ROWS + r) * COLS + cc] = t / (q * q);
        }
      }
      finish('carbon', out);
    } catch { // el navegador bloqueó leer píxeles (p. ej. file://): curva sintética para que todo siga funcionando
      const out = new Float32Array(n0 * K); for (let i = 0; i < n0; i++) for (let j = 0; j < K; j++) out[i * K + j] = .5 + .3 * Math.sin(i * .35 + j * .9);
      finish('carbon', out);
    }
  }
  function cell(id, i, c, r) { const t = tracks[id]; if (!t) return 0; const n = t.length / (COLS * ROWS); i = ((i % n) + n) % n; return t[(i * ROWS + r) * COLS + c]; }
  function curve(m, f) { const n = m.length, i = Math.floor(f), k = f - i; return m[((i % n) + n) % n] * (1 - k) + m[(((i + 1) % n) + n) % n] * k; }

  function drawTrace() {
    const w = trace.clientWidth, h = trace.clientHeight; if (!w || !h) return;
    const r = Math.min(window.devicePixelRatio || 1, 2);
    if (trace.width !== Math.round(w * r)) { trace.width = Math.round(w * r); trace.height = Math.round(h * r); }
    tctx.setTransform(r, 0, 0, r, 0, 0); tctx.clearRect(0, 0, w, h);
    const sk = [selected, selectedZone, colorFilter, !!tracks[selected]].join();
    if (tracks[selected] && sonicKey !== sk) { rebuildSonic(); sonicKey = sk; }
    const m = sonic[selected], cx = w / 2, y = v => h * .86 - v * h * .72;
    if (!m) { tctx.fillStyle = '#ffeb6c'; tctx.font = `${Math.max(7, h * .3)}px Arial, sans-serif`; tctx.textAlign = 'center'; tctx.fillText(selected ? 'READING THE DATA…' : 'NO SIGNAL', cx, h * .6); return; }
    const span = 12; // segundos visibles: 6 atrás, 6 adelante
    tctx.lineWidth = 2; tctx.lineJoin = 'round'; tctx.strokeStyle = '#ffeb6c';
    tctx.beginPath();
    for (let px = 0; px <= w; px += 2) { const v = curve(m, (pos + (px - cx) / w * span) / STEP); px ? tctx.lineTo(px, y(v)) : tctx.moveTo(px, y(v)); }
    tctx.stroke();
    tctx.fillStyle = 'rgba(0,0,0,.5)'; tctx.fillRect(cx, 0, w - cx, h); // lo que aún no pasa por la aguja, atenuado
    tctx.strokeStyle = '#ff5a2b'; tctx.lineWidth = 2; tctx.beginPath(); tctx.moveTo(cx, 0); tctx.lineTo(cx, h); tctx.stroke(); // aguja fija
    const flash = noteSet ? Math.max(0, 1 - (performance.now() - noteSet.t0) / 500) : 0;
    tctx.fillStyle = '#eef8ff'; tctx.beginPath(); tctx.arc(cx, y(curve(m, pos / STEP)), 2.5 + flash * 3, 0, Math.PI * 2); tctx.fill();
  }
  const isNative = () => selected === 'carbon' && playing && rate === 1 && !holding;
  const scanCv = document.querySelector('#scan-canvas'), sctx = scanCv.getContext('2d');
  function drawScan() { // línea transversal N→S sobre la Tierra; su curva sube donde hay más señal = lo que suena
    const w = scanCv.clientWidth, h = scanCv.clientHeight; if (!w || !h) return;
    const r = Math.min(window.devicePixelRatio || 1, 2);
    if (scanCv.width !== Math.round(w * r)) { scanCv.width = Math.round(w * r); scanCv.height = Math.round(h * r); }
    sctx.setTransform(r, 0, 0, r, 0, 0); sctx.clearRect(0, 0, w, h);
    if (!selected || !tracks[selected]) return;
    const circle = selected === 'carbon', vw = video.videoWidth || 1920, vh = video.videoHeight || 1080, s = Math.max(w / vw, h / vh);
    const R = vh * .435 * s, cx = (w - vw * s) / 2 + vw * .492 * s, cy = (h - vh * s) / 2 + vh * .493 * s;
    const y = sweepY(pos), ly = circle ? cy - R + y * 2 * R : y * h, hc = circle ? Math.sqrt(Math.max(0, R * R - (ly - cy) ** 2)) : w / 2, mid = circle ? cx : w / 2;
    const prof = profileAt(selected, pos), amp = circle ? R * .28 : h * .12, lw = Math.max(1.5, w / 230);
    const px = c => circle ? cx - R + (c + .5) / COLS * 2 * R : (c + .5) / COLS * w, pts = prof.cols.map((c, k) => [px(c), ly - prof.vals[k] * amp]);
    sctx.lineJoin = sctx.lineCap = 'round';
    sctx.strokeStyle = 'rgba(238,248,255,.55)'; sctx.lineWidth = Math.max(1, lw * .5); sctx.setLineDash([4, 4]); sctx.beginPath(); sctx.moveTo(mid - hc, ly); sctx.lineTo(mid + hc, ly); sctx.stroke(); sctx.setLineDash([]);
    if (pts.length > 1) {
      sctx.beginPath(); sctx.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length - 1; k++) sctx.quadraticCurveTo(pts[k][0], pts[k][1], (pts[k][0] + pts[k + 1][0]) / 2, (pts[k][1] + pts[k + 1][1]) / 2);
      sctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
      sctx.strokeStyle = 'rgba(40,32,69,.85)'; sctx.lineWidth = lw * 2.6; sctx.stroke();
      sctx.strokeStyle = '#ffeb6c'; sctx.lineWidth = lw; sctx.stroke();
    }
    if (noteSet) { const el = performance.now() - noteSet.t0; noteSet.items.forEach((it, k) => {
      const lit = el >= k * noteSet.gap, x = px(it.c), yy = ly - it.v * amp;
      sctx.fillStyle = !it.on ? 'rgba(238,248,255,.35)' : lit ? '#ff5a2b' : '#eef8ff'; sctx.strokeStyle = '#282045'; sctx.lineWidth = Math.max(1, lw * .7);
      sctx.beginPath(); sctx.arc(x, yy, lw * (lit && it.on ? 2.6 : 1.7), 0, Math.PI * 2); sctx.fill(); sctx.stroke(); }); }
  }
  function syncView(fromTick) {
    if (selected === 'carbon') { if (!isNative() && !video.seeking && Math.abs(video.currentTime - pos) > .03) video.currentTime = pos; }
    else if (!reducedMotion || !fromTick) paint();
    const i = Math.floor(pos / STEP);
    if (i !== lastStep) { lastStep = i; if (playing || !fromTick) playStep(i); }
    drawTrace(); drawScan();
    timeEl.textContent = `${fmt(pos)} / ${fmt(dur)} · ${rate < 0 ? '◀◀' : '▶'} ${Math.abs(rate)}×${playing ? '' : ' · PAUSED'}`;
    if (!scrubbing) scrubbers.forEach(x => { x.value = String(Math.round(pos / dur * 1000)); });
  }
  function seek(p) { pos = ((p % dur) + dur) % dur; if (selected === 'carbon' && !video.seeking) video.currentTime = pos; if (selected) syncView(false); }
  function tick(ts) {
    const dt = Math.min(.1, (ts - lastTs) / 1000) || 0; lastTs = ts;
    if (selected) {
      const native = isNative();
      if (selected === 'carbon') {
        if (native) { if (video.paused) { video.currentTime = pos; video.play().catch(() => {}); } else pos = video.currentTime; }
        else if (!video.paused) video.pause();
      }
      if (playing && !holding && !native) pos = ((pos + dt * rate) % dur + dur) % dur;
      syncView(true);
    }
    requestAnimationFrame(tick);
  }
  function setRate(r, label) { rate = r; rewBtn.classList.toggle('on', r < 0); fwdBtn.classList.toggle('on', r > 1); if (!playing) setPlaying(true); announce(label); }
  rewBtn.addEventListener('click', () => setRate(rate > -1 ? -1 : rate <= -4 ? 1 : rate * 2, rate > -1 ? 'Rewinding.' : 'Rewinding faster.'));
  fwdBtn.addEventListener('click', () => setRate(rate < 1 ? 1 : rate >= 4 ? 1 : rate * 2, rate < 1 ? 'Playing forward.' : 'Forward faster.'));
  scrubbers.forEach(x => {
    x.addEventListener('pointerdown', () => { scrubbing = holding = true; });
    ['pointerup', 'change', 'blur'].forEach(ev => x.addEventListener(ev, () => { if (!scrubbing) return; scrubbing = holding = false; if (selected === 'carbon') video.currentTime = pos; }));
    x.addEventListener('input', () => seek(Number(x.value) / 1000 * dur));
  });
  // Arrastrar la Tierra: a la derecha avanza el tiempo, a la izquierda retrocede.
  stage.addEventListener('pointerdown', e => { if (selected) { dragX = e.clientX; dragged = false; } });
  stage.addEventListener('pointermove', e => {
    if (dragX === null) return; const dx = e.clientX - dragX;
    if (!dragged && Math.abs(dx) < 4) return; dragged = true; holding = true; dragX = e.clientX; seek(pos + dx / stage.clientWidth * 10);
  });
  const endDrag = () => { if (dragged) { holding = false; if (selected === 'carbon') video.currentTime = pos; } dragX = null; setTimeout(() => { dragged = false; }, 0); };
  window.addEventListener('pointerup', endDrag); window.addEventListener('pointercancel', endDrag);
  document.addEventListener('keydown', e => {
    if (!selected || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); seek(pos - 2); } else if (e.key === 'ArrowRight') { e.preventDefault(); seek(pos + 2); }
  });
  video.addEventListener('loadedmetadata', () => { dur = video.duration || dur; });
  scanCarbon(); requestAnimationFrame(tick);
})();
