create or replace function public.mensagens_sanitizar_saida_estruturada_agente_ia()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_origem text;
  v_chave text;
begin
  if new.remetente_tipo is distinct from 'bot' then
    return new;
  end if;

  v_origem := coalesce(new.metadata_json->>'origem', '');
  if v_origem not in ('agente_ia', 'agente_ia_negocio') then
    return new;
  end if;

  v_chave := lower(regexp_replace(coalesce(new.conteudo, ''), '[^a-zA-Z_]', '', 'g'));
  if v_chave in (
    'memoria_delta',
    'memory_delta',
    'tipo_negocio',
    'proxima_acao',
    'fatos_confirmados'
  ) then
    return null;
  end if;

  new.conteudo := regexp_replace(
    coalesce(new.conteudo, ''),
    '([?!])\s*\]\s*,?\s*$',
    E'\\1'
  );

  return new;
end;
$function$;

drop trigger if exists trg_mensagens_sanitizar_saida_estruturada_agente_ia
  on public.mensagens;

create trigger trg_mensagens_sanitizar_saida_estruturada_agente_ia
before insert or update of conteudo, metadata_json
on public.mensagens
for each row
execute function public.mensagens_sanitizar_saida_estruturada_agente_ia();
