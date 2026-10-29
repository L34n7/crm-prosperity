import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabase = getSupabaseAdmin();
export const BACKUP_BUCKET = "empresa-encerramentos";
const LIMITE_ORIGINAL_BYTES = 75 * 1024 * 1024;
const TAMANHO_PAGINA = 500;

type Arquivo = { nome: string; conteudo: Buffer };
type Definicao = { tabela: string; nome: string; colunas: string; formato?: "json" | "csv" };
const TABELAS: Definicao[] = [
  { tabela: "contatos", nome: "contatos.csv", colunas: "id,nome,telefone,email,origem,campanha,classificacao,campo_contato,interesse,observacoes,created_at,updated_at" },
  { tabela: "conversas", nome: "conversas.csv", colunas: "id,contato_id,status,canal,assunto,integracao_whatsapp_id,started_at,last_message_at,closed_at,created_at" },
  { tabela: "mensagens", nome: "mensagens.csv", colunas: "id,conversa_id,remetente_tipo,conteudo,tipo_mensagem,origem,status_envio,mensagem_externa_id,created_at" },
  { tabela: "usuarios", nome: "usuarios.csv", colunas: "id,nome,email,status,telefone,created_at,ultimo_acesso" },
  { tabela: "agenda_agendamentos", nome: "agendamentos.csv", colunas: "id,contato_id,titulo,nome_cliente,telefone_cliente,email_cliente,inicio_at,fim_at,status,origem,observacoes,created_at" },
  { tabela: "tags", nome: "tags.csv", colunas: "id,nome,cor,descricao,created_at" },
  { tabela: "campos_personalizados", nome: "campos_personalizados.csv", colunas: "id,escopo,chave,nome,tipo,opcoes,ativo,created_at" },
  { tabela: "whatsapp_templates", nome: "templates_whatsapp.csv", colunas: "id,nome,categoria,idioma,status,payload,created_at" },
  { tabela: "automacao_fluxos", nome: "automacoes/fluxos.json", colunas: "id,nome,descricao,status,canal,fluxo_padrao,configuracao_json,created_at", formato: "json" },
  { tabela: "automacao_nos", nome: "automacoes/nos.json", colunas: "id,fluxo_id,tipo_no,titulo,descricao,posicao_x,posicao_y,configuracao_json,delay_segundos,ativo", formato: "json" },
  { tabela: "automacao_conexoes", nome: "automacoes/conexoes.json", colunas: "id,fluxo_id,no_origem_id,no_destino_id,condicao_json,rotulo,ordem,ativo", formato: "json" },
];

function limparCredenciais(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(limparCredenciais);
  if (valor && typeof valor === "object") {
    return Object.fromEntries(Object.entries(valor as Record<string, unknown>)
      .filter(([k]) => !/token|secret|senha|password|api.?key|authoriz|credential|private.?key|bearer|pin_encrypted/i.test(k))
      .map(([k,v]) => [k, limparCredenciais(v)]));
  }
  return valor;
}

