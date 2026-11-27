// triagem-ordem.js — respostas da triagem NA ORDEM DAS PERGUNTAS (27/11/2026).
// O banco (jsonb) guarda o objeto de respostas com as chaves embaralhadas (por tamanho/alfabeto).
// Triagens novas trazem r.ordem; as antigas usam a ordem conhecida dos modelos e o resto vai pro fim.

// === BLOCO 1: ORDEM CONHECIDA DOS MODELOS (triagens feitas antes de 27/11) ===
const ORDEM_PADRAO = [
  // Alê (V83)
  'Incômodo', 'Região', 'Onde dói', 'Tipo de dor', 'Há quanto tempo', 'Tratamento antes', 'Como tem se sentido',
  'Há quanto tempo se sente assim', 'Objetivo', 'Pele e cabelo', 'Saúde', 'Cuidar em casa', 'Catálogo',
  // Larissa (Y35)
  'O que mais pesa', 'Onde sente mais', 'Quando incha', 'Rotina', 'Último tempo pra si', 'Pressão', 'Final da sessão', 'Como me conheceu',
];

// === BLOCO 2: ORDENAR ===
// r = respostas guardadas da triagem ({ respostas, ordem? }) → [[pergunta, resposta], ...]
export function respostasEmOrdem(r) {
  const obj = r?.respostas || {};
  const ordem = Array.isArray(r?.ordem) && r.ordem.length ? r.ordem : ORDEM_PADRAO;
  const pos = k => { const i = ordem.indexOf(k); return i < 0 ? 999 : i; };
  return Object.entries(obj).sort((a, b) => pos(a[0]) - pos(b[0]));
}
// Ordem das colunas pra várias triagens juntas (planilha)
export function perguntasEmOrdem(lista) {
  const todas = [...new Set(lista.flatMap(r => Object.keys(r?.respostas || {})))];
  const ordem = lista.find(r => Array.isArray(r?.ordem) && r.ordem.length)?.ordem || ORDEM_PADRAO;
  const pos = k => { const i = ordem.indexOf(k); return i < 0 ? 999 : i; };
  return todas.sort((a, b) => pos(a) - pos(b));
}
