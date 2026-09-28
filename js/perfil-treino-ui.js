// ─── ÍNDICE ──────────────────────────────────────────────────
// Questionário breve "Perfil de treino" — entende o usuário pra personalizar
// os níveis/alvos da Composição e (depois) o coach do pet. Guarda em
// profile.extra.perfilTreino. Editável a qualquer momento pelo Preparo Físico.
// Dois modos: INLINE (montarPerfilTreino, aba do Preparo) e MODAL (abrirPerfilTreino).
// ─────────────────────────────────────────────────────────────
import { getProfile, setProfile } from './banco-dados.js';
import { showToast } from './aviso-tela.js';
import { trapModalBack } from './modal-voltar.js';

const OBJETIVOS = [
  // Atlético + Estético viraram UMA opção (Elton, 28/09): a proporção áurea É o
  // shape enxuto e proporcional — estátua grega, estilo jogador de tênis.
  { k: 'aurea',    ic: '🏛️', lbl: 'Proporção Áurea',      sub: 'Estátua grega, estilo jogador de tênis' },
  { k: 'volume',   ic: '💪', lbl: 'Máximo volume',        sub: 'Ficar grande — mira além da áurea' },
  { k: 'saude',    ic: '❤️', lbl: 'Só saúde',             sub: 'Bem-estar e composição saudável' },
];
const TEMPOS = [
  { k: 'novo',   lbl: 'Comecei agora' },
  { k: 'menos1', lbl: '< 1 ano' },
  { k: '1a3',    lbl: '1 a 3 anos' },
  { k: 'mais3',  lbl: '3+ anos' },
];
// Pausa: quanto tempo ficou parado (sem treinar). Muda o ponto de partida —
// voltar de 1 ano parado não é igual a quem nunca parou.
const PAUSAS = [
  { k: 'nao',    lbl: 'Não parei' },
  { k: 'menos1m', lbl: 'Menos de 1 mês' },
  { k: '1a3m',   lbl: '1 a 3 meses' },
  { k: '3a6m',   lbl: '3 a 6 meses' },
  { k: '6a12m',  lbl: '6 meses a 1 ano' },
  { k: 'mais1a', lbl: 'Mais de 1 ano' },
];
const PADRAO = { objetivo: 'aurea', forca: false, freqSemana: 3, freqMusculo: 2, tempoTreino: 'menos1', pausa: 'nao' };

// Frequência semanal POR MÚSCULO (lista do Elton). freqMusculo (a resposta
// antiga, "o mesmo músculo quantas vezes") vira o ponto de partida de todos.
const GRUPOS_MUS = [
  { tit: 'Superiores', mus: [
    { k: 'peito', nome: 'Peito' }, { k: 'costas', nome: 'Costas' }, { k: 'ombros', nome: 'Ombros' },
    { k: 'trapezio', nome: 'Trapézio' }, { k: 'biceps', nome: 'Bíceps' }, { k: 'triceps', nome: 'Tríceps' },
  ] },
  { tit: 'Core', mus: [{ k: 'abdomen', nome: 'Abdômen' }] },
  { tit: 'Inferiores', mus: [
    { k: 'gluteo', nome: 'Glúteo' }, { k: 'quadriceps', nome: 'Quadríceps' },
    { k: 'posterior', nome: 'Posterior da coxa' }, { k: 'panturrilha', nome: 'Panturrilha' },
  ] },
];
export const MUSCULOS = GRUPOS_MUS.flatMap(g => g.mus);

// Lê o perfil salvo com os padrões preenchidos.
export function getPerfilTreino(profile) {
  const pt = { ...PADRAO, ...(profile?.perfilTreino || {}) };
  // 'atletico' foi fundido na Proporção Áurea — quem tinha escolhido cai nela.
  if (pt.objetivo === 'atletico') pt.objetivo = 'aurea';
  const base = Number.isFinite(pt.freqMusculo) ? pt.freqMusculo : 2;
  pt.freqPorMusculo = { ...Object.fromEntries(MUSCULOS.map(m => [m.k, base])), ...(pt.freqPorMusculo || {}) };
  return pt;
}

