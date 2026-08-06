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
// O campo termina no ponto OU no próximo rótulo. Só o ponto não bastava: o
// reconhecedor de voz NÃO escreve pontuação, então "Título lazer. Descrição
// aniversário" chega como "título lazer descrição aniversário" — e o título
// engolia a descrição inteira.
//
// Regex LITERAL, não montada por string: `new RegExp('\\s')` depende de a
// barra dupla sobreviver a toda camada por onde o arquivo passa, e basta uma
// comer a barra pra o padrão virar a letra "s" e falhar em silêncio.

// O campo termina no ponto, no próximo rótulo, OU quando começa um token de
// DATA/HORA — numérico (dia N, às N, N:NN, Nh, N horas, N/N) OU por palavra
// (amanhã, depois de amanhã, hoje, dia-da-semana). Sem o corte, "descrição
// Academia amanhã as 9h" engolia "amanhã as" na descrição E removia "amanhã" do
// comando, então a data caía em HOJE. Cortar em palavra de data resolve os dois:
// descrição fica "Academia" e "amanhã" volta pro comando pra virar a data certa.
const RE_TITULO = /t[ií]tulo\s*:?\s+(.+?)(?=\s+descri[çc][ãa]o\b|\s+(?:dia\s+\d|às\s+\d|\d{1,2}\s*[:h]\d?|\d{1,2}\s*horas?|\d{1,2}\/\d{1,2}|(?:depois\s+de\s+amanh[ãa]|amanh[ãa]|hoje|(?:segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)(?:[-\s]?feira)?)(?=\s|[.,;]|$))|\s*[.;]|$)/i;
const RE_NOME   = /\bnome\s*:?\s+(.+?)(?=\s+descri[çc][ãa]o\b|\s+(?:dia\s+\d|às\s+\d|\d{1,2}\s*[:h]\d?|\d{1,2}\s*horas?|\d{1,2}\/\d{1,2}|(?:depois\s+de\s+amanh[ãa]|amanh[ãa]|hoje|(?:segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)(?:[-\s]?feira)?)(?=\s|[.,;]|$))|\s*[.;]|$)/i;
const RE_DESC   = /descri[çc][ãa]o\s*:?\s+(.+?)(?=\s+t[ií]tulo\b|\s+(?:dia\s+\d|às\s+\d|\d{1,2}\s*[:h]\d?|\d{1,2}\s*horas?|\d{1,2}\/\d{1,2}|(?:depois\s+de\s+amanh[ãa]|amanh[ãa]|hoje|(?:segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)(?:[-\s]?feira)?)(?=\s|[.,;]|$))|\s*[.;]|$)/i;

// Versões pra REMOVER do comando, engolindo o separador junto
const CORTA = [
  /t[ií]tulo\s*:?\s+.+?(?=\s+descri[çc][ãa]o\b|\s+(?:dia\s+\d|às\s+\d|\d{1,2}\s*[:h]\d?|\d{1,2}\s*horas?|\d{1,2}\/\d{1,2}|(?:depois\s+de\s+amanh[ãa]|amanh[ãa]|hoje|(?:segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)(?:[-\s]?feira)?)(?=\s|[.,;]|$))|\s*[.;]|$)[.;]?/i,
  /descri[çc][ãa]o\s*:?\s+.+?(?=\s+t[ií]tulo\b|\s+(?:dia\s+\d|às\s+\d|\d{1,2}\s*[:h]\d?|\d{1,2}\s*horas?|\d{1,2}\/\d{1,2}|(?:depois\s+de\s+amanh[ãa]|amanh[ãa]|hoje|(?:segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)(?:[-\s]?feira)?)(?=\s|[.,;]|$))|\s*[.;]|$)[.;]?/i,
  /\bnome\s*:?\s+.+?(?=\s+descri[çc][ãa]o\b|\s+(?:dia\s+\d|às\s+\d|\d{1,2}\s*[:h]\d?|\d{1,2}\s*horas?|\d{1,2}\/\d{1,2}|(?:depois\s+de\s+amanh[ãa]|amanh[ãa]|hoje|(?:segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)(?:[-\s]?feira)?)(?=\s|[.,;]|$))|\s*[.;]|$)[.;]?/i,
];

function _limpaPontas(s) {
  return String(s || '').trim().replace(/^[.,;\s]+|[.,;\s]+$/g, '');
}

// Primeira letra maiúscula. O ditado devolve tudo minúsculo ("academia",
// "treino de perna") e a tarefa nasceria com cara de rascunho no meio de uma
// agenda escrita com inicial maiúscula. Só a PRIMEIRA: forçar o resto
// estragaria siglas e nomes próprios que o reconhecedor já acertou.
function _maiuscula(s) {
  const v = String(s || '');
  return v ? v.charAt(0).toUpperCase() + v.slice(1) : v;
}

export function extrairCampos(texto) {
  const t0 = String(texto || '');
  const cap = (re) => {
    const m = t0.match(re);
    const v = m ? _limpaPontas(m[1]) : '';
    return v || null;
  };

  const titulo = _maiuscula(cap(RE_TITULO) || cap(RE_NOME)) || null;
  const descricao = _maiuscula(cap(RE_DESC)) || null;

  // O que sobra é o comando em si: data, hora e tipo.
  let comando = t0;
  for (const re of CORTA) comando = comando.replace(re, ' ');
  comando = _limpaPontas(comando.replace(/\s{2,}/g, ' '));

  return { titulo, descricao, comando: comando || t0 };
}
