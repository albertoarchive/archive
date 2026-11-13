/* =====================================================================
   Círculos de sonido (13/11/2026)
   Dibuja los límites de la difusión del sonido sobre la galería y el timeline:
   el centro nítido, el círculo central (fuera, el sonido suena «tras la pared»),
   los anillos donde se reparten las voces y el límite de lo que se oye.
   Las piezas que están sonando llevan una marca. Oculto por defecto; se
   enseña desde «Ver › Círculos de sonido» o con la tecla C.
   Va en un archivo aparte y se engancha a AU.update sin tocar el motor de sonido.
   ===================================================================== */
(function(){
  if (typeof AU === "undefined") return;
  const NS = "http://www.w3.org/2000/svg";
  let on = false;
  try { on = localStorage.getItem("arch-circ") === "1"; } catch (e) {}

  // capa fija por encima de las piezas y por debajo de la interfaz
  const svg = document.createElementNS(NS, "svg");
  svg.id = "circulos"; svg.setAttribute("aria-hidden", "true");
  document.body.appendChild(svg);
  const st = document.createElement("style");
  st.textContent = `
    #circulos{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:15;overflow:visible}
    #circulos[hidden]{display:none}
    #circulos circle{fill:none;vector-effect:non-scaling-stroke}
    #circulos .c-limpio{stroke:var(--sello);stroke-width:1}
    #circulos .c-pared{stroke:var(--sello);stroke-width:1.5}
    #circulos .c-anillo{stroke:var(--fg);stroke-width:1;stroke-dasharray:2 5;opacity:.55}
    #circulos .c-limite{stroke:var(--fg);stroke-width:1;stroke-dasharray:10 6;opacity:.45}
    #circulos text{font:400 10.5px var(--f-ui);letter-spacing:.02em;text-transform:uppercase;fill:var(--fg)}
    #circulos text.r{fill:var(--sello)}
    #circulos .et{fill:var(--bg)}
    #circulos .voz{fill:var(--sello);stroke:none}
    #circulos .voz.fuera{fill:none;stroke:var(--fg);stroke-width:1.2}
    #circulos .halo{fill:none;stroke:var(--sello);stroke-width:1;opacity:.5}
    @media (prefers-reduced-motion:reduce){#circulos .halo{display:none}}`;
  document.head.appendChild(st);

  // interruptor en el panel «Ver», junto al catalejo
  const ver = document.getElementById("d-ver");
  if (ver) {
    const lab = document.createElement("label");
    lab.className = "switch";
    lab.innerHTML = `<span><b>Círculos de sonido</b><small>Hasta dónde llega cada sonido (tecla C)</small></span><input type="checkbox" id="f-circ" role="switch">`;
    ver.appendChild(lab);
    const cb = lab.querySelector("input"); cb.checked = on;
    cb.onchange = () => set(cb.checked);
  }
  addEventListener("keydown", e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest && e.target.closest("input,textarea,select,[contenteditable]")) return;
    if (e.key === "c" || e.key === "C") set(!on);
  });

  function set(v){
    on = v;
    try { localStorage.setItem("arch-circ", v ? "1" : "0"); } catch (e) {}
    const cb = document.getElementById("f-circ"); if (cb) cb.checked = v;
    dibujar();
  }

  // la misma geometría que usa posiciones(): centro de la pantalla (sin el panel) y R hasta la esquina
  function geo(){
    const vw = innerWidth, vh = innerHeight;
    const off = vw > 860 && document.body.classList.contains("side-open") && !document.body.classList.contains("ui-off") ? 320 : 0;
    const cx = off + (vw - off) / 2, cy = vh / 2;
    return { cx, cy, R: Math.hypot((vw - off) / 2, cy) };
  }

  function el(n, a){ const x = document.createElementNS(NS, n); for (const k in a) x.setAttribute(k, a[k]); return x; }

  function etiqueta(g, x, y, txt, rojo){
    const t = el("text", { x: x + 6, y: y - 5 }); t.textContent = txt; if (rojo) t.setAttribute("class", "r");
    g.appendChild(t);
    const b = t.getBBox(); // fondo para que se lea sobre las piezas
    g.insertBefore(el("rect", { class: "et", x: b.x - 3, y: b.y - 1, width: b.width + 6, height: b.height + 2 }), t);
  }

  function dibujar(){
    const vista = typeof S !== "undefined" ? S.view : "galeria";
    const visible = on && (vista === "galeria" || vista === "timeline") && document.getElementById("ficha").hidden;
    svg.hidden = !visible;
    if (!visible) return;
    svg.textContent = "";
    const { cx, cy, R } = geo();
    const rc = AU.rc || .32;
    const g = el("g", {}); svg.appendChild(g);

    // anillos donde se reparten las voces (las de fuera suenan tras la pared)
    const pos = typeof posiciones === "function" ? posiciones() : new Map();
    const conSonido = (typeof filtered === "function" ? filtered() : []).filter(d => d.sonido && pos.has(d.id));
    const rmax = conSonido.length ? Math.max(...conSonido.map(d => pos.get(d.id))) : 1;
    const nV = 6;
    for (let k = 1; k < nV; k++) {
      const r = (rc + (rmax - rc) * k / (nV - 1)) * R;
      if (r > rc * R + 8) g.appendChild(el("circle", { class: "c-anillo", cx, cy, r }));
    }
    // límite: más allá, nada suena
    g.appendChild(el("circle", { class: "c-limite", cx, cy, r: R }));
    // círculo central: dentro, limpio; fuera, tras la pared
    g.appendChild(el("circle", { class: "c-pared", cx, cy, r: rc * R }));
    // centro nítido: donde el sonido llega del todo claro
    g.appendChild(el("circle", { class: "c-limpio", cx, cy, r: rc * .38 * R, "stroke-dasharray": "3 3" }));

    const lab = el("g", {}); svg.appendChild(lab);
    etiqueta(lab, cx, cy - rc * .38 * R, "Nítido", true);
    etiqueta(lab, cx, cy - rc * R, "Círculo central · fuera suena tras la pared", true);
    const rUlt = (rc + (rmax - rc)) * R;
    if (rUlt > rc * R + 30 && cy - rUlt > 40) etiqueta(lab, cx, cy - rUlt, "Voces lejanas");

    // piezas que suenan ahora
    if (AU.started && AU.on) {
      document.querySelectorAll("#main .piece").forEach(p => {
        const x = AU.n.get(p.dataset.id);
        if (!x || !AU.sonando(x) || x.g.gain.value < .01) return;
        const b = p.getBoundingClientRect(); if (b.right < 0 || b.bottom < 0 || b.left > innerWidth || b.top > innerHeight) return;
        const px = b.left + b.width / 2, py = b.top + b.height / 2;
        const dentro = Math.hypot(px - cx, py - cy) / R < rc;
        const fuerza = Math.min(1, x.g.gain.value * 1.8);
        lab.appendChild(el("circle", { class: "halo", cx: px, cy: py, r: 8 + 14 * fuerza }));
        lab.appendChild(el("circle", { class: "voz" + (dentro ? "" : " fuera"), cx: px, cy: py, r: 4 }));
      });
    }
  }

  // redibuja cuando el motor recalcula, al moverse y de vez en cuando (las voces suben y bajan)
  const upd = AU.update.bind(AU);
  AU.update = function(){ upd(); dibujar(); };
  let raf = 0; const pedir = () => { if (!on || raf) return; raf = requestAnimationFrame(() => { raf = 0; dibujar(); }); };
  addEventListener("resize", pedir); addEventListener("scroll", pedir, { passive: true });
  addEventListener("pointermove", pedir, { passive: true }); addEventListener("wheel", pedir, { passive: true });
  setInterval(() => { if (on) dibujar(); }, 400);
  dibujar();
})();
