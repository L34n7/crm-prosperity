-- Rastreamento interno de leads: origens, campanhas, links, cliques e eventos.

CREATE TABLE IF NOT EXISTS public.rastreamento_origens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  created_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS rastreamento_origens_empresa_nome_unique
  ON public.rastreamento_origens (empresa_id, lower(nome));

CREATE TABLE IF NOT EXISTS public.rastreamento_campanhas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  origem_id uuid NOT NULL REFERENCES public.rastreamento_origens(id),
  integracao_whatsapp_id uuid REFERENCES public.integracoes_whatsapp(id) ON DELETE SET NULL,
  nome text NOT NULL,
  codigo text NOT NULL,
  descricao text,
  numero_whatsapp text NOT NULL,
  mensagem_inicial text NOT NULL,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  created_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS rastreamento_campanhas_empresa_codigo_unique
  ON public.rastreamento_campanhas (empresa_id, upper(codigo));

CREATE INDEX IF NOT EXISTS rastreamento_campanhas_empresa_status_idx
  ON public.rastreamento_campanhas (empresa_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.rastreamento_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  campanha_id uuid NOT NULL REFERENCES public.rastreamento_campanhas(id),
  nome text NOT NULL,
  slug text NOT NULL,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  created_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS rastreamento_links_slug_unique
  ON public.rastreamento_links (lower(slug));

CREATE INDEX IF NOT EXISTS rastreamento_links_empresa_status_idx
  ON public.rastreamento_links (empresa_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.rastreamento_cliques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  origem_id uuid REFERENCES public.rastreamento_origens(id) ON DELETE SET NULL,
  campanha_id uuid REFERENCES public.rastreamento_campanhas(id) ON DELETE SET NULL,
  link_id uuid REFERENCES public.rastreamento_links(id) ON DELETE SET NULL,
  contato_id uuid REFERENCES public.contatos(id) ON DELETE SET NULL,
  conversa_id uuid REFERENCES public.conversas(id) ON DELETE SET NULL,
  tracking_token uuid NOT NULL DEFAULT gen_random_uuid(),
  ip_hash text,
  user_agent text,
  referer text,
  dispositivo text,
  clicked_at timestamptz NOT NULL DEFAULT now(),
  convertido_em timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS rastreamento_cliques_tracking_token_unique
  ON public.rastreamento_cliques (tracking_token);

CREATE INDEX IF NOT EXISTS rastreamento_cliques_link_clicked_idx
  ON public.rastreamento_cliques (link_id, clicked_at DESC);

CREATE INDEX IF NOT EXISTS rastreamento_cliques_empresa_clicked_idx
  ON public.rastreamento_cliques (empresa_id, clicked_at DESC);

ALTER TABLE public.contatos
  ADD COLUMN IF NOT EXISTS rastreamento_origem_id uuid REFERENCES public.rastreamento_origens(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rastreamento_campanha_id uuid REFERENCES public.rastreamento_campanhas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rastreamento_link_id uuid REFERENCES public.rastreamento_links(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rastreamento_clique_id uuid REFERENCES public.rastreamento_cliques(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rastreamento_atribuido_em timestamptz;

ALTER TABLE public.conversas
  ADD COLUMN IF NOT EXISTS rastreamento_origem_id uuid REFERENCES public.rastreamento_origens(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rastreamento_campanha_id uuid REFERENCES public.rastreamento_campanhas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rastreamento_link_id uuid REFERENCES public.rastreamento_links(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rastreamento_clique_id uuid REFERENCES public.rastreamento_cliques(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rastreamento_atribuido_em timestamptz;

CREATE TABLE IF NOT EXISTS public.rastreamento_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (
    tipo IN (
      'clique_no_link',
      'lead_criado',
      'conversa_iniciada',
      'primeira_mensagem_recebida',
      'lead_qualificado',
      'agendamento_criado',
      'agendamento_confirmado',
      'venda_realizada',
      'venda_perdida'
    )
  ),
  contato_id uuid REFERENCES public.contatos(id) ON DELETE SET NULL,
  conversa_id uuid REFERENCES public.conversas(id) ON DELETE SET NULL,
  origem_id uuid REFERENCES public.rastreamento_origens(id) ON DELETE SET NULL,
  campanha_id uuid REFERENCES public.rastreamento_campanhas(id) ON DELETE SET NULL,
  link_id uuid REFERENCES public.rastreamento_links(id) ON DELETE SET NULL,
  clique_id uuid REFERENCES public.rastreamento_cliques(id) ON DELETE SET NULL,
  agendamento_id uuid REFERENCES public.agenda_agendamentos(id) ON DELETE SET NULL,
  valor numeric(14, 2),
  origem_registro text NOT NULL DEFAULT 'sistema',
  idempotency_key text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ocorrido_em timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS rastreamento_eventos_idempotency_unique
  ON public.rastreamento_eventos (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS rastreamento_eventos_empresa_ocorrido_idx
  ON public.rastreamento_eventos (empresa_id, ocorrido_em DESC);

CREATE INDEX IF NOT EXISTS rastreamento_eventos_campanha_tipo_idx
  ON public.rastreamento_eventos (campanha_id, tipo, ocorrido_em DESC);

CREATE OR REPLACE FUNCTION public.rastreamento_atualizar_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rastreamento_origens_updated_at ON public.rastreamento_origens;
CREATE TRIGGER rastreamento_origens_updated_at
BEFORE UPDATE ON public.rastreamento_origens
FOR EACH ROW EXECUTE FUNCTION public.rastreamento_atualizar_updated_at();

DROP TRIGGER IF EXISTS rastreamento_campanhas_updated_at ON public.rastreamento_campanhas;
CREATE TRIGGER rastreamento_campanhas_updated_at
BEFORE UPDATE ON public.rastreamento_campanhas
FOR EACH ROW EXECUTE FUNCTION public.rastreamento_atualizar_updated_at();

DROP TRIGGER IF EXISTS rastreamento_links_updated_at ON public.rastreamento_links;
CREATE TRIGGER rastreamento_links_updated_at
BEFORE UPDATE ON public.rastreamento_links
FOR EACH ROW EXECUTE FUNCTION public.rastreamento_atualizar_updated_at();

CREATE OR REPLACE FUNCTION public.rastreamento_criar_evento(
  p_empresa_id uuid,
  p_tipo text,
  p_contato_id uuid DEFAULT NULL,
  p_conversa_id uuid DEFAULT NULL,
  p_origem_id uuid DEFAULT NULL,
  p_campanha_id uuid DEFAULT NULL,
  p_link_id uuid DEFAULT NULL,
  p_clique_id uuid DEFAULT NULL,
  p_agendamento_id uuid DEFAULT NULL,
  p_valor numeric DEFAULT NULL,
  p_origem_registro text DEFAULT 'sistema',
  p_idempotency_key text DEFAULT NULL,
  p_metadata_json jsonb DEFAULT '{}'::jsonb,
  p_created_by uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_contato_id uuid := p_contato_id;
  v_origem_id uuid := p_origem_id;
  v_campanha_id uuid := p_campanha_id;
  v_link_id uuid := p_link_id;
  v_clique_id uuid := p_clique_id;
BEGIN
  IF p_conversa_id IS NOT NULL THEN
    SELECT
      COALESCE(v_contato_id, contato_id),
      COALESCE(v_origem_id, rastreamento_origem_id),
      COALESCE(v_campanha_id, rastreamento_campanha_id),
      COALESCE(v_link_id, rastreamento_link_id),
      COALESCE(v_clique_id, rastreamento_clique_id)
    INTO v_contato_id, v_origem_id, v_campanha_id, v_link_id, v_clique_id
    FROM public.conversas
    WHERE id = p_conversa_id;
  END IF;

  IF v_contato_id IS NOT NULL THEN
    SELECT
      COALESCE(v_origem_id, rastreamento_origem_id),
      COALESCE(v_campanha_id, rastreamento_campanha_id),
      COALESCE(v_link_id, rastreamento_link_id),
      COALESCE(v_clique_id, rastreamento_clique_id)
    INTO v_origem_id, v_campanha_id, v_link_id, v_clique_id
    FROM public.contatos
    WHERE id = v_contato_id;
  END IF;

  INSERT INTO public.rastreamento_eventos (
    empresa_id,
    tipo,
    contato_id,
    conversa_id,
    origem_id,
    campanha_id,
    link_id,
    clique_id,
    agendamento_id,
    valor,
    origem_registro,
    idempotency_key,
    metadata_json,
    created_by
  )
  VALUES (
    p_empresa_id,
    p_tipo,
    v_contato_id,
    p_conversa_id,
    v_origem_id,
    v_campanha_id,
    v_link_id,
    v_clique_id,
    p_agendamento_id,
    p_valor,
    p_origem_registro,
    p_idempotency_key,
    COALESCE(p_metadata_json, '{}'::jsonb),
    p_created_by
  )
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.rastreamento_evento_clique()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.rastreamento_criar_evento(
    NEW.empresa_id,
    'clique_no_link',
    NEW.contato_id,
    NEW.conversa_id,
    NEW.origem_id,
    NEW.campanha_id,
    NEW.link_id,
    NEW.id,
    NULL,
    NULL,
    'link_rastreavel',
    'clique:' || NEW.id::text,
    '{}'::jsonb,
    NULL
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rastreamento_evento_clique ON public.rastreamento_cliques;
CREATE TRIGGER rastreamento_evento_clique
AFTER INSERT ON public.rastreamento_cliques
FOR EACH ROW EXECUTE FUNCTION public.rastreamento_evento_clique();

CREATE OR REPLACE FUNCTION public.rastreamento_evento_contato()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.rastreamento_criar_evento(
      NEW.empresa_id,
      'lead_criado',
      NEW.id,
      NULL,
      NEW.rastreamento_origem_id,
      NEW.rastreamento_campanha_id,
      NEW.rastreamento_link_id,
      NEW.rastreamento_clique_id,
      NULL,
      NULL,
      'contato',
      'contato:' || NEW.id::text || ':lead_criado'
    );
  ELSIF NEW.status_lead = 'qualificado' AND OLD.status_lead IS DISTINCT FROM NEW.status_lead THEN
    PERFORM public.rastreamento_criar_evento(
      NEW.empresa_id,
      'lead_qualificado',
      NEW.id,
      NULL,
      NEW.rastreamento_origem_id,
      NEW.rastreamento_campanha_id,
      NEW.rastreamento_link_id,
      NEW.rastreamento_clique_id,
      NULL,
      NULL,
      'contato',
      'contato:' || NEW.id::text || ':lead_qualificado'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rastreamento_evento_contato ON public.contatos;
CREATE TRIGGER rastreamento_evento_contato
AFTER INSERT OR UPDATE OF status_lead ON public.contatos
FOR EACH ROW EXECUTE FUNCTION public.rastreamento_evento_contato();

CREATE OR REPLACE FUNCTION public.rastreamento_evento_conversa()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.rastreamento_criar_evento(
    NEW.empresa_id,
    'conversa_iniciada',
    NEW.contato_id,
    NEW.id,
    NEW.rastreamento_origem_id,
    NEW.rastreamento_campanha_id,
    NEW.rastreamento_link_id,
    NEW.rastreamento_clique_id,
    NULL,
    NULL,
    'conversa',
    'conversa:' || NEW.id::text || ':iniciada'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rastreamento_evento_conversa ON public.conversas;
CREATE TRIGGER rastreamento_evento_conversa
AFTER INSERT ON public.conversas
FOR EACH ROW EXECUTE FUNCTION public.rastreamento_evento_conversa();

CREATE OR REPLACE FUNCTION public.rastreamento_evento_primeira_mensagem()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.remetente_tipo = 'contato' OR NEW.origem = 'recebida' THEN
    PERFORM public.rastreamento_criar_evento(
      NEW.empresa_id,
      'primeira_mensagem_recebida',
      NULL,
      NEW.conversa_id,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      'mensagem',
      'conversa:' || NEW.conversa_id::text || ':primeira_mensagem',
      jsonb_build_object('mensagem_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rastreamento_evento_primeira_mensagem ON public.mensagens;
CREATE TRIGGER rastreamento_evento_primeira_mensagem
AFTER INSERT ON public.mensagens
FOR EACH ROW EXECUTE FUNCTION public.rastreamento_evento_primeira_mensagem();

CREATE OR REPLACE FUNCTION public.rastreamento_evento_agendamento()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_registrar_confirmacao boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_registrar_confirmacao := NEW.status = 'confirmado';

    PERFORM public.rastreamento_criar_evento(
      NEW.empresa_id,
      'agendamento_criado',
      NEW.contato_id,
      NEW.conversa_id,
      NULL,
      NULL,
      NULL,
      NULL,
      NEW.id,
      NULL,
      'agenda',
      'agendamento:' || NEW.id::text || ':criado'
    );
  ELSE
    v_registrar_confirmacao :=
      NEW.status = 'confirmado' AND OLD.status IS DISTINCT FROM NEW.status;
  END IF;

  IF v_registrar_confirmacao THEN
    PERFORM public.rastreamento_criar_evento(
      NEW.empresa_id,
      'agendamento_confirmado',
      NEW.contato_id,
      NEW.conversa_id,
      NULL,
      NULL,
      NULL,
      NULL,
      NEW.id,
      NULL,
      'agenda',
      'agendamento:' || NEW.id::text || ':confirmado'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rastreamento_evento_agendamento ON public.agenda_agendamentos;
CREATE TRIGGER rastreamento_evento_agendamento
AFTER INSERT OR UPDATE OF status ON public.agenda_agendamentos
FOR EACH ROW EXECUTE FUNCTION public.rastreamento_evento_agendamento();

INSERT INTO public.rastreamento_origens (empresa_id, nome, descricao)
SELECT empresa.id, 'Direto / Nao identificado', 'Origem padrao para contatos sem campanha rastreavel.'
FROM public.empresas empresa
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.rastreamento_criar_origem_padrao_empresa()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.rastreamento_origens (empresa_id, nome, descricao)
  VALUES (
    NEW.id,
    'Direto / Nao identificado',
    'Origem padrao para contatos sem campanha rastreavel.'
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rastreamento_criar_origem_padrao_empresa ON public.empresas;
CREATE TRIGGER rastreamento_criar_origem_padrao_empresa
AFTER INSERT ON public.empresas
FOR EACH ROW EXECUTE FUNCTION public.rastreamento_criar_origem_padrao_empresa();

INSERT INTO public.permissoes (codigo, descricao)
VALUES
  ('rastreamento.visualizar', 'Visualizar rastreamento de leads'),
  ('rastreamento.gerenciar', 'Gerenciar origens, campanhas, links e eventos de rastreamento')
ON CONFLICT (codigo) DO UPDATE
SET descricao = excluded.descricao;

INSERT INTO public.perfil_permissoes (perfil_empresa_id, permissao_codigo)
SELECT perfil.id, permissao.codigo
FROM public.perfis_empresa perfil
CROSS JOIN (
  VALUES
    ('rastreamento.visualizar'),
    ('rastreamento.gerenciar')
) AS permissao(codigo)
WHERE lower(perfil.nome) IN ('administrador', 'supervisor')
ON CONFLICT DO NOTHING;
