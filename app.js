/* App Guival – cliente */
(function(){
const CFG = window.GUIVAL_CONFIG || {};
const DEMO = !CFG.API_URL;

/* ---------- íconos ---------- */
const S = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const I = {
  ventas:S('<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>'),
  cartera:S('<rect x="2" y="6" width="20" height="13" rx="2"/><path d="M16 12h2M2 10h20"/>'),
  despachos:S('<path d="M1 6h13v10H1z"/><path d="M14 9h4l3 3v4h-7"/><circle cx="5.5" cy="18" r="2"/><circle cx="17.5" cy="18" r="2"/>'),
  marketing:S('<path d="M3 11v2a1 1 0 001 1h3l5 4V6L7 10H4a1 1 0 00-1 1z"/><path d="M16 8a5 5 0 010 8M19 5a9 9 0 010 14"/>'),
  inventario:S('<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>'),
  admin:S('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
  indicadores:S('<circle cx="12" cy="12" r="9"/><path d="M12 12l4-4M12 7v1M7 12h1M16 12h1"/>'),
  dash:S('<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>'),
  pedido:S('<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a2 2 0 002 1.6h8.6a2 2 0 002-1.6L22 7H6"/>'),
  ruta:S('<path d="M12 21s-7-6.2-7-11a7 7 0 1114 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
  doc:S('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>'),
  recibo:S('<path d="M5 2h14v20l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/>'),
  users:S('<circle cx="9" cy="8" r="4"/><path d="M1 21v-1a6 6 0 0112 0v1M16 4a4 4 0 010 8M23 21v-1a6 6 0 00-4-5.6"/>'),
  lock:S('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>'),
  plus:S('<path d="M12 5v14M5 12h14"/>'),
  compras:S('<path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 01-8 0"/>'),
  contable:S('<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h2M14 10h2M8 14h2M14 14h2M8 18h2M14 18h2"/>'),
  gestion:S('<circle cx="12" cy="7" r="4"/><path d="M5.5 21a6.5 6.5 0 0113 0"/><path d="M19 8h4M21 6v4"/>'),
  modulo:S('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>')
};
const TEMAS = {
  ab:{nombre:'Azul y blanco',    bar:'#001f60', ic:'#001f60', fg:'#fff',    soft:'#e8edf7', acc:'transparent'},
  vb:{nombre:'Verde y blanco',   bar:'#006634', ic:'#006634', fg:'#fff',    soft:'#e4f2ea', acc:'transparent'},
  aa:{nombre:'Azul y amarillo',  bar:'#001f60', ic:'#fdcc00', fg:'#001f60', soft:'#fff6d1', acc:'#fdcc00'},
  va:{nombre:'Verde y amarillo', bar:'#006634', ic:'#fdcc00', fg:'#006634', soft:'#fff6d1', acc:'#fdcc00'}
};
const ESTADO = {listo:['Lista','ok'], prototipo:['Prototipo','adm'], construccion:['En construcción','warn'], idea:['Próximamente','']};
const NIVEL = ['Sin acceso','Ver','Usar','Administrar'];
const ALC = {propio:'Solo lo suyo', grupo:'Su equipo', todo:'Toda la empresa'};
const esc = s => String(s==null?'':s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const $app = document.getElementById('app');

/* ---------- almacenamiento (solo el token de sesión; si se pierde, se vuelve a entrar con Google) ---------- */
const store = {
  get(){ try { return localStorage.getItem('guival_token'); } catch(e){ return null; } },
  set(t){ try { t ? localStorage.setItem('guival_token', t) : localStorage.removeItem('guival_token'); } catch(e){} }
};

/* ---------- servidor ---------- */
async function api(action, payload){
  const body = Object.assign({action, token: state.token}, payload||{});
  let res;
  if (DEMO) res = await window.GuivalMock.call(body);
  else {
    // Si el servidor de Google está ocupado o falla la red, reintenta 2 veces (1,5 s y 3 s) antes de avisar.
    for (let intento = 0; ; intento++){
      try {
        const ctl = new AbortController(), to = setTimeout(()=>ctl.abort(), 45000);   // nunca esperar más de 45 s
        const r = await fetch(CFG.API_URL, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify(body), signal: ctl.signal}).finally(()=>clearTimeout(to));
        res = await r.json();
        break;
      } catch(e){
        if (intento >= 2) throw new Error('El servidor está ocupado o no hay conexión. Intente de nuevo en un momento.');
        await new Promise(ok => setTimeout(ok, 1500 * (intento + 1)));
      }
    }
  }
  if (!res.ok){
    if (res.error === 'SESION'){ store.set(null); state.token=null; state.perfil=null; render(); }
    throw new Error(res.error);
  }
  return res.data;
}

/* ---------- estado ---------- */
const state = { token: store.get(), perfil:null, view:{name:'home'}, admin:null, verComo:null, loginError:'', busy:false };
const perfilActivo = () => state.verComo || state.perfil;

function setTema(k){
  const t = TEMAS[k]||TEMAS.ab, r = document.documentElement.style;
  r.setProperty('--brand',t.bar); r.setProperty('--brand2',t.bar); r.setProperty('--ok',t.bar); r.setProperty('--soft',t.soft); r.setProperty('--acc',t.acc);
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', t.bar);
}
function go(v){ state.view = v; render(); window.scrollTo(0,0); }

function barra(title, back){
  const p = perfilActivo();
  const as = p.asistente ? asis() : null;
  const who = as ? `<b>${esc(as.persona||'Asistente')}</b>${as.nombre?'por '+esc(as.nombre):'Asistente de ventas'}`
                 : `<b>${esc(String(p.usuario.nombre).split(' ')[0])}</b>${esc(p.usuario.grupos[0]||'')}`;
  return `${state.verComo?`<div class="banner"><span>Viendo como <b>${esc(state.verComo.usuario.nombre)}</b></span><button class="btn ghost" data-salirver style="padding:4px 10px;font-size:12px">Salir</button></div>`:''}
  <div class="top">${back?`<button class="back" data-back aria-label="Volver">‹</button>`:`<div class="mk"><img src="data:image/png;base64,${LOGO.DMARK}" alt="Guival"></div>`}
    <h1>${esc(title)}</h1>
    <div class="who">${who}</div></div>`;
}

/* ---------- asistente de ventas: quién trabaja y por cuál vendedor ---------- */
const PERSONAS = ['Sandra Cárdenas', 'Karen Peña'];
const ls = { get(k){ try { return localStorage.getItem(k)||''; } catch(e){ return ''; } }, set(k,v){ try { localStorage.setItem(k,v); } catch(e){} } };
function asis(){
  const p = perfilActivo(), lista = p.asistente||[];
  const como = ls.get('guival_como'), v = lista.find(x=>x.clave===como);
  return { persona: ls.get('guival_persona'), como: v?v.clave:'', nombre: v?v.nombre:'' };
}
function asistenteHtml(){
  const p = perfilActivo(); if (!p.asistente) return '';
  const a = asis(), otra = a.persona && !PERSONAS.includes(a.persona);
  return `<div class="card asis"><b>Asistente de ventas</b>
    <p>Todo lo que haga queda a nombre del vendedor, con la marca de quién lo registró.</p>
    <div class="asg">
      <label>¿Quién está trabajando?<select data-asper>
        <option value="">— Escoja —</option>${PERSONAS.map(n=>`<option ${a.persona===n?'selected':''}>${esc(n)}</option>`).join('')}
        <option value="__otra" ${otra?'selected':''}>Otra persona…</option></select></label>
      ${otra || state.asOtra ? `<label>Nombre<input type="text" id="asotra" value="${otra?esc(a.persona):''}" placeholder="Nombre y apellido" maxlength="40"></label>` : ''}
      <label>Vendedor<select data-ascomo><option value="">— Escoja el vendedor —</option>${p.asistente.map(v=>`<option value="${esc(v.clave)}" ${a.como===v.clave?'selected':''}>${esc(v.nombre)}</option>`).join('')}</select></label>
    </div>
    ${a.persona && a.como ? `<div class="ok">Trabajando: <b>${esc(a.persona)}</b> por <b>${esc(a.nombre)}</b></div>` : `<div class="falta">Escoja quién trabaja y el vendedor antes de abrir una herramienta.</div>`}
  </div>`;
}

/* ---------- ingreso ---------- */
function renderLogin(){
  setTema('ab');
  $app.innerHTML = `<div class="login"><div class="box">
    <div class="logos"><img src="data:image/png;base64,${LOGO.GUIVAL}" alt="Distribuidora Guival"><img src="data:image/png;base64,${LOGO.LINCE}" alt="Lince Distribuciones"></div>
    <p>Ingrese con su cuenta de Google</p>
    ${DEMO ? `<div id="demo"></div><div class="note">Modo demostración: sin servidor configurado. Escoja una cuenta de prueba.</div>` : `<div class="gbtn" id="gbtn"><div class="spin" style="margin:6px auto"></div></div>`}
    ${state.loginError?`<div class="err">${esc(state.loginError)}</div>`:''}
    ${instalarHtml()}
  </div></div>`;
  if (DEMO){
    document.getElementById('demo').innerHTML = window.GuivalMock.cuentas().map(c=>
      `<button class="ubtn" data-demo="${esc(c.correo)}"><div class="av">${esc(c.nombre[0])}</div><div><b>${esc(c.nombre)}</b><small>${esc(c.correo)}</small></div></button>`).join('');
  } else cargarGoogle();
}
/* ---------- base nueva (Supabase): con el mismo ingreso de Google abre también su sesión, en silencio ----------
   Sin librerías (app liviana): dos llamadas HTTP. Si falla, la app sigue igual con el servidor actual. */
const sb = {
  nonce: '',
  async hash(t){ const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''); },
  async preparar(){ try { this.nonce = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)+Date.now()); return await this.hash(this.nonce); } catch(e){ this.nonce=''; return undefined; } },
  async entrar(credential){
    if (!CFG.SB_URL || !credential) return;
    try {
      const r = await fetch(CFG.SB_URL + '/auth/v1/token?grant_type=id_token', { method:'POST',
        headers:{ 'Content-Type':'application/json', apikey: CFG.SB_KEY },
        body: JSON.stringify(Object.assign({ provider:'google', id_token: credential }, this.nonce ? { nonce: this.nonce } : {})) });
      const d = await r.json(); if (!d.access_token) return;
      window.GuivalSB && GuivalSB.guardar(d);
      await fetch(CFG.SB_URL + '/rest/v1/rpc/vincular', { method:'POST',
        headers:{ 'Content-Type':'application/json', apikey: CFG.SB_KEY, Authorization: 'Bearer ' + d.access_token }, body:'{}' });
    } catch(e){ /* la base nueva todavía es opcional */ }
  },
  salir(){ window.GuivalSB && GuivalSB.salir(); }
};

function cargarGoogle(){
  const pintar = async () => {
    const nonce = await sb.preparar();
    google.accounts.id.initialize(Object.assign({ client_id: CFG.GOOGLE_CLIENT_ID, callback: r => entrar(r.credential), ux_mode:'popup', auto_select:false }, nonce ? { nonce } : {}));
    const el = document.getElementById('gbtn'); if (!el) return;
    el.innerHTML = '';
    google.accounts.id.renderButton(el, {theme:'filled_blue', size:'large', shape:'pill', text:'continue_with', locale:'es', width: 280});
  };
  if (window.google && google.accounts) return pintar();
  const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = pintar;
  s.onerror = () => { state.loginError = 'No se pudo cargar el ingreso de Google. Revise la conexión.'; renderLogin(); };
  document.head.appendChild(s);
}
async function entrar(credential){
  state.loginError=''; $app.innerHTML = '<div class="spin"></div>';
  try {
    const d = await api('login', {credential});
    state.token = d.token; store.set(d.token); state.perfil = d.perfil; go({name:'home'});
    sb.entrar(credential);   // en segundo plano; no hace esperar al usuario
  } catch(e){
    let correo = '';
    try { correo = JSON.parse(decodeURIComponent(escape(atob(credential.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))))).email || ''; } catch(_){}
    state.loginError = e.message==='NO_AUTORIZADO'
      ? `La cuenta ${correo||'de Google'} todavía no está habilitada. Su solicitud quedó registrada: cuando la gerencia de ventas la active, vuelva a entrar.`
      : 'No se pudo ingresar: '+e.message;
    renderLogin();
  }
}

