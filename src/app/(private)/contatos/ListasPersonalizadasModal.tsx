"use client";
import { useEffect, useState } from "react";
import styles from "./contatos.module.css";

export type ListaCompartilhadaContato = {
  id: string; nome: string; created_at: string; updated_at?: string;
  total_contatos: number; exibir_atalho_conversas: boolean; ordem_exibicao: number | null;
};
type Props = { listas: ListaCompartilhadaContato[]; onClose: () => void; onChanged: (msg: string) => Promise<void> | void };

export default function ListasPersonalizadasModal({ listas, onClose, onChanged }: Props) {
  const [ordenadas, setOrdenadas] = useState(listas);
  const [nome, setNome] = useState("");
  const [atalhoNovo, setAtalhoNovo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [nomeEdicao, setNomeEdicao] = useState("");
  const [excluir, setExcluir] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  useEffect(() => setOrdenadas(listas), [listas]);

  async function req(url: string, method: string, payload: unknown) {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const json = await r.json().catch(() => ({}));
    if (!r.ok || json.ok !== true) throw Error(json.error || "Não foi possível salvar a lista.");
  }
  async function executar(fn: () => Promise<string>) {
    if (ocupado) return;
    setErro(""); setOcupado(true);
    try { await onChanged(await fn()); }
    catch (e) { setErro(e instanceof Error ? e.message : "Erro ao salvar."); }
    finally { setOcupado(false); }
  }
  function criar() {
    if (!nome.trim()) return;
    void executar(async () => {
      await req("/api/contatos/listas-compartilhadas", "POST", { nome: nome.trim(), exibir_atalho_conversas: atalhoNovo });
      setNome(""); setAtalhoNovo(false);
      return "Lista personalizada criada.";
    });
  }
  function alterar(lista: ListaCompartilhadaContato, dados: object) {
    void executar(async () => {
      await req(`/api/contatos/listas-compartilhadas/${lista.id}`, "PATCH", dados);
      setEditando(null);
      return "Lista personalizada atualizada.";
    });
  }
  function remover(lista: ListaCompartilhadaContato) {
    void executar(async () => {
      await req(`/api/contatos/listas-compartilhadas/${lista.id}`, "DELETE", { confirmar_exclusao: true });
      setExcluir(null);
      return "Lista excluída. Os contatos foram preservados.";
    });
  }
  function mover(id: string, destino: number) {
    const pos = ordenadas.findIndex(l => l.id === id);
    if (pos < 0 || destino < 0 || destino >= ordenadas.length || pos === destino || ocupado) return;
    const antes = [...ordenadas], depois = [...ordenadas];
    const [item] = depois.splice(pos, 1);
    depois.splice(destino, 0, item);
    setOrdenadas(depois);
    void executar(async () => {
      try { await req("/api/contatos/listas-compartilhadas/ordem", "PUT", { lista_ids: depois.map(l => l.id) }); }
      catch(e) { setOrdenadas(antes); throw e; }
      return "Prioridade das listas salva.";
    });
  }
  const atalhosVisiveis = ordenadas.filter(l => l.exibir_atalho_conversas).length;
  return <div className={styles.modalOverlay} onClick={e => { if(e.target === e.currentTarget && !ocupado) onClose(); }}>
    <div className={`${styles.modalCard} ${styles.personalListModal}`} role="dialog" aria-modal="true" aria-labelledby="titulo-listas-personalizadas">
      <div className={`${styles.modalHeader} ${styles.personalListHeader}`}>
        <div><p className={styles.eyebrow}>Organização</p><h2 className={styles.modalTitle} id="titulo-listas-personalizadas">Listas personalizadas</h2>
          <p className={styles.cardDescription}>Organize contatos, priorize listas e escolha os atalhos exibidos em Conversas.</p>
          <div className={styles.personalListStats}>
            <span><strong>{ordenadas.length}</strong> listas</span>
            <span><strong>{atalhosVisiveis}</strong> atalhos visíveis</span>
          </div></div>
        <button type="button" className={styles.modalCloseButton} onClick={onClose} disabled={ocupado} aria-label="Fechar">×</button>
      </div>
      {erro && <div className={styles.alertError} role="alert">{erro}</div>}
      <div className={`${styles.listManagerSection} ${styles.personalListCreation}`}>
        <div className={styles.personalListSectionHeading}>
          <strong>Nova lista</strong><small>Crie grupos sem duplicar contatos.</small>
        </div>
        <label className={styles.label} htmlFor="nome-lista-personalizada">Nome da lista</label>
        <div className={styles.listManagerNameRow}>
          <input id="nome-lista-personalizada" className={styles.input} value={nome} maxLength={160} disabled={ocupado}
            onChange={e=>setNome(e.target.value)} placeholder="Ex.: Clientes VIP"
            onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();criar();}}}/>
          <button type="button" className={styles.primaryButton} disabled={ocupado || !nome.trim()} onClick={criar}>Criar lista</button>
        </div>
        <label className={styles.personalListToggle}><input type="checkbox" checked={atalhoNovo}
          disabled={ocupado} onChange={e=>setAtalhoNovo(e.target.checked)}/>Exibir como atalho em Conversas</label>
      </div>
      <div className={styles.listManagerDivider}/>
      <div className={`${styles.listManagerSection} ${styles.personalListExisting}`}>
        <div className={styles.personalListSectionHeading}>
          <strong>Suas listas <span className={styles.personalListCount}>{ordenadas.length}</span></strong>
          <small>Arraste os cards ou use ↑ ↓ para mudar a prioridade. Esta ordem também vale no filtro de Contatos.</small>
        </div>
        <div className={styles.personalListRows}>
          {ordenadas.length===0 && <p className={styles.cardDescription}>Nenhuma lista criada.</p>}
          {ordenadas.map((lista,i)=><div key={lista.id} className={styles.personalListRow}
            draggable={!ocupado && editando!==lista.id && excluir!==lista.id}
            onDragStart={e=>{setArrastando(lista.id);e.dataTransfer.setData("text/plain",lista.id);}}
            onDragOver={e=>e.preventDefault()}
            onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData("text/plain")||arrastando;setArrastando(null);if(id)mover(id,i);}}
            onDragEnd={()=>setArrastando(null)}
            style={{ opacity: arrastando === lista.id ? 0.55 : 1 }}>
            <div className={styles.personalListRowTop}>
              <span title="Arrastar para ordenar">⠿</span>
              <strong>{i+1}º</strong>
              {editando===lista.id
                ? <input className={`${styles.input} ${styles.personalListEditInput}`} value={nomeEdicao} maxLength={160} autoFocus
                   aria-label={`Renomear ${lista.nome}`} onChange={e=>setNomeEdicao(e.target.value)}
                   onKeyDown={e=>{if(e.key==="Escape")setEditando(null);if(e.key==="Enter"&&nomeEdicao.trim()){e.preventDefault();alterar(lista,{nome:nomeEdicao.trim()});}}}/>
                : <span className={styles.personalListName}><strong>{lista.nome}</strong><small>{lista.total_contatos} contatos</small></span>}
            </div>
            <div className={styles.personalListRowActions}>
              <label className={styles.personalListToggle}><input type="checkbox" disabled={ocupado}
                checked={lista.exibir_atalho_conversas} onChange={()=>alterar(lista,{exibir_atalho_conversas:!lista.exibir_atalho_conversas})}/>Atalho</label>
              <button type="button" className={styles.personalListMiniButton} disabled={ocupado||i===0} onClick={()=>mover(lista.id,i-1)} aria-label={`Subir ${lista.nome}`}>↑</button>
              <button type="button" className={styles.personalListMiniButton} disabled={ocupado||i===ordenadas.length-1} onClick={()=>mover(lista.id,i+1)} aria-label={`Descer ${lista.nome}`}>↓</button>
              {editando===lista.id?<><button type="button" className={styles.secondaryButton} onClick={()=>setEditando(null)}>Cancelar</button>
                <button type="button" className={styles.primaryButton} disabled={ocupado||!nomeEdicao.trim()} onClick={()=>alterar(lista,{nome:nomeEdicao.trim()})}>Salvar</button></>
              : excluir===lista.id?<><span className={styles.personalListDeleteNotice}>Excluir lista? Os contatos serão preservados.</span>
                <button type="button" className={styles.secondaryButton} onClick={()=>setExcluir(null)}>Não</button>
                <button type="button" className={styles.dangerButton} disabled={ocupado} onClick={()=>remover(lista)}>Excluir</button></>
              :<><button type="button" className={styles.secondaryButton} disabled={ocupado} onClick={()=>{setEditando(lista.id);setNomeEdicao(lista.nome);setExcluir(null);}}>Editar</button>
                <button type="button" className={styles.dangerButton} disabled={ocupado} onClick={()=>{setExcluir(lista.id);setEditando(null);}}>Excluir</button></>}
            </div>
          </div>)}
        </div>
      </div>
    </div>
  </div>;
}
