-- Converte o orcamento aceito em pedido de venda sem reservar estoque antes da conversao.
create or replace function public.comercial_converter_orcamento(p_empresa_id uuid,p_documento_id uuid,p_usuario_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_origem public.comercial_documentos%rowtype; v_destino uuid;
begin
  select * into v_origem from public.comercial_documentos
   where empresa_id=p_empresa_id and id=p_documento_id and tipo='orcamento' and status in ('rascunho','enviado','aprovado') for update;
  if not found then
    select id into v_destino from public.comercial_documentos where empresa_id=p_empresa_id and documento_origem_id=p_documento_id and tipo='pedido_venda';
    if v_destino is not null then return v_destino; end if;
    raise exception 'Orcamento nao pode ser convertido.';
  end if;
  select id into v_destino from public.comercial_documentos where empresa_id=p_empresa_id and documento_origem_id=p_documento_id and tipo='pedido_venda';
  if v_destino is not null then return v_destino; end if;
  insert into public.comercial_documentos(empresa_id,tipo,status,parceiro_id,contato_id,documento_origem_id,deposito_id,data_emissao,validade_em,previsao_em,subtotal,desconto,acrescimo,frete,total,observacao,created_by,updated_by)
  values(p_empresa_id,'pedido_venda','rascunho',v_origem.parceiro_id,v_origem.contato_id,v_origem.id,v_origem.deposito_id,current_date,v_origem.validade_em,v_origem.previsao_em,v_origem.subtotal,v_origem.desconto,v_origem.acrescimo,v_origem.frete,v_origem.total,v_origem.observacao,p_usuario_id,p_usuario_id)
  returning id into v_destino;
  insert into public.comercial_documento_itens(empresa_id,documento_id,catalogo_servico_id,estoque_item_id,descricao,unidade,quantidade,valor_unitario,desconto,deposito_id,observacao)
  select p_empresa_id,v_destino,catalogo_servico_id,estoque_item_id,descricao,unidade,quantidade,valor_unitario,desconto,deposito_id,observacao
  from public.comercial_documento_itens where empresa_id=p_empresa_id and documento_id=p_documento_id;
  update public.comercial_documentos set status='concluido',concluido_em=now(),aprovado_por=p_usuario_id,aprovado_em=now(),updated_by=p_usuario_id,updated_at=now() where id=p_documento_id;
  return v_destino;
end $$;

revoke execute on function public.comercial_converter_orcamento(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.comercial_converter_orcamento(uuid,uuid,uuid) to service_role;

