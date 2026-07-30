// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — IMPORTS + ESTADO
// BLOCO 2 — RENDER INLINE (histórico → nova medição), sem pop-up
// BLOCO 3 — NOVA MEDIÇÃO (medidas + fotos + % gordura)
// BLOCO 4 — WIRES
// ─────────────────────────────────────────────────────────────
import {
  getDadosCorpo, gorduraNavy, carregarRegistros, salvarRegistro,
  apagarRegistro, subirFotoCorpo, assinarFotos,
} from './corpo.js';
import { showToast, confirmModal } from './aviso-tela.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

const MEDIDAS = [
  { k: 'peso',        lbl: 'Peso',        un: 'kg' },
  { k: 'pescoco',     lbl: 'Pescoço',     un: 'cm', hint: '(p/ % de gordura)' },
  { k: 'peitoral',    lbl: 'Peitoral',    un: 'cm' },
  { k: 'cintura',     lbl: 'Cintura',     un: 'cm' },
  { k: 'quadril',     lbl: 'Quadril',     un: 'cm' },
  { k: 'braco',       lbl: 'Braço',       un: 'cm' },
  { k: 'coxa',        lbl: 'Coxa',        un: 'cm' },
  { k: 'panturrilha', lbl: 'Panturrilha', un: 'cm' },
];
const LADOS = [{ k: 'frente', lbl: 'Frente' }, { k: 'lado', lbl: 'Lado' }, { k: 'costas', lbl: 'Costas' }];

let dados = { sexo: null, alturaCm: null, pesoKg: null };
let registros = [];
let urls = new Map();       // path -> signed url
let novo = null;            // { medidas:{}, fotos:{frente,lado,costas} }
let carregado = false;

const box = () => document.getElementById('cp-inline');

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: RENDER INLINE
// ═══════════════════════════════════════════════════════════════
// Chamado quando o card "Cálculo de Massa Corporal" abre. Carrega 1x.
export async function montarComposicao() {
  const c = box(); if (!c) return;
  if (carregado) { desenhar(); return; }
  c.innerHTML = `<div class="cp-carregando">Carregando…</div>`;
  try {
    dados = await getDadosCorpo();
    registros = await carregarRegistros();
    await assinar();
    carregado = true;
    novo = null;
    desenhar();
  } catch (e) {
    c.innerHTML = `<div class="cp-vazio">Não deu pra carregar: ${esc(e.message)}</div>`;
  }
}
// Abre DIRETO no formulário quando pode medir; quando já mediu, mostra o card
// travado (libera 3 meses depois). O histórico fica sempre abaixo.
const DIAS_TRAVA = 90;
function podeNovaMedicao() {
  if (!registros.length) return true;
  const ultima = new Date(registros[0].data + 'T00:00:00').getTime();
  return Math.floor((Date.now() - ultima) / 86400000) >= DIAS_TRAVA;
}
function diasParaLiberar() {
  if (!registros.length) return 0;
  const ultima = new Date(registros[0].data + 'T00:00:00').getTime();
  return Math.max(0, DIAS_TRAVA - Math.floor((Date.now() - ultima) / 86400000));
}

function desenhar() {
  const c = box(); if (!c) return;
  const pode = podeNovaMedicao();
  if (pode) { if (!novo) novo = { medidas: {}, fotos: {} }; } else { novo = null; }
  c.innerHTML = telaPrincipal(pode);
  if (pode) atualizarGordura();
}
async function assinar() {
  const paths = registros.flatMap(r => [r.foto_frente, r.foto_lado, r.foto_costas]);
  urls = await assinarFotos(paths);
}
function faltaBase() { return !dados.sexo || !dados.alturaCm; }

