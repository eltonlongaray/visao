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
  { k: 'pescoco',     lbl: 'Pescoço',     un: 'cm' },
  { k: 'ombro',       lbl: 'Ombro',       un: 'cm' },
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
const br = (n) => String(n).replace('.', ',');

// Do % de gordura + peso saem os kg de gordura e de massa magra (e o % magra).
function composicao(peso, bf) {
  const p = Number(peso), g = Number(bf);
  if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(g)) return null;
  const fatKg = Math.round(p * g / 100 * 10) / 10;
  const leanKg = Math.round((p - fatKg) * 10) / 10;
  const leanPct = Math.round((100 - g) * 10) / 10;
  return { fatKg, leanKg, leanPct };
}
// "Gordura X% (Z kg) · Massa magra Y% (W kg)" — ou só o % se faltar o peso.
function textoComposicao(peso, bf) {
  if (bf == null) return '';
  const c = composicao(peso, bf);
  if (!c) return `Gordura <b>${bf}%</b>`;
  return `Gordura <b>${bf}%</b> (${br(c.fatKg)} kg) · Massa magra <b>${c.leanPct}%</b> (${br(c.leanKg)} kg)`;
}

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
// travado (libera 1 mês depois). O histórico fica sempre abaixo. Mensal (não
// trimestral) pra pegar mudança cedo e dar dica antes de sair do controle.
const DIAS_TRAVA = 30;
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
    <div class="cp-intro">Preencha as medidas e adicione 3 fotos. Atualize <b>uma vez por mês</b> para acompanhar sua evolução e receber dicas.</div>
    <div class="cp-dicas">
      <b>Pra medir certo:</b>
      <span>① Sempre de <b>manhã</b>, em jejum, depois do banheiro.</span>
      <span>② <b>Sem sugar a barriga</b> — respira normal e mede.</span>
      <span>③ Mede <b>1x por mês</b> e atualiza aqui.</span>
    </div>
    ${faltaBase() ? `<div class="cp-alerta">Preencha <b>sexo</b> e <b>altura</b> ali em cima (Meu perfil) pra calcular o % de gordura.</div>` : ''}
    ${dicaVO()}
    ${pode ? formHtml() : bloqueadoHtml()}
    ${historicoHtml()}`;
}

// Índice cintura ÷ ombro comparando as 2 medições mais recentes: caindo = mais
// V (músculo), subindo = mais O (gordura no meio). Só aparece com 2 registros.
function dicaVO() {
  const c = registros.filter(r => r.cintura && r.ombro);
  if (c.length < 2) return '';
  const rA = c[0].cintura / c[0].ombro, rB = c[1].cintura / c[1].ombro;
  const dif = rA - rB;
  if (Math.abs(dif) < 0.005) return `<div class="cp-vo cp-vo-neutro">➖ Cintura ÷ ombro estável (${rA.toFixed(2)}) — mantendo a forma.</div>`;
  if (dif < 0) return `<div class="cp-vo cp-vo-bom">🔺 Cintura ÷ ombro caiu (${rB.toFixed(2)} → ${rA.toFixed(2)}) — você está ficando mais em <b>V</b>: mais músculo, menos gordura no meio. 💪</div>`;
  return `<div class="cp-vo cp-vo-alerta">⭕ Cintura ÷ ombro subiu (${rB.toFixed(2)} → ${rA.toFixed(2)}) — atenção: pode estar ganhando gordura no meio (formato <b>O</b>). Foco na dieta e no treino.</div>`;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: NOVA MEDIÇÃO (formulário) + travado + histórico
// ═══════════════════════════════════════════════════════════════
function formHtml() {
  const roupa = dados.sexo === 'F' ? 'Fique de <b>top e short</b>'
    : dados.sexo === 'M' ? 'Fique <b>sem camisa e de calção curto</b>'
    : 'Homens <b>sem camisa e de calção</b>, mulheres de <b>top e short</b>';
  return `
    <div class="cp-form-corpo">
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
      <div class="cp-avatar" aria-hidden="true">${AVATAR_SVG}</div>
    </div>

    <div class="cp-gordura" id="cp-gordura"></div>

    <div class="cp-secao-tit">Fotos de progresso</div>
    <div class="cp-foto-dica">📸 Tire <b>de frente pro espelho</b> ou peça pra <b>alguém te fotografar</b>, num lugar <b>bem iluminado</b>. ${roupa} — assim dá pra comparar a evolução com clareza.</div>
    <div class="cp-fotos">
      ${LADOS.map(l => `
        <button type="button" class="cp-foto-slot" data-foto="${l.k}">
          ${novo.fotos[l.k]?.previa
            ? `<img src="${esc(novo.fotos[l.k].previa)}" alt="${l.lbl}" />`
            : `<span class="cp-foto-mais">＋</span>`}
          <span class="cp-foto-lbl">${l.lbl}</span>
        </button>`).join('')}
    </div>
    <input type="file" id="cp-foto-cam" accept="image/*" capture="environment" hidden />
    <input type="file" id="cp-foto-gal" accept="image/*" hidden />

    <button class="cp-salvar" data-salvar>Salvar medição</button>`;
}

// Avatar: homem (frente) em cima, mulher (perfil, com curvas) embaixo. A fita
// métrica é um LAÇO em volta de cada parte — deixa claro que se mede a volta de
// CADA membro individual. Cintura marcada no umbigo (pontinho).
const TAPE = '#e0a325';   // cor de fita métrica
// laço de fita: elipse (frente sólida) + arco de trás pontilhado = "dá a volta"
function _laco(cx, cy, rx, ry) {
  return `<g stroke="${TAPE}" fill="none" stroke-width="2">
    <path d="M${cx - rx} ${cy} a ${rx} ${ry} 0 0 0 ${rx * 2} 0" stroke-dasharray="2 2.4" opacity="0.65"/>
    <path d="M${cx - rx} ${cy} a ${rx} ${ry} 0 0 1 ${rx * 2} 0"/>
  </g>`;
}
const FIG_HOMEM = `
  <svg viewBox="0 0 120 210" xmlns="http://www.w3.org/2000/svg">
    <g fill="currentColor" opacity="0.20">
      <circle cx="60" cy="18" r="13"/>
      <path d="M55 31 h10 v7 h-2 l14 6 q10 5 11 18 l3 22 h-9 l-3 -20 -1 26 -3 42 h-8 l-2 -38 -2 38 h-8 l-3 -42 -1 -26 -3 20 h-9 l3 -22 q1 -13 11 -18 l14 -6 h-2 z"/>
      <path d="M46 84 h28 l-2 24 -4 55 q-2 8 -8 8 t-8 -8 l-4 -55 z"/>
    </g>
    ${_laco(60, 36, 8, 3)}
    ${_laco(60, 58, 20, 5)}
    ${_laco(34, 66, 8, 3)}
    ${_laco(60, 96, 15, 4.5)}
    ${_laco(60, 110, 17, 5)}
    ${_laco(52, 140, 8.5, 3.5)}
    ${_laco(52, 185, 6.5, 3)}
    <circle cx="60" cy="96" r="1.6" fill="${TAPE}"/>
  </svg>`;
const FIG_MULHER = `
  <svg viewBox="0 0 120 210" xmlns="http://www.w3.org/2000/svg">
    <g fill="currentColor" opacity="0.20">
      <circle cx="52" cy="18" r="12"/>
      <path d="M52 30
        q6 2 7 10 q1 8 8 12 q9 6 8 15 q-1 7 -9 9 q-8 2 -10 12
        q-2 10 10 15 q14 6 14 18 q0 12 -14 14 q-10 2 -12 12
        l-4 40 q-1 7 -7 7 t-6 -7 l2 -46
        q1 -22 -2 -40 q-2 -14 3 -30 q4 -14 2 -28 q-1 -10 6 -15 z"/>
    </g>
    ${_laco(55, 74, 14, 4.5)}
    ${_laco(52, 96, 12, 4)}
    ${_laco(56, 118, 18, 5.5)}
    ${_laco(46, 150, 9, 3.5)}
    ${_laco(44, 188, 6.5, 3)}
    <circle cx="52" cy="96" r="1.6" fill="${TAPE}"/>
  </svg>`;
const AVATAR_SVG = `
  <div class="cp-fig">${FIG_HOMEM}<span class="cp-fig-lbl">Homem</span></div>
  <div class="cp-fig">${FIG_MULHER}<span class="cp-fig-lbl">Mulher</span></div>`;

function bloqueadoHtml() {
  const dias = diasParaLiberar();
  const ultima = registros.length ? new Date(registros[0].data + 'T00:00:00').toLocaleDateString([], { day: '2-digit', month: 'short' }) : '';
  const d = `${dias} ${dias === 1 ? 'dia' : 'dias'}`;
  return `
    <div class="cp-bloqueado">
      <span class="cp-bloq-ic">⏳</span>
      <span>Você registrou em <b>${ultima}</b>. A próxima medição libera em <b>${d}</b> — 1x por mês pra acompanhar de perto.</span>
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
          <button class="cp-reg-x" data-apagar="${r.id}" aria-label="Apagar">🗑</button>
        </div>
        ${r.gordura_pct != null ? `<div class="cp-reg-comp">🔬 ${textoComposicao(r.peso, r.gordura_pct)}</div>` : ''}
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
  if (pct != null) {
    const semPeso = !novo.medidas.peso ? ' <small>(preencha o peso pra ver em kg)</small>' : '';
    el.innerHTML = `<span class="cp-bf-ok">🔬 ${textoComposicao(novo.medidas.peso, pct)}${semPeso}</span>`;
    return;
  }
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
    if (slot) {
      ladoAtivo = slot.dataset.foto;
      const op = await escolherFoto();
      if (op === 'camera') document.getElementById('cp-foto-cam')?.click();
      else if (op === 'galeria') document.getElementById('cp-foto-gal')?.click();
      return;
    }

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
    if ((e.target.id !== 'cp-foto-cam' && e.target.id !== 'cp-foto-gal') || !novo || !ladoAtivo) return;
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

// Ao tocar num slot: escolhe câmera (abre a câmera) ou galeria. Resolve com
// 'camera' | 'galeria' | null.
function escolherFoto() {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'cp-escolha-ov';
    ov.innerHTML = `
      <div class="cp-escolha">
        <div class="cp-escolha-tit">Foto de progresso</div>
        <button type="button" class="cp-escolha-op" data-op="camera">📷 Tirar foto agora</button>
        <button type="button" class="cp-escolha-op" data-op="galeria">🖼️ Escolher da galeria</button>
        <button type="button" class="cp-escolha-cancel" data-op="">Cancelar</button>
      </div>`;
    document.body.appendChild(ov);
    const fim = (v) => { ov.remove(); resolve(v); };
    ov.addEventListener('click', (e) => {
      if (e.target === ov) return fim(null);
      const b = e.target.closest('[data-op]');
      if (b) fim(b.dataset.op || null);
    });
  });
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
