// ─── ÍNDICE ──────────────────────────────────────────────────
// Ajustes do app conversando com o Pet (etapa 7 do "Pet faz tudo").
// Só funções puras (sem banco, sem DOM): quem grava e mostra o card é o
// assistente-ia.js (BLOCO 8.18).
// BLOCO 1 — PERFIL (nome, apelido, nascimento, WhatsApp)
// BLOCO 2 — IDIOMA
// BLOCO 3 — SOM DAS NOTIFICAÇÕES
// BLOCO 4 — EXPORTAR MEUS DADOS
// BLOCO 5 — ENVIAR SUGESTÃO
// BLOCO 6 — SÓ NA TELA (excluir conta, sair, biometria)
// BLOCO 7 — LEITOR ÚNICO
// ─────────────────────────────────────────────────────────────

const semAcento = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const semPedido = (s) => String(s || '').trim()
  .replace(/^(?:(?:eu|olha|entao|então|ai|aí|tipo|por favor|pfv|falcon)[\s,]+)*/i, '')
  .replace(/^(?:pode|podes|consegue|tem como|d[aá] pra|preciso que|quero que|queria que)\s+(?:tu\s+|voc[eê]\s+|vc\s+)?(?:me\s+)?/i, '')
  .trim();
// Tira pontuação/“por favor” do fim do valor ditado
const limpaValor = (s) => String(s || '').trim()
  .replace(/[\s,]+(?:por favor|pfv|pf|obrigad[oa]|valeu)\s*$/i, '')
  .replace(/[.!?;,]+$/, '').trim();
// "joão da silva" → "João da Silva"
const LIGA = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
const capitaliza = (s) => s.split(/\s+/).map((p, i) => (i > 0 && LIGA.has(p.toLowerCase())) ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1)).join(' ');

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: PERFIL
// ═══════════════════════════════════════════════════════════════
// "meu nome é João Silva", "muda meu nome pra João", "meu nome completo é ..."
export function lerNome(texto) {
  const t = semPedido(texto);
  const m = t.match(/^(?:(?:muda|mudar|troca|trocar|altera|alterar|atualiza|atualizar|coloca|colocar|bota|botar|p[oõ]e)\s+)?(?:o\s+)?meu nome(?:\s+completo)?\s+(?:[eé]|para|pra|por|como)\s+(.+)$/i);
  if (!m) return null;
  const v = limpaValor(m[1]);
  if (!v || v.split(/\s+/).length > 8 || /\d|\?/.test(v)) return null;
  return capitaliza(v);
}

// "me chama de Tom", "quero ser chamado de Tom", "meu apelido é Tom"
export function lerApelido(texto) {
  const t = semPedido(texto);
  const m = t.match(/^(?:(?:pode\s+)?me\s+cham[ae]r?\s+de|(?:quero|prefiro|gosto de)\s+ser\s+chamad[oa]\s+de|(?:muda\s+|troca\s+)?(?:o\s+)?meu apelido\s+(?:[eé]|para|pra|por))\s+(.+)$/i);
  if (!m) return null;
  const v = limpaValor(m[1]);
  if (!v || v.split(/\s+/).length > 4 || /\d|\?/.test(v)) return null;
  return capitaliza(v);
}

