export type AutomationEngineInput = {
  empresaId: string;
  conversaId: string;
  contatoId: string;
  mensagemTexto: string;
  numeroDestino: string;
  integracaoWhatsappId?: string | null;

  mensagemTipo?: "texto" | "imagem" | "documento" | "audio" | "video";
  mediaId?: string | null;
  mimeType?: string | null;
  arquivoNome?: string | null;
  mensagemId?: string | null;
};

export type AutomacaoFluxo = {
  id: string;
  empresa_id: string;
  nome: string;
  status: string;
  canal: string;
  configuracao_json?: Record<string, any> | null;
};

export type AutomacaoGatilho = {
  id: string;
  empresa_id: string;
  fluxo_id: string;
  tipo_gatilho: string;
  valor: string | null;
  condicao: string | null;
  ativo: boolean;
};

export type AutomacaoNo = {
  id: string;
  empresa_id: string;
  fluxo_id: string;
  tipo_no: string;
  titulo: string;
  descricao: string | null;
  configuracao_json: Record<string, any>;
  delay_segundos: number | null;
  ativo: boolean;
};

export type AutomacaoConexao = {
  id: string;
  empresa_id: string;
  fluxo_id: string;
  no_origem_id: string;
  no_destino_id: string;
  condicao_json: Record<string, any>;
  rotulo: string | null;
  ordem: number;
  ativo: boolean;
};
