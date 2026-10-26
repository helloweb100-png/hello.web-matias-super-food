/* ═══════════════════════════════════════════════════════════════════
   MATÍAS SUPERFOODS · app.js
   Sin dependencias. Un solo bucle rAF coordina todo el movimiento:

   · Motor de scroll: el valor de scroll se suaviza (inercia) y alimenta
     "escenas" por sección. El scroll nativo NUNCA se secuestra.
   · Hero: shader WebGL (aurora solar) + partículas 2D + órbitas 3D falsas.
   · Escenas: manifiesto palabra a palabra, portal (imagen que se abre),
     scroll horizontal de productos, proceso, banda de mercado, etc.
   · Todo respeta prefers-reduced-motion y se pausa fuera de pantalla.
   ═══════════════════════════════════════════════════════════════════ */
(() => {
    'use strict';

    /* ───────── Utilidades ───────── */
    const $ = (s, c = document) => c.querySelector(s);
    const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
    const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
    const easeIO = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const easeOut = t => 1 - Math.pow(1 - t, 4);
    const pad2 = n => String(n).padStart(2, '0');

    const html = document.documentElement;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
    const mqPin = matchMedia('(min-width: 900px)');
    const WA_NUMBER = '5213324957871';
    const waUrl = text => `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;

    /* Estado global compartido por el bucle */
    const S = {
        y: window.scrollY, raw: window.scrollY, vel: 0,
        vw: innerWidth, vh: innerHeight, docH: 0,
        mx: 0, my: 0, tx: 0, ty: 0, px: -9999, py: -9999, moved: false,
        dirty: true
    };

    const scenes = [];     // { el, top, h, update(s), always }
    const loops = [];      // fn(t, dt) que gestionan su propia visibilidad
    const layoutHooks = []; // se ejecutan antes de medir escenas

    const addScene = (el, update, always = false) => {
        if (!el) return null;
        const s = { el, update, always, top: 0, h: 0 };
        scenes.push(s);
        return s;
    };

    /* ───────── Medición ───────── */
    const measure = () => {
        S.vw = innerWidth; S.vh = innerHeight;
        layoutHooks.forEach(fn => fn());
        const sy = window.scrollY;
        scenes.forEach(s => {
            const r = s.el.getBoundingClientRect();
            s.top = r.top + sy; s.h = r.height;
        });
        S.docH = document.documentElement.scrollHeight;
        S.dirty = true;
    };
    let measureTimer = 0;
    const measureSoon = (ms = 120) => { clearTimeout(measureTimer); measureTimer = setTimeout(measure, ms); };

    /* ───────── WhatsApp: construye los enlaces con mensaje ───────── */
    function initWhatsApp() {
        $$('[data-wa]').forEach(a => { a.href = waUrl(a.dataset.wa); });
    }

    /* ───────── Titulares divididos por palabra ───────── */
    function splitText(el) {
        let idx = 0;
        const plain = el.textContent.trim().replace(/\s+/g, ' ');
        const walk = node => {
            Array.from(node.childNodes).forEach(ch => {
                if (ch.nodeType === 3) {
                    const frag = document.createDocumentFragment();
                    ch.textContent.split(/(\s+)/).forEach(part => {
                        if (!part) return;
                        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
                        const w = document.createElement('span'); w.className = 'sw';
                        const i = document.createElement('span'); i.className = 'sw-i';
                        i.textContent = part; i.style.setProperty('--i', idx++);
                        w.appendChild(i); frag.appendChild(w);
                    });
                    ch.replaceWith(frag);
                } else if (ch.nodeType === 1) walk(ch);
            });
        };
        walk(el);
        el.setAttribute('aria-label', plain);
        $$('.sw', el).forEach(n => n.setAttribute('aria-hidden', 'true'));
    }

    /* ───────── Revelados por visibilidad ───────── */
    function initReveals() {
        $$('[data-split]').forEach(splitText);
        const targets = $$('.reveal, [data-split]').filter(el => !el.closest('.hero'));
        if (reduce || !('IntersectionObserver' in window)) { targets.forEach(el => el.classList.add('is-in')); return; }
        const io = new IntersectionObserver(entries => {
            entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
        }, { threshold: .18, rootMargin: '0px 0px -6% 0px' });
        targets.forEach(el => io.observe(el));
    }

    /* ───────── Contadores ───────── */
    function initCounters() {
        const els = $$('[data-count]');
        const run = el => {
            const target = +el.dataset.count;
            if (reduce) { el.textContent = target; return; }
            const t0 = performance.now(), dur = 1900;
            const tick = now => {
                const p = clamp((now - t0) / dur);
                el.textContent = Math.round(target * (1 - Math.pow(1 - p, 4)));
                if (p < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        };
        if (!('IntersectionObserver' in window)) { els.forEach(el => { el.textContent = el.dataset.count; }); return; }
        const io = new IntersectionObserver(entries => {
            entries.forEach(e => { if (e.isIntersecting) { run(e.target); io.unobserve(e.target); } });
        }, { threshold: .6 });
        els.forEach(el => io.observe(el));
    }

    /* ═══════════ LOADER ═══════════ */
    function initLoader() {
        const loader = $('#loader');
        let finished = false;

        const ready = () => {
            html.classList.remove('is-loading');
            html.classList.add('is-ready');
            const title = $('#hero-title');
            if (title) title.classList.add('is-in');
            $$('.hero .reveal').forEach(el => el.classList.add('is-in'));
            measure();
            setTimeout(measure, 600);
            setTimeout(() => {
                const f = $('#wa-float');
                if (f && !reduce) { f.classList.add('show-tip'); setTimeout(() => f.classList.remove('show-tip'), 5200); }
            }, 7500);
        };

        if (!loader) { ready(); return; }

        const num = $('#ld-num'), fill = $('#ld-fill'), label = $('#ld-label');
        const labels = [[0, 'Cargando superalimentos'], [34, 'Activando la energía del sol'], [66, 'Preparando tu mesa'], [99, 'Todo listo']];
        const MIN = reduce ? 350 : 2500;
        const t0 = performance.now();
        let loaded = document.readyState === 'complete';
        let fontsOk = !(document.fonts && document.fonts.load);
        if (!loaded) addEventListener('load', () => { loaded = true; }, { once: true });
        if (!fontsOk) {
            // Las fuentes llegan en un <link> no bloqueante: esperar a que existan y a que se descarguen
            const gf = document.getElementById('gf');
            const ask = () => Promise.all([
                document.fonts.load('700 1em "Bricolage Grotesque"'),
                document.fonts.load('400 1em "Geist"')
            ]).then(() => { fontsOk = true; }, () => { fontsOk = true; });
            if (!gf || gf.media === 'all') ask();
            else { const iv = setInterval(() => { if (gf.media === 'all') { clearInterval(iv); ask(); } }, 60); setTimeout(() => clearInterval(iv), 3000); }
            setTimeout(() => { fontsOk = true; }, 3200);
        }
        let p = 0, lastLabel = '';

        const finish = () => {
            if (finished) return;
            finished = true;
            num.textContent = '100'; fill.style.setProperty('--p', 1); label.textContent = 'Todo listo';
            loader.classList.add('is-done');
            setTimeout(ready, reduce ? 0 : 650);
            const kill = () => loader.remove();
            loader.addEventListener('transitionend', e => { if (e.propertyName === 'clip-path') kill(); }, { once: true });
            setTimeout(kill, 2600);
        };

        const step = now => {
            if (finished) return;
            const el = now - t0;
            const timeGoal = clamp(el / MIN) * 100;
            const goal = (loaded && fontsOk) ? timeGoal : Math.min(timeGoal, 88);
            p += (goal - p) * .09 + .04;
            p = Math.min(p, goal);
            num.textContent = Math.floor(p);
            fill.style.setProperty('--p', (p / 100).toFixed(3));
            let txt = labels[0][1];
            labels.forEach(([at, t]) => { if (p >= at) txt = t; });
            if (txt !== lastLabel) { label.textContent = txt; lastLabel = txt; }
            if (p >= 99.4 && loaded && fontsOk && el >= MIN) { finish(); return; }
            requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
        setTimeout(finish, 7500); // red de seguridad
    }

    /* ═══════════ NAV + MENÚ ═══════════ */
    function initNav() {
        const nav = $('#nav'), burger = $('#burger'), menu = $('#menu');
        if (!nav) return;
        let lastRaw = window.scrollY;

        scenes.push({
            always: true, el: nav, top: 0, h: 0,
            update() {
                const y = S.raw;
                nav.classList.toggle('is-solid', y > 40);
                const open = menu && menu.classList.contains('is-open');
                const goingDown = y > lastRaw + 4, goingUp = y < lastRaw - 4;
                if (open || y < 120) nav.classList.remove('is-hidden');
                else if (goingDown) nav.classList.add('is-hidden');
                else if (goingUp) nav.classList.remove('is-hidden');
                if (Math.abs(y - lastRaw) > 4) lastRaw = y;
            }
        });

        if (!burger || !menu) return;
        $$('.menu-nav a', menu).forEach((a, i) => a.style.setProperty('--k', i));
        const setOpen = open => {
            menu.classList.toggle('is-open', open);
            menu.setAttribute('aria-hidden', String(!open));
            burger.setAttribute('aria-expanded', String(open));
            burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
            html.classList.toggle('menu-open', open);
            html.style.overflow = open ? 'hidden' : '';
        };
        burger.addEventListener('click', () => setOpen(!menu.classList.contains('is-open')));
        $$('a', menu).forEach(a => a.addEventListener('click', () => setOpen(false)));
        addEventListener('keydown', e => { if (e.key === 'Escape' && menu.classList.contains('is-open')) { setOpen(false); burger.focus(); } });
        matchMedia('(min-width: 1040px)').addEventListener('change', e => { if (e.matches) setOpen(false); });
    }

    /* ═══════════ HERO · SHADER WEBGL ═══════════ */
    function initHeroGL(hero) {
        const canvas = $('#hero-gl');
        if (!canvas) return;
        const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
        if (!gl) { canvas.classList.add('no-gl'); return; }

        const vsSrc = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
        const fsSrc = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse; uniform vec2 uSun;

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
    vec2 i = floor(p); vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p){
    float v = 0.0; float a = 0.5;
    mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 5; i++){ v += a * noise(p); p = m * p; a *= 0.5; }
    return v;
}
void main(){
    vec2 uv = gl_FragCoord.xy / uRes;
    float asp = uRes.x / uRes.y;
    vec2 p = vec2((uv.x - 0.5) * asp, uv.y - 0.5);
    vec2 sp = vec2((uSun.x - 0.5) * asp, uSun.y - 0.5) + uMouse * 0.05;
    float t = uTime * 0.045;

    vec2 q = vec2(fbm(p * 1.25 + vec2(0.0, t)), fbm(p * 1.25 + vec2(5.2, 1.3) - t));
    vec2 r = vec2(fbm(p * 1.25 + 2.2 * q + vec2(1.7, 9.2) + t * 1.3), fbm(p * 1.25 + 2.2 * q + vec2(8.3, 2.8) - t * 0.9));
    float f = fbm(p * 1.1 + 2.4 * r);

    float d = length(p - sp);
    float halo = exp(-d * d * (asp > 1.2 ? 4.4 : 3.2));
    float heat = f * 0.92 + halo * 1.05 - 0.24 + (r.x - 0.5) * 0.25;

    vec3 c0 = vec3(0.043, 0.035, 0.028);
    vec3 c1 = vec3(0.30, 0.055, 0.035);
    vec3 c2 = vec3(0.82, 0.19, 0.07);
    vec3 c3 = vec3(1.0, 0.58, 0.12);
    vec3 c4 = vec3(1.0, 0.90, 0.45);
    vec3 col = c0;
    col = mix(col, c1, smoothstep(0.12, 0.42, heat));
    col = mix(col, c2, smoothstep(0.38, 0.72, heat));
    col = mix(col, c3, smoothstep(0.68, 1.00, heat));
    col = mix(col, c4, smoothstep(1.00, 1.35, heat));

    float far = smoothstep(0.0, 0.95, d);
    col = mix(col, c0 + (col - c0) * 0.42, far);
    col *= 1.0 - 0.55 * pow(length(uv - 0.5) * 1.25, 2.0);
    col += (hash(gl_FragCoord.xy + uTime) - 0.5) * 0.012;
    gl_FragColor = vec4(col, 1.0);
}`;
        const compile = (type, src) => {
            const sh = gl.createShader(type);
            gl.shaderSource(sh, src); gl.compileShader(sh);
            return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
        };
        const vs = compile(gl.VERTEX_SHADER, vsSrc), fs = compile(gl.FRAGMENT_SHADER, fsSrc);
        const prog = gl.createProgram();
        if (!vs || !fs) { canvas.classList.add('no-gl'); return; }
        gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.classList.add('no-gl'); return; }
        gl.useProgram(prog);

        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, 'p');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        const uRes = gl.getUniformLocation(prog, 'uRes'), uTime = gl.getUniformLocation(prog, 'uTime');
        const uMouse = gl.getUniformLocation(prog, 'uMouse'), uSun = gl.getUniformLocation(prog, 'uSun');

        let sun = [.74, .5];
        const resize = () => {
            const q = S.vw < 700 ? .5 : .6;
            canvas.width = Math.max(2, Math.round(canvas.clientWidth * q));
            canvas.height = Math.max(2, Math.round(canvas.clientHeight * q));
            gl.viewport(0, 0, canvas.width, canvas.height);
            const orbit = $('#orbit'), hr = hero.getBoundingClientRect(), or = orbit ? orbit.getBoundingClientRect() : null;
            if (or && hr.width) sun = [(or.left + or.width / 2 - hr.left) / hr.width, 1 - (or.top + or.height / 2 - hr.top) / hr.height];
        };
        layoutHooks.push(resize);
        resize();

        let frameSkip = 0;
        const draw = t => {
            gl.uniform2f(uRes, canvas.width, canvas.height);
            gl.uniform1f(uTime, t * .001 + 14);
            gl.uniform2f(uMouse, S.mx, S.my);
            gl.uniform2f(uSun, sun[0], sun[1]);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        };
        if (reduce) { draw(0); return; }
        loops.push((t) => {
            if (!hero._visible || document.hidden) return;
            if (S.vw < 700 && (frameSkip++ & 1)) return; // 30 fps en móvil
            draw(t);
        });
    }

    /* ═══════════ HERO · PARTÍCULAS ═══════════ */
    function initHeroFX(hero) {
        const c = $('#hero-fx');
        if (!c) return;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        const COLORS = ['255,228,92', '255,169,39', '242,107,33', '255,244,214'];
        let W = 0, H = 0, DPR = 1, parts = [];

        const make = init => ({
            x: Math.random() * W, y: init ? Math.random() * H : H + 12,
            r: .6 + Math.random() * 2.1, vy: .12 + Math.random() * .5, vx: (Math.random() - .5) * .22,
            ph: Math.random() * 6.28, sp: .6 + Math.random() * 1.6, col: COLORS[(Math.random() * COLORS.length) | 0], a: .25 + Math.random() * .65
        });
        const resize = () => {
            DPR = Math.min(devicePixelRatio || 1, 1.5);
            W = c.clientWidth; H = c.clientHeight;
            c.width = Math.round(W * DPR); c.height = Math.round(H * DPR);
            ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
            const n = Math.round(clamp(W * H / 15000, 26, 110));
            parts = Array.from({ length: n }, () => make(true));
        };
        layoutHooks.push(resize);
        resize();

        const draw = (t, dt) => {
            ctx.clearRect(0, 0, W, H);
            ctx.globalCompositeOperation = 'lighter';
            const hr = hero.getBoundingClientRect();
            const mx = S.px - hr.left, my = S.py - hr.top;
            for (const p of parts) {
                if (!reduce) {
                    p.y -= p.vy * dt * .06 * 1.6;
                    p.x += p.vx + Math.sin(t * .0007 * p.sp + p.ph) * .18;
                    const dx = p.x - mx, dy = p.y - my, d2 = dx * dx + dy * dy;
                    if (d2 < 14400) { const f = (1 - d2 / 14400) * 1.6; p.x += dx / 120 * f; p.y += dy / 120 * f; }
                    if (p.y < -12 || p.x < -12 || p.x > W + 12) Object.assign(p, make(false), { x: Math.random() * W });
                }
                const tw = .55 + .45 * Math.sin(t * .002 * p.sp + p.ph);
                ctx.fillStyle = `rgba(${p.col},${(p.a * tw).toFixed(3)})`;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
                ctx.fillStyle = `rgba(${p.col},${(p.a * tw * .12).toFixed(3)})`;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 5, 0, 6.2832); ctx.fill();
            }
        };
        if (reduce) { draw(0, 0); return; }
        loops.push((t, dt) => { if (hero._visible && !document.hidden) draw(t, dt); });
    }

    /* ═══════════ HERO · ÓRBITAS ═══════════ */
    function initOrbit(hero) {
        const stage = $('.orbit-stage');
        const discs = $$('.orbit-disc');
        if (!stage || !discs.length) return;
        const defs = [
            { rx: .48, ry: .16, tilt: -14, speed: .00021, phase: 0 },
            { rx: .48, ry: .16, tilt: -14, speed: .00021, phase: 2.094 },
            { rx: .48, ry: .16, tilt: -14, speed: .00021, phase: 4.188 },
            { rx: .52, ry: .21, tilt: 22, speed: -.00015, phase: 1.0 },
            { rx: .52, ry: .21, tilt: 22, speed: -.00015, phase: 4.14 }
        ];
        let R = stage.clientWidth;
        layoutHooks.push(() => { R = stage.clientWidth; });
        const lastZ = [];
        const place = t => {
            const sx = S.mx * -14, sy = S.my * -14;
            stage.style.transform = `translate3d(${sx.toFixed(1)}px,${sy.toFixed(1)}px,0)`;
            discs.forEach((d, i) => {
                const o = defs[i % defs.length];
                const a = o.phase + t * o.speed;
                const x = Math.cos(a) * o.rx * R, y = Math.sin(a) * o.ry * R;
                const tl = o.tilt * Math.PI / 180;
                const X = x * Math.cos(tl) - y * Math.sin(tl), Y = x * Math.sin(tl) + y * Math.cos(tl);
                const z = Math.sin(a);
                const sc = .82 + .24 * (z * .5 + .5);
                const bob = Math.sin(t * .0012 + i * 1.7) * R * .012;
                const half = d.offsetWidth / 2;
                const depth = (z + 1.6) * R * .03;
                d.style.transform = `translate3d(${(R / 2 + X - half + S.mx * depth).toFixed(1)}px,${(R / 2 + Y - half + bob + S.my * depth).toFixed(1)}px,0) scale(${sc.toFixed(3)})`;
                const front = z > 0;
                if (lastZ[i] !== front) { d.style.zIndex = front ? 3 : 1; lastZ[i] = front; }
                d.style.filter = `brightness(${(.62 + .38 * (z * .5 + .5)).toFixed(2)})`;
            });
        };
        if (reduce) { place(2600); return; }
        loops.push(t => { if (hero._visible) place(t); });
    }

    function initHero() {
        const hero = $('#inicio');
        if (!hero) return;
        hero._visible = true;
        initHeroGL(hero);
        initHeroFX(hero);
        initOrbit(hero);
        if (!reduce) {
            const copy = $('.hero-copy'), orbit = $('#orbit');
            addScene(hero, () => {
                const p = clamp(S.y / S.vh);
                if (copy) { copy.style.transform = `translate3d(0,${(-p * 70).toFixed(1)}px,0)`; copy.style.opacity = (1 - smooth(.15, .85, p)).toFixed(3); }
                if (orbit) orbit.style.transform = `translate3d(0,${(p * 110).toFixed(1)}px,0) scale(${(1 + p * .16).toFixed(3)}) rotate(${(p * 14).toFixed(2)}deg)`;
            });
        }
        if ('IntersectionObserver' in window) {
            new IntersectionObserver(es => { hero._visible = es[0].isIntersecting; }).observe(hero);
        }
    }

    /* ═══════════ MARQUEE: se inclina con la velocidad del scroll ═══════════ */
    function initMarquee() {
        const m = $('.marquee-in');
        if (!m || reduce) return;
        scenes.push({
            always: true, el: m, top: 0, h: 0,
            update() { m.style.setProperty('--sk', clamp(S.vel * -.32, -9, 9).toFixed(2) + 'deg'); }
        });
    }

    /* ═══════════ MANIFIESTO: palabra por palabra ═══════════ */
    function initManifesto() {
        const p = $('#manifesto-text');
        if (!p) return;
        const text = p.textContent.trim().replace(/\s+/g, ' ');
        p.textContent = '';
        const sr = document.createElement('span'); sr.className = 'sr-only'; sr.textContent = text; p.appendChild(sr);
        const words = text.split(' ').map((w, i, arr) => {
            const s = document.createElement('span');
            s.className = 'w'; s.setAttribute('aria-hidden', 'true');
            s.textContent = w + (i < arr.length - 1 ? ' ' : '');
            p.appendChild(s); return s;
        });
        const n = words.length, last = new Array(n).fill(-1);
        const apply = prog => {
            for (let i = 0; i < n; i++) {
                const v = +(.14 + .86 * clamp((prog * (n + 3) - i) / 3)).toFixed(2);
                if (v !== last[i]) { words[i].style.opacity = v; last[i] = v; }
            }
        };
        if (reduce) { apply(1); return; }
        addScene(p, s => apply(clamp((S.y + S.vh * .84 - s.top) / (s.h + S.vh * .42))));
    }

    /* ═══════════ PORTAL DEL SOL: la imagen se abre con el scroll ═══════════ */
    function initPortal() {
        const sec = $('#portal');
        const frame = $('#portal-frame'), copy = $('#portal-copy'), ring = $('.portal-ring');
        if (!sec || !frame || reduce) return;
        const set = (el, k, v) => el.style.setProperty(k, v);
        addScene(sec, s => {
            const p = clamp((S.y - s.top) / Math.max(1, s.h - S.vh));
            const e = easeIO(clamp(p / .62));
            const d0 = Math.min(Math.min(S.vw, S.vh) * (S.vw < 700 ? .66 : .56), 460);
            const ix = lerp((S.vw - d0) / 2, 0, e), iy = lerp((S.vh - d0) / 2, 0, e);
            const rr = lerp(d0 / 2, 0, Math.pow(e, .7));
            set(frame, '--ix', ix.toFixed(1) + 'px'); set(frame, '--iy', iy.toFixed(1) + 'px'); set(frame, '--rr', rr.toFixed(1) + 'px');
            set(frame, '--is', lerp(1.32, 1.04, e).toFixed(3));
            set(frame, '--sh', smooth(.3, .72, p).toFixed(3));
            if (ring) {
                set(ring, '--d0', d0.toFixed(0) + 'px');
                set(ring, '--ro', (1 - smooth(.02, .26, p)).toFixed(3));
                ring.style.scale = (1 + e * .5).toFixed(3);
            }
            set(copy, '--co', smooth(.5, .72, p).toFixed(3));
            set(copy, '--cy', lerp(46, 0, smooth(.48, .8, p)).toFixed(1) + 'px');
            const sub = copy.querySelector('.portal-sub');
            set(sub, '--so', smooth(.74, .93, p).toFixed(3));
            set(sub, '--sy', lerp(26, 0, smooth(.74, .96, p)).toFixed(1) + 'px');
        });
    }

    /* ═══════════ PRODUCTOS: scroll vertical convertido en horizontal ═══════════ */
    function initStars() {
        const sec = $('#productos');
        const sticky = $('#stars-sticky'), viewport = $('#stars-viewport'), track = $('#stars-track');
        if (!sec || !track) return;
        const cards = $$('.star', track);
        const fill = $('#stars-fill'), cur = $('#stars-cur');
        let pinned = false, travel = 0, padL = 0, offs = [];
        let lastIdx = -1;

        const ui = p => {
            fill.style.setProperty('--sp', p.toFixed(4));
            const idx = clamp(Math.round(p * (cards.length - 1)), 0, cards.length - 1);
            if (idx !== lastIdx) { cur.textContent = pad2(idx + 1); lastIdx = idx; }
        };

        layoutHooks.push(() => {
            const want = mqPin.matches && !reduce;
            if (want !== pinned) {
                pinned = want;
                sec.classList.toggle('is-pinned', pinned);
                if (!pinned) {
                    track.style.transform = ''; sec.style.removeProperty('--hs');
                    cards.forEach(c => { c.style.removeProperty('--sc'); c.style.removeProperty('--ix'); });
                }
            }
            if (!pinned) return;
            const cs = getComputedStyle(viewport);
            padL = parseFloat(cs.paddingLeft) || 0;
            const padR = parseFloat(cs.paddingRight) || 0;
            travel = Math.max(0, track.scrollWidth + padL + padR - S.vw);
            sec.style.setProperty('--hs', Math.round(travel + S.vh * 1.15) + 'px');
            // Centro de cada tarjeta relativo al inicio del track (ambos se desplazan juntos)
            const t0 = track.getBoundingClientRect().left;
            offs = cards.map(c => { const r = c.getBoundingClientRect(); return r.left - t0 + r.width / 2; });
        });

        addScene(sec, s => {
            if (!pinned) {
                const max = viewport.scrollWidth - viewport.clientWidth;
                ui(max > 0 ? viewport.scrollLeft / max : 0);
                return;
            }
            const p = clamp((S.y - s.top) / Math.max(1, travel));
            const x = -p * travel;
            const skew = clamp(S.vel * -.07, -3, 3);
            track.style.transform = `translate3d(${x.toFixed(1)}px,0,0) skewX(${skew.toFixed(2)}deg)`;
            for (let i = 0; i < cards.length; i++) {
                const cx = padL + offs[i] + x;
                const dx = (cx - S.vw / 2) / S.vw;
                cards[i].style.setProperty('--ix', clamp(dx * -46, -34, 34).toFixed(1) + 'px');
                cards[i].style.setProperty('--sc', (1 - Math.min(.07, Math.abs(dx) * .09)).toFixed(3));
            }
            ui(p);
        });

        // Accesibilidad: al enfocar una tarjeta con teclado, llevar el scroll hasta ella
        track.addEventListener('focusin', e => {
            const card = e.target.closest('.star');
            if (!card) return;
            sticky.scrollLeft = 0; viewport.scrollLeft = 0;
            if (!pinned) { card.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); return; }
            const i = cards.indexOf(card);
            const target = clamp((padL + offs[i] - S.vw / 2) / Math.max(1, travel));
            const sc = scenes.find(s => s.el === sec);
            if (sc) window.scrollTo({ top: sc.top + target * travel, behavior: 'smooth' });
        });
    }

    /* ═══════════ TILT + SPOTLIGHT en tarjetas ═══════════ */
    function initTilt() {
        if (!finePointer || reduce) return;
        $$('.tilt').forEach(el => {
            el.addEventListener('pointermove', e => {
                const r = el.getBoundingClientRect();
                const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
                el.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
                el.style.setProperty('--my', (y * 100).toFixed(1) + '%');
                el.style.setProperty('--ry', ((x - .5) * 9).toFixed(2) + 'deg');
                el.style.setProperty('--rx', ((.5 - y) * 7).toFixed(2) + 'deg');
            });
            el.addEventListener('pointerleave', () => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
        });
    }

    /* ═══════════ BOTONES MAGNÉTICOS ═══════════ */
    function initMagnetic() {
        if (!finePointer || reduce) return;
        const items = $$('.magnetic');
        const state = items.map(el => ({ el, on: false }));
        loops.push(() => {
            if (!S.moved) return;
            S.moved = false;
            state.forEach(st => {
                const r = st.el.getBoundingClientRect();
                const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
                const dx = S.px - cx, dy = S.py - cy;
                const near = Math.abs(dx) < r.width / 2 + 70 && Math.abs(dy) < r.height / 2 + 70;
                if (near) { st.el.style.translate = `${clamp(dx * .28, -16, 16).toFixed(1)}px ${clamp(dy * .4, -12, 12).toFixed(1)}px`; st.on = true; }
                else if (st.on) { st.el.style.translate = ''; st.on = false; }
            });
        });
    }

    /* ═══════════ PRESENTACIONES: acordeón con ciclo automático ═══════════ */
    function initFormats() {
        const list = $('#fmt-list');
        if (!list) return;
        const items = $$('.fmt', list);
        let idx = 0, userUntil = 0, hover = false, inView = false;
        const set = i => {
            idx = i;
            items.forEach((it, k) => {
                const on = k === i;
                it.classList.toggle('is-active', on);
                $('.fmt-head', it).setAttribute('aria-expanded', String(on));
                const panel = $('.fmt-panel', it); if (panel) panel.inert = !on;
            });
        };
        items.forEach((it, i) => {
            $('.fmt-head', it).addEventListener('click', () => { userUntil = performance.now() + 9000; set(i); });
        });
        list.addEventListener('pointerenter', () => { hover = true; });
        list.addEventListener('pointerleave', () => { hover = false; });
        if ('IntersectionObserver' in window) new IntersectionObserver(es => { inView = es[0].isIntersecting; }, { threshold: .3 }).observe(list);
        if (!reduce) setInterval(() => {
            if (inView && !hover && !document.hidden && performance.now() > userUntil) set((idx + 1) % items.length);
        }, 4800);
    }

    /* ═══════════ PESTAÑAS: rutina / negocio ═══════════ */
    function initTabs() {
        const wrap = $('#tabs');
        if (!wrap) return;
        const tabs = $$('.tab', wrap), pill = $('.tabs-pill', wrap);
        const panels = tabs.map(t => document.getElementById(t.getAttribute('aria-controls')));
        const place = tab => {
            pill.style.setProperty('--pw', tab.offsetWidth + 'px');
            pill.style.setProperty('--px', (tab.offsetLeft - 5) + 'px');
        };
        const select = (i, focus) => {
            tabs.forEach((t, k) => {
                const on = k === i;
                t.classList.toggle('is-active', on);
                t.setAttribute('aria-selected', String(on));
                t.tabIndex = on ? 0 : -1;
                panels[k].hidden = !on;
                panels[k].classList.toggle('is-active', on);
                if (on) $$('.aud-copy > *', panels[k]).forEach((c, n) => c.style.setProperty('--k', n));
            });
            place(tabs[i]);
            if (focus) tabs[i].focus();
        };
        tabs.forEach((t, i) => {
            t.addEventListener('click', () => select(i));
            t.addEventListener('keydown', e => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); select((i + 1) % tabs.length, true); }
                if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); select((i - 1 + tabs.length) % tabs.length, true); }
            });
        });
        select(0);
        layoutHooks.push(() => place(wrap.querySelector('.tab.is-active')));
    }

    /* ═══════════ PROCESO: paso activo + línea de progreso ═══════════ */
    function initSteps() {
        const list = $('#steps-list');
        if (!list) return;
        const steps = $$('.step', list);
        const dialArc = $('#dial-arc'), dialNum = $('#dial-num');
        const C = 339.3;
        let tops = [], active = -1;
        layoutHooks.push(() => {
            const sy = window.scrollY;
            tops = steps.map(s => { const r = s.getBoundingClientRect(); return { t: r.top + sy, h: r.height }; });
        });
        const setActive = i => {
            if (i === active) return;
            active = i;
            steps.forEach((s, k) => s.classList.toggle('is-active', k === i));
            dialNum.textContent = pad2(i + 1);
            dialArc.style.strokeDashoffset = (C * (1 - (i + 1) / steps.length)).toFixed(1);
        };
        if (reduce) { setActive(0); return; }
        addScene(list, s => {
            const line = S.y + S.vh * .52;
            let i = 0;
            tops.forEach((t, k) => { if (line >= t.t + t.h * .22) i = k; });
            setActive(i);
            list.style.setProperty('--sp', clamp((line - s.top) / s.h).toFixed(4));
        });
    }

    /* ═══════════ DÓNDE NOS ENCUENTRAS: la banda se abre ═══════════ */
    function initBand() {
        const band = $('#where-band');
        if (!band || reduce) return;
        addScene(band, s => {
            const q = (S.y + S.vh - s.top) / (S.vh + s.h);
            const e = smooth(.04, .5, q);
            band.style.setProperty('--bi', lerp(16, 0, e).toFixed(2) + '%');
            band.style.setProperty('--bj', lerp(9, 0, e).toFixed(2) + '%');
            band.style.setProperty('--by', ((q - .5) * -s.h * .16).toFixed(1) + 'px');
        });
    }

    /* ═══════════ FAQ ═══════════ */
    function initFaq() {
        const list = $('#faq-list');
        if (!list) return;
        const items = $$('.qa', list);
        const set = (i, open) => {
            const b = $('button', items[i]), p = $('.qa-panel', items[i]);
            b.setAttribute('aria-expanded', String(open));
            p.classList.toggle('is-open', open);
            p.inert = !open;
        };
        items.forEach((it, i) => {
            $('button', it).addEventListener('click', e => {
                const open = e.currentTarget.getAttribute('aria-expanded') !== 'true';
                items.forEach((_, k) => set(k, false));
                set(i, open);
            });
        });
        set(0, true);
    }

    /* ═══════════ CIERRE: el sol sube + marca del footer ═══════════ */
    function initFinale() {
        const contact = $('#contacto'), mark = $('#footer-mark'), footer = $('#footer');
        if (reduce) return;
        if (contact) addScene(contact, s => {
            const q = clamp((S.y + S.vh - s.top) / (s.h + S.vh * .4));
            contact.style.setProperty('--rise', (q * S.vw * .2).toFixed(1) + 'px');
        });
        if (mark && footer) addScene(footer, s => {
            const q = clamp((S.y + S.vh - s.top) / (s.h * .9));
            mark.style.setProperty('--fy', (lerp(38, 0, easeOut(q))).toFixed(1) + '%');
        });
    }

    /* ═══════════ FORMULARIO → WHATSAPP ═══════════ */
    function initForm() {
        const form = $('#wa-form');
        if (!form) return;
        const name = $('#f-name'), city = $('#f-city'), interest = $('#f-interest'), msg = $('#f-msg');
        const eName = $('#e-name'), eInt = $('#e-interest'), btn = $('#f-submit'), status = $('#f-status');
        const setErr = (input, box, text) => {
            box.textContent = text;
            if (text) { input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', box.id); }
            else { input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby'); }
        };
        name.addEventListener('input', () => { if (name.value.trim()) setErr(name, eName, ''); });
        interest.addEventListener('change', () => setErr(interest, eInt, ''));

        form.addEventListener('submit', e => {
            e.preventDefault();
            let first = null;
            if (!name.value.trim()) { setErr(name, eName, 'Cuéntanos tu nombre para saludarte.'); first = first || name; }
            if (!interest.value) { setErr(interest, eInt, 'Elige qué te interesa para ayudarte mejor.'); first = first || interest; }
            if (first) { first.focus(); status.textContent = ''; return; }

            const parts = [`Hola Matías Superfoods, soy ${name.value.trim()}`];
            if (city.value.trim()) parts[0] += ` de ${city.value.trim()}`;
            parts[0] += '.';
            parts.push(`Me interesa: ${interest.value}.`);
            if (msg.value.trim()) parts.push(msg.value.trim().replace(/([^.!?¿?])$/, '$1.'));
            parts.push('¿Me pueden ayudar?');
            const url = waUrl(parts.join(' '));

            form.classList.add('is-sent');
            btn.disabled = true;
            status.textContent = 'Abriendo WhatsApp con tu mensaje...';
            const w = window.open(url, '_blank', 'noopener');
            if (!w) location.href = url;
            setTimeout(() => {
                btn.disabled = false;
                status.textContent = '';
                const a = document.createElement('a');
                a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.className = 'link-cta';
                a.textContent = 'Si no se abrió, toca aquí';
                status.appendChild(a);
            }, 2600);
        });
    }

    /* ═══════════ PUNTERO (parallax del hero + magnéticos) ═══════════ */
    function initPointer() {
        if (!finePointer) return;
        addEventListener('pointermove', e => {
            S.tx = e.clientX / S.vw - .5; S.ty = e.clientY / S.vh - .5;
            S.px = e.clientX; S.py = e.clientY; S.moved = true;
        }, { passive: true });
    }

    /* ═══════════ MOTOR: un solo rAF para todo ═══════════ */
    function initEngine() {
        const bar = $('#progress');
        let last = performance.now();

        const frame = t => {
            const dt = Math.min(64, t - last); last = t;
            S.raw = window.scrollY;
            const k = reduce ? 1 : 1 - Math.pow(1 - .085, dt / 16.667);
            const prev = S.y;
            S.y += (S.raw - S.y) * k;
            if (Math.abs(S.raw - S.y) < .06) S.y = S.raw;
            S.vel = lerp(S.vel, (S.y - prev) / Math.max(dt, 1) * 16.667, .2);
            if (Math.abs(S.vel) < .01) S.vel = 0;
            if (!finePointer && !reduce) { S.tx = Math.sin(t * .0004) * .32; S.ty = Math.cos(t * .0003) * .26; }
            S.mx = lerp(S.mx, S.tx, .06); S.my = lerp(S.my, S.ty, .06);

            if (S.y !== prev || S.dirty || S.vel !== 0) {
                const lo = S.y - S.vh * .25, hi = S.y + S.vh * 1.25;
                for (let i = 0; i < scenes.length; i++) {
                    const s = scenes[i];
                    if (s.always || (s.top + s.h > lo && s.top < hi)) s.update(s);
                }
                if (bar) bar.style.transform = `scaleX(${clamp(S.raw / Math.max(1, S.docH - S.vh)).toFixed(4)})`;
                S.dirty = false;
            }
            for (let i = 0; i < loops.length; i++) loops[i](t, dt);
            requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);

        let lastW = innerWidth, lastH = innerHeight;
        addEventListener('resize', () => {
            if (innerWidth !== lastW || Math.abs(innerHeight - lastH) > 140) { lastW = innerWidth; lastH = innerHeight; measureSoon(150); }
        });
        addEventListener('orientationchange', () => measureSoon(300));
        addEventListener('load', () => { measure(); setTimeout(measure, 800); });
        if (document.fonts && document.fonts.ready) { document.fonts.ready.then(() => measureSoon(60)); document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', () => measureSoon(60)); }
        if ('ResizeObserver' in window) {
            let h = document.body.offsetHeight;
            new ResizeObserver(() => { if (Math.abs(document.body.offsetHeight - h) > 4) { h = document.body.offsetHeight; measureSoon(160); } }).observe(document.body);
        }
    }

    /* ═══════════ Precarga: las tarjetas del scroll horizontal no pueden esperar al lazy ═══════════ */
    function initPreload() {
        const go = () => $$('.star img[loading="lazy"], .portal-img').forEach(img => { img.loading = 'eager'; });
        if (document.readyState === 'complete') setTimeout(go, 400);
        else addEventListener('load', () => setTimeout(go, 400), { once: true });
    }

    /* ═══════════ Varios ═══════════ */
    function initMisc() {
        const y = $('#year'); if (y) y.textContent = new Date().getFullYear();
        if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    }

    /* ═══════════ ARRANQUE ═══════════ */
    html.classList.add('is-loading');
    initMisc();
    initPreload();
    initWhatsApp();
    initReveals();
    initCounters();
    initNav();
    initHero();
    initMarquee();
    initManifesto();
    initPortal();
    initStars();
    initTilt();
    initMagnetic();
    initFormats();
    initTabs();
    initSteps();
    initBand();
    initFaq();
    initFinale();
    initForm();
    initPointer();
    measure();
    initEngine();
    initLoader();
})();
