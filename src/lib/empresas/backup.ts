import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const db = getSupabaseAdmin();
export const BACKUP_BUCKET = "empresa-encerramentos";
export const LIMITE_PARTE_BYTES = 75 * 1024 * 1024;
const ALVO_DADOS_BYTES = 62 * 1024 * 1024;
const PAGINA = 100;
const MAX_TEMPO_MS = 23_000;

export type ParteBackup = { nome: string; path: string; bytes: number; sha256: string };
type Cursor = { etapa: number; offset: number; mediaByte: number; mediaFragmento: number };
type Entrada = { nome: string; conteudo: Buffer };
type Definicao = { tabela: string; colunas: string; formato?: "jsonl" | "csv"; ordem?: string; relacao?: boolean };
const TABELAS: Definicao[] = [
  { tabela: "contatos", colunas: "id,nome,telefone,email,origem,campanha,classificacao,campo_contato,interesse,observacoes,created_at,updated_at" },
  { tabela: "conversas", colunas: "id,contato_id,status,canal,assunto,integracao_whatsapp_id,started_at,last_message_at,closed_at,created_at" },
  { tabela: "mensagens", colunas: "id,conversa_id,remetente_tipo,conteudo,tipo_mensagem,origem,status_envio,mensagem_externa_id,created_at" },
  { tabela: "usuarios", colunas: "id,nome,email,status,telefone,created_at,ultimo_acesso" },
  { tabela: "agenda_agendamentos", colunas: "id,contato_id,titulo,nome_cliente,telefone_cliente,email_cliente,inicio_at,fim_at,status,origem,observacoes,created_at" },
  { tabela: "tags", colunas: "id,nome,cor,descricao,created_at" },
  { tabela: "contato_tags", colunas: "contato_id,tag_id,created_at", ordem: "contato_id", relacao: true },
  { tabela: "campos_personalizados", colunas: "id,escopo,chave,nome,tipo,opcoes,ativo,created_at" },
  { tabela: "whatsapp_templates", colunas: "id,nome,categoria,idioma,status,payload,created_at" },
  { tabela: "automacao_fluxos", colunas: "id,nome,descricao,status,canal,fluxo_padrao,configuracao_json,created_at", formato: "jsonl" },
  { tabela: "automacao_nos", colunas: "id,fluxo_id,tipo_no,titulo,descricao,posicao_x,posicao_y,configuracao_json,delay_segundos,ativo", formato: "jsonl" },
  { tabela: "automacao_conexoes", colunas: "id,fluxo_id,no_origem_id,no_destino_id,condicao_json,rotulo,ordem,ativo", formato: "jsonl" },
  { tabela: "midias", colunas: "id,nome,tipo,storage_path,mime_type,tamanho_bytes,created_at" },
];

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !/token|secret|senha|password|api.?key|authoriz|credential|private.?key|bearer|pin_encrypted/i.test(key))
      .map(([key, val]) => [key, sanitize(val)]));
  return value;
}
function csvCelula(v: unknown) {
  const val = v == null ? "" : (typeof v === "object" ? JSON.stringify(sanitize(v)) : String(v));
  const seguro = /^\s*[=+@-]/.test(val) ? "'" + val : val;
  return /[",\r\n]/.test(seguro) ? '"' + seguro.replace(/"/g, '""') + '"' : seguro;
}
function linhasBuffer(def: Definicao, items: Record<string, unknown>[]) {
  const cols = def.colunas.split(",");
  return def.formato === "jsonl"
    ? Buffer.from(items.map((row) => JSON.stringify(sanitize(row))).join("\n") + "\n")
    : Buffer.from("\uFEFF" + cols.join(",") + "\r\n" +
      items.map((row) => cols.map((col) => csvCelula(row[col])).join(",")).join("\r\n") + "\r\n");
}
async function buscarPagina(def: Definicao, empresaId: string, offset: number) {
  if (def.relacao) {
    const { data, error } = await db.from("contato_tags")
      .select("contato_id,tag_id,created_at,contatos!inner(empresa_id)")
      .eq("contatos.empresa_id", empresaId)
      .order("contato_id", { ascending: true })
      .order("tag_id", { ascending: true })
      .range(offset,offset+PAGINA-1);
    if(error) throw new Error("Falha ao exportar etiquetas vinculadas: "+error.message);
    return (data || []) as unknown as Record<string,unknown>[];
  }
  const { data, error } = await db.from(def.tabela)
    .select(def.colunas).eq("empresa_id",empresaId)
    .order(def.ordem || "id",{ascending:true})
    .range(offset,offset+PAGINA-1);
  if(error) throw new Error("Falha ao exportar "+def.tabela+": "+error.message);
  return (data || []) as unknown as Record<string,unknown>[];
}
function crc32(buffer: Buffer) {
  let crc=0xffffffff;
  for(const b of buffer){
    crc ^= b;
    for(let i=0;i<8;i++) crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}
function zip(arquivos: Entrada[]): Buffer {
  const locais:Buffer[]=[]; const centrais:Buffer[]=[]; let deslocamento=0;
  for(const arquivo of arquivos) {
    const nome=Buffer.from(arquivo.nome,"utf8");
    const compressed=deflateRawSync(arquivo.conteudo,{level:6});
    const local=Buffer.alloc(30); const central=Buffer.alloc(46);
    const crc=crc32(arquivo.conteudo);
    local.writeUInt32LE(0x04034b50,0);
    local.writeUInt16LE(20,4);local.writeUInt16LE(0x0800,6);local.writeUInt16LE(8,8);
    local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(arquivo.conteudo.length,22);
    local.writeUInt16LE(nome.length,26);
    central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);
    central.writeUInt16LE(0x0800,8);central.writeUInt16LE(8,10);central.writeUInt32LE(crc,16);
    central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(arquivo.conteudo.length,24);
    central.writeUInt16LE(nome.length,28);central.writeUInt32LE(deslocamento,42);
    locais.push(local,nome,compressed);centrais.push(central,nome);
    deslocamento+=local.length+nome.length+compressed.length;
  }
  const cd=Buffer.concat(centrais);const fim=Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50,0);fim.writeUInt16LE(arquivos.length,8);fim.writeUInt16LE(arquivos.length,10);
  fim.writeUInt32LE(cd.length,12);fim.writeUInt32LE(deslocamento,16);
  return Buffer.concat([...locais,cd,fim]);
}

