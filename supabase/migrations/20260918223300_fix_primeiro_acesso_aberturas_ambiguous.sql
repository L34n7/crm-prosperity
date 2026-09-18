-- Corrige ambiguidade entre os nomes das colunas da tabela e os nomes
-- dos campos de retorno da função registrar_abertura_primeiro_acesso.
-- O erro 42702 impedia qualquer link válido de primeiro acesso de ser aberto.

create or replace function public.registrar_abertura_primeiro_acesso(
  p_token_hash text
)
returns table(
  ok boolean,
  motivo text,
  email text,
  aberturas integer,
  max_aberturas integer,
  aberturas_restantes integer,
  expira_em timestamptz
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row public.primeiro_acesso_tokens%rowtype;
begin
  select t.*
  into v_row
  from public.primeiro_acesso_tokens as t
  where t.token_hash = p_token_hash
  for update;

  if not found then
    return query
    select false, 'invalido', null::text, 0, 3, 0, null::timestamptz;
    return;
  end if;

  if v_row.senha_definida_em is not null then
    return query
    select false, 'senha_definida', v_row.email, v_row.aberturas,
      v_row.max_aberturas,
      greatest(v_row.max_aberturas - v_row.aberturas, 0),
      v_row.expira_em;
    return;
  end if;

  if v_row.invalidado_em is not null then
    return query
    select false, 'invalidado', v_row.email, v_row.aberturas,
      v_row.max_aberturas,
      greatest(v_row.max_aberturas - v_row.aberturas, 0),
      v_row.expira_em;
    return;
  end if;

  if v_row.expira_em <= now() then
    return query
    select false, 'expirado', v_row.email, v_row.aberturas,
      v_row.max_aberturas, 0, v_row.expira_em;
    return;
  end if;

  if v_row.aberturas >= v_row.max_aberturas then
    return query
    select false, 'limite_aberturas', v_row.email, v_row.aberturas,
      v_row.max_aberturas, 0, v_row.expira_em;
    return;
  end if;

  update public.primeiro_acesso_tokens as t
  set aberturas = t.aberturas + 1,
      ultimo_acesso_em = now(),
      updated_at = now()
  where t.id = v_row.id
  returning t.* into v_row;

  return query
  select true, 'ok', v_row.email, v_row.aberturas, v_row.max_aberturas,
    greatest(v_row.max_aberturas - v_row.aberturas, 0),
    v_row.expira_em;
end;
$function$;
