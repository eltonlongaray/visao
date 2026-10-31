// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — IMPORTS E LISTAS (modalidades, músculos)
// BLOCO 2 — QUE TIPO DE REGISTRO A ATIVIDADE PEDE
// BLOCO 3 — POPUP AO CONCLUIR (atividade física / leitura)
// BLOCO 4 — CONSTÂNCIA POR MÚSCULO (Metas e Pet)
// ─────────────────────────────────────────────────────────────
// Élton, 26/10: ao marcar a atividade física no Ritual, a pessoa diz o que fez
// (Musculação, Luta…) e, na musculação, os músculos do dia. Fazer pouco ainda
// conta (foi e fez algo); o que ficou faltando fica registrado pro relatório.
// Leitura tem mínimo de páginas: leu menos, conta igual, com incentivo.
// Tudo fica no `extra` da tarefa (treino, paginas): sem SQL.

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS E LISTAS
// ═══════════════════════════════════════════════════════════════
import { fetchDaysRange, getProfile } from './banco-dados.js';
import { trapModalBack } from './modal-voltar.js';
import { GRUPOS_MUS, MUSCULOS, getPerfilTreino } from './perfil-treino-ui.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const MODALIDADES = [
  { k: 'musculacao', nome: 'Musculação', ic: '🏋️' },
  { k: 'crossfit',   nome: 'Crossfit',   ic: '🔥' },
  { k: 'luta',       nome: 'Luta',       ic: '🥋' },
  { k: 'corrida',    nome: 'Corrida',    ic: '🏃' },
  { k: 'cardio',     nome: 'Cardio',     ic: '🚴' },
  { k: 'outro',      nome: 'Outro',      ic: '✨' },
];
// Na musculação dá pra marcar cardio junto (Élton): entra como "músculo" extra
const CARDIO = { k: 'cardio', nome: 'Cardio' };
const nomeMusculo = (k) => (k === 'cardio' ? CARDIO : MUSCULOS.find(m => m.k === k))?.nome || k;

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: QUE TIPO DE REGISTRO A ATIVIDADE PEDE
// ═══════════════════════════════════════════════════════════════
// 'fisica' | 'leitura' | null. A escolha salva na atividade vale; sem ela, o nome decide.
export function tipoRegistro(cat) {
  if (!cat) return null;
  if (cat.registro === 'fisica' || cat.registro === 'leitura') return cat.registro;
  if (cat.registro === 'nenhum') return null;
  const n = norm(cat.name);
  if (/\b(atividade fisica|academia|musculacao|malhar|malhacao|treino|treinar|crossfit|exercicios?)\b/.test(n)) return 'fisica';
  if (/\b(leitura|ler|livros?)\b/.test(n)) return 'leitura';
  return null;
}