function celulaCsv(valor: unknown): string {
  if (valor == null) return "";
  const original = typeof valor === "object" ? JSON.stringify(limparCredenciais(valor)) : String(valor);
  // Evita execução de fórmulas ao abrir a exportação no Excel.
  const seguro = /^[\s]*[=+@-]/.test(original) ? "'" + original : original;
  return /[",\r\n]/.test(seguro) ? '"' + seguro.replace(/"/g, '""') + '"' : seguro;
}

function paraCsv(colunas: string[], linhas: Record<string, unknown>[]): Buffer {
  const linhasCsv = [
    colunas.join(","),
    ...linhas.map((linha) => colunas.map((col) => celulaCsv(linha[col])).join(",")),
  ];
  return Buffer.from("\uFEFF" + linhasCsv.join("\r\n") + "\r\n", "utf8");
}

async function carregarTabela(definicao: Definicao, empresaId: string) {
  const resultado: Record<string, unknown>[] = [];
  let inicio = 0;
  for (;;) {
    const { data, error } = await supabase.from(definicao.tabela)
      .select(definicao.colunas).eq("empresa_id", empresaId)
      .order("id", { ascending: true })
      .range(inicio, inicio + TAMANHO_PAGINA - 1);
    if (error) throw new Error("Erro ao exportar " + definicao.tabela + ": " + error.message);
    const linhas = (data || []) as unknown as Record<string, unknown>[];
    resultado.push(...linhas.map((item) => limparCredenciais(item) as Record<string, unknown>));
    if (Buffer.byteLength(JSON.stringify(resultado), "utf8") > LIMITE_ORIGINAL_BYTES)
      throw new Error("Volume excessivo na tabela " + definicao.tabela + ". Necessária exportação em lotes.");
    if (linhas.length < TAMANHO_PAGINA) break;
    inicio += TAMANHO_PAGINA;
  }
  return resultado;
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** ZIP padrão, entradas Deflate e nomes UTF-8; não precisa de dependência externa. */
function montarZip(arquivos: Arquivo[]): Buffer {
  const locais: Buffer[] = [];
  const centrais: Buffer[] = [];
  let deslocamento = 0;
  for (const arquivo of arquivos) {
    const nome = Buffer.from(arquivo.nome, "utf8");
    const comprimido = deflateRawSync(arquivo.conteudo, { level: 6 });
    const crc = crc32(arquivo.conteudo);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8
    local.writeUInt16LE(8, 8); // Deflate
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(arquivo.conteudo.length, 22);
    local.writeUInt16LE(nome.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comprimido.length, 20);
    central.writeUInt32LE(arquivo.conteudo.length, 24);
    central.writeUInt16LE(nome.length, 28);
    central.writeUInt32LE(deslocamento, 42);
    locais.push(local, nome, comprimido);
    centrais.push(central, nome);
    deslocamento += local.length + nome.length + comprimido.length;
  }
  const centralDirectory = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(centralDirectory.length, 12);
  fim.writeUInt32LE(deslocamento, 16);
  return Buffer.concat([...locais, centralDirectory, fim]);
}

export async function gerarBackupEncerramento(empresaId: string) {
  const { data: empresa, error } = await supabase.from("empresas")
    .select("id,nome_fantasia,status,cancelada_em,encerramento_backup_estado,encerramento_backup_path")
    .eq("id", empresaId).maybeSingle();
  if (error || !empresa) throw new Error("Empresa não encontrada.");
  if (empresa.status !== "cancelada") throw new Error("Backup de encerramento requer empresa cancelada.");
  if (empresa.encerramento_backup_estado === "pronto" && empresa.encerramento_backup_path)
    return { ok: true, path: empresa.encerramento_backup_path, existente: true };
  const { data: bloqueio, error: bloqueioError } = await supabase.from("empresas")
    .update({ encerramento_backup_estado: "processando", encerramento_backup_erro: null,
      encerramento_backup_tentado_em: new Date().toISOString() })
    .eq("id", empresaId).in("encerramento_backup_estado", ["pendente","erro"])
    .select("id").maybeSingle();
  if (bloqueioError) throw new Error(bloqueioError.message);
  if (!bloqueio) throw new Error("Backup já está sendo processado ou não está disponível.");

  try {
    const arquivos: Arquivo[] = [];
    let bytes = 0;
    function adicionar(nome: string, conteudo: Buffer) {
      bytes += conteudo.length;
      if (bytes > LIMITE_ORIGINAL_BYTES) throw new Error(
        "O backup ultrapassa 75 MB de dados originais. É necessária exportação fracionada; exclusão definitiva bloqueada."
      );
      arquivos.push({ nome, conteudo });
    }

    const contatos: string[] = [];
    for (const definicao of TABELAS) {
      const linhas = await carregarTabela(definicao, empresaId);
      if (definicao.tabela === "contatos") contatos.push(...linhas.map((r) => String(r.id)));
      adicionar(definicao.nome, definicao.formato === "json"
        ? Buffer.from(JSON.stringify(linhas, null, 2))
        : paraCsv(definicao.colunas.split(","), linhas));
    }

    const relacionamentos: Record<string, unknown>[] = [];
    for (let i=0; i<contatos.length; i+=200) {
      const {data,error:relError} = await supabase.from("contato_tags")
        .select("contato_id,tag_id,created_at").in("contato_id", contatos.slice(i,i+200));
      if (relError) throw new Error("Erro ao exportar tags dos contatos: " + relError.message);
      relacionamentos.push(...(data || []));
    }
    adicionar("contato_tags.csv", paraCsv(["contato_id","tag_id","created_at"], relacionamentos));

    const midias = await carregarTabela({
      tabela: "midias", nome: "", colunas: "id,nome,tipo,storage_path,mime_type,tamanho_bytes,created_at",
    }, empresaId);
    adicionar("midias.csv", paraCsv(["id","nome","tipo","storage_path","mime_type","tamanho_bytes","created_at"], midias));
    for (const midia of midias) {
      const storagePath = String(midia.storage_path || "").trim();
      if (!storagePath) continue;
      const {data:arquivo, error:downloadError} = await supabase.storage.from("midias").download(storagePath);
      if (downloadError || !arquivo) throw new Error("Não foi possível incluir a mídia " + String(midia.id));
      const buffer = Buffer.from(await arquivo.arrayBuffer());
      const nomeSeguro = String(midia.nome || storagePath.split("/").pop() || "arquivo")
        .replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,100);
      adicionar("midias/" + String(midia.id) + "-" + nomeSeguro, buffer);
    }
    adicionar("LEIA-ME.txt", Buffer.from(
      "Pacote de encerramento do CRM Prosperity\nEmpresa: " + empresa.nome_fantasia +
      "\nGerado em: " + new Date().toISOString() +
      "\nExportação administrativa. Não inclui senhas, tokens, credenciais ou sessões.\n"
    ));
    const zip = montarZip(arquivos);
    if (zip.length > 100 * 1024 * 1024) throw new Error("ZIP excede o limite de 100 MB.");
    const path = empresaId + "/" + Date.now() + "-encerramento.zip";
    const {error:uploadError} = await supabase.storage.from(BACKUP_BUCKET)
      .upload(path, new Uint8Array(zip), { contentType: "application/zip", upsert: false });
    if (uploadError) throw new Error("Falha ao armazenar o backup: " + uploadError.message);
    const sha256 = createHash("sha256").update(zip).digest("hex");
    const {data:gravado,error:updateError} = await supabase.from("empresas").update({
      encerramento_backup_path: path,
      encerramento_backup_estado: "pronto",
      encerramento_backup_gerado_em: new Date().toISOString(),
      encerramento_backup_erro: null,
    }).eq("id",empresaId).eq("status","cancelada")
      .eq("encerramento_backup_estado","processando")
      .select("id").maybeSingle();
    if (updateError || !gravado) {
      await supabase.storage.from(BACKUP_BUCKET).remove([path]);
      throw new Error("Backup não pôde ser vinculado ao encerramento ativo: " + (updateError?.message || "Estado alterado."));
    }
    return {ok:true,path,sha256,arquivos:arquivos.length,bytes:zip.length};
  } catch (error) {
    await supabase.from("empresas").update({
      encerramento_backup_estado: "erro",
      encerramento_backup_erro: (error instanceof Error ? error.message : String(error)).slice(0,1000),
    }).eq("id",empresaId).eq("status","cancelada");
    throw error;
  }
}
