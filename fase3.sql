-- =====================================================================
-- FASE 3: Informe de Cartera en Supabase (20/11/2026)
-- Novedad: el RECIBO es el grupo: un recibo tiene una o varias facturas y una o varias
-- formas de pago (efectivo, cheque, transferencia, consignación). Debe cuadrar para cerrar.
-- Todo se lee y escribe con funciones (security definer); las tablas no se exponen.
-- =====================================================================

-- ---------- datos de referencia (los sube el robot de Guival Maestros) ----------
create table if not exists public.accesos (            -- hoja Accesos de Guival Maestros
  clave    text primary key,
  nombre   text,
  ve       text,
  vendedor text,          -- vendedor fijo (en mayúsculas), ej. 'ORLANDO CABAL' u 'OFICINA'
  cartera  text,          -- 'recibe' | 'talonarios' | ''
  activo   boolean not null default true
);
create table if not exists public.cartera_vendedores (  -- mayoristas activos + OFICINA (los que hacen informe)
  vendedor text primary key,
  codigo   text,
  zona     text
);
create table if not exists public.clientes (
  cod      text primary key,
  nombre   text not null,
  ciudad   text,
  inactivo boolean not null default false
);
create index if not exists clientes_nombre on public.clientes using gin (to_tsvector('simple', nombre));
create table if not exists public.facturas (             -- índice de facturas por cliente (últimos meses)
  cod_cliente text not null,
  doc      text not null,
  fecha    text,
  total    numeric,          -- con IVA
  dev      numeric,          -- notas / devoluciones
  vendedor text,
  sin_iva  numeric,
  emp      text,
  notas    jsonb,
  primary key (cod_cliente, doc)
);
create table if not exists public.cartera_config (
  id int primary key default 1 check (id = 1),
  tarifa numeric not null default 2.5,      -- % retención en la fuente
  minimo numeric not null default 523740    -- base mínima sin IVA
);
insert into public.cartera_config(id) values (1) on conflict do nothing;

-- ---------- talonarios ----------
create table if not exists public.talonarios (
  id        text primary key,
  letra     text not null check (letra in ('G','N')),
  desde     text not null,
  hasta     text not null,
  vendedor  text not null,
  entregado text,
  entrego   text,
  estado    text not null default 'ACTIVO',
  historial text
);

-- ---------- informes ----------
create table if not exists public.informes (
  id         text primary key,
  vendedor   text not null,
  codigo     text,
  zona       text,
  empresa    text not null default 'G',
  estado     text not null default 'ABIERTO' check (estado in ('ABIERTO','CERRADO','RECIBIDO')),
  inicio     text,             -- dd/mm/aaaa (igual que el informe anterior)
  cierre     text,
  recibido   text,             -- 'dd/mm/aaaa hh:mm · nombre'
  obs        text,
  ver        bigint not null default 0,
  usuario    text,             -- quién guardó (y 'registró …' si fue la asistente)
  datos      jsonb not null default '{"recibos":[]}'
);
create index if not exists informes_vendedor on public.informes (vendedor, estado);
-- Facturas y pagos de cada informe, en filas (se rehacen al guardar): para saldos y para cartera.
create table if not exists public.informe_lineas (
  informe_id text not null references public.informes(id) on delete cascade,
  n          int  not null,
  recibo     text,
  anulado    boolean not null default false,
  cod        text, nombre text, ciudad text,
  factura    text, fac_sistema boolean, tipo text,
  vf numeric, base numeric, rf numeric, ri numeric, ica numeric, dev numeric, dcto numeric, rec numeric,
  primary key (informe_id, n)
);
create index if not exists informe_lineas_fact on public.informe_lineas (cod, factura);
create table if not exists public.informe_pagos (
  informe_id text not null references public.informes(id) on delete cascade,
  n          int  not null,
  recibo     text,
  forma      text,     -- Efectivo | Cheque | Transferencia | Consignación
  valor      numeric,
  banco      text,
  referencia text,
  primary key (informe_id, n)
);

