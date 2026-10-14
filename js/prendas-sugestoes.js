// ─── ÍNDICE ──────────────────────────────────────────────────
// FALCON · Sugestões de prenda dos usuários (Élton, 14/10)
// Qualquer pessoa sugere; quem aprova é o APP: primeiro as regras aqui,
// depois a IA (Worker pet-ia, campo "moderarPrenda") e por fim o banco
// (migration/prendas-sugestoes.sql). Aprovada aparece pra todo mundo e
// entra na lista de prendas do formulário. 🚩 3 denúncias = some sozinha.
// BLOCO 1 — REGRAS
// BLOCO 2 — BANCO
// BLOCO 3 — SUGERIR (regras → IA → banco)
// BLOCO 4 — TELA
// ─────────────────────────────────────────────────────────────
import { supabase } from './config-supabase.js';
import { PET_IA_URL } from './pet-nuvem.js';
import { auth } from './autenticacao.js';
import { getProfile } from './banco-dados.js';
import { showToast, confirmModal } from './aviso-tela.js';
import { trapModalBack } from './modal-voltar.js';

const _esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const _norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: REGRAS
// ═══════════════════════════════════════════════════════════════
// O que quem sugere lê antes de mandar (e o que a IA confere)
export const REGRAS_PRENDA = [
  '😂 Leve e do bem: é pra rir junto, nunca de alguém.',
  '🏠 Feita por ti e gravada por ti, em casa ou com amigos e família que toparam. Nada com pessoas estranhas, na rua ou em público.',
  '🚫 Sem nudez, roupa íntima, nada sexual ou gesto obsceno.',
  '⚖️ Dentro da lei e sem perigo: nada de bebida em excesso, droga, cigarro, fogo, arma, se machucar ou mexer no que é dos outros.',
  '🤝 Sem humilhação, xingamento ou preconceito (raça, religião, gênero, corpo).',
  '💸 Nada que custe caro.',
  '🎥 Tem que caber num vídeo de até 2 minutos: ela vai pro Mural das Prendas, pra todo mundo ver por 7 dias.',
];

// Mesma lista do banco (BLOCO 3 do SQL)
const PROIBIDAS = /\b(nud|pelad|sem roupa|cueca|calcinha|sutia|seios?\b|peito de fora|bunda de fora|sexo|sexual|transa|beij[ao] na boca|porno|strip|cachaca|vodka|tequila|droga|maconha|cocaina|cigarro|furt|roub|pich|vandal|armas?\b|facas?\b|fogo\b|queima|bater em|tapas?\b|socos?\b|agred|estranh|desconhecid|na rua|no shopping|no onibus|em publico|xing|ofend|humilh|racis|macaco|viad|bicha|gord[oa]s?\b)/;

