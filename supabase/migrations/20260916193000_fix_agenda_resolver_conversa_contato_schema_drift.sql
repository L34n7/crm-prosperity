-- Corrige drift de schema nas funções usadas pela Agenda para localizar conversas.
-- A tabela public.conversas usa last_message_at e não possui mais
-- ultimo_evento_em nem telefone. O telefone pertence a public.contatos.

CREATE OR REPLACE FUNCTION public.agenda_resolver_conversa_contato(p_contato_id uuid)
RETURNS TABLE(conversa_id uuid, telefone text, contato_id uuid)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH alvo AS (
    SELECT c.id, ct.telefone, c.contato_id
    FROM public.conversas c
    LEFT JOIN public.contatos ct ON ct.id = c.contato_id
    WHERE c.contato_id = p_contato_id
      AND c.status <> 'encerrada'
    ORDER BY
      (lower(c.status) = 'aberta') DESC,
      c.last_message_at DESC NULLS LAST,
      c.created_at DESC
    LIMIT 1
  ),
  tel AS (
    SELECT
      ct.id AS contato_id,
      regexp_replace(coalesce(ct.telefone, ''), '[^0-9]', '', 'g') AS tel_contato
    FROM public.contatos ct
    WHERE ct.id = p_contato_id
  ),
  fallback AS (
    SELECT c.id, cc.telefone, c.contato_id
    FROM public.conversas c
    JOIN public.contatos cc ON cc.id = c.contato_id
    JOIN tel
      ON regexp_replace(coalesce(cc.telefone, ''), '[^0-9]', '', 'g') = tel.tel_contato
    WHERE tel.tel_contato <> ''
      AND c.status <> 'encerrada'
    ORDER BY
      (lower(c.status) = 'aberta') DESC,
      c.last_message_at DESC NULLS LAST,
      c.created_at DESC
    LIMIT 1
  )
  SELECT * FROM alvo
  UNION ALL
  SELECT * FROM fallback
  WHERE NOT EXISTS (SELECT 1 FROM alvo)
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.agenda_resolver_conversa_contato(
  p_empresa_id uuid,
  p_contato_id uuid,
  p_conversa_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_conversa_id uuid;
begin
  if p_conversa_id is not null then
    select c.id
      into v_conversa_id
    from public.conversas c
    where c.id = p_conversa_id
      and c.empresa_id = p_empresa_id
      and (p_contato_id is null or c.contato_id = p_contato_id)
    limit 1;

    if v_conversa_id is not null then
      return v_conversa_id;
    end if;
  end if;

  if p_contato_id is null then
    return null;
  end if;

  select c.id
    into v_conversa_id
  from public.conversas c
  where c.empresa_id = p_empresa_id
    and c.contato_id = p_contato_id
  order by c.last_message_at desc nulls last,
           c.updated_at desc nulls last,
           c.created_at desc
  limit 1;

  return v_conversa_id;
end;
$function$;
