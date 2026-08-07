revoke execute on function public.estoque_movimentar(
  uuid,
  uuid,
  text,
  numeric,
  uuid,
  text
) from anon, authenticated, public;

revoke execute on function public.estoque_registrar_baixa_catalogo(
  uuid,
  uuid,
  numeric,
  uuid,
  text,
  text
) from anon, authenticated, public;

grant execute on function public.estoque_movimentar(
  uuid,
  uuid,
  text,
  numeric,
  uuid,
  text
) to service_role;

grant execute on function public.estoque_registrar_baixa_catalogo(
  uuid,
  uuid,
  numeric,
  uuid,
  text,
  text
) to service_role;
