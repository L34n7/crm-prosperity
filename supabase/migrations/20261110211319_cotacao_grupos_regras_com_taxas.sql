-- Gravacao atomica de 1a/2a regras por grupos de categorias do plano.
-- Cada categoria so pode pertencer a um grupo, sem sobrescrita cruzada.
create or replace function public.cotacao_veicular_salvar_grupos_com_taxas(
  p_empresa_id uuid,
  p_plano text,
  p_grupos jsonb,
  p_condicoes jsonb
) returns integer
language plpgsql security definer set search_path=''
as $function$
declare
  v_grupo jsonb;
  v_categorias jsonb;
  v_categoria text;
  v_usadas text[] := array[]::text[];
  v_total integer := 0;
begin
  if jsonb_typeof(p_grupos)<>'array' or
     jsonb_array_length(p_grupos) not between 1 and 2 then
    raise exception 'Informe uma ou duas regras comerciais.';
  end if;
  if jsonb_typeof(p_condicoes)<>'object' or not (
    p_condicoes ? 'adesao_ativa' and
    p_condicoes ? 'rastreador_ativo' and
    p_condicoes ? 'rastreador_mensalidade_inclusa'
  ) then
    raise exception 'Condições de contratação inválidas.';
  end if;
  if not exists(select 1 from public.cotacao_veicular_planos
    where empresa_id=p_empresa_id and codigo=p_plano) then
    raise exception 'Plano não encontrado nesta empresa.';
  end if;
  for v_grupo in select value from jsonb_array_elements(p_grupos)
  loop
    v_categorias:=v_grupo->'categorias';
    if jsonb_typeof(v_categorias)<>'array' or
       jsonb_array_length(v_categorias) not between 1 and 8 then
      raise exception 'Selecione as categorias de cada regra.';
    end if;
    for v_categoria in select value from jsonb_array_elements_text(v_categorias)
    loop
      if v_categoria=any(v_usadas) then
        raise exception 'Uma categoria não pode pertencer a mais de uma regra.';
      end if;
      v_usadas:=array_append(v_usadas,v_categoria);
    end loop;
    v_total:=v_total+public.cotacao_veicular_salvar_regras_multiplas(
      p_empresa_id,p_plano,v_categorias,
      v_grupo->'regra',v_grupo->'opcionais'
    );
  end loop;
  insert into public.cotacao_veicular_taxas_planos(
    empresa_id,plano,config_json,updated_at
  ) values(p_empresa_id,p_plano,p_condicoes,now())
  on conflict(empresa_id,plano) do update
    set config_json=excluded.config_json,updated_at=now();
  return v_total;
end;
$function$;

revoke all on function public.cotacao_veicular_salvar_grupos_com_taxas(
  uuid,text,jsonb,jsonb
) from public,anon,authenticated;
grant execute on function public.cotacao_veicular_salvar_grupos_com_taxas(
  uuid,text,jsonb,jsonb
) to service_role;
