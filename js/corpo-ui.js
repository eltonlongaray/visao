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
import { getProfile } from './banco-dados.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

const MEDIDAS = [
  { k: 'peso',        lbl: 'Peso',        un: 'kg' },
  { k: 'pescoco',     lbl: 'Pescoço',     un: 'cm' },
  { k: 'ombro',       lbl: 'Ombro',       un: 'cm' },
  { k: 'peitoral',    lbl: 'Peitoral',    un: 'cm' },
  { k: 'cintura',     lbl: 'Cintura',     un: 'cm' },
  { k: 'quadril',     lbl: 'Quadril',     un: 'cm' },
  { k: 'braco',       lbl: 'Braço (músculo flexionado)', un: 'cm' },
  { k: 'coxa',        lbl: 'Coxa',        un: 'cm' },
  { k: 'panturrilha', lbl: 'Panturrilha', un: 'cm' },
];
// 6 fotos: quadril PRA CIMA (tronco) e quadril PRA BAIXO (bunda/coxa/panturrilha),
// em frente/lado/costas. `molde` = qual avatar guia; `crop` = enquadra tronco/pernas.
const LADOS = [
  { k: 'frente_cima',  lbl: 'Frente ↑', molde: 'frente', crop: 'cima'  },
  { k: 'lado_cima',    lbl: 'Lado ↑',   molde: 'lado',   crop: 'cima'  },
  { k: 'costas_cima',  lbl: 'Costas ↑', molde: 'frente', crop: 'cima'  },
  { k: 'frente_baixo', lbl: 'Frente ↓', molde: 'frente', crop: 'baixo' },
  { k: 'lado_baixo',   lbl: 'Lado ↓',   molde: 'lado',   crop: 'baixo' },
  { k: 'costas_baixo', lbl: 'Costas ↓', molde: 'frente', crop: 'baixo' },
];

let dados = { sexo: null, alturaCm: null, pesoKg: null };
let ehAdmin = false;   // admin ignora a trava de 30 dias (pra testar à vontade)
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
    try { ehAdmin = !!(await getProfile())?.isAdmin; } catch {}
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
  if (ehAdmin) return true;   // admin sem trava (testes)
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
  const comFoto = registros.find(r => r.fotos && Object.values(r.fotos).some(Boolean));
  const linhaFoto = comFoto
    ? `<div><span>Próximas fotos:</span> <b>${dataTxt(proxMedida)}</b> <small>(junto com a medição)</small></div>`
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
  } else { novo = null; }   // travado: nada de editar (medida + fotos são um bloco)
  c.innerHTML = telaPrincipal(pode);
  if (pode) atualizarGordura();
}
async function assinar() {
  const paths = registros.flatMap(r => r.fotos ? Object.values(r.fotos).filter(Boolean) : []);
  urls = await assinarFotos(paths);
}
function faltaBase() { return !dados.sexo || !dados.alturaCm; }

