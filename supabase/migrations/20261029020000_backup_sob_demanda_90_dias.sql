-- A exportação só começa após solicitação humana. Retenção de 90 dias não exige backup criado.
alter table public.empresas
  add column if not exists encerramento_backup_cursor jsonb,
  add column if not exists encerramento_backup_partes jsonb not null default '[]'::jsonb;

alter table public.empresa_encerramento_financeiro
  add column if not exists backup_paths jsonb not null default '[]'::jsonb;

-- A função de expurgo retém o resumo financeiro, sem condicionar exclusão à exportação.
create or replace function public.excluir_empresa_com_retentcao_admin(p_empresa_id uuid)
returns jsonb language plpgsql security invoker
set search_path = 'public' as $$
declare
  v_empresa public.empresas%rowtype;
  v_resultado jsonb;
begin
  select * into v_empresa from public.empresas where id=p_empresa_id for update;
  if not found then raise exception 'Empresa não encontrada.'; end if;
  if v_empresa.status <> 'cancelada' then raise exception 'Empresa não está cancelada.'; end if;
  if v_empresa.exclusao_prevista_em is null or v_empresa.exclusao_prevista_em > now() then
    raise exception 'O prazo de retenção de 90 dias ainda não terminou.';
  end if;
  if v_empresa.encerramento_backup_estado = 'processando'
     and v_empresa.encerramento_backup_tentado_em > now() - interval '30 minutes' then
    raise exception 'Uma exportação solicitada está em processamento.';
  end if;
  if v_empresa.white_label_tipo='gestora' and exists(
    select 1 from public.empresas where white_label_id=v_empresa.white_label_id
       and white_label_tipo='cliente'
  ) then
    raise exception 'Gestora possui clientes White Label vinculados.';
  end if;

  insert into public.empresa_encerramento_financeiro (
    cliente_id,empresa_nome,white_label_id,cancelada_em,assinatura_status,
    pagamentos,backup_path,backup_paths,arquivos_midias,limpeza_status,auth_user_ids
  ) values (
    v_empresa.id,v_empresa.nome_fantasia,v_empresa.white_label_id,
    v_empresa.cancelada_em,v_empresa.assinatura_status,
    coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'gateway',p.gateway,'evento',p.evento,'transaction_id',p.transaction_id,
      'status',p.status,'metodo',p.metodo,'valor',p.valor,
      'valor_liquido',p.valor_liquido,'created_at',p.created_at,
      'paid_at',p.paid_at,'refunded_at',p.refunded_at
    )) from public.pagamentos p where p.empresa_id=v_empresa.id),'[]'::jsonb),
    v_empresa.encerramento_backup_path,
    coalesce(v_empresa.encerramento_backup_partes,'[]'::jsonb),
    coalesce((select jsonb_agg(m.storage_path) from public.midias m
      where m.empresa_id=v_empresa.id and m.storage_path is not null),'[]'::jsonb),
    'pendente',
    coalesce((select array_agg(distinct u.auth_user_id) from public.usuarios u
      where u.empresa_id=v_empresa.id and u.auth_user_id is not null),array[]::uuid[])
  )
  on conflict (cliente_id) do nothing;
  v_resultado := public.excluir_empresa_definitivamente_admin(p_empresa_id);
  return jsonb_build_object('ok',true,'empresa_id',p_empresa_id,
    'exclusao',v_resultado,'financeiro_preservado',true);
end $$;

revoke all on function public.excluir_empresa_com_retentcao_admin(uuid) from public,anon,authenticated;
grant execute on function public.excluir_empresa_com_retentcao_admin(uuid) to service_role;