// HTML do questionário (sem header/rodapé fixos — flui na tela).
function _corpoHtml(pt) {
  return `
    <div class="pt-q">Qual seu objetivo?</div>
    <div class="pt-objs">
      ${OBJETIVOS.map(o => `<button class="pt-obj ${pt.objetivo === o.k ? 'sel' : ''}" data-obj="${o.k}" type="button">
        <span class="pt-obj-ic">${o.ic}</span>
        <span class="pt-obj-txt"><b>${o.lbl}</b><small>${o.sub}</small></span>
      </button>`).join('')}
    </div>

    <label class="pt-forca">
      <input type="checkbox" id="pt-forca" ${pt.forca ? 'checked' : ''}>
      <span>💥 <b>+ Força</b> — quero ganhar força também. Acompanho tua <b>carga subindo</b> (1RM), pra você ver o progresso mesmo sem mudar de tamanho.</span>
    </label>

    <div class="pt-q" style="margin-top:14px">Quantas vezes por semana você treina?</div>
    <select id="pt-freqsem" class="pt-sel">
      ${[1, 2, 3, 4, 5, 6, 7].map(n => `<option value="${n}" ${pt.freqSemana === n ? 'selected' : ''}>${n}× por semana</option>`).join('')}
    </select>

    <div class="pt-q" style="margin-top:14px">Quantas vezes na semana você treina cada músculo?</div>
    <div class="pt-hint" style="margin-top:-4px">Toque no número de cada um. <b>2×</b> por semana costuma ser o ritmo que mais rende pra crescer.</div>
    <div class="pt-mus-lista">
      ${GRUPOS_MUS.map(g => `<div class="pt-mus-grupo">${g.tit}</div>${g.mus.map(m => `
        <div class="pt-mus">
          <span class="pt-mus-nome">${m.nome}</span>
          <span class="pt-mus-chips">${[0, 1, 2, 3].map(n => `<button class="pt-chip mini ${pt.freqPorMusculo[m.k] === n ? 'sel' : ''}" data-mus="${m.k}" data-n="${n}" type="button">${n}×${n === 3 ? '+' : ''}</button>`).join('')}</span>
        </div>`).join('')}`).join('')}
    </div>

    <div class="pt-q" style="margin-top:14px">Há quanto tempo você treina (no total)?</div>
    <div class="pt-chips" id="pt-tempo">
      ${TEMPOS.map(t => `<button class="pt-chip ${pt.tempoTreino === t.k ? 'sel' : ''}" data-tempo="${t.k}" type="button">${t.lbl}</button>`).join('')}
    </div>
    <div class="pt-hint">Sua <b>constância atual</b> (sem falhar) eu acompanho sozinho pelo Ritual — é diferente de experiência.</div>

    <div class="pt-q" style="margin-top:14px">Você ficou um tempo parado sem treinar? Quanto tempo?</div>
    <div class="pt-chips" id="pt-pausa">
      ${PAUSAS.map(x => `<button class="pt-chip ${pt.pausa === x.k ? 'sel' : ''}" data-pausa="${x.k}" type="button">${x.lbl}</button>`).join('')}
    </div>
    <div class="pt-hint">Se parou, a volta começa mais leve — a memória muscular ajuda a recuperar rápido.</div>`;
}

// Um músculo não pode ser treinado mais vezes do que os treinos da semana:
// números acima ficam bloqueados e o valor marcado desce até o limite.
function _limitarMus(c, pt) {
  const max = pt.freqSemana;
  for (const m of MUSCULOS) {
    if ((pt.freqPorMusculo[m.k] ?? 0) > max) pt.freqPorMusculo[m.k] = Math.min(max, 3);
  }
  c.querySelectorAll('[data-mus]').forEach(b => {
    const n = +b.dataset.n;
    b.disabled = n > max;
    b.classList.toggle('sel', pt.freqPorMusculo[b.dataset.mus] === n);
  });
}

