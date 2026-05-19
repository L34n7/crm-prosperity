-- Agenda comercial para marcação automática pelo WhatsApp.
-- Execute esta migration antes de ativar os blocos modulares de agenda.

CREATE TABLE IF NOT EXISTS public.agenda_calendarios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  nome text NOT NULL,
  descricao text,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  duracao_minutos integer NOT NULL DEFAULT 60 CHECK (duracao_minutos >= 5 AND duracao_minutos <= 1440),
  intervalo_minutos integer NOT NULL DEFAULT 30 CHECK (intervalo_minutos >= 5 AND intervalo_minutos <= 1440),
  antecedencia_minutos integer NOT NULL DEFAULT 120 CHECK (antecedencia_minutos >= 0),
  janela_dias integer NOT NULL DEFAULT 14 CHECK (janela_dias >= 1 AND janela_dias <= 180),
  status text NOT NULL DEFAULT 'ativo' CHECK (status = ANY (ARRAY['ativo'::text, 'inativo'::text, 'arquivado'::text])),
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT agenda_calendarios_pkey PRIMARY KEY (id),
  CONSTRAINT agenda_calendarios_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id),
  CONSTRAINT agenda_calendarios_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.usuarios(id),
  CONSTRAINT agenda_calendarios_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.usuarios(id)
);

CREATE TABLE IF NOT EXISTS public.agenda_disponibilidades (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  agenda_id uuid NOT NULL,
  dia_semana integer NOT NULL CHECK (dia_semana >= 0 AND dia_semana <= 6),
  hora_inicio time without time zone NOT NULL,
  hora_fim time without time zone NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT agenda_disponibilidades_pkey PRIMARY KEY (id),
  CONSTRAINT agenda_disponibilidades_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id),
  CONSTRAINT agenda_disponibilidades_agenda_id_fkey FOREIGN KEY (agenda_id) REFERENCES public.agenda_calendarios(id) ON DELETE CASCADE,
  CONSTRAINT agenda_disponibilidades_intervalo_check CHECK (hora_fim > hora_inicio),
  CONSTRAINT agenda_disponibilidades_agenda_dia_unique UNIQUE (agenda_id, dia_semana)
);

CREATE TABLE IF NOT EXISTS public.agenda_agendamentos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  agenda_id uuid NOT NULL,
  contato_id uuid,
  conversa_id uuid,
  conversa_protocolo_id uuid,
  automacao_execucao_id uuid,
  automacao_fluxo_id uuid,
  automacao_no_id uuid,
  titulo text NOT NULL DEFAULT 'Agendamento',
  nome_cliente text,
  telefone_cliente text,
  email_cliente text,
  inicio_at timestamp with time zone NOT NULL,
  fim_at timestamp with time zone NOT NULL,
  status text NOT NULL DEFAULT 'agendado' CHECK (status = ANY (ARRAY['agendado'::text, 'confirmado'::text, 'cancelado'::text, 'realizado'::text, 'faltou'::text])),
  origem text NOT NULL DEFAULT 'manual' CHECK (origem = ANY (ARRAY['manual'::text, 'automacao'::text, 'api'::text])),
  observacoes text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT agenda_agendamentos_pkey PRIMARY KEY (id),
  CONSTRAINT agenda_agendamentos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id),
  CONSTRAINT agenda_agendamentos_agenda_id_fkey FOREIGN KEY (agenda_id) REFERENCES public.agenda_calendarios(id) ON DELETE CASCADE,
  CONSTRAINT agenda_agendamentos_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES public.contatos(id),
  CONSTRAINT agenda_agendamentos_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES public.conversas(id),
  CONSTRAINT agenda_agendamentos_conversa_protocolo_id_fkey FOREIGN KEY (conversa_protocolo_id) REFERENCES public.conversa_protocolos(id),
  CONSTRAINT agenda_agendamentos_automacao_execucao_id_fkey FOREIGN KEY (automacao_execucao_id) REFERENCES public.automacao_execucoes(id),
  CONSTRAINT agenda_agendamentos_automacao_fluxo_id_fkey FOREIGN KEY (automacao_fluxo_id) REFERENCES public.automacao_fluxos(id),
  CONSTRAINT agenda_agendamentos_automacao_no_id_fkey FOREIGN KEY (automacao_no_id) REFERENCES public.automacao_nos(id),
  CONSTRAINT agenda_agendamentos_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.usuarios(id),
  CONSTRAINT agenda_agendamentos_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.usuarios(id),
  CONSTRAINT agenda_agendamentos_periodo_check CHECK (fim_at > inicio_at)
);

CREATE INDEX IF NOT EXISTS agenda_calendarios_empresa_status_idx
  ON public.agenda_calendarios (empresa_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS agenda_disponibilidades_agenda_dia_idx
  ON public.agenda_disponibilidades (agenda_id, dia_semana, ativo);

CREATE INDEX IF NOT EXISTS agenda_agendamentos_empresa_inicio_idx
  ON public.agenda_agendamentos (empresa_id, inicio_at DESC);

CREATE INDEX IF NOT EXISTS agenda_agendamentos_agenda_periodo_idx
  ON public.agenda_agendamentos (agenda_id, inicio_at, fim_at)
  WHERE status IN ('agendado', 'confirmado');

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
        'avaliacao'::text,
        'capturar_resposta'::text,
        'agendar_disparo'::text,
        'interpretar_arquivo_ia'::text
      ]
    )
  );
