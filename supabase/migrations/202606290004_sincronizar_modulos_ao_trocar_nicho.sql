-- Mantém os módulos da empresa coerentes quando o nicho é alterado.
create or replace function public.sincronizar_modulos_padrao_empresa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.empresa_modulos
  set
    habilitado = false,
    updated_at = now()
  where empresa_id = new.id
    and modulo_codigo not in (
      select nicho_modulo.modulo_codigo
      from public.nicho_modulos nicho_modulo
      where nicho_modulo.nicho_id = new.nicho_id
    );

  insert into public.empresa_modulos (empresa_id, modulo_codigo, habilitado)
  select new.id, nicho_modulo.modulo_codigo, true
  from public.nicho_modulos nicho_modulo
  where nicho_modulo.nicho_id = new.nicho_id
  on conflict (empresa_id, modulo_codigo) do update
  set
    habilitado = true,
    updated_at = now();

  return new;
end;
$$;
