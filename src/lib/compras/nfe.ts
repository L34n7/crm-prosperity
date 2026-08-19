import { XMLParser } from "fast-xml-parser";

type Registro = Record<string, unknown>;

export type NfeEntradaItem = {
  numero_item: number;
  codigo_fornecedor: string;
  ean: string;
  descricao: string;
  ncm: string;
  cfop: string;
  unidade: string;
  quantidade: number;
  custo_unitario: number;
  total: number;
  lote_codigo: string;
  fabricado_em: string;
  validade: string;
};

export type NfeEntrada = {
  chave: string;
  numero: string;
  serie: string;
  emissao: string;
  fornecedor: {
    nome: string;
    nome_fantasia: string;
    documento: string;
    inscricao_estadual: string;
    email: string;
    telefone: string;
    cep: string;
    endereco: string;
    numero: string;
    complemento: string;
    bairro: string;
    cidade: string;
    estado: string;
  };
  itens: NfeEntradaItem[];
  subtotal: number;
  frete: number;
  total: number;
};

function registro(valor: unknown): Registro {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Registro)
    : {};
}

function lista(valor: unknown) {
  if (Array.isArray(valor)) return valor;
  return valor === undefined || valor === null ? [] : [valor];
}

function texto(valor: unknown) {
  return String(valor ?? "").trim();
}

function numero(valor: unknown) {
  const resultado = Number(String(valor ?? "0").replace(",", "."));
  return Number.isFinite(resultado) ? resultado : 0;
}

function somenteDigitos(valor: unknown) {
  return texto(valor).replace(/\D/g, "");
}

export function analisarXmlNfe(xml: string): NfeEntrada {
  if (!xml.trim() || xml.length > 5_000_000) {
    throw new Error("O XML da NF-e está vazio ou excede 5 MB.");
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    parseTagValue: false,
    trimValues: true,
    processEntities: false,
  });
  const raiz = registro(parser.parse(xml));
  const processo = registro(raiz.nfeProc);
  const nfe = registro(processo.NFe ?? raiz.NFe);
  const info = registro(nfe.infNFe);
  const identificacao = registro(info.ide);
  const emitente = registro(info.emit);
  const endereco = registro(emitente.enderEmit);
  const protocolo = registro(registro(processo.protNFe).infProt);
  const totalTributos = registro(registro(info.total).ICMSTot);

  if (!Object.keys(info).length || !texto(identificacao.nNF)) {
    throw new Error("O arquivo não contém uma NF-e de mercadorias válida.");
  }

  const chave = somenteDigitos(
    protocolo.chNFe || texto(info["@_Id"]).replace(/^NFe/i, ""),
  );
  if (chave.length !== 44) {
    throw new Error("A chave de acesso da NF-e não foi encontrada ou é inválida.");
  }

  const itens = lista(info.det).map((detalhe, indice) => {
    const det = registro(detalhe);
    const produto = registro(det.prod);
    const rastros = lista(produto.rastro);
    const rastro = registro(rastros[0]);
    return {
      numero_item: Number(det["@_nItem"] ?? indice + 1),
      codigo_fornecedor: texto(produto.cProd),
      ean: somenteDigitos(produto.cEAN || produto.cEANTrib),
      descricao: texto(produto.xProd),
      ncm: somenteDigitos(produto.NCM),
      cfop: somenteDigitos(produto.CFOP),
      unidade: texto(produto.uCom || produto.uTrib || "un").toLowerCase(),
      quantidade: numero(produto.qCom || produto.qTrib),
      custo_unitario: numero(produto.vUnCom || produto.vUnTrib),
      total: numero(produto.vProd),
      lote_codigo: texto(rastro.nLote),
      fabricado_em: texto(rastro.dFab),
      validade: texto(rastro.dVal),
    } satisfies NfeEntradaItem;
  });

  if (!itens.length || itens.some((item) => item.quantidade <= 0)) {
    throw new Error("A NF-e não possui produtos com quantidades válidas.");
  }

  return {
    chave,
    numero: texto(identificacao.nNF),
    serie: texto(identificacao.serie),
    emissao: texto(identificacao.dhEmi || identificacao.dEmi),
    fornecedor: {
      nome: texto(emitente.xNome),
      nome_fantasia: texto(emitente.xFant),
      documento: somenteDigitos(emitente.CNPJ || emitente.CPF),
      inscricao_estadual: texto(emitente.IE),
      email: texto(emitente.email),
      telefone: somenteDigitos(endereco.fone),
      cep: somenteDigitos(endereco.CEP),
      endereco: texto(endereco.xLgr),
      numero: texto(endereco.nro),
      complemento: texto(endereco.xCpl),
      bairro: texto(endereco.xBairro),
      cidade: texto(endereco.xMun),
      estado: texto(endereco.UF).toUpperCase(),
    },
    itens,
    subtotal: numero(totalTributos.vProd),
    frete: numero(totalTributos.vFrete),
    total: numero(totalTributos.vNF),
  };
}