do $$ declare t text; begin
  foreach t in array array['accesos','cartera_vendedores','clientes','facturas','cartera_config','talonarios','informes','informe_lineas','informe_pagos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- =====================================================================
-- Quién es en cartera
-- =====================================================================
create or replace function app.cartera_yo() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare
  u uuid := app.yo(); niv int := app.nivel('recibo'); a accesos; propio text; grupos text[]; elige boolean; nom text;
begin
  if u is null or niv < 1 then return null; end if;
  select nombre into nom from usuarios where id = u;
  select * into a from accesos where clave = (select clave_vendedor from usuarios where id = u);
  select coalesce(array_agg(grupo_id), '{}') into grupos from usuario_grupos where usuario_id = u;
  propio := nullif(upper(trim(split_part(coalesce(a.vendedor,''), ',', 1))), '');
  elige := niv >= 3 or 'asistente' = any(grupos) or 'superadmin' = any(grupos) or (propio is null and lower(coalesce(a.ve,'')) in ('todo','admin'));
  return jsonb_build_object(
    'nombre', nom, 'nivel', niv, 'elige', elige,
    'propio', case when elige then null else propio end,
    'talonarios', niv >= 3 or lower(coalesce(a.cartera,'')) ~ '^(recib|talon)',
    'recibe', niv >= 3);
end $$;

-- ¿Puede trabajar con este vendedor?
create or replace function app.cartera_puede(v text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select case when (app.cartera_yo()) is null then false
              when (app.cartera_yo()->>'elige')::boolean then exists (select 1 from cartera_vendedores where vendedor = v)
              else (app.cartera_yo()->>'propio') = v end
$$;

-- =====================================================================
-- Funciones que usa la pantalla
-- =====================================================================
create or replace function public.cartera_inicio() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare y jsonb := app.cartera_yo(); r jsonb;
begin
  if y is null then return null; end if;
  r := y || jsonb_build_object(
    'config', (select jsonb_build_object('tarifa', tarifa, 'minimo', minimo) from cartera_config where id = 1),
    'hoy', to_char(now() at time zone 'America/Bogota', 'DD/MM/YYYY'),
    'vendedores', case when (y->>'elige')::boolean
        then coalesce((select jsonb_agg(jsonb_build_object('vendedor', vendedor, 'codigo', codigo, 'zona', zona) order by vendedor) from cartera_vendedores), '[]')
        else coalesce((select jsonb_agg(jsonb_build_object('vendedor', vendedor, 'codigo', codigo, 'zona', zona)) from cartera_vendedores where vendedor = y->>'propio'),
                      jsonb_build_array(jsonb_build_object('vendedor', y->>'propio', 'codigo', '', 'zona', ''))) end);
  if (y->>'recibe')::boolean then r := r || jsonb_build_object('pendientes', public.cartera_pendientes()); end if;
  return r;
end $$;

create or replace function public.cartera_lista(v text) returns jsonb
language sql stable security definer set search_path = public, app as $$
  select case when not app.cartera_puede(v) then null else coalesce((
    select jsonb_agg(x order by x.o, x.ver desc) from (
      select i.id, i.estado, i.inicio, i.cierre, i.recibido, i.ver,
             (select count(*) from informe_lineas l where l.informe_id = i.id and not l.anulado) pagos,
             (select coalesce(sum(l.rec),0) from informe_lineas l where l.informe_id = i.id) total,
             case i.estado when 'ABIERTO' then 0 when 'CERRADO' then 1 else 2 end o
      from informes i where i.vendedor = v and i.estado <> 'RECIBIDO'
      union all
      select * from (select i.id, i.estado, i.inicio, i.cierre, i.recibido, i.ver,
             (select count(*) from informe_lineas l where l.informe_id = i.id and not l.anulado),
             (select coalesce(sum(l.rec),0) from informe_lineas l where l.informe_id = i.id), 2
      from informes i where i.vendedor = v and i.estado = 'RECIBIDO' order by i.ver desc limit 10) r
    ) x), '[]') end
$$;

create or replace function public.cartera_pendientes() returns jsonb
language sql stable security definer set search_path = public, app as $$
  select case when not coalesce((app.cartera_yo()->>'recibe')::boolean, false) then null else coalesce((
    select jsonb_agg(jsonb_build_object('id', i.id, 'vendedor', i.vendedor, 'estado', i.estado, 'inicio', i.inicio, 'cierre', i.cierre, 'ver', i.ver,
             'pagos', (select count(*) from informe_lineas l where l.informe_id = i.id and not l.anulado),
             'total', (select coalesce(sum(l.rec),0) from informe_lineas l where l.informe_id = i.id)) order by i.ver)
    from informes i where i.estado = 'CERRADO'), '[]') end
$$;

create or replace function public.cartera_informe(p_id text) returns jsonb
language sql stable security definer set search_path = public, app as $$
  select case when i.id is null or not app.cartera_puede(i.vendedor) then null else
    jsonb_build_object('id', i.id, 'estado', i.estado, 'inicio', i.inicio, 'cierre', i.cierre, 'recibido', i.recibido,
      'empresa', i.empresa, 'vendedor', i.vendedor, 'codigo', i.codigo, 'zona', i.zona, 'obs', i.obs, 'ver', i.ver, 'usuario', i.usuario,
      'recibos', coalesce(i.datos->'recibos', '[]')) end
  from (select 1) d left join informes i on i.id = p_id
$$;

-- Clientes por nombre (todas las palabras) o por código (empieza igual).
create or replace function public.cartera_buscar(q text) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare qq text := app.norm(q); pal text[];
begin
  if app.cartera_yo() is null or length(qq) < 2 then return '[]'; end if;
  pal := array_remove(string_to_array(qq, ' '), '');
  return coalesce((select jsonb_agg(jsonb_build_object('cod', cod, 'nombre', nombre, 'ciudad', ciudad, 'inactivo', inactivo)) from (
    select * from clientes c
    where c.cod like qq || '%' or (length(qq) >= 3 and (select bool_and(position(p in app.norm(c.nombre)) > 0) from unnest(pal) p))
    order by (c.cod = qq) desc, c.inactivo, c.nombre limit 15) x), '[]');
end $$;

-- Facturas del cliente con lo ya pagado en otros informes y el saldo.
create or replace function public.cartera_facturas(p_cod text, p_id text default null) returns jsonb
language sql stable security definer set search_path = public, app as $$
  select case when app.cartera_yo() is null then null else coalesce((
    select jsonb_agg(jsonb_build_object('doc', f.doc, 'fecha', f.fecha, 'total', f.total, 'dev', f.dev, 'vendedor', f.vendedor, 'sin', coalesce(f.sin_iva,0),
        'emp', coalesce(f.emp,''), 'notas', coalesce(f.notas,'[]'),
        'abonado', round(coalesce(p.abonado,0)), 'prev', coalesce(p.prev, '{"rec":0,"rf":0,"ri":0,"ica":0,"dev":0,"dcto":0}'),
        'saldo', greatest(0, round(f.total - coalesce(f.dev,0) - coalesce(p.abonado,0))), 'pagos', coalesce(p.veces,'[]')) order by f.fecha desc, f.doc)
    from facturas f
    left join lateral (
      select sum(coalesce(l.rec,0)+coalesce(l.rf,0)+coalesce(l.ri,0)+coalesce(l.ica,0)+coalesce(l.dev,0)+coalesce(l.dcto,0)) abonado,
             jsonb_build_object('rec', sum(coalesce(l.rec,0)), 'rf', sum(coalesce(l.rf,0)), 'ri', sum(coalesce(l.ri,0)),
                                'ica', sum(coalesce(l.ica,0)), 'dev', sum(coalesce(l.dev,0)), 'dcto', sum(coalesce(l.dcto,0))) prev,
             jsonb_agg(l.tipo || ' ' || coalesce(nullif(i.cierre,''), i.inicio) ||
                       case i.estado when 'ABIERTO' then ' (abierto)' when 'CERRADO' then ' (sin recibir)' else '' end) veces
      from informe_lineas l join informes i on i.id = l.informe_id
      where l.cod = f.cod_cliente and upper(l.factura) = upper(f.doc) and not l.anulado and l.informe_id is distinct from p_id
    ) p on true
    where f.cod_cliente = trim(p_cod)), '[]') end
$$;

-- Talonarios activos de un vendedor y el último recibo usado en cada letra.
create or replace function app.recibo_num(s text) returns jsonb
language sql immutable as $$
  select case when m is null then null else jsonb_build_object('letra', coalesce(m[1],''), 'n', m[2]::bigint) end
  from (select regexp_match(upper(trim(coalesce(s,''))), '^([GN])?\s*-?\s*0*(\d+)$') m) x
$$;
create or replace function public.cartera_tal_de(v text) returns jsonb
language sql stable security definer set search_path = public, app as $$
  with libros as (select id, letra, desde::bigint d, hasta::bigint h, greatest(length(desde), length(hasta)) dig
                  from talonarios where vendedor = v and estado = 'ACTIVO'),
       usados as (select (app.recibo_num(l.recibo)->>'letra') letra, (app.recibo_num(l.recibo)->>'n')::bigint n
                  from informe_lineas l where l.recibo is not null)
  select case when not app.cartera_puede(v) then null else jsonb_build_object(
    'libros', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'letra', letra, 'desde', d, 'hasta', h, 'dig', dig)) from libros), '[]'),
    'ultimo', jsonb_build_object(
       'G', coalesce((select max(u.n) from usados u join libros b on b.letra = 'G' and u.letra in ('G','') and u.n between b.d and b.h), 0),
       'N', coalesce((select max(u.n) from usados u join libros b on b.letra = 'N' and u.letra = 'N' and u.n between b.d and b.h), 0))) end
