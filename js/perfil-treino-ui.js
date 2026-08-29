// ─── ÍNDICE ──────────────────────────────────────────────────
// Questionário breve "Perfil de treino" — entende o usuário pra personalizar
// os níveis/alvos da Composição e (depois) o coach do pet. Guarda em
// profile.extra.perfilTreino. Editável a qualquer momento pelo Preparo Físico.
// ─────────────────────────────────────────────────────────────
import { getProfile, setProfile } from './banco-dados.js';
import { showToast } from './aviso-tela.js';
import { trapModalBack } from './modal-voltar.js';

const OBJETIVOS = [
  { k: 'atletico', ic: '🎾', lbl: 'Atlético / funcional', sub: 'Enxuto e proporcional (tipo jogador de tênis)' },
  { k: 'aurea',    ic: '✨', lbl: 'Estético / áurea',     sub: 'A proporção clássica — shape de estátua' },
  { k: 'volume',   ic: '💪', lbl: 'Máximo volume',        sub: 'Ficar grande — mira além da áurea' },
  { k: 'saude',    ic: '❤️', lbl: 'Só saúde',             sub: 'Bem-estar e composição saudável' },
];
const TEMPOS = [
  { k: 'novo',   lbl: 'Comecei agora' },
  { k: 'menos1', lbl: '< 1 ano' },
  { k: '1a3',    lbl: '1 a 3 anos' },
  { k: 'mais3',  lbl: '3+ anos' },
];
const PADRAO = { objetivo: 'aurea', forca: false, freqSemana: 3, freqMusculo: 2, tempoTreino: 'menos1' };

// Lê o perfil salvo com os padrões preenchidos.
export function getPerfilTreino(profile) {
  return { ...PADRAO, ...(profile?.perfilTreino || {}) };
}

export async function abrirPerfilTreino(aoSalvar) {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'pt-ov';
  ov.innerHTML = `<div class="modal pt-modal"><div class="pt-corpo"><div class="pt-load">Carregando…</div></div></div>`;
  document.body.appendChild(ov);
  const close = trapModalBack(() => ov.remove());
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  let prof = null;
  try { prof = await getProfile(); } catch {}
  desenhar(ov, getPerfilTreino(prof), close, aoSalvar);
}

function desenhar(ov, pt, close, aoSalvar) {
  const c = ov.querySelector('.pt-corpo');
  if (!c) return;
  c.innerHTML = `
    <div class="pt-header">
      <div class="pt-title">📋 Perfil de treino</div>
      <button class="pt-fechar" id="pt-close" type="button">Fechar</button>
    </div>
    <div class="pt-scroll">
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

      <div class="pt-q" style="margin-top:14px">O MESMO músculo, quantas vezes na semana?</div>
      <div class="pt-chips" id="pt-fm">
        ${[1, 2, 3].map(n => `<button class="pt-chip ${pt.freqMusculo === n ? 'sel' : ''}" data-fm="${n}" type="button">${n}×${n === 3 ? '+' : ''}</button>`).join('')}
      </div>
      <div class="pt-hint">2× por semana costuma ser o ritmo que mais rende pra crescer.</div>

      <div class="pt-q" style="margin-top:14px">Há quanto tempo você treina (no total)?</div>
      <div class="pt-chips" id="pt-tempo">
        ${TEMPOS.map(t => `<button class="pt-chip ${pt.tempoTreino === t.k ? 'sel' : ''}" data-tempo="${t.k}" type="button">${t.lbl}</button>`).join('')}
      </div>
      <div class="pt-hint">Sua <b>constância atual</b> (sem falhar) eu acompanho sozinho pelo Ritual — é diferente de experiência.</div>
    </div>
    <div class="pt-rodape"><button class="btn-primary" id="pt-salvar" type="button">Salvar perfil</button></div>
  `;

  c.querySelector('#pt-close').onclick = () => close();
  // seleção por classe (sem re-render, pra não perder o checkbox/select)
  c.querySelectorAll('[data-obj]').forEach(b => b.onclick = () => {
    pt.objetivo = b.dataset.obj;
    c.querySelectorAll('[data-obj]').forEach(x => x.classList.toggle('sel', x === b));
  });
  c.querySelectorAll('[data-fm]').forEach(b => b.onclick = () => {
    pt.freqMusculo = +b.dataset.fm;
    c.querySelectorAll('[data-fm]').forEach(x => x.classList.toggle('sel', x === b));
  });
  c.querySelectorAll('[data-tempo]').forEach(b => b.onclick = () => {
    pt.tempoTreino = b.dataset.tempo;
    c.querySelectorAll('[data-tempo]').forEach(x => x.classList.toggle('sel', x === b));
  });
  c.querySelector('#pt-salvar').onclick = async () => {
    pt.forca = c.querySelector('#pt-forca').checked;
    pt.freqSemana = +c.querySelector('#pt-freqsem').value;
    const btn = c.querySelector('#pt-salvar'); btn.disabled = true; btn.textContent = 'Salvando…';
    try {
      await setProfile({ perfilTreino: pt });
      showToast('✅ Perfil de treino salvo!', 'success');
      aoSalvar?.(pt);
      close();
    } catch (e) {
      showToast('Erro: ' + e.message, 'error');
      if (btn.isConnected) { btn.disabled = false; btn.textContent = 'Salvar perfil'; }
    }
  };
}
