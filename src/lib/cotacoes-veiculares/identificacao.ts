import "server-only";

import {getSupabaseAdmin} from "@/lib/supabase/admin";
import type {TipoFipe} from "./fipe";

function normalizar(texto:string){
  return String(texto||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}

/** Dicas: uma marca sugerida só é utilizada se o modelo/ano existir na FIPE.
 * Nomes compartilhados ou desconhecidos continuam exigindo confirmação.
 */
const marcasConhecidas:Array<{marcas:string[];marca:string;tipo?:TipoFipe}>=[
  {marcas:["mercedes-benz","mercedes benz","mercedes"],marca:"Mercedes-Benz"},
  {marcas:["volkswagen","vw","volks"],marca:"Volkswagen"},
  {marcas:["chevrolet","gm"],marca:"Chevrolet"},
  {marcas:["land rover"],marca:"Land Rover"},
  {marcas:["alfa romeo"],marca:"Alfa Romeo"},
  {marcas:["mitsubishi"],marca:"Mitsubishi"},
  {marcas:["hyundai"],marca:"Hyundai"},
  {marcas:["citroen","citroën"],marca:"Citroen"},
  {marcas:["peugeot"],marca:"Peugeot"},
  {marcas:["renault"],marca:"Renault"},
  {marcas:["toyota"],marca:"Toyota"},
  {marcas:["nissan"],marca:"Nissan"},
  {marcas:["fiat"],marca:"Fiat"},
  {marcas:["honda"],marca:"Honda"},
  {marcas:["audi"],marca:"Audi"},
  {marcas:["bmw"],marca:"BMW"},
  {marcas:["ford"],marca:"Ford"},
  {marcas:["jeep"],marca:"Jeep"},
  {marcas:["kia"],marca:"Kia"},
  {marcas:["byd"],marca:"BYD"},
  {marcas:["chery","caoa chery"],marca:"Chery"},
  {marcas:["suzuki"],marca:"Suzuki"},
  {marcas:["volvo"],marca:"Volvo"},
  {marcas:["porsche"],marca:"Porsche"},
  {marcas:["yamaha"],marca:"Yamaha",tipo:"motorcycles"},
  {marcas:["dafra"],marca:"Dafra",tipo:"motorcycles"},
  {marcas:["kawasaki"],marca:"Kawasaki",tipo:"motorcycles"},
  {marcas:["iveco"],marca:"Iveco"},
  {marcas:["scania"],marca:"Scania",tipo:"trucks"},
  {marcas:["daf"],marca:"DAF",tipo:"trucks"},
];

/** Modelos conhecidos e normalmente exclusivos da marca. É pista de pesquisa,
 * nunca fonte de preço, de combustível ou de identificação final do veículo.
 */
const modelosConhecidos:Array<{regex:RegExp;marca:string;tipo?:TipoFipe}>=[
 {regex:/^(320i|318i|328i|330i|316i|m3|m4|x1|x3|x4|x5|x6|x7)(?:\b|$)/,marca:"BMW",tipo:"cars"},
 {regex:/^(a3|a4|a5|a6|a7|a8|q3|q5|q7|q8|rs3|rs4|s3|tt)(?:\b|$)/,marca:"Audi",tipo:"cars"},
 {regex:/^(gol|golf|polo|virtus|nivus|t cross|t-cross|taos|tiguan|saveiro|voyage|amarok|up|fox|jetta|parati|santana|kombi)(?:\b|$)/,marca:"Volkswagen",tipo:"cars"},
 {regex:/^(uno|mobi|argo|cronos|toro|strada|pulse|fastback|palio|punto|siena|ducato|fiorino)(?:\b|$)/,marca:"Fiat",tipo:"cars"},
 {regex:/^(onix|tracker|prisma|cruze|celta|cobalt|spin|montana|s10|s 10|classic|blazer|equinox|camaro)(?:\b|$)/,marca:"Chevrolet",tipo:"cars"},
 {regex:/^(corolla|hilux|etios|yaris|rav4|rav 4|sw4|sw 4|prius|camry)(?:\b|$)/,marca:"Toyota",tipo:"cars"},
 {regex:/^(civic|fit|city|hr v|hr-v|wr v|wr-v|cr v|cr-v|accord)(?:\b|$)/,marca:"Honda",tipo:"cars"},
 {regex:/^(cg|biz|pop 110|pcx|xre|cb 300|nrx)(?:\b|$)/,marca:"Honda",tipo:"motorcycles"},
 {regex:/^(hb20|creta|tucson|santa fe|ix35|azera|elantra)(?:\b|$)/,marca:"Hyundai",tipo:"cars"},
 {regex:/^(renegade|compass|commander|wrangler)(?:\b|$)/,marca:"Jeep",tipo:"cars"},
 {regex:/^(kwid|sandero|logan|duster|oroch|captur|master)(?:\b|$)/,marca:"Renault",tipo:"cars"},
 {regex:/^(ka|fiesta|focus|ecosport|ranger|territory|fusion|mustang|transit)(?:\b|$)/,marca:"Ford",tipo:"cars"},
 {regex:/^(kicks|versa|sentra|frontier|march)(?:\b|$)/,marca:"Nissan",tipo:"cars"},
 {regex:/^(dolphin|yuan|seal|song|king|tan)(?:\b|$)/,marca:"BYD",tipo:"cars"},
 {regex:/^(c180|c 180|c200|c 200|gla|glc|gle|sprinter)(?:\b|$)/,marca:"Mercedes-Benz"},
 {regex:/^(c3|c4|aircross|jumper)(?:\b|$)/,marca:"Citroen",tipo:"cars"},
 {regex:/^(208|2008|3008|5008|partner|boxer)(?:\b|$)/,marca:"Peugeot",tipo:"cars"},
 {regex:/^(tiggo|arrizo)(?:\b|$)/,marca:"Chery",tipo:"cars"},
 {regex:/^(sportage|seltos|cerato|soul|sorento|bongo)(?:\b|$)/,marca:"Kia"},
 {regex:/^(l200|pajero|asx|outlander)(?:\b|$)/,marca:"Mitsubishi",tipo:"cars"},
 {regex:/^(jimny|vitara)(?:\b|$)/,marca:"Suzuki",tipo:"cars"},
 {regex:/^(factor|fazer|lander|mt 03|nmax|neo 125|xtz)(?:\b|$)/,marca:"Yamaha",tipo:"motorcycles"},
];

export type IdentificacaoMarca={
  marca:string;
  modelo:string;
  tipoPreferencial:TipoFipe|null;
  origem:"informada"|"nome_modelo"|"catalogo"|"modelo_conhecido";
};

export async function identificarMarcaFipe(params:{
  empresaId:string;modelo:string;marca?:string|null;
}):Promise<IdentificacaoMarca|null>{
  let modelo=String(params.modelo||"").trim();
  const marcaInformada=String(params.marca||"").trim();

  // Quando a marca vem junto do modelo ("BMW 320i"), separa sem perguntar.
  const prefixos=[...marcasConhecidas].sort(
    (a,b)=>Math.max(...b.marcas.map(v=>v.length))-Math.max(...a.marcas.map(v=>v.length))
  );
  for(const entrada of prefixos){
    const nome=normalizar(modelo);
    const prefixo=entrada.marcas.find(m=>nome.startsWith(normalizar(m)+" "));
    if(prefixo){
      const quant=normalizar(prefixo).length;
      // O nome normalizado só serve para localizar a fronteira; preserva o modelo original.
      const palavras=prefixo.replace(/[- ]+/g," ").split(" ").length;
      const texto=modelo.replace(/[- ]+/g," ").trim().split(/\s+/).slice(palavras).join(" ");
      if(texto&&quant>0)modelo=texto;
      if(!marcaInformada)return {
        marca:entrada.marca,modelo,
        tipoPreferencial:entrada.tipo??null,origem:"nome_modelo",
      };
      break;
    }
  }
  if(marcaInformada)return {
    marca:marcaInformada,modelo,tipoPreferencial:null,origem:"informada",
  };

  // Modelos já consultados são o primeiro recurso de inferência na empresa.
  const termo=normalizar(modelo).split(" ").filter(Boolean)[0]||"";
  if(termo.length>=2&&termo.length<=50){
    const {data,error}=await getSupabaseAdmin()
      .from("cotacao_veicular_catalogo_fipe")
      .select("marca,modelo,tipo_fipe")
      .eq("empresa_id",params.empresaId)
      .ilike("modelo","%"+termo.replace(/[%_]/g,"")+"%")
      .limit(100);
    if(!error&&data?.length){
      const compativeis=data.filter(r=>{
        const a=normalizar(String(r.modelo));
        const b=normalizar(modelo);
        return a===b||a.startsWith(b+" ")||a.includes(b+" ")||b.startsWith(a+" ");
      });
      const candidatas=compativeis.length?compativeis:data;
      const unicas=new Map<string,{marca:string;tipo:TipoFipe}>();
      for(const c of candidatas){
        const marca=String(c.marca||"");
        const tipo=String(c.tipo_fipe||"") as TipoFipe;
        if(marca&&["cars","motorcycles","trucks"].includes(tipo))
          unicas.set(normalizar(marca)+"|"+tipo,{marca,tipo});
      }
      if(unicas.size===1){
        const unica=[...unicas.values()][0];
        return {marca:unica.marca,modelo,tipoPreferencial:unica.tipo,origem:"catalogo"};
      }
    }
  }

  const popular=modelosConhecidos.find(v=>v.regex.test(normalizar(modelo)));
  return popular?{
    marca:popular.marca,modelo,tipoPreferencial:popular.tipo??null,
    origem:"modelo_conhecido",
  }:null;
}
