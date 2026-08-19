-- Unifica todas as operacoes de estoque na arquitetura ERP.
-- estoque_saldos e a unica fonte de verdade; estoque_itens.saldo permanece
-- apenas como cache derivado para compatibilidade com telas e integracoes antigas.

alter table public.estoque_saldos
  drop constraint if exists estoque_saldos_saldo_fisico_check,
  drop constraint if exists estoque_saldos_check;

alter table public.estoque_saldos
  add constraint estoque_saldos_reserva_valida_ck
  check (saldo_reservado <= greatest(saldo_fisico, 0));

alter table public.estoque_itens
  drop constraint if exists estoque_itens_saldo_check;

alter table public.estoque_movimentacoes
  drop constraint if exists estoque_movimentacoes_saldo_anterior_check,
  drop constraint if exists estoque_movimentacoes_saldo_posterior_check;

alter table if exists public.estoque_inventario_itens
  drop constraint if exists estoque_inventario_itens_saldo_esperado_check;

alter table public.estoque_documento_itens
  drop constraint if exists estoque_documento_itens_quantidade_check;
alter table public.estoque_documento_itens
  add constraint estoque_documento_itens_quantidade_ck check (quantidade >= 0);

create or replace function public.estoque_sincronizar_cache_item(p_empresa_id uuid, p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_saldo numeric(18,6);
  v_custo numeric(18,6);
begin
  select
    coalesce(sum(s.saldo_fisico), 0),
    coalesce(
      sum(greatest(s.saldo_fisico, 0) * s.custo_medio)
        / nullif(sum(greatest(s.saldo_fisico, 0)), 0),
      max(s.custo_medio),
      0
    )
  into v_saldo, v_custo
  from public.estoque_saldos s
  where s.empresa_id = p_empresa_id
    and s.estoque_item_id = p_item_id;

  perform set_config('crm.estoque_sincronizando_cache', 'true', true);
  update public.estoque_itens
     set saldo = v_saldo,
         custo_unitario = v_custo,
         versao = versao + 1
   where empresa_id = p_empresa_id
     and id = p_item_id
     and (saldo is distinct from v_saldo or custo_unitario is distinct from v_custo);
  perform set_config('crm.estoque_sincronizando_cache', 'false', true);
end;
$$;

create or replace function public.estoque_saldo_posicao_atualizado()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.estoque_sincronizar_cache_item(old.empresa_id, old.estoque_item_id);
    return old;
  end if;

  perform public.estoque_sincronizar_cache_item(new.empresa_id, new.estoque_item_id);
  if tg_op = 'UPDATE'
     and (old.empresa_id, old.estoque_item_id) is distinct from (new.empresa_id, new.estoque_item_id) then
    perform public.estoque_sincronizar_cache_item(old.empresa_id, old.estoque_item_id);
  end if;
  return new;
end;
$$;

drop trigger if exists estoque_saldos_sincronizar_cache_item on public.estoque_saldos;
create trigger estoque_saldos_sincronizar_cache_item
after insert or update of saldo_fisico, custo_medio or delete on public.estoque_saldos
for each row execute function public.estoque_saldo_posicao_atualizado();

create or replace function public.estoque_bloquear_saldo_item_manual()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.saldo is distinct from old.saldo
     and coalesce(current_setting('crm.estoque_sincronizando_cache', true), 'false') <> 'true' then
    raise exception 'O saldo do item e derivado das posicoes de estoque e nao pode ser alterado diretamente.';
  end if;
  return new;
end;
$$;

drop trigger if exists estoque_itens_bloquear_saldo_manual on public.estoque_itens;
create trigger estoque_itens_bloquear_saldo_manual
before update of saldo on public.estoque_itens
for each row execute function public.estoque_bloquear_saldo_item_manual();

create or replace function public.estoque_aplicar_delta_posicao(
  p_empresa_id uuid,
  p_item_id uuid,
  p_deposito_id uuid,
  p_localizacao_id uuid,
  p_lote_id uuid,
  p_numero_serie text,
  p_delta numeric,
  p_custo_entrada numeric default 0
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_atual public.estoque_saldos%rowtype;
  v_novo numeric(18,6);
  v_custo numeric(18,6);
  v_bloquear_negativo boolean;
  v_deposito_permite_negativo boolean;
begin
  if p_deposito_id is null then raise exception 'Deposito obrigatorio.'; end if;
  if p_delta is null or p_delta = 0 then raise exception 'A variacao da posicao deve ser diferente de zero.'; end if;
  if not exists (
    select 1 from public.estoque_itens
     where empresa_id=p_empresa_id and id=p_item_id and ativo
  ) then raise exception 'Item de estoque nao encontrado.'; end if;

  select d.permite_saldo_negativo
    into v_deposito_permite_negativo
    from public.estoque_depositos d
   where d.empresa_id=p_empresa_id and d.id=p_deposito_id and d.ativo;
  if not found then raise exception 'Deposito nao encontrado ou inativo.'; end if;

  if p_localizacao_id is not null and not exists (
    select 1 from public.estoque_localizacoes l
     where l.empresa_id=p_empresa_id and l.id=p_localizacao_id
       and l.deposito_id=p_deposito_id and l.ativo
  ) then raise exception 'Localizacao nao pertence ao deposito selecionado.'; end if;

  if p_lote_id is not null and not exists (
    select 1 from public.estoque_lotes l
     where l.empresa_id=p_empresa_id and l.id=p_lote_id
       and l.estoque_item_id=p_item_id
  ) then raise exception 'Lote nao pertence ao item selecionado.'; end if;

  select coalesce(c.bloquear_negativo, true)
    into v_bloquear_negativo
    from public.estoque_configuracoes c
   where c.empresa_id=p_empresa_id;
  v_bloquear_negativo := coalesce(v_bloquear_negativo, true);

  insert into public.estoque_saldos (
    empresa_id, estoque_item_id, deposito_id, localizacao_id, lote_id, numero_serie
  ) values (
    p_empresa_id, p_item_id, p_deposito_id, p_localizacao_id, p_lote_id, nullif(btrim(p_numero_serie), '')
  ) on conflict do nothing;

  select * into v_atual
    from public.estoque_saldos
   where empresa_id=p_empresa_id
     and estoque_item_id=p_item_id
     and deposito_id=p_deposito_id
     and localizacao_id is not distinct from p_localizacao_id
     and lote_id is not distinct from p_lote_id
     and numero_serie is not distinct from nullif(btrim(p_numero_serie), '')
   for update;

  v_novo := v_atual.saldo_fisico + p_delta;
  if v_atual.saldo_reservado > greatest(v_novo, 0) then
    raise exception 'Saldo disponivel insuficiente nesta posicao: fisico %, reservado %, variacao %.',
      v_atual.saldo_fisico, v_atual.saldo_reservado, p_delta;
  end if;
  if v_novo < 0 and (v_bloquear_negativo or not coalesce(v_deposito_permite_negativo, false)) then
    raise exception 'Estoque negativo bloqueado para este deposito.';
  end if;

  v_custo := case
    when p_delta > 0 and p_custo_entrada > 0 and v_novo > 0
      then ((greatest(v_atual.saldo_fisico, 0) * v_atual.custo_medio) + (p_delta * p_custo_entrada))
        / nullif(greatest(v_atual.saldo_fisico, 0) + p_delta, 0)
    else v_atual.custo_medio
  end;

  update public.estoque_saldos
     set saldo_fisico=v_novo,
         custo_medio=coalesce(v_custo, 0),
         versao=versao+1,
         updated_at=now()
   where id=v_atual.id;
  return v_atual.id;
end;
$$;

create or replace function public.estoque_aplicar_delta(
  p_empresa_id uuid, p_item_id uuid, p_deposito_id uuid, p_lote_id uuid,
  p_delta numeric, p_custo_entrada numeric default 0
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.estoque_aplicar_delta_posicao(
    p_empresa_id,p_item_id,p_deposito_id,null,p_lote_id,null,p_delta,p_custo_entrada
  );
end;
$$;

create or replace function public.estoque_confirmar_documento(
  p_empresa_id uuid, p_documento_id uuid, p_usuario_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doc public.estoque_documentos%rowtype;
  v_linha record;
  v_posicao record;
  v_delta numeric(18,6);
  v_restante numeric(18,6);
  v_retirar numeric(18,6);
  v_antes numeric(18,6);
  v_depois numeric(18,6);
  v_deposito_id uuid;
  v_total integer := 0;
begin
  select * into v_doc from public.estoque_documentos
   where id=p_documento_id and empresa_id=p_empresa_id for update;
  if not found then raise exception 'Documento nao encontrado.'; end if;
  if v_doc.status='confirmado' then
    return jsonb_build_object('documento_id',v_doc.id,'idempotente',true);
  end if;
  if v_doc.status<>'rascunho' then raise exception 'Documento nao pode ser confirmado.'; end if;

  for v_linha in
    select * from public.estoque_documento_itens
     where empresa_id=p_empresa_id and documento_id=v_doc.id
     order by estoque_item_id,id
  loop
    select coalesce(sum(saldo_fisico),0) into v_antes
      from public.estoque_saldos
     where empresa_id=p_empresa_id and estoque_item_id=v_linha.estoque_item_id;

    if v_doc.tipo='transferencia' then
      if v_linha.deposito_origem_id is null or v_linha.deposito_destino_id is null
         or v_linha.deposito_origem_id=v_linha.deposito_destino_id then
        raise exception 'Informe depositos de origem e destino diferentes.';
      end if;
      perform public.estoque_aplicar_delta_posicao(
        p_empresa_id,v_linha.estoque_item_id,v_linha.deposito_origem_id,
        v_linha.localizacao_origem_id,v_linha.lote_id,v_linha.numero_serie,
        -v_linha.quantidade,coalesce(v_linha.custo_unitario,0)
      );
      perform public.estoque_aplicar_delta_posicao(
        p_empresa_id,v_linha.estoque_item_id,v_linha.deposito_destino_id,
        v_linha.localizacao_destino_id,v_linha.lote_id,v_linha.numero_serie,
        v_linha.quantidade,coalesce(v_linha.custo_unitario,0)
      );
      v_deposito_id:=v_linha.deposito_origem_id;
    elsif v_doc.tipo='ajuste' then
      v_deposito_id:=coalesce(v_linha.deposito_destino_id,v_linha.deposito_origem_id);
      if v_deposito_id is null then raise exception 'Deposito obrigatorio para ajuste.'; end if;

      if v_linha.localizacao_destino_id is not null or v_linha.lote_id is not null or v_linha.numero_serie is not null then
        select coalesce(saldo_fisico,0) into v_delta
          from public.estoque_saldos
         where empresa_id=p_empresa_id and estoque_item_id=v_linha.estoque_item_id
           and deposito_id=v_deposito_id
           and localizacao_id is not distinct from v_linha.localizacao_destino_id
           and lote_id is not distinct from v_linha.lote_id
           and numero_serie is not distinct from v_linha.numero_serie;
        v_delta:=v_linha.quantidade-coalesce(v_delta,0);
        if v_delta<>0 then
          perform public.estoque_aplicar_delta_posicao(
            p_empresa_id,v_linha.estoque_item_id,v_deposito_id,
            v_linha.localizacao_destino_id,v_linha.lote_id,v_linha.numero_serie,
            v_delta,coalesce(v_linha.custo_unitario,0)
          );
        end if;
      else
        select v_linha.quantidade-coalesce(sum(saldo_fisico),0) into v_delta
          from public.estoque_saldos
         where empresa_id=p_empresa_id and estoque_item_id=v_linha.estoque_item_id
           and deposito_id=v_deposito_id;
        if v_delta>0 then
          perform public.estoque_aplicar_delta_posicao(
            p_empresa_id,v_linha.estoque_item_id,v_deposito_id,null,null,null,
            v_delta,coalesce(v_linha.custo_unitario,0)
          );
        elsif v_delta<0 then
          v_restante:=abs(v_delta);
          for v_posicao in
            select s.* from public.estoque_saldos s
            left join public.estoque_lotes l on l.id=s.lote_id and l.empresa_id=s.empresa_id
            where s.empresa_id=p_empresa_id and s.estoque_item_id=v_linha.estoque_item_id
              and s.deposito_id=v_deposito_id and s.saldo_fisico-s.saldo_reservado>0
            order by l.validade asc nulls last,s.updated_at,s.id
            for update of s
          loop
            exit when v_restante<=0;
            v_retirar:=least(v_restante,v_posicao.saldo_fisico-v_posicao.saldo_reservado);
            perform public.estoque_aplicar_delta_posicao(
              p_empresa_id,v_linha.estoque_item_id,v_deposito_id,
              v_posicao.localizacao_id,v_posicao.lote_id,v_posicao.numero_serie,
              -v_retirar,coalesce(v_linha.custo_unitario,0)
            );
            v_restante:=v_restante-v_retirar;
          end loop;
          if v_restante>0 then
            perform public.estoque_aplicar_delta_posicao(
              p_empresa_id,v_linha.estoque_item_id,v_deposito_id,null,null,null,
              -v_restante,coalesce(v_linha.custo_unitario,0)
            );
          end if;
        end if;
      end if;
    else
      v_delta:=case when v_doc.tipo in ('entrada','saldo_inicial','estorno')
        then v_linha.quantidade else -v_linha.quantidade end;
      v_deposito_id:=case when v_delta>0
        then coalesce(v_linha.deposito_destino_id,v_linha.deposito_origem_id)
        else coalesce(v_linha.deposito_origem_id,v_linha.deposito_destino_id) end;
      perform public.estoque_aplicar_delta_posicao(
        p_empresa_id,v_linha.estoque_item_id,v_deposito_id,
        case when v_delta>0 then v_linha.localizacao_destino_id else v_linha.localizacao_origem_id end,
        v_linha.lote_id,v_linha.numero_serie,v_delta,coalesce(v_linha.custo_unitario,0)
      );
    end if;

    select coalesce(sum(saldo_fisico),0) into v_depois
      from public.estoque_saldos
     where empresa_id=p_empresa_id and estoque_item_id=v_linha.estoque_item_id;
    insert into public.estoque_movimentacoes (
      empresa_id,estoque_item_id,tipo,quantidade,saldo_anterior,saldo_posterior,
      observacao,created_by,documento_id,deposito_id,lote_id,custo_unitario
    ) values (
      p_empresa_id,v_linha.estoque_item_id,v_doc.tipo,
      case when v_doc.tipo='ajuste' then abs(v_depois-v_antes) else v_linha.quantidade end,
      v_antes,v_depois,v_doc.observacao,p_usuario_id,v_doc.id,v_deposito_id,
      v_linha.lote_id,v_linha.custo_unitario
    );
    v_total:=v_total+1;
  end loop;

  if v_total=0 then raise exception 'Documento sem itens.'; end if;
  update public.estoque_documentos set status='confirmado',confirmado_em=now() where id=v_doc.id;
  return jsonb_build_object('documento_id',v_doc.id,'itens',v_total);
end;
$$;

create or replace function public.estoque_registrar_documento(
  p_empresa_id uuid,
  p_tipo text,
  p_itens jsonb,
  p_usuario_id uuid default null,
  p_observacao text default null,
  p_origem_tipo text default null,
  p_origem_id uuid default null,
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_documento_id uuid;
  v_item jsonb;
begin
  if p_tipo not in ('saldo_inicial','entrada','saida','ajuste','transferencia','consumo','estorno') then
    raise exception 'Tipo de documento de estoque invalido.';
  end if;
  if p_itens is null or jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens)=0 then
    raise exception 'Documento sem itens.';
  end if;

  if nullif(btrim(p_idempotency_key),'') is not null then
    select id into v_documento_id from public.estoque_documentos
     where empresa_id=p_empresa_id and idempotency_key=btrim(p_idempotency_key);
    if v_documento_id is not null then
      return public.estoque_confirmar_documento(p_empresa_id,v_documento_id,p_usuario_id);
    end if;
  end if;

  insert into public.estoque_documentos (
    empresa_id,tipo,origem_tipo,origem_id,idempotency_key,observacao,created_by
  ) values (
    p_empresa_id,p_tipo,nullif(btrim(p_origem_tipo),''),p_origem_id,
    nullif(btrim(p_idempotency_key),''),nullif(btrim(p_observacao),''),p_usuario_id
  ) returning id into v_documento_id;

  for v_item in select value from jsonb_array_elements(p_itens)
  loop
    if nullif(v_item->>'quantidade','') is null
       or (v_item->>'quantidade')::numeric < 0
       or (p_tipo<>'ajuste' and (v_item->>'quantidade')::numeric=0) then
      raise exception 'Quantidade invalida no documento.';
    end if;
    insert into public.estoque_documento_itens (
      empresa_id,documento_id,estoque_item_id,deposito_origem_id,deposito_destino_id,
      localizacao_origem_id,localizacao_destino_id,lote_id,numero_serie,quantidade,custo_unitario
    ) values (
      p_empresa_id,v_documento_id,(v_item->>'estoque_item_id')::uuid,
      nullif(v_item->>'deposito_origem_id','')::uuid,nullif(v_item->>'deposito_destino_id','')::uuid,
      nullif(v_item->>'localizacao_origem_id','')::uuid,nullif(v_item->>'localizacao_destino_id','')::uuid,
      nullif(v_item->>'lote_id','')::uuid,nullif(btrim(v_item->>'numero_serie'),''),
      (v_item->>'quantidade')::numeric,coalesce(nullif(v_item->>'custo_unitario','')::numeric,0)
    );
  end loop;
  return public.estoque_confirmar_documento(p_empresa_id,v_documento_id,p_usuario_id);
end;
$$;

create or replace function public.estoque_criar_item_com_saldo_inicial(
  p_empresa_id uuid,
  p_dados jsonb,
  p_saldo_inicial numeric default 0,
  p_deposito_id uuid default null,
  p_usuario_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item_id uuid;
  v_deposito_id uuid;
begin
  insert into public.estoque_itens (
    empresa_id,codigo,nome,descricao,tipo,unidade,saldo,estoque_minimo,
    custo_unitario,preco_venda,sku,codigo_barras,categoria_id,marca_id,
    controla_lote,controla_validade,controla_serie,created_by,updated_by
  ) values (
    p_empresa_id,nullif(btrim(p_dados->>'codigo'),''),btrim(p_dados->>'nome'),
    nullif(btrim(p_dados->>'descricao'),''),coalesce(nullif(p_dados->>'tipo',''),'produto'),
    coalesce(nullif(p_dados->>'unidade',''),'un'),0,
    coalesce(nullif(p_dados->>'estoque_minimo','')::numeric,0),
    coalesce(nullif(p_dados->>'custo_unitario','')::numeric,0),
    nullif(p_dados->>'preco_venda','')::numeric,nullif(btrim(p_dados->>'sku'),''),
    nullif(btrim(p_dados->>'codigo_barras'),''),nullif(p_dados->>'categoria_id','')::uuid,
    nullif(p_dados->>'marca_id','')::uuid,coalesce((p_dados->>'controla_lote')::boolean,false),
    coalesce((p_dados->>'controla_validade')::boolean,false),
    coalesce((p_dados->>'controla_serie')::boolean,false),p_usuario_id,p_usuario_id
  ) returning id into v_item_id;

  if coalesce(p_saldo_inicial,0)>0 then
    select coalesce(p_deposito_id,(
      select id from public.estoque_depositos
       where empresa_id=p_empresa_id and principal and ativo limit 1
    )) into v_deposito_id;
    if v_deposito_id is null then raise exception 'Cadastre um deposito antes de informar saldo inicial.'; end if;
    perform public.estoque_registrar_documento(
      p_empresa_id,'saldo_inicial',jsonb_build_array(jsonb_build_object(
        'estoque_item_id',v_item_id,'deposito_destino_id',v_deposito_id,
        'quantidade',p_saldo_inicial,'custo_unitario',coalesce(nullif(p_dados->>'custo_unitario','')::numeric,0)
      )),p_usuario_id,'Saldo inicial do cadastro','cadastro_item',v_item_id,
      'saldo-inicial:'||v_item_id::text
    );
  end if;
  return v_item_id;
end;
$$;

create or replace function public.estoque_registrar_baixa_catalogo_documento(
  p_empresa_id uuid,
  p_catalogo_servico_id uuid,
  p_deposito_id uuid,
  p_quantidade numeric default 1,
  p_usuario_id uuid default null,
  p_origem_referencia text default null,
  p_observacao text default null,
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_catalogo public.catalogo_servicos%rowtype;
  v_componente record;
  v_posicao record;
  v_documento_id uuid;
  v_deposito_id uuid;
  v_necessario numeric(18,6);
  v_retirar numeric(18,6);
  v_total integer:=0;
begin
  if p_quantidade is null or p_quantidade<=0 then raise exception 'Informe uma quantidade maior que zero.'; end if;
  select * into v_catalogo from public.catalogo_servicos
   where empresa_id=p_empresa_id and id=p_catalogo_servico_id and ativo;
  if not found then raise exception 'Item do catalogo nao encontrado.'; end if;
  select coalesce(p_deposito_id,(
    select id from public.estoque_depositos where empresa_id=p_empresa_id and principal and ativo limit 1
  )) into v_deposito_id;
  if v_deposito_id is null then raise exception 'Deposito obrigatorio para registrar a baixa.'; end if;

  if nullif(btrim(p_idempotency_key),'') is not null then
    select id into v_documento_id from public.estoque_documentos
     where empresa_id=p_empresa_id and idempotency_key=btrim(p_idempotency_key);
    if v_documento_id is not null then
      return public.estoque_confirmar_documento(p_empresa_id,v_documento_id,p_usuario_id);
    end if;
  end if;

  insert into public.estoque_documentos (
    empresa_id,tipo,origem_tipo,origem_id,idempotency_key,observacao,created_by
  ) values (
    p_empresa_id,'consumo','catalogo_baixa',p_catalogo_servico_id,
    coalesce(nullif(btrim(p_idempotency_key),''),gen_random_uuid()::text),
    concat_ws(' · ',nullif(btrim(p_observacao),''),
      case when nullif(btrim(p_origem_referencia),'') is not null
        then 'Referencia: '||btrim(p_origem_referencia) end),p_usuario_id
  ) returning id into v_documento_id;

  for v_componente in
    select componentes.estoque_item_id,sum(componentes.quantidade)::numeric(18,6) quantidade
    from (
      select v_catalogo.estoque_item_id estoque_item_id,p_quantidade quantidade
       where v_catalogo.tipo='produto' and v_catalogo.estoque_item_id is not null
      union all
      select c.estoque_item_id,c.quantidade*p_quantidade
        from public.catalogo_servico_insumos c
       where c.empresa_id=p_empresa_id and c.catalogo_servico_id=v_catalogo.id
    ) componentes
    group by componentes.estoque_item_id order by componentes.estoque_item_id
  loop
    v_necessario:=v_componente.quantidade;
    for v_posicao in
      select s.*,l.validade
        from public.estoque_saldos s
        left join public.estoque_lotes l on l.id=s.lote_id and l.empresa_id=s.empresa_id
       where s.empresa_id=p_empresa_id and s.estoque_item_id=v_componente.estoque_item_id
         and s.deposito_id=v_deposito_id and s.saldo_fisico-s.saldo_reservado>0
         and coalesce(l.bloqueado,false)=false and (l.validade is null or l.validade>=current_date)
       order by l.validade asc nulls last,s.updated_at,s.id
       for update of s
    loop
      exit when v_necessario<=0;
      v_retirar:=least(v_necessario,v_posicao.saldo_fisico-v_posicao.saldo_reservado);
      insert into public.estoque_documento_itens (
        empresa_id,documento_id,estoque_item_id,deposito_origem_id,localizacao_origem_id,
        lote_id,numero_serie,quantidade,custo_unitario
      ) values (
        p_empresa_id,v_documento_id,v_componente.estoque_item_id,v_deposito_id,
        v_posicao.localizacao_id,v_posicao.lote_id,v_posicao.numero_serie,v_retirar,v_posicao.custo_medio
      );
      v_necessario:=v_necessario-v_retirar;
      v_total:=v_total+1;
    end loop;
    if v_necessario>0 then
      insert into public.estoque_documento_itens (
        empresa_id,documento_id,estoque_item_id,deposito_origem_id,quantidade
      ) values (p_empresa_id,v_documento_id,v_componente.estoque_item_id,v_deposito_id,v_necessario);
      v_total:=v_total+1;
    end if;
  end loop;
  if v_total=0 then raise exception 'Cadastre os insumos consumidos antes de registrar a baixa.'; end if;
  return public.estoque_confirmar_documento(p_empresa_id,v_documento_id,p_usuario_id);
end;
$$;

-- Mantem as assinaturas antigas apenas para produzir um erro claro caso algum
-- consumidor ainda nao tenha sido migrado. Nenhuma delas pode alterar saldo.
create or replace function public.estoque_movimentar(
  p_empresa_id uuid,p_estoque_item_id uuid,p_tipo text,p_quantidade numeric,
  p_usuario_id uuid default null,p_observacao text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  raise exception 'estoque_movimentar foi desativada. Utilize documentos de estoque.';
end;
$$;

create or replace function public.estoque_registrar_baixa_catalogo(
  p_empresa_id uuid,p_catalogo_servico_id uuid,p_quantidade numeric default 1,
  p_usuario_id uuid default null,p_origem_id text default null,p_observacao text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  raise exception 'A baixa antiga foi desativada. Utilize estoque_registrar_baixa_catalogo_documento.';
end;
$$;

-- Converte saldos legados que ainda nao possuam razao em documentos de saldo inicial,
-- sem reaplicar a quantidade nas posicoes existentes.
do $$
declare v_pos record; v_doc uuid; v_total numeric(18,6);
begin
  for v_pos in
    select s.* from public.estoque_saldos s
     where s.saldo_fisico<>0
       and not exists (
         select 1 from public.estoque_movimentacoes m
          where m.empresa_id=s.empresa_id and m.estoque_item_id=s.estoque_item_id
            and m.deposito_id=s.deposito_id and m.lote_id is not distinct from s.lote_id
       )
  loop
    insert into public.estoque_documentos (
      empresa_id,tipo,status,origem_tipo,idempotency_key,observacao,confirmado_em
    ) values (
      v_pos.empresa_id,'saldo_inicial','confirmado','migracao',
      'migracao-saldo-inicial:'||v_pos.id::text,'Conversao do saldo legado para documento ERP',now()
    ) returning id into v_doc;
    insert into public.estoque_documento_itens (
      empresa_id,documento_id,estoque_item_id,deposito_destino_id,localizacao_destino_id,
      lote_id,numero_serie,quantidade,custo_unitario
    ) values (
      v_pos.empresa_id,v_doc,v_pos.estoque_item_id,v_pos.deposito_id,v_pos.localizacao_id,
      v_pos.lote_id,v_pos.numero_serie,abs(v_pos.saldo_fisico),v_pos.custo_medio
    );
    select coalesce(sum(saldo_fisico),0) into v_total from public.estoque_saldos
     where empresa_id=v_pos.empresa_id and estoque_item_id=v_pos.estoque_item_id;
    insert into public.estoque_movimentacoes (
      empresa_id,estoque_item_id,tipo,quantidade,saldo_anterior,saldo_posterior,
      observacao,documento_id,deposito_id,lote_id,custo_unitario
    ) values (
      v_pos.empresa_id,v_pos.estoque_item_id,'saldo_inicial',abs(v_pos.saldo_fisico),0,v_total,
      'Conversao do saldo legado para documento ERP',v_doc,v_pos.deposito_id,v_pos.lote_id,v_pos.custo_medio
    );
  end loop;
end;
$$;

do $$ declare v_item record; begin
  for v_item in select empresa_id,id from public.estoque_itens loop
    perform public.estoque_sincronizar_cache_item(v_item.empresa_id,v_item.id);
  end loop;
end $$;

revoke execute on function public.estoque_movimentar(uuid,uuid,text,numeric,uuid,text) from public,anon,authenticated,service_role;
revoke execute on function public.estoque_registrar_baixa_catalogo(uuid,uuid,numeric,uuid,text,text) from public,anon,authenticated,service_role;

revoke execute on function public.estoque_sincronizar_cache_item(uuid,uuid) from public,anon,authenticated,service_role;
revoke execute on function public.estoque_saldo_posicao_atualizado() from public,anon,authenticated,service_role;
revoke execute on function public.estoque_bloquear_saldo_item_manual() from public,anon,authenticated,service_role;
revoke execute on function public.estoque_aplicar_delta_posicao(uuid,uuid,uuid,uuid,uuid,text,numeric,numeric) from public,anon,authenticated,service_role;
revoke execute on function public.estoque_aplicar_delta(uuid,uuid,uuid,uuid,numeric,numeric) from public,anon,authenticated,service_role;
revoke execute on function public.estoque_confirmar_documento(uuid,uuid,uuid) from public,anon,authenticated;
revoke execute on function public.estoque_registrar_documento(uuid,text,jsonb,uuid,text,text,uuid,text) from public,anon,authenticated;
revoke execute on function public.estoque_criar_item_com_saldo_inicial(uuid,jsonb,numeric,uuid,uuid) from public,anon,authenticated;
revoke execute on function public.estoque_registrar_baixa_catalogo_documento(uuid,uuid,uuid,numeric,uuid,text,text,text) from public,anon,authenticated;

grant execute on function public.estoque_confirmar_documento(uuid,uuid,uuid) to service_role;
grant execute on function public.estoque_registrar_documento(uuid,text,jsonb,uuid,text,text,uuid,text) to service_role;
grant execute on function public.estoque_criar_item_com_saldo_inicial(uuid,jsonb,numeric,uuid,uuid) to service_role;
grant execute on function public.estoque_registrar_baixa_catalogo_documento(uuid,uuid,uuid,numeric,uuid,text,text,text) to service_role;
