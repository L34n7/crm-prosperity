-- PDV, contas a pagar, conversoes de embalagem e trilha fiscal NFC-e.
-- Quantidades permanecem normalizadas na unidade-base de estoque_itens.

alter table public.estoque_itens
  add column if not exists ncm text,
  add column if not exists cest text,
  add column if not exists origem_mercadoria smallint not null default 0,
  add column if not exists cfop_venda text,
  add column if not exists csosn_cst text,
  add column if not exists aliquota_icms numeric(8,4) not null default 0,
  add column if not exists aliquota_pis numeric(8,4) not null default 0,
  add column if not exists aliquota_cofins numeric(8,4) not null default 0;

create table if not exists public.estoque_embalagens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  estoque_item_id uuid not null references public.estoque_itens(id) on delete cascade,
  nome text not null,
  sigla text not null,
  fator_conversao numeric(18,6) not null check (fator_conversao > 0),
  codigo_barras text,
  preco_venda numeric(18,2) check (preco_venda is null or preco_venda >= 0),
  permite_compra boolean not null default true,
  permite_venda boolean not null default true,
  padrao_compra boolean not null default false,
  padrao_venda boolean not null default false,
  ativo boolean not null default true,
  created_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, id),
  unique (empresa_id, estoque_item_id, nome),
  unique (empresa_id, estoque_item_id, sigla)
);
create unique index if not exists estoque_embalagens_codigo_barras_uk
  on public.estoque_embalagens(empresa_id, codigo_barras)
  where codigo_barras is not null and btrim(codigo_barras) <> '' and ativo;
create unique index if not exists estoque_embalagens_padrao_compra_uk
  on public.estoque_embalagens(empresa_id, estoque_item_id) where padrao_compra and ativo;
create unique index if not exists estoque_embalagens_padrao_venda_uk
  on public.estoque_embalagens(empresa_id, estoque_item_id) where padrao_venda and ativo;
create index if not exists estoque_embalagens_item_idx
  on public.estoque_embalagens(empresa_id, estoque_item_id, ativo);

alter table public.comercial_documento_itens
  add column if not exists embalagem_id uuid references public.estoque_embalagens(id) on delete restrict,
  add column if not exists quantidade_comercial numeric(18,6),
  add column if not exists unidade_comercial text,
  add column if not exists fator_conversao numeric(18,6) not null default 1,
  add column if not exists valor_unitario_comercial numeric(18,6);

create table if not exists public.financeiro_contas_pagar (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  documento_id uuid references public.comercial_documentos(id) on delete restrict,
  parceiro_id uuid,
  descricao text not null,
  numero_documento text,
  competencia date not null default current_date,
  vencimento_em date not null,
  valor_original numeric(18,2) not null check (valor_original > 0),
  valor_pago numeric(18,2) not null default 0 check (valor_pago >= 0),
  status text not null default 'aberta' check (status in ('aberta','parcial','paga','cancelada')),
  categoria text,
  observacao text,
  created_by uuid references public.usuarios(id) on delete set null,
  updated_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, id),
  foreign key (empresa_id, parceiro_id) references public.comercial_parceiros(empresa_id, id) on delete restrict
);
create unique index if not exists financeiro_contas_pagar_documento_uk
  on public.financeiro_contas_pagar(empresa_id, documento_id) where documento_id is not null and status <> 'cancelada';
create index if not exists financeiro_contas_pagar_vencimento_idx
  on public.financeiro_contas_pagar(empresa_id, status, vencimento_em);

create table if not exists public.financeiro_contas_pagar_baixas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  conta_id uuid not null,
  valor numeric(18,2) not null check (valor > 0),
  forma text not null check (forma in ('dinheiro','pix','cartao_credito','cartao_debito','boleto','transferencia','outro')),
  pago_em timestamptz not null default now(),
  referencia text,
  observacao text,
  idempotency_key text not null,
  created_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (empresa_id, idempotency_key),
  foreign key (empresa_id, conta_id) references public.financeiro_contas_pagar(empresa_id, id) on delete restrict
);
create index if not exists financeiro_contas_pagar_baixas_conta_idx
  on public.financeiro_contas_pagar_baixas(empresa_id, conta_id, pago_em desc);

