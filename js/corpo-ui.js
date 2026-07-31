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

// Bloco de status: última medição + quando liberam as próximas medidas (mensal)
// e fotos (trimestral).
function statusHtml() {
  if (!registros.length) return '';
  const fmt = (dt) => dt.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
  const dataTxt = (dt) => dt.getTime() <= Date.now() ? 'disponível agora' : fmt(dt);
  const ultima = new Date(registros[0].data + 'T00:00:00');
  const proxMedida = new Date(ultima.getTime() + 30 * 86400000);
  const comFoto = registros.find(r => r.foto_frente || r.foto_lado || r.foto_costas);
  const linhaFoto = comFoto
    ? `<div><span>Próximas fotos:</span> <b>${dataTxt(new Date(new Date(comFoto.data + 'T00:00:00').getTime() + 90 * 86400000))}</b></div>`
    : `<div><span>Fotos:</span> <b>tire as primeiras</b></div>`;
  return `<div class="cp-status">
    <div><span>Última medição:</span> <b>${fmt(ultima)}</b></div>
    <div><span>Próximas medidas:</span> <b>${dataTxt(proxMedida)}</b></div>
    ${linhaFoto}
  </div>`;
}

function desenhar() {
  const c = box(); if (!c) return;
  const pode = podeNovaMedicao();
  if (pode) {
    if (!novo) novo = { medidas: {}, fotos: {} };
    // Puxa o peso do perfil como sugestão (a pessoa não atualiza em 2 lugares —
    // salvar a medição também grava o peso no perfil).
    if (novo.medidas.peso == null && dados.pesoKg) novo.medidas.peso = dados.pesoKg;
    // Pescoço muda pouco (só com grande variação de peso). Carrega o da última
    // medição pra não remedir todo mês.
    if (novo.medidas.pescoco == null) {
      const ult = registros.find(r => r.pescoco != null);
      if (ult) novo.medidas.pescoco = ult.pescoco;
    }
  } else { novo = null; }
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
    <div class="cp-intro">Meça <b>uma vez por mês</b> pra acompanhar os números e receber dicas. As <b>fotos</b> você tira a cada <b>3 meses</b>.</div>
    <div class="cp-dicas">
      <b>Pra medir certo:</b>
      <span>① Sempre de <b>manhã</b>, em jejum, depois do banheiro.</span>
      <span>② <b>Sem sugar a barriga</b> — respira normal e mede.</span>
      <span>③ Mede <b>1x por mês</b> e atualiza aqui.</span>
      <span>④ Sem fita métrica? Usa um <b>barbante</b>: dá a volta, marca com o dedo e mede o barbante numa régua.</span>
    </div>
    ${statusHtml()}
    ${faltaBase() ? `<div class="cp-alerta">Preencha <b>sexo</b> e <b>altura</b> ali em cima (Meu perfil) pra calcular o % de gordura.</div>` : ''}
    ${analiseHtml()}
    ${pode ? formHtml() : bloqueadoHtml()}
    ${historicoHtml()}`;
}

// ── ANÁLISE (3 blocos): músculo×gordura · saúde · pump ──
const _1 = (x) => (Math.round(x * 10) / 10).toString().replace('.', ',');
const _sinal = (x) => (x >= 0 ? '+' : '') + _1(x);
function _comp(peso, bf) {
  if (!peso || bf == null) return null;
  const gorda = peso * bf / 100;
  return { gorda, magra: peso - gorda };
}

// Bloco 1 — ganhou músculo ou gordura (vs mês passado)
function _blocoMusculo(r, ant) {
  const a = _comp(r.peso, r.gordura_pct);
  if (!a) return '';
  const b = ant && _comp(ant.peso, ant.gordura_pct);
  if (!b) return `<div class="cp-an cp-an-neutro"><b>Composição:</b> ${_1(a.magra)} kg de massa magra · ${_1(a.gorda)} kg de gordura. <span class="cp-an-hint">Registre no mês que vem pra ver a evolução.</span></div>`;
  const dM = a.magra - b.magra, dG = a.gorda - b.gorda;
  let cls, msg;
  if (dM > 0.1 && dG < -0.1) { cls = 'bom'; msg = '🔥 Recomposição! Ganhou músculo e perdeu gordura.'; }
  else if (dM > 0.1) { cls = 'bom'; msg = '💪 Ganhou músculo.'; }
  else if (dG > 0.1 && dM <= 0.1) { cls = 'alerta'; msg = '⚠️ Ganhou gordura. Ajusta dieta e treino.'; }
  else if (dM < -0.1 && dG < -0.1) { cls = 'neutro'; msg = 'Perdeu peso — parte gordura, parte músculo. Capricha na proteína.'; }
  else { cls = 'neutro'; msg = 'Sem grande mudança este mês.'; }
  return `<div class="cp-an cp-an-${cls}">${msg}<br><small>Massa magra ${_sinal(dM)} kg · Gordura ${_sinal(dG)} kg (vs mês passado)</small></div>`;
}

// Bloco 2 — corpo saudável (%gordura + cintura/altura)
function _blocoSaude(r) {
  let out = '';
  if (r.gordura_pct != null && dados.sexo) {
    const lim = dados.sexo === 'F' ? 28 : 20;
    const ok = r.gordura_pct <= lim;
    const falta = ok ? '' : ` — falta baixar <b>${_1(r.gordura_pct - lim)}%</b>`;
    out += `<div class="cp-an cp-an-${ok ? 'bom' : 'alerta'}">${ok ? '✅' : '⚠️'} Gordura <b>${r.gordura_pct}%</b> — ${ok ? 'na faixa saudável' : `ideal até ${lim}%${falta}`}.</div>`;
  }
  if (r.cintura && dados.alturaCm) {
    const razao = r.cintura / dados.alturaCm;
    const alvo = Math.round(dados.alturaCm * 0.5);
    const ok = razao < 0.5;
    const falta = ok ? '' : ` — reduza <b>${_1(r.cintura - alvo)} cm</b>`;
    out += `<div class="cp-an cp-an-${ok ? 'bom' : 'alerta'}">${ok ? '✅' : '⚠️'} Cintura <b>${r.cintura} cm</b> — ${ok ? 'saudável' : `ideal < ${alvo} cm${falta}`}. <small>cintura/altura ${razao.toFixed(2)} · ideal < 0,50</small></div>`;
  }
  return out;
}

// Bloco 3 — nível de shape / Pump (ratio principal por sexo + pernas de apoio)
function _blocoPump(r, ant) {
  const isF = dados.sexo === 'F';
  let ratio, membro, membroNome, niveis;
  if (isF) {
    if (!r.quadril || !r.cintura) return '';
    membro = r.quadril; membroNome = 'glúteo'; ratio = r.quadril / r.cintura; niveis = [1.3, 1.4, 1.5];
  } else {
    if (!r.ombro || !r.cintura) return '';
    membro = r.ombro; membroNome = 'ombro'; ratio = r.ombro / r.cintura; niveis = [1.4, 1.5, 1.618];
  }
  const rotulo = `${membroNome.charAt(0).toUpperCase() + membroNome.slice(1)} ÷ cintura`;
  let nivel = 0; niveis.forEach((n, i) => { if (ratio >= n) nivel = i + 1; });
  const acima = ratio >= niveis[2];
  let txt;
  if (acima) txt = `🏆 <b>Nível fisiculturismo</b> · ${rotulo} = ${ratio.toFixed(2)}`;
  else if (nivel === 0) txt = `Shape em construção · ${rotulo} = ${ratio.toFixed(2)} <small>(Pump Nível 1 = ${_1(niveis[0])})</small>`;
  else txt = `🏆 <b>Pump Nível ${nivel}</b> · ${rotulo} = ${ratio.toFixed(2)}`;
  let falta = '';
  if (!acima && nivel < 3) {
    const prox = niveis[nivel];
    const dMembro = Math.max(0, r.cintura * prox - membro);      // só engrossar o membro
    const dCint = Math.max(0, r.cintura - membro / prox);         // só afinar a cintura
    // mix: metade do ganho no membro, o resto sai da cintura
    const membroMix = membro + dMembro / 2;
    const dMembroMix = membroMix - membro;
    const dCintMix = r.cintura - membroMix / prox;
    falta = `<br><small>Pro <b>Pump Nível ${nivel + 1}</b>: +${_1(dMembro)} cm de ${membroNome}, <b>OU</b> −${_1(dCint)} cm de cintura, <b>OU</b> um mix (+${_1(dMembroMix)} cm de ${membroNome} e −${_1(dCintMix)} cm de cintura).</small>`;
  }
  // Pernas: alvo proporcional ao membro-âncora (glúteo/ombro), pra não ficar desproporcional.
  // Cada perna com seu próprio tamanho — só ancorada na mesma referência.
  let pernas = '';
  if (r.coxa || r.panturrilha) {
    const RC = isF ? 0.60 : 0.50;   // coxa como fração do glúteo (F) / ombro (M)
    const RP = isF ? 0.38 : 0.33;   // panturrilha, idem
    const l = [];
    const add = (nome, val, prev, ratio) => {
      if (!val) return;
      const alvo = Math.round(membro * ratio);
      const d = alvo - val;
      const evo = prev != null && prev !== val ? ` <small>(${_sinal(val - prev)} cm)</small>` : '';
      const st = d > 1 ? `<b>faltam ${_1(d)} cm</b>` : '✓';
      l.push(`${nome} ${val} cm${evo} → alvo ~${alvo} cm ${st}`);
    };
    add('Coxa', r.coxa, ant?.coxa, RC);
    add('Panturrilha', r.panturrilha, ant?.panturrilha, RP);
    pernas = `<br><small>Pernas <span style="opacity:.65">(proporção c/ o ${membroNome} atual)</span>: ${l.join(' · ')}</small>`;
  }
  return `<div class="cp-an cp-an-pump">${txt}${falta}${pernas}</div>`;
}

function analiseHtml() {
  if (!registros.length) return '';
  const r = registros[0], ant = registros[1];
  const blocos = _blocoMusculo(r, ant) + _blocoSaude(r) + _blocoPump(r, ant);
  if (!blocos.trim()) return '';
  return `<div class="cp-analise"><div class="cp-analise-tit">📊 Sua análise</div>${blocos}</div>`;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: NOVA MEDIÇÃO (formulário) + travado + histórico
// ═══════════════════════════════════════════════════════════════
function formHtml() {
  const roupa = dados.sexo === 'F' ? 'Fique de <b>top e short</b>'
    : dados.sexo === 'M' ? 'Fique <b>sem camisa e de calção curto</b>'
    : 'Homens <b>sem camisa e de calção</b>, mulheres de <b>top e short</b>';
  // Pescoço: some depois de preenchido, a não ser que a pessoa esteja bem acima
  // do peso (IMC ≥ 30) — aí o pescoço muda com a perda e vale remedir.
  const h = (Number(dados.alturaCm) || 0) / 100;
  const imc = (Number(dados.pesoKg) && h) ? Number(dados.pesoKg) / (h * h) : 0;
  const acimaPeso = imc >= 30;
  const medidasVis = MEDIDAS.filter(m => !(m.k === 'pescoco' && novo.medidas.pescoco != null && !acimaPeso));
  return `
    <div class="cp-form-corpo">
      <div class="cp-medidas">
        ${medidasVis.map(m => `
          <label class="cp-campo">
            <span class="cp-campo-lbl">${m.lbl} ${m.hint ? `<small>${m.hint}</small>` : ''}</span>
            <span class="cp-campo-in">
              <input type="number" inputmode="decimal" step="0.1" min="0" data-medida="${m.k}"
                value="${novo.medidas[m.k] ?? ''}" placeholder="0" />
              <em>${m.un}</em>
            </span>
          </label>`).join('')}
      </div>
      <div class="cp-avatar">${avatarHtml()}</div>
    </div>

    <div class="cp-gordura" id="cp-gordura"></div>

    <div class="cp-secao-tit">Fotos de progresso</div>
    <div class="cp-secao-sub">A cada 3 meses.</div>
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

// Avatar: as ilustrações reais (frente + lado), conforme o sexo do perfil.
// Mulher no perfil feminino, homem no masculino (padrão homem se não definido).
function avatarHtml() {
  const dir = dados.sexo === 'F' ? 'mulher' : 'homem';
  return `
    <div class="cp-fig"><img src="img/corpo/${dir}-frente.png" alt="Frente" loading="lazy" /></div>
    <div class="cp-fig"><img src="img/corpo/${dir}-lado.png" alt="Lado" loading="lazy" /></div>`;
}

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
          ${MEDIDAS.filter(m => r[m.k] != null).map(m => {
            const lbl = (m.k === 'quadril' && dados.sexo === 'F') ? 'Glúteo' : m.lbl;
            return `<span>${lbl}: <b>${r[m.k]}${m.un}</b></span>`;
          }).join('')}
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
  el.innerHTML = '';   // sem os dados pra calcular ainda: não mostra nada
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