function cursorInicial(): Cursor { return {etapa:0,offset:0,mediaByte:0,mediaFragmento:0}; }
function obterCursor(v: unknown): Cursor {
  if(!v || typeof v !== "object") return cursorInicial();
  const c=v as Partial<Cursor>;
  return {etapa:Number(c.etapa||0),offset:Number(c.offset||0),mediaByte:Number(c.mediaByte||0),mediaFragmento:Number(c.mediaFragmento||0)};
}
function partesNormalizadas(v: unknown): ParteBackup[] {
  if(!Array.isArray(v)) return [];
  return v.filter((x): x is ParteBackup =>
    x && typeof x.path==="string" && typeof x.nome==="string" && typeof x.bytes==="number");
}
function avancarEtapa(cursor: Cursor) {cursor.etapa++;cursor.offset=0;cursor.mediaByte=0;cursor.mediaFragmento=0;}

async function buscarConteudoMidia(path: string, offset: number, tamanho: number, total: number) {
  if(offset===0 && tamanho===total) {
    const {data,error} = await db.storage.from("midias").download(path);
    if(error || !data) throw new Error("Mídia não disponível: "+path);
    const buffer=Buffer.from(await data.arrayBuffer());
    if(buffer.length!==tamanho) throw new Error("Tamanho da mídia divergente: "+path);
    return buffer;
  }
  const {data,error}=await db.storage.from("midias").createSignedUrl(path,120);
  if(error || !data?.signedUrl)throw new Error("Falha ao acessar mídia: "+path);
  const response=await fetch(data.signedUrl,{headers:{Range:`bytes=${offset}-${offset+tamanho-1}`},cache:"no-store"});
  if(response.status!==206) throw new Error("Storage não suporta leitura parcial da mídia "+path+" (HTTP "+response.status+").");
  const contentRange=String(response.headers.get("content-range")||"");
  if(!contentRange.startsWith(`bytes ${offset}-`)) throw new Error("Intervalo de mídia inválido: "+path);
  const buffer=Buffer.from(await response.arrayBuffer());
  if(buffer.length!==tamanho) throw new Error("Fragmento de mídia incompleto: "+path);
  return buffer;
}

