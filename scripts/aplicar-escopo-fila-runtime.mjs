import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, content) {
  fs.writeFileSync(path.join(root, relativePath), content, "utf8");
}

function replaceRequired(content, current, replacement, description) {
  if (content.includes(replacement)) return content;
  if (!content.includes(current)) {
    throw new Error(`Não foi possível aplicar: ${description}.`);
  }
  return content.replace(current, replacement);
}

function patchGeneralQueueScope() {
  const resolverPath = "src/lib/conversas/resolver-atribuicao-transferencia.ts";
  let resolver = read(resolverPath);

  if (!resolver.includes("CRM_QUEUE_SCOPE_V1")) {
    resolver = replaceRequired(
      resolver,
      `export type ResultadoAtribuicaoTransferencia = {`,
      `export type EscopoFila = "setor" | "geral";

// CRM_QUEUE_SCOPE_V1
export type ResultadoAtribuicaoTransferencia = {`,
      "tipo do escopo da fila"
    );
    resolver = replaceRequired(
      resolver,
      `  setorId: string | null;
  responsavelId: string | null;`,
      `  setorId: string | null;
  escopoFila: EscopoFila;
  responsavelId: string | null;`,
      "escopo no resultado da transferência"
    );
    resolver = replaceRequired(
      resolver,
      `function resultadoFila(params: {
  setorId: string | null;
  estrategia: EstrategiaTransferenciaAtendente;
  motivo?: string | null;
}): ResultadoAtribuicaoTransferencia {
  return {
    setorId: params.setorId,
    responsavelId: null,`,
      `function resultadoFila(params: {
  setorId: string | null;
  estrategia: EstrategiaTransferenciaAtendente;
  escopoFila?: EscopoFila;
  motivo?: string | null;
}): ResultadoAtribuicaoTransferencia {
  return {
    setorId: params.setorId,
    escopoFila:
      params.escopoFila || (params.setorId ? "setor" : "geral"),
    responsavelId: null,`,
      "resultado da fila geral"
    );
    resolver = replaceRequired(
      resolver,
      `  setorId?: string | null;
  estrategia?: unknown;
  atendenteId?: unknown;
}): Promise<ResultadoAtribuicaoTransferencia> {
  const setorId = String(params.setorId || "").trim() || null;`,
      `  setorId?: string | null;
  escopoFila?: unknown;
  estrategia?: unknown;
  atendenteId?: unknown;
}): Promise<ResultadoAtribuicaoTransferencia> {
  const escopoFila: EscopoFila =
    String(params.escopoFila || "").trim() === "geral"
      ? "geral"
      : "setor";
  const setorId =
    escopoFila === "geral"
      ? null
      : String(params.setorId || "").trim() || null;`,
      "entrada do escopo da fila"
    );
    resolver = replaceRequired(
      resolver,
      `  if (!setorId) {
    return resultadoFila({
      setorId: null,
      estrategia,
      motivo: "setor_nao_informado",
    });
  }`,
      `  if (escopoFila === "geral") {
    return resultadoFila({
      setorId: null,
      escopoFila: "geral",
      estrategia,
    });
  }

  if (!setorId) {
    return resultadoFila({
      setorId: null,
      escopoFila: "geral",
      estrategia,
      motivo: "setor_nao_informado_fallback_fila_geral",
    });
  }`,
      "prioridade da fila geral"
    );
    resolver = resolver
      .replaceAll(
        `        setorId,
        responsavelId:`,
        `        setorId,
        escopoFila: "setor",
        responsavelId:`
      )
      .replaceAll(
        `      setorId,
      responsavelId:`,
        `      setorId,
      escopoFila: "setor",
      responsavelId:`
      );
  }
  write(resolverPath, resolver);

  const enginePath = "src/lib/automacoes/process-automation-engine.ts";
  let engine = read(enginePath);
  if (!engine.includes("CRM_QUEUE_SCOPE_ENGINE_V1")) {
    engine = replaceRequired(
      engine,
      `  const setorDestino =
    String(configTransferencia.setor_id || "").trim() || null;
  const atribuicao = await resolverAtribuicaoTransferencia({
    empresaId,
    setorId: setorDestino,`,
      `  // CRM_QUEUE_SCOPE_ENGINE_V1
  const escopoFilaTransferencia =
    String(configTransferencia.escopo_fila || "").trim() === "geral"
      ? "geral"
      : "setor";
  const setorDestino =
    escopoFilaTransferencia === "geral"
      ? null
      : String(configTransferencia.setor_id || "").trim() || null;
  const atribuicao = await resolverAtribuicaoTransferencia({
    empresaId,
    setorId: setorDestino,
    escopoFila: escopoFilaTransferencia,`,
      "escopo do bloco de transferência"
    );
    engine = replaceRequired(
      engine,
      `      setor_id: setorDestino,
      status: atribuicao.responsavelId ? "em_atendimento" : "fila",`,
      `      setor_id: atribuicao.setorId,
      escopo_fila: atribuicao.escopoFila,
      status: atribuicao.responsavelId ? "em_atendimento" : "fila",`,
      "persistência do escopo no bloco de transferência"
    );
    engine = replaceRequired(
      engine,
      `  const setorExcessoTentativas =
    String(config.setor_excesso_tentativas || "").trim() || null;
  const acao = String(`,
      `  const escopoFilaExcessoTentativas =
    String(config.escopo_fila_excesso_tentativas || "").trim() === "geral"
      ? "geral"
      : "setor";
  const setorExcessoTentativas =
    escopoFilaExcessoTentativas === "geral"
      ? null
      : String(config.setor_excesso_tentativas || "").trim() || null;
  const acao = String(`,
      "escopo da transferência por tentativas"
    );
    engine = replaceRequired(
      engine,
      `    setorId: setorExcessoTentativas,
    estrategia: config.estrategia_excesso_tentativas,`,
      `    setorId: setorExcessoTentativas,
    escopoFila: escopoFilaExcessoTentativas,
    estrategia: config.estrategia_excesso_tentativas,`,
      "resolução do escopo por tentativas"
    );
    engine = replaceRequired(
      engine,
      `      status: atribuicao.responsavelId ? "em_atendimento" : "fila",
      setor_id: setorExcessoTentativas,
      responsavel_id: atribuicao.responsavelId,`,
      `      status: atribuicao.responsavelId ? "em_atendimento" : "fila",
      setor_id: atribuicao.setorId,
      escopo_fila: atribuicao.escopoFila,
      responsavel_id: atribuicao.responsavelId,`,
      "persistência do escopo por tentativas"
    );
    engine = engine.replace(
      `      status: "fila",
      setor_id: null,
      responsavel_id: null,`,
      `      status: "fila",
      setor_id: null,
      escopo_fila: "geral",
      responsavel_id: null,`
    );
  }
  write(enginePath, engine);

  const routePath = "src/app/api/conversas/[id]/route.ts";
  let route = read(routePath);
  if (!route.includes("CRM_QUEUE_SCOPE_ROUTE_V1")) {
    route = replaceRequired(
      route,
      `  setor_id: string | null;
  responsavel_id: string | null;`,
      `  setor_id: string | null;
  escopo_fila?: "setor" | "geral" | null;
  responsavel_id: string | null;`,
      "tipo do escopo da conversa"
    );
    route = replaceRequired(
      route,
      `  const podeTransferir = await podeTransferirConversas(usuario);

  if (podeTransferir) {
    return await usuarioPertenceAoSetor(usuario.id, conversa.setor_id);
  }`,
      `  const podeTransferir = await podeTransferirConversas(usuario);

  // CRM_QUEUE_SCOPE_ROUTE_V1
  if (
    conversa.escopo_fila === "geral" &&
    conversa.status === "fila" &&
    !conversa.responsavel_id
  ) {
    return podeTransferir || (await podeAtribuirConversas(usuario));
  }

  if (podeTransferir) {
    return await usuarioPertenceAoSetor(usuario.id, conversa.setor_id);
  }`,
      "edição da fila geral"
    );
    route = route.replaceAll(
      `  if (podeAtribuir) {
    return await usuarioPertenceAoSetor(usuario.id, conversa.setor_id);
  }`,
      `  if (podeAtribuir) {
    if (
      conversa.escopo_fila === "geral" &&
      conversa.status === "fila" &&
      !conversa.responsavel_id
    ) {
      return true;
    }

    return await usuarioPertenceAoSetor(usuario.id, conversa.setor_id);
  }`
    );
    route = replaceRequired(
      route,
      `  if (isAdministrador(usuario)) return true;

  return await usuarioPertenceAoSetor(usuario.id, conversa.setor_id);
}`,
      `  if (isAdministrador(usuario)) return true;

  if (
    conversa.escopo_fila === "geral" &&
    conversa.status === "fila" &&
    !conversa.responsavel_id
  ) {
    return true;
  }

  return await usuarioPertenceAoSetor(usuario.id, conversa.setor_id);
}`,
      "atribuição da fila geral"
    );
    route = replaceRequired(
      route,
      `  const setor_id = "setor_id" in body ? body.setor_id : conversaAtual.setor_id;
  const responsavelIdEntrada =`,
      `  const setor_id = "setor_id" in body ? body.setor_id : conversaAtual.setor_id;
  const escopo_fila =
    String(
      "escopo_fila" in body
        ? body.escopo_fila
        : conversaAtual.escopo_fila || "setor"
    ).trim() === "geral"
      ? "geral"
      : "setor";
  const responsavelIdEntrada =`,
      "leitura do escopo da fila"
    );
    route = replaceRequired(
      route,
      `    setor_id,
    responsavel_id,`,
      `    setor_id,
    escopo_fila,
    responsavel_id,`,
      "persistência do escopo na conversa"
    );
    route = replaceRequired(
      route,
      `  if (mudouSetor) {
    updateData.setor_id = setor_id;`,
      `  if (mudouSetor) {
    updateData.setor_id = setor_id;
    updateData.escopo_fila = setor_id ? "setor" : escopo_fila;`,
      "ajuste do escopo ao trocar setor"
    );
  }
  write(routePath, route);

}

patchGeneralQueueScope();
