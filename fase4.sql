-- =====================================================================
-- FASE 4: Dashboard de ventas en Supabase (20/11/2026)
-- El robot de Guival Maestros sube, por cada mes, una copia YA FILTRADA para cada tipo de acceso
-- (admin, todo, tat, cada vendedor). Así nadie recibe filas que no le tocan: la base solo entrega
-- la copia que corresponde a la clave del usuario.
-- =====================================================================

create table if not exists public.dash_dims (
  id int primary key default 1 check (id = 1),
  dims text not null,                     -- dims.json tal cual
  actualizado timestamptz not null default now()
);
create table if not exists public.dash_llaves (
  clave    text primary key,              -- clave del vendedor (Accesos)
  llave    text not null,                 -- qué copia del tablero ve
  tipo     text not null,                 -- admin | todo | tat | vendedor
  etiqueta text not null default '',
  como     boolean not null default false -- el asistente puede trabajar por este vendedor
);
create table if not exists public.dash_partes (
  mes   text not null,
  llave text not null,
  ver   text not null,
  datos jsonb not null,                   -- {m, n, docs, z}
  primary key (mes, llave)
);
alter table public.dash_dims   enable row level security;
alter table public.dash_llaves enable row level security;
alter table public.dash_partes enable row level security;
revoke all on public.dash_dims, public.dash_llaves, public.dash_partes from anon, authenticated;

-- Qué acceso usa quien está en la app (el asistente trabaja "como" un vendedor de la lista).
create or replace function app.dash_acc(como text) returns public.dash_llaves
language plpgsql stable security definer set search_path = public, app as $$
declare yo uuid := app.yo(); k text; r dash_llaves; asis boolean;
begin
  if yo is null or app.nivel('dashboard') < 1 then raise exception 'Su usuario no tiene acceso al Dashboard.'; end if;
  asis := exists (select 1 from usuario_grupos where usuario_id = yo and grupo_id = 'asistente') and not app.es_superadmin();
  if asis then
    select * into r from dash_llaves where clave = coalesce(como, '') and dash_llaves.como;
    if not found then raise exception 'Escoja en Inicio el vendedor por el que va a trabajar.'; end if;
    return r;
  end if;
  select nullif(trim(clave_vendedor), '') into k from usuarios where id = yo;
  select * into r from dash_llaves where clave = k;
  if not found then
    if app.es_superadmin() then select * into r from dash_llaves where tipo = 'admin' limit 1; if found then return r; end if; end if;
    raise exception 'Su usuario no tiene un vendedor asignado (Administración → Usuarios → Vendedor).';
  end if;
  return r;
end $$;
revoke execute on function app.dash_acc(text) from anon, authenticated, public;

create or replace function public.dash_dims(como text default '') returns json
language plpgsql stable security definer set search_path = public, app as $$
declare a dash_llaves := app.dash_acc(como);
begin
  return json_build_object('dims', (select dims from dash_dims where id = 1), 'vista', a.etiqueta,
                           'empresa', a.tipo = 'admin', 'llave', a.llave);
end $$;
revoke execute on function public.dash_dims(text) from anon, public;
grant  execute on function public.dash_dims(text) to authenticated;

create or replace function public.dash_parte(mes text, como text default '') returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare a dash_llaves := app.dash_acc(como); d jsonb;
begin
  select p.datos into d from dash_partes p where p.mes = dash_parte.mes and p.llave = a.llave;
  if d is null then raise exception 'No hay datos de %', mes; end if;
  return d;
end $$;
revoke execute on function public.dash_parte(text, text) from anon, public;
grant  execute on function public.dash_parte(text, text) to authenticated;

-- Lo que llama el robot de Guival Maestros.
--   tipo 'dims'   : datos = {"dims": "<texto de dims.json>"}
--   tipo 'llaves' : datos = [[clave, llave, tipo, etiqueta, como], ...]  (reemplaza todo)
--   tipo 'parte'  : datos = {"mes": "2026-11", "ver": "...", "partes": {"<llave>": {m,n,docs,z}, ...}}
--                   reemplaza las copias de ese mes (borra las de llaves que ya no existen)
create or replace function public.robot_dash(llave text, tipo text, datos jsonb) returns int
language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare n int := 0;
begin
  if not app.robot_ok(llave) then raise exception 'llave de robot no válida'; end if;
  if tipo = 'dims' then
    insert into dash_dims(id, dims, actualizado) values (1, datos->>'dims', now())
    on conflict (id) do update set dims = excluded.dims, actualizado = now();
    insert into cargas(fuente, ultimo_archivo, actualizado) values ('dashboard', null, now())
    on conflict (fuente) do update set actualizado = now();
    return 1;
  elsif tipo = 'llaves' then
    delete from dash_llaves where true;
    insert into dash_llaves(clave, llave, tipo, etiqueta, como)
    select x->>0, x->>1, x->>2, coalesce(x->>3, ''), coalesce((x->>4)::boolean, false) from jsonb_array_elements(datos) x
    on conflict (clave) do nothing;
    get diagnostics n = row_count; return n;
  elsif tipo = 'parte' then
    delete from dash_partes where mes = datos->>'mes' and not (datos->'partes' ? dash_partes.llave);
    insert into dash_partes(mes, llave, ver, datos)
    select datos->>'mes', e.key, datos->>'ver', e.value from jsonb_each(datos->'partes') e
    on conflict (mes, llave) do update set ver = excluded.ver, datos = excluded.datos;
    get diagnostics n = row_count; return n;
  end if;
  raise exception 'tipo desconocido: %', tipo;
end $$;
revoke execute on function public.robot_dash(text, text, jsonb) from public, authenticated;
grant  execute on function public.robot_dash(text, text, jsonb) to anon;
