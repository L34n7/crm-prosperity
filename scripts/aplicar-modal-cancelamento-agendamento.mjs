import { readFile, writeFile } from "node:fs/promises";

const pagePath = "src/app/(private)/agendas/page.tsx";
let page = await readFile(pagePath, "utf8");

if (page.includes('cancelConfirm&&<div className="modalbg cancelConfirmBg"')) {
  console.log("Modal de cancelamento de agendamento já aplicado.");
  process.exit(0);
}

function replaceOnce(source, oldValue, newValue, label) {
  const occurrences = source.split(oldValue).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${label}: esperado 1 trecho, encontrado ${occurrences}`);
  }
  return source.replace(oldValue, newValue);
}

const cssAnchor =
  '.modal .dhead,.modal .body,.modal .foot{padding:13px 15px}';
const cssBlock = `${cssAnchor}.cancelConfirmBg{z-index:1300;backdrop-filter:blur(3px)}.confirmModal{width:min(440px,94vw);background:#fff;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 24px 70px #0f172a40;overflow:hidden}.confirmBody{padding:22px 22px 18px}.confirmIcon{width:46px;height:46px;border-radius:14px;background:#fff1f2;color:#c32640;display:grid;place-items:center;margin-bottom:14px}.confirmBody h2{margin:0;font-size:20px;color:#172033}.confirmBody p{margin:8px 0 0;color:#667085;font-size:13px;line-height:1.55}.confirmSummary{display:flex;align-items:center;gap:10px;margin-top:16px;padding:12px;border:1px solid #e5eaf1;border-radius:11px;background:#f8fafc;color:#405066}.confirmSummary div{display:grid;gap:2px}.confirmSummary b{font-size:12px}.confirmSummary span{font-size:11px;color:#748095}.confirmActions{display:flex;justify-content:flex-end;gap:8px;padding:14px 18px;background:#f8fafc;border-top:1px solid #e5eaf1}.confirmDanger{background:#c32640;border-color:#c32640;color:#fff}.confirmDanger:hover{background:#a91f35;border-color:#a91f35}`;
page = replaceOnce(page, cssAnchor, cssBlock, "estilos do modal");

const stateAnchor =
  ' const [filter,setFilter]=useState({q:"",status:"todos",tipo:"todos",resp:"todos",origem:"todos"}),[open,setOpen]=useState(false),[form,setForm]=useState<Form>(()=>blank(key(new Date()))),[contact,setContact]=useState<Contato|null>(null),[cq,setCq]=useState(""),[contacts,setContacts]=useState<Contato[]>([]);';
const stateBlock = `${stateAnchor}\n const [cancelConfirm,setCancelConfirm]=useState(false);`;
page = replaceOnce(page, stateAnchor, stateBlock, "estado do modal");

const cancelButtonAnchor =
  '<button className="btn danger" onClick={()=>confirm("Cancelar este agendamento?")&&save("cancelado")}><X size={15}/>Cancelar evento</button>';
const cancelButtonBlock =
  '<button className="btn danger" onClick={()=>setCancelConfirm(true)}><X size={15}/>Cancelar evento</button>';
page = replaceOnce(
  page,
  cancelButtonAnchor,
  cancelButtonBlock,
  "abertura do modal de cancelamento"
);

const configAnchor = ' {config&&<div className="modalbg">';
const confirmModal = ` {cancelConfirm&&<div className="modalbg cancelConfirmBg" onMouseDown={e=>e.target===e.currentTarget&&!busy&&setCancelConfirm(false)}><div className="confirmModal" role="dialog" aria-modal="true" aria-labelledby="cancel-event-title"><div className="confirmBody"><div className="confirmIcon"><X size={22}/></div><h2 id="cancel-event-title">Cancelar evento?</h2><p>O agendamento <strong>{form.titulo||"selecionado"}</strong> será marcado como cancelado. Esta ação ficará registrada no histórico.</p><div className="confirmSummary"><CalendarDays size={18}/><div><b>{dt(iso(form.inicio_at))}</b><span>{form.nome_cliente||contact?.nome||"Cliente não informado"}</span></div></div></div><div className="confirmActions"><button className="btn" onClick={()=>setCancelConfirm(false)} disabled={busy}>Voltar</button><button className="btn confirmDanger" onClick={()=>{setCancelConfirm(false);void save("cancelado")}} disabled={busy}>{busy?<RefreshCw className="spin" size={15}/>:<X size={15}/>}Cancelar evento</button></div></div></div>}\n${configAnchor}`;
page = replaceOnce(page, configAnchor, confirmModal, "modal de confirmação");

await writeFile(pagePath, page, "utf8");
console.log("Modal de cancelamento de agendamento aplicado.");
