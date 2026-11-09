-- Materiais reutilizam a biblioteca de mídias existente e permanecem isolados por empresa.
-- O vínculo do agente fica em agente_ia_ferramentas.config_json; conhecimentos
-- armazenam apenas IDs e instruções de relevância, nunca URLs externas.
alter table public.agente_ia_conhecimentos
  add column if not exists materiais_json jsonb not null default '[]'::jsonb;

alter table public.agente_ia_ferramentas
  drop constraint if exists agente_ia_ferramentas_tipo_check;

alter table public.agente_ia_ferramentas
  add constraint agente_ia_ferramentas_tipo_check
  check (tipo in (
    'consultar_conhecimento', 'consultar_agenda', 'criar_agendamento',
    'remarcar_agendamento', 'cancelar_agendamento', 'consultar_contato',
    'transferir_humano', 'consultar_produtos_estoque', 'informar_valor_produto',
    'consultar_servicos', 'consultar_imoveis', 'registrar_interesse_preferencia',
    'realizar_venda', 'gerar_cotacao_veicular', 'enviar_material'
  ));

-- A política RLS existente de agente_ia_conhecimentos continua protegendo
-- a nova coluna; não é criada tabela nem função privilegiada adicional.