/* ---------- instalación ---------- */
let promptInstalar = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); promptInstalar = e; render(); });
const enApp = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
function instalarHtml(){
  if (enApp()) return '';
  if (promptInstalar) return `<div class="inst"><button class="btn" data-instalar>Instalar la app en este equipo</button></div>`;
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return `<div class="inst">Para instalarla en iPhone: abra esta página en <b>Safari</b> → botón Compartir → <b>Agregar a inicio</b>.</div>`;
  return '';
}

/* ---------- inicio ---------- */
function renderHome(){
  setTema('ab');
  const p = perfilActivo();
  const mods = p.modulos.map(m=>({...m, tools:p.herramientas.filter(t=>t.modulo===m.id)}));
  const h = new Date().getHours(), saludo = h<12?'Buenos días':h<19?'Buenas tardes':'Buenas noches';
  $app.innerHTML = barra('Guival · Lince') + `<div class="wrap">
    <div class="hello"><h2>${saludo}, ${esc(String(p.asistente?(asis().persona||'equipo'):p.usuario.nombre).split(' ')[0])}</h2>
    <p>${p.asistente?'Asistente de ventas':'Alcance: '+(ALC[p.alcance]||p.alcance)}</p></div>
    ${asistenteHtml()}
    <div class="grid">
    ${mods.map(m=>{
      const admin = m.tools.some(t=>t.nivel===3);
      return `<button class="mod" data-mod="${esc(m.id)}">${admin?'<span class="pill adm">Admin</span>':''}
        <div class="ic" style="background:#001f60;color:#fff">${I[m.icono||m.id]||I.modulo}</div><span>${esc(m.nombre)}</span>
        <small>${m.tools.length} herramienta${m.tools.length!==1?'s':''}</small></button>`;}).join('')}
    ${p.usuario.superadmin && !state.verComo ? Array.from({length:Math.max(0,(p.maxModulos||9)-mods.length)},()=>`<button class="mod empty" data-tool="modulos"><span style="font-weight:500">+ Espacio libre</span></button>`).join('') : ''}
    </div>
    ${mods.length===0?'<div class="note">Todavía no tiene herramientas asignadas. Pida acceso a la gerencia de ventas.</div>':''}
    ${instalarHtml()}
    <div class="out"><button class="btn ghost" data-logout>Cerrar sesión</button></div>
  </div>`;
}