function telaPrincipal(pode) {
  return `
    <div class="cp-intro">Preencha as medidas e adicione as fotos. Nova medição a cada <b>3 meses</b> pra ver a evolução.</div>
    ${faltaBase() ? `<div class="cp-alerta">Preencha <b>sexo</b> e <b>altura</b> ali em cima (Meu perfil) pra calcular o % de gordura.</div>` : ''}
    ${pode ? formHtml() : bloqueadoHtml()}
    ${historicoHtml()}`;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: NOVA MEDIÇÃO (formulário) + travado + histórico
// ═══════════════════════════════════════════════════════════════
function formHtml() {
  return `
    <div class="cp-medidas">
      ${MEDIDAS.map(m => `
        <label class="cp-campo">
          <span class="cp-campo-lbl">${m.lbl} ${m.hint ? `<small>${m.hint}</small>` : ''}</span>
          <span class="cp-campo-in">
            <input type="number" inputmode="decimal" step="0.1" min="0" data-medida="${m.k}"
              value="${novo.medidas[m.k] ?? ''}" placeholder="0" />
            <em>${m.un}</em>
          </span>
        </label>`).join('')}
    </div>

    <div class="cp-gordura" id="cp-gordura"></div>

    <div class="cp-secao-tit">Fotos de progresso</div>
    <div class="cp-foto-dica">📸 Tire <b>de frente pro espelho</b>, num lugar <b>bem iluminado</b> — assim dá pra comparar a evolução com clareza.</div>
    <div class="cp-fotos">
      ${LADOS.map(l => `
        <button type="button" class="cp-foto-slot" data-foto="${l.k}">
          ${novo.fotos[l.k]?.previa
            ? `<img src="${esc(novo.fotos[l.k].previa)}" alt="${l.lbl}" />`
            : `<span class="cp-foto-mais">＋</span>`}
          <span class="cp-foto-lbl">${l.lbl}</span>
        </button>`).join('')}
    </div>
    <input type="file" id="cp-foto-arq" accept="image/*" hidden />

    <button class="cp-salvar" data-salvar>Salvar medição</button>`;
}

function bloqueadoHtml() {
  const dias = diasParaLiberar();
  const ultima = registros.length ? new Date(registros[0].data + 'T00:00:00').toLocaleDateString([], { day: '2-digit', month: 'short' }) : '';
  const d = `${dias} ${dias === 1 ? 'dia' : 'dias'}`;
  return `
    <div class="cp-bloqueado">
      <span class="cp-bloq-ic">⏳</span>
      <span>Você registrou em <b>${ultima}</b>. A próxima medição libera em <b>${d}</b> — a cada 3 meses, pra dar tempo de ver evolução real.</span>
    </div>
    <button class="cp-salvar" disabled>🔒 Nova medição em ${d}</button>`;
}

function historicoHtml() {
  if (!registros.length) return '';
  const linhas = registros.map(r => {
    const dt = new Date(r.data + 'T00:00:00').toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
    const fotos = [r.foto_frente, r.foto_lado, r.foto_costas].filter(Boolean);
    return `
      <div class="cp-reg" data-reg="${r.id}">
        <div class="cp-reg-cab">
          <span class="cp-reg-data">${dt}</span>
          ${r.gordura_pct != null ? `<span class="cp-reg-bf">${r.gordura_pct}% gordura</span>` : ''}
          <button class="cp-reg-x" data-apagar="${r.id}" aria-label="Apagar">🗑</button>
        </div>
        <div class="cp-reg-medidas">
          ${MEDIDAS.filter(m => r[m.k] != null).map(m => `<span>${m.lbl}: <b>${r[m.k]}${m.un}</b></span>`).join('')}
        </div>
        ${fotos.length ? `<div class="cp-reg-fotos">${fotos.map(p => urls.get(p)
          ? `<img src="${esc(urls.get(p))}" alt="foto" loading="lazy" />` : '').join('')}</div>` : ''}
      </div>`;
  }).join('');
  return `<div class="cp-secao-tit">Histórico</div>${linhas}`;
}

function atualizarGordura() {
  const el = document.getElementById('cp-gordura');
  if (!el) return;
  const pct = gorduraNavy({ sexo: dados.sexo, alturaCm: dados.alturaCm, pescoco: novo.medidas.pescoco, cintura: novo.medidas.cintura, quadril: novo.medidas.quadril });
  if (pct != null) { el.innerHTML = `<span class="cp-bf-ok">🔬 % de gordura estimado: <b>${pct}%</b></span>`; return; }
  const falta = faltaBase() ? 'sexo e altura (no Meu perfil)'
    : (dados.sexo === 'F' ? 'pescoço, cintura e quadril' : 'pescoço e cintura');
  el.innerHTML = `<span class="cp-bf-hint">Preencha ${falta} pra estimar o % de gordura.</span>`;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: WIRES
// ═══════════════════════════════════════════════════════════════
let ligado = false, ladoAtivo = null;
export function ligarComposicao() {
  if (ligado) return; ligado = true;

  document.addEventListener('click', async (e) => {
    if (!e.target.closest('#cp-inline')) return;

    const ap = e.target.closest('[data-apagar]');
    if (ap) { await apagarUI(ap.dataset.apagar); return; }

    const slot = e.target.closest('[data-foto]');
    if (slot) { ladoAtivo = slot.dataset.foto; document.getElementById('cp-foto-arq')?.click(); return; }

    if (e.target.closest('[data-salvar]')) { await salvar(); return; }
  });

  document.addEventListener('input', (e) => {
    const inp = e.target.closest('#cp-inline [data-medida]');
    if (!inp || !novo) return;
    const v = inp.value.trim();
    novo.medidas[inp.dataset.medida] = v === '' ? null : parseFloat(v);
    atualizarGordura();
  });

  document.addEventListener('change', async (e) => {
    if (e.target.id !== 'cp-foto-arq' || !novo || !ladoAtivo) return;
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try {
      const blob = await reduzir(f);
      novo.fotos[ladoAtivo] = { blob, previa: URL.createObjectURL(blob) };
      desenhar();
    } catch (err) { showToast('Não deu pra abrir a foto.', 'error'); }
  });
}

async function apagarUI(id) {
  const ok = await confirmModal({ title: 'Apagar esta medição?', message: 'A medição e as fotos dela serão removidas.', confirmText: 'Apagar', cancelText: 'Manter', danger: true });
  if (!ok) return;
  registros = registros.filter(r => r.id !== id); desenhar();
  try { await apagarRegistro(id); } catch (e) { showToast(e.message, 'error'); }
}

async function salvar() {
  const btn = document.querySelector('#cp-inline [data-salvar]');
  const temMedida = MEDIDAS.some(m => novo.medidas[m.k] != null);
  const temFoto = LADOS.some(l => novo.fotos[l.k]?.blob);
  if (!temMedida && !temFoto) { showToast('Preencha ao menos uma medida ou foto.', 'info'); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }
  try {
    const fotos = {};
    for (const l of LADOS) {
      if (novo.fotos[l.k]?.blob) fotos[l.k] = await subirFotoCorpo(novo.fotos[l.k].blob, l.k);
    }
    const pct = gorduraNavy({ sexo: dados.sexo, alturaCm: dados.alturaCm, pescoco: novo.medidas.pescoco, cintura: novo.medidas.cintura, quadril: novo.medidas.quadril });
    const row = await salvarRegistro({ medidas: novo.medidas, gorduraPct: pct, fotos });
    registros.unshift(row);
    await assinar();
    novo = null;
    desenhar();
    showToast('✅ Medição registrada!', 'success');
  } catch (e) {
    showToast('Erro ao salvar: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Salvar medição'; }
  }
}

// Reduz a foto antes de subir (fotos são permanentes; economiza espaço/banda).
async function reduzir(file, max = 1280) {
  const img = await createImageBitmap(file);
  const escala = Math.min(1, max / Math.max(img.width, img.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(img.width * escala); cv.height = Math.round(img.height * escala);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  return new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('falha')), 'image/jpeg', 0.85));
}
