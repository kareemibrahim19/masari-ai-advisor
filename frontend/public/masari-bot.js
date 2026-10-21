/* Masari Bot — <masari-bot> web component. No dependencies.
   Attributes:
     theme      "light" | "dark"  (dark = same colors + white outer outline)
     mood       idle hop wave happy thinking talking celebrate sleep sad worried proud listening reading walk peek bye confused point pointUp nod toss
     outfit     "none" | "grad" | "chat"
     progress   0-2 lit plan dots on the chest
     track      "false" disables eye tracking
     intensity  0-2 motion strength
     enter      pop-in on load
     fill       fill the parent box
     sleep-after  seconds of no mouse activity before falling asleep
     wake-to    mood after waking (default: previous mood or "wave")
     arrive     mood after walkAlong finishes (default "wave")
     edge       peek edge: "bottom" (default) | "left" | "right"
     level      0-1 voice level for "listening" (or set el.level = 0.6 every frame); simulated if absent
     once       with mood="bye": play once, stay hidden, fire "masari-gone"
   Methods: el.poke(), el.wake(), el.doze(), el.hopAlong([[x,y],...], msPerHop), el.enter(), el.setMood(m), el.walkAlong([[x,y],...], msPerStep), el.resetWalk()
   Events: masari-poke, masari-awake, masari-asleep, masari-arrived, masari-gone */