function modulo(id){ return perfilActivo().modulos.find(m=>m.id===id); }
function renderModulo(id){
  const p = perfilActivo(), m = modulo(id);
  if (!m) return go({name:'home'});
  const T = TEMAS[m.tema]||TEMAS.ab;
  setTema(m.tema);
  const tools = p.herramientas.filter(t=>t.modulo===id);
  $app.innerHTML = barra(m.nombre, true) + `<div class="wrap"><div class="list">
    ${tools.map(t=>{
      const [el,ec] = ESTADO[t.estado]||ESTADO.idea, off = t.estado==='idea';
      return `<button class="tool" data-tool="${esc(t.id)}">
        <div class="ic" style="background:${off?'#c3cad6':T.ic};color:${off?'#fff':T.fg}">${I[t.icono]||I.modulo}</div>
        <div class="tx"><b>${esc(t.nombre)}</b><p>${esc(t.descripcion)}</p></div>
        <div class="meta"><span class="pill ${ec}">${el}</span><span class="pill">${NIVEL[t.nivel]}</span></div></button>`;}).join('')}
    ${tools.length?'':'<div class="note">Este módulo todavía no tiene herramientas.</div>'}
  </div></div>`;
}

/* ---------- herramientas ---------- */
const PANTALLAS = {};
function renderTool(id){
  const p = perfilActivo(), t = p.herramientas.find(x=>x.id===id);
  if (!t) return go({name:'home'});
  const m = modulo(t.modulo) || {tema:'ab'};
  setTema(m.tema);
  if (PANTALLAS[t.interna] && t.estado!=='idea' && t.estado!=='construccion') return PANTALLAS[t.interna](t);
  $app.innerHTML = barra(t.nombre, true) + `<div class="wrap"><div class="card">
    <b>${t.estado==='idea'?'Próximamente':'En construcción'}</b>
    <p style="color:var(--mute);margin:6px 0 0">${esc(t.descripcion)}</p>
    <p style="color:var(--mute);font-size:13px">Esta herramienta se está pasando a la app. Cuando esté lista aparece aquí, sin reinstalar nada.</p></div></div>`;
}

async function cargarAdmin(force){
  if (!state.admin || force){ $app.innerHTML = barra('Administración', true) + '<div class="spin"></div>'; state.admin = await api('admin.get'); }
  return state.admin;
}
async function adminAccion(action, payload, okMsg){
  state.busy = true;
  try { state.admin = await api(action, payload); state.perfil = await api('me'); render(); if (okMsg) aviso(okMsg); }
  catch(e){ aviso('No se pudo guardar: '+e.message, true); }
  finally { state.busy=false; }
}
function aviso(msg, err){
  let el = document.getElementById('aviso');
  if (!el){ el = document.createElement('div'); el.id='aviso'; el.style.cssText='position:fixed;left:50%;bottom:calc(18px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);padding:10px 16px;border-radius:10px;font-size:13.5px;z-index:20;max-width:90vw;box-shadow:0 4px 14px rgba(0,0,0,.15)'; document.body.appendChild(el); }
  el.style.background = err?'#fdecea':'#0d1b3a'; el.style.color = err?'#b42318':'#fff'; el.textContent = msg; el.style.display='block';
  clearTimeout(el._t); el._t = setTimeout(()=>el.style.display='none', 3500);
}
const nivelDe = id => (perfilActivo().herramientas.find(t=>t.id===id)||{nivel:0}).nivel;
const chip = k => `<span class="chip"><i style="background:${TEMAS[k].bar}"></i><i style="background:${TEMAS[k].ic==TEMAS[k].bar?'#fff':TEMAS[k].ic}"></i></span>`;

