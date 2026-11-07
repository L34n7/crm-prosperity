/**
 * Classificação conservadora de caminhões: o número de eixos indicado
 * explicitamente na descrição da FIPE é suficiente apenas para reconhecer
 * configurações multieixo pesadas. Não inferir classe por fabricante,
 * nome comercial, valor FIPE, potência ou número do modelo.
 *
 * Nos demais casos a classificação comercial permanece pendente para
 * decisão do administrador da empresa.
 */
export function categoriaAutomaticaCaminhao(
  descricaoFipe:string,
):"caminhao_pesado"|null{
  const texto=String(descricaoFipe||"").toUpperCase()
    .replace(/[×]/g,"X").replace(/\s+/g," ");
  return /(?:^|[^A-Z0-9])(?:8\s*X\s*[246]|10\s*X\s*[468]|12\s*X\s*[468])(?:[^A-Z0-9]|$)/.test(texto)
    ?"caminhao_pesado":null;
}
