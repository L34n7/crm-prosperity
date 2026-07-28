-- Inclui automaticamente, nas observações do agendamento, as informações
-- capturadas anteriormente na mesma execução do fluxo.
--
-- A trigger roda no momento do INSERT. Portanto, somente capturas que já foram
-- concluídas antes do bloco agenda_criar_agendamento são consideradas.

create or replace function public.agenda_adicionar_capturas_fluxo_observacoes()
returns trigger
language plpgsql
as $$
declare
  v_capturas text;
  v_observacoes_atual text;
begin
  if new.automacao_execucao_id is null then
    return new;
  end if;

  select string_agg(
    format(
      '%s: %s',
      initcap(replace(coalesce(nullif(trim(av.chave), ''), 'informação'), '_', ' ')),
      trim(av.valor)
    ),
    E'\n'
    order by av.updated_at asc, av.chave asc
  )
  into v_capturas
  from public.automacao_variaveis av
  where av.empresa_id = new.empresa_id
    and av.execucao_id = new.automacao_execucao_id
    and av.metadata_json ? 'tipo_captura'
    and nullif(trim(av.valor), '') is not null;

  if nullif(trim(v_capturas), '') is null then
    return new;
  end if;

  v_observacoes_atual := nullif(trim(coalesce(new.observacoes, '')), '');

  new.observacoes := concat_ws(
    E'\n\n',
    v_observacoes_atual,
    E'Informações capturadas no fluxo:\n' || v_capturas
  );

  return new;
end;
$$;

drop trigger if exists trg_agenda_adicionar_capturas_fluxo_observacoes
  on public.agenda_agendamentos;

create trigger trg_agenda_adicionar_capturas_fluxo_observacoes
before insert on public.agenda_agendamentos
for each row
execute function public.agenda_adicionar_capturas_fluxo_observacoes();

comment on function public.agenda_adicionar_capturas_fluxo_observacoes() is
  'Adiciona às observações do agendamento as capturas já realizadas na mesma execução do fluxo.';