PANTALLAS.externa = async t => {
  $app.innerHTML = barra(t.nombre, true) + '<div class="spin"></div>';
  let url;
  const extra = {};
  if (perfilActivo().asistente){
    const a = asis();
    if (!a.persona || !a.como){ $app.innerHTML = barra(t.nombre, true) + `<div class="wrap"><div class="note">Antes de abrir, escoja en Inicio quién está trabajando y por cuál vendedor.</div><div class="out"><button class="btn" data-home>Ir a Inicio</button></div></div>`; return; }
    extra.persona = a.persona; extra.como = a.como;
  }
  if (t.id==='dashboard' && !DEMO){   // Dashboard: pantalla propia de la app (datos por el servidor de la app, caché en el equipo)
    $app.innerHTML = barra(t.nombre, true) + `<iframe src="dashboard.html?v=5" title="${esc(t.nombre)}" class="embed"></iframe>`; return;
  }
  // Indicadores y Entradas: pantallas propias que leen de la base nueva (Supabase). Si la persona todavía no tiene
  // sesión en la base nueva (entró antes del cambio) o el administrador está en "Ver como", se abre la pantalla anterior.
  const NUEVAS = { indicadores:'indicadores.html?v=1', ingresos:'entradas.html?v=1', recibo:'cartera.html?v=4' };
  // El Informe de Cartera ya solo existe en la base nueva: sin sesión nueva no se abre el anterior (quedaría en dos sitios).
  if (t.id === 'recibo' && !DEMO && !(window.GuivalSB && GuivalSB.tiene())){
    $app.innerHTML = barra(t.nombre, true) + `<div class="wrap"><div class="card"><b>Falta un paso</b><p>El Informe de Cartera cambió a la versión nueva. Para abrirlo, cierre sesión y vuelva a entrar con su cuenta de Google (solo una vez).</p><button class="btn" data-logout>Cerrar sesión y volver a entrar</button></div></div>`; return;
  }
  if (NUEVAS[t.id] && !DEMO && (!state.verComo || t.id === 'recibo') && window.GuivalSB && GuivalSB.tiene()){
    $app.innerHTML = barra(t.nombre, true) + `<iframe src="${NUEVAS[t.id]}" title="${esc(t.nombre)}" class="embed"></iframe>`; return;
  }
  try { url = (await api('abrir', {herramienta: t.id, ...extra})).url; }
  catch(e){ $app.innerHTML = barra(t.nombre, true) + `<div class="wrap"><div class="note">${esc(e.message)}</div></div>`; return; }
  if (DEMO){ $app.innerHTML = barra(t.nombre, true) + `<div class="wrap"><div class="card"><b>${esc(t.nombre)}</b><p style="color:var(--mute)">En la app real aquí se abre la pantalla que ya usan hoy, dentro de la app y sin enlace, PIN ni registro de celular.</p><p style="font-size:12px;color:var(--mute);word-break:break-all">${esc(url)}</p></div></div>`; return; }
  $app.innerHTML = barra(t.nombre, true) + `<iframe src="${esc(url)}" title="${esc(t.nombre)}" class="embed" allow="clipboard-write"></iframe>`;
};

PANTALLAS.modulos = async t => {
  const A = await cargarAdmin(); const puede = nivelDe('modulos')>=3 && !state.verComo;
  const max = perfilActivo().maxModulos||9, mods = A.modulos;
  $app.innerHTML = barra('Módulos', true) + `<div class="wrap">
    <p style="color:var(--mute);font-size:13px;margin-top:0">Inicio de 3×3: máximo ${max} módulos. Hay ${mods.length}; quedan ${max-mods.length} espacios.</p>
    <div class="list">${mods.map((m,i)=>{
      const n = A.herramientas.filter(h=>h.modulo===m.id).length, fijo = /^(si|true|1)$/i.test(String(m.fijo));
      return `<div class="tool"><div class="ic" style="background:#001f60;color:#fff">${I[m.id]||I.modulo}</div>
        <div class="tx"><b>${esc(m.nombre)}</b><p>${chip(m.tema)} ${TEMAS[m.tema].nombre} · ${n} herramienta${n!==1?'s':''}${fijo?' · fijo':''}</p></div>
        ${puede?`<div class="row">
          <button class="btn ghost" data-mmove="${i}|-1" ${i===0?'disabled':''} aria-label="Subir">↑</button>
          <button class="btn ghost" data-mmove="${i}|1" ${i===mods.length-1?'disabled':''} aria-label="Bajar">↓</button>
          ${fijo?'':`<button class="btn ghost" data-mdel="${esc(m.id)}" style="color:#b42318">Eliminar</button>`}</div>`:''}
      </div>`;}).join('')}</div>
    ${puede?`<div class="sec">Crear módulo</div><div class="card">${mods.length>=max?`<p style="margin:0;color:var(--mute)">Ya están los ${max} espacios ocupados.</p>`:`
      <input type="text" id="mnom" placeholder="Nombre (ej. Compras)" maxlength="18">
      <div class="row" style="margin:10px 0">${Object.keys(TEMAS).map((k,i)=>`<span class="swatch ${i===0?'on':''}" data-mtema="${k}" title="${TEMAS[k].nombre}" style="width:44px;background:linear-gradient(90deg,${TEMAS[k].bar} 50%,${TEMAS[k].ic==TEMAS[k].bar?'#fff':TEMAS[k].ic} 50%)"></span>`).join('')}</div>
      <button class="btn" data-madd>Crear módulo</button>`}</div>`:''}
    <div class="note">Al eliminar un módulo sus herramientas no se borran: quedan sin módulo en el Catálogo para pasarlas a otro.</div>
  </div>`;
};

