-- Exclusão antecipada é exclusiva do administrador e exige backup já finalizado.
-- A confirmação de recebimento de todos os arquivos é exigida pela API administrativa.
create or replace function public.excluir_empresa_antecipada_admin(p_empresa_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = 'public'
as $$
declare
  v_empresa public.empresas%rowtype;
  v_resultado jsonb;
begin
  select * into v_empresa from public.empresas where id=p_empresa_id for update;
  if not found then raise exception 'Empresa não encontrada.'; end if;
  if v_empresa.status <> 'cancelada' then raise exception 'A empresa precisa estar cancelada.'; end if;
  if v_empresa.exclusao_prevista_em is null then raise exception 'Sem prazo de retenção registrado.'; end if;
  if v_empresa.exclusao_prevista_em <= now() then
    return public.excluir_empresa_com_retentcao_admin(p_empresa_id);
  end if;
  if v_empresa.encerramento_backup_estado <> 'pronto'
    or (v_empresa.encerramento_backup_path is null
      and jsonb_array_length(coalesce(v_empresa.encerramento_backup_partes,'[]'::jsonb))=0)
  then
    raise exception 'A exclusão antecipada exige um backup concluído.';
  end if;
  -- O ajuste do vencimento e a exclusão são feitos na mesma transação.
  -- Em caso de erro, ambos sofrem rollback.
  update public.empresas set exclusao_prevista_em=now() where id=p_empresa_id;
  v_resultado := public.excluir_empresa_com_retentcao_admin(p_empresa_id);
  return jsonb_build_object('ok',true,'antecipada',true,'exclusao',v_resultado);
end $$;

revoke all on function public.excluir_empresa_antecipada_admin(uuid)
  from public,anon,authenticated;
grant execute on function public.excluir_empresa_antecipada_admin(uuid)
  to service_role;
