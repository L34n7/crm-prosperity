-- Instagram Phase 1: tenant-scoped native Meta integration and shared CRM inbox.
CREATE TABLE IF NOT EXISTS public.integracoes_instagram (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome_conexao text NOT NULL,
  instagram_user_id text NOT NULL UNIQUE,
  username text NOT NULL,
  foto_perfil_url text,
  provider text NOT NULL DEFAULT 'meta_official' CHECK (provider = 'meta_official'),
  status text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'erro', 'desconectada')),
  access_token_encrypted text NOT NULL,
  token_expires_at timestamptz,
  webhook_verificado boolean NOT NULL DEFAULT false,
  ultimo_webhook_em timestamptz,
  ultimo_erro text,
  conectado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integracoes_instagram_piloto_empresa CHECK (empresa_id = '4fc69d8c-52e3-4756-aaa1-d86db217c376'::uuid)
);
CREATE INDEX IF NOT EXISTS integracoes_instagram_empresa_status_idx ON public.integracoes_instagram(empresa_id, status);
ALTER TABLE public.integracoes_instagram ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integracoes_instagram FROM anon, authenticated;

-- The shared contatos table must support IG-scoped identities without invented phone numbers.
ALTER TABLE public.contatos ADD COLUMN IF NOT EXISTS instagram_user_id text;
ALTER TABLE public.contatos DROP CONSTRAINT IF EXISTS contatos_telefone_ou_email_chk;
ALTER TABLE public.contatos ADD CONSTRAINT contatos_telefone_ou_email_chk CHECK (
  NULLIF(btrim(telefone), '') IS NOT NULL
  OR NULLIF(btrim(email), '') IS NOT NULL
  OR NULLIF(btrim(instagram_user_id), '') IS NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS contatos_empresa_instagram_user_uidx
ON public.contatos(empresa_id, instagram_user_id)
WHERE instagram_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.instagram_contatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  integracao_instagram_id uuid NOT NULL REFERENCES public.integracoes_instagram(id) ON DELETE CASCADE,
  contato_id uuid NOT NULL REFERENCES public.contatos(id) ON DELETE CASCADE,
  instagram_sender_id text NOT NULL,
  username text,
  ultima_interacao_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(integracao_instagram_id, instagram_sender_id)
);
CREATE INDEX IF NOT EXISTS instagram_contatos_empresa_contato_idx ON public.instagram_contatos(empresa_id, contato_id);
ALTER TABLE public.instagram_contatos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.instagram_contatos FROM anon, authenticated;

ALTER TABLE public.conversas ADD COLUMN IF NOT EXISTS integracao_instagram_id uuid
 REFERENCES public.integracoes_instagram(id) ON DELETE SET NULL;
ALTER TABLE public.conversas DROP CONSTRAINT IF EXISTS conversas_canal_check;
ALTER TABLE public.conversas ADD CONSTRAINT conversas_canal_check CHECK(canal IN ('whatsapp','instagram'));
CREATE INDEX IF NOT EXISTS conversas_empresa_instagram_listagem_idx
 ON public.conversas(empresa_id, integracao_instagram_id, last_message_at DESC)
 WHERE canal='instagram';
CREATE UNIQUE INDEX IF NOT EXISTS conversas_instagram_uma_ativa_por_contato
 ON public.conversas(empresa_id, contato_id, integracao_instagram_id)
 WHERE canal='instagram' AND status IN ('aberta','bot','fila','em_atendimento','aguardando_cliente');

