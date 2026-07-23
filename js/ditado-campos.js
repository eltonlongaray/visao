// ═══════════════════════════════════════════════════════════════
// DITADO ESTRUTURADO — "Título X. Descrição Y."
// ═══════════════════════════════════════════════════════════════
// Permite falar: "agendar compromisso pra domingo às 10 horas.
//                 Título lazer. Descrição aniversário da Grazi"
//
// DECLARAR o título é melhor do que eu adivinhar pelo texto: sem isto a frase
// inteira virava o nome da tarefa, e o vínculo com a atividade dependia de eu
// acertar no chute. Com o rótulo, "lazer" casa com a atividade Lazer e o
// objetivo conta.
//
// Regex LITERAL, não montada por string: `new RegExp('\\s')` depende de a
// barra dupla sobreviver a toda camada por onde o arquivo passa, e basta uma
// comer a barra pra o padrão virar a letra "s" e falhar em silêncio.

// O campo termina no primeiro ponto/ponto-e-vírgula — é o separador natural
// de quem fala ditando ("...às 10 horas. Título lazer.").
const RE_TITULO = /t[ií]tulo\s*:?\s+([^.;]+)/i;
const RE_NOME   = /\bnome\s*:?\s+([^.;]+)/i;
const RE_DESC   = /descri[çc][ãa]o\s*:?\s+([^.;]+)/i;

// Versões pra REMOVER do comando, engolindo o separador junto
const CORTA = [
  /t[ií]tulo\s*:?\s+[^.;]+[.;]?/i,
  /descri[çc][ãa]o\s*:?\s+[^.;]+[.;]?/i,
  /\bnome\s*:?\s+[^.;]+[.;]?/i,
];

function _limpaPontas(s) {
  return String(s || '').trim().replace(/^[.,;\s]+|[.,;\s]+$/g, '');
}

export function extrairCampos(texto) {
  const t0 = String(texto || '');
  const cap = (re) => {
    const m = t0.match(re);
    const v = m ? _limpaPontas(m[1]) : '';
    return v || null;
  };

  const titulo = cap(RE_TITULO) || cap(RE_NOME);
  const descricao = cap(RE_DESC);

  // O que sobra é o comando em si: data, hora e tipo.
  let comando = t0;
  for (const re of CORTA) comando = comando.replace(re, ' ');
  comando = _limpaPontas(comando.replace(/\s{2,}/g, ' '));

  return { titulo, descricao, comando: comando || t0 };
}
