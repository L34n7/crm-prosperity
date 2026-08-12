-- Permissoes independentes para leitura das conversas pertencentes aos setores do usuario.
insert into public.permissoes (codigo, descricao)
values
  (
    'conversas.visualizar_encerradas_setor',
    'Visualizar conversas encerradas dos setores do usuario'
  ),
  (
    'conversas.visualizar_conversas_setor',
    'Visualizar conversas ativas de outros responsaveis nos setores do usuario'
  )
on conflict (codigo) do update
set descricao = excluded.descricao;

-- Administradores recebem todas as permissoes operacionais. Os acessos internos
-- especiais da empresa legado continuam fora desta regra.
insert into public.perfil_permissoes (perfil_empresa_id, permissao_codigo)
select perfil.id, permissao.codigo
from public.perfis_empresa perfil
cross join public.permissoes permissao
where lower(trim(perfil.nome)) = 'administrador'
  and permissao.codigo in (
    'conversas.visualizar_encerradas_setor',
    'conversas.visualizar_conversas_setor'
  )
on conflict (perfil_empresa_id, permissao_codigo) do nothing;

-- As versoes v2 mantem os filtros e a paginacao existentes, acrescentando a
-- permissao independente para conversas encerradas do setor.
CREATE OR REPLACE FUNCTION public.contar_conversas_nao_lidas_v2(p_empresa_id uuid, p_usuario_id uuid, p_is_admin boolean, p_setores_ids uuid[] DEFAULT '{}'::uuid[], p_usuario_pode_atribuir boolean DEFAULT false, p_usuario_pode_visualizar_encerradas_setor boolean DEFAULT false, p_status text DEFAULT NULL::text, p_prioridade text DEFAULT NULL::text, p_contato_id uuid DEFAULT NULL::uuid, p_setor_id uuid DEFAULT NULL::uuid, p_responsavel_id uuid DEFAULT NULL::uuid, p_busca text DEFAULT NULL::text, p_canal text DEFAULT NULL::text, p_lista_id uuid DEFAULT NULL::uuid, p_integracao_whatsapp_id uuid DEFAULT NULL::uuid, p_integracoes_whatsapp_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COUNT(*)::integer
  FROM public.conversas c
  LEFT JOIN public.conversa_leituras cl
    ON cl.empresa_id = c.empresa_id
   AND cl.conversa_id = c.id
   AND cl.usuario_id = p_usuario_id
  WHERE c.empresa_id = p_empresa_id
      AND (
        p_is_admin
        OR c.responsavel_id = p_usuario_id
        OR (
          c.escopo_fila = 'geral'
          AND c.status = 'fila'
          AND c.responsavel_id IS NULL
        )
        OR (
          c.setor_id IS NOT NULL
          AND c.setor_id = ANY(COALESCE(p_setores_ids, '{}'::uuid[]))
          AND (
            (c.responsavel_id IS NULL AND c.status = 'fila')
            OR (
              p_usuario_pode_atribuir
              AND c.status NOT IN (
                'encerrado_manual',
                'encerrado_24h',
                'encerrado_aut'
              )
            )
            OR (
              p_usuario_pode_visualizar_encerradas_setor
              AND c.status IN (
                'encerrado_manual',
                'encerrado_24h',
                'encerrado_aut'
              )
            )
          )
        )
      )
      AND (p_status IS NULL OR c.status = p_status)
    AND (p_prioridade IS NULL OR c.prioridade = p_prioridade)
    AND (p_contato_id IS NULL OR c.contato_id = p_contato_id)
    AND (p_setor_id IS NULL OR c.setor_id = p_setor_id)
    AND (p_responsavel_id IS NULL OR c.responsavel_id = p_responsavel_id)
    AND (
      p_integracao_whatsapp_id IS NULL
      OR c.integracao_whatsapp_id = p_integracao_whatsapp_id
    )
    AND (
      COALESCE(array_length(p_integracoes_whatsapp_ids, 1), 0) = 0
      OR c.integracao_whatsapp_id IS NULL
      OR c.integracao_whatsapp_id = ANY(p_integracoes_whatsapp_ids)
    )
    AND (
      p_canal IS NULL
      OR p_canal = ''
      OR p_canal = 'todos'
      OR c.canal = p_canal
    )
    AND (
      p_lista_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.conversas_listas_itens cli
        WHERE cli.empresa_id = p_empresa_id
          AND cli.lista_id = p_lista_id
          AND cli.conversa_id = c.id
      )
    )
    AND (
      NULLIF(BTRIM(p_busca), '') IS NULL
      OR c.assunto ILIKE '%' || BTRIM(p_busca) || '%'
      OR c.id::text = BTRIM(p_busca)
      OR EXISTS (
        SELECT 1
        FROM public.contatos ct
        WHERE ct.id = c.contato_id
          AND ct.empresa_id = p_empresa_id
          AND (
            ct.nome ILIKE '%' || BTRIM(p_busca) || '%'
            OR ct.telefone ILIKE '%' || BTRIM(p_busca) || '%'
            OR ct.email ILIKE '%' || BTRIM(p_busca) || '%'
            OR ct.empresa ILIKE '%' || BTRIM(p_busca) || '%'
          )
      )
      OR EXISTS (
        SELECT 1
        FROM public.conversa_protocolos cp
        WHERE cp.empresa_id = p_empresa_id
          AND cp.conversa_id = c.id
          AND cp.protocolo ILIKE '%' || BTRIM(p_busca) || '%'
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.mensagens m
      WHERE m.empresa_id = p_empresa_id
        AND m.conversa_id = c.id
        AND (m.origem = 'recebida' OR m.remetente_tipo = 'contato')
        AND (
          cl.ultima_mensagem_lida_at IS NULL
          OR m.created_at > cl.ultima_mensagem_lida_at
        )
      LIMIT 1
    );
$function$;

-- listar_conversas_resumo(p_empresa_id uuid, p_usuario_id uuid, p_is_admin boolean, p_setores_ids uuid[], p_usuario_pode_atribuir boolean, p_usuario_pode_visualizar_encerradas_setor boolean, p_status text, p_prioridade text, p_contato_id uuid, p_setor_id uuid, p_responsavel_id uuid, p_busca text, p_canal text, p_chip text, p_lista_id uuid, p_cursor_last_message_at timestamp with time zone, p_cursor_created_at timestamp with time zone, p_cursor_id uuid, p_limite integer)
CREATE OR REPLACE FUNCTION public.listar_conversas_resumo_v2(p_empresa_id uuid, p_usuario_id uuid, p_is_admin boolean, p_setores_ids uuid[], p_usuario_pode_atribuir boolean, p_usuario_pode_visualizar_encerradas_setor boolean, p_status text, p_prioridade text, p_contato_id uuid, p_setor_id uuid, p_responsavel_id uuid, p_busca text, p_canal text, p_chip text, p_lista_id uuid, p_cursor_last_message_at timestamp with time zone, p_cursor_created_at timestamp with time zone, p_cursor_id uuid, p_limite integer)
 RETURNS SETOF jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH pagina AS (
    SELECT c.*
    FROM public.conversas c
    LEFT JOIN public.conversa_leituras cl
      ON cl.empresa_id = c.empresa_id
     AND cl.conversa_id = c.id
     AND cl.usuario_id = p_usuario_id
    WHERE c.empresa_id = p_empresa_id
      AND (
        p_is_admin
        OR c.responsavel_id = p_usuario_id
        OR (
          c.escopo_fila = 'geral'
          AND c.status = 'fila'
          AND c.responsavel_id IS NULL
        )
        OR (
          c.setor_id IS NOT NULL
          AND c.setor_id = ANY(COALESCE(p_setores_ids, '{}'::uuid[]))
          AND (
            (c.responsavel_id IS NULL AND c.status = 'fila')
            OR (
              p_usuario_pode_atribuir
              AND c.status NOT IN (
                'encerrado_manual',
                'encerrado_24h',
                'encerrado_aut'
              )
            )
            OR (
              p_usuario_pode_visualizar_encerradas_setor
              AND c.status IN (
                'encerrado_manual',
                'encerrado_24h',
                'encerrado_aut'
              )
            )
          )
        )
      )
      AND (p_status IS NULL OR c.status = p_status)
      AND (p_prioridade IS NULL OR c.prioridade = p_prioridade)
      AND (p_contato_id IS NULL OR c.contato_id = p_contato_id)
      AND (p_setor_id IS NULL OR c.setor_id = p_setor_id)
      AND (p_responsavel_id IS NULL OR c.responsavel_id = p_responsavel_id)
      AND (
        p_canal IS NULL
        OR p_canal = ''
        OR p_canal = 'todos'
        OR c.canal = p_canal
      )
      AND (
        p_lista_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.conversas_listas_itens cli
          WHERE cli.empresa_id = p_empresa_id
            AND cli.lista_id = p_lista_id
            AND cli.conversa_id = c.id
        )
      )
      AND (
        NULLIF(BTRIM(p_busca), '') IS NULL
        OR c.assunto ILIKE '%' || BTRIM(p_busca) || '%'
        OR c.id::text = BTRIM(p_busca)
        OR EXISTS (
          SELECT 1
          FROM public.contatos ct_busca
          WHERE ct_busca.id = c.contato_id
            AND ct_busca.empresa_id = p_empresa_id
            AND (
              ct_busca.nome ILIKE '%' || BTRIM(p_busca) || '%'
              OR ct_busca.telefone ILIKE '%' || BTRIM(p_busca) || '%'
              OR ct_busca.email ILIKE '%' || BTRIM(p_busca) || '%'
              OR ct_busca.empresa ILIKE '%' || BTRIM(p_busca) || '%'
            )
        )
        OR EXISTS (
          SELECT 1
          FROM public.conversa_protocolos cp_busca
          WHERE cp_busca.empresa_id = p_empresa_id
            AND cp_busca.conversa_id = c.id
            AND cp_busca.protocolo ILIKE '%' || BTRIM(p_busca) || '%'
        )
      )
      AND (
        NULLIF(BTRIM(p_chip), '') IS NULL
        OR p_chip = 'Todas'
        OR (p_chip = 'fila' AND c.responsavel_id IS NULL)
        OR (p_chip = 'robo' AND c.bot_ativo = true)
        OR (
          p_chip = 'sem_responsavel'
          AND c.responsavel_id IS NULL
          AND c.bot_ativo = false
        )
        OR (
          p_chip = 'urgentes'
          AND c.prioridade IN ('alta', 'urgente')
        )
        OR (p_chip = 'minhas' AND c.responsavel_id = p_usuario_id)
        OR (
          p_chip = 'favoritos'
          AND EXISTS (
            SELECT 1
            FROM public.conversas_favoritas cf_filtro
            WHERE cf_filtro.empresa_id = p_empresa_id
              AND cf_filtro.usuario_id = p_usuario_id
              AND cf_filtro.conversa_id = c.id
          )
        )
        OR (
          p_chip = 'nao_lidas'
          AND EXISTS (
            SELECT 1
            FROM public.mensagens m_nao_lida
            WHERE m_nao_lida.empresa_id = p_empresa_id
              AND m_nao_lida.conversa_id = c.id
              AND (
                m_nao_lida.origem = 'recebida'
                OR m_nao_lida.remetente_tipo = 'contato'
              )
              AND (
                cl.ultima_mensagem_lida_at IS NULL
                OR m_nao_lida.created_at > cl.ultima_mensagem_lida_at
              )
            LIMIT 1
          )
        )
      )
      AND (
        p_cursor_id IS NULL
        OR ROW(
          COALESCE(c.last_message_at, '-infinity'::timestamptz),
          c.created_at,
          c.id
        ) < ROW(
          COALESCE(
            p_cursor_last_message_at,
            '-infinity'::timestamptz
          ),
          p_cursor_created_at,
          p_cursor_id
        )
      )
    ORDER BY
      c.last_message_at DESC NULLS LAST,
      c.created_at DESC,
      c.id DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limite, 21), 1), 101)
  )
  SELECT jsonb_build_object(
    'id', c.id,
    'assunto', c.assunto,
    'status', c.status,
    'bot_ativo', c.bot_ativo,
    'prioridade', c.prioridade,
    'canal', c.canal,
    'origem_atendimento', c.origem_atendimento,
    'integracao_whatsapp_id', c.integracao_whatsapp_id,
    'last_message_at', c.last_message_at,
    'started_at', c.started_at,
    'created_at', c.created_at,
    'setor_id', c.setor_id,
    'escopo_fila', c.escopo_fila,
    'responsavel_id', c.responsavel_id,
    'etiqueta_id', c.etiqueta_id,
    'etiqueta_cor', c.etiqueta_cor,
    'favorita', EXISTS (
      SELECT 1
      FROM public.conversas_favoritas cf
      WHERE cf.empresa_id = p_empresa_id
        AND cf.usuario_id = p_usuario_id
        AND cf.conversa_id = c.id
    ),
    'protocolo', protocolo.protocolo,
    'ultima_mensagem', COALESCE(
      NULLIF(BTRIM(ultima_mensagem.conteudo), ''),
      NULLIF(BTRIM(ultima_mensagem.metadata_json->>'caption'), ''),
      CASE ultima_mensagem.tipo_mensagem
        WHEN 'imagem' THEN 'Imagem'
        WHEN 'audio' THEN 'Áudio'
        WHEN 'video' THEN 'Vídeo'
        WHEN 'documento' THEN COALESCE(
          NULLIF(BTRIM(ultima_mensagem.metadata_json->>'filename'), ''),
          'Documento'
        )
        WHEN 'contato' THEN 'Contato compartilhado'
        WHEN 'localizacao' THEN 'Localização'
        WHEN 'template' THEN 'Template enviado'
        WHEN 'botao' THEN 'Resposta por botão'
        WHEN 'lista' THEN 'Resposta por lista'
        WHEN 'unsupported' THEN 'Mensagem não suportada'
        ELSE CASE
          WHEN ultima_mensagem.id IS NULL THEN NULL
          ELSE 'Mensagem'
        END
      END
    ),
    'unread_count', COALESCE(nao_lidas.quantidade, 0),
    'listas', COALESCE(listas.itens, '[]'::jsonb),
    'tem_disparo_agendado_pendente', disparo.id IS NOT NULL,
    'disparo_agendado_pendente', CASE
      WHEN disparo.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', disparo.id,
        'executar_em', disparo.executar_em,
        'template_nome', disparo.payload_json->>'template_nome'
      )
    END,
    'contatos', CASE
      WHEN contato.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', contato.id,
        'nome', contato.nome,
        'whatsapp_profile_name', contato.whatsapp_profile_name,
        'telefone', contato.telefone,
        'email', contato.email,
        'origem', contato.origem,
        'status_lead', contato.status_lead,
        'empresa', contato.empresa,
        'observacoes', contato.observacoes,
        'campanha', contato.campanha,
        'rastreamento_campanha_id', contato.rastreamento_campanha_id,
        'rastreamento_campanhas', CASE
          WHEN campanha.id IS NULL THEN NULL
          ELSE jsonb_build_object(
            'id', campanha.id,
            'nome', campanha.nome,
            'status', campanha.status,
            'rastreamento_origens', CASE
              WHEN origem.id IS NULL THEN NULL
              ELSE jsonb_build_object(
                'id', origem.id,
                'nome', origem.nome
              )
            END
          )
        END
      )
    END,
    'setores', CASE
      WHEN setor.id IS NULL THEN NULL
      ELSE jsonb_build_object('id', setor.id, 'nome', setor.nome)
    END,
    'responsavel', CASE
      WHEN responsavel.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', responsavel.id,
        'nome', responsavel.nome
      )
    END,
    'etiquetas', CASE
      WHEN etiqueta.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', etiqueta.id,
        'nome', etiqueta.nome,
        'descricao', etiqueta.descricao,
        'cor', etiqueta.cor
      )
    END
  )
  FROM pagina c
  LEFT JOIN public.contatos contato
    ON contato.id = c.contato_id
  LEFT JOIN public.setores setor
    ON setor.id = c.setor_id
  LEFT JOIN public.usuarios responsavel
    ON responsavel.id = c.responsavel_id
  LEFT JOIN public.etiquetas etiqueta
    ON etiqueta.id = c.etiqueta_id
  LEFT JOIN public.rastreamento_campanhas campanha
    ON campanha.id = contato.rastreamento_campanha_id
  LEFT JOIN public.rastreamento_origens origem
    ON origem.id = campanha.origem_id
  LEFT JOIN LATERAL (
    SELECT cp.protocolo
    FROM public.conversa_protocolos cp
    WHERE cp.empresa_id = p_empresa_id
      AND cp.conversa_id = c.id
      AND cp.ativo = true
    ORDER BY cp.created_at DESC, cp.id DESC
    LIMIT 1
  ) protocolo ON true
  LEFT JOIN LATERAL (
    SELECT
      m.id,
      m.conteudo,
      m.tipo_mensagem,
      m.metadata_json
    FROM public.mensagens m
    WHERE m.empresa_id = p_empresa_id
      AND m.conversa_id = c.id
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 1
  ) ultima_mensagem ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::integer AS quantidade
    FROM public.mensagens m
    LEFT JOIN public.conversa_leituras cl
      ON cl.empresa_id = p_empresa_id
     AND cl.conversa_id = c.id
     AND cl.usuario_id = p_usuario_id
    WHERE m.empresa_id = p_empresa_id
      AND m.conversa_id = c.id
      AND (m.origem = 'recebida' OR m.remetente_tipo = 'contato')
      AND (
        cl.ultima_mensagem_lida_at IS NULL
        OR m.created_at > cl.ultima_mensagem_lida_at
      )
  ) nao_lidas ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object('id', lista.id, 'nome', lista.nome)
      ORDER BY lista.nome, lista.id
    ) AS itens
    FROM public.conversas_listas_itens cli
    JOIN public.conversas_listas lista
      ON lista.id = cli.lista_id
    WHERE cli.empresa_id = p_empresa_id
      AND cli.conversa_id = c.id
  ) listas ON true
  LEFT JOIN LATERAL (
    SELECT
      aa.id,
      aa.executar_em,
      aa.payload_json
    FROM public.automacao_agendamentos aa
    WHERE aa.empresa_id = p_empresa_id
      AND aa.tipo_agendamento = 'disparo_template'
      AND aa.status = 'pendente'
      AND aa.payload_json->>'conversa_id' = c.id::text
    ORDER BY aa.executar_em, aa.id
    LIMIT 1
  ) disparo ON true
  ORDER BY
    c.last_message_at DESC NULLS LAST,
    c.created_at DESC,
    c.id DESC;