-- Called only from server using service_role. One transaction, serialized by sender, deduplicates retries.
CREATE OR REPLACE FUNCTION public.instagram_registrar_mensagem(
  p_integracao_id uuid,
  p_sender_id text,
  p_mid text,
  p_conteudo text,
  p_tipo text DEFAULT 'texto',
  p_username text DEFAULT NULL,
  p_ocorrido_em timestamptz DEFAULT now()
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_empresa_id uuid;
  v_contato_id uuid;
  v_conversa_id uuid;
  v_protocolo_id uuid;
  v_identificador text;
  v_nome text;
BEGIN
  SELECT empresa_id INTO v_empresa_id
    FROM public.integracoes_instagram
    WHERE id = p_integracao_id AND status = 'ativa';
  IF v_empresa_id IS NULL OR v_empresa_id <> '4fc69d8c-52e3-4756-aaa1-d86db217c376'::uuid THEN
    RAISE EXCEPTION 'Integração Instagram indisponível';
  END IF;
  IF NULLIF(btrim(p_sender_id),'') IS NULL OR NULLIF(btrim(p_mid),'') IS NULL THEN
    RAISE EXCEPTION 'Mensagem Instagram sem identificador';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_integracao_id::text || ':' || p_sender_id, 0));
  SELECT conversa_id INTO v_conversa_id FROM public.mensagens WHERE mensagem_externa_id = p_mid LIMIT 1;
  IF v_conversa_id IS NOT NULL THEN RETURN v_conversa_id; END IF;
  v_identificador := 'ig:' || p_integracao_id::text || ':' || p_sender_id;
  v_nome := COALESCE(NULLIF(btrim(p_username),''), 'Instagram ' || right(p_sender_id, 6));

  SELECT id INTO v_contato_id FROM public.contatos
    WHERE empresa_id=v_empresa_id AND instagram_user_id=v_identificador LIMIT 1;
  IF v_contato_id IS NULL THEN
    INSERT INTO public.contatos(empresa_id, nome, origem, instagram_user_id)
      VALUES(v_empresa_id,v_nome,'instagram',v_identificador)
      RETURNING id INTO v_contato_id;
  END IF;

  INSERT INTO public.instagram_contatos(
    empresa_id,integracao_instagram_id,contato_id,instagram_sender_id,username,ultima_interacao_em)
  VALUES(v_empresa_id,p_integracao_id,v_contato_id,p_sender_id,NULLIF(p_username,''),p_ocorrido_em)
  ON CONFLICT (integracao_instagram_id,instagram_sender_id)
  DO UPDATE SET ultima_interacao_em=GREATEST(instagram_contatos.ultima_interacao_em,excluded.ultima_interacao_em),
    username=COALESCE(excluded.username,instagram_contatos.username),updated_at=now();

  SELECT id INTO v_conversa_id FROM public.conversas
    WHERE empresa_id=v_empresa_id AND contato_id=v_contato_id
      AND integracao_instagram_id=p_integracao_id
      AND canal='instagram'
      AND status IN ('aberta','bot','fila','em_atendimento','aguardando_cliente')
    ORDER BY created_at DESC LIMIT 1;

  IF v_conversa_id IS NULL THEN
    INSERT INTO public.conversas(
      empresa_id,contato_id,integracao_instagram_id,canal,status,escopo_fila,
      origem_atendimento,bot_ativo,last_message_at,last_inbound_message_at)
    VALUES(v_empresa_id,v_contato_id,p_integracao_id,'instagram','fila','geral',
      'entrada_cliente',false,p_ocorrido_em,p_ocorrido_em)
    RETURNING id INTO v_conversa_id;
  END IF;

  SELECT id INTO v_protocolo_id FROM public.conversa_protocolos
    WHERE conversa_id=v_conversa_id AND ativo=true ORDER BY created_at DESC LIMIT 1;
  IF v_protocolo_id IS NULL THEN
    INSERT INTO public.conversa_protocolos(
      empresa_id,conversa_id,contato_id,protocolo,tipo,ativo)
    VALUES(v_empresa_id,v_conversa_id,v_contato_id,
      'IG-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),'abertura',true)
    RETURNING id INTO v_protocolo_id;
  END IF;

  INSERT INTO public.mensagens(
    empresa_id,conversa_id,conversa_protocolo_id,remetente_tipo,
    conteudo,tipo_mensagem,origem,status_envio,mensagem_externa_id,
    metadata_json,created_at)
  VALUES(v_empresa_id,v_conversa_id,v_protocolo_id,'contato',
    COALESCE(p_conteudo,''),CASE WHEN p_tipo IN ('texto','imagem','video','audio','documento') THEN p_tipo ELSE 'unsupported' END,
    'recebida','entregue',p_mid,jsonb_build_object('instagram',jsonb_build_object(
      'integracao_id',p_integracao_id,'sender_id',p_sender_id)),p_ocorrido_em)
  ON CONFLICT (mensagem_externa_id) DO NOTHING;

  UPDATE public.conversas SET
    last_message_at=GREATEST(COALESCE(last_message_at,p_ocorrido_em),p_ocorrido_em),
    last_inbound_message_at=GREATEST(COALESCE(last_inbound_message_at,p_ocorrido_em),p_ocorrido_em)
  WHERE id=v_conversa_id;
  UPDATE public.integracoes_instagram SET
    ultimo_webhook_em=now(),webhook_verificado=true,updated_at=now()
  WHERE id=p_integracao_id;

  RETURN v_conversa_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.instagram_registrar_mensagem(uuid,text,text,text,text,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.instagram_registrar_mensagem(uuid,text,text,text,text,text,timestamptz) TO service_role;
