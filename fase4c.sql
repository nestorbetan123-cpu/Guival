create or replace function public.dash_parte(mes text, como text default '') returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare a dash_llaves := app.dash_acc(como); d jsonb;
begin
  -- solo si la copia es la misma versión que anuncia dims (si no, la app la trae del servidor anterior)
  select p.datos into d from dash_partes p
   where p.mes = dash_parte.mes and p.llave = a.llave
     and p.ver = (select (x.dims::jsonb)->'parts'->>dash_parte.mes from dash_dims x where x.id = 1);
  if d is null then raise exception 'No hay datos de %', mes; end if;
  return d;
end $$;
revoke execute on function public.dash_parte(text, text) from anon, public;
grant  execute on function public.dash_parte(text, text) to authenticated;

