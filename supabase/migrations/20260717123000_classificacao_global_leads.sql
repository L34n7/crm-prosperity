-- Centraliza a linguagem comercial do lead para todos os módulos:
-- novo, qualificado, convertido e perdido.

alter table public.contatos
  add column if not exists classificacao text,
  add column if not exists classificacao_atualizada_em timestamptz,
  add column if not exists classificacao_evento_id uuid,
  add column if not exists classificacao_protocolo_id uuid;

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
      from pg_constraint
     where conrelid = 'public.contatos'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike any (array[
         '%status_lead%',
         '%classificacao%'
       ])
  loop
    execute format('alter table public.contatos drop constraint if exists %I', constraint_record.conname);
  end loop;
end $$;

update public.contatos
   set classificacao = case
     when lower(coalesce(classificacao, '')) = 'cliente' then 'convertido'
     when lower(coalesce(classificacao, '')) in ('novo', 'qualificado', 'convertido', 'perdido') then lower(classificacao)
     when lower(coalesce(status_lead, '')) = 'cliente' then 'convertido'
     when lower(coalesce(status_lead, '')) = 'em_atendimento' then 'qualificado'
     when lower(coalesce(status_lead, '')) in ('novo', 'qualificado', 'convertido', 'perdido') then lower(status_lead)
     else 'novo'
   end,
       classificacao_atualizada_em = coalesce(classificacao_atualizada_em, updated_at, created_at, now())
 where classificacao is null
    or lower(classificacao) not in ('novo', 'qualificado', 'convertido', 'perdido', 'cliente');

update public.contatos
   set status_lead = case
     when classificacao = 'convertido' then 'cliente'
     when classificacao in ('novo', 'qualificado', 'perdido') then classificacao
     else coalesce(status_lead, 'novo')
   end
 where status_lead is null
    or lower(status_lead) not in ('novo', 'qualificado', 'cliente', 'perdido');

alter table public.contatos
  add constraint contatos_classificacao_check
    check (classificacao is null or classificacao in ('novo', 'qualificado', 'convertido', 'perdido')),
  add constraint contatos_status_lead_check
    check (status_lead is null or status_lead in ('novo', 'em_atendimento', 'qualificado', 'cliente', 'perdido'));

create index if not exists contatos_empresa_classificacao_idx
  on public.contatos (empresa_id, classificacao);

create index if not exists contatos_empresa_classificacao_atualizada_idx
  on public.contatos (empresa_id, classificacao_atualizada_em desc);