$$;

create or replace function public.cartera_talonarios() returns jsonb
language sql stable security definer set search_path = public, app as $$
  select case when not coalesce((app.cartera_yo()->>'talonarios')::boolean, false) then null else coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'letra', t.letra, 'desde', t.desde, 'hasta', t.hasta, 'vendedor', t.vendedor,
      'entregado', t.entregado, 'entrego', t.entrego, 'estado', t.estado, 'historial', t.historial,
      'total', t.hasta::bigint - t.desde::bigint + 1, 'usados', u.n, 'ultimo', case when u.ult is null then '' else t.letra || lpad(u.ult::text, greatest(length(t.desde), length(t.hasta)), '0') end)
      order by t.vendedor, t.letra, t.desde::bigint)
    from talonarios t
    left join lateral (select count(*) n, max(x.n) ult from (
        select (app.recibo_num(l.recibo)->>'n')::bigint n, coalesce(nullif(app.recibo_num(l.recibo)->>'letra',''), case when i.empresa ~* '^n' then 'N' else 'G' end) le
        from informe_lineas l join informes i on i.id = l.informe_id where l.recibo is not null) x
      where x.le = t.letra and x.n between t.desde::bigint and t.hasta::bigint) u on true
    where t.estado <> 'ELIMINADO'), '[]') end