create table if not exists public.fiscal_configuracoes (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  provedor text not null default 'focus_nfe' check (provedor in ('focus_nfe')),
  ambiente text not null default 'homologacao' check (ambiente in ('homologacao','producao')),
  cnpj_emitente text,
  inscricao_estadual text,
  regime_tributario text not null default 'simples_nacional' check (regime_tributario in ('simples_nacional','simples_excesso','normal')),
  serie_nfce text,
  natureza_operacao text not null default 'VENDA AO CONSUMIDOR',
  cfop_padrao text not null default '5102',
  csosn_cst_padrao text not null default '102',
  ativo boolean not null default false,
  updated_by uuid references public.usuarios(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.fiscal_documentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  comercial_documento_id uuid not null references public.comercial_documentos(id) on delete restrict,
  tipo text not null default 'nfce' check (tipo in ('nfce')),
  ambiente text not null check (ambiente in ('homologacao','producao')),
  status text not null default 'pendente' check (status in ('pendente','processando','autorizada','rejeitada','cancelada','erro')),
  referencia text not null,
  chave text,
  numero text,
  serie text,
  protocolo text,
  url_danfe text,
  url_xml text,
  mensagem text,
  resposta jsonb,
  tentativas integer not null default 0,
  ultima_tentativa_em timestamptz,
  autorizado_em timestamptz,
  created_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, referencia),
  unique (empresa_id, comercial_documento_id, tipo)
);
create index if not exists fiscal_documentos_status_idx
  on public.fiscal_documentos(empresa_id, status, created_at desc);

create or replace function public.financeiro_sincronizar_conta_compra()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.tipo = 'pedido_compra' and new.status in ('aprovado','parcial','concluido') and new.total > 0 then
    insert into public.financeiro_contas_pagar(
      empresa_id, documento_id, parceiro_id, descricao, numero_documento,
      competencia, vencimento_em, valor_original, created_by, updated_by
    ) values (
      new.empresa_id, new.id, new.parceiro_id, 'Compra #' || new.numero,
      new.numero::text, new.data_emissao, coalesce(new.previsao_em, new.data_emissao),
      new.total, new.created_by, new.updated_by
    ) on conflict (empresa_id, documento_id) where documento_id is not null and status <> 'cancelada'
      do update set parceiro_id=excluded.parceiro_id, valor_original=excluded.valor_original,
        vencimento_em=excluded.vencimento_em, updated_by=excluded.updated_by, updated_at=now();
  elsif new.tipo = 'pedido_compra' and new.status = 'cancelado' then
    update public.financeiro_contas_pagar set status='cancelada', updated_by=new.updated_by, updated_at=now()
      where empresa_id=new.empresa_id and documento_id=new.id and valor_pago=0;
  end if;
  return new;
end $$;
drop trigger if exists comercial_documentos_conta_compra_trg on public.comercial_documentos;
create trigger comercial_documentos_conta_compra_trg
after insert or update of status,total,previsao_em on public.comercial_documentos
for each row execute function public.financeiro_sincronizar_conta_compra();