// Músculos citados num texto ("Treino de perna", "peito e tríceps"). Perna e
// braço viram as partes (Élton: braço = bíceps+tríceps; perna = quadríceps,
// posterior, glúteo e panturrilha).
export function musculosDoTexto(txt) {
  const t = ' ' + norm(txt) + ' ';
  const out = new Set();
  if (/\b(perna|pernas|inferiores?)\b/.test(t)) ['quadriceps', 'posterior', 'gluteo', 'panturrilha'].forEach(k => out.add(k));
  if (/\b(braco|bracos)\b/.test(t)) ['biceps', 'triceps'].forEach(k => out.add(k));
  for (const m of MUSCULOS) {
    const raiz = norm(m.nome).replace(/s$/, '');
    if (t.includes(' ' + raiz)) out.add(m.k);
  }
  if (/\b(ombro|ombros)\b/.test(t)) out.add('ombros');
  if (/\b(abdomen|abdominal|abs)\b/.test(t)) out.add('abdomen');
  if (/\b(cardio|esteira|bike)\b/.test(t)) out.add('cardio');
  return [...out];
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: POPUP AO CONCLUIR
// ═══════════════════════════════════════════════════════════════
// Resolve com o patch da tarefa ({ desc, treino } ou { paginas, desc }) e a
// mensagem de incentivo, ou {} se a pessoa pular. Nunca impede de marcar.
export function perguntarAoConcluir(cat, task) {
  const tipo = tipoRegistro(cat);
  if (tipo === 'fisica') return _popupFisica(cat, task);
  if (tipo === 'leitura') return _popupLeitura(cat, task);
  return Promise.resolve({});
}

function _modal(html) {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.style.zIndex = '9500';   // acima do Pet (9000): a lista do dia do Pet também abre este pop-up
  ov.innerHTML = `<div class="modal tr-modal">${html}</div>`;
  document.body.appendChild(ov);
  return ov;
}

function _popupFisica(cat, task) {
  return new Promise((resolve) => {
    // O que estava planejado: o que já foi registrado ou o que a descrição diz
    const plano = task?.treino?.musculos?.length ? task.treino.musculos : musculosDoTexto(`${task?.desc || ''} ${task?.title || ''}`);
    // Várias modalidades no mesmo dia (Élton, 31/10: "musculação e luta")
    const mods = new Set(task?.treino?.modalidades || (task?.treino?.modalidade ? [task.treino.modalidade] : plano.length ? ['musculacao'] : []));
    const sel = new Set(plano);
    const ov = _modal('');
    let resultado = {};
    const close = trapModalBack(() => { ov.remove(); resolve(resultado); });

    const desenhar = () => {
      ov.querySelector('.tr-modal').innerHTML = `
        <div class="modal-title">${esc(cat?.icon || '💪')} O que você fez hoje?</div>
        <div class="tr-dica">Pode marcar mais de um.</div>
        <div class="pt-chips tr-mods">
          ${MODALIDADES.map(m => `<button type="button" class="pt-chip ${mods.has(m.k) ? 'sel' : ''}" data-mod="${m.k}">${m.ic} ${m.nome}</button>`).join('')}
        </div>
        ${mods.has('musculacao') ? `
          <div class="tr-q">Quais músculos você treinou?</div>
          ${plano.length ? '<div class="tr-dica">Fez menos do que o planejado? Desmarque o que ficou faltando: conta igual pra constância e fica anotado.</div>' : ''}
          ${[...GRUPOS_MUS, { tit: 'Extra', mus: [CARDIO] }].map(g => `
            <div class="pt-mus-grupo">${g.tit}</div>
            <div class="pt-chips">${g.mus.map(m => `<button type="button" class="pt-chip mini tr-mus ${sel.has(m.k) ? 'sel' : ''}" data-m="${m.k}">${m.nome}</button>`).join('')}</div>`).join('')}` : ''}
        <div class="modal-actions">
          <button class="btn-secondary" data-pular type="button">Pular</button>
          <button class="btn-primary" data-ok type="button" ${mods.size ? '' : 'disabled'}>Pronto</button>
        </div>`;
      ov.querySelectorAll('[data-mod]').forEach(b => b.onclick = () => {
        const k = b.dataset.mod;
        if (mods.has(k)) mods.delete(k); else mods.add(k);
        desenhar();
      });
      ov.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
        const k = b.dataset.m;
        if (sel.has(k)) sel.delete(k); else sel.add(k);
        b.classList.toggle('sel', sel.has(k));
      });
      ov.querySelector('[data-pular]').onclick = () => close();
      ov.querySelector('[data-ok]').onclick = () => {
        // Na ordem da lista (Musculação antes de Luta…)
        const lista = MODALIDADES.filter(x => mods.has(x.k));
        const musc = mods.has('musculacao');
        const musculos = musc ? [...sel] : [];
        const faltou = musc ? plano.filter(k => !sel.has(k)) : [];
        // As modalidades (e os músculos) viram a descrição da tarefa (Élton)
        const desc = lista.map(x => x.k === 'musculacao' && musculos.length
          ? `${x.nome}: ${musculos.map(nomeMusculo).join(', ')}` : x.nome).join(' + ');
        resultado = {
          // modalidade (a primeira) fica pra quem lia o campo antigo
          patch: { desc, treino: { modalidade: lista[0].k, modalidades: lista.map(x => x.k), musculos, ...(faltou.length ? { faltou } : {}) } },
          msg: faltou.length ? `Boa constância! Ficou faltando ${faltou.map(nomeMusculo).join(', ')}, anotei aqui.` : null,
        };
        close();
      };
    };
    desenhar();
  });
}