// Liga a seleção por classe (sem re-render, pra não perder checkbox/select).
function _ligarSelecoes(c, pt) {
  c.querySelectorAll('[data-obj]').forEach(b => b.onclick = () => {
    pt.objetivo = b.dataset.obj;
    c.querySelectorAll('[data-obj]').forEach(x => x.classList.toggle('sel', x === b));
  });
  c.querySelectorAll('[data-mus]').forEach(b => b.onclick = () => {
    if (b.disabled) return;
    pt.freqPorMusculo[b.dataset.mus] = +b.dataset.n;
    _limitarMus(c, pt);
  });
  c.querySelector('#pt-freqsem')?.addEventListener('change', (e) => {
    pt.freqSemana = +e.target.value;
    _limitarMus(c, pt);
  });
  _limitarMus(c, pt);
  c.querySelectorAll('[data-tempo]').forEach(b => b.onclick = () => {
    pt.tempoTreino = b.dataset.tempo;
    c.querySelectorAll('[data-tempo]').forEach(x => x.classList.toggle('sel', x === b));
  });
  c.querySelectorAll('[data-pausa]').forEach(b => b.onclick = () => {
    pt.pausa = b.dataset.pausa;
    c.querySelectorAll('[data-pausa]').forEach(x => x.classList.toggle('sel', x === b));
  });
}

// Salva o perfil a partir dos campos atuais. onDone roda só se salvou OK.
async function _salvar(c, pt, aoSalvar, onDone) {
  pt.forca = c.querySelector('#pt-forca').checked;
  pt.freqSemana = +c.querySelector('#pt-freqsem').value;
  const btn = c.querySelector('#pt-salvar'); btn.disabled = true; btn.textContent = 'Salvando…';
  try {
    await setProfile({ perfilTreino: pt });
    showToast('✅ Perfil de treino salvo!', 'success');
    aoSalvar?.(pt);
    onDone?.();
  } catch (e) {
    showToast('Erro: ' + e.message, 'error');
  } finally {
    if (btn.isConnected) { btn.disabled = false; btn.textContent = 'Salvar perfil'; }
  }
}

// ── INLINE: render dentro de um container (aba do Preparo). ────
export async function montarPerfilTreino(container, { aoSalvar } = {}) {
  if (!container) return;
  container.innerHTML = `<div class="pt-load">Carregando…</div>`;
  let prof = null;
  try { prof = await getProfile(); } catch {}
  const pt = getPerfilTreino(prof);
  container.innerHTML = `<div class="pt-inline">
    ${_corpoHtml(pt)}
    <button class="btn-primary" id="pt-salvar" type="button" style="width:100%;margin-top:16px">Salvar perfil</button>
  </div>`;
  _ligarSelecoes(container, pt);
  container.querySelector('#pt-salvar').onclick = () => _salvar(container, pt, aoSalvar);
}

// ── MODAL: janela própria (usado fora do Preparo, se preciso). ─
export async function abrirPerfilTreino(aoSalvar) {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'pt-ov';
  ov.innerHTML = `<div class="modal pt-modal"><div class="pt-corpo"><div class="pt-load">Carregando…</div></div></div>`;
  document.body.appendChild(ov);
  const close = trapModalBack(() => ov.remove());
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  let prof = null;
  try { prof = await getProfile(); } catch {}
  const pt = getPerfilTreino(prof);
  const c = ov.querySelector('.pt-corpo');
  c.innerHTML = `
    <div class="pt-header">
      <div class="pt-title">📋 Perfil de treino</div>
      <button class="pt-fechar" id="pt-close" type="button">Fechar</button>
    </div>
    <div class="pt-scroll">${_corpoHtml(pt)}</div>
    <div class="pt-rodape"><button class="btn-primary" id="pt-salvar" type="button">Salvar perfil</button></div>`;
  c.querySelector('#pt-close').onclick = () => close();
  _ligarSelecoes(c, pt);
  c.querySelector('#pt-salvar').onclick = () => _salvar(c, pt, aoSalvar, close);
}
