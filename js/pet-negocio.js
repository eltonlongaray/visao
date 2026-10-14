// ─── ÍNDICE ──────────────────────────────────────────────────
// Pet × Agenda Online e Rifas (lado do dono): entende pedidos sobre os
// atendimentos recebidos e os números das rifas.
// Só INTERPRETA (sem banco, sem DOM). Quem lê e grava é o assistente-ia.js
// (BLOCO 8.18), sempre depois do card de confirmação.
// BLOCO 1 — NORMALIZAÇÃO
// BLOCO 2 — ATENDIMENTOS (ver, cancelar, finalizar, faltou)
// BLOCO 3 — RIFAS (ver, quem pegou, pago, liberar número)
// BLOCO 4 — ACHAR (cliente, rifa, participante)
// ─────────────────────────────────────────────────────────────
import { diaDaFrase } from './pet-ritual.js?v=20261009g';

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: NORMALIZAÇÃO
// ═══════════════════════════════════════════════════════════════
export function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '')
    .replace(/[^a-z0-9:/ ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Palavras do texto que podem ser nome (3+ letras, fora as do pedido)
const COMUNS = new Set(('atendimento atendimentos agendamento agendamentos cliente clientes agenda online rifa rifas numero numeros ' +
  'cancela cancelar cancelei desmarca desmarcar finaliza finalizar finalizei conclui concluir termina terminei atendi faltou faltaram ' +
  'veio apareceu compareceu marca marcar como pago pagou pagaram paga libera liberar desistiu solta quem qual quais quanto quantos ' +
  'mostra meus minhas proximo proximos proxima tenho hoje amanha ontem segunda terca quarta quinta sexta sabado domingo depois ' +
  'das dos para pra com que uma tem ver nao sim ainda hora horas manha tarde noite todos todas falta favor pode esse essa este esta ' +
  'arrecadei arrecadou arrecadacao vendi vendeu vendidos pegou pegaram semana exclui apaga minha minhas meu meus atendo atende atender').split(' '));
export function palavrasNome(texto) {
  return norm(texto).split(' ').filter(p => p.length >= 3 && !COMUNS.has(p) && !/^\d/.test(p));
}

// "às 15h", "15:30", "das 9" → "HH:MM"
export function horaDaFrase(texto) {
  const t = norm(texto);
  const m = t.match(/\b(\d{1,2})(?::(\d{2})|h(\d{2})?)\b/) || t.match(/\b(?:as|das|de)\s+(\d{1,2})\b(?!\s*(?:\/|de\s+\w+o\b))/);
  if (!m || +m[1] > 23) return null;
  let h = +m[1];
  if (h < 12 && /\b(da tarde|da noite)\b/.test(t)) h += 12;
  return `${String(h).padStart(2, '0')}:${m[2] || m[3] || '00'}`;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: ATENDIMENTOS
// ═══════════════════════════════════════════════════════════════
const ATEND_RE = /\b(atendimentos?|agendamentos?|clientes?|agenda online|atendo|atende|atender)\b/;
const FALTOU_RE = /\b(falt(ou|aram|a)|nao (veio|vieram|apareceu|compareceu)|furou|deu bolo)\b/;
const FINALIZAR_RE = /\b(finaliz\w*|conclu\w*|termin\w*|atendi|ja atendi|dei baixa|foi atendid\w*)\b/;
const CANCELAR_RE = /\b(cancel\w*|desmarc\w*|exclu\w*|apag\w*)\b/;
const VER_RE = /\b(quais|qual|quem|mostra\w*|ver|lista\w*|meus|minhas|proxim\w*|tenho|tem|quantos)\b/;

// { tipo:'atendimento', acao:'ver'|'cancelar'|'finalizar'|'faltou', dia:{data,dito}, hora, palavras, semPalavraChave }
// ou null. "a Maria faltou" vem sem "atendimento": o assistente só segue se o
// nome bater com um cliente (semPalavraChave = true).
export function lerAtendimento(texto, agora = new Date()) {
  const t = norm(texto);
  const chave = ATEND_RE.test(t);
  let acao = null;
  if (FALTOU_RE.test(t)) acao = 'faltou';
  else if (FINALIZAR_RE.test(t)) acao = 'finalizar';
  else if (chave && CANCELAR_RE.test(t)) acao = 'cancelar';
  else if (chave && VER_RE.test(t)) acao = 'ver';
  if (!acao) return null;
  // Sem "atendimento/cliente": só falta e "atendi a Maria" (o nome confirma)
  if (!chave && !(acao === 'faltou' || /\batendi\b/.test(t))) return null;
  // "agenda online" pra criar compromisso ("marca agenda online maria 15h") é do Ritual
  if (/\bagenda online\b/.test(t) && !/\batendiment/.test(t) && acao === 'ver' && /\b(marca|agend\w*|cria|bota|coloca|poe)\b/.test(t)) return null;
  const futuro = acao === 'ver' || acao === 'cancelar';
  return {
    tipo: 'atendimento', acao,
    dia: diaDaFrase(texto, agora, futuro ? 'futuro' : 'passado'),
    semana: /\b(semana|proximos dias)\b/.test(t),
    hora: horaDaFrase(texto),
    palavras: palavrasNome(texto),
    semPalavraChave: !chave,
  };
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: RIFAS
// ═══════════════════════════════════════════════════════════════
// Números citados: "número 15", "os números 3, 8 e 21", "o 15"
export function numerosDaFrase(texto) {
  const t = norm(texto).replace(/\br\s*\d+(?:[.,]\d+)?/g, ' ');   // tira "R$ 10"
  const depois = t.match(/\bnumeros?\s+((?:\d{1,5}(?:\s*(?:,|e|\/)\s*|\s+))*\d{1,5})/);
  const base = depois ? depois[1] : t.replace(/\b\d+\s*(reais|%|h|horas?|min|minutos?)\b/g, ' ');
  return [...new Set((base.match(/\b\d{1,5}\b/g) || []).map(Number))];
}

// { tipo:'rifa', acao:'ver'|'quem'|'pendentes'|'pago'|'nao_pago'|'liberar', numeros, palavras } ou null
export function lerRifa(texto) {
  const t = norm(texto);
  const temRifa = /\brifas?\b/.test(t);
  const temNumero = /\bnumeros?\s+\d/.test(t);
  if (!temRifa && !temNumero) return null;
  const numeros = numerosDaFrase(texto);
  let acao = null;
  if (/\bquem\b.*\b(nao|ainda nao)\s+pag/.test(t) || /\b(pendentes?|falta pagar|nao pagaram|devendo)\b/.test(t)) acao = 'pendentes';
  else if (/\bquem\b.*\b(pegou|comprou|tem|ficou|escolheu)\b/.test(t)) acao = 'quem';
  else if (/\b(liber\w*|desist\w*|solt\w*|remov\w*|tir\w* (o|os) numero|apag\w*)\b/.test(t)) acao = 'liberar';
  else if (/\b(desmarc\w*|tir\w*)\b.*\bpago\b|\bnao pagou\b|\bnao e pago\b/.test(t)) acao = 'nao_pago';
  else if (/\b(pag(ou|aram|o|ou o)|recebi|quit\w*|marc\w* (como )?pago|como pago|ja pagou|ta pago|esta pago)\b/.test(t)) acao = 'pago';
  else if (temRifa && /\b(quanto|quantos|como|mostra\w*|ver|minhas?|arrecad\w*|vend\w*|resumo|situacao|meta)\b/.test(t)) acao = 'ver';
  if (!acao) return null;
  // Número sem "rifa" só vale pra pagar/liberar/quem ("o João pagou o número 15")
  if (!temRifa && !['pago', 'nao_pago', 'liberar', 'quem'].includes(acao)) return null;
  return { tipo: 'rifa', acao, numeros, palavras: palavrasNome(texto) };
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: ACHAR
// ═══════════════════════════════════════════════════════════════
// O nome bate se alguma palavra dele (3+ letras) foi dita
function bateNome(nome, palavras) {
  const doNome = norm(nome).split(' ').filter(p => p.length >= 3);
  return doNome.some(p => palavras.some(w => w === p || (w.length >= 4 && p.startsWith(w)) || (p.length >= 4 && w.startsWith(p))));
}

// Atendimentos que batem com o pedido (cliente, dia, hora)
export function acharAtendimentos(ags, p) {
  let lista = ags;
  const comNome = lista.filter(a => bateNome(a.cliente_nome, p.palavras));
  if (comNome.length) lista = comNome;
  else if (p.semPalavraChave) return [];   // "a Maria faltou" sem cliente Maria: não é atendimento
  if (p.hora) {
    const h = lista.filter(a => String(a.hora || '').slice(0, 5) === p.hora);
    if (h.length) lista = h;
  }
  if (p.dia?.dito) {
    const iso = isoLocal(p.dia.data);
    const d = lista.filter(a => a.data === iso);
    lista = d;
  }
  return lista;
}

export const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Rifa citada pelo título; com uma só ativa, é ela
export function acharRifa(rifas, palavras) {
  const citadas = rifas.filter(r => bateNome(r.titulo, palavras));
  if (citadas.length) return citadas;
  const ativas = rifas.filter(r => r.ativo !== false && r.sorteio_status !== 'encerrado');
  return ativas.length ? ativas : rifas;
}

// Participantes pelos números ou pelo nome de quem pegou
export function acharParticipantes(parts, p) {
  if (p.numeros.length) return parts.filter(x => p.numeros.includes(Number(x.numero)));
  return parts.filter(x => bateNome(x.nome, p.palavras));
}
