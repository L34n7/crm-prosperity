create table if not exists public.estoque_precos_canais (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  estoque_item_id uuid not null references public.estoque_itens(id) on delete cascade,
  canal text not null check (canal in ('balcao', 'online', 'whatsapp')),
  preco numeric(14,2) not null check (preco >= 0),
  ativo boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, estoque_item_id, canal)
);

create table if not exists public.estoque_regras_pagamento (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  estoque_item_id uuid references public.estoque_itens(id) on delete cascade,
  canal text check (canal is null or canal in ('balcao', 'online', 'whatsapp')),
  forma text not null check (forma in ('pix', 'dinheiro', 'debito', 'credito')),
  parcelas_min smallint not null default 1 check (parcelas_min between 1 and 24),
  parcelas_max smallint not null default 1 check (parcelas_max between 1 and 24 and parcelas_max >= parcelas_min),
  tipo_ajuste text not null default 'nenhum' check (tipo_ajuste in ('nenhum', 'desconto_percentual', 'acrescimo_percentual', 'preco_fixo')),
  valor numeric(14,4) not null default 0 check (valor >= 0),
  ativo boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists estoque_regras_pagamento_escopo_uk
  on public.estoque_regras_pagamento
  (empresa_id, estoque_item_id, canal, forma, parcelas_min, parcelas_max)
  nulls not distinct;

create table if not exists public.estoque_promocoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null check (length(btrim(nome)) between 1 and 160),
  tipo_ajuste text not null check (tipo_ajuste in ('preco_fixo', 'desconto_percentual', 'desconto_valor')),
  valor numeric(14,4) not null check (valor >= 0),
  inicio_em timestamptz not null,
  fim_em timestamptz not null,
  canais text[] not null default array['balcao','online','whatsapp']::text[],
  prioridade integer not null default 0,
  ativo boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fim_em > inicio_em),
  check (cardinality(canais) > 0),
  check (canais <@ array['balcao','online','whatsapp']::text[]),
  check (tipo_ajuste <> 'desconto_percentual' or valor <= 100)
);

create table if not exists public.estoque_promocao_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  promocao_id uuid not null references public.estoque_promocoes(id) on delete cascade,
  estoque_item_id uuid not null references public.estoque_itens(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (promocao_id, estoque_item_id)
);