/* ---------- usuarios (18/11): ficha clara por persona, módulos ✓/✗, roles, retirados ---------- */
const ESTADOS = { SI:['Activo','on'], NO:['Inactivo','off'], RETIRADO:['Retirado','ret'] };
const estadoDe = u => /^(si|sí|true|1)$/i.test(String(u.activo)) ? 'SI' : /^retirad/i.test(String(u.activo)) ? 'RETIRADO' : 'NO';
const extraDe = u => { try { return u.permisos_extra ? (typeof u.permisos_extra==='string' ? JSON.parse(u.permisos_extra) : {...u.permisos_extra}) : {}; } catch(e){ return {}; } };
const gruposDe = u => String(u.grupos||'').split(',').map(s=>s.trim()).filter(Boolean);
/** Nivel por herramienta según roles + permisos personales (igual que el servidor). */
function nivelesDe(A, grupos, extra){
  const n = {};
  A.herramientas.forEach(h=>n[h.id]=0);
  if (grupos.includes('superadmin')){ A.herramientas.forEach(h=>n[h.id]=3); return n; }
  A.permisos.forEach(p=>{ if (grupos.includes(String(p.grupo))) n[p.herramienta] = Math.max(n[p.herramienta]||0, Number(p.nivel)||0); });
  Object.keys(extra||{}).forEach(k=>{ const v = Number(extra[k]); if (!isNaN(v)) n[k] = Math.max(0, Math.min(3, v)); });
  return n;
}
const modsDe = (A, n) => A.modulos.map(m=>({...m, on: A.herramientas.some(h=>h.modulo===m.id && n[h.id]>0)}));
const vendedorDe = (A, clave) => { const a = (A.accesos||[]).find(x=>String(x.clave)===String(clave)); return a ? String(a.vendedor||'') : ''; };

PANTALLAS.usuarios = async t => {
  const A = await cargarAdmin(); const puede = nivelDe('usuarios')>=3 && !state.verComo;
  const f = state.filtroU||'', fe = state.filtroE||'activos';
  const gname = id => (A.grupos.find(g=>g.id===id)||{nombre:id}).nombre;
  const cuenta = {activos:0, pendientes:0, inactivos:0, retirados:0, todos:A.usuarios.length};
  const tipo = u => { const e = estadoDe(u); return e==='RETIRADO'?'retirados': /@llenar$/.test(u.correo)?'pendientes': e==='SI'?'activos':'inactivos'; };
  A.usuarios.forEach(u=>cuenta[tipo(u)]++);
  const lista = A.usuarios.filter(u=>(fe==='todos'||tipo(u)===fe) && (!f || (u.nombre+' '+u.correo+' '+u.grupos).toLowerCase().includes(f.toLowerCase())))
    .sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre)));
  const ETQ = {activos:'Activos', pendientes:'Sin correo', inactivos:'Inactivos', retirados:'Retirados', todos:'Todos'};
  $app.innerHTML = barra('Usuarios', true) + `<div class="wrap">
    <div class="row" style="gap:10px;align-items:stretch"><input type="text" id="fusr" placeholder="Buscar por nombre, correo o rol" value="${esc(f)}" style="flex:1 1 240px">
      ${puede?`<button class="btn" data-uedit="">+ Nuevo usuario</button>`:''}</div>
    <div class="tabs" style="margin:12px 0">${Object.keys(ETQ).map(k=>`<button class="${fe===k?'on':''}" data-fest="${k}">${ETQ[k]} (${cuenta[k]})</button>`).join('')}</div>
    <div class="list ulist">${lista.map(u=>{
      const e = estadoDe(u), gs = gruposDe(u), mods = modsDe(A, nivelesDe(A, gs, extraDe(u))), pend = /@llenar$/.test(u.correo), vend = vendedorDe(A, u.clave);
      return `<button class="ucard" data-uedit="${esc(u.correo)}">
        <div class="uh"><div><b>${esc(u.nombre)}</b><small style="color:${pend?'#b42318':'var(--mute)'}">${pend?'Falta correo de Google':esc(u.correo)}</small></div><span class="est ${ESTADOS[e][1]}">${ESTADOS[e][0]}</span></div>
        <div class="roles">${gs.map(g=>`<span class="pill">${esc(gname(g))}</span>`).join('')}${vend?`<span class="pill v">Vendedor: ${esc(vend)}</span>`:''}</div>
        <div class="mchips">${mods.map(m=>`<span class="mc ${m.on?'on':'off'}">${m.on?'✓':'✗'} ${esc(m.nombre)}</span>`).join('')}</div>
      </button>`;}).join('') || '<div class="note">No hay usuarios en esta lista.</div>'}</div>
    ${puede ? (()=>{
      const conocidos = new Set(A.usuarios.map(u=>String(u.correo).toLowerCase()));
      const sol = [...new Set(A.bitacora.filter(b=>b.accion==='ingreso_rechazado').map(b=>String(b.correo).toLowerCase()))].filter(c=>!conocidos.has(c));
      const pend = A.usuarios.filter(u=>estadoDe(u)==='NO').sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre)));
      if (!sol.length) return '';
      return `<div class="sec">Solicitudes de ingreso (${sol.length})</div><div class="card"><p style="margin:0 0 10px;font-size:13px;color:var(--mute)">Personas que intentaron entrar y aún no están habilitadas. Escoja a quién corresponde el correo y toque Activar. Si la persona no está en la lista, créela con "+ Nuevo usuario".</p>
        ${sol.map((c,i)=>`<div class="row" style="margin-bottom:10px;align-items:center"><b style="flex:1 1 200px;word-break:break-all">${esc(c)}</b>
          <select id="sol${i}" style="flex:1 1 180px;padding:7px"><option value="">— ¿Quién es? —</option>${pend.map(u=>`<option value="${esc(u.correo)}">${esc(u.nombre)}</option>`).join('')}</select>
          <button class="btn" data-solicitud="${esc(c)}" data-sel="sol${i}">Activar</button></div>`).join('')}</div>`;
    })() : ''}
    <div class="note">Activo: entra a la app. Inactivo: no entra por ahora. Retirado: ya no trabaja; no entra a la app, pero sus ventas, facturas y cartera siguen apareciendo en todos los reportes.</div>
    ${perfilActivo().usuario.superadmin && !state.verComo ? `<div class="sec">Enlaces viejos</div><div class="card">
      <p style="margin:0 0 10px">${A.soloApp?'<b>Apagados.</b> Solo se entra por la app. No los vuelva a activar.':'<b>Todavía funcionan.</b> Apáguelos cuando todos tengan su correo cargado.'}</p>
      <button class="btn ${A.soloApp?'ghost':''}" data-soloapp="${A.soloApp?'0':'1'}">${A.soloApp?'Volver a activar enlaces':'Apagar enlaces viejos'}</button></div>`:''}
  </div>`;
};

