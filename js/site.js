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
      pickLayer();
      updateNight();
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
      if (stars.length) { seedStars(); updateNight(); }
      cutCursorLine();
      onScroll();
    }, 120);
  });

  /* ------------------------------------------------------------ Shipped: each plot sweeps in once; the scope scrubs */

  function mulberry32(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const plots = $$(".plot");
  if ("IntersectionObserver" in window && !reduce) {
    const sweepIO = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("is-swept");
        sweepIO.unobserve(e.target);
      }
    }, { threshold: 0.45 });
    plots.forEach((p) => sweepIO.observe(p));
  } else {
    plots.forEach((p) => p.classList.add("is-swept"));
  }

  for (const body of $$(".plot-body[data-scrub]")) {
    const [x0, x1] = body.dataset.x.split(" ").map(Number);
    const [y0, y1] = body.dataset.y.split(" ").map(Number);
    const [bl, br, bt, bb] = body.dataset.box.split(" ").map(Number);
    const series = body.dataset.series.split(" ").map(Number);
    const unitX = body.dataset.unitX;
    const unitY = body.dataset.unitY;
    const line = doc.createElement("span");
    line.className = "scrub";
    line.setAttribute("aria-hidden", "true");
    line.innerHTML = '<span class="scrub-dot"></span><span class="scrub-probe"></span>';
    body.append(line);
    const dot = line.firstChild;
    const readout = line.lastChild;
    body.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse" || !mqFine.matches) return;
      const r = body.getBoundingClientRect();
      const fx = clamp(((e.clientX - r.left) / r.width) * 100, bl, br);
      const t = x0 + ((fx - bl) / (br - bl)) * (x1 - x0);
      const k = ((t - x0) / (x1 - x0)) * (series.length - 1);
      const i = Math.min(series.length - 2, Math.floor(k));
      const y = series[i] + (series[i + 1] - series[i]) * (k - i);
      line.style.transform = `translateX(${((fx / 100) * r.width).toFixed(1)}px)`;
      dot.style.top = `${(bb - ((y - y0) / (y1 - y0)) * (bb - bt)).toFixed(2)}%`;
      readout.style.transform = `translateX(${fx > 82 ? -100 : fx < 18 ? 0 : -50}%)`;
      readout.textContent = `t ${t.toFixed(1)} ${unitX} · ${y.toFixed(1)} ${unitY}`;
      body.classList.add("is-scrubbing");
    });
    body.addEventListener("pointerleave", () => body.classList.remove("is-scrubbing"));
  }

  /* ------------------------------------------------------------ About: the timeline, a logic-analyzer cursor */

  const tlFrame = $("#timeline");
  const tlBody = $(".plot-body", tlFrame);
  const TL = JSON.parse(tlBody.dataset.timeline);
  const tlCursor = $("#tl-cursor");
  const tlLine = $("#tl-line");
  const tlTexts = $$(".seg b, .seg span", tlBody);
  tlBody.append(tlCursor); // the cursor lives in the waveform's own coordinates, past the lane-name gutter
  const tlDate = $("#tl-date");
  const tlWhen = $("#tl-when");
  const tlWhat = $("#tl-what");
  const tlDoing = $("#tl-doing");
  const tlSegEls = $$("[data-seg]", tlBody);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const today = new Date();
  const TL_END = TL.t1 - 0.001;
  const NOW_T = clamp(today.getFullYear() + (today.getMonth() + 0.5) / 12, TL.t0, TL_END);
  const tlX = (t) => TL.l + ((t - TL.t0) / (TL.t1 - TL.t0)) * (TL.r - TL.l);
  const tlT = (x) => TL.t0 + ((x - TL.l) / (TL.r - TL.l)) * (TL.t1 - TL.t0);
  const tlSpring = new Spring(TL.t0, 1.1, 1, 0.0004);
  let tlShown = -1;
  let tlTouched = false;

  // The cursor line breaks where it crosses label text, so it never strikes through a word.
  function cutCursorLine() {
    const lr = tlLine.getBoundingClientRect();
    if (!lr.height) return;
    const gaps = [];
    for (const el of tlTexts) {
      if (!el.offsetWidth) continue;
      const r = el.getBoundingClientRect();
      if (lr.left >= r.left - 2 && lr.left <= r.right + 2) gaps.push([r.top - lr.top - 2, r.bottom - lr.top + 2]);
    }
    if (!gaps.length) { tlLine.style.maskImage = tlLine.style.webkitMaskImage = ""; return; }
    gaps.sort((a, b) => a[0] - b[0]);
    const stops = ["#000 0px"];
    for (const [a, b] of gaps) stops.push(`#000 ${a.toFixed(1)}px`, `transparent ${a.toFixed(1)}px`, `transparent ${b.toFixed(1)}px`, `#000 ${b.toFixed(1)}px`);
    const mask = `linear-gradient(to bottom, ${stops.join(", ")})`;
    tlLine.style.maskImage = mask;
    tlLine.style.webkitMaskImage = mask;
  }

  function paintTimeline(t) {
    tlCursor.style.left = `${tlX(t).toFixed(3)}%`;
    cutCursorLine();
    const y = Math.floor(t);
    const m = clamp(Math.floor((t - y) * 12 + 1e-6), 0, 11);
    if (y * 12 + m === tlShown) return;
    tlShown = y * 12 + m;
    const tm = y + (m + 0.5) / 12;
    const on = [];
    TL.segs.forEach((s, i) => { if (tm >= s.a && tm < s.b) on.push(i); });
    tlSegEls.forEach((el) => el.classList.toggle("is-on", on.includes(Number(el.dataset.seg))));
    const school = on.map((i) => TL.segs[i]).find((s) => s.lane === "school");
    const work = on.map((i) => TL.segs[i]).find((s) => s.lane === "industry");
    const lead = work || school;
    let what = [school, work].filter(Boolean).map((s) => `${s.name}, ${s.sub}`).join(", and ");
    if (!what) what = tm < TL.segs[0].a ? "Before the B.Tech" : tm < 2025.6 ? "Between Borosil and USC" : "After graduation";
    tlDate.textContent = `${MONTHS[m]} ${y}`;
    tlWhen.textContent = `${MONTHS_LONG[m]} ${y}`;
    tlWhat.textContent = what;
    tlDoing.textContent = lead ? lead.doing : "";
    tlDoing.hidden = !lead;
    tlCursor.setAttribute("aria-valuenow", tm.toFixed(3));
    tlCursor.setAttribute("aria-valuetext", `${MONTHS_LONG[m]} ${y}: ${what}`);
  }

  function tlTask(dt) {
    tlSpring.step(dt);
    paintTimeline(tlSpring.x);
    return !tlSpring.done;
  }

  function tlSet(t, instant = false) {
    tlTouched = true;
    tlSpring.target = clamp(t, TL.t0, TL_END);
    if (instant || reduce) {
      tlSpring.snap(tlSpring.target);
      paintTimeline(tlSpring.x);
    } else {
      run(tlTask);
    }
  }

  const tlAt = (e) => {
    const r = tlBody.getBoundingClientRect();
    return tlT(((e.clientX - r.left) / r.width) * 100);
  };
  let tlDrag = null;
  tlFrame.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (e.pointerType === "touch") {
      tlDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, touch: true };
      return;
    }
    tlDrag = { id: e.pointerId };
    tlFrame.setPointerCapture(e.pointerId);
    e.preventDefault();
    tlCursor.focus({ preventScroll: true });
    tlSet(tlAt(e), true);
  });
  tlFrame.addEventListener("pointermove", (e) => {
    if (!tlDrag || e.pointerId !== tlDrag.id) return;
    if (tlDrag.touch && !tlDrag.scrub && Math.abs(e.clientX - tlDrag.x) > 6 && Math.abs(e.clientX - tlDrag.x) > Math.abs(e.clientY - tlDrag.y)) {
      tlDrag.scrub = true;
    }
    if (!tlDrag.touch || tlDrag.scrub) tlSet(tlAt(e), true);
  });
  tlFrame.addEventListener("pointerup", (e) => {
    if (tlDrag && tlDrag.touch && e.pointerId === tlDrag.id && Math.hypot(e.clientX - tlDrag.x, e.clientY - tlDrag.y) < 8) {
      tlSet(tlAt(e));
    }
    tlDrag = null;
  });
  tlFrame.addEventListener("pointercancel", () => { tlDrag = null; });

  tlCursor.addEventListener("keydown", (e) => {
    const steps = { ArrowLeft: -1 / 12, ArrowDown: -1 / 12, ArrowRight: 1 / 12, ArrowUp: 1 / 12, PageDown: -1, PageUp: 1 };
    let t = tlSpring.target;
    if (e.key in steps) t += steps[e.key];
    else if (e.key === "Home") t = TL.t0;
    else if (e.key === "End") t = TL_END;
    else return;
    e.preventDefault();
    tlSet(t);
  });

  // Arrival: the cursor runs from 2019 to today once, the way an analyzer finishes a capture.
  paintTimeline(TL.t0);
  const tlScroll = $("#tl-scroll");
  tlScroll.scrollLeft = tlScroll.scrollWidth;
  if ("IntersectionObserver" in window && !reduce) {
    const tlIO = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      tlIO.disconnect();
      if (!tlTouched) { tlSpring.target = NOW_T; run(tlTask); }
    }, { threshold: 0.6 });
    tlIO.observe(tlScroll);
  } else {
    tlSpring.snap(NOW_T);
    paintTimeline(NOW_T);
  }

  /* ------------------------------------------------------------ About: the stack, built from the transistor up */

  const stackGrid = $("#stack-grid");
  const stackSvg = $(".stack-svg");
  const stackLayers = $$(".layer", stackSvg);
  const layerOrder = stackLayers.map((g) => g.dataset.layer); // bottom of the stack first
  const layerItems = $$(".layer-item");
  const spread = new Spring(14, 0.6, 1, 0.02);
  let layerActive;
  let layerHover = null;

  function paintSpread() { stackSvg.style.setProperty("--gap", spread.x.toFixed(2)); }
  function spreadTask(dt) { spread.step(dt); paintSpread(); return !spread.done; }

  function setLayer(id) {
    if (id === layerActive) return;
    layerActive = id;
    const idx = layerOrder.indexOf(id);
    stackLayers.forEach((g, i) => {
      g.classList.toggle("is-active", i === idx);
      g.classList.toggle("is-above", idx >= 0 && i > idx);
    });
    layerItems.forEach((li) => li.classList.toggle("is-active", li.dataset.layer === id));
    stackGrid.classList.toggle("is-live", idx >= 0);
  }

  function pickLayer() {
    const r = stackGrid.getBoundingClientRect();
    if (r.bottom < -200 || r.top > innerHeight + 200) return;
    // The stack opens up as it arrives.
    const target = reduce ? 40 : 14 + 26 * clamp((innerHeight * 0.95 - r.top) / (innerHeight * 0.6), 0, 1);
    if (Math.abs(spread.target - target) > 0.05) {
      spread.target = target;
      if (reduce) { spread.snap(target); paintSpread(); } else run(spreadTask);
    }
    if (layerHover) return;
    const line = innerHeight * (mqNarrow.matches ? 0.66 : 0.5);
    let id = null;
    for (const li of layerItems) if (li.getBoundingClientRect().top <= line) id = li.dataset.layer;
    setLayer(id);
  }

  layerItems.forEach((li) => {
    li.addEventListener("pointerenter", (e) => {
      if (e.pointerType !== "mouse") return;
      layerHover = li.dataset.layer;
      setLayer(layerHover);
    });
    li.addEventListener("pointerleave", () => { layerHover = null; pickLayer(); });
    li.addEventListener("focusin", () => { layerHover = li.dataset.layer; setLayer(layerHover); });
    li.addEventListener("focusout", () => { layerHover = null; pickLayer(); });
  });
  stackLayers.forEach((g) => {
    g.addEventListener("click", () => {
      const li = layerItems.find((x) => x.dataset.layer === g.dataset.layer);
      if (!li) return;
      const r = li.getBoundingClientRect();
      const line = innerHeight * (mqNarrow.matches ? 0.66 : 0.5);
      scrollTo({ top: scrollY + r.top - line + 24, behavior: reduce ? "auto" : "smooth" });
    });
  });

  /* ------------------------------------------------------------ The night: a long exposure that lengthens as you scroll */

  const night = $("#night");
  const trails = $("#trails");
  const exposureEl = $("#exposure");
  const horizonEl = $(".horizon", night);
  let stars = [];
  let tw = 0;
  let th = 0;
  let pole = { x: 0, y: 0 };
  let drawnKey = "";
  const darkBehind = [$(".offclock", night), $(".contact", night), $(".night-mark", night)];
  const range = doc.createRange();

  // The text sits in a patch of darker sky: trails are thinned out behind each block of copy.
  function copyPatches() {
    const sr = trails.getBoundingClientRect();
    return darkBehind.map((block) => {
      range.selectNodeContents(block);
      const q = range.getBoundingClientRect();
      if (!q.width) return null;
      return { x: q.left + q.width / 2 - sr.left, y: q.top + q.height / 2 - sr.top, w: q.width, h: q.height, small: q.height < 30 };
    }).filter((q) => q && q.y + q.h > -200 && q.y - q.h < sr.height + 200);
  }

  function seedStars() {
    const w = trails.clientWidth;
    const h = trails.clientHeight;
    if (!w || !h) return false;
    const dpr = Math.min(2, devicePixelRatio || 1);
    trails.width = Math.round(w * dpr);
    trails.height = Math.round(h * dpr);
    tw = w;
    th = h;
    pole = { x: w * (w < 735 ? 0.6 : 0.64), y: h * 0.24 };
    const reach = Math.hypot(Math.max(pole.x, w - pole.x), Math.max(pole.y, h - pole.y));
    const rnd = mulberry32(2027);
    const count = Math.round(Math.min(2200, (w * h) / 640));
    stars = [];
    for (let i = 0; i < count; i++) {
      const m = Math.pow(rnd(), 5.5);
      stars.push({ r: reach * Math.sqrt(rnd()), a: rnd() * Math.PI * 2, m, warm: rnd() < 0.16 });
    }
    drawnKey = "";
    return true;
  }

  // Earth turns 15 degrees an hour, so a trail's arc is the exposure time.
  function drawTrails(hours) {
    const patches = copyPatches();
    const key = `${hours.toFixed(3)}|${patches.map((q) => Math.round(q.y)).join(",")}`;
    if (key === drawnKey) return;
    drawnKey = key;
    const g = trails.getContext("2d");
    const dpr = trails.width / tw;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, tw, th);
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";
    const sweep = (hours * 15 * Math.PI) / 180;
    const ground = th - horizonEl.getBoundingClientRect().height * 0.42;
    const haze = th * 0.3;
    const paths = new Map();
    for (const s of stars) {
      const mid = s.a - sweep / 2;
      const y = pole.y + s.r * Math.sin(mid);
      if (y > ground + 30) continue;
      const fade = clamp((ground - y) / haze, 0.08, 1);
      const alpha = Math.round((0.16 + 0.84 * s.m) * fade * 10) / 10;
      if (alpha <= 0) continue;
      const width = s.m > 0.5 ? 1.8 : s.m > 0.15 ? 1.2 : 0.8;
      const key = `${alpha}|${width}|${s.warm ? 1 : 0}`;
      let p = paths.get(key);
      if (!p) { p = new Path2D(); paths.set(key, p); }
      const a0 = s.a - sweep;
      p.moveTo(pole.x + s.r * Math.cos(a0), pole.y + s.r * Math.sin(a0));
      p.arc(pole.x, pole.y, s.r, a0, s.a + 0.0005);
    }
    for (const [k, p] of paths) {
      const [alpha, width, warm] = k.split("|");
      g.lineWidth = Number(width);
      g.strokeStyle = warm === "1" ? `rgba(255,238,220,${alpha})` : `rgba(226,233,255,${alpha})`;
      g.stroke(p);
    }
    g.globalCompositeOperation = "destination-out";
    for (const q of patches) {
      const ry = q.h / 2 + (q.small ? 26 : 96);
      const rx = q.w / 2 + (q.small ? 40 : 150);
      g.save();
      g.translate(q.x, q.y);
      g.scale(rx / ry, 1);
      const fade = g.createRadialGradient(0, 0, 0, 0, 0, ry);
      fade.addColorStop(0, "rgba(0,0,0,0.97)");
      fade.addColorStop(0.62, "rgba(0,0,0,0.9)");
      fade.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = fade;
      g.fillRect(-ry, -ry, ry * 2, ry * 2);
      g.restore();
    }
    g.globalCompositeOperation = "source-over";
    const mins = Math.round(hours * 60);
    exposureEl.textContent = `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
  }

  function updateNight() {
    const r = night.getBoundingClientRect();
    if (r.top > innerHeight || r.bottom < 0) return;
    if (!stars.length && !seedStars()) return;
    const p = clamp(-r.top / Math.max(1, r.height - innerHeight), 0, 1);
    drawTrails(reduce ? 1.5 : p * 2.4);
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
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      openSheet(btn.dataset.open, btn);
    });
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
  pickLayer();
  updateNight();

  // Deep links like /#riscv open that project once the page has settled.
  const initial = location.hash.slice(1);
  if (initial && doc.getElementById(initial) && doc.getElementById(initial).classList.contains("chapter")) {
    requestAnimationFrame(() => openSheet(initial, $(`[data-open="${initial}"]`), { push: false }));
  }
})();
