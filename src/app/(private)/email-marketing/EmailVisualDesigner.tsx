"use client";

import { useEffect, useMemo, useState, type CSSProperties, type DragEvent } from "react";
import {
  AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, Columns2, Copy,
  GripVertical, Heading1, Image as ImageIcon, LayoutTemplate, Link2, Minus,
  MousePointer2, Plus, Redo2, Smartphone, MoveVertical, Trash2, Type, Undo2,
  Monitor, Eye, SlidersHorizontal, Settings2,
} from "lucide-react";
import type { VariavelCatalogo } from "@/lib/variaveis/catalogo";
import {
  gerarHtmlEmailVisual, novoBlocoEmail, urlEmailSegura,
  type AlinhamentoEmail, type BlocoEmail, type DocumentoEmail, type TipoBlocoEmail,
} from "@/lib/email-marketing/editor-visual";
import styles from "./EmailVisualDesigner.module.css";

const PALETA: { tipo: TipoBlocoEmail; titulo: string; descricao: string; icone: typeof Type }[] = [
  { tipo: "titulo", titulo: "Título", descricao: "Destaque", icone: Heading1 },
  { tipo: "texto", titulo: "Texto", descricao: "Mensagem", icone: Type },
  { tipo: "imagem", titulo: "Imagem", descricao: "Banner", icone: ImageIcon },
  { tipo: "botao", titulo: "Botão", descricao: "Chamada à ação", icone: MousePointer2 },
  { tipo: "colunas", titulo: "2 colunas", descricao: "Conteúdos lado a lado", icone: Columns2 },
  { tipo: "divisor", titulo: "Divisor", descricao: "Separação", icone: Minus },
  { tipo: "espaco", titulo: "Espaço", descricao: "Respiro", icone: MoveVertical },
];

const ROTULOS: Record<TipoBlocoEmail, string> = Object.fromEntries(PALETA.map(item => [item.tipo, item.titulo])) as Record<TipoBlocoEmail, string>;

type Props = {
  documento: DocumentoEmail;
  onChange: (novo: DocumentoEmail) => void;
  variaveis: VariavelCatalogo[];
  variavelSelecionada: string;
  onVariavelSelecionada: (chave: string) => void;
  onGerenciarVariaveis: () => void;
};

