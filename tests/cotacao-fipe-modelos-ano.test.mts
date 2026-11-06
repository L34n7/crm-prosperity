import assert from 'node:assert/strict';
import test from 'node:test';
import {agruparModelosPorAnoFipe} from '../src/lib/cotacoes-veiculares/modelos-ano.ts';
test('famílias com mais de 50 versões são filtradas pelo ano',()=>{
 const all=Array.from({length:75},(_,i)=>({code:String(i),name:'Versão '+i}));
 const found=agruparModelosPorAnoFipe(all,[{ano:{code:'2005-1',name:'2005 Gasolina'},modelos:[all[8],all[64]]}]);
 assert.deepEqual(found.map(x=>x.modelo.code),['8','64']);
});

test('modelos de outro ano e fora do catálogo não passam',()=>{
 const model={code:'a',name:'Modelo A'};
 const out=agruparModelosPorAnoFipe([model],[{ano:{code:'2010-5',name:'2010 Flex'},modelos:[{code:'b',name:'Modelo B'}]}]);
 assert.deepEqual(out,[]);
});

test('combustíveis distintos são preservados sem duplicar o mesmo ano',()=>{
 const model={code:'a',name:'Modelo A'};
 const out=agruparModelosPorAnoFipe([model],[
 {ano:{code:'2010-1',name:'2010 Gasolina'},modelos:[model]},
 {ano:{code:'2010-5',name:'2010 Flex'},modelos:[model]},
 {ano:{code:'2010-5',name:'2010 Flex'},modelos:[model]},
 ]);
 assert.deepEqual(out[0].anos.map(a=>a.code),['2010-1','2010-5']);
});
