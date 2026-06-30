-- Ao entrar em um nicho de saúde, preserva as pessoas existentes e cria
-- automaticamente a extensão clínica usada por prontuários e odontogramas.
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

  if exists (
    select 1
    from public.nichos nicho
    where nicho.id = new.nicho_id
      and nicho.grupo = 'saude'
  ) then
    insert into public.pacientes (empresa_id, pessoa_id)
    select pessoa.empresa_id, pessoa.id
    from public.pessoas pessoa
    where pessoa.empresa_id = new.id
    on conflict (empresa_id, pessoa_id) do nothing;
  end if;

  return new;
end;
$$;

-- Corrige empresas de saúde que possam ter pessoas sem a extensão de paciente.
insert into public.pacientes (empresa_id, pessoa_id)
select pessoa.empresa_id, pessoa.id
from public.pessoas pessoa
join public.empresas empresa
  on empresa.id = pessoa.empresa_id
join public.nichos nicho
  on nicho.id = empresa.nicho_id
where nicho.grupo = 'saude'
on conflict (empresa_id, pessoa_id) do nothing;
