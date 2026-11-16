(() => {
  const canvas = document.querySelector('#data-canvas');
  const ctx = canvas.getContext('2d');
  const video = document.querySelector('#co-video');
  const stage = document.querySelector('#visual-stage');
  const screen = document.querySelector('#screen-bezel');
  const zone = document.querySelector('#zone-select');
  const announcer = document.querySelector('#announcer');
  const focusHelp = document.querySelector('#focus-help'), defaultFocusHelp = focusHelp.textContent;
  const playButton = document.querySelector('#play-toggle');
  const restartButton = document.querySelector('#restart-button');
  const datasets = {
    carbon: { title: 'Carbon monoxide', detail: 'Atmospheric trace · satellite visualization', kind: 'carbon', base: 0.48, anomaly: 0.16 },
    wildfire: { title: 'Aerosol map', detail: 'Black carbon · dust · sea salt · sulfate', kind: 'wildfire', base: 0.63, anomaly: 0.29 },
    lightning: { title: 'Lightning', detail: 'Yearly lightning strikes · satellite map video', kind: 'lightning', base: 0, anomaly: 1 }
  };
  const soundGuides = {
    carbon: 'A scan moves north to south across the satellite globe. Every half second, the rushing-air sound follows the carbon monoxide reading: stronger concentrations make it louder and brighter. Use the timeline or rewind and fast-forward controls to revisit the sequence.',
    wildfire: 'The scan crosses the full aerosol composition map. Each colored note and node identifies a type: red black carbon is a metallic clang, pink dust is a windy hiss, blue sea salt is rolling surf, and green sulfate is a pulsing chemical tone. Use the color filters to hear each type by itself.',
    lightning: 'The yearly lightning map video plays across the full image. Yellow strike clusters trigger a sharp thunder crack and a low note that hangs while the points stay visible, then fades as they disappear. More points make the thunder louder. Use the timeline or rewind and fast-forward controls to follow the activity.'
  };
  const scale = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22]; // pentatonic steps
  let selected = null, colorFilter = 'all', selectedZone = 'all', audio = null, master = null;
  let playing = false, beat = 0, timer = null, animation = 0, reducedMotion = false, frame = 0;
  const STEP = .5, COLS = 24, ROWS = 24, SWEEP = 12, tracks = {}, sonic = {};
  let pos = 0, rate = 1, lastStep = -1, lastTs = 0, dur = 39.2, dragged = false, holding = false, noteSet = null, bus = null, droneG = null, droneF = null, sonicKey = '';
  let activeThunder = new Map(), activeLightningPoints = [];
  const pixelCanvas = document.createElement('canvas');
  pixelCanvas.width = 64; pixelCanvas.height = 36;
  const pixelContext = pixelCanvas.getContext('2d', { willReadFrequently: true });
  const aerosolImage = new Image(); aerosolImage.src = 'resources/aerosols.png';
  const aerosolCanvas = document.createElement('canvas'); aerosolCanvas.width = COLS; aerosolCanvas.height = ROWS;
  const aerosolCtx = aerosolCanvas.getContext('2d', { willReadFrequently: true });
  const lightningCanvas = document.createElement('canvas'); lightningCanvas.width = 256; lightningCanvas.height = 128;
  const lightningCtx = lightningCanvas.getContext('2d', { willReadFrequently: true });
  let aerosolPixels = null;
  aerosolImage.onload = () => { aerosolCtx.drawImage(aerosolImage, 0, 0, COLS, ROWS); aerosolPixels = aerosolCtx.getImageData(0, 0, COLS, ROWS).data; if (selected === 'wildfire') { buildProcedural('wildfire'); paint(); } };
  const aerosolType = (r, g, b) => {
    if (r > 35 && r > g * 1.23 && r > b * 1.16) return 'carbon';
    if (r > 35 && r > g * 1.05 && b > g * 1.04) return 'dust';
    if (b > 35 && b > r * 1.08 && b > g * 1.04) return 'sea';
    if (g > 35 && g > r * 1.12 && g > b * 1.04) return 'sulfate';
    return 'background';
  };
  const aerosolTypeAt = (c, r) => {
    if (!aerosolPixels) return 'background';
    const k = (r * COLS + c) * 4;
    return aerosolType(aerosolPixels[k], aerosolPixels[k + 1], aerosolPixels[k + 2]);
  };
  const aerosolColors = { carbon: '#ff4038', dust: '#f28ac7', sea: '#55b9ff', sulfate: '#53dc78', background: '#aab4c4' };
  const aerosolNames = { carbon: 'black carbon', dust: 'dust', sea: 'sea salt', sulfate: 'sulfate' };
  const aerosolTimbres = { carbon: 'a short, bright metallic clang', dust: 'a low wind gust with a fine hiss', sea: 'a slow swell of low filtered surf', sulfate: 'a pulsing two-tone chemical fizz' };
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const pitch = v => 220 * Math.pow(2, scale[Math.round(Math.pow(v, .75) * (scale.length - 1))] / 12);
  const levelOf = v => v > .5 ? 'high' : v > .25 ? 'elevated' : 'low';
  const bandOf = row => row < ROWS / 3 ? 'north' : row < ROWS * 2 / 3 ? 'center' : 'south';
  const GRID = 8, BLOCK = COLS / GRID; // el explorador por teclado divide el mapa en 8×8 regiones de 3×3 celdas
  let narrate = true, cursor = null; // avisos hablados cada 8 s · región elegida en el explorador
  let voiceOn = false, voices = [], welcomed = false; // voz propia de la página (ver say() al final)

  // Cada aviso va al lector de pantalla (región en vivo) y a la voz de la página. mode: ver say()
  function announce(message, mode) { announcer.textContent = ''; requestAnimationFrame(() => { announcer.textContent = message; }); say(message, mode); }
  function resizeCanvas() {
    const rect = stage.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  function valueAt(x, y, t = pos * .7) {
    const d = datasets[selected] || datasets.lightning;
    if (selected === 'carbon' && video.readyState >= 2) {
      try {
        pixelContext.drawImage(video, 0, 0, pixelCanvas.width, pixelCanvas.height);
        const pixel = pixelContext.getImageData(Math.floor(x * 63), Math.floor(y * 35), 1, 1).data;
        return clamp((pixel[0] * .2126 + pixel[1] * .7152 + pixel[2] * .0722) / 255, 0, 1);
      } catch { /* Keep the sonification available if a browser blocks video pixel sampling. */ }
    }
    if (selected === 'wildfire' && aerosolPixels) {
      const ix = Math.min(COLS - 1, Math.floor(x * COLS)), iy = Math.min(ROWS - 1, Math.floor(y * ROWS)), k = (iy * COLS + ix) * 4;
      return clamp(Math.max(aerosolPixels[k], aerosolPixels[k + 1], aerosolPixels[k + 2]) / 235, 0, 1);
    }
    const wave = Math.sin(x * 8 + t) * Math.cos(y * 6 - t * .7);
    const plume = Math.exp(-((x - .67 - Math.sin(t * .45) * .08) ** 2 / .06 + (y - .47) ** 2 / .2));
    const raw = selected === 'wildfire' ? .25 + .34 * (wave + 1) / 2 + plume * .46 : .2 + .45 * (wave + 1) / 2 + plume * .3;
    return clamp((raw - d.base + .42) / .84, 0, 1);
  }
  function paint() {
    if (!selected || selected === 'carbon') return;
    if (selected === 'lightning') { ctx.clearRect(0, 0, stage.clientWidth, stage.clientHeight); return; }
    const box = stage.getBoundingClientRect(), w = box.width, h = box.height;
    if (!w || !h) return;
    const cols = Math.max(32, Math.ceil(w / 10)), rows = Math.max(20, Math.ceil(h / 10));
    ctx.clearRect(0, 0, w, h);
    if (selected === 'wildfire' && aerosolImage.complete && aerosolImage.naturalWidth) {
      const fit = Math.min(w / aerosolImage.naturalWidth, h / aerosolImage.naturalHeight), imageW = aerosolImage.naturalWidth * fit, imageH = aerosolImage.naturalHeight * fit, imageX = (w - imageW) / 2, imageY = (h - imageH) / 2;
      ctx.fillStyle = '#080b11'; ctx.fillRect(0, 0, w, h); ctx.drawImage(aerosolImage, imageX, imageY, imageW, imageH);
      if (selectedZone !== 'all') {
        const bounds = selectedZone === 'north' ? [imageY, imageY + imageH / 3] : selectedZone === 'center' ? [imageY + imageH / 3, imageY + imageH * 2 / 3] : [imageY + imageH * 2 / 3, imageY + imageH];
        ctx.fillStyle = 'rgba(0,0,0,.64)';
        if (bounds[0] > imageY) ctx.fillRect(imageX, imageY, imageW, bounds[0] - imageY);
        if (bounds[1] < imageY + imageH) ctx.fillRect(imageX, bounds[1], imageW, imageY + imageH - bounds[1]);
      }
      if (colorFilter !== 'all' && aerosolPixels) {
        ctx.fillStyle = 'rgba(0,0,0,.78)';
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (aerosolTypeAt(c, r) !== colorFilter) {
          ctx.fillRect(imageX + c * imageW / COLS, imageY + r * imageH / ROWS, imageW / COLS + .5, imageH / ROWS + .5);
        }
      }
      frame++; return;
    }
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
  const passes = (v, c = 0, r = 0, id = selected) => {
    if (colorFilter === 'all') return true;
    if (id === 'wildfire') return aerosolTypeAt(c, r) === colorFilter;
    return colorFilter === 'warm' ? v >= .45 : v < .45;
  };
  const filterName = () => {
    if (selected === 'wildfire') return colorFilter === 'all' ? 'all aerosol types together' : `${aerosolNames[colorFilter]}, ${aerosolTimbres[colorFilter]}`;
    return ({ all: 'all colors', warm: 'warm tones', cool: 'cool tones' }[colorFilter] || colorFilter);
  };
  function soft(id, i, c, r) { let t = 0, k = 0; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const cc = c + dc, rr = r + dr; if (cc < 0 || rr < 0 || cc >= COLS || rr >= ROWS) continue; t += cell(id, i, cc, rr); k++; } return t / k; }
  function profileAt(id, p) {
    const i = Math.floor(p / STEP), r = rowOf(sweepY(p)), cols = [];
    for (let c = 0; c < COLS; c++) if (inside(id, c, r)) cols.push(c);
    return { i, r, cols, vals: cols.map(c => soft(id, i, c, r)) };
  }
  function rebuildSonic() {
    const id = selected, n = stepsN(), arr = new Float32Array(n);
    for (let j = 0; j < n; j++) { const p = profileAt(id, j * STEP + .001), ok = p.vals.filter((v, k) => passes(v, p.cols[k], p.r, id)); arr[j] = ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : 0; }
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
  function aerosolVoice(type, freq, when, vel) {
    if (type === 'background') return;
    const level = .22 + vel * .34;
    if (type === 'carbon') {
      const duration = .82;
      [[1, 1], [2.76, .52], [5.4, .24]].forEach(([ratio, volume]) => {
        const osc = audio.createOscillator(), gain = audio.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(freq * ratio, when);
        gain.gain.setValueAtTime(.0001, when); gain.gain.linearRampToValueAtTime(level * volume, when + .006); gain.gain.exponentialRampToValueAtTime(.0001, when + duration);
        osc.connect(gain); gain.connect(bus); osc.start(when); osc.stop(when + duration);
      });
      return;
    }
    if (type === 'sulfate') {
      const duration = .72, filter = audio.createBiquadFilter(), gain = audio.createGain();
      filter.type = 'bandpass'; filter.frequency.setValueAtTime(850, when); filter.frequency.exponentialRampToValueAtTime(2400, when + .22); filter.Q.value = 1.4; filter.connect(gain); gain.connect(bus);
      [[220 + vel * 180, 'square', 1], [330 + vel * 260, 'sine', .65]].forEach(([hz, wave, volume]) => {
        const osc = audio.createOscillator(), partial = audio.createGain(); osc.type = wave; osc.frequency.setValueAtTime(hz, when);
        partial.gain.setValueAtTime(.0001, when); partial.gain.linearRampToValueAtTime(level * volume, when + .012); partial.gain.setValueAtTime(level * volume * .55, when + .16); partial.gain.linearRampToValueAtTime(level * volume, when + .25); partial.gain.exponentialRampToValueAtTime(.0001, when + duration);
        osc.connect(partial); partial.connect(filter); osc.start(when); osc.stop(when + duration);
      });
      return;
    }
    const duration = type === 'sea' ? 1.5 : .92, buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * duration), audio.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = audio.createBufferSource(), filter = audio.createBiquadFilter(), gain = audio.createGain(); noise.buffer = buffer;
    filter.type = 'lowpass'; filter.frequency.value = type === 'sea' ? 520 : 780 + vel * 280; filter.Q.value = .55;
    noise.connect(filter); filter.connect(gain); gain.connect(bus);
    const peak = level * (type === 'sea' ? .85 : .72), attack = type === 'sea' ? .34 : .13;
    gain.gain.setValueAtTime(.0001, when); gain.gain.linearRampToValueAtTime(peak, when + attack); gain.gain.exponentialRampToValueAtTime(.0001, when + duration);
    noise.start(when); noise.stop(when + duration);
    if (type === 'sea') {
      const wave = audio.createOscillator(), waveGain = audio.createGain(); wave.type = 'sine'; wave.frequency.setValueAtTime(72 + vel * 26, when);
      waveGain.gain.setValueAtTime(.0001, when); waveGain.gain.linearRampToValueAtTime(level * .18, when + .4); waveGain.gain.exponentialRampToValueAtTime(.0001, when + duration);
      wave.connect(waveGain); waveGain.connect(bus); wave.start(when); wave.stop(when + duration);
    }
  }
  function carbonAirVoice(value, when) {
    const duration = .48, buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * duration), audio.sampleRate), samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    const source = audio.createBufferSource(), highpass = audio.createBiquadFilter(), lowpass = audio.createBiquadFilter(), gain = audio.createGain();
    source.buffer = buffer; highpass.type = 'highpass'; highpass.frequency.value = 140;
    lowpass.type = 'lowpass'; lowpass.frequency.value = 700 + value * 2100; lowpass.Q.value = .55;
    source.connect(highpass); highpass.connect(lowpass); lowpass.connect(gain); gain.connect(bus);
    const level = .025 + Math.pow(value, 1.35) * .32;
    gain.gain.setValueAtTime(.0001, when); gain.gain.linearRampToValueAtTime(level, when + .055); gain.gain.exponentialRampToValueAtTime(.0001, when + duration);
    source.start(when); source.stop(when + duration);
  }
  function thunderStrike(intensity, when) {
    const rumble = audio.createOscillator(), rumbleFilter = audio.createBiquadFilter(), rumbleGain = audio.createGain();
    rumble.type = 'triangle'; rumble.frequency.setValueAtTime(68 + intensity * 42, when); rumble.frequency.exponentialRampToValueAtTime(38 + intensity * 24, when + .55);
    rumbleFilter.type = 'lowpass'; rumbleFilter.frequency.value = 260 + intensity * 220;
    rumble.connect(rumbleFilter); rumbleFilter.connect(rumbleGain); rumbleGain.connect(bus);
    rumbleGain.gain.setValueAtTime(.0001, when); rumbleGain.gain.linearRampToValueAtTime(.07 + intensity * .22, when + .045);
    rumbleGain.gain.setTargetAtTime(.035 + intensity * .1, when + .05, .18);
    rumble.start(when);
    const length = Math.ceil(audio.sampleRate * .32), buffer = audio.createBuffer(1, length, audio.sampleRate), samples = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;
    const crack = audio.createBufferSource(), crackFilter = audio.createBiquadFilter(), crackGain = audio.createGain();
    crack.buffer = buffer; crackFilter.type = 'lowpass'; crackFilter.frequency.value = 1400 + intensity * 1200;
    crack.connect(crackFilter); crackFilter.connect(crackGain); crackGain.connect(bus);
    crackGain.gain.setValueAtTime(.0001, when); crackGain.gain.linearRampToValueAtTime(.09 + intensity * .28, when + .008); crackGain.gain.exponentialRampToValueAtTime(.0001, when + .3);
    crack.start(when); crack.stop(when + .32);
    return { rumble, rumbleGain };
  }
  function releaseThunder(key, now = audio.currentTime) {
    const node = activeThunder.get(key); if (!node) return;
    node.rumbleGain.gain.cancelScheduledValues(now); node.rumbleGain.gain.setTargetAtTime(.0001, now, .12);
    try { node.rumble.stop(now + .55); } catch { /* ya se detuvo */ }
    activeThunder.delete(key);
  }
  function detectLightningPoints() {
    if (video.readyState < 2) return [];
    try {
      lightningCtx.drawImage(video, 0, 0, lightningCanvas.width, lightningCanvas.height);
      const pixels = lightningCtx.getImageData(0, 0, lightningCanvas.width, lightningCanvas.height).data, counts = new Map();
      for (let y = 0; y < lightningCanvas.height; y++) for (let x = 0; x < lightningCanvas.width; x++) {
        const p = (y * lightningCanvas.width + x) * 4, red = pixels[p], green = pixels[p + 1], blue = pixels[p + 2];
        if (red < 125 || green < 85 || blue > 145 || red < green * 1.04) continue;
        const key = `${Math.floor(x / 16)}:${Math.floor(y / 16)}`; counts.set(key, (counts.get(key) || 0) + 1);
      }
      activeLightningPoints = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([key, count]) => ({ key, intensity: clamp(.2 + Math.sqrt(count / 10) * .8, .2, 1) }));
      return activeLightningPoints;
    } catch { activeLightningPoints = []; return []; }
  }
  function updateLightningSounds(step) {
    if (!audio || !bus) return;
    const detections = detectLightningPoints(), current = new Set(detections.map(point => point.key)), now = audio.currentTime + .02;
    if (detections.length) {
      const [col, row] = detections[0].key.split(':').map(Number), lat = Math.round(90 - (row + .5) / 8 * 180), lon = Math.round((col + .5) / 16 * 360 - 180);
      document.querySelector('#data-readout').textContent = `${detections.length} cells · ${Math.abs(lat)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon)}°${lon >= 0 ? 'E' : 'W'}`;
    } else document.querySelector('#data-readout').textContent = 'No active lightning cells';
    for (const key of activeThunder.keys()) if (!current.has(key)) releaseThunder(key, now);
    detections.forEach(point => {
      const existing = activeThunder.get(point.key);
      if (existing) existing.rumbleGain.gain.setTargetAtTime(.035 + point.intensity * .1, now, .12);
      else activeThunder.set(point.key, thunderStrike(point.intensity, now));
    });
  }
  function playStep(i) {
    if (!audio || !master || !bus || !selected) return;
    if (selected === 'lightning') {
      updateLightningSounds(i);
      if (i % 16 === 0 && narrate && document.activeElement !== canvas) {
        const point = activeLightningPoints[0];
        if (point) {
          const [col, row] = point.key.split(':').map(Number), lat = Math.round(90 - (row + .5) / 8 * 180), lon = Math.round((col + .5) / 16 * 360 - 180);
          announce(`Lightning update: ${activeLightningPoints.length} active map cells; strongest near ${Math.abs(lat)} degrees ${lat >= 0 ? 'north' : 'south'}, ${Math.abs(lon)} degrees ${lon >= 0 ? 'east' : 'west'}. New clusters make a sharp thunder crack and a low rumble; more points make it louder, and the rumble fades as the points disappear.`, 'idle');
        } else announce('Lightning update: no highlighted strike cells right now. Any hanging thunder notes have faded with the points.', 'idle');
      }
      return;
    }
    if (!tracks[selected]) return;
    const d = datasets[selected], prof = profileAt(selected, Math.max(0, i) * STEP + .001), n = prof.cols.length; if (!n) return;
    const picks = [0, 1, 2, 3].map(k => Math.min(n - 1, Math.floor((k + .5) / 4 * n)));
    const order = rate < 0 ? picks.slice().reverse() : picks, gap = .125 / Math.min(2, Math.abs(rate)), t0 = audio.currentTime + .02, items = [];
    order.forEach((idx, k) => {
      const v = prof.vals[idx], c = prof.cols[idx], kind = selected === 'wildfire' ? aerosolTypeAt(c, prof.r) : null;
      const on = v >= .08 && passes(v, c, prof.r) && (selected !== 'wildfire' || kind !== 'background'); items.push({ c, v, on, type: kind });
      if (on) {
        if (selected === 'wildfire') {
          aerosolVoice(kind, pitch(v), t0 + k * gap, v);
        } else if (selected === 'carbon') carbonAirVoice(v, t0 + k * gap);
        else voice(pitch(v), t0 + k * gap, .09 + v * .12, v > .8);
      }
    });
    noteSet = { items, t0: performance.now(), gap: gap * 1000 };
    const mean = prof.vals.reduce((a, b) => a + b, 0) / n;
    if (droneF) droneF.frequency.setTargetAtTime(250 + mean * 1400, audio.currentTime, .4);
    if (i % 4 === 0) {
      const level = levelOf(mean), lat = bandOf(prof.r);
      // en minúsculas: el CSS lo muestra en mayúsculas y así el lector no deletrea las palabras
      document.querySelector('#data-readout').textContent = `${lat} · ${level} · ${Math.round(mean * 100)}%`;
      // mientras alguien explora el mapa con las flechas no lo interrumpimos
      if (i % 16 === 0 && narrate && document.activeElement !== canvas) {
        let soundNote = 'Carbon monoxide is heard as airy rushing; stronger readings sound louder and brighter.';
        if (selected === 'wildfire') {
          const types = [...new Set(noteSet.items.filter(item => item.on).map(item => item.type))];
          soundNote = types.length ? `This scan sounds ${types.map(type => `${aerosolNames[type]}, ${aerosolTimbres[type]}`).join('; ')}. Colored nodes identify each source.` : 'No aerosol pixels in this scan pass the current color filter.';
        }
        announce(`${d.title}, ${lat} band: ${level} readings, ${Math.round(mean * 100)} percent. ${soundNote}`, 'idle');
      }
    }
  }
  function setPlaying(next) {
    if (next && !ensureAudio()) return;
    playing = next; lastStep = -1;
    if (!playing) for (const key of activeThunder.keys()) releaseThunder(key);
    document.querySelectorAll('.record-card').forEach(button => button.classList.toggle('is-playing', playing && button.dataset.dataset === selected));
    document.querySelectorAll('.record-indicator').forEach(indicator => indicator.classList.toggle('is-playing', playing && indicator.dataset.indicator === selected));
    playButton.textContent = playing ? 'Ⅱ' : '▶';
    playButton.setAttribute('aria-label', playing ? 'Pause audio' : 'Play audio');
    const focusPlay = document.querySelector('#focus-play');
    focusPlay.textContent = playing ? 'Ⅱ Pause audio' : '▶ Play audio';
    focusPlay.setAttribute('aria-label', playing ? 'Pause audio' : 'Play audio');
    screen.classList.toggle('is-playing', playing);
    if (droneG) droneG.gain.setTargetAtTime(playing && selected !== 'lightning' ? .05 : 0, audio.currentTime, .3);
  }
  function selectDataset(id) {
    const d = datasets[id]; if (!d) return;
    for (const key of activeThunder.keys()) releaseThunder(key);
    selected = id; pos = 0; rate = 1; lastStep = -1; holding = false; noteSet = null; frame = 0; selectedZone = 'all'; colorFilter = 'all'; cursor = null;
    document.querySelector('#mapping-explanation').textContent = soundGuides[id];
    document.querySelectorAll('.record-card').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.dataset === id)));
    document.querySelectorAll('.general-color-option').forEach(button => { button.hidden = id === 'wildfire'; });
    document.querySelectorAll('.aerosol-color-option').forEach(button => {
      button.hidden = id !== 'wildfire';
      const key = button.dataset.color || button.dataset.focusColor;
      button.setAttribute('aria-describedby', `aerosol-${key}-help`);
    });
    document.querySelector('.color-control .control-label').textContent = id === 'wildfire' ? 'Listen to an aerosol type' : 'Listen to a color';
    document.querySelector('.color-buttons').setAttribute('aria-label', id === 'wildfire' ? 'Filter aerosol types' : 'Filter by color');
    document.querySelector('.focus-colors').setAttribute('aria-label', id === 'wildfire' ? 'Listen to an aerosol type' : 'Listen to a color');
    document.querySelectorAll('.color-button').forEach(button => { button.disabled = id === 'lightning'; button.setAttribute('aria-pressed', String(button.dataset.color === 'all')); });
    zone.disabled = id === 'lightning'; zone.value = 'all'; playButton.disabled = false; restartButton.disabled = false;
    rewBtn.disabled = fwdBtn.disabled = false; rewBtn.classList.remove('on'); fwdBtn.classList.remove('on'); scrubbers.forEach(x => { x.disabled = false; });
    document.querySelector('#focus-zone').disabled = id === 'lightning';
    document.querySelector('#focus-zone').value = 'all';
    document.querySelector('#focus-play').disabled = false;
    document.querySelectorAll('[data-focus-color]').forEach(button => { button.disabled = id === 'lightning'; button.setAttribute('aria-pressed', String(button.dataset.focusColor === 'all')); });
    stage.dataset.kind = d.kind; stage.classList.add('has-data');
    canvas.hidden = id === 'lightning'; canvas.tabIndex = id === 'lightning' ? -1 : 0;
    canvas.setAttribute('aria-label', id === 'lightning' ? 'Lightning map explorer' : id === 'carbon' ? 'Carbon monoxide map explorer' : 'Aerosol map explorer');
    focusHelp.textContent = id === 'lightning' ? 'The lightning map video plays with synchronized thunder. Use the playback controls to pause, restart or move through the video. Press Escape to return to the jukebox.' : defaultFocusHelp;
    video.setAttribute('aria-label', id === 'lightning' ? 'Yearly satellite map video showing lightning strikes' : 'Carbon monoxide satellite visualization');
    video.setAttribute('aria-describedby', id === 'lightning' ? 'lightning-description' : 'video-description');
    document.querySelector('#screen-label').textContent = `Now playing · ${d.title}`;
    document.querySelector('#screen-index').textContent = id === 'carbon' ? '01' : id === 'wildfire' ? '02' : '03';
    const datasetDescription = id === 'wildfire' ? 'aerosol-description' : id === 'carbon' ? 'carbon-description' : id === 'lightning' ? 'lightning-description' : '';
    canvas.setAttribute('aria-describedby', `explorer-help${datasetDescription ? ` ${datasetDescription}` : ''}`);
    screen.setAttribute('aria-describedby', `focus-help${datasetDescription ? ` ${datasetDescription}` : ''}`);
    document.querySelector('#stage-caption').textContent = id === 'lightning' ? `${d.title} · each visible cluster triggers a resonant thunder note` : `${d.title} · ${d.detail} · drag the globe or use ◀◀ ▶▶ to move through time`;
    document.querySelector('#data-readout').textContent = 'Tuning in…';
    document.title = `${d.title} · Earthmonizer`;
    video.pause();
    if (id === 'carbon' || id === 'lightning') {
      const source = id === 'carbon' ? 'resources/carbon_monoxide.mp4' : 'resources/iss_lightning_sos_yearly.mp4';
      if (video.getAttribute('src') !== source) { video.setAttribute('src', source); video.load(); }
      video.loop = true; video.muted = true;
    }
    if (id !== 'carbon' && id !== 'lightning' && !tracks[id]) buildProcedural(id);
    resizeCanvas(); paint();
    setPlaying(true);
    openFocus(); // el lector lee el título y las instrucciones del diálogo al recibir el foco
  }
  document.querySelectorAll('.record-card').forEach(button => button.addEventListener('click', () => selectDataset(button.dataset.dataset)));
  document.querySelectorAll('.color-button').forEach(button => button.addEventListener('click', () => {
    colorFilter = button.dataset.color; document.querySelectorAll('.color-button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    document.querySelectorAll('[data-focus-color]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.focusColor === colorFilter)));
    lastStep = -1; if (selected) syncView(false); else paint(); announce(`Listening to ${filterName()}.`);
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
    lastStep = -1; if (selected) syncView(false); else paint(); announce(`Listening to ${filterName()}.`);
  }));
  playButton.addEventListener('click', () => { setPlaying(!playing); announce(playing ? 'Audio playing.' : 'Audio paused.'); });
  document.querySelector('#focus-play').addEventListener('click', () => { setPlaying(!playing); announce(playing ? 'Audio playing.' : 'Audio paused.'); });
  restartButton.addEventListener('click', () => { rate = 1; rewBtn.classList.remove('on'); fwdBtn.classList.remove('on'); seek(0); if (!playing) return; setPlaying(true); announce('Visualization and audio restarted.'); });
  document.querySelector('#volume').addEventListener('input', e => {
    e.target.setAttribute('aria-valuetext', `${e.target.value} percent`);
    if (master) master.gain.setTargetAtTime(Number(e.target.value) / 100, audio.currentTime, .04);
  });
  document.querySelector('#volume').addEventListener('change', e => say(e.target.getAttribute('aria-valuetext')));
  // La pantalla enfocada es un diálogo modal: lo de atrás queda inerte (ni Tab ni el lector llegan) y el foco vuelve al disco que la abrió.
  const behind = [...document.querySelectorAll('.skip-link, .machine > :not(#screen-bezel), .listening-panel, .machine-footer')];
  function openFocus() {
    screen.classList.add('is-focused'); screen.setAttribute('role', 'dialog'); screen.setAttribute('aria-modal', 'true');
    behind.forEach(el => { el.inert = true; });
    screen.focus({ preventScroll: true });
  }
  function returnToJukebox() {
    screen.classList.remove('is-focused'); screen.removeAttribute('role'); screen.removeAttribute('aria-modal');
    behind.forEach(el => { el.inert = false; });
    const opener = document.querySelector('.record-card[aria-pressed="true"]');
    if (opener) opener.focus();
    announce(`Returned to the jukebox controls.${playing ? ' Audio is still playing.' : ''}`, 'queue');
  }
  document.querySelector('#return-button').addEventListener('click', returnToJukebox);
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('#return-button')) { e.stopPropagation(); returnToJukebox(); } }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && screen.classList.contains('is-focused')) returnToJukebox(); });
  const motionToggle = document.querySelector('#motion-toggle'), narrationToggle = document.querySelector('#narration-toggle');
  function setReducedMotion(on) { reducedMotion = on; motionToggle.setAttribute('aria-pressed', String(on)); motionToggle.textContent = `Reduce motion: ${on ? 'on' : 'off'}`; paint(); }
  motionToggle.addEventListener('click', () => { setReducedMotion(!reducedMotion); announce(`Reduced motion ${reducedMotion ? 'on' : 'off'}.`); });
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) setReducedMotion(true); // respeta la preferencia del sistema
  narrationToggle.addEventListener('click', () => {
    narrate = !narrate; narrationToggle.setAttribute('aria-pressed', String(narrate)); narrationToggle.textContent = `Spoken updates: ${narrate ? 'on' : 'off'}`;
    announce(`Spoken updates ${narrate ? 'on' : 'off'}.`);
  });
  canvas.addEventListener('click', e => {
    if (!selected || selected === 'carbon' || selected === 'lightning' || dragged) return;
    const rect = canvas.getBoundingClientRect(); let x = (e.clientX - rect.left) / rect.width, y = (e.clientY - rect.top) / rect.height;
    if (selected === 'wildfire' && aerosolImage.complete && aerosolImage.naturalWidth) {
      const fit = Math.min(rect.width / aerosolImage.naturalWidth, rect.height / aerosolImage.naturalHeight), imageW = aerosolImage.naturalWidth * fit, imageH = aerosolImage.naturalHeight * fit, imageX = (rect.width - imageW) / 2, imageY = (rect.height - imageH) / 2;
      if (e.clientX < rect.left + imageX || e.clientX > rect.left + imageX + imageW || e.clientY < rect.top + imageY || e.clientY > rect.top + imageY + imageH) return;
      x = (e.clientX - rect.left - imageX) / imageW; y = (e.clientY - rect.top - imageY) / imageH;
    }
    const value = Math.round(valueAt(x, y) * 100), region = y < .34 ? 'north' : y > .67 ? 'south' : 'center';
    zone.value = region; selectedZone = region; paint();
    if (playing) playStep(Math.floor(pos / STEP));
    announce(`${datasets[selected].title}, ${region} region, data value ${value} percent. Audio pitch reflects this value.`);
  });
  window.addEventListener('resize', () => { resizeCanvas(); paint(); drawTrace(); });
  if ('ResizeObserver' in window) new ResizeObserver(() => { resizeCanvas(); paint(); drawTrace(); drawScan(); }).observe(stage);
  resizeCanvas();

  /* ===== Línea de tiempo única: video, sonido y línea en vivo cuelgan de `pos` ===== */
  const trace = document.querySelector('#trace-canvas'), tctx = trace.getContext('2d');
  const rewBtn = document.querySelector('#rew-button'), fwdBtn = document.querySelector('#fwd-button');
  const timeEl = document.querySelector('#time-readout'), scrubbers = [...document.querySelectorAll('.scrubber')];
  const fmt = n => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
  const spoken = n => { // "1:05" dicho en palabras, para los lectores de pantalla
    const s = Math.floor(n), m = Math.floor(s / 60), r = s % 60, sec = `${r} second${r === 1 ? '' : 's'}`;
    return m ? `${m} minute${m === 1 ? '' : 's'} ${sec}` : sec;
  };
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
      const scanDuration = v.duration || dur, n = Math.floor(scanDuration / STEP), out = new Float32Array(n * K), c = document.createElement('canvas'), q = 4;
      if (selected === 'carbon') dur = scanDuration;
      c.width = COLS * q; c.height = ROWS * q; const x = c.getContext('2d', { willReadFrequently: true });
      for (let i = 0; i < n; i++) {
        await new Promise(ok => { v.addEventListener('seeked', ok, { once: true }); v.currentTime = Math.min(scanDuration - .05, i * STEP); });
        const R = v.videoHeight * .435; x.drawImage(v, v.videoWidth * .492 - R, v.videoHeight * .493 - R, 2 * R, 2 * R, 0, 0, c.width, c.height); // cuadrado que contiene el círculo de la Tierra
        const px = x.getImageData(0, 0, c.width, c.height).data;
        for (let r = 0; r < ROWS; r++) for (let cc = 0; cc < COLS; cc++) {
          let t = 0; for (let yy = 0; yy < q; yy++) for (let xx = 0; xx < q; xx++) { const k = ((r * q + yy) * c.width + cc * q + xx) * 4; t += Math.min(1, (px[k] * .2126 + px[k + 1] * .7152 + px[k + 2] * .0722) / 255 * .5 + Math.max(0, px[k] - px[k + 2]) / 255 * 1.5); }
          out[(i * ROWS + r) * COLS + cc] = t / (q * q);
        }
      }
      finish('carbon', out);
      if (selected === 'carbon') announce('Carbon monoxide data ready.', 'queue');
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
    if (selected === 'lightning') return;
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
  const isNative = () => (selected === 'carbon' || selected === 'lightning') && playing && rate === 1 && !holding;
  const scanCv = document.querySelector('#scan-canvas'), sctx = scanCv.getContext('2d');
  function drawScan() { // línea transversal N→S sobre la Tierra; su curva sube donde hay más señal = lo que suena
    const w = scanCv.clientWidth, h = scanCv.clientHeight; if (!w || !h) return;
    const r = Math.min(window.devicePixelRatio || 1, 2);
    if (scanCv.width !== Math.round(w * r)) { scanCv.width = Math.round(w * r); scanCv.height = Math.round(h * r); }
    sctx.setTransform(r, 0, 0, r, 0, 0); sctx.clearRect(0, 0, w, h);
    if (selected === 'lightning') {
      const vw = video.videoWidth || 4096, vh = video.videoHeight || 2048, scale = Math.max(w / vw, h / vh), ox = (w - vw * scale) / 2, oy = (h - vh * scale) / 2;
      activeLightningPoints.forEach(({ key, intensity }) => {
        const [col, row] = key.split(':').map(Number), cellW = vw * scale / 16, cellH = vh * scale / 8, x = ox + (col + .5) * cellW, y = oy + (row + .5) * cellH;
        sctx.fillStyle = `rgba(255, 221, 69, ${.1 + intensity * .22})`; sctx.strokeStyle = `rgba(255, 238, 118, ${.55 + intensity * .4})`; sctx.lineWidth = 1.5;
        sctx.fillRect(x - cellW / 2, y - cellH / 2, cellW, cellH); sctx.strokeRect(x - cellW / 2, y - cellH / 2, cellW, cellH);
        sctx.fillStyle = '#fff5b1'; sctx.beginPath(); sctx.arc(x, y, 1.5 + intensity * 2, 0, Math.PI * 2); sctx.fill();
      });
      return;
    }
    if (!selected || !tracks[selected]) return;
    const circle = selected === 'carbon', vw = video.videoWidth || 1920, vh = video.videoHeight || 1080, s = Math.max(w / vw, h / vh);
    const R = vh * .435 * s, cx = (w - vw * s) / 2 + vw * .492 * s, cy = (h - vh * s) / 2 + vh * .493 * s;
    let mapX = 0, mapY = 0, mapW = w, mapH = h;
    if (selected === 'wildfire' && aerosolImage.naturalWidth) { const fit = Math.min(w / aerosolImage.naturalWidth, h / aerosolImage.naturalHeight); mapW = aerosolImage.naturalWidth * fit; mapH = aerosolImage.naturalHeight * fit; mapX = (w - mapW) / 2; mapY = (h - mapH) / 2; }
    const y = sweepY(pos), ly = circle ? cy - R + y * 2 * R : mapY + y * mapH, hc = circle ? Math.sqrt(Math.max(0, R * R - (ly - cy) ** 2)) : mapW / 2, mid = circle ? cx : mapX + mapW / 2;
    const prof = profileAt(selected, pos), amp = circle ? R * .28 : mapH * .12, lw = Math.max(1.5, w / 230);
    const px = c => circle ? cx - R + (c + .5) / COLS * 2 * R : mapX + (c + .5) / COLS * mapW, pts = prof.cols.map((c, k) => [px(c), ly - prof.vals[k] * amp]);
    sctx.lineJoin = sctx.lineCap = 'round';
    let scanColor = 'rgba(238,248,255,.55)';
    if (selected === 'wildfire') {
      if (colorFilter !== 'all') scanColor = aerosolColors[colorFilter];
      else if (noteSet && noteSet.items.length) { const k = Math.min(noteSet.items.length - 1, Math.floor((performance.now() - noteSet.t0) / noteSet.gap)), sounding = noteSet.items[k]; if (sounding.on) scanColor = aerosolColors[aerosolTypeAt(sounding.c, prof.r)]; }
    }
    sctx.strokeStyle = scanColor; sctx.lineWidth = Math.max(1, lw * .5); sctx.setLineDash([4, 4]); sctx.beginPath(); sctx.moveTo(mid - hc, ly); sctx.lineTo(mid + hc, ly); sctx.stroke(); sctx.setLineDash([]);
    if (pts.length > 1) {
      sctx.beginPath(); sctx.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length - 1; k++) sctx.quadraticCurveTo(pts[k][0], pts[k][1], (pts[k][0] + pts[k + 1][0]) / 2, (pts[k][1] + pts[k + 1][1]) / 2);
      sctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
      sctx.strokeStyle = 'rgba(40,32,69,.85)'; sctx.lineWidth = lw * 2.6; sctx.stroke();
      if (selected === 'wildfire') {
        sctx.lineWidth = lw;
        for (let k = 1; k < pts.length; k++) { sctx.beginPath(); sctx.moveTo(pts[k - 1][0], pts[k - 1][1]); sctx.lineTo(pts[k][0], pts[k][1]); sctx.strokeStyle = aerosolColors[aerosolTypeAt(prof.cols[k], prof.r)]; sctx.stroke(); }
      } else { sctx.strokeStyle = '#ffeb6c'; sctx.lineWidth = lw; sctx.stroke(); }
    }
    if (noteSet) { const el = performance.now() - noteSet.t0; noteSet.items.forEach((it, k) => {
      const lit = el >= k * noteSet.gap, x = px(it.c), yy = ly - it.v * amp, color = selected === 'wildfire' ? aerosolColors[it.type || 'background'] : lit ? '#ff5a2b' : '#eef8ff';
      sctx.shadowColor = color; sctx.shadowBlur = lit && it.on ? 10 : 4; sctx.fillStyle = it.on ? color : 'rgba(238,248,255,.35)'; sctx.strokeStyle = lit && it.on ? '#fff' : color; sctx.lineWidth = lit && it.on ? 2 : 1.3;
      sctx.beginPath(); sctx.arc(x, yy, 3.5 + (lit && it.on ? 1.5 : 0), 0, Math.PI * 2); sctx.fill(); sctx.stroke(); sctx.shadowBlur = 0; }); }
    if (cursor && document.activeElement === canvas) { // casilla del explorador por teclado
      const bw = (circle ? 2 * R : w) / GRID, bh = (circle ? 2 * R : h) / GRID, x0 = circle ? cx - R : 0, y0 = circle ? cy - R : 0;
      sctx.strokeStyle = '#ffeb6c'; sctx.lineWidth = 2; sctx.setLineDash([5, 4]); sctx.strokeRect(x0 + cursor.c * bw, y0 + cursor.r * bh, bw, bh); sctx.setLineDash([]);
    }
  }
  function syncView(fromTick) {
    if (selected === 'carbon' || selected === 'lightning') { if (!isNative() && video.readyState >= 1 && !video.seeking && Math.abs(video.currentTime - pos) > .03) video.currentTime = pos; }
    else if (!reducedMotion || !fromTick) paint();
    const i = Math.floor(pos / STEP);
    if (i !== lastStep) { lastStep = i; if (playing || !fromTick) playStep(i); }
    drawTrace(); drawScan();
    timeEl.textContent = `${fmt(pos)} / ${fmt(dur)} · ${rate < 0 ? '◀◀' : '▶'} ${Math.abs(rate)}×${playing ? '' : ' · PAUSED'}`;
    const said = `${spoken(pos)} of ${spoken(dur)}`;
    if (!scrubbing) scrubbers.forEach(x => {
      // con la barra enfocada solo se mueve una vez por segundo, si no el lector repite la posición sin parar
      if (fromTick && x === document.activeElement && x.getAttribute('aria-valuetext') === said) return;
      x.value = String(Math.round(pos / dur * 1000));
      if (x.getAttribute('aria-valuetext') !== said) x.setAttribute('aria-valuetext', said);
    });
  }
  function seek(p) { pos = ((p % dur) + dur) % dur; if ((selected === 'carbon' || selected === 'lightning') && video.readyState >= 1 && !video.seeking) video.currentTime = pos; if (selected) syncView(false); }
  function tick(ts) {
    const dt = Math.min(.1, (ts - lastTs) / 1000) || 0; lastTs = ts;
    if (selected) {
      const native = isNative();
      if (selected === 'carbon' || selected === 'lightning') {
        if (native) { if (video.paused) { if (video.readyState >= 2) { video.currentTime = pos; video.play().catch(() => {}); } } else pos = video.currentTime; }
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
    ['pointerup', 'change', 'blur'].forEach(ev => x.addEventListener(ev, () => { if (!scrubbing) return; scrubbing = holding = false; if ((selected === 'carbon' || selected === 'lightning') && video.readyState >= 1) video.currentTime = pos; }));
    x.addEventListener('input', () => seek(Number(x.value) / 1000 * dur));
    // Con teclado la barra salta 2 s (10 s con RePág/AvPág); con sus 1000 pasos nativos cada flecha movía 0.04 s.
    x.addEventListener('keydown', e => {
      const jumps = { ArrowLeft: -2, ArrowDown: -2, ArrowRight: 2, ArrowUp: 2, PageDown: -10, PageUp: 10 };
      if (e.key === 'Home') seek(0); else if (e.key === 'End') seek(dur - STEP); else if (e.key in jumps) seek(clamp(pos + jumps[e.key], 0, dur - STEP)); else return;
      e.preventDefault();
      say(x.getAttribute('aria-valuetext')); // el lector de pantalla ya lee el valor solo; la voz de la página no
    });
  });
  // Arrastrar la Tierra: a la derecha avanza el tiempo, a la izquierda retrocede.
  stage.addEventListener('pointerdown', e => { if (selected) { dragX = e.clientX; dragged = false; } });
  stage.addEventListener('pointermove', e => {
    if (dragX === null) return; const dx = e.clientX - dragX;
    if (!dragged && Math.abs(dx) < 4) return; dragged = true; holding = true; dragX = e.clientX; seek(pos + dx / stage.clientWidth * 10);
  });
  const endDrag = () => { if (dragged) { holding = false; if ((selected === 'carbon' || selected === 'lightning') && video.readyState >= 1) video.currentTime = pos; } dragX = null; setTimeout(() => { dragged = false; }, 0); };
  window.addEventListener('pointerup', endDrag); window.addEventListener('pointercancel', endDrag);
  document.addEventListener('keydown', e => {
    // sin modificadores para no robar atajos como Alt+← (atrás); en el mapa las flechas son del explorador
    if (!selected || e.altKey || e.ctrlKey || e.metaKey || e.target === canvas || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); seek(pos - 2); } else if (e.key === 'ArrowRight') { e.preventDefault(); seek(pos + 2); }
  });

  /* ===== Explorador por teclado: con el mapa enfocado, las flechas lo recorren por regiones y cada una suena y se lee ===== */
  const sideOf = col => col < COLS / 3 ? 'west' : col < COLS * 2 / 3 ? 'center' : 'east';
  const percent = v => `${Math.round(v * 100)} percent`;
  const capital = text => text[0].toUpperCase() + text.slice(1);
  function average(r0, r1, c0, c1) { // promedio de las celdas (dentro de la Tierra) en el instante actual; null si no hay ninguna
    const i = Math.floor(pos / STEP); let t = 0, k = 0;
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) if (inside(selected, c, r)) { t += cell(selected, i, c, r); k++; }
    return k ? t / k : null;
  }
  const blockValue = (r, c) => average(r * BLOCK, (r + 1) * BLOCK, c * BLOCK, (c + 1) * BLOCK);
  function dominantAerosol(r, c) {
    const counts = {};
    for (let rr = r * BLOCK; rr < (r + 1) * BLOCK; rr++) for (let cc = c * BLOCK; cc < (c + 1) * BLOCK; cc++) {
      const type = aerosolTypeAt(cc, rr); if (type !== 'background') counts[type] = (counts[type] || 0) + 1;
    }
    return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || null;
  }
  const placeOf = (r, c) => { // como brújula: "north-west", "east", "center"…
    const ns = bandOf((r + .5) * BLOCK), we = sideOf((c + .5) * BLOCK);
    return ns === 'center' ? we : we === 'center' ? ns : `${ns}-${we}`;
  };
  function describeRegion() {
    const { r, c } = cursor, v = blockValue(r, c), where = `${capital(placeOf(r, c))}. Row ${r + 1}, column ${c + 1}.`;
    if (v === null) { announce(`Outside the Earth. ${where}`); return; }
    if (selected === 'wildfire') {
      const type = dominantAerosol(r, c);
      if (!type) { announce(`No colored aerosol pixels detected here. ${where}`); return; }
      if (ensureAudio()) aerosolVoice(type, pitch(v), audio.currentTime + .01, v);
      announce(`${capital(aerosolNames[type])}, shown in ${type === 'carbon' ? 'red' : type === 'dust' ? 'pink' : type === 'sea' ? 'blue' : 'green'}, sounds as ${aerosolTimbres[type]}. ${percent(v)} signal, ${levelOf(v)}. ${where}`);
      return;
    }
    if (selected === 'carbon') {
      if (ensureAudio()) carbonAirVoice(v, audio.currentTime + .01);
      announce(`Carbon monoxide signal: ${percent(v)}, ${levelOf(v)}. It is sonified as rushing air; stronger readings make the airflow louder and brighter. ${where}`);
      return;
    }
    if (ensureAudio()) voice(pitch(v), audio.currentTime + .01, .16, v > .8);
    announce(`${percent(v)}, ${levelOf(v)}. ${where}`);
  }
  function describeMoment() {
    const bands = ['north', 'center', 'south'].map((name, b) => {
      const v = average(b * ROWS / 3, (b + 1) * ROWS / 3, 0, COLS); return v === null ? '' : ` ${capital(name)}: ${levelOf(v)}, ${percent(v)}.`;
    }).join('');
    const aerosolSummary = selected === 'wildfire' ? ` Aerosol sound key: ${['carbon', 'dust', 'sea', 'sulfate'].map(type => {
      let count = 0; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (aerosolTypeAt(c, r) === type) count++;
      return `${aerosolNames[type]}, ${count} map cells, ${aerosolTimbres[type]}`;
    }).join('. ')}.` : '';
    let best = null;
    for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) { const v = blockValue(r, c); if (v !== null && (!best || v > best.v)) best = { r, c, v }; }
    announce(`${datasets[selected].title} at ${spoken(pos)} of ${spoken(dur)}${playing ? '' : ', paused'}.${bands}${aerosolSummary}${best ? ` Strongest reading: ${placeOf(best.r, best.c)}, ${percent(best.v)}.` : ''}`);
  }
  canvas.addEventListener('keydown', e => {
    const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Home: [0, -GRID], End: [0, GRID] };
    if (!selected || e.altKey || e.ctrlKey || e.metaKey || !(e.key in moves || e.key === 'Enter' || e.key === ' ')) return;
    e.preventDefault();
    if (!tracks[selected]) { announce('Still reading the data, try again in a moment.'); return; }
    if (e.key === 'Enter' || e.key === ' ') { describeMoment(); return; }
    if (!cursor) { cursor = { r: GRID / 2 - 1, c: GRID / 2 - 1 }; describeRegion(); return; } // la primera tecla empieza cerca del centro
    const [dr, dc] = moves[e.key], next = { r: clamp(cursor.r + dr, 0, GRID - 1), c: clamp(cursor.c + dc, 0, GRID - 1) };
    if (next.r === cursor.r && next.c === cursor.c) { announce('Edge of the map.'); return; }
    cursor = next; describeRegion();
  });

  /* ===== Voz propia de la página: lee en voz alta lo que recibe el foco y cada aviso, sin necesitar un lector de pantalla ===== */
  const speech = window.speechSynthesis, voiceToggle = document.querySelector('#voice-toggle'), voiceSelect = document.querySelector('#voice-select');
  const load = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const save = (key, value) => { try { localStorage.setItem(key, value); } catch { /* sin almacenamiento solo no se recuerda */ } };
  const WELCOME = document.querySelector('#project-introduction').textContent;
  // mode: 'interrupt' (por defecto) corta lo que esté diciendo, 'queue' espera su turno, 'idle' solo habla si está callada
  function say(text, mode = 'interrupt') {
    if (!voiceOn || !text || (mode === 'idle' && (speech.speaking || speech.pending))) return;
    if (mode === 'interrupt') speech.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/\s*·\s*/g, ', ')), voice = voices.find(v => v.voiceURI === voiceSelect.value);
    utterance.lang = voice ? voice.lang : 'en-US';
    if (voice) utterance.voice = voice;
    speech.speak(utterance);
  }
  function loadVoices() {
    // las que suenan más humanas primero: las "Natural" de Edge y las Premium de Apple, luego las de Google y las "Online"
    const all = speech.getVoices(), english = all.filter(v => /^en/i.test(v.lang));
    const quality = v => /natural|neural|premium|enhanced/i.test(v.name) ? 2 : /google|online/i.test(v.name) ? 1 : 0;
    voices = (english.length ? english : all).sort((a, b) => quality(b) - quality(a) || a.name.localeCompare(b.name));
    voiceSelect.replaceChildren(...(voices.length ? voices.map(v => new Option(`${v.name} (${v.lang})`, v.voiceURI)) : [new Option('No voices in this browser', '')]));
    voiceSelect.disabled = !voices.length;
    const saved = load('earthmonizer-voice-name');
    if (voices.length) voiceSelect.value = voices.some(v => v.voiceURI === saved) ? saved : voices[0].voiceURI;
  }
  function setVoice(on) {
    voiceOn = on; save('earthmonizer-voice', on ? 'on' : 'off');
    voiceToggle.setAttribute('aria-pressed', String(on)); voiceToggle.textContent = `Page voice: ${on ? 'on' : 'off'}`;
    if (!on) speech.cancel();
  }
  const toggleVoice = () => { setVoice(!voiceOn); announce(`Page voice ${voiceOn ? 'on' : 'off'}.`); };
  // Lo que diría un lector de pantalla al llegar a un control: nombre, tipo y estado
  const textOf = ids => ids.split(' ').map(id => (document.getElementById(id) || {}).textContent || '').join(' ');
  function labelOf(el) {
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
    if (el.getAttribute('aria-labelledby')) return textOf(el.getAttribute('aria-labelledby'));
    if (el.labels && el.labels.length) { const label = el.labels[0].cloneNode(true); label.querySelectorAll('select, input').forEach(n => n.remove()); return label.textContent; }
    return el.textContent;
  }
  function describe(el) {
    const pressed = el.getAttribute('aria-pressed') === 'true';
    let kind = el.getAttribute('aria-roledescription') || el.getAttribute('role') || '';
    if (el.tagName === 'SELECT') kind = `${el.selectedOptions[0] ? el.selectedOptions[0].text : ''}, list`;
    else if (el.type === 'range') kind = `${el.getAttribute('aria-valuetext') || el.value}, slider`;
    else if (el.tagName === 'A') kind = 'link';
    else if (el.tagName === 'BUTTON') kind = !el.hasAttribute('aria-pressed') ? 'button' : el.classList.contains('motion-toggle') ? `button, ${pressed ? 'on' : 'off'}` : `button${pressed ? ', selected' : ''}`;
    const help = el.getAttribute('aria-describedby') ? ` ${textOf(el.getAttribute('aria-describedby'))}` : '';
    return `${labelOf(el).replace(/\s+/g, ' ').trim()}${kind ? `, ${kind}` : ''}${el.disabled ? ', unavailable' : ''}.${help}`;
  }
  if (speech) {
    loadVoices(); speech.addEventListener('voiceschanged', loadVoices);
    setVoice(load('earthmonizer-voice') !== 'off');
    voiceToggle.addEventListener('click', toggleVoice);
    voiceSelect.addEventListener('change', () => { save('earthmonizer-voice-name', voiceSelect.value); say(`${voiceSelect.selectedOptions[0].text}. Hello, this is the voice of Earthmonizer.`); });
    document.addEventListener('focusin', e => {
      if (!voiceOn) return;
      if (!welcomed) { welcomed = true; say(WELCOME); say(describe(e.target), 'queue'); return; } // la primera vez se presenta
      say(describe(e.target));
    });
    document.addEventListener('keydown', e => {
      if (e.key.toLowerCase() !== 'v' || e.repeat || e.altKey || e.ctrlKey || e.metaKey || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      e.preventDefault(); toggleVoice();
    });
  } else { // navegador sin síntesis de voz: queda solo el lector de pantalla
    voiceToggle.disabled = voiceSelect.disabled = true; voiceToggle.textContent = 'Page voice: unavailable';
    voiceSelect.replaceChildren(new Option('Not supported in this browser', ''));
  }

  const projectIntroduction = document.querySelector('#project-introduction').textContent;
  setTimeout(() => {
    welcomed = true;
    announcer.textContent = '';
    requestAnimationFrame(() => { announcer.textContent = projectIntroduction; });
  }, 400);

  video.addEventListener('loadedmetadata', () => { if (selected === 'carbon' || selected === 'lightning') { dur = video.duration || dur; if (Math.abs(video.currentTime - pos) > .03) video.currentTime = pos; } });
  scanCarbon(); requestAnimationFrame(tick);
})();
