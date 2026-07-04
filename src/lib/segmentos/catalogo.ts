import type { NichoCodigo } from "@/lib/nichos/config";

type SegmentoEmpresa = {
  codigo: string;
  nome: string;
  nichoCodigo: NichoCodigo;
};

export const SEGMENTOS_EMPRESA = [
  {
    codigo: "clinica_estetica",
    nome: "Clínica de estética",
    nichoCodigo: "comercio",
  },
  {
    codigo: "clinica_medica",
    nome: "Clínica médica",
    nichoCodigo: "medicina",
  },
  {
    codigo: "clinica_odontologica",
    nome: "Clínica odontológica",
    nichoCodigo: "odontologia",
  },
  {
    codigo: "clinica_veterinaria",
    nome: "Clínica veterinária",
    nichoCodigo: "comercio",
  },
  {
    codigo: "psicologia_terapia",
    nome: "Psicologia / Terapia",
    nichoCodigo: "comercio",
  },
  {
    codigo: "salao_beleza",
    nome: "Salão de beleza",
    nichoCodigo: "comercio",
  },
  { codigo: "barbearia", nome: "Barbearia", nichoCodigo: "comercio" },
  {
    codigo: "academia_personal",
    nome: "Academia / Personal",
    nichoCodigo: "comercio",
  },
  { codigo: "imobiliaria", nome: "Imobiliária", nichoCodigo: "imobiliaria" },
  {
    codigo: "corretor_imoveis",
    nome: "Corretor de imóveis",
    nichoCodigo: "imobiliaria",
  },
  {
    codigo: "construtora_engenharia",
    nome: "Construtora / Engenharia",
    nichoCodigo: "comercio",
  },
  {
    codigo: "loja_veiculos",
    nome: "Loja de veículos",
    nichoCodigo: "comercio",
  },
  {
    codigo: "oficina_mecanica",
    nome: "Oficina mecânica",
    nichoCodigo: "comercio",
  },
  { codigo: "autopecas", nome: "Autopeças", nichoCodigo: "comercio" },
  {
    codigo: "escola_curso",
    nome: "Escola / Curso",
    nichoCodigo: "comercio",
  },
  { codigo: "infoprodutor", nome: "Infoprodutor", nichoCodigo: "comercio" },
  { codigo: "consultoria", nome: "Consultoria", nichoCodigo: "comercio" },
  {
    codigo: "agencia_marketing",
    nome: "Agência de marketing",
    nichoCodigo: "comercio",
  },
  { codigo: "contabilidade", nome: "Contabilidade", nichoCodigo: "comercio" },
  { codigo: "advocacia", nome: "Advocacia", nichoCodigo: "comercio" },
  {
    codigo: "corretora_seguros",
    nome: "Corretora de seguros",
    nichoCodigo: "comercio",
  },
  {
    codigo: "loja_fisica_varejo",
    nome: "Loja física / Varejo",
    nichoCodigo: "comercio",
  },
  { codigo: "ecommerce", nome: "E-commerce", nichoCodigo: "comercio" },
  {
    codigo: "restaurante_delivery",
    nome: "Restaurante / Delivery",
    nichoCodigo: "comercio",
  },
  {
    codigo: "assistencia_tecnica",
    nome: "Assistência técnica",
    nichoCodigo: "comercio",
  },
  {
    codigo: "software_tecnologia",
    nome: "Software / Tecnologia",
    nichoCodigo: "comercio",
  },
  { codigo: "pet_shop", nome: "Pet shop", nichoCodigo: "comercio" },
  { codigo: "eventos", nome: "Eventos", nichoCodigo: "comercio" },
  {
    codigo: "hotelaria_turismo",
    nome: "Hotelaria / Turismo",
    nichoCodigo: "comercio",
  },
  {
    codigo: "servicos_residenciais",
    nome: "Serviços residenciais",
    nichoCodigo: "comercio",
  },
  {
    codigo: "transportadora_logistica",
    nome: "Transportadora / Logística",
    nichoCodigo: "comercio",
  },
  { codigo: "industria", nome: "Indústria", nichoCodigo: "comercio" },
  {
    codigo: "autonomo_profissional_liberal",
    nome: "Autônomo / Profissional liberal",
    nichoCodigo: "comercio",
  },
  {
    codigo: "outro_segmento",
    nome: "Outro segmento",
    nichoCodigo: "outro",
  },
  {
    codigo: "ainda_definindo",
    nome: "Ainda estou definindo",
    nichoCodigo: "outro",
  },
] as const satisfies readonly SegmentoEmpresa[];

export type SegmentoCodigo = (typeof SEGMENTOS_EMPRESA)[number]["codigo"];

export function getSegmentoEmpresa(valor: unknown) {
  if (typeof valor !== "string") return null;

  return (
    SEGMENTOS_EMPRESA.find((segmento) => segmento.codigo === valor.trim()) ??
    null
  );
}
