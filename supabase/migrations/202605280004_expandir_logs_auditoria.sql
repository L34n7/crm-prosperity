alter table public.logs_auditoria
  add column if not exists categoria text,
  add column if not exists descricao text,
  add column if not exists antes jsonb,
  add column if not exists depois jsonb,
  add column if not exists metadata jsonb,
  add column if not exists ip text,
  add column if not exists user_agent text;

do $$
declare
  constraint_item record;
begin
  for constraint_item in
    select conname
    from pg_constraint
    where conrelid = 'public.logs_auditoria'::regclass
      and contype = 'c'
      and (
        pg_get_constraintdef(oid) ilike '%entidade%'
        or pg_get_constraintdef(oid) ilike '%acao%'
      )
  loop
    execute format(
      'alter table public.logs_auditoria drop constraint if exists %I',
      constraint_item.conname
    );
  end loop;
end $$;

create index if not exists logs_auditoria_empresa_categoria_created_idx
  on public.logs_auditoria (empresa_id, categoria, created_at desc);

create index if not exists logs_auditoria_usuario_created_idx
  on public.logs_auditoria (usuario_id, created_at desc);