export function motivoLocal(texto) {
  const t = String(texto || '').replace(/\s+/g, ' ').trim();
  if (t.length < 8) return 'Escreve um pouco mais a prenda (mín. 8 letras).';
  if (t.length > 120) return 'Prenda grande demais (máx. 120 letras).';
  if (/https?:\/\/|www\./i.test(t)) return 'Sem link na prenda.';
  if (PROIBIDAS.test(_norm(t))) return 'Essa prenda não passa nas regras do Falcon. Dá uma olhada nas regras aqui em cima.';
  return '';
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: BANCO
// ═══════════════════════════════════════════════════════════════
// Aprovadas, as mais curtidas primeiro
export async function fetchSugestoes() {
  const { data, error } = await supabase.from('prenda_sugestoes')
    .select('id, user_id, nome, texto, curtidas, oculta, created_at')
    .order('curtidas', { ascending: false }).order('created_at', { ascending: false }).limit(100);
  return error ? [] : (data || []).filter(s => !s.oculta);
}
export async function sugestoesTop(n = 15) {
  return (await fetchSugestoes()).slice(0, n).map(s => s.texto);
}
async function meusVotos() {
  const { data } = await supabase.from('prenda_sugestao_votos').select('sugestao_id, tipo');
  return new Set((data || []).map(v => `${v.sugestao_id}:${v.tipo}`));
}
export async function votar(id, tipo, ligar) {
  const q = ligar
    ? supabase.from('prenda_sugestao_votos').insert({ sugestao_id: id, tipo })
    : supabase.from('prenda_sugestao_votos').delete().eq('sugestao_id', id).eq('tipo', tipo);
  const { error } = await q;
  if (error && !/duplicate/i.test(error.message || '')) throw new Error('Não deu agora, tenta de novo');
}
async function apagar(id) {
  const { error } = await supabase.from('prenda_sugestoes').delete().eq('id', id);
  if (error) throw new Error('Não deu pra apagar');
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: SUGERIR (regras → IA → banco)
// ═══════════════════════════════════════════════════════════════
// { ok: true } ou { ok: false, motivo }
async function _ia(texto) {
  if (!PET_IA_URL) return null;
  try {
    const token = (await supabase.auth.getSession())?.data?.session?.access_token;
    if (!token) return null;
    const r = await fetch(PET_IA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ moderarPrenda: texto }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return typeof j?.ok === 'boolean' ? j : null;
  } catch { return null; }
}

export async function sugerirPrenda(texto) {
  let t = String(texto || '').replace(/\s+/g, ' ').trim();
  t = t.charAt(0).toUpperCase() + t.slice(1);
  const local = motivoLocal(t);
  if (local) return { ok: false, motivo: local };
  // IA fora do ar (cota do dia): segue só com as regras daqui e do banco
  const ia = await _ia(t);
  if (ia && !ia.ok) return { ok: false, motivo: ia.motivo || 'Essa prenda não passa nas regras do Falcon.' };
  let nome = '';
  try { const p = await getProfile(); nome = p?.preferredName || p?.fullName || ''; } catch { /* segue */ }
  const { error } = await supabase.from('prenda_sugestoes').insert({ texto: t, nome: nome || null });
  if (error) {
    const m = error.message || '';
    if (/duplicate|unique/i.test(m)) return { ok: false, motivo: 'Essa prenda já foi sugerida 😉' };
    if (/relation|does not exist|schema cache/i.test(m)) return { ok: false, motivo: 'As sugestões ainda não foram ligadas no banco.' };
    return { ok: false, motivo: m.replace(/^.*?:\s*/, '') || 'Não deu pra mandar agora' };
  }
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: TELA
// ═══════════════════════════════════════════════════════════════
export async function abrirSugestoes() {
  const uid = auth.currentUser?.uid;
  let admin = false;
  try { admin = !!(await getProfile())?.isAdmin; } catch { /* segue */ }
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `
    <div class="modal sg-modal">
      <div class="modal-title">💡 Sugestões de prenda</div>
      <div class="modal-hint">Tem uma ideia boa? Manda aí! O app confere as regras e, se passar, ela entra na lista de prendas pra todo mundo usar.</div>
      <details class="sg-regras" open><summary>📜 Regras da prenda</summary>
        <ul>${REGRAS_PRENDA.map(r => `<li>${_esc(r)}</li>`).join('')}</ul></details>
      <div class="sg-form">
        <textarea id="sg-txt" maxlength="120" rows="2" placeholder="Ex: Comer uma colher bem cheia de farofa 🥄"></textarea>
        <button class="btn-primary" id="sg-go">Sugerir</button>
      </div>
      <div class="sg-msg" id="sg-msg" hidden></div>
      <div class="sg-lista-tit">🔥 Mais curtidas</div>
      <div class="sg-lista"><div class="pr-vazio">Carregando…</div></div>
      <button class="btn-secondary" id="sg-fechar" style="width:100%;margin-top:10px">Fechar</button>
    </div>`;
  document.body.appendChild(ov);
  const fechar = trapModalBack(() => ov.remove());
  ov.querySelector('#sg-fechar').onclick = () => fechar();
  const msg = ov.querySelector('#sg-msg');
  const aviso = (txt, ok) => { msg.hidden = false; msg.className = `sg-msg ${ok ? 'ok' : 'erro'}`; msg.textContent = txt; };

  async function lista() {
    const el = ov.querySelector('.sg-lista');
    const [sugs, votos] = await Promise.all([fetchSugestoes(), meusVotos()]);
    if (!el.isConnected) return;
    el.innerHTML = sugs.length ? sugs.map(s => {
      const curti = votos.has(`${s.id}:curtir`), denunciei = votos.has(`${s.id}:denunciar`);
      const minha = s.user_id === uid;
      return `<div class="sg-item">
        <div class="sg-item-txt">${_esc(s.texto)}<small>por ${_esc(s.nome || 'Falcão')}</small></div>
        <button class="sg-curtir ${curti ? 'on' : ''}" data-curtir="${s.id}" data-on="${curti ? 1 : ''}">👍 ${s.curtidas || 0}</button>
        ${minha || admin ? `<button class="sg-mini" data-apagar="${s.id}" aria-label="Apagar">🗑</button>`
          : `<button class="sg-mini ${denunciei ? 'on' : ''}" data-denunciar="${s.id}" data-on="${denunciei ? 1 : ''}" aria-label="Denunciar">🚩</button>`}
      </div>`;
    }).join('') : '<div class="pr-vazio">Ainda não tem sugestão. Manda a primeira! 🦅</div>';
    el.querySelectorAll('[data-curtir]').forEach(b => b.onclick = async () => {
      b.disabled = true;
      try { await votar(b.dataset.curtir, 'curtir', !b.dataset.on); await lista(); } catch (e) { showToast(e.message, 'error'); b.disabled = false; }
    });
    el.querySelectorAll('[data-denunciar]').forEach(b => b.onclick = async () => {
      if (!b.dataset.on && !(await confirmModal({ title: 'Denunciar essa prenda?', message: 'Use se ela quebra as regras. Com 3 denúncias ela some do app.', confirmText: 'Denunciar', danger: true }))) return;
      try { await votar(b.dataset.denunciar, 'denunciar', !b.dataset.on); showToast(b.dataset.on ? 'Denúncia desfeita' : '🚩 Denúncia enviada. Valeu!', 'info'); await lista(); } catch (e) { showToast(e.message, 'error'); }
    });
    el.querySelectorAll('[data-apagar]').forEach(b => b.onclick = async () => {
      if (!(await confirmModal({ title: 'Apagar a sugestão?', message: 'Ela sai da lista pra todo mundo.', confirmText: 'Apagar', danger: true }))) return;
      try { await apagar(b.dataset.apagar); await lista(); } catch (e) { showToast(e.message, 'error'); }
    });
  }

  const go = ov.querySelector('#sg-go'), txt = ov.querySelector('#sg-txt');
  go.onclick = async () => {
    go.disabled = true; go.textContent = 'Conferindo…'; msg.hidden = true;
    const r = await sugerirPrenda(txt.value);
    go.disabled = false; go.textContent = 'Sugerir';
    if (r.ok) { txt.value = ''; aviso('✅ Aprovada! Já está na lista de prendas pra todo mundo.', true); await lista(); }
    else aviso(`❌ ${r.motivo}`, false);
  };
  lista();
}
