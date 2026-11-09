-- Transição definitiva: condições exclusivas de CADA plano.
-- Copia valores efetivos da configuração anterior sem sobrescrever
-- personalizações que o usuário já tenha feito por plano.
insert into public.cotacao_veicular_taxas_planos(
  empresa_id,plano,config_json,updated_at
)
select planos.empresa_id,planos.codigo,empresa.config_json,now()
from public.cotacao_veicular_taxas_empresa empresa
join public.cotacao_veicular_planos planos
  on planos.empresa_id=empresa.empresa_id
on conflict(empresa_id,plano) do nothing;

-- Salvamento ÚNICO (transacional) de regras/opcionais/condições.
-- O endpoint verifica permissão de configuração e valida os dados antes
-- da chamada; o banco recebe somente chamadas do service_role.
create or replace function public.cotacao_veicular_salvar_regras_com_taxas(
  p_empresa_id uuid,
  p_plano text,
  p_categorias jsonb,
  p_regra jsonb,
  p_opcionais jsonb,
  p_condicoes jsonb
) returns integer
language plpgsql security definer set search_path=''
as $function$
declare v_total integer;
begin
  if jsonb_typeof(p_condicoes)<>'object' or
     not (
       p_condicoes ? 'adesao_ativa'
       and p_condicoes ? 'rastreador_ativo'
       and p_condicoes ? 'rastreador_mensalidade_inclusa'
     ) then
    raise exception 'Condições de contratação inválidas.';
  end if;
  if not exists(
    select 1 from public.cotacao_veicular_planos
    where empresa_id=p_empresa_id and codigo=p_plano
  ) then
    raise exception 'Plano não encontrado nesta empresa.';
  end if;
  v_total:=public.cotacao_veicular_salvar_regras_multiplas(
    p_empresa_id,p_plano,p_categorias,p_regra,p_opcionais
  );
  insert into public.cotacao_veicular_taxas_planos(
    empresa_id,plano,config_json,updated_at
  ) values (p_empresa_id,p_plano,p_condicoes,now())
  on conflict(empresa_id,plano) do update
    set config_json=excluded.config_json,updated_at=now();
  return v_total;
end;
$function$;
revoke all on function public.cotacao_veicular_salvar_regras_com_taxas(
  uuid,text,jsonb,jsonb,jsonb,jsonb
) from public,anon,authenticated;
grant execute on function public.cotacao_veicular_salvar_regras_com_taxas(
  uuid,text,jsonb,jsonb,jsonb,jsonb
) to service_role;