PANTALLAS.usuarioEdit = async () => {
  const A = await cargarAdmin(), c = state.view.correo, puede = nivelDe('usuarios')>=3 && !state.verComo;
  if (!state.draft || state.draft._de !== c){
    const u = A.usuarios.find(x=>x.correo===c) || {correo:'',nombre:'',cargo:'',clave:'',grupos:'mayoristas',activo:'SI',permisos_extra:''};
    state.draft = { _de:c, correo:/@llenar$/.test(u.correo)?'':u.correo, nombre:u.nombre, cargo:u.cargo, clave:String(u.clave||''), grupos:gruposDe(u), estado:estadoDe(u), extra:extraDe(u), abiertos:{} };
  }
  const d = state.draft, n = nivelesDe(A, d.grupos, d.extra), base = nivelesDe(A, d.grupos, {}), sup = d.grupos.includes('superadmin');
  const dis = puede ? '' : 'disabled';
  $app.innerHTML = barra(c?d.nombre||'Usuario':'Nuevo usuario', true) + `<div class="wrap ficha">
    <div class="card">
      <div class="seg">${Object.keys(ESTADOS).map(k=>`<button class="${d.estado===k?'on '+ESTADOS[k][1]:''}" data-uest="${k}" ${dis}>${ESTADOS[k][0]}</button>`).join('')}</div>
      <p class="hint">${d.estado==='SI'?'Entra a la app con su correo de Google.':d.estado==='NO'?'No entra a la app por ahora.':'Ya no trabaja: no entra a la app, pero sus ventas, facturas y cartera siguen en todos los reportes.'}</p>
      <div class="campos">
        <label>Correo de Google<input type="text" id="ucorreo" data-ud="correo" value="${esc(d.correo)}" placeholder="nombre@gmail.com" inputmode="email" autocapitalize="off" ${dis}></label>
        <label>Nombre<input type="text" id="unombre" data-ud="nombre" value="${esc(d.nombre)}" ${dis}></label>
        <label>Cargo<input type="text" id="ucargo" data-ud="cargo" value="${esc(d.cargo)}" ${dis}></label>
        <label>Vendedor (qué ventas y cartera ve)<select id="uclave" data-ud="clave" ${dis}><option value="">— Ninguno —</option>${(A.accesos||[]).map(a=>`<option value="${esc(a.clave)}" ${String(a.clave)===d.clave?'selected':''}>${esc(a.nombre)}${a.vendedor?' · '+esc(a.vendedor):' · '+esc(a.ve)}</option>`).join('')}</select></label>
      </div>
    </div>
    <div class="sec">Roles</div>
    <div class="card"><div class="row">${A.grupos.map(g=>`<label class="rchip ${d.grupos.includes(g.id)?'on':''}"><input type="checkbox" data-ug value="${esc(g.id)}" ${d.grupos.includes(g.id)?'checked':''} ${dis}>${esc(g.nombre)}</label>`).join('')}</div>
      <p class="hint" style="margin-bottom:0">El rol da los accesos de base. Abajo puede dar o quitar módulos solo a esta persona.</p></div>
    <div class="sec">Acceso a módulos</div>
    <div class="mlist">${A.modulos.map(m=>{
      const ts = A.herramientas.filter(h=>h.modulo===m.id), on = ts.some(h=>n[h.id]>0), ab = d.abiertos[m.id];
      return `<div class="card mrow ${on?'on':'off'}">
        <div class="mh"><button class="mname" data-mab="${esc(m.id)}"><span class="st">${on?'✓':'✗'}</span><b>${esc(m.nombre)}</b><small>${on?'Con acceso':'Sin acceso'} · ${ts.length} herramienta${ts.length!==1?'s':''} ${ab?'▴':'▾'}</small></button>
          ${puede && !sup ? `<button class="btn ${on?'ghost':''}" data-mtog="${esc(m.id)}">${on?'Quitar':'Dar acceso'}</button>`:''}</div>
        ${ab ? `<div class="tl">${ts.map(h=>{ const pers = h.id in d.extra && Number(d.extra[h.id])!==base[h.id];
          return `<div class="trow"><span>${esc(h.nombre)}${pers?' <i class="pers">personal</i>':''}</span>
            ${puede && !sup ? `<select data-tniv="${esc(h.id)}">${NIVEL.map((l,i)=>`<option value="${i}" ${i===n[h.id]?'selected':''}>${l}</option>`).join('')}</select>` : `<span class="${n[h.id]?'':'lvl0'}">${NIVEL[n[h.id]]}</span>`}</div>`;}).join('') || '<p class="hint">Sin herramientas.</p>'}</div>` : ''}
      </div>`;}).join('')}</div>
    ${sup?'<div class="note">Superadmin: tiene acceso a todo.</div>':''}
    ${puede?`<div class="row acciones"><button class="btn" data-usave="${esc(c)}">Guardar</button>
      ${c && !/@llenar$/.test(c)?`<button class="btn ghost" data-vercomo="${esc(c)}">Ver como</button>`:''}
      ${c && !sup?`<button class="btn ghost" data-udel="${esc(c)}" style="color:#b42318">Eliminar de la app</button>`:''}</div>
      <p class="hint">Eliminar solo borra a la persona de la app. Para alguien que ya no trabaja es mejor "Retirado".</p>`:''}
  </div>`;
};

