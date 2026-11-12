// Guarda los cambios hechos desde la web en el repositorio de GitHub (data.json + archivos en a/).
// Variables de entorno en Netlify: ARCHIVO_CLAVE (contraseña) y GITHUB_TOKEN (token con permiso de escritura en el repo).
const REPO = process.env.GITHUB_REPO || "albertoarchive/archive";
const BR = process.env.GITHUB_BRANCH || "main";
const API = "https://api.github.com/repos/" + REPO;
const EXTS = new Set(["webp", "png", "jpg", "mp4", "webm", "m4a", "mp3"]);

async function gh(p, o = {}) {
  const r = await fetch(API + p, { ...o, headers: { Authorization: "Bearer " + process.env.GITHUB_TOKEN, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "archivo-personal", ...(o.headers || {}) } });
  if (!r.ok) { const e = new Error("GitHub " + r.status + ": " + (await r.text()).slice(0, 160)); e.status = r.status; throw e; }
  return r;
}
const json = (p, o) => gh(p, o).then(r => r.json());
const leer = ref => gh(`/contents/data.json?ref=${ref}`, { headers: { Accept: "application/vnd.github.raw+json" } }).then(r => r.json());
const cabeza = () => json(`/git/ref/heads/${BR}`).then(r => r.object.sha);

function aplicar(data, ops) {
  const byId = new Map(data.piezas.map((p, i) => [p.id, i]));
  for (const o of ops || []) {
    if (!o || typeof o.id !== "string" || !/^[\w-]{1,120}$/.test(o.id)) continue;
    const i = byId.get(o.id);
    if (o.op === "update" && i !== undefined) Object.assign(data.piezas[i], o.data || {});
    else if (o.op === "set") { const d = { ...(o.data || {}), id: o.id }; if (i !== undefined) data.piezas[i] = d; else { byId.set(o.id, data.piezas.length); data.piezas.push(d); } }
    else if (o.op === "delete" && i !== undefined) { data.piezas.splice(i, 1); byId.clear(); data.piezas.forEach((p, k) => byId.set(p.id, k)); }
  }
}

export default async (req) => {
  const clave = req.headers.get("x-clave") || "";
  if (!process.env.ARCHIVO_CLAVE || !process.env.GITHUB_TOKEN) return new Response("Falta configurar ARCHIVO_CLAVE o GITHUB_TOKEN en Netlify", { status: 500 });
  const ok = clave === process.env.ARCHIVO_CLAVE;
  try {
    // Lectura pública: los datos más recientes del repositorio (así no hace falta publicar en Netlify para verlos)
    if (req.method === "GET") {
      if (clave && !ok) return new Response("Contraseña incorrecta", { status: 401 });
      const ref = await cabeza(); const d = await leer(ref); d._commit = ref;
      return Response.json(d, { headers: { "cache-control": "no-store" } });
    }
    if (!ok) return new Response("Contraseña incorrecta", { status: 401 });
    if (req.method !== "POST") return new Response("", { status: 405 });
    const body = await req.json();
    const assets = (body.assets || []).filter(a => /^[0-9a-f]{32}$/.test(a.id) && EXTS.has(a.ext) && typeof a.b64 === "string");
    const ops = body.ops || [];
    // los archivos se suben una vez (son por contenido)
    const blobs = [];
    for (const a of assets) { const b = await json("/git/blobs", { method: "POST", body: JSON.stringify({ content: a.b64, encoding: "base64" }) }); blobs.push({ path: `a/${a.id}.${a.ext}`, mode: "100644", type: "blob", sha: b.sha, id: a.id, ext: a.ext }); }
    for (let intento = 0; intento < 5; intento++) {
      const ref = await cabeza();
      const base = (await json(`/git/commits/${ref}`)).tree.sha;
      const data = await leer(ref); delete data._commit;
      data.ext = data.ext || {};
      blobs.forEach(b => data.ext[b.id] = b.ext);
      aplicar(data, ops);
      const tree = blobs.map(({ path, mode, type, sha }) => ({ path, mode, type, sha }));
      tree.push({ path: "data.json", mode: "100644", type: "blob", content: JSON.stringify(data) });
      const t = await json("/git/trees", { method: "POST", body: JSON.stringify({ base_tree: base, tree }) });
      const n = ops.length, m = blobs.length;
      const msg = `[skip netlify] Web: ${[n && n + (n === 1 ? " cambio" : " cambios"), m && m + (m === 1 ? " archivo" : " archivos")].filter(Boolean).join(" y ")}`;
      const c = await json("/git/commits", { method: "POST", body: JSON.stringify({ message: msg, tree: t.sha, parents: [ref] }) });
      try { await gh(`/git/refs/heads/${BR}`, { method: "PATCH", body: JSON.stringify({ sha: c.sha, force: false }) }); return Response.json({ ok: true, commit: c.sha }); }
      catch (e) { if (e.status !== 422) throw e; } // alguien escribió a la vez: reintento sobre lo último
    }
    return new Response("Conflicto al guardar, prueba otra vez", { status: 409 });
  } catch (e) { return new Response(String(e.message || e), { status: 502 }); }
};
