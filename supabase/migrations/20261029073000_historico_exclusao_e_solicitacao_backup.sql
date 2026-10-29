-- Registra quando a exportação foi solicitada, sem gerar qualquer backup automaticamente.
alter table public.empresas
  add column if not exists encerramento_backup_solicitado_em timestamptz;

-- Resumo administrativo somente-leitura, fora das tabelas operacionais apagadas.
-- O registro financeiro já preserva nome, datas e dados mínimos de auditoria.
alter table public.empresa_encerramento_financeiro
  add column if not exists inicio_em timestamptz,
  add column if not exists backup_solicitado_em timestamptz,
  add column if not exists white_label_tipo text;

-- Evita reescrever a rotina de exclusão (inclusive a antecipada): a rotina
-- financeira registra a empresa e este gatilho completa os dados antes do DELETE.
create or replace function public.registrar_datas_historico_empresa_excluida()
returns trigger language plpgsql security invoker
set search_path = 'public' as $$
begin
  if OLD.status = 'cancelada' then
    update public.empresa_encerramento_financeiro
       set inicio_em = OLD.created_at,
           cancelada_em = coalesce(OLD.cancelada_em,cancelada_em),
           backup_solicitado_em = OLD.encerramento_backup_solicitado_em,
           white_label_tipo = OLD.white_label_tipo,
           excluida_em = now()
     where cliente_id = OLD.id;
    if not found then
      raise exception 'Histórico de exclusão ausente. A exclusão foi interrompida para evitar perda de rastreabilidade.';
    end if;
  end if;
  return OLD;
end $$;

drop trigger if exists registrar_datas_historico_empresa_excluida on public.empresas;
create trigger registrar_datas_historico_empresa_excluida
  before delete on public.empresas
  for each row execute function public.registrar_datas_historico_empresa_excluida();

revoke all on function public.registrar_datas_historico_empresa_excluida() from public,anon,authenticated;