create or replace function public.financeiro_baixar_conta_pagar(
  p_empresa_id uuid, p_conta_id uuid, p_valor numeric, p_forma text,
  p_pago_em timestamptz, p_referencia text, p_observacao text,
  p_idempotency_key text, p_usuario_id uuid
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_conta public.financeiro_contas_pagar%rowtype; v_id uuid; v_pago numeric;
begin
  select * into v_conta from public.financeiro_contas_pagar
    where empresa_id=p_empresa_id and id=p_conta_id for update;
  if not found or v_conta.status='cancelada' then raise exception 'Conta a pagar invalida.'; end if;
  if p_valor <= 0 or p_valor > v_conta.valor_original-v_conta.valor_pago then
    raise exception 'Valor da baixa excede o saldo da conta.';
  end if;
  insert into public.financeiro_contas_pagar_baixas(
    empresa_id,conta_id,valor,forma,pago_em,referencia,observacao,idempotency_key,created_by
  ) values (p_empresa_id,p_conta_id,p_valor,p_forma,coalesce(p_pago_em,now()),
    nullif(btrim(p_referencia),''),nullif(btrim(p_observacao),''),p_idempotency_key,p_usuario_id)
  returning id into v_id;
  select coalesce(sum(valor),0) into v_pago from public.financeiro_contas_pagar_baixas
    where empresa_id=p_empresa_id and conta_id=p_conta_id;
  update public.financeiro_contas_pagar set valor_pago=v_pago,
    status=case when v_pago>=valor_original then 'paga' else 'parcial' end,
    updated_by=p_usuario_id,updated_at=now() where id=p_conta_id;
  return v_id;
end $$;

create or replace function public.erp_finalizar_venda_pdv(
  p_empresa_id uuid, p_deposito_id uuid, p_cliente_id uuid, p_contato_id uuid,
  p_itens jsonb, p_pagamentos jsonb, p_cpf_cnpj text, p_observacao text,
  p_emitir_nfce boolean, p_idempotency_key text, p_usuario_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_documento_id uuid; v_item jsonb; v_pagamento jsonb; v_produto public.estoque_itens%rowtype;
  v_embalagem public.estoque_embalagens%rowtype; v_quantidade numeric; v_fator numeric;
  v_valor_comercial numeric; v_total_pagamentos numeric:=0; v_total numeric; v_fiscal_id uuid;
begin
  select id into v_documento_id from public.comercial_documentos
    where empresa_id=p_empresa_id and idempotency_key=p_idempotency_key;
  if v_documento_id is not null then
    return jsonb_build_object('idempotente',true,'documento_id',v_documento_id);
  end if;
  if jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens)=0 then raise exception 'Informe os produtos da venda.'; end if;
  if jsonb_typeof(p_pagamentos)<>'array' or jsonb_array_length(p_pagamentos)=0 then raise exception 'Informe o pagamento da venda.'; end if;
  insert into public.comercial_documentos(
    empresa_id,tipo,status,parceiro_id,contato_id,deposito_id,data_emissao,
    idempotency_key,observacao,created_by,updated_by
  ) values (p_empresa_id,'venda','rascunho',p_cliente_id,p_contato_id,p_deposito_id,current_date,
    p_idempotency_key,nullif(btrim(p_observacao),''),p_usuario_id,p_usuario_id)
  returning id into v_documento_id;
  for v_item in select value from jsonb_array_elements(p_itens) loop
    select * into v_produto from public.estoque_itens where empresa_id=p_empresa_id
      and id=(v_item->>'estoque_item_id')::uuid and ativo for share;
    if not found then raise exception 'Produto invalido no PDV.'; end if;
    v_quantidade:=greatest(0,(v_item->>'quantidade')::numeric);
    if v_quantidade<=0 then raise exception 'Quantidade invalida para %.',v_produto.nome; end if;
    v_fator:=1; v_embalagem:=null;
    if nullif(v_item->>'embalagem_id','') is not null then
      select * into v_embalagem from public.estoque_embalagens where empresa_id=p_empresa_id
        and id=(v_item->>'embalagem_id')::uuid and estoque_item_id=v_produto.id and ativo and permite_venda;
      if not found then raise exception 'Embalagem invalida para %.',v_produto.nome; end if;
      v_fator:=v_embalagem.fator_conversao;
    end if;
    v_valor_comercial:=greatest(0,coalesce((v_item->>'valor_unitario')::numeric,v_embalagem.preco_venda,v_produto.preco_venda,0));
    insert into public.comercial_documento_itens(
      empresa_id,documento_id,estoque_item_id,descricao,unidade,quantidade,valor_unitario,
      desconto,deposito_id,embalagem_id,quantidade_comercial,unidade_comercial,fator_conversao,valor_unitario_comercial
    ) values (p_empresa_id,v_documento_id,v_produto.id,v_produto.nome,v_produto.unidade,
      v_quantidade*v_fator,case when v_fator=0 then 0 else v_valor_comercial/v_fator end,
      greatest(0,coalesce((v_item->>'desconto')::numeric,0)),p_deposito_id,v_embalagem.id,
      v_quantidade,coalesce(v_embalagem.sigla,v_produto.unidade),v_fator,v_valor_comercial);
  end loop;
  perform public.comercial_recalcular_documento(p_empresa_id,v_documento_id);
  select total into v_total from public.comercial_documentos where id=v_documento_id;
  for v_pagamento in select value from jsonb_array_elements(p_pagamentos) loop
    v_total_pagamentos:=v_total_pagamentos+greatest(0,(v_pagamento->>'valor')::numeric);
  end loop;
  if round(v_total_pagamentos,2)<>round(v_total,2) then raise exception 'Os pagamentos devem fechar exatamente o total da venda.'; end if;
  perform public.comercial_atender_documento(p_empresa_id,v_documento_id,p_usuario_id,p_idempotency_key||':estoque',null);
  for v_pagamento in select value from jsonb_array_elements(p_pagamentos) loop
    perform public.comercial_registrar_pagamento(p_empresa_id,v_documento_id,(v_pagamento->>'valor')::numeric,
      coalesce(nullif(v_pagamento->>'forma',''),'outro'),current_date,true,nullif(v_pagamento->>'referencia',''),
      null,p_idempotency_key||':pagamento:'||coalesce(v_pagamento->>'sequencia','1'),p_usuario_id);
  end loop;
  if p_emitir_nfce then
    insert into public.fiscal_documentos(empresa_id,comercial_documento_id,tipo,ambiente,status,referencia,created_by)
      select p_empresa_id,v_documento_id,'nfce',c.ambiente,'pendente','pdv-'||v_documento_id,p_usuario_id
      from public.fiscal_configuracoes c where c.empresa_id=p_empresa_id and c.ativo
      returning id into v_fiscal_id;
    if v_fiscal_id is null then raise exception 'Configure e ative a emissao de NFC-e antes de emitir.'; end if;
  end if;
  return jsonb_build_object('documento_id',v_documento_id,'fiscal_documento_id',v_fiscal_id,'total',v_total,'cpf_cnpj',nullif(regexp_replace(coalesce(p_cpf_cnpj,''),'\D','','g'),''));
end $$;

-- Normaliza pedidos de compra feitos em caixa/fardo para a unidade-base.
create or replace function public.comercial_salvar_pedido_compra(
  p_empresa_id uuid, p_documento_id uuid, p_parceiro_id uuid, p_deposito_id uuid,
  p_data_emissao date, p_previsao_em date, p_desconto numeric, p_acrescimo numeric,
  p_frete numeric, p_observacao text, p_itens jsonb, p_usuario_id uuid
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_item jsonb; v_normalizados jsonb:='[]'::jsonb; v_emb public.estoque_embalagens%rowtype;
begin
  if not exists(select 1 from public.comercial_parceiros where empresa_id=p_empresa_id and id=p_parceiro_id and tipo in ('fornecedor','ambos') and ativo) then raise exception 'Fornecedor invalido.'; end if;
  if not exists(select 1 from public.estoque_depositos where empresa_id=p_empresa_id and id=p_deposito_id and ativo) then raise exception 'Deposito invalido.'; end if;
  for v_item in select value from jsonb_array_elements(p_itens) loop
    v_emb:=null;
    if nullif(v_item->>'embalagem_id','') is not null then
      select * into v_emb from public.estoque_embalagens where empresa_id=p_empresa_id
        and id=(v_item->>'embalagem_id')::uuid and estoque_item_id=(v_item->>'estoque_item_id')::uuid and ativo and permite_compra;
      if not found then raise exception 'Embalagem de compra invalida.'; end if;
    end if;
    v_normalizados:=v_normalizados||jsonb_build_array(v_item||jsonb_build_object(
      'quantidade',coalesce(nullif(v_item->>'quantidade','')::numeric,0)*coalesce(v_emb.fator_conversao,1),
      'valor_unitario',case when coalesce(v_emb.fator_conversao,1)>0 then coalesce(nullif(v_item->>'valor_unitario','')::numeric,0)/coalesce(v_emb.fator_conversao,1) else 0 end,
      'unidade',(select unidade from public.estoque_itens where empresa_id=p_empresa_id and id=(v_item->>'estoque_item_id')::uuid)
    ));
  end loop;
  v_id:=public.comercial_salvar_documento(p_empresa_id,p_documento_id,'pedido_compra',p_parceiro_id,null,p_deposito_id,p_data_emissao,null,p_previsao_em,p_desconto,p_acrescimo,p_frete,p_observacao,v_normalizados,p_usuario_id);
  for v_item in select value from jsonb_array_elements(p_itens) loop
    if nullif(v_item->>'embalagem_id','') is not null then
      select * into v_emb from public.estoque_embalagens where id=(v_item->>'embalagem_id')::uuid;
      update public.comercial_documento_itens set embalagem_id=v_emb.id,
        quantidade_comercial=(v_item->>'quantidade')::numeric,unidade_comercial=v_emb.sigla,
        fator_conversao=v_emb.fator_conversao,valor_unitario_comercial=(v_item->>'valor_unitario')::numeric
      where empresa_id=p_empresa_id and documento_id=v_id and estoque_item_id=(v_item->>'estoque_item_id')::uuid;
    end if;
  end loop;
  return v_id;
end $$;

-- Importacao fiscal com NCM e metadados da embalagem preservados.
create or replace function public.comercial_importar_receber_xml_com_itens(
  p_empresa_id uuid,p_fornecedor jsonb,p_deposito_id uuid,p_itens jsonb,p_nfe jsonb,
  p_usuario_id uuid default null,p_idempotency_key text default null,p_observacao text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_item jsonb; v_itens jsonb:='[]'::jsonb; v_resultado jsonb; v_criacao jsonb;
  v_item_id uuid; v_codigo_barras text; v_codigo text; v_criados integer:=0; v_pedido_id uuid; v_emb public.estoque_embalagens%rowtype;
begin
  if jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens)=0 then raise exception 'A NF-e precisa possuir ao menos um item.'; end if;
  for v_item in select value from jsonb_array_elements(p_itens) loop
    v_item_id:=nullif(v_item->>'estoque_item_id','')::uuid;
    if v_item_id is null then
      if coalesce((v_item->>'criar_item')::boolean,false) is not true then raise exception 'Vincule ou cadastre todos os produtos da NF-e.'; end if;
      v_codigo_barras:=nullif(btrim(v_item->'novo_item'->>'codigo_barras'),'');
      v_codigo:=nullif(btrim(v_item->'novo_item'->>'codigo'),'');
      select id into v_item_id from public.estoque_itens where empresa_id=p_empresa_id and ativo and
        ((v_codigo_barras is not null and codigo_barras=v_codigo_barras) or (v_codigo is not null and (codigo=v_codigo or sku=v_codigo))) order by created_at limit 1;
      if v_item_id is null then
        v_criacao:=public.estoque_salvar_item_com_classificacoes(p_empresa_id,coalesce(v_item->'novo_item','{}'::jsonb),0,null,p_usuario_id);
        v_item_id:=(v_criacao->>'item_id')::uuid; v_criados:=v_criados+1;
      end if;
    end if;
    update public.estoque_itens set ncm=coalesce(ncm,nullif(regexp_replace(coalesce(v_item->>'ncm',v_item->'novo_item'->>'ncm',''),'\D','','g'),'')),updated_at=now()
      where empresa_id=p_empresa_id and id=v_item_id;
    v_item:=jsonb_set(v_item,'{estoque_item_id}',to_jsonb(v_item_id::text));
    v_itens:=v_itens||jsonb_build_array(v_item-'criar_item'-'novo_item');
  end loop;
  v_resultado:=public.comercial_importar_receber_xml(p_empresa_id,p_fornecedor,p_deposito_id,v_itens,p_nfe,p_usuario_id,p_idempotency_key,p_observacao);
  v_pedido_id:=nullif(v_resultado->>'pedido_id','')::uuid;
  if v_pedido_id is not null then
    for v_item in select value from jsonb_array_elements(v_itens) loop
      if nullif(v_item->>'embalagem_id','') is not null then
        select * into v_emb from public.estoque_embalagens where empresa_id=p_empresa_id and id=(v_item->>'embalagem_id')::uuid and estoque_item_id=(v_item->>'estoque_item_id')::uuid;
        if found then update public.comercial_documento_itens set embalagem_id=v_emb.id,
          quantidade_comercial=coalesce(nullif(v_item->>'quantidade_comercial','')::numeric,quantidade/v_emb.fator_conversao),
          unidade_comercial=coalesce(nullif(v_item->>'unidade_comercial',''),v_emb.sigla),fator_conversao=v_emb.fator_conversao,
          valor_unitario_comercial=coalesce(nullif(v_item->>'valor_unitario_comercial','')::numeric,valor_unitario*v_emb.fator_conversao)
          where empresa_id=p_empresa_id and documento_id=v_pedido_id and estoque_item_id=(v_item->>'estoque_item_id')::uuid;
        end if;
      end if;
    end loop;
  end if;
  return v_resultado||jsonb_build_object('itens_criados',v_criados);
end $$;

alter table public.estoque_embalagens enable row level security;
alter table public.financeiro_contas_pagar enable row level security;
alter table public.financeiro_contas_pagar_baixas enable row level security;
alter table public.fiscal_configuracoes enable row level security;
alter table public.fiscal_documentos enable row level security;

insert into public.permissoes(codigo,descricao) values
  ('pdv.visualizar','Visualizar o ponto de venda'),
  ('pdv.operar','Registrar vendas no ponto de venda'),
  ('financeiro.contas_pagar','Visualizar e baixar contas a pagar'),
  ('estoque.embalagens','Gerenciar conversoes de embalagem'),
  ('fiscal.configurar','Configurar emissao fiscal'),
  ('fiscal.emitir','Emitir e consultar NFC-e')
on conflict(codigo) do update set descricao=excluded.descricao;

insert into public.perfil_permissoes(perfil_empresa_id,permissao_codigo)
select p.id,pe.codigo from public.perfis_empresa p cross join public.permissoes pe
where lower(p.nome)='administrador' and pe.codigo in (
  'pdv.visualizar','pdv.operar','financeiro.contas_pagar','estoque.embalagens','fiscal.configurar','fiscal.emitir'
) on conflict do nothing;

revoke all on function public.financeiro_baixar_conta_pagar(uuid,uuid,numeric,text,timestamptz,text,text,text,uuid) from public;
revoke all on function public.erp_finalizar_venda_pdv(uuid,uuid,uuid,uuid,jsonb,jsonb,text,text,boolean,text,uuid) from public;
grant execute on function public.financeiro_baixar_conta_pagar(uuid,uuid,numeric,text,timestamptz,text,text,text,uuid) to service_role;
grant execute on function public.erp_finalizar_venda_pdv(uuid,uuid,uuid,uuid,jsonb,jsonb,text,text,boolean,text,uuid) to service_role;
grant execute on function public.comercial_salvar_pedido_compra(uuid,uuid,uuid,uuid,date,date,numeric,numeric,numeric,text,jsonb,uuid) to service_role;
grant execute on function public.comercial_importar_receber_xml_com_itens(uuid,jsonb,uuid,jsonb,jsonb,uuid,text,text) to service_role;
