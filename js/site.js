/* Smit Arekar portfolio. Vanilla JS, no dependencies.
   Motion uses Apple-style springs (damping ratio + response), always started
   from the current on-screen value so every animation can be interrupted. */
(() => {
  "use strict";

  const doc = document;
  const root = doc.documentElement;
  const $ = (sel, ctx = doc) => ctx.querySelector(sel);
  const $$ = (sel, ctx = doc) => [...ctx.querySelectorAll(sel)];
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  const mqReduce = matchMedia("(prefers-reduced-motion: reduce)");
  const mqFine = matchMedia("(hover: hover) and (pointer: fine)");
  const mqNarrow = matchMedia("(max-width: 959px)");
  let reduce = mqReduce.matches;
  mqReduce.addEventListener("change", (e) => { reduce = e.matches; });

  /* ------------------------------------------------------------ Springs */

  class Spring {
    constructor(value, response = 0.4, damping = 1, precision = 0.001) {
      this.x = value;
      this.v = 0;
      this.target = value;
      this.precision = precision;
      this.configure(response, damping);
    }
    configure(response, damping) {
      // Apple's designer parameters mapped to a unit-mass spring.
      this.k = Math.pow((2 * Math.PI) / response, 2);
      this.c = (4 * Math.PI * damping) / response;
    }
    snap(value) { this.x = this.target = value; this.v = 0; }
    step(dt) {
      const n = Math.max(1, Math.ceil(dt / (1 / 240)));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        const a = -this.k * (this.x - this.target) - this.c * this.v;
        this.v += a * h;
        this.x += this.v * h;
      }
      if (this.done) { this.x = this.target; this.v = 0; }
    }
    get done() {
      return Math.abs(this.x - this.target) < this.precision && Math.abs(this.v) < this.precision * 10;
    }
  }

  // One display-synced loop. Tasks return true while they still need frames.
  const tasks = new Set();
  let rafId = 0;
  let last = 0;
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    for (const task of [...tasks]) if (!task(dt)) tasks.delete(task);
    rafId = tasks.size ? requestAnimationFrame(frame) : 0;
  }
  function run(task) {
    tasks.add(task);
    if (!rafId) { last = performance.now(); rafId = requestAnimationFrame(frame); }
  }

  // Apple's momentum projection (Designing Fluid Interfaces, WWDC 2018).
  const project = (velocity, rate = 0.998) => ((velocity / 1000) * rate) / (1 - rate);
  const rubberband = (over, dim, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));

  /* ------------------------------------------------------------ Nav */

  const nav = $("#nav");
  const navToggle = $(".nav-toggle", nav);
  const navLinks = $$(".nav-links a", nav);

  function setMenu(open) {
    nav.classList.toggle("is-open", open);
    navToggle.setAttribute("aria-expanded", String(open));
  }
  navToggle.addEventListener("click", () => setMenu(!nav.classList.contains("is-open")));
  navLinks.forEach((a) => a.addEventListener("click", () => setMenu(false)));
  doc.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nav.classList.contains("is-open")) { setMenu(false); navToggle.focus(); }
  });
  doc.addEventListener("click", (e) => {
    if (nav.classList.contains("is-open") && !nav.contains(e.target)) setMenu(false);
  });

  const navTargets = navLinks.map((a) => ({ a, el: doc.getElementById(a.hash.slice(1)) })).filter((t) => t.el);
  function updateNav() {
    nav.classList.toggle("is-scrolled", scrollY > 8);
    const line = innerHeight * 0.4;
    let current = null;
    for (const t of navTargets) if (t.el.getBoundingClientRect().top <= line) current = t;
    for (const t of navTargets) {
      if (t === current) t.a.setAttribute("aria-current", "true");
      else t.a.removeAttribute("aria-current");
    }
  }

  /* ------------------------------------------------------------ Hero: the real layout, with a loupe */

  // The hero plot (tools/plot_gds.py) frames the die plus 3 um on every side: 133.42 x 144.14 um.
  // The die's lower-left corner is the origin of the readout.
  const FRAME_UM = { w: 133.42, h: 144.14, margin: 3 };
  const DIE_UM = { w: 127.42, h: 138.14 };
  const ZOOM = 3;
  const LOUPE_SRC = "assets/img/uart-plot-3600.webp";
  const LOUPE_FALLBACK = "assets/img/uart-plot-1240.webp";

  const specimen = $("#specimen");
  const loupe = $("#loupe");
  const probe = $("#probe");
  const lens = new Spring(0, 0.28, 1, 0.002); // 0 hidden, 1 shown
  const at = { x: 0, y: 0 };

  function paintLoupe() {
    const L = loupe.offsetWidth;
    const k = 0.7 + 0.3 * lens.x;
    loupe.style.opacity = lens.x.toFixed(3);
    probe.style.opacity = lens.x.toFixed(3);
    loupe.style.transform = `translate(${(at.x - L / 2).toFixed(1)}px, ${(at.y - L / 2).toFixed(1)}px) scale(${k.toFixed(3)})`;
    probe.style.transform = `translate(${(at.x - probe.offsetWidth / 2).toFixed(1)}px, ${(at.y + (L / 2) * k + 10).toFixed(1)}px)`;
  }

  function lensTask(dt) {
    lens.step(dt);
    paintLoupe();
    return !lens.done;
  }

  let loupeLoaded = false;
  specimen.addEventListener("pointerenter", (e) => {
    if (loupeLoaded || e.pointerType !== "mouse" || !mqFine.matches) return;
    loupeLoaded = true;
    // The 3600 px plot paints over the already-cached 1240 px one as soon as it arrives.
    loupe.style.backgroundImage = `url("${LOUPE_SRC}"), url("${LOUPE_FALLBACK}")`;
  });

  specimen.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" || !mqFine.matches) return;
    const r = specimen.getBoundingClientRect();
    at.x = e.clientX - r.left;
    at.y = e.clientY - r.top;
    const u = at.x / r.width;
    const v = at.y / r.height;
    const L = loupe.offsetWidth;
    const big = r.width * ZOOM;
    const size = `${big.toFixed(1)}px auto`;
    const pos = `${(L / 2 - u * big).toFixed(1)}px ${(L / 2 - v * r.height * ZOOM).toFixed(1)}px`;
    loupe.style.backgroundSize = `${size}, ${size}`;
    loupe.style.backgroundPosition = `${pos}, ${pos}`;
    const ux = u * FRAME_UM.w - FRAME_UM.margin;
    const uy = (1 - v) * FRAME_UM.h - FRAME_UM.margin;
    const onDie = ux >= 0 && uy >= 0 && ux <= DIE_UM.w && uy <= DIE_UM.h;
    probe.textContent = onDie ? `x ${ux.toFixed(1)}  y ${uy.toFixed(1)} \u00b5m` : "off the die";
    lens.target = 1;
    if (reduce) lens.snap(1);
    paintLoupe();
    run(lensTask);
  });
  specimen.addEventListener("pointerleave", () => {
    lens.target = 0;
    if (reduce) lens.snap(0);
    run(lensTask);
  });

  /* ------------------------------------------------------------ The tour: a camera over the die */

  const tourDie = $("#tour-die");
  const tourFrame = tourDie.parentElement;
  const tourViewport = $("#tour-viewport");

  const tourBlocks = new Map($$(".block", tourDie).map((b) => [b.dataset.project, b]));
  const chapters = $$(".chapter");

  tourDie.addEventListener("click", (e) => {
    const block = e.target.closest(".block");
    if (!block) return;
    const id = block.dataset.project;
    if (id === activeId) { openSheet(id, block); return; }
    const r = doc.getElementById(id).getBoundingClientRect();
    const anchor = innerHeight * (mqNarrow.matches ? 0.7 : 0.5);
    scrollTo({ top: scrollY + r.top + r.height / 2 - anchor, behavior: reduce ? "auto" : "smooth" });
  });

  const cam = {
    x: new Spring(0, 0.65, 1, 0.05),
    y: new Spring(0, 0.65, 1, 0.05),
    s: new Spring(1, 0.65, 1, 0.0002),
  };
  let activeId;

  function cameraTarget(id) {
    const block = id && tourBlocks.get(id);
    if (!block) return { x: 0, y: 0, s: 1 };
    const vw = tourViewport.clientWidth;
    const vh = tourViewport.clientHeight;
    const bw = block.offsetWidth;
    const bh = block.offsetHeight;
    const s = clamp(Math.min((vw * 0.74) / bw, (vh * 0.74) / bh), 1, 3.4);
    const cx = block.offsetLeft + bw / 2;
    const cy = block.offsetTop + bh / 2;
    return {
      x: vw / 2 - tourFrame.offsetLeft - s * cx,
      y: vh / 2 - tourFrame.offsetTop - s * cy,
      s,
    };
  }

  function applyCamera() {
    tourDie.style.transform = `translate3d(${cam.x.x.toFixed(2)}px, ${cam.y.x.toFixed(2)}px, 0) scale(${cam.s.x.toFixed(4)})`;
  }

  function cameraTask(dt) {
    cam.x.step(dt); cam.y.step(dt); cam.s.step(dt);
    applyCamera();
    const moving = !(cam.x.done && cam.y.done && cam.s.done);
    tourDie.classList.toggle("is-moving", moving);
    return moving;
  }

  function setActive(id, instant = false) {
    if (id === activeId) return;
    const prev = activeId && tourBlocks.get(activeId);
    if (prev) prev.classList.remove("is-active");
    activeId = id;
    const next = id && tourBlocks.get(id);
    if (next) next.classList.add("is-active");
    tourDie.classList.toggle("has-focus", Boolean(next));

    const t = cameraTarget(id);
    if (instant || reduce) {
      cam.x.snap(t.x); cam.y.snap(t.y); cam.s.snap(t.s);
      applyCamera();
      if (reduce && !instant) {
        tourDie.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 220, easing: "ease-out" });
      }
      return;
    }
    cam.x.target = t.x; cam.y.target = t.y; cam.s.target = t.s;
    run(cameraTask);
  }

  function pickChapter() {
    const anchor = innerHeight * (mqNarrow.matches ? 0.7 : 0.5);
    let id = null;
    for (const ch of chapters) {
      const r = ch.getBoundingClientRect();
      if (r.top <= anchor && r.bottom > anchor) { id = ch.id; break; }
    }
    setActive(id);
  }

  /* ------------------------------------------------------------ Scroll */

  let scrollQueued = false;
  function onScroll() {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => {
      scrollQueued = false;
      updateNav();
      pickChapter();
    });
  }
  addEventListener("scroll", onScroll, { passive: true });

  let resizeTimer = 0;
  addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const t = cameraTarget(activeId);
      cam.x.snap(t.x); cam.y.snap(t.y); cam.s.snap(t.s);
      applyCamera();
      if (skyDrawn) drawSky();
      onScroll();
    }, 120);
  });

  /* ------------------------------------------------------------ Night sky */

  const sky = $("#sky");
  const skyCopy = $("#offclock-copy");
  let skyDrawn = false;

  function mulberry32(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // A plotted star chart, drawn in the same line register as the die:
  // a thin graticule, crisp points sized by magnitude, the galactic band as a dashed contour.
  function drawSky() {
    const w = sky.clientWidth;
    const h = sky.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    sky.width = Math.round(w * dpr);
    sky.height = Math.round(h * dpr);
    const g = sky.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const rnd = mulberry32(1107);
    const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;

    const cr = skyCopy.getBoundingClientRect();
    const sr = sky.getBoundingClientRect();
    const keepOut = { x: cr.left - sr.left - 28, y: cr.top - sr.top - 20, w: cr.width + 56, h: cr.height + 40 };
    const inCopy = (x, y) => x > keepOut.x && x < keepOut.x + keepOut.w && y > keepOut.y && y < keepOut.y + keepOut.h;

    // Graticule: declination circles and hour lines around a pole above the band.
    const pole = { x: w * 0.78, y: -h * 0.9 };
    const reach = Math.hypot(Math.max(pole.x, w - pole.x), h - pole.y);
    g.lineWidth = 1;
    g.strokeStyle = "rgba(170,182,210,0.09)";
    for (let r = h * 0.55; r < reach; r += h * 0.28) {
      g.beginPath();
      g.arc(pole.x, pole.y, r, 0, Math.PI * 2);
      g.stroke();
    }
    for (let a = 0; a < 24; a++) {
      const t = (a / 24) * Math.PI * 2;
      g.beginPath();
      g.moveTo(pole.x + Math.cos(t) * h * 0.55, pole.y + Math.sin(t) * h * 0.55);
      g.lineTo(pole.x + Math.cos(t) * reach, pole.y + Math.sin(t) * reach);
      g.stroke();
    }

    // The galactic band, outlined the way charts draw it.
    const band = (t) => ({ x: w * (-0.05 + 1.1 * t), y: h * (-0.12 + 0.78 * t) });
    const bandHalf = h * 0.13;
    g.setLineDash([3, 5]);
    g.strokeStyle = "rgba(170,182,210,0.2)";
    for (const side of [-1, 1]) {
      g.beginPath();
      for (let i = 0; i <= 48; i++) {
        const t = i / 48;
        const p = band(t);
        const wobble = Math.sin(t * 9.0 + side) * h * 0.025 + Math.sin(t * 23.0) * h * 0.012;
        const y = p.y + side * (bandHalf + wobble);
        if (i === 0) g.moveTo(p.x, y); else g.lineTo(p.x, y);
      }
      g.stroke();
    }
    g.setLineDash([]);

    // Stars as chart points: denser in the band, sized by magnitude, bright ones ringed.
    const n = Math.round((w * h) / 900);
    for (let i = 0; i < n; i++) {
      let x;
      let y;
      if (rnd() < 0.5) {
        const p = band(rnd());
        x = p.x + gauss() * w * 0.05;
        y = p.y + gauss() * bandHalf * 0.9;
      } else {
        x = rnd() * w;
        y = rnd() * h;
      }
      const quiet = inCopy(x, y);
      const m = Math.pow(rnd(), 6);
      const r = quiet ? 0.4 : 0.45 + m * 1.9;
      const alpha = quiet ? 0.1 : 0.45 + m * 0.55;
      g.fillStyle = `rgba(236,240,250,${alpha.toFixed(3)})`;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      if (!quiet && r > 1.6) {
        g.strokeStyle = "rgba(236,240,250,0.35)";
        g.beginPath();
        g.arc(x, y, r + 2.6, 0, Math.PI * 2);
        g.stroke();
      }
    }
    skyDrawn = true;
  }

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { drawSky(); io.disconnect(); }
    }, { rootMargin: "400px 0px" });
    io.observe(sky);
  } else {
    drawSky();
  }

  /* ------------------------------------------------------------ Project sheet */

  const dlg = $("#sheet");
  const panel = $("#sheet-panel");
  const sheetTitle = $("#sheet-title");
  const sheetBody = $("#sheet-body");
  const grabZones = [$("#sheet-grabber"), $(".sheet-head", panel)];

  const open = new Spring(0, 0.42, 1, 0.0005); // 0 closed, 1 open
  const drag = new Spring(0, 0.36, 0.82, 0.2); // px offset while dragging
  let sheetState = "closed";
  let dismissing = false;
  let trigger = null;
  let pushed = false;
  let currentId = null;

  function fillSheet(id) {
    const ch = doc.getElementById(id);
    panel.dataset.group = ch.dataset.group;
    sheetTitle.innerHTML = $(".chapter-title", ch).innerHTML;
    sheetBody.textContent = "";
    const lede = $(".chapter-lede", ch).cloneNode(true);
    lede.className = "sheet-lede";
    sheetBody.append(lede);
    const deep = $(".deep", ch).cloneNode(true);
    sheetBody.append(...deep.childNodes);
    sheetBody.scrollTop = 0;
  }

  function paintSheet() {
    const p = open.x;
    const h = panel.offsetHeight || 1;
    const dragFrac = clamp(drag.x / h, 0, 1);
    if (reduce) {
      panel.style.transform = drag.x ? `translateY(${drag.x.toFixed(1)}px)` : "";
      panel.style.opacity = p.toFixed(3);
      panel.style.filter = "";
    } else {
      const s = 0.55 + 0.45 * p;
      panel.style.transform = `translateY(${drag.x.toFixed(1)}px) scale(${s.toFixed(4)})`;
      panel.style.opacity = clamp(p / 0.6, 0, 1).toFixed(3);
      panel.style.filter = p < 0.995 ? `blur(${((1 - p) * 12).toFixed(2)}px)` : "";
    }
    dlg.style.backgroundColor = `rgb(0 0 0 / ${(0.55 * p * (1 - dragFrac)).toFixed(3)})`;
  }

  function finishClose() {
    dlg.close();
    root.classList.remove("sheet-open");
    panel.style.transform = panel.style.opacity = panel.style.filter = "";
    dlg.style.backgroundColor = "";
    sheetState = "closed";
    dismissing = false;
    drag.configure(0.36, 0.82);
    drag.snap(0);
    open.snap(0);
    currentId = null;
    if (trigger && doc.contains(trigger)) trigger.focus({ preventScroll: true });
  }

  function sheetTask(dt) {
    open.step(dt);
    drag.step(dt);
    paintSheet();
    // Finish once the panel is visually gone; the spring's invisible tail is skipped.
    const gone = dismissing ? drag.x >= panel.offsetHeight || drag.done : open.x < 0.015;
    if (sheetState === "closing" && gone) {
      finishClose();
      return false;
    }
    return !(open.done && drag.done);
  }

  function openSheet(id, from, { push = true } = {}) {
    const ch = id && doc.getElementById(id);
    if (!ch || !ch.classList.contains("chapter")) return;
    setMenu(false);
    trigger = from || null;
    if (currentId !== id) fillSheet(id);
    currentId = id;
    if (!dlg.open) {
      dlg.showModal();
      root.classList.add("sheet-open");
    }
    // Grow out of whatever opened it: transform-origin sits on the trigger.
    const r = from && from.getBoundingClientRect();
    const ox = r ? r.left + r.width / 2 - panel.offsetLeft : panel.offsetWidth / 2;
    const oy = r ? r.top + r.height / 2 - panel.offsetTop : panel.offsetHeight;
    if (sheetState === "closed") panel.style.transformOrigin = `${ox.toFixed(1)}px ${oy.toFixed(1)}px`;
    sheetState = "open";
    dismissing = false;
    open.target = 1;
    drag.target = 0;
    if (push) {
      if (location.hash !== `#${id}`) history.pushState({ sheet: id }, "", `#${id}`);
      pushed = true;
    }
    paintSheet();
    run(sheetTask);
  }

  function closeSheet({ fromHistory = false } = {}) {
    if (!dlg.open || sheetState === "closing") return;
    sheetState = "closing";
    open.target = 0;
    run(sheetTask);
    if (!fromHistory) {
      if (pushed && history.state && history.state.sheet) history.back();
      else if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    }
    pushed = false;
  }

  dlg.addEventListener("cancel", (e) => { e.preventDefault(); closeSheet(); });
  dlg.addEventListener("click", (e) => { if (e.target === dlg) closeSheet(); });
  $("[data-close]", dlg).addEventListener("click", () => closeSheet());

  addEventListener("popstate", (e) => {
    const id = e.state && e.state.sheet;
    if (id) openSheet(id, $(`[data-open="${id}"]`), { push: false });
    else if (dlg.open) closeSheet({ fromHistory: true });
  });

  $$("[data-open]").forEach((btn) => {
    btn.addEventListener("click", () => openSheet(btn.dataset.open, btn));
  });

  // Drag to dismiss: 1:1 tracking, rubber-band upward, momentum decides.
  let gesture = null;
  function onDown(e) {
    if (e.button !== 0 || e.target.closest("button") || sheetState !== "open") return;
    gesture = { id: e.pointerId, y0: e.clientY, start: drag.x, samples: [{ t: e.timeStamp, y: e.clientY }], el: e.currentTarget };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onMove(e) {
    if (!gesture || e.pointerId !== gesture.id) return;
    let d = gesture.start + (e.clientY - gesture.y0);
    if (d < 0) d = -rubberband(-d, panel.offsetHeight);
    drag.snap(d);
    gesture.samples.push({ t: e.timeStamp, y: e.clientY });
    while (gesture.samples.length > 2 && e.timeStamp - gesture.samples[0].t > 90) gesture.samples.shift();
    paintSheet();
  }
  function onUp(e) {
    if (!gesture || e.pointerId !== gesture.id) return;
    const s = gesture.samples;
    const a = s[0];
    const b = s[s.length - 1];
    const dt = (b.t - a.t) / 1000;
    const v = dt > 0 ? (b.y - a.y) / dt : 0;
    gesture = null;
    const h = panel.offsetHeight;
    if (drag.x + project(v) > h * 0.35 && v >= -50) {
      dismissing = true;
      sheetState = "closing";
      drag.configure(0.38, 1);
      drag.target = h + 40;
      drag.v = Math.max(v, 400);
      if (pushed && history.state && history.state.sheet) history.back();
      else if (location.hash) history.replaceState(null, "", location.pathname + location.search);
      pushed = false;
    } else {
      drag.configure(0.36, 0.82);
      drag.target = 0;
      drag.v = v;
    }
    run(sheetTask);
  }
  for (const zone of grabZones) {
    zone.addEventListener("pointerdown", onDown);
    zone.addEventListener("pointermove", onMove);
    zone.addEventListener("pointerup", onUp);
    zone.addEventListener("pointercancel", onUp);
  }

  /* ------------------------------------------------------------ Start */

  setActive(null, true);
  updateNav();
  pickChapter();

  // Deep links like /#riscv open that project once the page has settled.
  const initial = location.hash.slice(1);
  if (initial && doc.getElementById(initial) && doc.getElementById(initial).classList.contains("chapter")) {
    requestAnimationFrame(() => openSheet(initial, $(`[data-open="${initial}"]`), { push: false }));
  }
})();