const MESES = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
const dataValida = (a, m, d) => {
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};
// "nasci em 12/03/1990", "nasci dia 12 de março de 1990", "minha data de nascimento é 12/03/90"
// → { data: 'AAAA-MM-DD' } ou { semAno: true } (sem o ano não dá pra salvar)
export function lerNascimento(texto) {
  const t = semAcento(semPedido(texto));
  if (!/\b(nasci|nascimento|data de nasc\w*|meu aniversario e|faco aniversario)\b/.test(t)) return null;
  if (/\?$/.test(String(texto).trim()) && !/\d/.test(t)) return null;
  const hoje = new Date().getFullYear();
  const anoDe = (s) => { let a = Number(s); if (s.length === 2) a += (a > hoje % 100 ? 1900 : 2000); return a; };
  let m = t.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?\b/);
  let d, mes, a;
  if (m) { d = +m[1]; mes = +m[2]; a = m[3] ? anoDe(m[3]) : null; }
  else {
    m = t.match(/\b(\d{1,2})\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+(?:de\s+)?(\d{4}))?\b/);
    if (!m) return null;
    d = +m[1]; mes = MESES[m[2]]; a = m[3] ? +m[3] : null;
  }
  if (!a) return dataValida(2000, mes, d) ? { semAno: true } : null;
  if (a < 1900 || a > hoje || !dataValida(a, mes, d)) return null;
  return { data: `${a}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
}

// "meu whatsapp é (51) 99999-9999", "meu número é 51999999999", "muda meu zap pra ..."
export function lerWhatsapp(texto) {
  const t = semAcento(semPedido(texto));
  if (!/\b(meu|o meu)\s+(whatsapp|whats|zap|zapzap|wpp|numero|celular|telefone)\b/.test(t)) return null;
  const dig = t.replace(/\D/g, '');
  if (dig.length < 10 || dig.length > 13) return null;
  const n = dig.length > 11 && dig.startsWith('55') ? dig.slice(2) : dig;
  if (n.length < 10 || n.length > 11) return null;
  return `(${n.slice(0, 2)}) ${n.slice(2, n.length - 4)}-${n.slice(-4)}`;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: IDIOMA
// ═══════════════════════════════════════════════════════════════
const IDIOMAS = [
  [/\b(ingles|english)\b/, 'en'],
  [/\b(espanhol|castelhano|espanol)\b/, 'es'],
  [/\b(portugues de portugal|portugues europeu|pt[- ]pt|de portugal)\b/, 'pt-PT'],
  [/\b(portugues|brasileiro|pt[- ]br)\b/, 'pt-BR'],
];
// 'en' | 'es' | 'pt-PT' | 'pt-BR' | null. "muda o idioma pra inglês", "deixa o app em espanhol"
export function lerIdioma(texto) {
  const t = semAcento(semPedido(texto));
  const pedido = /\b(idioma|lingua|linguagem)\b/.test(t) ||
    /\b(app|aplicativo|falcon|tudo)\s+(em|pra|para|no)\s+(ingles|espanhol|portugues)/.test(t) ||
    /\b(muda|mudar|troca|trocar|coloca|colocar|bota|botar|deixa|deixar|passa|passar)\w*\b.*\b(pra|para|em|pro)\s+(o\s+)?(ingles|espanhol|portugues)\b/.test(t);
  if (!pedido) return null;
  if (/\b(traduz|traducao|significa|como se diz|como fala)\b/.test(t)) return null;
  for (const [re, code] of IDIOMAS) if (re.test(t)) return code;
  return null;
}
export const NOME_IDIOMA = { 'pt-BR': 'Português (BR) 🇧🇷', 'pt-PT': 'Português (PT) 🇵🇹', es: 'Español 🇪🇸', en: 'English 🇺🇸' };

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: SOM DAS NOTIFICAÇÕES
// ═══════════════════════════════════════════════════════════════
// true = silenciar, false = voltar o som, null = não é isso
export function lerSilenciar(texto) {
  const t = semAcento(semPedido(texto));
  if (!/\b(notificac\w*|avisos?|alertas?|lembretes?)\b/.test(t)) return null;
  if (/\b(silenci\w*|mut\w*|tira\w* o som|sem som|desativa\w* o som|desliga\w* o som|cala\w*)\b/.test(t)) return true;
  if (/\b(volta\w* o som|ativa\w* o som|liga\w* o som|com som|tira\w* do (silencioso|mudo)|dessilenci\w*|desmut\w*)\b/.test(t)) return false;
  return null;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: EXPORTAR MEUS DADOS
// ═══════════════════════════════════════════════════════════════
// 'pdf' | 'json' | null. "exporta meus dados", "baixa meus dados", "relatório em pdf"
export function lerExportar(texto) {
  const t = semAcento(semPedido(texto));
  const verbo = /\b(export\w*|baix\w*|download|salv\w*|gera\w*|manda\w*|tira\w*)\b/.test(t);
  if (/\bpdf\b/.test(t) && (verbo || /\brelatorio\b/.test(t)) && /\b(meus dados|relatorio|pdf)\b/.test(t)) return 'pdf';
  if (verbo && /\b(meus dados|todos os (meus )?dados|copia dos (meus )?dados|backup)\b/.test(t)) return 'json';
  return null;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 5: ENVIAR SUGESTÃO
// ═══════════════════════════════════════════════════════════════
// { texto } (texto pode ser '' = perguntar) ou null.
// "manda uma sugestão: botar modo X", "sugestão pro app: ...", "tenho uma sugestão de melhoria"
export function lerSugestao(texto) {
  const bruto = semPedido(texto);
  const t = semAcento(bruto);
  if (!/\bsugest\w*|\bsugir\w*|\bsugere\b|\bmelhoria\b/.test(t)) return null;
  if (/\b(prenda|desafio|rifa)\b/.test(t)) return null;                 // sugestão de prenda é dos Desafios
  if (!/\b(app|aplicativo|falcon|melhoria|desenvolvedor\w*|equipe|criador\w*|elton)\b/.test(t) &&
      !/^(?:manda|mandar|envia|enviar|tenho|queria dar|quero dar|deixa|deixar|registra|anota)\w*\s+(?:uma\s+)?sugest/.test(t) &&
      !/^sugest\w*\s*:/.test(t)) return null;
  // O texto vem depois de ":" ou de "que"/"de" (quando não é "de melhoria")
  let m = bruto.match(/sugest[ãa]o[^:]*:\s*(.+)$/i) || bruto.match(/sugest[ãa]o(?:\s+de\s+melhoria)?(?:\s+(?:pro|para o|pra)\s+(?:app|aplicativo|falcon))?\s+(?:que|de|pra|para)\s+(.+)$/i)
    || bruto.match(/sugiro\s+(?:que\s+)?(.+)$/i);
  const txt = m ? limpaValor(m[1]) : '';
  return { texto: txt.length >= 6 && txt.split(/\s+/).length >= 2 && !/^melhoria\b/i.test(txt) ? txt.charAt(0).toUpperCase() + txt.slice(1) : '' };
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 6: SÓ NA TELA (por segurança)
// ═══════════════════════════════════════════════════════════════
// 'excluir' | 'sair' | 'biometria' | null
export function lerSoNaTela(texto) {
  const t = semAcento(semPedido(texto));
  if (/\b(exclu\w*|apag\w*|delet\w*|encerr\w*|cancel\w*)\b.*\b(minha conta|a minha conta|meu cadastro|minha assinatura)\b/.test(t)) return 'excluir';
  if (/\b(sai|sair|desloga\w*|logout|log out)\b.*\b(da conta|do app|do falcon|da minha conta)\b/.test(t) || /^(sair|deslogar|logout|me desloga)$/.test(t.replace(/[.!?]+$/, ''))) return 'sair';
  if (/\b(biometria|digital|impressao digital|reconhecimento facial|face id|desbloqueio)\b/.test(t) && /\b(ativ\w*|desativ\w*|lig\w*|deslig\w*|coloc\w*|tir\w*|bot\w*|usar|quero)\b/.test(t)) return 'biometria';
  return null;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 7: LEITOR ÚNICO
// ═══════════════════════════════════════════════════════════════
// { tipo, valor } ou null. A ordem importa: o mais específico primeiro.
export function lerAjuste(texto) {
  if (!texto || typeof texto !== 'string') return null;
  let v;
  if ((v = lerSoNaTela(texto))) return { tipo: 'so_tela', valor: v };
  if ((v = lerSugestao(texto))) return { tipo: 'sugestao', valor: v.texto };
  if ((v = lerExportar(texto))) return { tipo: 'exportar', valor: v };
  if ((v = lerSilenciar(texto)) !== null) return { tipo: 'silenciar', valor: v };
  if ((v = lerIdioma(texto))) return { tipo: 'idioma', valor: v };
  if ((v = lerWhatsapp(texto))) return { tipo: 'whatsapp', valor: v };
  if ((v = lerNascimento(texto))) return { tipo: 'nascimento', valor: v };
  if ((v = lerApelido(texto))) return { tipo: 'apelido', valor: v };
  if ((v = lerNome(texto))) return { tipo: 'nome', valor: v };
  return null;
}