export default function EmailVisualDesigner({
  documento, onChange, variaveis, variavelSelecionada,
  onVariavelSelecionada, onGerenciarVariaveis,
}: Props) {
  const [idSelecionado, setIdSelecionado] = useState<string | null>(documento.blocos[0]?.id || null);
  const [modo, setModo] = useState<"editar" | "previa">("editar");
  const [dispositivo, setDispositivo] = useState<"desktop" | "mobile">("desktop");
  const [painel, setPainel] = useState<"bloco" | "pagina">("bloco");
  const [arrastando, setArrastando] = useState(false);
  const [sobreIndice, setSobreIndice] = useState<number | null>(null);
  const [enviandoImagem, setEnviandoImagem] = useState(false);
  const [erroImagem, setErroImagem] = useState("");
  const [historico, setHistorico] = useState<DocumentoEmail[]>([]);
  const [refazer, setRefazer] = useState<DocumentoEmail[]>([]);

  useEffect(() => {
    if (idSelecionado && documento.blocos.some(b => b.id === idSelecionado)) return;
    setIdSelecionado(documento.blocos[0]?.id || null);
  }, [documento.blocos, idSelecionado]);

  const bloco = documento.blocos.find(item => item.id === idSelecionado) || null;
  const previa = useMemo(() => gerarHtmlEmailVisual(documento), [documento]);

  function atualizar(proximo: DocumentoEmail) {
    setHistorico(atual => [...atual.slice(-29), documento]);
    setRefazer([]);
    onChange(proximo);
  }

  function alterarBloco(chave: keyof BlocoEmail, valor: string | number) {
    if (!bloco) return;
    atualizar({
      ...documento,
      blocos: documento.blocos.map(item => item.id === bloco.id ? { ...item, [chave]: valor } : item),
    });
  }

  function inserir(tipo: TipoBlocoEmail, indice = documento.blocos.length) {
    const novo = novoBlocoEmail(tipo);
    const blocos = [...documento.blocos];
    blocos.splice(indice, 0, novo);
    atualizar({ ...documento, blocos });
    setIdSelecionado(novo.id);
    setPainel("bloco");
    setModo("editar");
  }

  function mover(origem: number, destino: number) {
    if (origem === destino || origem < 0 || origem >= documento.blocos.length) return;
    const blocos = [...documento.blocos];
    const [movido] = blocos.splice(origem, 1);
    const final = Math.max(0, Math.min(blocos.length, destino));
    blocos.splice(final, 0, movido);
    atualizar({ ...documento, blocos });
  }

  function duplicar() {
    if (!bloco || documento.blocos.length >= 60) return;
    const blocos = [...documento.blocos];
    const indice = blocos.findIndex(item => item.id === bloco.id);
    const copia = { ...bloco, id: crypto.randomUUID() };
    blocos.splice(indice + 1, 0, copia);
    atualizar({ ...documento, blocos });
    setIdSelecionado(copia.id);
  }

  function excluir() {
    if (!bloco || documento.blocos.length <= 1) return;
    const indice = documento.blocos.findIndex(item => item.id === bloco.id);
    const blocos = documento.blocos.filter(item => item.id !== bloco.id);
    atualizar({ ...documento, blocos });
    setIdSelecionado(blocos[Math.min(indice, blocos.length - 1)].id);
  }

  function desfazer() {
    if (!historico.length) return;
    const anterior = historico[historico.length - 1];
    setHistorico(atual => atual.slice(0, -1));
    setRefazer(atual => [...atual, documento]);
    onChange(anterior);
  }

  function refazerAcao() {
    if (!refazer.length) return;
    const proximo = refazer[refazer.length - 1];
    setRefazer(atual => atual.slice(0, -1));
    setHistorico(atual => [...atual, documento]);
    onChange(proximo);
  }

  function comecarArraste(event: DragEvent, origem: string) {
    event.dataTransfer.setData("text/plain", origem);
    event.dataTransfer.effectAllowed = origem.startsWith("novo:") ? "copy" : "move";
    setArrastando(true);
  }

  function soltar(event: DragEvent, indice: number) {
    event.preventDefault();
    const dados = event.dataTransfer.getData("text/plain");
    setArrastando(false);
    setSobreIndice(null);
    if (dados.startsWith("novo:")) {
      const tipo = dados.slice(5) as TipoBlocoEmail;
      if (PALETA.some(item => item.tipo === tipo) && documento.blocos.length < 60) inserir(tipo, indice);
      return;
    }
    if (dados.startsWith("bloco:")) {
      const origem = documento.blocos.findIndex(item => item.id === dados.slice(6));
      if (origem >= 0) mover(origem, origem < indice ? indice - 1 : indice);
    }
  }

  function textoEditavel(
    item: BlocoEmail,
    campo: "texto" | "textoDireita",
    classe: string,
    estilo?: CSSProperties,
    comoBotao = false,
  ) {
    const propriedades = {
      contentEditable: true,
      suppressContentEditableWarning: true,
      spellCheck: true,
      role: "textbox",
      tabIndex: 0,
      "aria-label": "Editar " + (campo === "textoDireita" ? "segunda coluna" : ROTULOS[item.tipo]) + " diretamente no e-mail",
      "aria-multiline": !comoBotao,
      className: classe + " " + styles.textoEditavel,
      style: estilo,
      onFocus: () => { setIdSelecionado(item.id); setPainel("bloco"); },
      onClick: (evento: React.MouseEvent) => evento.stopPropagation(),
      onKeyDown: (evento: React.KeyboardEvent) => {
        evento.stopPropagation();
        if (comoBotao && evento.key === "Enter") evento.preventDefault();
      },
      onDragStart: (evento: React.DragEvent) => evento.stopPropagation(),
      onPaste: (evento: React.ClipboardEvent) => {
        evento.preventDefault();
        const texto = evento.clipboardData.getData("text/plain").slice(0, 6000);
        const selecao = window.getSelection();
        if (!selecao?.rangeCount) return;
        const intervalo = selecao.getRangeAt(0);
        if (!evento.currentTarget.contains(intervalo.commonAncestorContainer)) return;
        intervalo.deleteContents();
        const no = document.createTextNode(comoBotao ? texto.replace(/[\r\n]+/g, " ") : texto);
        intervalo.insertNode(no);
        intervalo.setStartAfter(no);
        intervalo.collapse(true);
        selecao.removeAllRanges();
        selecao.addRange(intervalo);
      },
      onBlur: (evento: React.FocusEvent<HTMLElement>) => {
        const valor = evento.currentTarget.innerText.replace(/\r/g, "").replace(/\n$/, "").slice(0, 6000);
        if (valor === item[campo]) return;
        atualizar({
          ...documento,
          blocos: documento.blocos.map(atual => atual.id === item.id ? { ...atual, [campo]: valor } : atual),
        });
      },
    } as const;
    if (comoBotao) return <span {...propriedades}>{item[campo]}</span>;
    return <div {...propriedades}>{item[campo]}</div>;
  }

  function blocoVisual(item: BlocoEmail) {
    if (item.tipo === "imagem") {
      const src = urlEmailSegura(item.imagem, true);
      return src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={item.alt || "Imagem do template"} src={src} className={styles.imagemBloco} style={{ borderRadius: item.borda }} />
      ) : <div className={styles.imagemVazia}><ImageIcon size={27} /><span>Adicione uma imagem pelo painel lateral</span></div>;
    }
    if (item.tipo === "espaco") return <div className={styles.espacoBloco} style={{ height: item.altura }}><MoveVertical size={14} /> {item.altura}px</div>;
    if (item.tipo === "divisor") return <div style={{ background: item.cor, height: 1, width: "100%" }} />;
    if (item.tipo === "botao") return (
      textoEditavel(item, "texto", styles.botaoBloco, {
        background: item.fundo, color: item.cor, fontSize: item.tamanho, borderRadius: item.borda,
      }, true)
    );
    if (item.tipo === "colunas") return (
      <div className={styles.colunasBloco} style={{ color: item.cor, fontSize: item.tamanho }}>
        {textoEditavel(item, "texto", styles.colunaEditavel, { background: item.fundo })}
        {textoEditavel(item, "textoDireita", styles.colunaEditavel, { background: item.fundo })}
      </div>
    );
    return textoEditavel(item, "texto", styles.textoBloco, {
      color: item.cor, fontSize: item.tamanho, fontWeight: item.tipo === "titulo" ? 800 : 400,
      lineHeight: item.tipo === "titulo" ? 1.2 : 1.6, whiteSpace: "pre-wrap",
    });
  }

  async function enviarImagem(arquivo: File | undefined) {
    if (!arquivo || !bloco) return;
    const idBloco = bloco.id;
    setEnviandoImagem(true);
    setErroImagem("");
    try {
      const formulario = new FormData();
      formulario.set("imagem", arquivo);
      const resposta = await fetch("/api/email-marketing/imagens", { method: "POST", body: formulario });
      const dados = await resposta.json();
      if (!resposta.ok || !dados?.ok || !dados.url) throw new Error(dados?.error || "Não foi possível enviar a imagem.");
      atualizar({ ...documento, blocos: documento.blocos.map(b => b.id === idBloco ? { ...b, imagem: dados.url } : b) });
    } catch (erro) {
      setErroImagem(erro instanceof Error ? erro.message : "Não foi possível enviar a imagem.");
    } finally {
      setEnviandoImagem(false);
    }
  }

  function campoNumero(rotulo: string, valor: number, minimo: number, maximo: number, onAlterar: (valor: number) => void) {
    return <label className={styles.campo}><span>{rotulo}</span><input type="number" value={valor} min={minimo} max={maximo} onChange={e => onAlterar(Math.max(minimo, Math.min(maximo, Number(e.target.value) || minimo)))} /></label>;
  }
  function campoCor(rotulo: string, valor: string, onAlterar: (valor: string) => void) {
    return <label className={styles.campo}><span>{rotulo}</span><div className={styles.campoCor}><input type="color" value={valor} onChange={e => onAlterar(e.target.value)} /><code>{valor}</code></div></label>;
  }

  return (
    <div className={styles.editor}>
      <aside className={styles.biblioteca} aria-label="Componentes de e-mail">
        <div className={styles.tituloPainel}><LayoutTemplate size={17}/><div><strong>Componentes</strong><small>Arraste ou clique para inserir</small></div></div>
        <div className={styles.gradeBiblioteca}>
          {PALETA.map(({ tipo, titulo, descricao, icone: Icone }) => (
            <button key={tipo} type="button" draggable={documento.blocos.length < 60}
              onDragStart={e => comecarArraste(e, "novo:" + tipo)}
              onDragEnd={() => { setArrastando(false); setSobreIndice(null); }}
              disabled={documento.blocos.length >= 60}
              onClick={() => inserir(tipo)}
              className={styles.itemBiblioteca}
              title={"Inserir " + titulo.toLowerCase()}>
              <span className={styles.iconeComponente}><Icone size={18}/></span>
              <span><strong>{titulo}</strong><small>{descricao}</small></span>
              <Plus size={14} className={styles.adicionarIcone}/>
            </button>
          ))}
        </div>
        <div className={styles.dicaBiblioteca}><GripVertical size={15}/><span>Arraste os blocos para mudar a ordem. No celular, use as setas.</span></div>
      </aside>

      <div className={styles.workspace}>
        <div className={styles.barraWorkspace}>
          <div className={styles.modoGrupo} role="group" aria-label="Modo de edição">
            <button type="button" className={modo === "editar" ? styles.ativo : ""} onClick={() => setModo("editar")}><MousePointer2 size={15}/> Editar</button>
            <button type="button" className={modo === "previa" ? styles.ativo : ""} onClick={() => setModo("previa")}><Eye size={15}/> Prévia</button>
          </div>
          <div className={styles.ferramentas}>
            <button type="button" title="Desfazer" aria-label="Desfazer" onClick={desfazer} disabled={!historico.length}><Undo2 size={17}/></button>
            <button type="button" title="Refazer" aria-label="Refazer" onClick={refazerAcao} disabled={!refazer.length}><Redo2 size={17}/></button>
            <div className={styles.separador}/>
            <button type="button" title="Visualização desktop" aria-label="Visualização desktop" className={dispositivo === "desktop" ? styles.ativo : ""} onClick={() => {setDispositivo("desktop");setModo("previa");}}><Monitor size={17}/></button>
            <button type="button" title="Visualização celular" aria-label="Visualização celular" className={dispositivo === "mobile" ? styles.ativo : ""} onClick={() => {setDispositivo("mobile");setModo("previa");}}><Smartphone size={17}/></button>
          </div>
        </div>

        <div className={styles.areaCanvas}>
          <div className={[styles.pagina, dispositivo === "mobile" ? styles.paginaMobile : ""].join(" ")}
            style={{ background: documento.fundo }}>
            {modo === "previa" ? (
              <iframe title={"Prévia " + dispositivo + " do e-mail"} sandbox="" srcDoc={previa} className={styles.iframePrevia} />
            ) : (
              <div className={styles.canvasConteudo} style={{
                background: documento.superficie, maxWidth: documento.largura,
                padding: documento.padding, fontFamily: documento.fonte + ",Arial,sans-serif",
              }}>
                {documento.blocos.map((item, indice) => (
                  <div key={item.id}>
                    <div className={[styles.dropZone, sobreIndice === indice ? styles.dropAtivo : ""].join(" ")}
                      onDragOver={e => { e.preventDefault(); setSobreIndice(indice); }}
                      onDrop={e => soltar(e, indice)} aria-hidden="true"/>
                    <div className={[styles.blocoCanvas, bloco?.id === item.id ? styles.blocoSelecionado : ""].join(" ")}
                      role="button" tabIndex={0} aria-label={"Editar " + ROTULOS[item.tipo]}
                      onClick={() => { setIdSelecionado(item.id);setPainel("bloco"); }}
                      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setIdSelecionado(item.id);setPainel("bloco"); } }}
                      draggable={false}
                      style={{ textAlign: item.alinhamento, padding: item.espacamento + "px 0" }}>
                      <span className={styles.rotuloBloco} draggable onDragStart={e => {e.stopPropagation();comecarArraste(e, "bloco:" + item.id);}} onDragEnd={() => {setArrastando(false);setSobreIndice(null);}} title="Arraste pela alça para reorganizar"><GripVertical size={12}/>{ROTULOS[item.tipo]}</span>
                      {blocoVisual(item)}
                    </div>
                  </div>
                ))}
                <div className={[styles.dropZone, styles.dropFinal, sobreIndice === documento.blocos.length ? styles.dropAtivo : ""].join(" ")}
                  onDragOver={e => {e.preventDefault();setSobreIndice(documento.blocos.length);}}
                  onDrop={e => soltar(e, documento.blocos.length)}>
                  <button type="button" className={styles.adicionarFinal} onClick={() => inserir("texto")}><Plus size={15}/> Adicionar bloco</button>
                </div>
              </div>
            )}
          </div>
          {arrastando && modo === "editar" ? <span className={styles.dicaArraste}>Solte entre os blocos para posicionar</span> : null}
        </div>
      </div>

      <aside className={styles.propriedades} aria-label="Propriedades do template">
        <div className={styles.abasPropriedades}>
          <button type="button" className={painel === "bloco" ? styles.abaAtiva : ""} onClick={() => setPainel("bloco")}><SlidersHorizontal size={15}/> Bloco</button>
          <button type="button" className={painel === "pagina" ? styles.abaAtiva : ""} onClick={() => setPainel("pagina")}><Settings2 size={15}/> Página</button>
        </div>
        {painel === "pagina" ? (
          <div className={styles.campos}>
            <div className={styles.infoPainel}><strong>Identidade visual</strong><small>Configurações de toda a mensagem</small></div>
            {campoCor("Fundo externo", documento.fundo, fundo => atualizar({ ...documento, fundo }))}
            {campoCor("Fundo do conteúdo", documento.superficie, superficie => atualizar({ ...documento, superficie }))}
            <label className={styles.campo}><span>Tipografia</span><select value={documento.fonte} onChange={e => atualizar({ ...documento, fonte: e.target.value as DocumentoEmail["fonte"] })}>{["Arial", "Georgia", "Verdana", "Tahoma"].map(item => <option key={item}>{item}</option>)}</select></label>
            {campoNumero("Largura do e-mail (px)", documento.largura, 420, 700, largura => atualizar({ ...documento, largura }))}
            {campoNumero("Margem interna (px)", documento.padding, 12, 56, padding => atualizar({ ...documento, padding }))}
            <p className={styles.ajuda}>O HTML gerado usa tabelas compatíveis com leitores de e-mail e adapta as colunas para telas pequenas.</p>
          </div>
        ) : bloco ? (
          <div className={styles.campos}>
            <div className={styles.infoPainel}><strong>{ROTULOS[bloco.tipo]}</strong><small>Personalize o bloco selecionado</small></div>
            <div className={styles.acoesBloco}>
              <button type="button" title="Mover para cima" aria-label="Mover para cima" disabled={documento.blocos[0]?.id === bloco.id} onClick={() => mover(documento.blocos.findIndex(b => b.id === bloco.id), documento.blocos.findIndex(b => b.id === bloco.id) - 1)}><ArrowUp size={16}/></button>
              <button type="button" title="Mover para baixo" aria-label="Mover para baixo" disabled={documento.blocos[documento.blocos.length - 1]?.id === bloco.id} onClick={() => mover(documento.blocos.findIndex(b => b.id === bloco.id), documento.blocos.findIndex(b => b.id === bloco.id) + 1)}><ArrowDown size={16}/></button>
              <button type="button" title="Duplicar bloco" aria-label="Duplicar bloco" disabled={documento.blocos.length >= 60} onClick={duplicar}><Copy size={16}/></button>
              <button type="button" title="Excluir bloco" aria-label="Excluir bloco" disabled={documento.blocos.length <= 1} onClick={excluir} className={styles.excluir}><Trash2 size={16}/></button>
            </div>
            {["titulo","texto","botao","colunas"].includes(bloco.tipo) ? <p className={styles.avisoEdicaoDireta}>Clique no texto ou no botão na área central para editar diretamente, sem utilizar uma caixa de texto.</p> : null}
            {bloco.tipo === "imagem" ? (<>
              <label className={styles.campo}><span>Enviar imagem</span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={enviandoImagem} onChange={e => { void enviarImagem(e.target.files?.[0]); e.target.value = ""; }} /><small className={styles.ajuda}>{enviandoImagem ? "Enviando imagem..." : "JPG, PNG, WebP ou GIF · até 3 MB"}</small></label>
              {erroImagem ? <small className={styles.invalido} role="alert">{erroImagem}</small> : null}
              <label className={styles.campo}><span>Ou cole a URL da imagem</span><input type="url" placeholder="https://..." value={bloco.imagem} onChange={e => alterarBloco("imagem", e.target.value)} /></label>
              {bloco.imagem && !urlEmailSegura(bloco.imagem, true) ? <small className={styles.invalido}>Use um endereço http:// ou https:// válido.</small> : null}
              <label className={styles.campo}><span>Texto alternativo</span><input value={bloco.alt} onChange={e => alterarBloco("alt", e.target.value)} maxLength={250}/></label>
              <p className={styles.ajuda}>Use uma imagem pública hospedada em HTTPS. O texto alternativo facilita a acessibilidade.</p>
            </>) : null}
            {bloco.tipo === "botao" ? (<>
              <label className={styles.campo}><span><Link2 size={13}/> Link do botão</span><input type="text" value={bloco.url} onChange={e => alterarBloco("url", e.target.value)} placeholder="https://..." /></label>
              {bloco.url && !urlEmailSegura(bloco.url) ? <small className={styles.invalido}>Informe um endereço HTTPS, HTTP ou mailto: válido.</small> : null}
            </>) : null}
            {bloco.tipo === "espaco" ? campoNumero("Altura (px)", bloco.altura, 8, 140, altura => alterarBloco("altura", altura)) : null}
            {!["imagem","espaco","divisor"].includes(bloco.tipo) ? campoNumero("Tamanho da fonte (px)", bloco.tamanho, 10, 54, tamanho => alterarBloco("tamanho", tamanho)) : null}
            {!["imagem","espaco","divisor"].includes(bloco.tipo) ? (
              <div className={styles.campo}><span>Alinhamento</span><div className={styles.alinhamentos}>{([["left", AlignLeft],["center",AlignCenter],["right",AlignRight]] as const).map(([valor, Icone]) => (
                <button type="button" key={valor} className={bloco.alinhamento === valor ? styles.ativo : ""} onClick={() => alterarBloco("alinhamento", valor as AlinhamentoEmail)} aria-label={"Alinhar " + valor}><Icone size={17}/></button>
              ))}</div></div>
            ) : null}
            {bloco.tipo !== "imagem" && bloco.tipo !== "espaco" ? campoCor(bloco.tipo === "divisor" ? "Cor do divisor" : "Cor do texto", bloco.cor, cor => alterarBloco("cor", cor)) : null}
            {["botao","colunas"].includes(bloco.tipo) ? campoCor("Cor de fundo", bloco.fundo, fundo => alterarBloco("fundo", fundo)) : null}
            {["botao","imagem"].includes(bloco.tipo) ? campoNumero("Arredondamento", bloco.borda, 0, 40, borda => alterarBloco("borda", borda)) : null}
            {bloco.tipo !== "espaco" ? campoNumero("Espaçamento vertical", bloco.espacamento, 0, 72, espacamento => alterarBloco("espacamento", espacamento)) : null}
            {["titulo","texto","botao","colunas"].includes(bloco.tipo) ? (
              <div className={styles.variaveis}>
                <label className={styles.campo}><span>Personalização do CRM</span>
                  <select value={variavelSelecionada} onChange={e => onVariavelSelecionada(e.target.value)}>
                    {variaveis.map(v => <option key={v.chave} value={v.chave}>{v.descricao || v.chave} ({v.chave})</option>)}
                  </select>
                </label>
                <button type="button" className={styles.inserirVariavel} onClick={() => alterarBloco("texto", bloco.texto + "{{" + variavelSelecionada + "}}")}><Plus size={15}/> Inserir variável no texto</button>
                <button type="button" className={styles.linkGerenciar} onClick={onGerenciarVariaveis}><Settings2 size={14}/> Gerenciar variáveis</button>
              </div>
            ) : null}
          </div>
        ) : <div className={styles.semSelecao}>Selecione um bloco para personalizar.</div>}
      </aside>
    </div>
  );
}