/** Cada chamada produz no máximo um ZIP. Somente uma ação autenticada inicia ou avança o backup. */
export async function gerarBackupEncerramento(empresaId: string) {
  const {data:empresa,error}=await db.from("empresas")
    .select("id,nome_fantasia,created_at,cancelada_em,encerramento_backup_solicitado_em,status,exclusao_prevista_em,encerramento_backup_estado,encerramento_backup_tentado_em,encerramento_backup_cursor,encerramento_backup_partes")
    .eq("id",empresaId).single();
  if(error || !empresa)throw new Error("Empresa não encontrada.");
  if(empresa.status!=="cancelada" || !empresa.exclusao_prevista_em ||
    new Date(empresa.exclusao_prevista_em).getTime()<=Date.now())
    throw new Error("O prazo de 90 dias para solicitar o backup terminou.");
  const anteriores=partesNormalizadas(empresa.encerramento_backup_partes);
  if(empresa.encerramento_backup_estado==="pronto")
    return {ok:true,concluido:true,partes:anteriores.length};
  if(empresa.encerramento_backup_estado==="processando" &&
    new Date(empresa.encerramento_backup_tentado_em||0).getTime()>Date.now()-6*60*1000)
    throw new Error("Uma etapa do backup já está sendo processada.");
  const permitido = empresa.encerramento_backup_estado==="processando"
    ? ["processando"] : ["pendente","erro"];
  let reserva = db.from("empresas")
    .update({encerramento_backup_estado:"processando",encerramento_backup_erro:null,
      encerramento_backup_tentado_em:new Date().toISOString()})
    .eq("id",empresaId).eq("status","cancelada")
    .gt("exclusao_prevista_em",new Date().toISOString())
    .in("encerramento_backup_estado",permitido);
  if(empresa.encerramento_backup_estado==="processando") {
    reserva=reserva.lt("encerramento_backup_tentado_em",
      new Date(Date.now()-6*60*1000).toISOString());
  }
  const {data:travado,error:travamentoErro}=await reserva.select("id").maybeSingle();
  if(travamentoErro || !travado) throw new Error("A exportação não pôde ser reservada; tente novamente.");

  const cursor=obterCursor(empresa.encerramento_backup_cursor);
  const arquivos: Entrada[]=[];
  let bytes=0; const inicio=Date.now();
  const inserir=(nome:string, conteudo:Buffer) => {
    if(conteudo.length+bytes > ALVO_DADOS_BYTES)
      throw new Error("Entrada excede o limite da parte; reinicie a exportação com lote menor.");
    arquivos.push({nome,conteudo});bytes+=conteudo.length;
  };
  let pathEnviado: string|null=null;
  try {
    const dataPt = (valor: string | null | undefined) => {
      if(!valor) return "Não registrada";
      const d = new Date(valor);
      return Number.isNaN(d.getTime()) ? "Não registrada" :
        new Intl.DateTimeFormat("pt-BR", {timeZone:"America/Sao_Paulo",dateStyle:"short"}).format(d);
    };
    inserir("LEIA-ME.txt",Buffer.from([
      "CRM PROSPERITY | BACKUP DE ENCERRAMENTO",
      "",
      "Empresa: " + empresa.nome_fantasia,
      "Data de início no CRM (cadastro): " + dataPt(empresa.created_at),
      "Data do cancelamento: " + dataPt(empresa.cancelada_em),
      "Data da solicitação do backup: " + dataPt(empresa.encerramento_backup_solicitado_em),
      "Data da geração deste arquivo: " + dataPt(new Date().toISOString()),
      "",
      "SOBRE OS ARQUIVOS",
      "Este backup foi gerado mediante solicitação administrativa.",
      "Se a exportação resultar em vários arquivos ZIP, baixe e guarde todos.",
      "Dados CSV e JSONL podem ser importados. Mídias *.fragmento-NNN devem",
      "ser remontadas em ordem numérica para recuperar o arquivo original.",
      "O backup não inclui senhas, tokens nem credenciais.",
      "",
      "AGRADECIMENTO",
      "Agradecemos por ter confiado no CRM Prosperity durante sua jornada.",
      "Foi um prazer fazer parte da operação da sua empresa. Desejamos",
      "sucesso nos seus próximos projetos e estaremos à disposição no futuro.",
      "",
      "Atenciosamente,",
      "Equipe CRM Prosperity",
      ""
    ].join("\n"),"utf8"));
    while(cursor.etapa<TABELAS.length && bytes<ALVO_DADOS_BYTES-1024*1024 &&
      Date.now()-inicio<MAX_TEMPO_MS) {
      const def=TABELAS[cursor.etapa];
      const pagina=await buscarPagina(def,empresaId,cursor.offset);
      if(!pagina.length){avancarEtapa(cursor);continue;}
      if(def.tabela!=="midias"){
        let consumidos=0;const linhas:Record<string,unknown>[]=[];
        for(const linha of pagina) {
          const candidato=linhasBuffer(def,[...linhas,linha]);
          if(candidato.length>ALVO_DADOS_BYTES-bytes){
            if(consumidos===0 && arquivos.length===1)
              throw new Error("Um registro individual excede o tamanho permitido por parte.");
            break;
          }
          linhas.push(linha);consumidos++;
        }
        if(consumidos===0)break;
        const sufixo=def.formato==="jsonl"?"jsonl":"csv";
        const inicioItem=String(cursor.offset+1).padStart(8,"0");
        inserir("dados/"+def.tabela+"/"+inicioItem+"."+sufixo,linhasBuffer(def,linhas));
        cursor.offset+=consumidos;
        if(consumidos<pagina.length)break;
      }else{
        const midia=pagina[0];
        const caminho=String(midia.storage_path||"").trim();
        if(!caminho) {cursor.offset++;cursor.mediaByte=0;cursor.mediaFragmento=0;continue;}
        const {data:info,error:infoErro}=await db.storage.from("midias").info(caminho);
        if(infoErro || !info) throw new Error("Mídia "+String(midia.id)+" indisponível: "+(infoErro?.message||"Não encontrada"));
        const tamanhoTotal=Number(info.size ?? 0);
        if(!Number.isSafeInteger(tamanhoTotal) || tamanhoTotal<0)throw new Error("Tamanho inválido para mídia "+caminho);
        if(cursor.mediaByte>=tamanhoTotal && tamanhoTotal>0){cursor.offset++;cursor.mediaByte=0;cursor.mediaFragmento=0;continue;}
        const disponivel=ALVO_DADOS_BYTES-bytes;
        if(disponivel<1024*1024)break;
        const tamanhoLer=tamanhoTotal===0?0:Math.min(tamanhoTotal-cursor.mediaByte,disponivel);
        const nome=String(midia.nome||caminho.split("/").pop()||"arquivo").replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,90);
        const prefixo="midias/"+String(midia.id)+"-"+nome;
        if(tamanhoLer>0){
          const conteudo=await buscarConteudoMidia(caminho,cursor.mediaByte,tamanhoLer,tamanhoTotal);
          const nomeArquivo=tamanhoLer===tamanhoTotal?prefixo:
            prefixo+".fragmento-"+String(cursor.mediaFragmento+1).padStart(4,"0");
          inserir(nomeArquivo,conteudo);
        }else{
          inserir(prefixo,Buffer.alloc(0));
        }
        cursor.mediaByte+=tamanhoLer;
        cursor.mediaFragmento++;
        if(cursor.mediaByte>=tamanhoTotal){cursor.offset++;cursor.mediaByte=0;cursor.mediaFragmento=0;}
        if(bytes>ALVO_DADOS_BYTES-1024*1024)break;
      }
    }
    const concluido=cursor.etapa>=TABELAS.length;
    const conteudo=zip(arquivos);
    if(conteudo.length>LIMITE_PARTE_BYTES)throw new Error("O ZIP ultrapassou 75 MB.");
    const nomeEmpresa=empresa.nome_fantasia.normalize("NFD")
      .replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9_-]+/g,"-")
      .replace(/^-+|-+$/g,"").slice(0,64).toLowerCase() || "empresa";
    const dataArquivo = (empresa.encerramento_backup_solicitado_em || new Date().toISOString()).slice(0,10);
    const baseNome = "backup-"+nomeEmpresa+"-"+dataArquivo+"-"+empresaId.slice(0,8);
    const nome = (concluido && anteriores.length===0)
      ? baseNome+".zip"
      : baseNome+"-parte-"+String(anteriores.length+1).padStart(3,"0")+".zip";
    pathEnviado=empresaId+"/"+Date.now()+"-"+nome;
    const {error:uploadErro}=await db.storage.from(BACKUP_BUCKET)
      .upload(pathEnviado,new Uint8Array(conteudo),{contentType:"application/zip",upsert:false});
    if(uploadErro)throw new Error("Falha ao armazenar parte: "+uploadErro.message);
    const partes=[...anteriores,{nome,path:pathEnviado,bytes:conteudo.length,
      sha256:createHash("sha256").update(conteudo).digest("hex")}];
    const {data:atualizada,error:gravarErro}=await db.from("empresas").update({
      encerramento_backup_estado:concluido?"pronto":"pendente",
      encerramento_backup_cursor:cursor,encerramento_backup_partes:partes,
      encerramento_backup_gerado_em:concluido?new Date().toISOString():null,
      encerramento_backup_erro:null,
    }).eq("id",empresaId).eq("status","cancelada")
      .eq("encerramento_backup_estado","processando")
      .select("id").maybeSingle();
    if(gravarErro || !atualizada)throw new Error("Não foi possível registrar a parte do backup.");
    return {ok:true,concluido,partes:partes.length,arquivos:arquivos.length,bytes:conteudo.length};
  }catch(e){
    if(pathEnviado)await db.storage.from(BACKUP_BUCKET).remove([pathEnviado]);
    await db.from("empresas").update({
      encerramento_backup_estado:"erro",
      encerramento_backup_erro:(e instanceof Error?e.message:String(e)).slice(0,900),
    }).eq("id",empresaId).eq("status","cancelada").eq("encerramento_backup_estado","processando");
    throw e;
  }
}
