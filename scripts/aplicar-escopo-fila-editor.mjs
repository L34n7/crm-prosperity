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

function patchGeneralQueueScopeEditor() {
  const editorPath = "src/app/(private)/fluxos/page.tsx";
  let editor = read(editorPath);
  if (!editor.includes("CRM_QUEUE_SCOPE_EDITOR_V1")) {
    editor = replaceRequired(
      editor,
      `type EstrategiaTransferenciaNode =
  | "fila_setor"
  | "atendente_especifico"
  | "rodizio_aleatorio"
  | "menos_conversas";`,
      `type EstrategiaTransferenciaNode =
  | "fila_setor"
  | "atendente_especifico"
  | "rodizio_aleatorio"
  | "menos_conversas";

type EscopoFilaNode = "setor" | "geral";

// CRM_QUEUE_SCOPE_EDITOR_V1
function normalizarEscopoFilaNode(
  valor: unknown,
  setorId?: unknown,
  usarGeralComoPadrao = false
): EscopoFilaNode {
  if (String(valor || "").trim() === "geral") return "geral";
  if (String(valor || "").trim() === "setor") return "setor";
  if (String(setorId || "").trim()) return "setor";
  return usarGeralComoPadrao ? "geral" : "setor";
}

function fluxoEhSistemaCalendario(fluxo?: Fluxo | null) {
  return Boolean(
    fluxo?.configuracao_json?.fluxo_sistema_calendario === true &&
      fluxo?.configuracao_json?.protegido_sistema === true
  );
}`,
      "tipos e identificação do escopo no editor"
    );
    editor = replaceRequired(
      editor,
      `  const [setorDestino, setSetorDestino] = useState("");
  const [estrategiaTransferenciaNode, setEstrategiaTransferenciaNode] =`,
      `  const [setorDestino, setSetorDestino] = useState("");
  const [escopoFilaTransferenciaNode, setEscopoFilaTransferenciaNode] =
    useState<EscopoFilaNode>("setor");
  const [estrategiaTransferenciaNode, setEstrategiaTransferenciaNode] =`,
      "estado do escopo do bloco de transferência"
    );
    editor = replaceRequired(
      editor,
      `  const [setorExcessoTentativasNode, setSetorExcessoTentativasNode] =
    useState("");
  const [estrategiaExcessoTentativasNode, setEstrategiaExcessoTentativasNode] =`,
      `  const [setorExcessoTentativasNode, setSetorExcessoTentativasNode] =
    useState("");
  const [escopoFilaExcessoTentativasNode, setEscopoFilaExcessoTentativasNode] =
    useState<EscopoFilaNode>("setor");
  const [estrategiaExcessoTentativasNode, setEstrategiaExcessoTentativasNode] =`,
      "estado do escopo por tentativas"
    );
    editor = replaceRequired(
      editor,
      `    setSetorDestino(configuracaoJson?.setor_id || "");
    setEstrategiaTransferenciaNode(`,
      `    setSetorDestino(configuracaoJson?.setor_id || "");
    setEscopoFilaTransferenciaNode(
      normalizarEscopoFilaNode(
        configuracaoJson?.escopo_fila,
        configuracaoJson?.setor_id,
        fluxoSistemaCalendario
      )
    );
    setEstrategiaTransferenciaNode(`,
      "carregamento do escopo de transferência"
    );
    editor = replaceRequired(
      editor,
      `    setSetorExcessoTentativasNode(
      String(configuracaoJson?.setor_excesso_tentativas || "")
    );
    setEstrategiaExcessoTentativasNode(`,
      `    setSetorExcessoTentativasNode(
      String(configuracaoJson?.setor_excesso_tentativas || "")
    );
    setEscopoFilaExcessoTentativasNode(
      normalizarEscopoFilaNode(
        configuracaoJson?.escopo_fila_excesso_tentativas,
        configuracaoJson?.setor_excesso_tentativas,
        fluxoSistemaCalendario
      )
    );
    setEstrategiaExcessoTentativasNode(`,
      "carregamento do escopo por tentativas"
    );
    editor = editor.replaceAll(
      `              setor_excesso_tentativas: null,`,
      `              escopo_fila_excesso_tentativas: fluxoSistemaCalendario
                ? "geral"
                : "setor",
              setor_excesso_tentativas: null,`
    );
    editor = replaceRequired(
      editor,
      `              mensagem: "Vou te encaminhar para um atendente.",
              setor_id: "",
              estrategia_transferencia: "fila_setor",`,
      `              mensagem: "Vou te encaminhar para um atendente.",
              escopo_fila: fluxoSistemaCalendario ? "geral" : "setor",
              setor_id: "",
              estrategia_transferencia: "fila_setor",`,
      "escopo padrão do novo bloco de transferência"
    );
    editor = replaceRequired(
      editor,
      `  if (tipoNodeEdicao === "transferir_setor") {
      if (!setorDestino) {`,
      `  if (tipoNodeEdicao === "transferir_setor") {
      if (escopoFilaTransferenciaNode === "setor" && !setorDestino) {`,
      "validação do setor somente no escopo setorial"
    );
    editor = replaceRequired(
      editor,
      `      if (estrategiaTransferenciaNode === "atendente_especifico") {`,
      `      if (
        escopoFilaTransferenciaNode === "setor" &&
        estrategiaTransferenciaNode === "atendente_especifico"
      ) {`,
      "validação do atendente no escopo setorial"
    );
    editor = replaceRequired(
      editor,
      `      if (!setorExcessoTentativasNode) {`,
      `      if (
        escopoFilaExcessoTentativasNode === "setor" &&
        !setorExcessoTentativasNode
      ) {`,
      "validação do setor por tentativas"
    );
    editor = replaceRequired(
      editor,
      `      if (estrategiaExcessoTentativasNode === "atendente_especifico") {`,
      `      if (
        escopoFilaExcessoTentativasNode === "setor" &&
        estrategiaExcessoTentativasNode === "atendente_especifico"
      ) {`,
      "validação do atendente por tentativas"
    );
    editor = replaceRequired(
      editor,
      `        configuracao_json.setor_excesso_tentativas =
          setorExcessoTentativasNode || null;
        configuracao_json.estrategia_excesso_tentativas =`,
      `        configuracao_json.escopo_fila_excesso_tentativas =
          escopoFilaExcessoTentativasNode;
        configuracao_json.setor_excesso_tentativas =
          escopoFilaExcessoTentativasNode === "setor"
            ? setorExcessoTentativasNode || null
            : null;
        configuracao_json.estrategia_excesso_tentativas =`,
      "salvamento do escopo por tentativas"
    );
    editor = replaceRequired(
      editor,
      `          estrategiaExcessoTentativasNode === "atendente_especifico"
            ? atendenteExcessoTentativasNode || null
            : null;`,
      `          escopoFilaExcessoTentativasNode === "setor" &&
          estrategiaExcessoTentativasNode === "atendente_especifico"
            ? atendenteExcessoTentativasNode || null
            : null;`,
      "limpeza do atendente na fila geral"
    );
    editor = replaceRequired(
      editor,
      `      if (tipoFinal === "transferir_setor") {
        configuracao_json.setor_id = setorDestino;
        configuracao_json.estrategia_transferencia =`,
      `      if (tipoFinal === "transferir_setor") {
        configuracao_json.escopo_fila = escopoFilaTransferenciaNode;
        configuracao_json.setor_id =
          escopoFilaTransferenciaNode === "setor" ? setorDestino : null;
        configuracao_json.estrategia_transferencia =`,
      "salvamento do escopo de transferência"
    );
    editor = replaceRequired(
      editor,
      `          estrategiaTransferenciaNode === "atendente_especifico"
            ? atendenteDestinoNode || null
            : null;`,
      `          escopoFilaTransferenciaNode === "setor" &&
          estrategiaTransferenciaNode === "atendente_especifico"
            ? atendenteDestinoNode || null
            : null;`,
      "limpeza do atendente na transferência geral"
    );

    const seletorEscopoTransferencia = `                      <label className={styles.field}>
                        <span className={styles.label}>Escopo da fila</span>
                        <select
                          className={styles.input}
                          value={escopoFilaTransferenciaNode}
                          onChange={(e) => {
                            const escopo = e.target.value === "geral" ? "geral" : "setor";
                            setEscopoFilaTransferenciaNode(escopo);
                            if (escopo === "geral") {
                              setSetorDestino("");
                              setAtendenteDestinoNode("");
                              setEstrategiaTransferenciaNode("fila_setor");
                            }
                          }}
                        >
                          <option value="geral">Fila geral — todos os setores</option>
                          <option value="setor">Fila de um setor específico</option>
                        </select>
                        <span className={styles.help}>
                          Na fila geral, qualquer equipe com acesso aos atendimentos pode assumir a conversa.
                        </span>
                      </label>

`;
    editor = replaceRequired(
      editor,
      `                    <div className={styles.optionsBox}>
                      <label className={styles.field}>
                        <span className={styles.label}>Setor destino</span>`,
      `                    <div className={styles.optionsBox}>
${seletorEscopoTransferencia}                      <label className={styles.field}>
                        <span className={styles.label}>Setor destino</span>`,
      "seletor do escopo no bloco de transferência"
    );
    editor = replaceRequired(
      editor,
      `                          value={setorDestino}
                          onChange={(e) => {
                            setSetorDestino(e.target.value);
                            setAtendenteDestinoNode("");
                          }}
                          disabled={carregandoSetores}`,
      `                          value={setorDestino}
                          onChange={(e) => {
                            setSetorDestino(e.target.value);
                            setAtendenteDestinoNode("");
                          }}
                          disabled={
                            escopoFilaTransferenciaNode === "geral" ||
                            carregandoSetores
                          }`,
      "bloqueio do setor na fila geral"
    );
    editor = replaceRequired(
      editor,
      `                          value={estrategiaTransferenciaNode}
                          onChange={(e) => {
                            const estrategia = e.target.value as EstrategiaTransferenciaNode;
                            setEstrategiaTransferenciaNode(estrategia);
                            if (estrategia !== "atendente_especifico") {
                              setAtendenteDestinoNode("");
                            }
                          }}
                          disabled={!setorDestino}`,
      `                          value={estrategiaTransferenciaNode}
                          onChange={(e) => {
                            const estrategia = e.target.value as EstrategiaTransferenciaNode;
                            setEstrategiaTransferenciaNode(estrategia);
                            if (estrategia !== "atendente_especifico") {
                              setAtendenteDestinoNode("");
                            }
                          }}
                          disabled={
                            escopoFilaTransferenciaNode === "geral" ||
                            !setorDestino
                          }`,
      "bloqueio da distribuição na fila geral"
    );

    const seletorEscopoTentativas = `                          <label className={styles.field}>
                            <span className={styles.label}>Escopo da fila</span>
                            <select
                              className={styles.input}
                              value={escopoFilaExcessoTentativasNode}
                              onChange={(e) => {
                                const escopo = e.target.value === "geral" ? "geral" : "setor";
                                setEscopoFilaExcessoTentativasNode(escopo);
                                if (escopo === "geral") {
                                  setSetorExcessoTentativasNode("");
                                  setAtendenteExcessoTentativasNode("");
                                  setEstrategiaExcessoTentativasNode("fila_setor");
                                }
                              }}
                            >
                              <option value="geral">Fila geral — todos os setores</option>
                              <option value="setor">Fila de um setor específico</option>
                            </select>
                          </label>

`;
    editor = replaceRequired(
      editor,
      `                        <>
                          <label className={styles.field}>
                            <span className={styles.label}>Setor do atendimento</span>`,
      `                        <>
${seletorEscopoTentativas}                          <label className={styles.field}>
                            <span className={styles.label}>Setor do atendimento</span>`,
      "seletor do escopo por tentativas"
    );
    editor = replaceRequired(
      editor,
      `                              value={setorExcessoTentativasNode}
                              onChange={(e) => {
                                setSetorExcessoTentativasNode(e.target.value);
                                setAtendenteExcessoTentativasNode("");
                              }}
                              disabled={carregandoSetores}`,
      `                              value={setorExcessoTentativasNode}
                              onChange={(e) => {
                                setSetorExcessoTentativasNode(e.target.value);
                                setAtendenteExcessoTentativasNode("");
                              }}
                              disabled={
                                escopoFilaExcessoTentativasNode === "geral" ||
                                carregandoSetores
                              }`,
      "bloqueio do setor por tentativas"
    );
    editor = replaceRequired(
      editor,
      `                              value={estrategiaExcessoTentativasNode}
                              onChange={(e) => {
                                const estrategia = e.target.value as EstrategiaTransferenciaNode;
                                setEstrategiaExcessoTentativasNode(estrategia);
                                if (estrategia !== "atendente_especifico") {
                                  setAtendenteExcessoTentativasNode("");
                                }
                              }}
                              disabled={!setorExcessoTentativasNode}`,
      `                              value={estrategiaExcessoTentativasNode}
                              onChange={(e) => {
                                const estrategia = e.target.value as EstrategiaTransferenciaNode;
                                setEstrategiaExcessoTentativasNode(estrategia);
                                if (estrategia !== "atendente_especifico") {
                                  setAtendenteExcessoTentativasNode("");
                                }
                              }}
                              disabled={
                                escopoFilaExcessoTentativasNode === "geral" ||
                                !setorExcessoTentativasNode
                              }`,
      "bloqueio da distribuição por tentativas"
    );
    editor = replaceRequired(
      editor,
      `                    <div className={styles.flowBadges}>
                      {fluxo.fluxo_padrao && (`,
      `                    <div className={styles.flowBadges}>
                      {fluxoEhSistemaCalendario(fluxo) && (
                        <span className={\`\${styles.badge} \${styles.badgeBlue}\`}>
                          🔒 fluxo do sistema
                        </span>
                      )}

                      {fluxo.fluxo_padrao && (`,
      "badge na lista de fluxos"
    );
    editor = replaceRequired(
      editor,
      `            <h2 className={styles.editorTitle}>
              {fluxoSelecionado?.nome || "Selecione um fluxo"}
            </h2>`,
      `            <h2 className={styles.editorTitle}>
              {fluxoSelecionado?.nome || "Selecione um fluxo"}
            </h2>
            {fluxoEhSistemaCalendario(fluxoSelecionado) && (
              <span className={\`\${styles.badge} \${styles.badgeBlue}\`}>
                🔒 fluxo fixo do sistema
              </span>
            )}`,
      "badge no cabeçalho do fluxo"
    );
  }
  write(editorPath, editor);

  console.log("Escopo de fila geral e badges dos fluxos do sistema aplicados.");
}

patchGeneralQueueScopeEditor();
