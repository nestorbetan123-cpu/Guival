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
    on conflict on constraint dash_partes_pkey do update set ver = excluded.ver, datos = excluded.datos;
    get diagnostics n = row_count; return n;
  end if;
  raise exception 'tipo desconocido: %', tipo;
end $$;
revoke execute on function public.robot_dash(text, text, jsonb) from public, authenticated;
grant  execute on function public.robot_dash(text, text, jsonb) to anon;
