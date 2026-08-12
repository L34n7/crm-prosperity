-- A listagem da agenda assegura os tipos padrao antes de consultar os eventos.
-- Essa inicializacao deve ser silenciosamente ignorada no modo somente leitura,
-- sem enfraquecer os gatilhos que protegem escritas reais da agenda.

create or replace function public.agenda_etapa1_assegurar_tipos_padrao(
  p_empresa_id uuid,
  p_usuario_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null
    and not public.usuario_atual_tem_permissao('agendas.editar') then
    return;
  end if;

  insert into public.agenda_tipos (
    empresa_id,
    nome,
    descricao,
    cor,
    icone,
    ativo,
    ordem,
    padrao,
    created_by,
    updated_by
  )
  values
    (p_empresa_id, 'Reunião', 'Reuniões internas ou com clientes.', '#6366f1', 'users', true, 10, true, p_usuario_id, p_usuario_id),
    (p_empresa_id, 'Ligação', 'Chamadas e retornos por telefone.', '#0ea5e9', 'phone', true, 20, true, p_usuario_id, p_usuario_id),
    (p_empresa_id, 'Visita', 'Visitas presenciais e técnicas.', '#10b981', 'map-pin', true, 30, true, p_usuario_id, p_usuario_id),
    (p_empresa_id, 'Atendimento', 'Atendimentos gerais.', '#14b8a6', 'calendar', true, 40, true, p_usuario_id, p_usuario_id),
    (p_empresa_id, 'Retorno', 'Acompanhamentos e próximos contatos.', '#f59e0b', 'rotate-ccw', true, 50, true, p_usuario_id, p_usuario_id),
    (p_empresa_id, 'Proposta', 'Apresentação, revisão ou assinatura de proposta.', '#ec4899', 'file-text', true, 60, true, p_usuario_id, p_usuario_id)
  on conflict do nothing;
end;
$$;

revoke execute on function public.agenda_etapa1_assegurar_tipos_padrao(uuid, uuid)
  from public, anon, authenticated;
