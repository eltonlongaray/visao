// ─── ÍNDICE ──────────────────────────────────────────────────
// Card "Complete seu Falcon" — pendências de configuração agrupadas por
// prioridade (Prioritário / Secundário). Estilo "complete seu perfil" do
// Facebook: aparece quando falta algo e SOME sozinho quando tudo está feito.
// ─────────────────────────────────────────────────────────────
import { getProfile, getCategories } from './banco-dados.js';
import { listarObjetivos } from './objetivos.js';
import { getDadosCorpo } from './corpo.js';
import { abrirObjetivos } from './objetivos-ui.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

const irAjustes = () => { location.hash = '#/ajustes'; };
const irPreparo = () => { location.hash = '#/preparo'; };
const novaAtividade = () => { document.getElementById('add-cat')?.click(); };

// Monta a lista de itens com o estado "feito" de cada um.
async function coletar() {
  const [profile, cats, objs, corpo] = await Promise.all([
    getProfile().catch(() => ({})),
    getCategories().catch(() => []),
    listarObjetivos().catch(() => []),
    getDadosCorpo().catch(() => ({})),
  ]);
  const p = profile || {};
  const nome = (p.preferredName || p.fullName || '').trim();

  return [
    // ── Prioritário ──
    { id: 'nome',     nv: 'prioritario', ic: '📝', label: 'Seu nome',                              done: !!nome,                                     action: irAjustes },
    { id: 'horarios', nv: 'prioritario', ic: '⏰', label: 'Horário de acordar e dormir',           done: !!(p.defaultWakeTime && p.defaultSleepTime), action: irAjustes },
    { id: 'ativs',    nv: 'prioritario', ic: '📋', label: 'Pelo menos 3 atividades na Home',        done: (cats.length >= 3),                         action: novaAtividade },
    { id: 'foco',     nv: 'prioritario', ic: '🎯', label: 'Pelo menos 1 foco no Foco e Disciplina', done: (objs.length >= 1),                         action: abrirObjetivos },
    // ── Secundário ──
    { id: 'foto',     nv: 'secundario',  ic: '📷', label: 'Foto de perfil',                         done: !!p.fotoUrl,                                action: irAjustes },
    { id: 'corpo',    nv: 'secundario',  ic: '⚖️', label: 'Peso e altura',                          done: !!(corpo?.pesoKg && corpo?.alturaCm),       action: irPreparo },
    { id: 'treino',   nv: 'secundario',  ic: '💪', label: 'Perfil de treino',                       done: !!p.perfilTreino,                           action: irPreparo },
    { id: 'wpp',      nv: 'secundario',  ic: '📱', label: 'Seu WhatsApp',                           done: !!(p.phone && String(p.phone).trim()),      action: irAjustes },
  ];
}

export async function montarPendencias() {
  const box = document.getElementById('pend-secao');
  if (!box) return;

  let items;
  try { items = await coletar(); }
  catch { box.hidden = true; box.innerHTML = ''; return; }

  const total = items.length;
  const feitos = items.filter(i => i.done).length;
  const pendentes = items.filter(i => !i.done);

  // Tudo preenchido → o card some (não vira peso permanente na Home).
  if (!pendentes.length) { box.hidden = true; box.innerHTML = ''; return; }

  const pct = Math.round((feitos / total) * 100);
  const prio = pendentes.filter(i => i.nv === 'prioritario');
  const sec  = pendentes.filter(i => i.nv === 'secundario');
  const linha = (i) => `
    <button class="pend-item pend-${i.nv}" data-pend="${i.id}" type="button">
      <span class="pend-ic">${i.ic}</span>
      <span class="pend-label">${esc(i.label)}</span>
      <span class="pend-seta">›</span>
    </button>`;

  box.hidden = false;
  box.innerHTML = `
    <div class="home-section home-bloco pend-card">
      <div class="pend-head">
        <span class="pend-title">🚀 Complete seu Falcon</span>
        <span class="pend-frac">${feitos} de ${total}</span>
      </div>
      <div class="pend-barra"><i style="width:${pct}%"></i></div>
      ${prio.length ? `<div class="pend-grupo-lbl pend-lbl-prio">🔴 Prioritário</div>${prio.map(linha).join('')}` : ''}
      ${sec.length ? `<div class="pend-grupo-lbl pend-lbl-sec">🟣 Secundário</div>${sec.map(linha).join('')}` : ''}
    </div>`;

  box.querySelectorAll('[data-pend]').forEach(b => {
    const it = items.find(x => x.id === b.dataset.pend);
    b.onclick = () => it?.action?.();
  });
}
