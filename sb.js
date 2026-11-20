/* Base nueva (Supabase) – sesión compartida por la app y sus pantallas (indicadores.html, entradas.html).
   Sin librerías: unas pocas llamadas HTTP. La sesión se abre al entrar con Google (app.js) y se guarda en
   localStorage 'guival_sb' = {at: token de acceso, exp: vence (ms), rt: token para renovarlo}. */
(function(){
  const CFG = window.GUIVAL_CONFIG || {};
  const leer = () => { try { return JSON.parse(localStorage.getItem('guival_sb') || 'null'); } catch(e){ return null; } };
  const guardar = d => { try { localStorage.setItem('guival_sb', JSON.stringify({ at: d.access_token, rt: d.refresh_token, exp: Date.now() + (d.expires_in || 3600) * 1000 })); } catch(e){} };
  let renovando = null;

  async function token(){
    const s = leer();
    if (!s || !s.rt || !CFG.SB_URL) return null;
    if (s.at && s.exp - Date.now() > 60000) return s.at;
    if (!renovando) renovando = (async () => {
      try {
        const r = await fetch(CFG.SB_URL + '/auth/v1/token?grant_type=refresh_token', { method:'POST',
          headers:{ 'Content-Type':'application/json', apikey: CFG.SB_KEY }, body: JSON.stringify({ refresh_token: s.rt }) });
        const d = await r.json();
        if (!d.access_token){ const otra = leer(); if (otra && otra.at && otra.exp - Date.now() > 60000) return otra.at; return null; }   // otra pestaña ya la renovó
        guardar(d); return d.access_token;
      } catch(e){ return null; } finally { setTimeout(() => renovando = null, 0); }
    })();
    return renovando;
  }

  async function rpc(fn, body){
    const at = await token();
    if (!at) throw new Error('SIN_SESION');
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 30000);
    try {
      const r = await fetch(CFG.SB_URL + '/rest/v1/rpc/' + fn, { method:'POST', signal: ctl.signal,
        headers:{ 'Content-Type':'application/json', apikey: CFG.SB_KEY, Authorization: 'Bearer ' + at }, body: JSON.stringify(body || {}) });
      const t = await r.text();
      if (r.status === 401) throw new Error('SIN_SESION');
      if (!r.ok){ let m = ''; try { m = JSON.parse(t).message || ''; } catch(e){} throw new Error(m || ('La base de datos respondió ' + r.status + '. Intente de nuevo.')); }
      return t ? JSON.parse(t) : null;
    } catch(e){
      if (e.name === 'AbortError') throw new Error('La base de datos no respondió. Revise la conexión e intente de nuevo.');
      throw e;
    } finally { clearTimeout(to); }
  }

  window.GuivalSB = { tiene: () => !!(leer() || {}).rt, token, rpc, guardar, salir: () => { try { localStorage.removeItem('guival_sb'); } catch(e){} } };
})();