create table if not exists public.estoque_precos_historico (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  estoque_item_id uuid references public.estoque_itens(id) on delete set null,
  entidade_tipo text not null check (entidade_tipo in ('produto', 'canal', 'pagamento', 'promocao', 'massa')),
  entidade_id uuid,
  acao text not null,
  antes jsonb,
  depois jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists estoque_precos_canais_empresa_item_idx
  on public.estoque_precos_canais (empresa_id, estoque_item_id, canal)
  where ativo = true;
create index if not exists estoque_regras_pagamento_empresa_item_idx
  on public.estoque_regras_pagamento (empresa_id, estoque_item_id, forma, canal)
  where ativo = true;
create index if not exists estoque_promocoes_empresa_periodo_idx
  on public.estoque_promocoes (empresa_id, ativo, inicio_em, fim_em);
create index if not exists estoque_promocao_itens_empresa_item_idx
  on public.estoque_promocao_itens (empresa_id, estoque_item_id, promocao_id);
create index if not exists estoque_precos_historico_empresa_item_idx
  on public.estoque_precos_historico (empresa_id, estoque_item_id, created_at desc);

alter table public.estoque_precos_canais enable row level security;
alter table public.estoque_regras_pagamento enable row level security;
alter table public.estoque_promocoes enable row level security;
alter table public.estoque_promocao_itens enable row level security;
alter table public.estoque_precos_historico enable row level security;

drop policy if exists estoque_precos_canais_empresa_select on public.estoque_precos_canais;
create policy estoque_precos_canais_empresa_select on public.estoque_precos_canais
  for select to authenticated using (empresa_id = usuario_empresa_id_atual());
drop policy if exists estoque_regras_pagamento_empresa_select on public.estoque_regras_pagamento;
create policy estoque_regras_pagamento_empresa_select on public.estoque_regras_pagamento
  for select to authenticated using (empresa_id = usuario_empresa_id_atual());
drop policy if exists estoque_promocoes_empresa_select on public.estoque_promocoes;
create policy estoque_promocoes_empresa_select on public.estoque_promocoes
  for select to authenticated using (empresa_id = usuario_empresa_id_atual());
drop policy if exists estoque_promocao_itens_empresa_select on public.estoque_promocao_itens;
create policy estoque_promocao_itens_empresa_select on public.estoque_promocao_itens
  for select to authenticated using (empresa_id = usuario_empresa_id_atual());
drop policy if exists estoque_precos_historico_empresa_select on public.estoque_precos_historico;
create policy estoque_precos_historico_empresa_select on public.estoque_precos_historico
  for select to authenticated using (empresa_id = usuario_empresa_id_atual());

grant select on public.estoque_precos_canais, public.estoque_regras_pagamento, public.estoque_promocoes, public.estoque_promocao_itens, public.estoque_precos_historico to authenticated;
revoke insert, update, delete on public.estoque_precos_canais, public.estoque_regras_pagamento, public.estoque_promocoes, public.estoque_promocao_itens, public.estoque_precos_historico from anon, authenticated;

create or replace function public.estoque_validar_promocao_item_empresa()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_empresa_promocao uuid;
  v_empresa_item uuid;
begin
  select empresa_id into v_empresa_promocao from public.estoque_promocoes where id = new.promocao_id;
  select empresa_id into v_empresa_item from public.estoque_itens where id = new.estoque_item_id;
  if v_empresa_promocao is null or v_empresa_item is null or new.empresa_id <> v_empresa_promocao or new.empresa_id <> v_empresa_item then
    raise exception 'Promoção e produto devem pertencer à mesma empresa.';
  end if;
  return new;
end;
$$;

drop trigger if exists estoque_promocao_itens_validar_empresa on public.estoque_promocao_itens;
create trigger estoque_promocao_itens_validar_empresa
before insert or update on public.estoque_promocao_itens
for each row execute function public.estoque_validar_promocao_item_empresa();

create or replace function public.estoque_precos_salvar_produto(
  p_empresa_id uuid,
  p_estoque_item_id uuid,
  p_preco_base numeric,
  p_canais jsonb,
  p_pagamentos jsonb,
  p_usuario_id uuid default null
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_canal text;
  v_forma text;
  v_valor numeric;
  v_antes jsonb;
  v_depois jsonb;
begin
  if not exists (select 1 from public.estoque_itens where id = p_estoque_item_id and empresa_id = p_empresa_id) then
    raise exception 'Produto não encontrado para a empresa.';
  end if;
  if p_preco_base is not null and p_preco_base < 0 then
    raise exception 'Preço-base não pode ser negativo.';
  end if;

  select jsonb_build_object(
    'preco_base', preco_venda,
    'canais', coalesce((select jsonb_object_agg(canal, preco) from public.estoque_precos_canais where empresa_id=p_empresa_id and estoque_item_id=p_estoque_item_id and ativo=true), '{}'::jsonb),
    'pagamentos', coalesce((select jsonb_object_agg(forma, valor) from public.estoque_regras_pagamento where empresa_id=p_empresa_id and estoque_item_id=p_estoque_item_id and canal is null and parcelas_min=1 and parcelas_max=1 and tipo_ajuste='preco_fixo' and ativo=true), '{}'::jsonb)
  ) into v_antes
  from public.estoque_itens where id=p_estoque_item_id and empresa_id=p_empresa_id;

  update public.estoque_itens
  set preco_venda = p_preco_base, updated_by = p_usuario_id, updated_at = now(), versao = versao + 1
  where id = p_estoque_item_id and empresa_id = p_empresa_id;

  foreach v_canal in array array['balcao','online','whatsapp'] loop
    if coalesce(p_canais, '{}'::jsonb) ? v_canal then
      delete from public.estoque_precos_canais
       where empresa_id=p_empresa_id and estoque_item_id=p_estoque_item_id and canal=v_canal;
      if nullif(btrim(p_canais ->> v_canal), '') is not null then
        v_valor := (p_canais ->> v_canal)::numeric;
        if v_valor < 0 then raise exception 'Preço por canal não pode ser negativo.'; end if;
        insert into public.estoque_precos_canais(empresa_id,estoque_item_id,canal,preco,created_by,updated_by)
        values(p_empresa_id,p_estoque_item_id,v_canal,v_valor,p_usuario_id,p_usuario_id);
      end if;
    end if;
  end loop;

  foreach v_forma in array array['pix','dinheiro','debito','credito'] loop
    if coalesce(p_pagamentos, '{}'::jsonb) ? v_forma then
      delete from public.estoque_regras_pagamento
       where empresa_id=p_empresa_id and estoque_item_id=p_estoque_item_id and canal is null
         and forma=v_forma and parcelas_min=1 and parcelas_max=1 and tipo_ajuste='preco_fixo';
      if nullif(btrim(p_pagamentos ->> v_forma), '') is not null then
        v_valor := (p_pagamentos ->> v_forma)::numeric;
        if v_valor < 0 then raise exception 'Preço por forma de pagamento não pode ser negativo.'; end if;
        insert into public.estoque_regras_pagamento(empresa_id,estoque_item_id,canal,forma,parcelas_min,parcelas_max,tipo_ajuste,valor,created_by,updated_by)
        values(p_empresa_id,p_estoque_item_id,null,v_forma,1,1,'preco_fixo',v_valor,p_usuario_id,p_usuario_id);
      end if;
    end if;
  end loop;

  select jsonb_build_object(
    'preco_base', preco_venda,
    'canais', coalesce((select jsonb_object_agg(canal, preco) from public.estoque_precos_canais where empresa_id=p_empresa_id and estoque_item_id=p_estoque_item_id and ativo=true), '{}'::jsonb),
    'pagamentos', coalesce((select jsonb_object_agg(forma, valor) from public.estoque_regras_pagamento where empresa_id=p_empresa_id and estoque_item_id=p_estoque_item_id and canal is null and parcelas_min=1 and parcelas_max=1 and tipo_ajuste='preco_fixo' and ativo=true), '{}'::jsonb)
  ) into v_depois
  from public.estoque_itens where id=p_estoque_item_id and empresa_id=p_empresa_id;

  insert into public.estoque_precos_historico(empresa_id,estoque_item_id,entidade_tipo,acao,antes,depois,created_by)
  values(p_empresa_id,p_estoque_item_id,'produto','salvar_precos',v_antes,v_depois,p_usuario_id);
end;
$$;

create or replace function public.estoque_precos_aplicar_massa(
  p_empresa_id uuid,
  p_item_ids uuid[],
  p_alvo text,
  p_operacao text,
  p_valor numeric default null,
  p_usuario_id uuid default null
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_item_id uuid;
  v_atual numeric;
  v_novo numeric;
  v_canal text;
  v_forma text;
  v_total integer := 0;
begin
  if p_item_ids is null or cardinality(p_item_ids)=0 or cardinality(p_item_ids)>500 then
    raise exception 'Selecione entre 1 e 500 produtos.';
  end if;
  if exists (select 1 from unnest(p_item_ids) i where not exists (select 1 from public.estoque_itens e where e.id=i and e.empresa_id=p_empresa_id)) then
    raise exception 'Um ou mais produtos não pertencem à empresa.';
  end if;

  if p_alvo = 'preco_base' then
    foreach v_item_id in array p_item_ids loop
      select preco_venda into v_atual from public.estoque_itens where id=v_item_id and empresa_id=p_empresa_id for update;
      if p_operacao='definir' then v_novo := p_valor;
      elsif p_operacao='aumentar_percentual' then v_novo := coalesce(v_atual,0) * (1 + coalesce(p_valor,0)/100);
      elsif p_operacao='reduzir_percentual' then v_novo := coalesce(v_atual,0) * (1 - coalesce(p_valor,0)/100);
      elsif p_operacao='aumentar_valor' then v_novo := coalesce(v_atual,0) + coalesce(p_valor,0);
      elsif p_operacao='reduzir_valor' then v_novo := coalesce(v_atual,0) - coalesce(p_valor,0);
      else raise exception 'Operação de preço em massa inválida.';
      end if;
      if v_novo is null or v_novo < 0 then v_novo := 0; end if;
      v_novo := round(v_novo,2);
      update public.estoque_itens set preco_venda=v_novo,updated_by=p_usuario_id,updated_at=now(),versao=versao+1 where id=v_item_id and empresa_id=p_empresa_id;
      insert into public.estoque_precos_historico(empresa_id,estoque_item_id,entidade_tipo,acao,antes,depois,created_by)
      values(p_empresa_id,v_item_id,'massa',p_operacao,jsonb_build_object('alvo',p_alvo,'valor',v_atual),jsonb_build_object('alvo',p_alvo,'valor',v_novo),p_usuario_id);
      v_total := v_total + 1;
    end loop;
    return v_total;
  end if;

  if p_alvo in ('balcao','online','whatsapp') then
    v_canal := p_alvo;
    foreach v_item_id in array p_item_ids loop
      if p_operacao='herdar' then
        delete from public.estoque_precos_canais where empresa_id=p_empresa_id and estoque_item_id=v_item_id and canal=v_canal;
        v_total := v_total + 1;
        continue;
      end if;
      select coalesce(c.preco,i.preco_venda,0) into v_atual
        from public.estoque_itens i left join public.estoque_precos_canais c on c.empresa_id=i.empresa_id and c.estoque_item_id=i.id and c.canal=v_canal and c.ativo=true
       where i.id=v_item_id and i.empresa_id=p_empresa_id;
      if p_operacao='definir' then v_novo := p_valor;
      elsif p_operacao='aumentar_percentual' then v_novo := v_atual * (1 + coalesce(p_valor,0)/100);
      elsif p_operacao='reduzir_percentual' then v_novo := v_atual * (1 - coalesce(p_valor,0)/100);
      elsif p_operacao='aumentar_valor' then v_novo := v_atual + coalesce(p_valor,0);
      elsif p_operacao='reduzir_valor' then v_novo := v_atual - coalesce(p_valor,0);
      else raise exception 'Operação de canal em massa inválida.';
      end if;
      v_novo := round(greatest(0,coalesce(v_novo,0)),2);
      insert into public.estoque_precos_canais(empresa_id,estoque_item_id,canal,preco,created_by,updated_by)
      values(p_empresa_id,v_item_id,v_canal,v_novo,p_usuario_id,p_usuario_id)
      on conflict (empresa_id,estoque_item_id,canal) do update set preco=excluded.preco,ativo=true,updated_by=p_usuario_id,updated_at=now();
      insert into public.estoque_precos_historico(empresa_id,estoque_item_id,entidade_tipo,acao,antes,depois,created_by)
      values(p_empresa_id,v_item_id,'massa',p_operacao,jsonb_build_object('alvo',p_alvo,'valor',v_atual),jsonb_build_object('alvo',p_alvo,'valor',v_novo),p_usuario_id);
      v_total := v_total + 1;
    end loop;
    return v_total;
  end if;

  if p_alvo in ('pix','dinheiro','debito','credito') then
    v_forma := p_alvo;
    if p_operacao not in ('definir','herdar') then raise exception 'Para pagamento use definir ou herdar.'; end if;
    foreach v_item_id in array p_item_ids loop
      delete from public.estoque_regras_pagamento where empresa_id=p_empresa_id and estoque_item_id=v_item_id and canal is null and forma=v_forma and parcelas_min=1 and parcelas_max=1 and tipo_ajuste='preco_fixo';
      if p_operacao='definir' then
        if p_valor is null or p_valor < 0 then raise exception 'Informe um preço válido.'; end if;
        insert into public.estoque_regras_pagamento(empresa_id,estoque_item_id,canal,forma,parcelas_min,parcelas_max,tipo_ajuste,valor,created_by,updated_by)
        values(p_empresa_id,v_item_id,null,v_forma,1,1,'preco_fixo',round(p_valor,2),p_usuario_id,p_usuario_id);
      end if;
      insert into public.estoque_precos_historico(empresa_id,estoque_item_id,entidade_tipo,acao,depois,created_by)
      values(p_empresa_id,v_item_id,'massa',p_operacao,jsonb_build_object('alvo',p_alvo,'valor',case when p_operacao='definir' then round(p_valor,2) else null end),p_usuario_id);
      v_total := v_total + 1;
    end loop;
    return v_total;
  end if;

  raise exception 'Alvo de preço em massa inválido.';
end;
$$;

create or replace function public.estoque_precos_salvar_promocao(
  p_empresa_id uuid,
  p_id uuid,
  p_nome text,
  p_tipo_ajuste text,
  p_valor numeric,
  p_inicio_em timestamptz,
  p_fim_em timestamptz,
  p_canais text[],
  p_item_ids uuid[],
  p_usuario_id uuid default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid := p_id;
begin
  if nullif(btrim(p_nome),'') is null then raise exception 'Informe o nome da promoção.'; end if;
  if p_tipo_ajuste not in ('preco_fixo','desconto_percentual','desconto_valor') then raise exception 'Tipo de promoção inválido.'; end if;
  if p_valor is null or p_valor < 0 or (p_tipo_ajuste='desconto_percentual' and p_valor>100) then raise exception 'Valor da promoção inválido.'; end if;
  if p_inicio_em is null or p_fim_em is null or p_fim_em <= p_inicio_em then raise exception 'Período da promoção inválido.'; end if;
  if p_canais is null or cardinality(p_canais)=0 or not (p_canais <@ array['balcao','online','whatsapp']::text[]) then raise exception 'Selecione ao menos um canal válido.'; end if;
  if p_item_ids is null or cardinality(p_item_ids)=0 or cardinality(p_item_ids)>1000 then raise exception 'Selecione entre 1 e 1000 produtos.'; end if;
  if exists (select 1 from unnest(p_item_ids) i where not exists (select 1 from public.estoque_itens e where e.id=i and e.empresa_id=p_empresa_id and e.ativo=true)) then raise exception 'Um ou mais produtos da promoção são inválidos.'; end if;

  if v_id is null then
    insert into public.estoque_promocoes(empresa_id,nome,tipo_ajuste,valor,inicio_em,fim_em,canais,ativo,created_by,updated_by)
    values(p_empresa_id,btrim(p_nome),p_tipo_ajuste,p_valor,p_inicio_em,p_fim_em,p_canais,true,p_usuario_id,p_usuario_id)
    returning id into v_id;
  else
    update public.estoque_promocoes set nome=btrim(p_nome),tipo_ajuste=p_tipo_ajuste,valor=p_valor,inicio_em=p_inicio_em,fim_em=p_fim_em,canais=p_canais,ativo=true,updated_by=p_usuario_id,updated_at=now()
     where id=v_id and empresa_id=p_empresa_id;
    if not found then raise exception 'Promoção não encontrada.'; end if;
  end if;

  delete from public.estoque_promocao_itens where empresa_id=p_empresa_id and promocao_id=v_id;
  insert into public.estoque_promocao_itens(empresa_id,promocao_id,estoque_item_id)
  select p_empresa_id,v_id,id from public.estoque_itens where empresa_id=p_empresa_id and id=any(p_item_ids) and ativo=true;

  insert into public.estoque_precos_historico(empresa_id,entidade_tipo,entidade_id,acao,depois,created_by)
  values(p_empresa_id,'promocao',v_id,'salvar',jsonb_build_object('nome',btrim(p_nome),'tipo_ajuste',p_tipo_ajuste,'valor',p_valor,'inicio_em',p_inicio_em,'fim_em',p_fim_em,'canais',p_canais,'produtos',cardinality(p_item_ids)),p_usuario_id);
  return v_id;
end;
$$;

create or replace function public.estoque_precos_salvar_regra_pagamento(
  p_empresa_id uuid,
  p_id uuid,
  p_canal text,
  p_forma text,
  p_parcelas_min integer,
  p_parcelas_max integer,
  p_tipo_ajuste text,
  p_valor numeric,
  p_usuario_id uuid default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid := p_id;
begin
  if p_canal is not null and p_canal not in ('balcao','online','whatsapp') then raise exception 'Canal inválido.'; end if;
  if p_forma not in ('pix','dinheiro','debito','credito') then raise exception 'Forma de pagamento inválida.'; end if;
  if p_parcelas_min < 1 or p_parcelas_max < p_parcelas_min or p_parcelas_max > 24 then raise exception 'Faixa de parcelas inválida.'; end if;
  if p_forma <> 'credito' and (p_parcelas_min <> 1 or p_parcelas_max <> 1) then raise exception 'Parcelamento só pode ser configurado para crédito.'; end if;
  if p_tipo_ajuste not in ('nenhum','desconto_percentual','acrescimo_percentual') then raise exception 'Tipo de ajuste inválido.'; end if;
  if p_valor is null or p_valor < 0 or (p_tipo_ajuste in ('desconto_percentual','acrescimo_percentual') and p_valor > 100) then raise exception 'Valor do ajuste inválido.'; end if;

  if v_id is null then
    select id into v_id from public.estoque_regras_pagamento
     where empresa_id=p_empresa_id and estoque_item_id is null and canal is not distinct from p_canal and forma=p_forma and parcelas_min=p_parcelas_min and parcelas_max=p_parcelas_max
     limit 1;
  end if;

  if v_id is null then
    insert into public.estoque_regras_pagamento(empresa_id,estoque_item_id,canal,forma,parcelas_min,parcelas_max,tipo_ajuste,valor,ativo,created_by,updated_by)
    values(p_empresa_id,null,p_canal,p_forma,p_parcelas_min,p_parcelas_max,p_tipo_ajuste,p_valor,true,p_usuario_id,p_usuario_id)
    returning id into v_id;
  else
    update public.estoque_regras_pagamento set canal=p_canal,forma=p_forma,parcelas_min=p_parcelas_min,parcelas_max=p_parcelas_max,tipo_ajuste=p_tipo_ajuste,valor=p_valor,ativo=true,updated_by=p_usuario_id,updated_at=now()
     where id=v_id and empresa_id=p_empresa_id and estoque_item_id is null;
    if not found then raise exception 'Regra de pagamento não encontrada.'; end if;
  end if;

  insert into public.estoque_precos_historico(empresa_id,entidade_tipo,entidade_id,acao,depois,created_by)
  values(p_empresa_id,'pagamento',v_id,'salvar',jsonb_build_object('canal',p_canal,'forma',p_forma,'parcelas_min',p_parcelas_min,'parcelas_max',p_parcelas_max,'tipo_ajuste',p_tipo_ajuste,'valor',p_valor),p_usuario_id);
  return v_id;
end;
$$;

create or replace function public.estoque_precos_arquivar_promocao(p_empresa_id uuid,p_id uuid,p_usuario_id uuid default null)
returns void language plpgsql set search_path=public as $$
begin
  update public.estoque_promocoes set ativo=false,updated_by=p_usuario_id,updated_at=now() where id=p_id and empresa_id=p_empresa_id;
  if not found then raise exception 'Promoção não encontrada.'; end if;
  insert into public.estoque_precos_historico(empresa_id,entidade_tipo,entidade_id,acao,created_by) values(p_empresa_id,'promocao',p_id,'arquivar',p_usuario_id);
end; $$;

create or replace function public.estoque_precos_arquivar_regra_pagamento(p_empresa_id uuid,p_id uuid,p_usuario_id uuid default null)
returns void language plpgsql set search_path=public as $$
begin
  update public.estoque_regras_pagamento set ativo=false,updated_by=p_usuario_id,updated_at=now() where id=p_id and empresa_id=p_empresa_id and estoque_item_id is null;
  if not found then raise exception 'Regra de pagamento não encontrada.'; end if;
  insert into public.estoque_precos_historico(empresa_id,entidade_tipo,entidade_id,acao,created_by) values(p_empresa_id,'pagamento',p_id,'arquivar',p_usuario_id);
end; $$;

revoke all on function public.estoque_precos_salvar_produto(uuid,uuid,numeric,jsonb,jsonb,uuid) from public, anon, authenticated;
revoke all on function public.estoque_precos_aplicar_massa(uuid,uuid[],text,text,numeric,uuid) from public, anon, authenticated;
revoke all on function public.estoque_precos_salvar_promocao(uuid,uuid,text,text,numeric,timestamptz,timestamptz,text[],uuid[],uuid) from public, anon, authenticated;
revoke all on function public.estoque_precos_salvar_regra_pagamento(uuid,uuid,text,text,integer,integer,text,numeric,uuid) from public, anon, authenticated;
revoke all on function public.estoque_precos_arquivar_promocao(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.estoque_precos_arquivar_regra_pagamento(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.estoque_precos_salvar_produto(uuid,uuid,numeric,jsonb,jsonb,uuid) to service_role;
grant execute on function public.estoque_precos_aplicar_massa(uuid,uuid[],text,text,numeric,uuid) to service_role;
grant execute on function public.estoque_precos_salvar_promocao(uuid,uuid,text,text,numeric,timestamptz,timestamptz,text[],uuid[],uuid) to service_role;
grant execute on function public.estoque_precos_salvar_regra_pagamento(uuid,uuid,text,text,integer,integer,text,numeric,uuid) to service_role;
grant execute on function public.estoque_precos_arquivar_promocao(uuid,uuid,uuid) to service_role;
grant execute on function public.estoque_precos_arquivar_regra_pagamento(uuid,uuid,uuid) to service_role;