$function$;

-- obter_contadores_conversas(p_empresa_id uuid, p_usuario_id uuid, p_is_admin boolean, p_setores_ids uuid[], p_usuario_pode_atribuir boolean, p_usuario_pode_visualizar_encerradas_setor boolean, p_status text, p_prioridade text, p_contato_id uuid, p_setor_id uuid, p_responsavel_id uuid, p_busca text, p_canal text, p_lista_id uuid)
CREATE OR REPLACE FUNCTION public.obter_contadores_conversas_v2(p_empresa_id uuid, p_usuario_id uuid, p_is_admin boolean, p_setores_ids uuid[], p_usuario_pode_atribuir boolean, p_usuario_pode_visualizar_encerradas_setor boolean, p_status text, p_prioridade text, p_contato_id uuid, p_setor_id uuid, p_responsavel_id uuid, p_busca text, p_canal text, p_lista_id uuid, p_integracao_whatsapp_id uuid DEFAULT NULL::uuid, p_integracoes_whatsapp_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS TABLE(todas bigint, minhas bigint, favoritos bigint, sem_responsavel bigint, robo bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH conversas_permitidas AS (
    SELECT
      c.id,
      c.responsavel_id,
      c.bot_ativo
    FROM public.conversas c
    WHERE c.empresa_id = p_empresa_id
      AND (
        p_is_admin
        OR c.responsavel_id = p_usuario_id
        OR (
          c.escopo_fila = 'geral'
          AND c.status = 'fila'
          AND c.responsavel_id IS NULL
        )
        OR (
          c.setor_id IS NOT NULL
          AND c.setor_id = ANY(COALESCE(p_setores_ids, '{}'::uuid[]))
          AND (
            (c.responsavel_id IS NULL AND c.status = 'fila')
            OR (
              p_usuario_pode_atribuir
              AND c.status NOT IN (
                'encerrado_manual',
                'encerrado_24h',
                'encerrado_aut'
              )
            )
            OR (
              p_usuario_pode_visualizar_encerradas_setor
              AND c.status IN (
                'encerrado_manual',
                'encerrado_24h',
                'encerrado_aut'
              )
            )
          )
        )
      )
      AND (p_status IS NULL OR c.status = p_status)
      AND (p_prioridade IS NULL OR c.prioridade = p_prioridade)
      AND (p_contato_id IS NULL OR c.contato_id = p_contato_id)
      AND (p_setor_id IS NULL OR c.setor_id = p_setor_id)
      AND (p_responsavel_id IS NULL OR c.responsavel_id = p_responsavel_id)
      AND (
        p_integracao_whatsapp_id IS NULL
        OR c.integracao_whatsapp_id = p_integracao_whatsapp_id
      )
      AND (
        COALESCE(array_length(p_integracoes_whatsapp_ids, 1), 0) = 0
        OR c.integracao_whatsapp_id IS NULL
        OR c.integracao_whatsapp_id = ANY(p_integracoes_whatsapp_ids)
      )
      AND (
        p_canal IS NULL
        OR p_canal = ''
        OR p_canal = 'todos'
        OR c.canal = p_canal
      )
      AND (
        p_lista_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.conversas_listas_itens cli
          WHERE cli.empresa_id = p_empresa_id
            AND cli.lista_id = p_lista_id
            AND cli.conversa_id = c.id
        )
      )
      AND (
        NULLIF(BTRIM(p_busca), '') IS NULL
        OR c.assunto ILIKE '%' || BTRIM(p_busca) || '%'
        OR c.id::text = BTRIM(p_busca)
        OR EXISTS (
          SELECT 1
          FROM public.contatos ct
          WHERE ct.id = c.contato_id
            AND ct.empresa_id = p_empresa_id
            AND (
              ct.nome ILIKE '%' || BTRIM(p_busca) || '%'
              OR ct.telefone ILIKE '%' || BTRIM(p_busca) || '%'
              OR ct.email ILIKE '%' || BTRIM(p_busca) || '%'
              OR ct.empresa ILIKE '%' || BTRIM(p_busca) || '%'
            )
        )
        OR EXISTS (
          SELECT 1
          FROM public.conversa_protocolos cp
          WHERE cp.empresa_id = p_empresa_id
            AND cp.conversa_id = c.id
            AND cp.protocolo ILIKE '%' || BTRIM(p_busca) || '%'
        )
      )
  )
  SELECT
    COUNT(*)::bigint AS todas,
    COUNT(*) FILTER (
      WHERE cp.responsavel_id = p_usuario_id
    )::bigint AS minhas,
    COUNT(*) FILTER (
      WHERE EXISTS (
        SELECT 1
        FROM public.conversas_favoritas cf
        WHERE cf.empresa_id = p_empresa_id
          AND cf.usuario_id = p_usuario_id
          AND cf.conversa_id = cp.id
      )
    )::bigint AS favoritos,
    COUNT(*) FILTER (
      WHERE cp.responsavel_id IS NULL
        AND cp.bot_ativo = false
    )::bigint AS sem_responsavel,
    COUNT(*) FILTER (
      WHERE cp.bot_ativo = true
    )::bigint AS robo
  FROM conversas_permitidas cp;
$function$;

-- Estas RPCs sao chamadas apenas pelas rotas autenticadas do servidor.
do $$
declare
  function_signature regprocedure;
begin
  for function_signature in
    select procedure.oid::regprocedure
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'contar_conversas_nao_lidas_v2',
        'listar_conversas_resumo_v2',
        'obter_contadores_conversas_v2'
      )
  loop
    execute format(
      'revoke execute on function %s from public, anon, authenticated',
      function_signature
    );
    execute format(
      'grant execute on function %s to service_role',
      function_signature
    );
  end loop;
end;
$$;