$$;

create or replace function public.cartera_tal_guardar(t jsonb) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare le text := upper(coalesce(t->>'letra','')); ds text := regexp_replace(coalesce(t->>'desde',''), '\D', '', 'g');
        hs text := regexp_replace(coalesce(t->>'hasta',''), '\D', '', 'g'); v text := app.norm(t->>'vendedor'); dig int; c record;
begin
  if not coalesce((app.cartera_yo()->>'talonarios')::boolean, false) then raise exception 'Solo cartera entrega talonarios.'; end if;
  if le not in ('G','N') then raise exception 'Escoja la letra del talonario: G o N.'; end if;
  if ds = '' or hs = '' then raise exception 'Escriba el primer y el último número del talonario.'; end if;
  if hs::bigint < ds::bigint then raise exception 'El último número debe ser mayor que el primero.'; end if;
  if hs::bigint - ds::bigint > 2000 then raise exception 'El talonario no puede tener más de 2.000 recibos.'; end if;
  if not exists (select 1 from cartera_vendedores where vendedor = v) then raise exception 'Escoja el vendedor.'; end if;
  select * into c from talonarios x where x.letra = le and x.estado <> 'ELIMINADO' and not (hs::bigint < x.desde::bigint or ds::bigint > x.hasta::bigint) limit 1;
  if found then raise exception 'Ese rango se cruza con el talonario % %–% de %.', le, c.desde, c.hasta, c.vendedor; end if;
  dig := greatest(length(ds), length(hs));
  insert into talonarios(id, letra, desde, hasta, vendedor, entregado, entrego)
  values ('T' || to_char(clock_timestamp(), 'YYMMDDHH24MISSMS') || substr(md5(random()::text),1,4), le, lpad(ds, dig, '0'), lpad(hs, dig, '0'), v,
          to_char(now() at time zone 'America/Bogota', 'DD/MM/YYYY'), app.cartera_yo()->>'nombre');
  insert into bitacora(correo, accion, detalle) values ((select correo from usuarios where id = app.yo()), 'talonario_entregado', le || ' ' || ds || '–' || hs || ' · ' || v);
  return public.cartera_talonarios();
end $$;

create or replace function public.cartera_tal_reasignar(p_id text, p_vendedor text) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare v text := app.norm(p_vendedor); t talonarios;
begin
  if not coalesce((app.cartera_yo()->>'talonarios')::boolean, false) then raise exception 'Solo cartera entrega talonarios.'; end if;
  if not exists (select 1 from cartera_vendedores where vendedor = v) then raise exception 'Escoja el vendedor.'; end if;
  select * into t from talonarios where id = p_id; if not found then raise exception 'No encontré el talonario.'; end if;
  if t.vendedor = v then raise exception 'El talonario ya es de %.', v; end if;
  update talonarios set vendedor = v, historial = coalesce(historial || ' | ', '') || to_char(now() at time zone 'America/Bogota', 'DD/MM/YYYY') ||
    ': de ' || t.vendedor || ' a ' || v || ' (' || (app.cartera_yo()->>'nombre') || ')' where id = p_id;
  return public.cartera_talonarios();
end $$;

create or replace function public.cartera_tal_eliminar(p_id text) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare t jsonb;
begin
  if not coalesce((app.cartera_yo()->>'talonarios')::boolean, false) then raise exception 'Solo cartera entrega talonarios.'; end if;
  select x into t from jsonb_array_elements(public.cartera_talonarios()) x where x->>'id' = p_id;
  if t is null then raise exception 'No encontré el talonario.'; end if;
  if (t->>'usados')::int > 0 then raise exception 'Ese talonario ya tiene recibos usados en informes: no se puede borrar. Puede reasignarlo.'; end if;
  delete from talonarios where id = p_id;
  return public.cartera_talonarios();