PANTALLAS.permisos = async t => {
  const A = await cargarAdmin(); const puede = nivelDe('permisos')>=3 && !state.verComo;
  const gs = A.grupos.filter(g=>g.id!=='superadmin');
  const val = (g,h) => { const p = A.permisos.find(x=>x.grupo===g && x.herramienta===h); return p?Number(p.nivel):0; };
  const grupos = [...A.modulos, {id:'', nombre:'Sin módulo'}];
  $app.innerHTML = barra('Permisos', true) + `<div class="wrap">
    <p style="color:var(--mute);font-size:13px;margin-top:0">Nivel de cada grupo en cada herramienta. Cada cambio se guarda al momento y queda en la Bitácora.</p>
    <div class="card scroll"><table><tr><th>Herramienta</th>${gs.map(g=>`<th>${esc(g.nombre)}</th>`).join('')}</tr>
    ${grupos.map(m=>{
      const ts = A.herramientas.filter(h=>(h.modulo||'')===m.id); if(!ts.length) return '';
      return `<tr><td colspan="${gs.length+1}" style="background:#f6f8fa;font-weight:600">${esc(m.nombre)}</td></tr>` +
      ts.map(h=>`<tr><td>${esc(h.nombre)}</td>${gs.map(g=>{const v=val(g.id,h.id);
        return `<td>${puede?`<select data-perm="${esc(g.id)}|${esc(h.id)}">${NIVEL.map((l,i)=>`<option value="${i}" ${i===v?'selected':''}>${l}</option>`).join('')}</select>`:`<span class="${v?'':'lvl0'}">${NIVEL[v]}</span>`}</td>`;}).join('')}</tr>`).join('');
    }).join('')}</table></div>
    <div class="sec">Alcance de cada grupo</div>
    <div class="card scroll"><table>${gs.map(g=>`<tr><td>${esc(g.nombre)}</td><td>${puede?`<select data-galc="${esc(g.id)}">${Object.keys(ALC).map(k=>`<option value="${k}" ${g.alcance===k?'selected':''}>${ALC[k]}</option>`).join('')}</select>`:ALC[g.alcance]}</td></tr>`).join('')}</table></div>
  </div>`;
};

PANTALLAS.catalogo = async t => {
  const A = await cargarAdmin(); const puede = nivelDe('catalogo')>=3 && !state.verComo;
  $app.innerHTML = barra('Catálogo de herramientas', true) + `<div class="wrap">
    <div class="card scroll"><table><tr><th>Herramienta</th><th>Módulo</th><th>Estado</th></tr>
    ${A.herramientas.map(h=>`<tr><td>${esc(h.nombre)}</td>
      <td>${puede?`<select data-tmod="${esc(h.id)}"><option value="">Sin módulo</option>${A.modulos.map(m=>`<option value="${esc(m.id)}" ${m.id===h.modulo?'selected':''}>${esc(m.nombre)}</option>`).join('')}</select>`:esc((A.modulos.find(m=>m.id===h.modulo)||{nombre:'Sin módulo'}).nombre)}</td>
      <td>${puede?`<select data-test="${esc(h.id)}">${Object.keys(ESTADO).map(k=>`<option value="${k}" ${k===h.estado?'selected':''}>${ESTADO[k][0]}</option>`).join('')}</select>`:ESTADO[h.estado][0]}</td></tr>`).join('')}
    </table></div>
    <div class="note">Las herramientas nuevas las agrega Claude al construirlas; aquí se decide en qué módulo van y si ya se muestran.</div>
  </div>`;
};

PANTALLAS.bitacora = async t => {
  const A = await cargarAdmin(true);
  $app.innerHTML = barra('Bitácora', true) + `<div class="wrap"><div class="card scroll"><table><tr><th>Fecha</th><th>Quién</th><th>Qué</th></tr>
    ${A.bitacora.map(b=>`<tr><td style="white-space:nowrap">${esc(String(b.fecha).replace('T',' ').slice(0,16))}</td><td>${esc(b.correo)}</td><td><b>${esc(b.accion)}</b><br><small style="color:var(--mute)">${esc(b.detalle)}</small></td></tr>`).join('')||'<tr><td colspan="3">Sin registros</td></tr>'}
  </table></div></div>`;
};

/* ---------- render ---------- */
async function render(){
  try {
    if (!state.token) return renderLogin();
    if (!state.perfil){ $app.innerHTML = '<div class="spin"></div>'; state.perfil = await api('me'); }
    const v = state.view;
    if (v.name==='home') renderHome();
    else if (v.name==='mod') renderModulo(v.id);
    else if (v.name==='tool') await renderTool(v.id);
    else if (v.name==='usuarioEdit'){ setTema('ab'); await PANTALLAS.usuarioEdit(); }
  } catch(e){
    if (e.message!=='SESION') $app.innerHTML = (state.perfil?barra('Guival', true):'') + `<div class="wrap"><div class="note">No se pudo cargar: ${esc(e.message)}</div><div class="out"><button class="btn" data-reload>Reintentar</button></div></div>`;
  }
}

