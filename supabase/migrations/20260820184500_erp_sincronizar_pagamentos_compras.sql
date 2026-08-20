-- Mantem Compras e Contas a pagar no mesmo razao financeiro.

insert into public.financeiro_contas_pagar(
  empresa_id,documento_id,parceiro_id,descricao,numero_documento,competencia,
  vencimento_em,valor_original,valor_pago,status,created_by,updated_by
)
select d.empresa_id,d.id,d.parceiro_id,'Compra #'||d.numero,d.numero::text,d.data_emissao,
  coalesce(d.previsao_em,d.data_emissao),d.total,least(d.valor_pago,d.total),
  case when d.valor_pago>=d.total then 'paga' when d.valor_pago>0 then 'parcial' else 'aberta' end,
  d.created_by,d.updated_by
from public.comercial_documentos d
where d.tipo='pedido_compra' and d.status in ('aprovado','parcial','concluido') and d.total>0
on conflict (empresa_id,documento_id) where documento_id is not null and status<>'cancelada'
do update set valor_original=excluded.valor_original,valor_pago=excluded.valor_pago,
  status=excluded.status,vencimento_em=excluded.vencimento_em,updated_at=now();

create or replace function public.financeiro_sincronizar_pagamento_compra()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_documento_id uuid; v_empresa_id uuid; v_pago numeric;
begin
  v_documento_id:=coalesce(new.documento_id,old.documento_id);
  v_empresa_id:=coalesce(new.empresa_id,old.empresa_id);
  if not exists(select 1 from public.comercial_documentos where empresa_id=v_empresa_id and id=v_documento_id and tipo='pedido_compra') then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  select coalesce(sum(valor),0) into v_pago from public.comercial_pagamentos
    where empresa_id=v_empresa_id and documento_id=v_documento_id and status='confirmado';
  update public.financeiro_contas_pagar set valor_pago=least(v_pago,valor_original),
    status=case when v_pago>=valor_original then 'paga' when v_pago>0 then 'parcial' else 'aberta' end,
    updated_at=now() where empresa_id=v_empresa_id and documento_id=v_documento_id and status<>'cancelada';
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
drop trigger if exists comercial_pagamentos_sincronizar_conta_trg on public.comercial_pagamentos;
create trigger comercial_pagamentos_sincronizar_conta_trg after insert or update or delete on public.comercial_pagamentos
for each row execute function public.financeiro_sincronizar_pagamento_compra();

create or replace function public.financeiro_baixar_conta_pagar(
  p_empresa_id uuid,p_conta_id uuid,p_valor numeric,p_forma text,p_pago_em timestamptz,
  p_referencia text,p_observacao text,p_idempotency_key text,p_usuario_id uuid
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_conta public.financeiro_contas_pagar%rowtype; v_id uuid; v_pago numeric;
begin
  select * into v_conta from public.financeiro_contas_pagar where empresa_id=p_empresa_id and id=p_conta_id for update;
  if not found or v_conta.status='cancelada' then raise exception 'Conta a pagar invalida.'; end if;
  if p_valor<=0 or p_valor>v_conta.valor_original-v_conta.valor_pago then raise exception 'Valor da baixa excede o saldo da conta.'; end if;
  insert into public.financeiro_contas_pagar_baixas(empresa_id,conta_id,valor,forma,pago_em,referencia,observacao,idempotency_key,created_by)
  values(p_empresa_id,p_conta_id,p_valor,p_forma,coalesce(p_pago_em,now()),nullif(btrim(p_referencia),''),nullif(btrim(p_observacao),''),p_idempotency_key,p_usuario_id)
  returning id into v_id;
  if v_conta.documento_id is not null then
    insert into public.comercial_pagamentos(empresa_id,documento_id,tipo,status,forma,valor,vencimento_em,confirmado_em,referencia,observacao,idempotency_key,created_by)
    values(p_empresa_id,v_conta.documento_id,'pagar','confirmado',p_forma,p_valor,v_conta.vencimento_em,coalesce(p_pago_em,now()),p_referencia,p_observacao,'conta:'||p_idempotency_key,p_usuario_id);
    update public.comercial_documentos d set valor_pago=(select coalesce(sum(valor),0) from public.comercial_pagamentos where empresa_id=p_empresa_id and documento_id=v_conta.documento_id and status='confirmado'),updated_at=now()
      where d.empresa_id=p_empresa_id and d.id=v_conta.documento_id;
  end if;
  select coalesce(sum(valor),0) into v_pago from public.financeiro_contas_pagar_baixas where empresa_id=p_empresa_id and conta_id=p_conta_id;
  if v_conta.documento_id is not null then
    select coalesce(sum(valor),0) into v_pago from public.comercial_pagamentos where empresa_id=p_empresa_id and documento_id=v_conta.documento_id and status='confirmado';
  end if;
  update public.financeiro_contas_pagar set valor_pago=least(v_pago,valor_original),status=case when v_pago>=valor_original then 'paga' else 'parcial' end,updated_by=p_usuario_id,updated_at=now() where id=p_conta_id;
  return v_id;
end $$;

revoke all on function public.financeiro_baixar_conta_pagar(uuid,uuid,numeric,text,timestamptz,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.financeiro_baixar_conta_pagar(uuid,uuid,numeric,text,timestamptz,text,text,text,uuid) to service_role;
