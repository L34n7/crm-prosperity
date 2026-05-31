insert into public.permissoes (codigo, descricao)
values
  ('usuarios.remover', 'Remover usuarios')
on conflict (codigo) do update
set descricao = excluded.descricao;

insert into public.perfil_permissoes (perfil_empresa_id, permissao_codigo)
select id, 'usuarios.remover'
from public.perfis_empresa
where lower(nome) = 'administrador'
on conflict do nothing;

-- Preserva registros historicos ao remover uma conta operacional. Vinculos
-- obrigatorios pertencentes ao usuario sao removidos; referencias opcionais
-- como autor e responsavel permanecem no registro com valor nulo.
do $$
declare
  constraint_item record;
  delete_action text;
  constraint_definition text;
begin
  for constraint_item in
    select
      constraint_row.conrelid::regclass as table_name,
      constraint_row.conname,
      bool_and(not column_row.attnotnull) as all_columns_nullable,
      pg_get_constraintdef(constraint_row.oid) as definition
    from pg_constraint constraint_row
    join pg_attribute column_row
      on column_row.attrelid = constraint_row.conrelid
     and column_row.attnum = any(constraint_row.conkey)
    where constraint_row.contype = 'f'
      and constraint_row.confrelid = 'public.usuarios'::regclass
    group by constraint_row.oid, constraint_row.conrelid, constraint_row.conname
  loop
    delete_action := case
      when constraint_item.all_columns_nullable then 'SET NULL'
      else 'CASCADE'
    end;

    constraint_definition := regexp_replace(
      constraint_item.definition,
      '[[:space:]]+ON DELETE[[:space:]]+(NO ACTION|RESTRICT|CASCADE|SET NULL|SET DEFAULT)',
      '',
      'i'
    );

    execute format(
      'alter table %s drop constraint %I, add constraint %I %s on delete %s',
      constraint_item.table_name,
      constraint_item.conname,
      constraint_item.conname,
      constraint_definition,
      delete_action
    );
  end loop;
end $$;
