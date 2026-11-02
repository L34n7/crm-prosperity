CREATE OR REPLACE FUNCTION public.cotacao_veicular_salvar_regras(p_empresa_id uuid, p_categoria text, p_plano text, p_regra jsonb, p_opcionais jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not exists (select 1 from public.empresas where id=p_empresa_id)
     or not exists (select 1 from public.cotacao_veicular_planos p where p.empresa_id=p_empresa_id and p.codigo=p_plano and p.ativo=true)
     or p_categoria not in ('motocicleta','auto_leves','app_taxi','especiais',
                           'van_utilitario','caminhao_leve','caminhao_pesado','agregado')
     or jsonb_typeof(p_regra) <> 'object'
     or jsonb_typeof(p_opcionais) <> 'array'
     or jsonb_array_length(p_opcionais) > 60 then
    raise exception 'Configuração comercial inválida.';
  end if;

  insert into public.cotacao_veicular_regras_empresa
    (empresa_id,categoria,plano,participacao_percentual,participacao_min_centavos,
     terceiros_limite_centavos,assistencia_km_total,assistencias_ano,
     carro_reserva_incluso_dias,coberturas,usos_permitidos,energias_permitidas,observacoes,updated_at)
  values
    (p_empresa_id,p_categoria,p_plano,
     (p_regra->>'participacao_percentual')::numeric,
     (p_regra->>'participacao_min_centavos')::bigint,
     (p_regra->>'terceiros_limite_centavos')::bigint,
     (p_regra->>'assistencia_km_total')::integer,
     (p_regra->>'assistencias_ano')::integer,
     coalesce((p_regra->>'carro_reserva_incluso_dias')::integer,0),
     coalesce(p_regra->'coberturas','[]'::jsonb),
     coalesce(p_regra->'usos_permitidos','[]'::jsonb),
     coalesce(p_regra->'energias_permitidas','[]'::jsonb),
     coalesce(p_regra->>'observacoes',''),now())
  on conflict(empresa_id,categoria,plano)
  do update set
    participacao_percentual=excluded.participacao_percentual,
    participacao_min_centavos=excluded.participacao_min_centavos,
    terceiros_limite_centavos=excluded.terceiros_limite_centavos,
    assistencia_km_total=excluded.assistencia_km_total,
    assistencias_ano=excluded.assistencias_ano,
    carro_reserva_incluso_dias=excluded.carro_reserva_incluso_dias,
    coberturas=excluded.coberturas,
    usos_permitidos=excluded.usos_permitidos,
    energias_permitidas=excluded.energias_permitidas,
    observacoes=excluded.observacoes,
    updated_at=now();
  delete from public.cotacao_veicular_opcionais_empresa
    where empresa_id=p_empresa_id and categoria=p_categoria and plano=p_plano;
  insert into public.cotacao_veicular_opcionais_empresa
    (empresa_id,categoria,plano,codigo,nome,valor_centavos,grupo_exclusivo,ativo)
  select p_empresa_id,p_categoria,p_plano,
      x.codigo,x.nome,x.valor_centavos,coalesce(x.grupo_exclusivo,''),x.ativo
  from jsonb_to_recordset(p_opcionais) as x(
    codigo text,nome text,valor_centavos integer,grupo_exclusivo text,ativo boolean);
end;
$function$;

create or replace function public.cotacao_veicular_salvar_regras_multiplas(
 p_empresa_id uuid,p_plano text,p_categorias jsonb,p_regra jsonb,p_opcionais jsonb
) returns integer
language plpgsql security definer set search_path=''
as $function$
declare v_categoria text; v_total integer;
begin
 if jsonb_typeof(p_categorias) <> 'array'
    or jsonb_array_length(p_categorias) not between 1 and 8
    or exists(select 1 from jsonb_array_elements(p_categorias) x where jsonb_typeof(x.value)<>'string')
 then raise exception 'Selecione uma ou mais categorias válidas.'; end if;
 select count(distinct categoria) into v_total
 from jsonb_array_elements_text(p_categorias) as categoria;
 if v_total<>jsonb_array_length(p_categorias)
 then raise exception 'Seleção de categorias duplicadas.'; end if;
 for v_categoria in select jsonb_array_elements_text(p_categorias)
 loop
   perform public.cotacao_veicular_salvar_regras(
     p_empresa_id,v_categoria,p_plano,
     p_regra || jsonb_build_object('categoria',v_categoria),p_opcionais);
 end loop;
 return v_total;
end;
$function$;
revoke all on function public.cotacao_veicular_salvar_regras(uuid,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.cotacao_veicular_salvar_regras(uuid,text,text,jsonb,jsonb) to service_role;
revoke all on function public.cotacao_veicular_salvar_regras_multiplas(uuid,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.cotacao_veicular_salvar_regras_multiplas(uuid,text,jsonb,jsonb,jsonb) to service_role;
