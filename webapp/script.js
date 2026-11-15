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
  function valueAt(x, y, t = frame * 0.012) {
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
    if (selected === 'wildfire') { gradient.addColorStop(0, '#172a42'); gradient.addColorStop(.45, '#74614a'); gradient.addColorStop(1, '#ff9b5e'); }
    else { gradient.addColorStop(0, '#122d4b'); gradient.addColorStop(.5, '#147c99'); gradient.addColorStop(1, '#f3a76b'); }
    ctx.fillStyle = '#081322'; ctx.fillRect(0, 0, w, h);
    for (let iy = 0; iy < rows; iy++) for (let ix = 0; ix < cols; ix++) {
      const x = (ix + .5) / cols, y = (iy + .5) / rows, val = valueAt(x, y);
      const hot = val > .79, matchesColor = colorFilter === 'all' || (colorFilter === 'warm' ? val > .58 : val <= .58);
      const matchesZone = selectedZone === 'all' || (selectedZone === 'north' ? y < .34 : selectedZone === 'center' ? y >= .34 && y < .68 : y >= .68);
      ctx.globalAlpha = (matchesColor && matchesZone ? .3 + val * .66 : .1) * (hot ? .95 : 1);
      ctx.fillStyle = gradient; ctx.fillRect(ix * w / cols, iy * h / rows, w / cols + 1, h / rows + 1);
      if (hot && matchesZone && matchesColor && ((ix + iy) % 13 === 0)) { ctx.globalAlpha = .65; ctx.fillStyle = '#ffe19a'; ctx.beginPath(); ctx.arc(x * w, y * h, 1.6 + val * 2, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    if (selectedZone !== 'all') {
      const bounds = selectedZone === 'north' ? [0, h / 3] : selectedZone === 'center' ? [h / 3, h * 2 / 3] : [h * 2 / 3, h];
      ctx.strokeStyle = '#d9ffe9'; ctx.lineWidth = 2; ctx.setLineDash([7, 5]); ctx.strokeRect(2, bounds[0] + 1, w - 4, bounds[1] - bounds[0] - 2); ctx.setLineDash([]);
    }
    frame++;
  }
  function drawLoop() { paint(); if (selected && selected !== 'carbon' && !reducedMotion) animation = requestAnimationFrame(drawLoop); }
  function ensureAudio() {
    if (!audio) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) { announce('Web Audio is unavailable in this browser.'); return false; }
      audio = new AudioContext(); master = audio.createGain(); master.gain.value = Number(document.querySelector('#volume').value) / 100; master.connect(audio.destination);
    }
    if (audio.state === 'suspended') audio.resume();
    return true;
  }
  function playNote() {
    if (!audio || !master || !selected) return;
    const d = datasets[selected];
    const sampleY = selectedZone === 'north' ? .16 : selectedZone === 'center' ? .5 : selectedZone === 'south' ? .84 : ((beat * .19) % 1);
    let val = valueAt(((beat * .137) % 1), sampleY);
    if (colorFilter === 'warm' && val < .58) val = .58 + (val * .12);
    if (colorFilter === 'cool' && val > .58) val = .57 - (val - .58) * .3;
    const index = Math.round(val * (scale.length - 1));
    const frequency = 220 * Math.pow(2, scale[index] / 12);
    const now = audio.currentTime, osc = audio.createOscillator(), gain = audio.createGain();
    const anomaly = val > .83 || (selected === 'wildfire' && val > .74);
    osc.type = anomaly ? 'triangle' : 'sine'; osc.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(anomaly ? .13 : .095, now + .06); gain.gain.exponentialRampToValueAtTime(.0001, now + (anomaly ? .43 : .7));
    osc.connect(gain); gain.connect(master); osc.start(now); osc.stop(now + .72);
    if (anomaly) {
      const bell = audio.createOscillator(), bellGain = audio.createGain(); bell.type = 'sine'; bell.frequency.value = frequency * 1.5;
      bellGain.gain.setValueAtTime(.0001, now); bellGain.gain.exponentialRampToValueAtTime(.035, now + .04); bellGain.gain.exponentialRampToValueAtTime(.0001, now + .5); bell.connect(bellGain); bellGain.connect(master); bell.start(now); bell.stop(now + .52);
    }
    beat++;
    if (beat % 4 === 0) {
      const color = val > .74 ? 'high anomaly' : val > .55 ? 'elevated' : 'moderate';
      document.querySelector('#data-readout').textContent = `${color.toUpperCase()} · ${Math.round(val * 100)}%`;
      if (beat % 16 === 0) announce(`${d.title}: ${color} reading, ${Math.round(val * 100)} percent. Pentatonic pitch ${scale[index]}.`);
    }
  }
  function setPlaying(next) {
    if (next && !ensureAudio()) return;
    playing = next;
    playButton.textContent = playing ? 'Ⅱ' : '▶';
    playButton.setAttribute('aria-label', playing ? 'Pause audio' : 'Play audio');
    const focusPlay = document.querySelector('#focus-play');
    focusPlay.textContent = playing ? 'Ⅱ Pause audio' : '▶ Play audio';
    focusPlay.setAttribute('aria-label', playing ? 'Pause audio' : 'Play audio');
    screen.classList.toggle('is-playing', playing);
    if (timer) clearInterval(timer);
    if (playing) { playNote(); timer = setInterval(playNote, selected === 'wildfire' ? 460 : 590); }
    if (selected === 'carbon') { if (playing) video.play().catch(() => {}); else video.pause(); }
  }
  function selectDataset(id) {
    const d = datasets[id]; if (!d) return;
    selected = id; beat = 0; frame = 0; selectedZone = 'all'; colorFilter = 'all';
    document.querySelectorAll('.record-card').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.dataset === id)));
    document.querySelectorAll('.color-button').forEach(button => { button.disabled = false; button.setAttribute('aria-pressed', String(button.dataset.color === 'all')); });
    zone.disabled = false; zone.value = 'all'; playButton.disabled = false; restartButton.disabled = false;
    document.querySelector('#focus-zone').disabled = false;
    document.querySelector('#focus-zone').value = 'all';
    document.querySelector('#focus-play').disabled = false;
    document.querySelectorAll('[data-focus-color]').forEach(button => { button.disabled = false; button.setAttribute('aria-pressed', String(button.dataset.focusColor === 'all')); });
    stage.dataset.kind = d.kind; stage.classList.add('has-data');
    document.querySelector('#screen-label').textContent = `NOW PLAYING · ${d.title.toUpperCase()}`;
    document.querySelector('#screen-index').textContent = id === 'carbon' ? '01' : id === 'wildfire' ? '02' : '03';
    document.querySelector('#stage-caption').textContent = `${d.title} · ${d.detail} · choose a region to listen`;
    document.querySelector('#data-readout').textContent = 'TUNING IN…';
    video.pause(); video.currentTime = 0;
    cancelAnimationFrame(animation); resizeCanvas(); paint();
    if (!reducedMotion) drawLoop();
    screen.classList.add('is-focused');
    setPlaying(true);
    announce(`${d.title} selected. Audio started. The visualization is now focused. Use the zone and color controls or press Escape to return.`);
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
  restartButton.addEventListener('click', () => { beat = 0; frame = 0; if (selected === 'carbon') video.currentTime = 0; paint(); if (playing) { setPlaying(false); setPlaying(true); } announce('Visualization and audio restarted.'); });
  document.querySelector('#volume').addEventListener('input', e => { if (master) master.gain.setTargetAtTime(Number(e.target.value) / 100, audio.currentTime, .04); });
  function returnToJukebox() { screen.classList.remove('is-focused'); announce('Returned to the jukebox controls.'); }
  document.querySelector('#return-button').addEventListener('click', returnToJukebox);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && screen.classList.contains('is-focused')) returnToJukebox(); });
  document.querySelector('#motion-toggle').addEventListener('click', e => {
    reducedMotion = !reducedMotion; e.currentTarget.setAttribute('aria-pressed', String(reducedMotion)); e.currentTarget.textContent = `Reduce motion: ${reducedMotion ? 'on' : 'off'}`;
    if (reducedMotion) { cancelAnimationFrame(animation); paint(); } else if (selected && selected !== 'carbon') drawLoop();
    announce(`Reduced motion ${reducedMotion ? 'on' : 'off'}.`);
  });
  canvas.addEventListener('click', e => {
    if (!selected || selected === 'carbon') return;
    const rect = canvas.getBoundingClientRect(), x = (e.clientX - rect.left) / rect.width, y = (e.clientY - rect.top) / rect.height;
    const value = Math.round(valueAt(x, y) * 100), region = y < .34 ? 'north' : y > .67 ? 'south' : 'center';
    zone.value = region; selectedZone = region; paint();
    if (playing) playNote();
    announce(`${datasets[selected].title}, ${region} region, data value ${value} percent. Audio pitch reflects this value.`);
  });
  canvas.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const b = stage.getBoundingClientRect(); canvas.dispatchEvent(new MouseEvent('click', { clientX: b.left + b.width / 2, clientY: b.top + b.height / 2 })); } });
  canvas.tabIndex = 0;
  window.addEventListener('resize', () => { resizeCanvas(); paint(); });
  resizeCanvas();
})();
