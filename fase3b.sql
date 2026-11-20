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
