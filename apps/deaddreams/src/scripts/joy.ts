/* The celebration and the gleam from the Iced Marty / RainbowGun pages: sparks, a ring, a glow, the banner,
   the unicorn's run, a C-major chime, and a shower of tickets when an order goes through. */

let actx: AudioContext | null = null;
const audio = () => {
  if (actx) return actx;
  const C = window.AudioContext || (window as any).webkitAudioContext;
  return C ? (actx = new C()) : null;
};
// Unlock audio on the first tap (iOS only allows it inside a gesture).
window.addEventListener("pointerup", () => audio()?.resume().catch(() => {}), { once: true, passive: true });

const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function chime(level: number) {
  const a = actx;
  if (!a || a.state !== "running") return;
  const notes = level > 1 ? [0, 4, 7, 12, 16] : [0, 4, 7], t0 = a.currentTime;
  const master = a.createGain();
  master.gain.value = 0.12;
  master.connect(a.destination);
  notes.forEach((semi, i) => {
    const o = a.createOscillator(), g = a.createGain(), st = t0 + i * 0.07;
    o.type = "triangle";
    o.frequency.value = 261.63 * Math.pow(2, semi / 12);
    g.gain.setValueAtTime(0.0001, st);
    g.gain.exponentialRampToValueAtTime(0.18, st + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, st + 0.9);
    o.connect(g); g.connect(master); o.start(st); o.stop(st + 1);
  });
}

export function unicorn() {
  const u = document.getElementById("uni");
  if (!u) return;
  u.classList.remove("run"); void u.offsetWidth; u.classList.add("run");
  setTimeout(() => u.classList.remove("run"), 2700);
}

/** Sparks, ring and glow on a .panel; grand adds the "Thank you!" banner. */
export function celebrate(box: HTMLElement, grand = false, text = "Thank you!") {
  let burst = box.querySelector<HTMLElement>(".burst");
  if (!burst) { burst = document.createElement("div"); burst.className = "burst"; box.appendChild(burst); }
  burst.innerHTML = ""; burst.style.display = "block";
  const ring = document.createElement("div"); ring.className = "ring"; burst.appendChild(ring);
  const n = grand ? 46 : 22;
  for (let i = 0; i < n; i++) {
    const s = document.createElement("div"), ang = (Math.PI * 2 * i) / n + Math.random() * 0.3, dist = (grand ? 150 : 90) + Math.random() * (grand ? 240 : 150);
    s.className = "spark"; s.style.left = "50%"; s.style.top = "40%";
    s.style.setProperty("--dx", (Math.cos(ang) * dist).toFixed(0) + "px");
    s.style.setProperty("--dy", (Math.sin(ang) * dist).toFixed(0) + "px");
    s.style.animationDelay = (Math.random() * (grand ? 0.3 : 0.12)).toFixed(2) + "s";
    burst.appendChild(s);
  }
  box.classList.remove("joy"); void box.offsetWidth; box.classList.add("joy");
  unicorn();
  if (grand) {
    let ban = box.querySelector<HTMLElement>(".banner");
    if (!ban) { ban = document.createElement("div"); ban.className = "banner"; ban.innerHTML = "<span></span>"; box.appendChild(ban); }
    ban.querySelector("span")!.textContent = text;
    ban.style.display = "flex";
    setTimeout(() => (ban!.style.display = "none"), 2300);
  }
  setTimeout(() => { box.classList.remove("joy"); burst!.style.display = "none"; }, grand ? 1600 : 1050);
  chime(grand ? 2 : 1);
  try { navigator.vibrate?.(grand ? [25, 35, 25, 35, 60] : 18); } catch {}
}

/** The weather: it rains tickets and guitars for a few seconds. */
export function letItFall(seconds = 8, items = ["🎟️", "🎟️", "🎸", "🎤", "✨"]) {
  const sky = document.getElementById("sky");
  if (!sky || reduced()) return;
  const until = Date.now() + seconds * 1000;
  const timer = setInterval(() => {
    if (Date.now() > until) return clearInterval(timer);
    if (document.hidden || sky.childElementCount > 60) return;
    const d = document.createElement("div");
    d.className = "drop";
    d.textContent = items[(Math.random() * items.length) | 0];
    d.style.fontSize = (14 + Math.random() * 14).toFixed(0) + "px";
    d.style.left = (Math.random() * 100).toFixed(1) + "vw";
    d.style.setProperty("--sway", ((Math.random() - 0.5) * 120).toFixed(0) + "px");
    d.style.setProperty("--spin", ((Math.random() - 0.5) * 540).toFixed(0) + "deg");
    d.style.animationDuration = (4 + Math.random() * 4).toFixed(2) + "s";
    d.addEventListener("animationend", () => d.remove());
    sky.appendChild(d);
  }, 160);
}

/** The sheen across the buttons that matter, and glints twinkling on them. */
export function gleam(els: HTMLElement[]) {
  els.forEach((el) => el.classList.add("gleam"));
  const sky = document.getElementById("sky");
  if (!sky) return;
  const loop = () => {
    if (!document.hidden && !reduced()) {
      const spots = els.filter((el) => el.offsetParent);
      const r = spots.length ? spots[(Math.random() * spots.length) | 0].getBoundingClientRect() : null;
      const [x, y] = r && r.bottom > 0 && r.top < innerHeight && Math.random() < 0.6
        ? [r.left + Math.random() * r.width, r.top + Math.random() * r.height - 7]
        : [Math.random() * (innerWidth - 20), Math.random() * (innerHeight - 20)];
      const g = document.createElement("div");
      g.className = "glint"; g.textContent = "✦"; g.style.left = x + "px"; g.style.top = y + "px";
      g.addEventListener("animationend", () => g.remove());
      sky.appendChild(g);
    }
    setTimeout(loop, 1800 + Math.random() * 2600);
  };
  loop();
}