(() => {
  const O = '#F27A2E';
  const BASE = { C: '#1E2230', W: '#FFFFFF', S: '#1E2230', H: '#FFFFFF', BAND: '#2A2F40' };
  const PAL = { light: { ...BASE, SH: '#1E2230', SHO: 0.1, OUT: 0 }, dark: { ...BASE, SH: '#000000', SHO: 0.45, OUT: 1 } };
  const STYLE = '<style>:host{display:inline-block;width:200px;aspect-ratio:240/280;cursor:pointer;-webkit-tap-highlight-color:transparent}:host([fill]){width:100%;height:100%;aspect-ratio:auto}</style>';
  const SVG = ({ C, W, S, H, BAND, SH, SHO, OUT }) => `
<svg viewBox="0 -40 240 280" style="width:100%;height:100%;display:block;overflow:visible">
  <defs>
    <filter id="ol" x="-30%" y="-30%" width="160%" height="160%"><feMorphology in="SourceAlpha" operator="dilate" radius="3.5" result="d"/><feFlood flood-color="#FFFFFF"/><feComposite in2="d" operator="in" result="o"/><feMerge><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <clipPath id="edge"><rect x="-400" y="-400" width="1040" height="626"/></clipPath>
  </defs>
  <ellipse data-r="shadow" cx="120" cy="216" rx="46" ry="7" fill="${SH}" opacity="${SHO}"/>
  <g data-r="all" ${OUT ? 'filter="url(#ol)"' : ''}>
  <g data-r="sparkWrap"><g data-r="spark">
    <path d="M30 60 L33 70 L43 73 L33 76 L30 86 L27 76 L17 73 L27 70 Z" fill="${O}"/>
    <path d="M210 70 L212 77 L219 79 L212 81 L210 88 L208 81 L201 79 L208 77 Z" fill="${C}"/>
    <path d="M24 160 L26 166 L32 168 L26 170 L24 176 L22 170 L16 168 L22 166 Z" fill="${C}"/>
    <path d="M214 150 L216 157 L223 159 L216 161 L214 168 L212 161 L205 159 L212 157 Z" fill="${O}"/>
  </g></g>
  <g data-r="chatOnly">
    <rect x="178" y="-8" width="56" height="32" rx="14" fill="${W}" stroke="${C}" stroke-width="4"/>
    <path d="M190 22 L184 34 L200 24" fill="${W}" stroke="${C}" stroke-width="4" stroke-linejoin="round"/>
    <rect x="186" y="18" width="16" height="5" fill="${W}"/>
    <g data-r="bubble" fill="${C}"><circle cx="194" cy="8" r="4"/><circle cx="206" cy="8" r="4" fill="${O}"/><circle cx="218" cy="8" r="4"/></g>
  </g>
  <g data-r="zzz" fill="${C}" style="font:700 18px Sora,system-ui,sans-serif">
    <text x="176" y="40">z</text><text x="190" y="22" style="font-size:14px">z</text><text x="202" y="8" style="font-size:11px">z</text>
  </g>
  <g data-r="burst" stroke="${O}" stroke-width="5" stroke-linecap="round">
    <line x1="120" y1="-6" x2="120" y2="-20"/><line x1="196" y1="40" x2="208" y2="32"/><line x1="44" y1="40" x2="32" y2="32"/>
    <line x1="214" y1="116" x2="228" y2="118"/><line x1="26" y1="116" x2="12" y2="118"/>
  </g>
  <g data-r="huh"><text x="34" y="40" fill="${O}" style="font:700 38px Sora,system-ui,sans-serif">?</text></g>
  <g data-r="waves" fill="none" stroke="${O}" stroke-width="4" stroke-linecap="round">
    <path d="M212 70 Q219 82 212 94"/><path d="M222 62 Q233 82 222 102"/><path d="M232 54 Q247 82 232 110"/>
  </g>
  <g clip-path="url(#edge)">
  <g data-r="body">
    <rect data-r="legL" x="100" y="190" width="16" height="20" rx="7" fill="${C}"/>
    <rect data-r="legR" x="124" y="190" width="16" height="20" rx="7" fill="${C}"/>
    <rect x="90" y="134" width="60" height="62" rx="24" fill="${W}" stroke="${C}" stroke-width="6"/>
    <g data-r="gradOnly">
      <path d="M98 137 L93 186 L100 190 L103 138 Z" fill="${O}" stroke="${C}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M142 137 L147 186 L140 190 L137 138 Z" fill="${O}" stroke="${C}" stroke-width="3" stroke-linejoin="round"/>
    </g>
    <path d="M108 182 C108 173 120 175 120 168 C120 161 132 163 132 156" fill="none" stroke="${C}" stroke-width="4" stroke-linecap="round"/>
    <circle data-r="dot1" cx="108" cy="182" r="4.5" fill="${W}" stroke="${C}" stroke-width="3.5"/>
    <circle data-r="dot2" cx="120" cy="168" r="4.5" fill="${W}" stroke="${C}" stroke-width="3.5"/>
    <circle data-r="dot3" cx="132" cy="156" r="6" fill="${O}"/>
    <g data-r="head">
      <g data-r="chatOnly2"><path d="M56 82 Q56 18 120 18 Q184 18 184 82" fill="none" stroke="${C}" stroke-width="7" stroke-linecap="round"/></g>
      <g data-r="antWrap"><g data-r="ant">
        <line x1="120" y1="36" x2="120" y2="20" stroke="${C}" stroke-width="6" stroke-linecap="round"/>
        <circle data-r="bulb" cx="120" cy="16" r="8" fill="${O}"/>
      </g></g>
      <rect x="52" y="34" width="136" height="106" rx="46" fill="${W}" stroke="${C}" stroke-width="6"/>
      <rect x="68" y="52" width="104" height="70" rx="28" fill="${S}"/>
      <path data-r="sweat" d="M176 40 Q169 52 176 58 Q183 52 176 40 Z" fill="#CFEFFF" stroke="${C}" stroke-width="3" stroke-linejoin="round"/>
      <g data-r="chatOnly3">
        <rect x="40" y="64" width="20" height="36" rx="9" fill="${C}"/>
        <rect x="180" y="64" width="20" height="36" rx="9" fill="${C}"/>
        <rect x="45" y="72" width="6" height="20" rx="3" fill="${O}"/>
        <rect x="189" y="72" width="6" height="20" rx="3" fill="${O}"/>
        <path d="M48 98 Q50 128 84 128" fill="none" stroke="${C}" stroke-width="4.5" stroke-linecap="round"/>
        <circle cx="88" cy="128" r="6" fill="${O}" stroke="${C}" stroke-width="3"/>
      </g>
      <g data-r="face">
        <g data-r="eyesOpen"><g data-r="blink">
          <ellipse cx="100" cy="84" rx="8" ry="12" fill="${O}"/>
          <g data-r="eyeR"><ellipse cx="140" cy="84" rx="8" ry="12" fill="${O}"/><circle cx="143" cy="79" r="2.5" fill="${H}"/></g>
          <circle cx="103" cy="79" r="2.5" fill="${H}"/>
        </g></g>
        <g data-r="sadBrows" fill="none" stroke="${O}" stroke-width="4" stroke-linecap="round"><path d="M89 69 L108 62"/><path d="M132 62 L151 69"/></g>
        <g data-r="worryBrows" fill="none" stroke="${O}" stroke-width="4" stroke-linecap="round"><path d="M88 66 Q97 57 108 61"/><path d="M132 61 Q143 57 152 66"/></g>
        <path data-r="tear" d="M100 94 Q95 101 100 105 Q105 101 100 94 Z" fill="${H}"/>
        <g data-r="eyesHappy" fill="none" stroke="${O}" stroke-width="5" stroke-linecap="round">
          <path d="M91 88 Q100 74 109 88"/><path d="M131 88 Q140 74 149 88"/>
        </g>
        <g data-r="eyesSleep" fill="none" stroke="${O}" stroke-width="4.5" stroke-linecap="round">
          <path d="M91 84 Q100 92 109 84"/><path d="M131 84 Q140 92 149 84"/>
        </g>
        <path data-r="mouth" d="M113 106 Q120 112 127 106" fill="none" stroke="${O}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
        <rect data-r="bite" x="115" y="104" width="10" height="5" rx="1.5" fill="${H}"/>
        <ellipse data-r="talk" cx="120" cy="107" rx="7" ry="4" fill="${O}"/>
      </g>
      <g data-r="cap">
        <path d="M84 38 L84 50 Q120 58 156 50 L156 38 Z" fill="${BAND}"/>
        <polygon points="120,16 182,34 120,52 58,34" fill="${C}"/>
        <g data-r="tassel">
          <path d="M120 34 L176 38 L176 62" fill="none" stroke="${O}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M171 60 L181 60 L183 72 L169 72 Z" fill="${O}"/>
        </g>
        <circle cx="120" cy="34" r="4.5" fill="${O}"/>
      </g>
    </g>
    <g data-r="book">
      <path d="M120 134 Q101 127 82 132 L82 170 Q101 165 120 172 Z" fill="${W}" stroke="${C}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M120 134 Q139 127 158 132 L158 170 Q139 165 120 172 Z" fill="${W}" stroke="${C}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M89 142 L113 140 M89 150 L113 148 M89 158 L107 156 M127 140 L151 142 M127 148 L151 150 M127 156 L145 158" stroke="#9A9DAB" stroke-width="2.5" stroke-linecap="round"/>
      <rect data-r="hl" x="125" y="136" width="29" height="8" rx="4" fill="${O}" opacity="0.45"/>
      <path data-r="flip" d="M120 134 Q139 127 158 132 L158 170 Q139 165 120 172 Z" fill="#FFF4EA" stroke="${C}" stroke-width="4" stroke-linejoin="round"/>
    </g>
    <rect data-r="armL" x="74" y="148" width="16" height="32" rx="8" fill="${C}"/>
    <g data-r="armR">
      <rect x="150" y="148" width="16" height="32" rx="8" fill="${C}"/>
      <g data-r="gradOnly2">
        <rect x="140" y="170" width="40" height="13" rx="6.5" fill="${W}" stroke="${C}" stroke-width="3.5"/>
        <rect x="154" y="169" width="7" height="15" fill="${O}" stroke="${C}" stroke-width="2.5"/>
      </g>
    </g>
    <g data-r="cup">
      <path d="M177 130 L192 96" fill="none" stroke="${C}" stroke-width="15" stroke-linecap="round"/>
      <path d="M186 70 Q200 70 200 86 Q200 100 190 102" fill="none" stroke="${C}" stroke-width="12" stroke-linecap="round"/>
    </g>
  </g>
  <g data-r="grip" fill="${C}"><rect x="64" y="208" width="30" height="16" rx="8"/><rect x="146" y="208" width="30" height="16" rx="8"/></g>
  </g>
  </g>
</svg>`;
  const MOUTHS = {
    idle: 'M113 106 Q120 112 127 106', thinking: 'M114 108 Q121 105 127 107', sleep: 'M116 107 Q120 109 124 107',
    happy: 'M110 102 Q120 118 130 102 Z', wave: 'M110 102 Q120 118 130 102 Z', celebrate: 'M108 100 Q120 120 132 100 Z', toss: 'M108 100 Q120 120 132 100 Z',
    proud: 'M111 103 Q120 114 129 103 Z', bye: 'M110 102 Q120 118 130 102 Z',
    sad: 'M111 111 Q120 102 129 111', worried: 'M109 107 Q114.5 111 120 107 Q125.5 111 131 107',
    hop: 'M111 103 Q120 114 129 103', listening: 'M115 107 Q120 111 125 107', reading: 'M114 108 L126 108', peek: 'M114 106 Q120 111 126 106', walk: 'M112 105 Q120 112 128 105',
    confused: 'M110 108 Q115 103 120 108 Q125 113 130 108', point: 'M112 105 Q120 113 128 105', pointUp: 'M111 103 Q120 114 129 103', nod: 'M111 104 Q120 114 129 104'
  };
  const HAPPY = ['happy', 'celebrate', 'wave', 'toss', 'proud', 'bye'];
  const backOut = x => { const c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
  const ease = x => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;

  class MasariBot extends HTMLElement {
    static get observedAttributes() { return ['mood', 'outfit', 'progress', 'track', 'intensity', 'theme', 'edge']; }
    constructor() {
      super();
      this.attachShadow({ mode: 'open' }); this.render();
      Object.assign(this, { act: null, path: null, curFace: '', lastAct: performance.now(), mx: null, fx: 0, fy: 0, by: 0, bx: 0, hr: 0, hy: 0, aL: 0, aR: 0, pk: 0, blinkT: -1, popT: -1, moodT: performance.now(), wdir: 0, level: null });
      this.addEventListener('click', () => this.poke());
    }
    render() {
      const th = this.getAttribute('theme') === 'dark' ? 'dark' : 'light';
      if (th === this.th) return; this.th = th; this.pal = PAL[th];
      this.shadowRoot.innerHTML = STYLE + SVG(this.pal);
      this.r = {}; this.shadowRoot.querySelectorAll('[data-r]').forEach(n => this.r[n.dataset.r] = n);
      this.svg = this.shadowRoot.querySelector('svg'); this.curFace = '';
    }
    connectedCallback() {
      this.rm = matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.nextBlink = performance.now() + 1500 + Math.random() * 2000;
      this.onMove = e => { this.mx = e.clientX; this.my = e.clientY; this.lastAct = performance.now(); };
      window.addEventListener('pointermove', this.onMove);
      this.apply();
      if (this.hasAttribute('enter')) this.enter();
      if (this.mood === 'peek') this.pk = 240;
      const loop = now => { this.raf = requestAnimationFrame(loop); this.tick(now); };
      this.raf = requestAnimationFrame(loop);
    }
    disconnectedCallback() { cancelAnimationFrame(this.raf); window.removeEventListener('pointermove', this.onMove); }
    attributeChangedCallback(n) {
      if (n === 'mood') { this.moodT = performance.now(); this.gone = false; }
      if (n === 'theme') this.render();
      if (this.r) this.apply();
    }
    get mood() { return this.getAttribute('mood') || 'idle'; }
    setMood(m) { this.setAttribute('mood', m); }
    poke() {
      if (this.act && this.act.type === 'doze') { this.act = null; this.lastAct = performance.now(); this.apply(); }
      if (this.mood === 'sleep') return this.wake();
      if (this.act && this.act.type === 'wake') return;
      this.act = { type: 'poke', t0: performance.now() };
      this.dispatchEvent(new CustomEvent('masari-poke', { bubbles: true }));
    }
    wake() {
      if (this.act && this.act.type === 'wake') return;
      if (this.mood !== 'sleep') this.setAttribute('mood', 'sleep');
      this.act = { type: 'wake', t0: performance.now() };
    }
    doze() {
      if (this.mood === 'sleep' || (this.act && this.act.type === 'doze')) return;
      this.prevMood = this.mood; this.act = { type: 'doze', t0: performance.now() };
    }
    hopAlong(points, seg = 950) { this.walkAlong(points, seg); this.path.hop = true; this.setAttribute('mood', 'hop'); }
    enter() { this.popT = performance.now(); }
    walkAlong(points, seg = 800) {
      const cur = this.path ? this.path.pos : (this.walkPos || [0, 0]);
      this.path = { pts: [cur, ...points], t0: performance.now(), seg, pos: cur };
      if (this.mood !== 'walk') { this.prevMood = this.mood; this.setAttribute('mood', 'walk'); }
    }
    resetWalk() { this.path = null; this.walkPos = [0, 0]; this.style.translate = ''; this.wdir = 0; }
    endAct() {
      const a = this.act; this.act = null; this.lastAct = performance.now();
      if (a.type === 'doze') {
        this.setAttribute('mood', 'sleep');
        this.dispatchEvent(new CustomEvent('masari-asleep', { bubbles: true }));
      }
      if (a.type === 'wake') {
        this.setAttribute('mood', this.getAttribute('wake-to') || this.prevMood || 'wave');
        this.dispatchEvent(new CustomEvent('masari-awake', { bubbles: true }));
      }
      this.apply();
    }
    show(n, v) { if (this.r[n]) this.r[n].style.display = v ? '' : 'none'; }
    face(mode, yawn) {
      const key = mode + (yawn > 0 ? 'y' : '');
      if (key === this.curFace) return; this.curFace = key;
      this.show('eyesOpen', mode === 'open'); this.show('eyesHappy', mode === 'happy'); this.show('eyesSleep', mode === 'sleep');
      const talk = this.mood === 'talking' || yawn > 0;
      this.show('mouth', !talk); this.show('talk', talk);
    }
    apply() {
      const m = this.mood, o = this.getAttribute('outfit') || 'none', happy = HAPPY.includes(m);
      const cap = o === 'grad' || m === 'toss';
      this.show('cap', cap); this.show('gradOnly', o === 'grad'); this.show('gradOnly2', o === 'grad' && !['toss', 'reading', 'listening'].includes(m));
      this.show('antWrap', !cap);
      ['chatOnly', 'chatOnly2', 'chatOnly3'].forEach(k => this.show(k, o === 'chat'));
      this.baseFace = happy ? 'happy' : m === 'sleep' ? 'sleep' : 'open'; this.curFace = ''; this.face(this.baseFace, 0);
      this.show('burst', false); this.show('grip', false);
      this.show('sadBrows', m === 'sad'); this.show('tear', m === 'sad');
      this.show('worryBrows', m === 'worried'); this.show('sweat', m === 'worried'); this.show('bite', m === 'worried');
      this.show('book', m === 'reading'); this.show('cup', m === 'listening'); this.show('waves', m === 'listening');
      this.show('sparkWrap', m === 'celebrate' || m === 'toss'); this.show('zzz', m === 'sleep'); this.show('huh', m === 'confused');
      this.r.mouth.setAttribute('d', MOUTHS[m] || MOUTHS.idle);
      this.r.mouth.setAttribute('fill', happy ? O : 'none');
      this.r.eyeR.setAttribute('transform', m === 'confused' ? 'translate(140 84) scale(0.7) translate(-140 -84)' : '');
      const edge = this.getAttribute('edge');
      this.svg.style.transform = m === 'peek' && edge === 'right' ? 'rotate(-90deg)' : m === 'peek' && edge === 'left' ? 'rotate(90deg)' : '';
      this.r.all.removeAttribute('opacity');
    }
    tick(now) {
      const r = this.r, t = now / 1000, mood = this.mood;
      const k = (parseFloat(this.getAttribute('intensity')) || 1) * (this.rm ? 0.2 : 1);

      if (this.path) {
        const P = this.path, e = Math.max(0, (now - P.t0) / P.seg), i = Math.floor(e); /* the frame time can be a hair before t0 */
        if (i >= P.pts.length - 1) {
          const last = P.pts[P.pts.length - 1]; this.walkPos = last; this.style.translate = `${last[0]}px ${last[1]}px`;
          this.path = null; this.wdir = 0;
          this.setAttribute('mood', this.getAttribute('arrive') || 'wave');
          this.dispatchEvent(new CustomEvent('masari-arrived', { bubbles: true }));
        } else {
          const a = P.pts[i], b = P.pts[i + 1], f0 = e - i;
          this.hopF = f0;
          const f = P.hop ? (f0 < 0.2 ? 0 : f0 > 0.82 ? 1 : ease((f0 - 0.2) / 0.62)) : ease(f0);
          P.pos = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
          this.style.translate = `${P.pos[0]}px ${P.pos[1]}px`;
          this.wdir = Math.sign(b[0] - a[0]);
        }
      }

      const lvAttr = parseFloat(this.getAttribute('level'));
      const lvl = this.level != null ? this.level : !isNaN(lvAttr) ? lvAttr : Math.min(1, Math.abs(Math.sin(t * 7)) * 0.6 + Math.abs(Math.sin(t * 2.3)) * 0.5);

      let tx = 0, ty = 0, track = false;
      switch (mood) {
        case 'thinking': tx = 8; ty = -6; break;
        case 'sleep': ty = 2; break;
        case 'point': tx = 10; ty = 2; break;
        case 'pointUp': tx = 3; ty = -7; break;
        case 'confused': tx = -4; ty = -4; break;
        case 'sad': tx = -2; ty = 5; break;
        case 'worried': tx = Math.sin(t * 2.6) * 7; ty = -2; break;
        case 'proud': ty = -4; break;
        case 'listening': tx = 5; ty = -lvl * 4; break;
        case 'reading': { const ph = (t * 0.8) % 1; tx = 9 - ph * 18; ty = 6 + (Math.floor(t * 0.8) % 3) * 1.5; break; }
        case 'walk': tx = (this.wdir || 0) * 7; break;
        case 'peek': tx = Math.sin(t * 0.9) * 10; ty = -3; break;
        default: track = true;
      }
      if (track && this.getAttribute('track') !== 'false' && this.mx != null) {
        const b = this.svg.getBoundingClientRect();
        const dx = this.mx - (b.left + b.width / 2), dy = this.my - (b.top + b.height * 0.4);
        const d = Math.hypot(dx, dy) || 1, mm = Math.min(1, d / 300);
        tx = dx / d * 9 * mm; ty = dy / d * 6 * mm;
      }

      if (now > this.nextBlink) { this.blinkT = now; this.nextBlink = now + 2400 + Math.random() * 3200; }
      let s = 1;
      if (this.blinkT > 0) { const b = (now - this.blinkT) / 170; if (b < 1) s = Math.max(0.08, Math.abs(1 - 2 * b)); }
      if (mood === 'listening') s *= 1 + lvl * 0.22;
      const sa = parseFloat(this.getAttribute('sleep-after'));
      if (sa > 0 && !this.act && !this.path && mood !== 'sleep' && now - this.lastAct > sa * 1000) this.doze();

      let y = 0, bx = 0, hr = 0, hy = 0, aL = 0, aR = 0, capY = 0, capR = 0, ax = 1, ay = 1, lL = 0, lR = 0, op = 1, pkT = 0;
      const walk = (ph) => { y = -Math.abs(Math.sin(ph)) * 4 * k; lL = Math.max(0, Math.sin(ph)) * 7; lR = Math.max(0, -Math.sin(ph)) * 7; aL = Math.sin(ph) * 24; aR = Math.sin(ph) * 24; hr = 3 * (this.wdir || 1); };
      switch (mood) {
        case 'wave': y = Math.sin(t * 2) * 3 * k; hr = 4; aR = -125 + Math.sin(t * 7) * 22 * k; break;
        case 'happy': y = -Math.abs(Math.sin(t * 4.5)) * 8 * k; hr = Math.sin(t * 4.5) * 4 * k; aL = 25 + Math.sin(t * 9) * 8 * k; aR = -25 - Math.sin(t * 9) * 8 * k; break;
        case 'thinking': y = Math.sin(t * 1.5) * 2 * k; hr = -6; aR = -100 + Math.sin(t * 2) * 4 * k; break;
        case 'talking': y = Math.sin(t * 3) * 2 * k; hr = Math.sin(t * 2.2) * 3 * k; aL = 12 + Math.sin(t * 3.1) * 14 * k; aR = -14 + Math.sin(t * 2.7 + 1) * 14 * k; break;
        case 'celebrate': y = -Math.abs(Math.sin(t * 6)) * 18 * k; hr = Math.sin(t * 6) * 6 * k; aL = 135 + Math.sin(t * 12) * 12 * k; aR = -135 - Math.sin(t * 12) * 12 * k; break;
        case 'sleep': y = Math.sin(t * 1.2) * 2.5 * k; hr = 9; aL = 4; aR = -4; break;
        case 'sad': y = 2 + Math.sin(t) * 1.2 * k; hy = 5; hr = 6 + Math.sin(t * 0.8) * 2 * k; aL = 2; aR = -2; break;
        case 'worried': y = Math.sin(t * 2) * 1.5 * k; bx = Math.sin(t * 38) * 0.8 * k; hr = -3 + Math.sin(t * 1.7) * 2 * k; aL = -36 + Math.sin(t * 5) * 4 * k; aR = 36 - Math.sin(t * 5) * 4 * k; break;
        case 'proud': y = -3 + Math.sin(t * 1.6) * 1.5 * k; hr = -5; hy = -3; ax = 1.06; ay = 1.03; aL = 28; aR = -28; break;
        case 'listening': y = Math.sin(t * 1.8) * 2 * k; hr = 7 + lvl * 3; aL = 4; aR = -140; break;
        case 'reading': y = Math.sin(t * 1.4) * 1.5 * k; hr = 3; hy = 3; aL = -40; aR = 40; break;
        case 'walk': walk(t * 9); break;
        case 'hop': {
          const f0 = this.path && this.path.hop ? this.hopF : ((now - this.moodT) / 950) % 1, d = this.wdir || 0;
          if (f0 < 0.2) { const c = Math.sin(f0 / 0.2 * Math.PI / 2); ax = 1 + 0.12 * c; ay = 1 - 0.17 * c; y = 4 * c; aL = -22 * c; aR = 22 * c; hr = -d * 3 * c; }
          else if (f0 < 0.82) { const q = (f0 - 0.2) / 0.62, st = Math.max(0, 1 - q * 2.5); ax = 1 - 0.06 * st; ay = 1 + 0.1 * st; y = -48 * 4 * q * (1 - q); aL = 125 - q * 70; aR = -125 + q * 70; hr = d * (4 - q * 8); lL = 6; lR = 6; }
          else { const v = (f0 - 0.82) / 0.18, c = Math.sin(v * Math.PI); ax = 1 + 0.15 * c; ay = 1 - 0.19 * c; y = 4 * c; aL = 35 * (1 - v); aR = -35 * (1 - v); }
          break;
        }
        case 'peek': pkT = 98 + Math.sin(t * 1.3) * 5 * k; hr = Math.sin(t * 0.7) * 10 * k; break;
        case 'bye': {
          const u = (now - this.moodT) / 4200, once = this.hasAttribute('once'), v = once ? Math.min(u, 1) : u % 1;
          if (v < 0.38) { aR = -125 + Math.sin(t * 7) * 22 * k; hr = 4; y = Math.sin(t * 2) * 2 * k; }
          else if (v < 0.82) { const w = (v - 0.38) / 0.44; this.wdir = 1; walk(t * 9); bx = w * 230; op = 1 - Math.max(0, (w - 0.5) / 0.5); }
          else { this.wdir = 0; op = once ? 0 : (v - 0.82) / 0.18; bx = once ? 230 : 0; }
          if (once && u >= 1 && !this.gone) { this.gone = true; this.dispatchEvent(new CustomEvent('masari-gone', { bubbles: true })); }
          break;
        }
        case 'confused': y = Math.sin(t * 1.6) * 2 * k; hr = -10 + Math.sin(t * 1.4) * 3 * k; aL = 30 + Math.sin(t * 2) * 4 * k; aR = -100 + Math.sin(t * 5) * 6 * k; break;
        case 'point': y = Math.sin(t * 2) * 2 * k; hr = 6; aL = 6; aR = -88 + Math.sin(t * 4) * 6 * k; break;
        case 'pointUp': y = -Math.abs(Math.sin(t * 3)) * 7 * k; hr = -3; aL = 8; aR = -168 + Math.sin(t * 6) * 8 * k; break;
        case 'nod': y = Math.sin(t * 2) * 2 * k; hy = Math.max(0, Math.sin(t * 7)) * 6 * k; hr = 2; aL = 8; aR = -8; break;
        case 'toss': {
          const u = ((now - this.moodT) / 2800) % 1;
          if (u < 0.14) { const c = Math.sin(u / 0.14 * Math.PI); y = c * 6; aL = -10 * c; aR = 10 * c; }
          else if (u < 0.78) { const v = (u - 0.14) / 0.64; capY = -130 * 4 * v * (1 - v); capR = 720 * v; y = -Math.max(0, Math.sin(Math.min(1, v * 2.5) * Math.PI)) * 16; aL = 140; aR = -140; }
          else { y = Math.sin(t * 2) * 2; aL = 20; aR = -20; }
          break;
        }
        default: y = Math.sin(t * 2) * 3 * k; hr = Math.sin(t * 1.2) * 1.5 * k; aL = Math.sin(t * 2) * 4 * k; aR = -Math.sin(t * 2) * 4 * k;
      }

      let burst = -1, fm = null, yawn = 0, glow = null, direct = false, zzzOn = null, armK = 0.18;
      if (this.act) {
        const e = now - this.act.t0;
        if (this.act.type === 'poke') {
          const u = e / 850;
          if (u >= 1) this.endAct();
          else {
            direct = true; fm = 'happy'; armK = 0.35; burst = u; capY = 0;
            if (u < 0.15) { const c = Math.sin(u / 0.15 * Math.PI / 2); y = c * 6; ax = 1 + 0.1 * c; ay = 1 - 0.15 * c; aL = -12; aR = 12; hr = 0; }
            else if (u < 0.62) { const v = (u - 0.15) / 0.47, j = Math.sin(Math.PI * v); y = -40 * j; ax = 1 - 0.05 * j; ay = 1 + 0.08 * j; aL = 135; aR = -135; hr = Math.sin(v * Math.PI * 2) * 7; }
            else { const v = (u - 0.62) / 0.38, c = Math.sin(Math.min(1, v * 2) * Math.PI) * (1 - v); y = c * 5; ax = 1 + 0.1 * c; ay = 1 - 0.12 * c; aL = 20 * (1 - v); aR = -20 * (1 - v); hr = 0; }
          }
        } else if (this.act.type === 'doze') {
          const u = e / 3800;
          if (u >= 1) this.endAct();
          else {
            armK = 0.12; fm = 'open'; glow = 1 - u * 0.7; direct = false;
            if (u < 0.3) { const v = u / 0.3, st = Math.sin(v * Math.PI); fm = v > 0.15 && v < 0.85 ? 'sleep' : 'open'; yawn = st; aL = 150 * st; aR = -150 * st; ay = 1 + 0.08 * st; ax = 1 - 0.04 * st; y = -4 * st; hr = 0; hy = 0; }
            else if (u < 0.8) {
              const v = (u - 0.3) / 0.5, nod = Math.max(0, Math.sin(v * Math.PI * 2.5));
              hy = nod * 9 + v * 3; hr = nod * 7; aL = 4 + nod * 6; aR = -4 - nod * 6; y = Math.sin(t * 1.2) * 1.5;
              s *= Math.max(0.1, 0.65 - v * 0.5 - nod * 0.3);
              if (v > 0.48 && v < 0.56) { hy = -5; hr = -4; s = 1; aL = -14; aR = 14; }
            }
            else { const v = (u - 0.8) / 0.2; fm = 'sleep'; hr = 9 * v; hy = 0; aL = 4; aR = -4; zzzOn = v > 0.35; ay = 1 - 0.03 * Math.sin(v * Math.PI); glow = 0.3; }
          }
        } else {
          const u = e / 3000;
          if (u >= 1) this.endAct();
          else {
            armK = 0.22;
            if (u < 0.2) { fm = 'sleep'; zzzOn = true; hr = 9; aL = 4; aR = -4; glow = 0.3; y = u > 0.13 ? -7 * Math.sin((u - 0.13) / 0.07 * Math.PI) : Math.sin(t * 1.2) * 2.5; }
            else if (u < 0.42) { const v = (u - 0.2) / 0.22; zzzOn = false; fm = 'open'; s *= v < 0.35 ? 0.12 : v < 0.5 ? 0.55 : v < 0.6 ? 0.12 : 1; hr = 9 * (1 - v); glow = 0.3 + 0.7 * v; }
            else if (u < 0.7) { const v = (u - 0.42) / 0.28, st = Math.sin(v * Math.PI); zzzOn = false; fm = 'sleep'; yawn = st; aL = 165 * st; aR = -165 * st; ay = 1 + 0.1 * st; ax = 1 - 0.05 * st; y = -5 * st; hr = 0; }
            else if (u < 0.84) { const v = (u - 0.7) / 0.14; zzzOn = false; fm = 'open'; hr = Math.sin(v * Math.PI * 4) * 11 * (1 - v); glow = Math.floor(v * 8) % 2 ? 1 : 0.35; aL = 6; aR = -6; }
            else { const v = (u - 0.84) / 0.16, j = Math.sin(v * Math.PI); zzzOn = false; fm = 'happy'; y = -16 * j; aL = 45 * j; aR = -45 * j; hr = 0; burst = v; }
          }
        }
      }

      this.fx += (tx - this.fx) * 0.14; this.fy += (ty - this.fy) * 0.14;
      r.face.setAttribute('transform', `translate(${this.fx} ${this.fy})`);
      r.blink.setAttribute('transform', `translate(0 84) scale(1 ${s}) translate(0 -84)`);
      this.face(fm || this.baseFace, yawn);
      if (zzzOn !== null) this.show('zzz', zzzOn);
      this.show('burst', burst >= 0);
      if (burst >= 0) { r.burst.setAttribute('transform', `translate(120 90) scale(${0.7 + burst * 0.5}) translate(-120 -90)`); r.burst.setAttribute('opacity', 1 - burst); }

      if (direct || mood === 'hop') this.by = y; else this.by += (y - this.by) * 0.25;
      this.bx += (bx - this.bx) * (mood === 'worried' ? 1 : 0.2);
      this.hr += (hr - this.hr) * 0.12; this.hy += (hy - this.hy) * 0.3;
      this.aL += (aL - this.aL) * armK; this.aR += (aR - this.aR) * armK;
      this.pk += (pkT - this.pk) * (pkT > this.pk ? 0.12 : 0.07);
      let pop = 1;
      if (this.popT > 0) { const e = (now - this.popT) / 650; pop = e >= 1 ? 1 : Math.max(0, backOut(e)); }
      const sx = ax * pop, sy = ay * pop;
      r.body.setAttribute('transform', `translate(${this.bx} ${this.by + this.pk}) translate(120 210) scale(${sx} ${sy}) translate(-120 -210)`);
      r.legL.setAttribute('transform', `translate(0 ${-lL})`); r.legR.setAttribute('transform', `translate(0 ${-lR})`);
      r.head.setAttribute('transform', `translate(0 ${this.hy}) rotate(${this.hr} 120 136)`);
      r.armL.setAttribute('transform', `rotate(${this.aL} 82 154)`);
      r.armR.setAttribute('transform', `rotate(${this.aR} 158 154)`);
      const pkF = Math.max(0, 1 - this.pk / 98);
      r.shadow.setAttribute('transform', `translate(${120 + this.bx} 216) scale(${(1 + this.by / 70) * pop * (0.4 + 0.6 * pkF)} 1) translate(-120 -216)`);
      r.shadow.setAttribute('opacity', this.pal.SHO * op * pkF);
      this.show('grip', this.pk > 40);
      if (op < 1 || r.all.hasAttribute('opacity')) r.all.setAttribute('opacity', op);
      r.cap.setAttribute('transform', `translate(0 ${capY}) rotate(${capR} 120 34)`);
      r.ant.setAttribute('transform', `rotate(${mood === 'sleep' ? 18 : mood === 'sad' ? 28 + Math.sin(t) * 3 : Math.sin(t * 3) * 6 * k - this.hr * 0.6} 120 36)`);
      r.bulb.setAttribute('opacity', glow !== null ? glow : mood === 'thinking' || mood === 'talking' || mood === 'reading' ? 0.45 + 0.55 * Math.abs(Math.sin(t * 5)) : mood === 'listening' ? 0.4 + lvl * 0.6 : mood === 'sleep' ? 0.3 : mood === 'sad' ? 0.4 : 1);
      const pr = ['celebrate', 'toss', 'proud'].includes(mood) ? 2 : (parseInt(this.getAttribute('progress')) || 0);
      [r.dot1, r.dot2].forEach((d, i) => d.setAttribute('fill', (mood === 'thinking' || mood === 'reading' ? Math.floor(t * 3) % 3 === i : pr > i) ? O : this.pal.W));
      r.dot3.setAttribute('r', mood === 'thinking' || mood === 'reading' ? (Math.floor(t * 3) % 3 === 2 ? 7 : 5) : mood === 'proud' ? 6.5 + Math.sin(t * 3) * 1.2 : 6);
      r.talk.setAttribute('ry', yawn > 0 ? 3 + yawn * 9 : 2 + Math.abs(Math.sin(t * 13)) * 5 + Math.abs(Math.sin(t * 7)) * 2);
      r.tassel.setAttribute('transform', `rotate(${Math.sin(t * 3) * 10 * k - this.hr * 1.5} 176 38)`);
      const fast = mood === 'thinking' || mood === 'talking';
      [...r.bubble.children].forEach((d, i) => d.setAttribute('opacity', fast ? 0.25 + 0.75 * Math.max(0, Math.sin(t * 6 - i * 0.9)) : 0.4 + 0.6 * Math.max(0, Math.sin(t * 2 - i * 0.9))));
      [...r.zzz.children].forEach((z, i) => z.setAttribute('opacity', 0.2 + 0.8 * Math.max(0, Math.sin(t * 2 - i * 0.8))));
      r.huh.setAttribute('transform', `translate(0 ${Math.sin(t * 3) * 4}) rotate(${Math.sin(t * 2) * 10} 46 28)`);
      r.spark.setAttribute('transform', `translate(120 110) scale(${1 + Math.sin(t * 8) * 0.06}) rotate(${Math.sin(t * 2) * 8}) translate(-120 -110)`);
      if (mood === 'sad') { const u = (t % 2.4) / 2.4; r.tear.setAttribute('transform', `translate(0 ${u * 22})`); r.tear.setAttribute('opacity', u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85); }
      if (mood === 'worried') { const u = (t % 3) / 3; r.sweat.setAttribute('transform', `translate(0 ${u * 14})`); r.sweat.setAttribute('opacity', u < 0.1 ? u / 0.1 : 1 - Math.max(0, (u - 0.6) / 0.4)); }
      if (mood === 'listening') [...r.waves.children].forEach((w, i) => w.setAttribute('opacity', Math.max(0.1, Math.min(1, lvl * 1.6 - i * 0.35 + Math.sin(t * 8 - i) * 0.15))));
      if (mood === 'reading') {
        const L = (t * 0.8) % 3, row = Math.floor(L);
        r.hl.setAttribute('transform', `translate(0 ${row * 8})`);
        const f = (t % 4.5) / 4.5; const fp = f > 0.82 ? (f - 0.82) / 0.18 : -1;
        this.show('flip', fp >= 0);
        if (fp >= 0) r.flip.setAttribute('transform', `translate(120 0) scale(${Math.cos(fp * Math.PI)} 1) translate(-120 0)`);
      }
    }
  }
  if (!customElements.get('masari-bot')) customElements.define('masari-bot', MasariBot);
})();
