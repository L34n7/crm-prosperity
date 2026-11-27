-- A primeira migração do Supabase para a leitura foi aplicada em produção.
-- Este arquivo documenta a mesma mudança para novos ambientes.
alter table public.agente_ia_ferramentas
  drop constraint if exists agente_ia_ferramentas_tipo_check;
alter table public.agente_ia_ferramentas
  add constraint agente_ia_ferramentas_tipo_check
  check (tipo = any(array[
    'consultar_conhecimento','consultar_agenda','criar_agendamento',
    'remarcar_agendamento','cancelar_agendamento','consultar_contato',
    'transferir_humano','consultar_produtos_estoque','informar_valor_produto',
    'consultar_servicos','consultar_imoveis','registrar_interesse_preferencia',
    'realizar_venda','gerar_cotacao_veicular','enviar_material',
    'interpretar_arquivo'
  ]::text[]));

create or replace function public.agente_ia_registrar_analise_arquivo(
 p_empresa_id uuid, p_mensagem_id uuid, p_analise jsonb
) returns boolean language plpgsql security definer set search_path=''
as $$
begin
  if p_analise is null or jsonb_typeof(p_analise) <> 'object'
     or pg_catalog.length(p_analise::text) > 12000 then
    raise exception 'Dados de análise inválidos';
  end if;
  update public.mensagens
  set metadata_json = coalesce(metadata_json,'{}'::jsonb) ||
       pg_catalog.jsonb_build_object('agente_ia_interpretacao_arquivo',p_analise),
      updated_at = now()
  where id=p_mensagem_id and empresa_id=p_empresa_id
   and remetente_tipo='contato' and tipo_mensagem='documento';
  return found;
end;
$$;
revoke all on function public.agente_ia_registrar_analise_arquivo(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.agente_ia_registrar_analise_arquivo(uuid,uuid,jsonb) to service_role;
