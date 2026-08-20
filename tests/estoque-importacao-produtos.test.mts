import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  IMPORTACAO_PRODUTOS_CABECALHOS,
  mapearLinhasImportacaoProdutos,
} from "../src/lib/estoque/importacao-produtos.ts";

test("normaliza uma linha completa do modelo de produtos", () => {
  const [linha] = mapearLinhasImportacaoProdutos(
    [...IMPORTACAO_PRODUTOS_CABECALHOS],
    [[
      "PROD-01", "Luva nitrílica", "Caixa", "INSUMO", "CX", "LUVA-P",
      "7891234567890", "Descartáveis", "Marca A", "1.500,5", "R$ 29,90",
      "49,90", "sim", "SIM", "não", "10", "PRINCIPAL", "A-01", "L1",
      "01/08/2026", "01/08/2028", "",
    ]],
  );

  assert.equal(linha.linha, 2);
  assert.equal(linha.tipo, "insumo");
  assert.equal(linha.unidade, "cx");
  assert.equal(linha.estoque_minimo, 1500.5);
  assert.equal(linha.custo_unitario, 29.9);
  assert.equal(linha.controla_lote, true);
  assert.equal(linha.controla_validade, true);
  assert.equal(linha.controla_serie, false);
  assert.equal(linha.fabricado_em, "2026-08-01");
  assert.equal(linha.validade, "2028-08-01");
  assert.deepEqual(linha.erros, []);
});

test("aceita cabeçalhos alternativos e preserva código de barras", () => {
  const [linha] = mapearLinhasImportacaoProdutos(
    ["Código Produto", "Produto", "EAN", "Preço de venda"],
    [["ABC", "Produto teste", 7891234567890, 25]],
  );

  assert.equal(linha.codigo, "ABC");
  assert.equal(linha.nome, "Produto teste");
  assert.equal(linha.codigo_barras, "7891234567890");
  assert.equal(linha.preco_venda, 25);
});

test("rejeita valores incompatíveis antes da importação", () => {
  const [linha] = mapearLinhasImportacaoProdutos(
    ["nome", "tipo", "unidade", "custo_unitario", "controla_lote", "validade"],
    [["", "serviço", "peça", "-1", "talvez", "31/02/2026"]],
  );

  assert.ok(linha.erros.some((erro) => erro.includes("Nome")));
  assert.ok(linha.erros.some((erro) => erro.includes("Tipo")));
  assert.ok(linha.erros.some((erro) => erro.includes("Unidade")));
  assert.ok(linha.erros.some((erro) => erro.includes("Custo")));
  assert.ok(linha.erros.some((erro) => erro.includes("Sim ou Não")));
  assert.ok(linha.erros.some((erro) => erro.includes("DD/MM/AAAA")));
});

test("exige a coluna nome", () => {
  assert.throws(
    () => mapearLinhasImportacaoProdutos(["codigo", "sku"], [["A", "B"]]),
    /coluna "nome"/,
  );
});

test("migration mantém saldo inicial dentro da arquitetura documental", async () => {
  const sql = await readFile(
    new URL("../supabase/migrations/20260819003000_importacao_produtos_estoque.sql", import.meta.url),
    "utf8",
  );

  assert.match(sql, /create or replace function public\.estoque_importar_produtos/i);
  assert.match(sql, /public\.estoque_registrar_documento\(/i);
  assert.match(sql, /'saldo_inicial'/i);
  assert.doesNotMatch(sql, /update\s+public\.estoque_itens\s+set\s+saldo\s*=/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /idempotency_key/i);
  assert.match(sql, /revoke execute[\s\S]*authenticated/i);
  assert.match(sql, /grant execute[\s\S]*service_role/i);
});

test("arquivados podem ser restaurados e exclusão definitiva é protegida", async () => {
  const [rota, pagina] = await Promise.all([
    readFile(new URL("../src/app/api/estoque/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/(private)/estoque/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(rota, /itens_arquivados/);
  assert.match(rota, /catalogo_arquivado/);
  assert.match(rota, /acao === "restaurar_item"/);
  assert.match(rota, /acao === "excluir_item"/);
  assert.match(rota, /localizarVinculos/);
  assert.match(rota, /estoque\.configurar/);
  assert.match(pagina, /Arquivados/);
  assert.match(pagina, /Excluir definitivamente/);
});

test("estoque respeita o nicho e restringe recursos clínicos", async () => {
  const [rota, pagina, contexto] = await Promise.all([
    readFile(new URL("../src/app/api/estoque/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/(private)/estoque/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/header-user-context.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(rota, /buscarNichoEmpresa/);
  assert.match(rota, /ehSaude\s*\?/);
  assert.match(rota, /nicho\.grupo !== "saude"/);
  assert.match(rota, /nicho\.codigo !== "imobiliaria"/);
  assert.match(pagina, /ehSaude \? <button[\s\S]*Consumo clínico/);
  assert.match(pagina, /ehImobiliaria \? "Ex\.: Avaliação imobiliária"/);
  assert.match(contexto, /nichoCodigo: NichoCodigo/);
});

test("leitor de código de barras integra cadastro, busca, movimentação e inventário", async () => {
  const [scanner, pagina, rota, migration] = await Promise.all([
    readFile(new URL("../src/components/estoque/CodigoBarrasScannerModal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/(private)/estoque/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/api/estoque/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260819180000_estoque_codigo_barras_unico.sql", import.meta.url), "utf8"),
  ]);

  assert.match(scanner, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(scanner, /window\.BarcodeDetector/);
  assert.match(scanner, /BrowserMultiFormatReader/);
  assert.match(scanner, /import\("@zxing\/browser"\)/);
  assert.match(scanner, /DecodeHintType\.TRY_HARDER/);
  assert.match(scanner, /decodeFromStream\(stream/);
  assert.match(scanner, /decodeFromStream\(stream[\s\S]*if \(window\.BarcodeDetector\)/);
  assert.match(scanner, /focusMode: "continuous"/);
  assert.match(scanner, /zoom: value/);
  assert.match(scanner, /Código lido:/);
  assert.match(scanner, /Ainda não foi possível ler/);
  assert.match(scanner, /Leitor USB\/Bluetooth/);
  assert.match(pagina, /ScannerContexto = "busca" \| "cadastro" \| "movimentacao" \| "inventario"/);
  assert.match(pagina, /setInventarioContagens/);
  assert.match(pagina, /codigo_barras/);
  assert.match(rota, /consultaDuplicidade/);
  assert.match(migration, /create unique index[\s\S]*estoque_itens_empresa_codigo_barras_uk/i);
});