end $$;

-- Guardar (automático) y cerrar. inf = {id, vendedor, empresa, obs, inicio, recibos:[{recibo, anulado, facturas:[…], pagos:[…]}]}
-- Cada factura trae ya calculado (en la pantalla, igual que antes): c = {f, rf, ri, ica, dev, dcto, rec}.
create or replace function public.cartera_guardar(inf jsonb, p_ver bigint, cerrar boolean, por text default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  y jsonb := app.cartera_yo(); v cartera_vendedores; act informes; ahora bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  r jsonb; f jsonb; p jsonb; k int := 0; kp int := 0; nr int := 0; sumf numeric; sump numeric; est text; ini text; cie text; quien text;
begin
  if y is null or (y->>'nivel')::int < 2 then raise exception 'Su usuario no tiene permiso para esta acción.'; end if;
  if coalesce(inf->>'id','') = '' then raise exception 'Informe sin identificación'; end if;
  if not app.cartera_puede(inf->>'vendedor') then raise exception 'Escoja el vendedor'; end if;
  select * into v from cartera_vendedores where vendedor = inf->>'vendedor';
  select * into act from informes where id = inf->>'id' for update;
  if found then
    if act.estado = 'RECIBIDO' then raise exception 'Este informe ya lo recibió cartera: no se puede cambiar.'; end if;
    if act.estado = 'CERRADO' then raise exception 'Este informe está cerrado. Toque "Modificar" para cambiarlo.'; end if;
    if p_ver is not null and act.ver > p_ver then raise exception 'CAMBIO_EN_OTRO_EQUIPO'; end if;
  end if;
  -- validar al cerrar
  if cerrar then
    for r in select * from jsonb_array_elements(coalesce(inf->'recibos','[]')) loop
      nr := nr + 1;
      if coalesce(r->>'recibo','') = '' then raise exception 'Falta el número del recibo %', nr; end if;
      if coalesce((r->>'anulado')::boolean, false) then continue; end if;
      if jsonb_array_length(coalesce(r->'facturas','[]')) = 0 then raise exception 'El recibo % no tiene facturas', r->>'recibo'; end if;
      sumf := 0; sump := 0;
      for f in select * from jsonb_array_elements(r->'facturas') loop
        if coalesce(f->>'cod','') = '' or coalesce(f->>'nombre','') = '' then raise exception 'Falta el cliente en el recibo %', r->>'recibo'; end if;
        if coalesce(f->>'tipo','') not in ('Factura completa','Contado','Abono','Saldo') then raise exception 'Falta el tipo de pago en el recibo %', r->>'recibo'; end if;
        sumf := sumf + coalesce((f->'c'->>'rec')::numeric, 0);
      end loop;
      for p in select * from jsonb_array_elements(coalesce(r->'pagos','[]')) loop
        if coalesce(p->>'forma','') = '' then raise exception 'Falta la forma de pago en el recibo %', r->>'recibo'; end if;
        sump := sump + coalesce((p->>'valor')::numeric, 0);
      end loop;
      if abs(sumf - sump) > 1 then raise exception 'El recibo % no cuadra: facturas % y pagos %', r->>'recibo', sumf, sump; end if;
    end loop;
    if nr = 0 then raise exception 'El informe no tiene pagos.'; end if;
  end if;
  est := case when cerrar then 'CERRADO' else 'ABIERTO' end;
  ini := coalesce(act.inicio, nullif(inf->>'inicio',''), to_char(now() at time zone 'America/Bogota', 'DD/MM/YYYY'));
  cie := case when cerrar then to_char(now() at time zone 'America/Bogota', 'DD/MM/YYYY') else '' end;
  quien := (y->>'nombre') || case when coalesce(por,'') <> '' then ' (registró ' || por || ')' else '' end;
  insert into informes(id, vendedor, codigo, zona, empresa, estado, inicio, cierre, recibido, obs, ver, usuario, datos)
  values (inf->>'id', inf->>'vendedor', v.codigo, v.zona, coalesce(nullif(inf->>'empresa',''),'G'), est, ini, cie, '', inf->>'obs', ahora, quien,
          jsonb_build_object('recibos', coalesce(inf->'recibos','[]')))
  on conflict (id) do update set estado = excluded.estado, cierre = excluded.cierre, empresa = excluded.empresa, obs = excluded.obs,
    ver = excluded.ver, usuario = excluded.usuario, datos = excluded.datos;
  delete from informe_lineas where informe_id = inf->>'id';
  delete from informe_pagos where informe_id = inf->>'id';
  for r in select * from jsonb_array_elements(coalesce(inf->'recibos','[]')) loop
    if coalesce((r->>'anulado')::boolean, false) then
      k := k + 1; insert into informe_lineas(informe_id, n, recibo, anulado, rec) values (inf->>'id', k, r->>'recibo', true, 0);
      continue;
    end if;
    for f in select * from jsonb_array_elements(coalesce(r->'facturas','[]')) loop
      k := k + 1;
      insert into informe_lineas(informe_id, n, recibo, cod, nombre, ciudad, factura, fac_sistema, tipo, vf, base, rf, ri, ica, dev, dcto, rec)
      values (inf->>'id', k, r->>'recibo', f->>'cod', f->>'nombre', f->>'ciudad', upper(nullif(f->>'factura','')), coalesce((f->>'facSistema')::boolean,false), f->>'tipo',
              (f->'c'->>'f')::numeric, nullif(f->'c'->>'base','')::numeric, (f->'c'->>'rf')::numeric, (f->'c'->>'ri')::numeric, (f->'c'->>'ica')::numeric,
              (f->'c'->>'dev')::numeric, (f->'c'->>'dcto')::numeric, (f->'c'->>'rec')::numeric);
    end loop;
    for p in select * from jsonb_array_elements(coalesce(r->'pagos','[]')) loop
      kp := kp + 1;
      insert into informe_pagos(informe_id, n, recibo, forma, valor, banco, referencia)
      values (inf->>'id', kp, r->>'recibo', p->>'forma', nullif(p->>'valor','')::numeric, p->>'banco', p->>'ref');
    end loop;
  end loop;
  if cerrar then
    insert into bitacora(correo, accion, detalle) values ((select correo from usuarios where id = app.yo()), 'cartera_cierre', (inf->>'id') || ' · ' || (inf->>'vendedor') || ' · ' || k || ' facturas');
  end if;
  return jsonb_build_object('ok', true, 'ver', ahora, 'estado', est, 'inicio', ini, 'cierre', cie);
end $$;

create or replace function public.cartera_reabrir(p_id text) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare i informes;
begin
  select * into i from informes where id = p_id for update;
  if not found or not app.cartera_puede(i.vendedor) or (app.cartera_yo()->>'nivel')::int < 2 then raise exception 'No encontré el informe %', p_id; end if;
  if i.estado <> 'CERRADO' then raise exception 'El informe no está cerrado (está %).', lower(i.estado); end if;
  update informes set estado = 'ABIERTO', cierre = '', recibido = '', ver = (extract(epoch from clock_timestamp()) * 1000)::bigint where id = p_id;
  insert into bitacora(correo, accion, detalle) values ((select correo from usuarios where id = app.yo()), 'cartera_modificar', p_id || ' · ' || i.vendedor);
  return public.cartera_informe(p_id);
end $$;

create or replace function public.cartera_recibir(p_id text, si boolean default true) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare i informes;
begin
  if not coalesce((app.cartera_yo()->>'recibe')::boolean, false) then raise exception 'Su usuario no tiene permiso para esta acción.'; end if;
  select * into i from informes where id = p_id for update;
  if not found then raise exception 'No encontré el informe %', p_id; end if;
  if si and i.estado <> 'CERRADO' then raise exception 'El informe no está cerrado (está %).', lower(i.estado); end if;
  if not si and i.estado <> 'RECIBIDO' then raise exception 'El informe no está recibido.'; end if;
  update informes set estado = case when si then 'RECIBIDO' else 'CERRADO' end,
    recibido = case when si then to_char(now() at time zone 'America/Bogota', 'DD/MM/YYYY HH24:MI') || ' · ' || (app.cartera_yo()->>'nombre') else '' end,
    ver = (extract(epoch from clock_timestamp()) * 1000)::bigint where id = p_id;
  insert into bitacora(correo, accion, detalle) values ((select correo from usuarios where id = app.yo()), case when si then 'cartera_recibido' else 'cartera_devuelto' end, p_id || ' · ' || i.vendedor);
  return public.cartera_informe(p_id);
end $$;

create or replace function public.cartera_config_guardar(p_tarifa numeric, p_minimo numeric) returns jsonb
language plpgsql security definer set search_path = public, app as $$
begin
  if not coalesce((app.cartera_yo()->>'recibe')::boolean, false) then raise exception 'Su usuario no tiene permiso para esta acción.'; end if;
  if not (p_tarifa > 0 and p_tarifa < 100) then raise exception 'Tarifa no válida'; end if;
  if not (p_minimo >= 0) then raise exception 'Valor mínimo no válido'; end if;
  update cartera_config set tarifa = p_tarifa, minimo = p_minimo where id = 1;
  return (select jsonb_build_object('tarifa', tarifa, 'minimo', minimo) from cartera_config where id = 1);
end $$;

-- permisos de ejecución: solo con sesión
do $$ declare f text; begin
  foreach f in array array['cartera_inicio()','cartera_lista(text)','cartera_pendientes()','cartera_informe(text)','cartera_buscar(text)',
    'cartera_facturas(text, text)','cartera_tal_de(text)','cartera_talonarios()','cartera_tal_guardar(jsonb)','cartera_tal_reasignar(text, text)',
    'cartera_tal_eliminar(text)','cartera_guardar(jsonb, bigint, boolean, text)','cartera_reabrir(text)','cartera_recibir(text, boolean)',
    'cartera_config_guardar(numeric, numeric)'] loop
    execute 'revoke execute on function public.' || f || ' from anon, public';
    execute 'grant execute on function public.' || f || ' to authenticated';
  end loop;
end $$;
revoke execute on function app.cartera_yo() from anon, public;
revoke execute on function app.cartera_puede(text) from anon, public;
grant execute on function app.cartera_yo() to authenticated;
grant execute on function app.cartera_puede(text) to authenticated;

-- =====================================================================
-- Robot: sube datos de referencia (y una vez, los informes y talonarios existentes)
-- =====================================================================
create or replace function public.robot_cartera(llave text, tipo text, datos jsonb, reemplazar boolean default true) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0;
begin
  if not app.robot_ok(llave) then raise exception 'llave de robot no válida'; end if;
  if tipo = 'accesos' then
    if reemplazar then delete from accesos where true; end if;
    insert into accesos(clave, nombre, ve, vendedor, cartera, activo)
    select x->>0, x->>1, x->>2, x->>3, x->>4, coalesce((x->>5)::boolean, true) from jsonb_array_elements(datos) x
    on conflict (clave) do update set nombre = excluded.nombre, ve = excluded.ve, vendedor = excluded.vendedor, cartera = excluded.cartera, activo = excluded.activo;
  elsif tipo = 'vendedores' then
    if reemplazar then delete from cartera_vendedores where true; end if;
    insert into cartera_vendedores(vendedor, codigo, zona) select x->>0, x->>1, x->>2 from jsonb_array_elements(datos) x
    on conflict (vendedor) do update set codigo = excluded.codigo, zona = excluded.zona;
  elsif tipo = 'clientes' then
    if reemplazar then delete from clientes where true; end if;
    insert into clientes(cod, nombre, ciudad, inactivo) select x->>0, x->>1, x->>2, coalesce((x->>3)::boolean,false) from jsonb_array_elements(datos) x
    on conflict (cod) do update set nombre = excluded.nombre, ciudad = excluded.ciudad, inactivo = excluded.inactivo;
  elsif tipo = 'facturas' then   -- datos = {cod: [[doc, fecha, total, dev, vendedor, sin, emp, notas], …]} (un archivo del índice)
    delete from facturas where cod_cliente in (select jsonb_object_keys(datos));
    insert into facturas(cod_cliente, doc, fecha, total, dev, vendedor, sin_iva, emp, notas)
    select k, x->>0, x->>1, (x->>2)::numeric, nullif(x->>3,'')::numeric, x->>4, nullif(x->>5,'')::numeric, x->>6, x->7
    from jsonb_each(datos) e(k, v), jsonb_array_elements(e.v) x
    on conflict (cod_cliente, doc) do nothing;
  elsif tipo = 'talonarios' then
    if reemplazar then delete from talonarios where true; end if;
    insert into talonarios(id, letra, desde, hasta, vendedor, entregado, entrego, estado, historial)
    select x->>0, x->>1, x->>2, x->>3, x->>4, x->>5, x->>6, coalesce(nullif(x->>7,''),'ACTIVO'), x->>8 from jsonb_array_elements(datos) x
    on conflict (id) do nothing;
  elsif tipo = 'informes' then   -- informes del formato anterior ya convertidos a recibos por el robot
    insert into informes(id, vendedor, codigo, zona, empresa, estado, inicio, cierre, recibido, obs, ver, usuario, datos)
    select x->>'id', x->>'vendedor', x->>'codigo', x->>'zona', coalesce(x->>'empresa','G'), x->>'estado', x->>'inicio', x->>'cierre', x->>'recibido',
           x->>'obs', (x->>'ver')::bigint, x->>'usuario', jsonb_build_object('recibos', x->'recibos')
    from jsonb_array_elements(datos) x
    on conflict (id) do update set estado = excluded.estado, cierre = excluded.cierre, recibido = excluded.recibido, obs = excluded.obs,
      ver = excluded.ver, usuario = excluded.usuario, datos = excluded.datos;
    -- filas de facturas y pagos
    delete from informe_lineas where informe_id in (select x->>'id' from jsonb_array_elements(datos) x);
    delete from informe_pagos  where informe_id in (select x->>'id' from jsonb_array_elements(datos) x);
    insert into informe_lineas(informe_id, n, recibo, anulado, cod, nombre, ciudad, factura, fac_sistema, tipo, vf, base, rf, ri, ica, dev, dcto, rec)
    select x->>'id', row_number() over (partition by x->>'id'), r->>'recibo', coalesce((r->>'anulado')::boolean,false),
           f->>'cod', f->>'nombre', f->>'ciudad', upper(nullif(f->>'factura','')), coalesce((f->>'facSistema')::boolean,false), f->>'tipo',
           (f->'c'->>'f')::numeric, nullif(f->'c'->>'base','')::numeric, (f->'c'->>'rf')::numeric, (f->'c'->>'ri')::numeric, (f->'c'->>'ica')::numeric,
           (f->'c'->>'dev')::numeric, (f->'c'->>'dcto')::numeric, coalesce((f->'c'->>'rec')::numeric, 0)
    from jsonb_array_elements(datos) x, jsonb_array_elements(x->'recibos') r,
         jsonb_array_elements(case when coalesce((r->>'anulado')::boolean,false) then '[{}]'::jsonb else coalesce(r->'facturas','[]') end) f;
    insert into informe_pagos(informe_id, n, recibo, forma, valor, banco, referencia)
    select x->>'id', row_number() over (partition by x->>'id'), r->>'recibo', p->>'forma', nullif(p->>'valor','')::numeric, p->>'banco', p->>'ref'
    from jsonb_array_elements(datos) x, jsonb_array_elements(x->'recibos') r, jsonb_array_elements(coalesce(r->'pagos','[]')) p;
  else raise exception 'tipo desconocido %', tipo;
  end if;
  get diagnostics n = row_count;
  insert into cargas(fuente, ultimo_archivo, actualizado) values ('cartera_' || tipo, n::text, now())
  on conflict (fuente) do update set ultimo_archivo = excluded.ultimo_archivo, actualizado = now();
  return n;
end $$;
revoke execute on function public.robot_cartera(text, text, jsonb, boolean) from public, authenticated;
grant  execute on function public.robot_cartera(text, text, jsonb, boolean) to anon;

-- =====================================================================
-- 20/11 (2): informes sin terminar – verlos todos (cartera) y borrarlos
-- Borrar un informe abierto quita también sus filas: las facturas vuelven a su saldo anterior.
-- =====================================================================
create or replace function public.cartera_abiertos() returns jsonb
language sql stable security definer set search_path = public, app as $$
  select case when not coalesce((app.cartera_yo()->>'recibe')::boolean, false) then null else coalesce((
    select jsonb_agg(jsonb_build_object('id', i.id, 'vendedor', i.vendedor, 'estado', i.estado, 'inicio', i.inicio, 'ver', i.ver, 'empresa', i.empresa,
             'pagos', (select count(*) from informe_lineas l where l.informe_id = i.id and not l.anulado),
             'total', (select coalesce(sum(l.rec),0) from informe_lineas l where l.informe_id = i.id)) order by i.ver)
    from informes i where i.estado = 'ABIERTO'), '[]') end
$$;
create or replace function public.cartera_borrar(p_id text) returns boolean
language plpgsql security definer set search_path = public, app as $$
declare i informes;
begin
  select * into i from informes where id = p_id for update;
  if not found then return true; end if;   -- nunca se guardó: no hay nada que borrar
  if not app.cartera_puede(i.vendedor) or (app.cartera_yo()->>'nivel')::int < 2 then raise exception 'Su usuario no tiene permiso para esta acción.'; end if;
  if i.estado <> 'ABIERTO' then raise exception 'Solo se pueden borrar informes abiertos (este está %). Si está cerrado, primero tóquelo en "Modificar".', lower(i.estado); end if;
  delete from informes where id = p_id;    -- borra también sus facturas y pagos
  insert into bitacora(correo, accion, detalle) values ((select correo from usuarios where id = app.yo()), 'cartera_borrado', p_id || ' · ' || i.vendedor);
  return true;
end $$;
revoke execute on function public.cartera_abiertos() from anon, public;
revoke execute on function public.cartera_borrar(text) from anon, public;
grant execute on function public.cartera_abiertos() to authenticated;
grant execute on function public.cartera_borrar(text) to authenticated;
