do $$
declare
  v_automacao_id uuid := '3219457a-86f7-4886-a0eb-a8f9ad0b5fe6'::uuid;
begin
  if exists (
    select 1
    from public.rotina_automacoes
    where id = v_automacao_id
  ) and not exists (
    select 1
    from public.rotina_automacao_condicoes
    where automacao_id = v_automacao_id
      and campo = 'pagamento.origem_geracao'
  ) then
    insert into public.rotina_automacao_condicoes (
      empresa_id,
      automacao_id,
      grupo,
      ordem,
      conjuncao,
      campo,
      operador,
      valor_json,
      configuracao_json
    )
    select
      empresa_id,
      id,
      0,
      2,
      'and',
      'pagamento.origem_geracao',
      'igual',
      '"cliente"'::jsonb,
      '{}'::jsonb
    from public.rotina_automacoes
    where id = v_automacao_id;
  end if;
end
$$;