function _popupLeitura(cat, task) {
  return new Promise((resolve) => {
    const minimo = Math.max(0, Number(cat?.minimoPaginas) || 0);
    const ov = _modal(`
      <div class="modal-title">${esc(cat?.icon || '📚')} Quantas páginas você leu?</div>
      ${minimo ? `<div class="tr-dica">Seu mínimo é ${minimo} página${minimo > 1 ? 's' : ''} por dia. Leu menos? Conta igual pra constância.</div>` : ''}
      <label class="input-field"><div class="input-field-label">Páginas</div>
        <input id="tr-pag" type="number" inputmode="numeric" min="1" max="2000" value="${Number(task?.paginas) || ''}" placeholder="Ex.: 10"></label>
      <div class="modal-actions">
        <button class="btn-secondary" data-pular type="button">Pular</button>
        <button class="btn-primary" data-ok type="button">Pronto</button>
      </div>`);
    let resultado = {};
    const close = trapModalBack(() => { ov.remove(); resolve(resultado); });
    setTimeout(() => ov.querySelector('#tr-pag')?.focus(), 60);
    ov.querySelector('[data-pular]').onclick = () => close();
    ov.querySelector('[data-ok]').onclick = () => {
      const n = Math.round(Number(ov.querySelector('#tr-pag').value) || 0);
      if (n > 0) {
        const falta = minimo - n;
        resultado = {
          patch: { paginas: n, ...(task?.desc ? {} : { desc: `${n} página${n > 1 ? 's' : ''}` }) },
          msg: falta > 0 ? `Boa constância! Só faltou ${falta} página${falta > 1 ? 's' : ''} hoje.` : null,
        };
      }
      close();
    };
  });
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: CONSTÂNCIA POR MÚSCULO
// ═══════════════════════════════════════════════════════════════
const SEMANAS = 8;
const _seg = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const _idDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Por músculo: meta da semana (Preparo Físico), feitos nesta semana, última vez
// e semanas seguidas sem treinar. Também as modalidades das últimas semanas.
export async function constanciaPorMusculo(hoje = new Date()) {
  const ini = _seg(hoje); ini.setDate(ini.getDate() - 7 * (SEMANAS - 1));
  const [dias, profile] = await Promise.all([fetchDaysRange(ini, hoje), getProfile().catch(() => ({}))]);
  const pt = getPerfilTreino(profile);
  const segAtual = _idDia(_seg(hoje));
  const porMus = new Map(MUSCULOS.map(m => [m.k, { k: m.k, nome: m.nome, meta: pt.freqPorMusculo[m.k] ?? 0, semana: 0, ultimo: null, faltas: 0 }]));
  const modalidades = new Map();
  let registros = 0;
  for (const d of dias) {
    for (const t of d.tasks || []) {
      if (!t.done || !t.treino) continue;
      registros++;
      for (const md of t.treino.modalidades || (t.treino.modalidade ? [t.treino.modalidade] : [])) modalidades.set(md, (modalidades.get(md) || 0) + 1);
      for (const k of t.treino.musculos || []) {
        const m = porMus.get(k); if (!m) continue;
        if (!m.ultimo || d.id > m.ultimo) m.ultimo = d.id;
        if (_idDia(_seg(new Date(d.id + 'T12:00:00'))) === segAtual) m.semana++;
      }
      for (const k of t.treino.faltou || []) { const m = porMus.get(k); if (m) m.faltas++; }
    }
  }
  for (const m of porMus.values()) {
    m.semanasSem = m.ultimo
      ? Math.floor((_seg(hoje) - _seg(new Date(m.ultimo + 'T12:00:00'))) / (7 * 864e5))
      : null;   // null = nada registrado nas últimas 8 semanas
  }
  return { musculos: [...porMus.values()], modalidades, registros, semanas: SEMANAS };
}

// Frase do Pet pra "como tá meu treino?" (Élton, 26/10)
export function textoTreino(c) {
  if (!c.registros) return 'Ainda não tenho treino registrado com os músculos 🤔 Quando marcar a atividade física no Ritual, me diz o que tu treinou e eu acompanho cada músculo.';
  const atrasados = c.musculos.filter(m => m.meta > 0 && (m.semanasSem == null || m.semanasSem >= 2));
  const luta = (c.modalidades.get('luta') || 0) + (c.modalidades.get('corrida') || 0) > 0;
  const linhas = [];
  // Perna junta: "faz 2 semanas que tu não treina perna"
  const PERNA = ['quadriceps', 'posterior', 'gluteo', 'panturrilha'];
  const pernaAtras = atrasados.filter(m => PERNA.includes(m.k));
  if (pernaAtras.length >= 3) {
    const sem = Math.max(...pernaAtras.map(m => m.semanasSem ?? c.semanas));
    let f = `Cara, já faz ${sem >= c.semanas ? `mais de ${c.semanas}` : sem} semanas que tu não treina perna.`;
    if (luta && pernaAtras.some(m => m.k === 'panturrilha')) f += ' Pra ti que faz luta e já trabalha bastante a panturrilha, pelo menos quadríceps e posterior da coxa tem que fazer.';
    linhas.push(f);
  }
  for (const m of atrasados) {
    if (pernaAtras.length >= 3 && PERNA.includes(m.k)) continue;
    linhas.push(m.semanasSem == null ? `${m.nome}: nada registrado nas últimas ${c.semanas} semanas.` : `${m.nome}: ${m.semanasSem} semanas sem treinar.`);
  }
  const emDia = c.musculos.filter(m => m.meta > 0 && m.semana >= m.meta).map(m => m.nome);
  const faltas = c.musculos.filter(m => m.faltas > 0).sort((a, b) => b.faltas - a.faltas).slice(0, 3);
  let msg = '💪 <strong>Teu treino</strong><br>' + (linhas.length ? linhas.join('<br>') : 'Tudo em dia com a frequência que tu definiu no Preparo Físico 👏');
  if (emDia.length) msg += `<br><small>Nesta semana já bateu: ${emDia.join(', ')}.</small>`;
  if (faltas.length) msg += `<br><small>Mais deixado pra trás: ${faltas.map(m => `${m.nome} (${m.faltas}x)`).join(', ')}.</small>`;
  return msg;
}
