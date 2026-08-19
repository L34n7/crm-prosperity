-- Validacoes finais e idempotencia das operacoes de compras.

create or replace function public.comercial_salvar_pedido_compra(
  p_empresa_id uuid,
  p_documento_id uuid,
  p_parceiro_id uuid,
  p_deposito_id uuid,
  p_data_emissao date,
  p_previsao_em date,
  p_desconto numeric,
  p_acrescimo numeric,
  p_frete numeric,
  p_observacao text,
  p_itens jsonb,
  p_usuario_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.comercial_parceiros
     where empresa_id=p_empresa_id and id=p_parceiro_id
       and tipo in ('fornecedor','ambos') and ativo
  ) then raise exception 'Fornecedor invalido.'; end if;
  if not exists (
    select 1 from public.estoque_depositos
     where empresa_id=p_empresa_id and id=p_deposito_id and ativo
  ) then raise exception 'Deposito invalido.'; end if;

  return public.comercial_salvar_documento(
    p_empresa_id,p_documento_id,'pedido_compra',p_parceiro_id,null,p_deposito_id,
    p_data_emissao,null,p_previsao_em,p_desconto,p_acrescimo,p_frete,
    p_observacao,p_itens,p_usuario_id
  );
end;
$$;

create or replace function public.comercial_registrar_pagamento_compra(
  p_empresa_id uuid,
  p_documento_id uuid,
  p_valor numeric,
  p_forma text,
  p_vencimento date,
  p_confirmar boolean,
  p_referencia text,
  p_observacao text,
  p_idempotency_key text,
  p_usuario_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_doc public.comercial_documentos%rowtype; v_pago numeric; v_id uuid;
begin
  if nullif(trim(coalesce(p_idempotency_key,'')),'') is null then
    raise exception 'Chave de idempotencia obrigatoria.';
  end if;
  select id into v_id from public.comercial_pagamentos
   where empresa_id=p_empresa_id and idempotency_key=p_idempotency_key;
  if found then return v_id; end if;

  select * into v_doc from public.comercial_documentos
   where empresa_id=p_empresa_id and id=p_documento_id and tipo='pedido_compra'
   for update;
  if not found then raise exception 'Pedido de compra nao encontrado.'; end if;
  if v_doc.status='cancelado' then raise exception 'Pedido cancelado nao aceita pagamento.'; end if;
  if coalesce(p_valor,0)<=0 then raise exception 'Valor do pagamento invalido.'; end if;
  select coalesce(sum(valor),0) into v_pago from public.comercial_pagamentos
   where empresa_id=p_empresa_id and documento_id=p_documento_id and status='confirmado';
  if p_confirmar and v_pago+p_valor>v_doc.total then raise exception 'Pagamento excede o total do pedido.'; end if;
  return public.comercial_registrar_pagamento(
    p_empresa_id,p_documento_id,p_valor,p_forma,p_vencimento,p_confirmar,
    p_referencia,p_observacao,p_idempotency_key,p_usuario_id
  );
end;
$$;

revoke execute on function public.comercial_salvar_pedido_compra(uuid,uuid,uuid,uuid,date,date,numeric,numeric,numeric,text,jsonb,uuid) from public,anon,authenticated;
revoke execute on function public.comercial_registrar_pagamento_compra(uuid,uuid,numeric,text,date,boolean,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.comercial_salvar_pedido_compra(uuid,uuid,uuid,uuid,date,date,numeric,numeric,numeric,text,jsonb,uuid) to service_role;
grant execute on function public.comercial_registrar_pagamento_compra(uuid,uuid,numeric,text,date,boolean,text,text,text,uuid) to service_role;