function telaPrincipal(pode) {
  return `
    <div class="cp-intro">Meça <b>uma vez por mês</b> pra acompanhar os números e receber dicas. Tire as <b>fotos junto</b>, todo mês, pra ver a evolução de perto.</div>
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
    // Quanto em GRAMAS/kg falta perder de gordura pra chegar no ideal, mantendo o
    // músculo (massa magra fixa) — deixa o "0,8%" concreto.
    let gramas = '';
    if (!ok && r.peso) {
      const magra   = r.peso * (1 - r.gordura_pct / 100);
      const gordAgora = r.peso - magra;
      const gordAlvo  = magra * (lim / 100) / (1 - lim / 100);   // gordura no % ideal
      const perder    = Math.max(0, gordAgora - gordAlvo);
      const perderTxt = perder >= 1 ? `${_1(perder)} kg` : `${Math.round(perder * 1000)} g`;
      gramas = ` <span style="opacity:.85">(≈ <b>${perderTxt}</b> de gordura)</span>`;
    }
    const falta = ok ? '' : ` — falta baixar <b>${_1(r.gordura_pct - lim)}%</b>${gramas}`;
    // Só pouco acima do ideal (até 5%): se está em bulk, não é hora de secar.
    const notaBulk = (!ok && (r.gordura_pct - lim) <= 5)
      ? `<br><small style="opacity:.82">(Se você está em <b>fase de crescimento muscular</b>, não se preocupe em perder essa gordura agora — só mantenha moderada, fortalecendo o abdômen e fazendo cardio semanalmente sem exageros.)</small>`
      : '';
    out += `<div class="cp-an cp-an-${ok ? 'bom' : 'alerta'}">${ok ? '✅' : '⚠️'} Gordura <b>${r.gordura_pct}%</b> — ${ok ? 'na faixa saudável' : `ideal até ${lim}%${falta}`}.${notaBulk}</div>`;
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
    // Glúteo ÷ cintura — ladder feminino sobe até o palco (bikini/wellness).
    // A mulher carrega mais quadril que o homem, então os níveis são mais altos.
    if (!r.quadril || !r.cintura) return '';
    membro = r.quadril; membroNome = 'glúteo'; ratio = r.quadril / r.cintura; niveis = [1.4, 1.5, 1.6];
  } else {
    if (!r.ombro || !r.cintura) return '';
    membro = r.ombro; membroNome = 'ombro'; ratio = r.ombro / r.cintura; niveis = [1.33, 1.45, 1.618];
  }
  const topoNome = isF ? 'palco' : 'áurea';                 // rótulo do 3º nível por sexo
  const topoLabel = isF ? 'palco (categoria feminina)' : 'fisiculturismo';
  const rotulo = `${membroNome.charAt(0).toUpperCase() + membroNome.slice(1)} ÷ cintura`;
  let nivel = 0; niveis.forEach((n, i) => { if (ratio >= n) nivel = i + 1; });
  const acima = ratio >= niveis[2];
  let txt;
  if (acima) txt = `🏆 <b>Nível ${topoLabel}</b> · ${rotulo} = ${ratio.toFixed(2)}`;
  else if (nivel === 0) txt = `Shape em construção · ${rotulo} = ${ratio.toFixed(2)} <small>(Pump Nível 1 = ${_1(niveis[0])})</small>`;
  else txt = `🏆 <b>Pump Nível ${nivel}</b> · ${rotulo} = ${ratio.toFixed(2)}`;
  txt += ` <small style="opacity:.55">— ${isF ? 'a curva (silhueta)' : 'o V (formato do tronco)'}</small>`;

  // Escada dos 3 níveis, um abaixo do outro: ✅ alcançado · 🎯 próximo · a caminho.
  const escadaLinhas = niveis.map((n, i) => {
    const nome = `Nível ${i + 1}${i === 2 ? ` (${topoNome})` : ''}`;
    let st;
    if (ratio >= n)       st = '✅ alcançado';
    else if (i === nivel) st = '🎯 <b>próximo</b>';
    else                  st = '<span style="opacity:.55">a caminho</span>';
    return `<div>${nome} <span style="opacity:.6">(${_1(n)})</span>: ${st}</div>`;
  }).join('');
  const escadaHtml = `<div class="cp-pump-hr"></div><div class="cp-pump-tit">Escada dos níveis</div><div class="cp-pump-escada">${escadaLinhas}</div>`;

  // Barra de progresso até o PRÓXIMO nível — cada cm conta, mesmo sem "subir".
  let progHtml;
  if (acima) {
    progHtml = `<div class="cp-pump-prog-lbl">🏆 <b>Nível máximo (${topoNome})</b> atingido!</div>`;
  } else {
    const nextT = niveis[nivel];
    const prevT = nivel > 0 ? niveis[nivel - 1] : niveis[0] - (niveis[1] - niveis[0]);
    const pct = Math.max(0, Math.min(100, Math.round((ratio - prevT) / (nextT - prevT) * 100)));
    progHtml = `<div class="cp-pump-prog-lbl"><b>${pct}%</b> até o Nível ${nivel + 1} <span style="opacity:.6">(${_1(nextT)})</span></div>`
      + `<div class="cp-pump-prog"><div class="cp-pump-prog-bar" style="width:${pct}%"></div></div>`;
  }

  // Ganho real de músculo: variação do membro-âncora (glúteo/ombro) desde a 1ª
  // medição, com a cintura do mesmo período ao lado — assim dá pra separar músculo
  // de gordura. A fita não separa osso de músculo num retrato só; o movimento no
  // tempo separa (bacia larga já nasce grande, mas crescimento é músculo novo).
  let ganho = '';
  {
    const key = isF ? 'quadril' : 'ombro';
    const prim = [...registros].reverse().find(x => x !== r && x[key] != null);
    if (prim) {
      const dG = membro - prim[key];
      if (Math.abs(dG) >= 0.1) {
        const emoji = isF ? '🍑' : '💪';
        const nomeCap = membroNome.charAt(0).toUpperCase() + membroNome.slice(1);
        const temCint = prim.cintura != null && r.cintura != null;
        const dW = temCint ? r.cintura - prim.cintura : null;
        const cintTxt = temCint ? ` · cintura ${_sinal(dW)} cm` : '';
        // Leitura músculo × gordura: pra construir músculo um leve superávit é normal
        // (vem um pouco de gordura junto). O que importa é o membro subir MAIS rápido
        // que a cintura — depois um cut revela. Se a cintura acompanha, foi mais gordura.
        let leitura;
        if (dG > 0.1) {
          if (dW == null) leitura = 'cresceu — confirma com a cintura no mês que vem';
          else if (dW <= 0.1) leitura = '🔥 volume limpo — cresceu sem ganhar cintura';
          else if (dW < dG * 0.6) leitura = '👍 fase de ganho saudável — pra construir músculo um pouco de gordura junto é normal; depois um cut revela';
          else leitura = '⚠️ veio bastante gordura junto (cintura quase acompanhou) — depois de construir, seca um pouco pra revelar';
        } else {
          leitura = 'diminuiu — capricha na proteína e no treino pra preservar músculo';
        }
        ganho = `<br><small>${emoji} <b>${nomeCap} ${_sinal(dG)} cm</b> desde a 1ª medição${cintTxt}<br><span style="opacity:.75">${leitura}</span></small>`;
      }
    }
  }
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
  // Proporções em relação ao membro-âncora (glúteo/ombro).
  const RC = isF ? 0.60 : 0.48;   // coxa como fração do glúteo (F) / ombro (M)
  const RP = isF ? 0.38 : 0.33;   // panturrilha, idem
  const RG = 0.85;                // glúteo do HOMEM como fração do ombro (músculo de
                                  // apoio; mantém o V, quadril < ombro). Mulher já tem
                                  // o glúteo como âncora, não repete aqui.
  const RB = 0.30;                // braço ~30% do ombro (homem, natural sem exagero)
  const RPe = 0.77;               // peitoral ~77% do ombro (pega peito+costas, já nasce grande)

  // ── Excelência do nível ATUAL: o V do nível já fechou, mas a harmonia (outros
  // músculos) ainda pode faltar. O nível é a silhueta; isto é o polimento do nível. ──
  let excelencia = '';
  if (!acima && nivel >= 1) {
    const faltas = [];
    const chk = (nome, val, ratio) => {
      if (!val) return;
      const d = Math.round(membro * ratio) - val;
      if (d > 1) faltas.push(`+${_1(d)} cm de ${nome}`);
    };
    if (!isF) { chk('peito', r.peitoral, RPe); chk('braço', r.braco, RB); chk('glúteo', r.quadril, RG); }
    chk('coxa', r.coxa, RC);
    chk('panturrilha', r.panturrilha, RP);
    if (faltas.length) {
      excelencia = `<br><small>✅ Você fechou o <b>V do Nível ${nivel}</b>! Pra a <b>excelência completa</b> do nível (harmonia dos outros músculos), ainda falta: ${faltas.join(', ')}. <span style="opacity:.7">Isso é polimento — não trava sua subida de nível.</span></small>`;
    } else {
      excelencia = `<br><small>🏆 Você fechou o <b>V do Nível ${nivel}</b> <b>e</b> toda a harmonia dele — excelência completa nesse nível!</small>`;
    }
  }

  // ── Leitura 1: proporção ATUAL (pernas ancoradas no membro atual) — tabelinha ──
  let agora = '';
  {
    const rows = [];
    const add = (nome, val, ratio) => {
      if (!val) return;
      const alvo = Math.round(membro * ratio);
      const d = alvo - val;
      const acao = d > 1 ? `<b>+${_1(d)} cm</b>` : '✓';
      rows.push(`<tr><td>${nome}</td><td>${val} cm</td><td>${alvo} cm</td><td>${acao}</td></tr>`);
    };
    if (!isF) { add('Peitoral', r.peitoral, RPe); add('Braço', r.braco, RB); add('Glúteo', r.quadril, RG); }
    add('Coxa', r.coxa, RC);
    add('Panturrilha', r.panturrilha, RP);
    if (rows.length) agora = `<div class="cp-pump-hr"></div><div class="cp-pump-tit">⚖️ Proporção atual do seu corpo</div>`
      + `<div class="cp-pump-sub">(c/ o ${membroNome}, pro formato em "${isF ? 'ampulheta' : 'V'}")</div>`
      + `<table class="cp-tab"><thead><tr><th>Medida</th><th>Atual</th><th>Ideal</th><th>Falta</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
  }

  // ── Leitura 2: corpo IDEAL no próximo Pump (cintura saudável + tudo proporcional) ──
  let meta = '';
  if (!acima && nivel < 3) {
    const metaRatio = niveis[nivel];
    const cintAlvo = dados.alturaCm ? Math.min(r.cintura, Math.round(dados.alturaCm * 0.5)) : r.cintura;
    const membroAlvo = Math.round(cintAlvo * metaRatio);
    const coxaAlvo = Math.round(membroAlvo * RC);
    const pantAlvo = Math.round(membroAlvo * RP);
    const gluteoAlvo = Math.round(membroAlvo * RG);
    const bracoAlvo = Math.round(membroAlvo * RB); // braço ~30% do ombro (natural, sem exagero)
    const peitoAlvo = Math.round(membroAlvo * RPe); // peito ~77% do ombro (a medida pega peito+costas,
                                                     // já nasce grande — alvo realista de natural)
    const rows = [];
    const linha = (nome, atual, alvo, cresce) => {
      if (atual == null) return;
      const d = cresce ? alvo - atual : atual - alvo;
      const acao = d > 1 ? `<b>${cresce ? '+' : '−'}${_1(d)} cm</b>` : '✓';
      rows.push(`<tr><td>${nome}</td><td>${atual} cm</td><td>${alvo} cm</td><td>${acao}</td></tr>`);
    };
    linha('Cintura', r.cintura, cintAlvo, false);
    linha(membroNome.charAt(0).toUpperCase() + membroNome.slice(1), membro, membroAlvo, true);
    if (!isF) linha('Peitoral', r.peitoral, peitoAlvo, true);   // tronco de apoio — só homem
    if (!isF) linha('Braço', r.braco, bracoAlvo, true);         // (mulher foca curva + pernas)
    if (!isF) linha('Glúteo', r.quadril, gluteoAlvo, true);     // homem: glúteo de apoio
    linha('Coxa', r.coxa, coxaAlvo, true);
    linha('Panturrilha', r.panturrilha, pantAlvo, true);
    meta = `<div class="cp-pump-hr"></div><div class="cp-pump-tit">🎯 Corpo ideal no Nível ${nivel + 1}</div>`
      + `<div class="cp-pump-sub">${isF ? '<b>Glúteo e cintura</b> fecham o nível (a curva). Coxa e panturrilha são <b>harmonia</b>' : '<b>Ombro e cintura</b> fecham o nível (o V). Peito, braço, glúteo e pernas são <b>harmonia</b>'} — meta de longo prazo, não exigência pra subir.</div>`
      + `<table class="cp-tab"><thead><tr><th>Medida</th><th>Atual</th><th>Ideal</th><th>Ajuste</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
  }
  return `<div class="cp-an cp-an-pump">${txt}${excelencia}${progHtml}${escadaHtml}${ganho}${falta}${agora}${meta}</div>`;
}

function analiseHtml() {
  if (!registros.length) return '';
  const r = registros[0], ant = registros[1];
  // Composição = neutra (fica no topo). Depois DUAS seções separadas:
  // SAÚDE (gordura + cintura) e ESTÉTICA / acima da média (os Pumps).
  const comp  = _blocoMusculo(r, ant);
  const saude = _blocoSaude(r);
  const pump  = _blocoPump(r, ant);
  let blocos = comp;
  if (saude.trim()) blocos += `<div class="cp-secao-analise">🩺 Para ter um corpo saudável</div>${saude}`;
  if (pump.trim())  blocos += `<div class="cp-secao-analise">🏆 Para um corpo acima da média</div><div class="cp-secao-analise-sub">${dados.sexo === 'F' ? 'Baseado na <b>proporção da ampulheta</b> — a curva rumo ao palco.' : 'Baseado na <b>proporção áurea</b> — o shape "estátua grega".'}</div>${pump}`;
  if (!blocos.trim()) return '';
  return `<div class="cp-analise"><div class="cp-analise-tit">📊 Sua análise</div>${blocos}</div>`;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: NOVA MEDIÇÃO (formulário) + travado + histórico
// ═══════════════════════════════════════════════════════════════
function formHtml() {
  const roupa = dados.sexo === 'F' ? 'Fique de <b>calcinha</b> e, em cima, <b>sem sutiã com uma fita em X</b> (esparadrapo) no mamilo <b>ou um biquíni bem justo</b> que não esconda o contorno — o top/roupa larga esconde as dobrinhas e atrapalha comparar'
    : dados.sexo === 'M' ? 'Fique só de <b>cueca ou sunga</b> (nada de bermuda larga — atrapalha ver o contorno)'
    : 'Homens só de <b>cueca/sunga</b>; mulheres de calcinha + fita em X no mamilo ou biquíni justo (roupa larga esconde as dobrinhas)';
  // Pescoço: SEMPRE pedir. Ele entra na fórmula (cintura − pescoço) e muda por
  // MÚSCULO também (nadador/trapézio), não só por gordura — reaproveitar o valor
  // antigo distorcia o % de gordura. Vem pré-preenchido com o último como sugestão.
  // Cintura muda de ponto por sexo (fórmula da Marinha): homem no umbigo,
  // mulher acima do umbigo na parte mais fina. Hint no campo + linha no avatar.
  const cinturaHint = dados.sexo === 'F' ? '(acima do umbigo, parte mais fina)'
    : dados.sexo === 'M' ? '(na altura do umbigo)'
    : '(H: no umbigo · M: acima, parte fina)';
  const hintDe = (m) => (m.k === 'cintura' ? cinturaHint : (m.hint || ''));
  const medidasVis = MEDIDAS;
  return `
    <div class="cp-form-corpo">
      <div class="cp-medidas">
        ${medidasVis.map(m => `
          <label class="cp-campo">
            <span class="cp-campo-lbl">${m.lbl} ${hintDe(m) ? `<small>${hintDe(m)}</small>` : ''}</span>
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

    <div class="cp-secao-tit">Fotos de progresso — as 6</div>
    <div class="cp-secao-sub">Frente / lado / costas, do <b>quadril ↑</b> e do <b>quadril ↓</b>. Salva tudo junto com a medição.</div>
    <div class="cp-foto-dica">📸 Tire <b>de frente pro espelho</b> ou peça pra <b>alguém te fotografar</b>, num lugar <b>bem iluminado</b>. ${roupa} — assim dá pra comparar a evolução com clareza.</div>
    ${fotosGridHtml()}

    <button class="cp-salvar" data-salvar>Salvar medição + 6 fotos</button>`;
}

// Grade dos 3 slots de foto (frente/lado/costas) + inputs de câmera/galeria.
// Usada tanto na nova medição quanto no bloco de "fotos a qualquer momento".
function fotosGridHtml() {
  return `
    <div class="cp-fotos">
      ${LADOS.map(l => `
        <button type="button" class="cp-foto-slot" data-foto="${l.k}">
          ${novo?.fotos[l.k]?.previa
            ? `<img src="${esc(novo.fotos[l.k].previa)}" alt="${l.lbl}" />`
            : `<span class="cp-foto-mais">＋</span>`}
          <span class="cp-foto-lbl">${l.lbl}</span>
        </button>`).join('')}
    </div>
    <input type="file" id="cp-foto-cam" accept="image/*" capture="environment" hidden />
    <input type="file" id="cp-foto-gal" accept="image/*" hidden />`;
}

// Avatar: as ilustrações reais (frente + lado), conforme o sexo do perfil.
// Mulher no perfil feminino, homem no masculino (padrão homem se não definido).
function avatarHtml() {
  const isF = dados.sexo === 'F';
  const dir = isF ? 'mulher' : 'homem';
  // Linha-guia da cintura: onde encostar a fita. Mulher mede um pouco mais alto
  // (acima do umbigo, parte mais fina) → linha mais alta que a do homem.
  // % do topo da figura é APROXIMADO — afinar depois de ver no avatar real.
  const cintTxt = isF ? 'Parte mais fina' : 'Altura do umbigo';
  const cintTop = isF ? '40%' : '45%';
  return `
    <div class="cp-fig">
      <img src="img/corpo/${dir}-frente.png" alt="Frente" loading="lazy" />
      <div class="cp-fig-cintura" style="top:${cintTop}"><span>${cintTxt}</span></div>
    </div>
    <div class="cp-fig"><img src="img/corpo/${dir}-lado.png" alt="Lado" loading="lazy" /></div>`;
}

function bloqueadoHtml() {
  const dias = diasParaLiberar();
  const ultima = registros.length ? new Date(registros[0].data + 'T00:00:00').toLocaleDateString([], { day: '2-digit', month: 'short' }) : '';
  const d = `${dias} ${dias === 1 ? 'dia' : 'dias'}`;
  // Amarração: medida + 6 fotos são salvas juntas e travam. Nada de editar depois
  // — no próximo ciclo a pessoa refaz tudo (fotos + medidas).
  return `
    <div class="cp-bloqueado">
      <span class="cp-bloq-ic">⏳</span>
      <span>Você registrou em <b>${ultima}</b> (medidas + 6 fotos). A próxima libera em <b>${d}</b> — 1x por mês pra acompanhar de perto.</span>
    </div>
    <button class="cp-salvar" disabled>🔒 Nova medição em ${d}</button>`;
}

function historicoHtml() {
  if (!registros.length) return '';
  const linhas = registros.map(r => {
    const dt = new Date(r.data + 'T00:00:00').toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
    const fotos = LADOS.map(l => r.fotos?.[l.k]).filter(Boolean);
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
      if (op === 'camera') {
        const blob = await abrirCameraGuia(ladoAtivo);   // câmera com molde (já sai reduzida)
        if (blob) { novo.fotos[ladoAtivo] = { blob, previa: URL.createObjectURL(blob) }; desenhar(); }
      } else if (op === 'galeria') document.getElementById('cp-foto-gal')?.click();
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
    } catch (err) { showToast('Não consegui processar essa foto. Tente outra (ou reduza a resolução da câmera).', 'error'); }
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
  // AMARRAÇÃO: só salva com as 6 fotos + as medidas — tudo na mesma data. Depois
  // trava (não edita); no próximo ciclo refaz tudo.
  const faltamFotos = LADOS.filter(l => !novo.fotos[l.k]?.blob);
  if (faltamFotos.length) { showToast(`Faltam ${faltamFotos.length} foto(s): ${faltamFotos.map(l => l.lbl).join(', ')}.`, 'info'); return; }
  const faltamMedidas = MEDIDAS.filter(m => novo.medidas[m.k] == null);
  if (faltamMedidas.length) { showToast(`Preencha as medidas também (faltam ${faltamMedidas.length}).`, 'info'); return; }
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

// Câmera com MOLDE: vídeo ao vivo + silhueta-guia (avatar) + linha da cintura. A
// pessoa encaixa o corpo no molde → enquadramento igual todo mês (base do
// comparativo). Resolve com um blob JÁ reduzido (~1080px) ou null (cancelou).
function abrirCameraGuia(lado) {
  return new Promise((resolve) => {
    const info = LADOS.find(l => l.k === lado) || { molde: 'frente', crop: 'cima', lbl: '' };
    const sexoDir = dados.sexo === 'F' ? 'mulher' : 'homem';
    const guiaImg = `${sexoDir}-${info.molde}.png`;
    const ov = document.createElement('div');
    ov.className = 'cam-guia-ov';
    ov.innerHTML = `
      <div class="cam-guia-msg"><b>${info.lbl}</b> · 💡 pra <b>precisão maior</b>, em <b>jejum antes do café</b>. Encaixe no molde e mantenha a <b>mesma distância</b> todo mês (pode cortar as mãos).</div>
      <video class="cam-guia-video" autoplay playsinline muted></video>
      <img class="cam-guia-molde cam-crop-${info.crop}" src="img/corpo/${guiaImg}" alt="molde" />
      <div class="cam-guia-cintura cam-crop-${info.crop}"></div>
      <div class="cam-guia-barra">
        <button type="button" class="cam-guia-btn" data-cam="cancel">Cancelar</button>
        <button type="button" class="cam-guia-shot" data-cam="shot" aria-label="Tirar foto"></button>
        <span class="cam-guia-espaco"></span>
      </div>`;
    document.body.appendChild(ov);
    const video = ov.querySelector('video');
    let stream = null;   // sempre câmera TRASEIRA (frontal distorce e afasta) — sem virar

    async function start() {
      if (stream) stream.getTracks().forEach(t => t.stop());
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1080 }, height: { ideal: 1440 } }, audio: false,
        });
        video.srcObject = stream;
      } catch (e) {
        showToast('Não consegui abrir a câmera. Use a galeria.', 'error');
        fim(null);
      }
    }
    function fim(v) {
      if (stream) stream.getTracks().forEach(t => t.stop());
      ov.remove();
      resolve(v);
    }
    ov.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-cam]'); if (!b) return;
      const act = b.dataset.cam;
      if (act === 'cancel') return fim(null);
      if (act === 'shot') {
        if (!video.videoWidth) return;
        const max = 1080;
        const escala = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight));
        const cv = document.createElement('canvas');
        cv.width = Math.round(video.videoWidth * escala);
        cv.height = Math.round(video.videoHeight * escala);
        cv.getContext('2d').drawImage(video, 0, 0, cv.width, cv.height);
        const blob = await new Promise(r => cv.toBlob(b2 => r(b2), 'image/jpeg', 0.82));
        cv.width = 0; cv.height = 0;
        fim(blob);
      }
    });
    start();
  });
}