/* ---------- eventos ---------- */
let temaNuevo = 'ab';
$app.addEventListener('click', async e=>{
  const el = e.target.closest('button,[data-mtema]'); if (!el) return;
  if (state.busy && !('back' in el.dataset) && !('home' in el.dataset)) return;   // mientras guarda, solo se puede volver
  const d = el.dataset;
  if (d.demo){ entrar(window.GuivalMock.credencial(d.demo)); }
  else if (d.mod) go({name:'mod', id:d.mod});
  else if (d.tool) go({name:'tool', id:d.tool});
  else if ('back' in d){
    const v = state.view;
    if (v.name==='usuarioEdit') go({name:'tool', id:'usuarios'});
    else if (v.name==='tool'){ const t = perfilActivo().herramientas.find(x=>x.id===v.id); go(t && t.modulo ? {name:'mod', id:t.modulo} : {name:'home'}); }
    else go({name:'home'});
  }
  else if ('logout' in d){ try { await api('logout'); } catch(_){}; store.set(null); sb.salir(); state.token=null; state.perfil=null; state.admin=null; state.verComo=null; if (window.google&&google.accounts) google.accounts.id.disableAutoSelect(); go({name:'home'}); }
  else if ('instalar' in d){ promptInstalar.prompt(); promptInstalar = null; }
  else if ('reload' in d){ state.perfil=null; render(); }
  else if ('salirver' in d){ state.verComo=null; go({name:'tool', id:'usuarios'}); }
  else if (d.vercomo){ try { state.verComo = await api('verComo', {correo:d.vercomo}); go({name:'home'}); } catch(err){ aviso(err.message,true); } }
  else if (d.mmove){ const [i,dir]=d.mmove.split('|').map(Number); const ids=state.admin.modulos.map(m=>m.id); const [x]=ids.splice(i,1); ids.splice(i+dir,0,x); adminAccion('admin.orderModules',{ids}); }
  else if (d.mdel){ if (!d.confirm){ d.confirm='1'; el.textContent='¿Seguro? Toque otra vez'; return; } adminAccion('admin.deleteModule',{id:d.mdel},'Módulo eliminado'); }
  else if (d.mtema){ temaNuevo=d.mtema; document.querySelectorAll('[data-mtema]').forEach(x=>x.classList.toggle('on',x===el)); }
  else if ('madd' in d){ const nombre=document.getElementById('mnom').value.trim(); if(!nombre) return aviso('Escriba el nombre del módulo',true); adminAccion('admin.saveModule',{modulo:{nombre, tema:temaNuevo}},'Módulo creado'); }
  else if (d.soloapp){ if (!d.confirm){ d.confirm='1'; el.textContent='¿Seguro? Toque otra vez'; return; } adminAccion('admin.setSoloApp',{valor:d.soloapp==='1'}, d.soloapp==='1'?'Enlaces viejos apagados':'Enlaces activados'); }
  else if (d.solicitud){
    const pendCorreo = document.getElementById(d.sel).value;
    if (!pendCorreo) return aviso('Escoja a quién corresponde el correo', true);
    const u = state.admin.usuarios.find(x=>x.correo===pendCorreo);
    await adminAccion('admin.saveUser', {user:{...u, correo:d.solicitud, activo:'SI', _reemplaza:pendCorreo}}, u.nombre+' activado');
  }
  else if ('uedit' in d){ state.draft=null; go({name:'usuarioEdit', correo:d.uedit}); }
  else if (d.fest){ state.filtroE=d.fest; render(); }
  else if ('home' in d){ go({name:'home'}); }
  else if (d.uest){ state.draft.estado=d.uest; render(); }
  else if (d.mab){ const ab=state.draft.abiertos; ab[d.mab]=!ab[d.mab]; render(); }
  else if (d.mtog){
    const A=state.admin, dr=state.draft, ts=A.herramientas.filter(h=>h.modulo===d.mtog);
    const on = ts.some(h=>nivelesDe(A,dr.grupos,dr.extra)[h.id]>0);
    if (on) ts.forEach(h=>dr.extra[h.id]=0);
    else { ts.forEach(h=>delete dr.extra[h.id]); const n=nivelesDe(A,dr.grupos,dr.extra); if (!ts.some(h=>n[h.id]>0)) ts.forEach(h=>dr.extra[h.id]=1); dr.abiertos[d.mtog]=true; }
    render();
  }
  else if ('usave' in d){
    const dr = state.draft;
    const user = { correo:String(dr.correo||'').trim().toLowerCase(), nombre:String(dr.nombre||'').trim(), cargo:String(dr.cargo||'').trim(), clave:dr.clave,
      grupos:dr.grupos.join(','), activo:dr.estado, permisos_extra:Object.keys(dr.extra).length?JSON.stringify(dr.extra):'' };
    if (!user.nombre) return aviso('Escriba el nombre',true);
    if (!user.correo){ if (d.usave && /@llenar$/.test(d.usave)) user.correo=d.usave; else return aviso('Escriba el correo de Google',true); }
    if (d.usave && d.usave!==user.correo) user._reemplaza = d.usave;
    await adminAccion('admin.saveUser',{user},'Usuario guardado'); state.draft=null; go({name:'tool', id:'usuarios'});
  }
  else if (d.udel){ if (!d.confirm){ d.confirm='1'; el.textContent='¿Seguro? Toque otra vez'; return; } await adminAccion('admin.deleteUser',{correo:d.udel},'Usuario eliminado'); state.draft=null; go({name:'tool', id:'usuarios'}); }
});
$app.addEventListener('change', e=>{
  const s = e.target, d = s.dataset;
  if (d.ud){ state.draft[d.ud]=s.value; }
  else if ('ug' in d){ const g=state.draft.grupos, k=s.value; if (s.checked){ if(!g.includes(k)) g.push(k); } else state.draft.grupos=g.filter(x=>x!==k); render(); }
  else if (d.tniv){ const dr=state.draft, A=state.admin, base=nivelesDe(A,dr.grupos,{}); if (+s.value===base[d.tniv]) delete dr.extra[d.tniv]; else dr.extra[d.tniv]=+s.value; render(); }
  else if ('asper' in d){ if (s.value==='__otra'){ state.asOtra=true; ls.set('guival_persona',''); } else { state.asOtra=false; ls.set('guival_persona', s.value); } render(); }
  else if ('ascomo' in d){ ls.set('guival_como', s.value); render(); }
  else if (s.id==='asotra'){ ls.set('guival_persona', s.value.trim()); render(); }
  else if (d.perm){ const [grupo,herramienta]=d.perm.split('|'); adminAccion('admin.setPerm',{grupo,herramienta,nivel:+s.value},'Permiso guardado'); }
  else if (d.galc){ const g = state.admin.grupos.find(x=>x.id===d.galc); adminAccion('admin.saveGroup',{grupo:{...g, alcance:s.value}},'Alcance guardado'); }
  else if (d.tmod){ const h = state.admin.herramientas.find(x=>x.id===d.tmod); adminAccion('admin.saveTool',{tool:{...h, modulo:s.value}},'Herramienta movida'); }
  else if (d.test){ const h = state.admin.herramientas.find(x=>x.id===d.test); adminAccion('admin.saveTool',{tool:{...h, estado:s.value}},'Estado guardado'); }
});
$app.addEventListener('input', e=>{ if (e.target.dataset && e.target.dataset.ud && state.draft){ state.draft[e.target.dataset.ud]=e.target.value; return; } if (e.target.id==='fusr'){ state.filtroU=e.target.value; clearTimeout(state._ft); state._ft=setTimeout(()=>{ render().then(()=>{ const i=document.getElementById('fusr'); if(i){ i.focus(); i.setSelectionRange(i.value.length,i.value.length);} }); },250);} });

if ('serviceWorker' in navigator && location.protocol==='https:') navigator.serviceWorker.register('sw.js').catch(()=>{});
render();
})();
