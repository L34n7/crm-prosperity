-- Permite o bloco Botao redirect nos fluxos de automacao.

ALTER TABLE public.automacao_nos
  DROP CONSTRAINT IF EXISTS automacao_nos_tipo_no_check;

ALTER TABLE public.automacao_nos
  ADD CONSTRAINT automacao_nos_tipo_no_check CHECK (
    tipo_no = ANY (
      ARRAY[
        'inicio'::text,
        'enviar_texto'::text,
        'pergunta_opcoes'::text,
        'transferir_setor'::text,
        'encerrar'::text,
        'enviar_imagem'::text,
        'enviar_video'::text,
        'enviar_audio'::text,
        'enviar_botoes'::text,
        'botao_redirect'::text,
        'avaliacao'::text,
        'capturar_resposta'::text,
        'agendar_disparo'::text,
        'agenda_buscar_agendamento'::text,
        'agenda_escolher_horario'::text,
        'agenda_criar_agendamento'::text,
        'agenda_remarcar_agendamento'::text,
        'agenda_cancelar_agendamento'::text,
        'interpretar_arquivo_ia'::text
      ]
    )
  ) NOT VALID;