// Reduz a foto antes de subir. Decodifica JÁ no tamanho final (createImageBitmap
// com resize) — o modo antigo decodificava a foto INTEIRA em resolução máxima e
// estourava a memória em fotos gigantes de celular ("memória insuficiente").
async function reduzir(file, max = 1080) {
  // 1) Dimensões sem segurar o bitmap full-res (via <img>, barato).
  const url = URL.createObjectURL(file);
  let dims;
  try {
    dims = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload  = () => resolve({ w: im.naturalWidth || im.width, h: im.naturalHeight || im.height });
      im.onerror = () => reject(new Error('img'));
      im.src = url;
    });
  } catch { URL.revokeObjectURL(url); throw new Error('falha'); }

  const maior = Math.max(dims.w, dims.h) || max;
  const escala = Math.min(1, max / maior);
  const w = Math.max(1, Math.round(dims.w * escala));
  const h = Math.max(1, Math.round(dims.h * escala));

  // 2) Decodifica JÁ reduzido (memória de pico baixa); fallback pro modo antigo.
  let bmp;
  try {
    bmp = await createImageBitmap(file, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });
  } catch {
    bmp = await createImageBitmap(file);
  }
  URL.revokeObjectURL(url);

  // 3) Canvas no tamanho final e libera tudo depois.
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();
  const blob = await new Promise((res, rej) =>
    cv.toBlob(b => b ? res(b) : rej(new Error('falha')), 'image/jpeg', 0.82));
  cv.width = 0; cv.height = 0;   // libera o buffer do canvas
  return blob;
}
