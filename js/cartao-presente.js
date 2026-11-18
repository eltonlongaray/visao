// ─── ÍNDICE ──────────────────────────────────────────────────
// CARTÃO PRESENTE PREMIUM (18/11/2026) — arte horizontal "saindo do envelope"
//   BLOCO 1 — paletas prontas (lilás, nude, sálvia…) + cores da marca
//   BLOCO 2 — fontes (Cormorant Garamond + Montserrat, do jsDelivr)
//   BLOCO 3 — desenho: fundo de papel, envelope aberto atrás, cartão com fita e laço,
//             ticket com o código picotado, logo/nome do negócio
//   BLOCO 4 — tirar a paleta da logo (cores dominantes)
// Usa a IDENTIDADE VISUAL da profissional (ficha_cfg.marca: cores + logo).
// ─────────────────────────────────────────────────────────────

// === BLOCO 1: PALETAS ===
// fundo = papel claro · principal = fita, títulos e detalhes · acento = folhagens · texto = escrita
export const PALETAS = {
  lilas:  { nome: 'Lilás e verde',   fundo: '#EEE6F2', principal: '#8C6FA0', acento: '#7F9C7B', texto: '#3F2E4D' },
  nude:   { nome: 'Nude',            fundo: '#F4EAE1', principal: '#B08A6E', acento: '#C9A98C', texto: '#4A3628' },
  salvia: { nome: 'Verde sálvia',    fundo: '#E9EFE7', principal: '#7E9A7A', acento: '#B9A27A', texto: '#2F3D2D' },
  rose:   { nome: 'Rosé',            fundo: '#F6E8EA', principal: '#B97A86', acento: '#9DAF8E', texto: '#4D2B32' },
  sereno: { nome: 'Azul sereno',     fundo: '#E8EEF4', principal: '#6F8CA8', acento: '#A8B8A0', texto: '#26384A' },
  noite:  { nome: 'Preto e dourado', fundo: '#EFEAE0', principal: '#B8955A', acento: '#8C7A55', texto: '#1F1B16' },
};
export const paletaDe = marca => ({ ...PALETAS.lilas, ...(PALETAS[marca?.paleta] || {}), ...(marca?.cores || {}) });

// mistura duas cores hex (t = 0 → a, 1 → b)
function _mix(a, b, t) {
  const p = h => [1, 3, 5].map(i => parseInt(String(h).replace('#', '').padEnd(6, '0').slice(i - 1, i + 1), 16) || 0);
  const x = p(a), y = p(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

// === BLOCO 2: FONTES ===
const FONTES = [
  ['CG', 'https://cdn.jsdelivr.net/npm/@fontsource/cormorant-garamond@5.0.13/files/cormorant-garamond-latin-600-normal.woff2', { weight: '600' }],
  ['CG', 'https://cdn.jsdelivr.net/npm/@fontsource/cormorant-garamond@5.0.13/files/cormorant-garamond-latin-500-italic.woff2', { weight: '500', style: 'italic' }],
  ['MS', 'https://cdn.jsdelivr.net/npm/@fontsource/montserrat@5.0.18/files/montserrat-latin-500-normal.woff2', { weight: '500' }],
  ['MS', 'https://cdn.jsdelivr.net/npm/@fontsource/montserrat@5.0.18/files/montserrat-latin-700-normal.woff2', { weight: '700' }],
];
let _fontes = null;
function _carregarFontes() {
  if (!_fontes) _fontes = Promise.all(FONTES.map(async ([f, url, d]) => {
    try { const ff = new FontFace(f, `url(${url})`, d); await ff.load(); document.fonts.add(ff); } catch { /* sem fonte: usa serif/sans do aparelho */ }
  }));
  return _fontes;
}
const SERIF = '"CG", "Cormorant Garamond", Georgia, serif', SANS = '"MS", Montserrat, "Segoe UI", Roboto, Arial, sans-serif';

// === BLOCO 3: DESENHO ===
const _dataBr = iso => { const [y, m, d] = String(iso || '').slice(0, 10).split('-'); return d ? `${d}/${m}/${y}` : ''; };
async function _img(url) { try { return await createImageBitmap(await (await fetch(url)).blob()); } catch { return null; } }

// c = { cliente_nome, de_nome, servico_nome, descricao, codigo, validade }
export async function desenharCartao(c, { marca = {}, nomeNegocio = '', linkAgenda = '', logoUrl = null } = {}) {
  await _carregarFontes();
  const P = paletaDe(marca), W = 1600, H = 1000;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  const papel = _mix(P.fundo, '#ffffff', 0.55), envelope = _mix(P.fundo, P.principal, 0.22), envEsc = _mix(P.fundo, P.principal, 0.38);

  // fundo de papel com textura bem leve
  x.fillStyle = P.fundo; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.035})`; x.fillRect(Math.random() * W, Math.random() * H, 2, 2); }

  // envelope aberto, atrás e um pouco girado
  x.save(); x.translate(930, 600); x.rotate(0.06);
  x.shadowColor = 'rgba(0,0,0,0.14)'; x.shadowBlur = 40; x.shadowOffsetY = 18;
  const ew = 1020, eh = 600;
  x.fillStyle = envelope; x.fillRect(-ew / 2, -eh / 2, ew, eh);
  x.shadowColor = 'transparent';
  x.fillStyle = envEsc;                                  // aba aberta (triângulo pra cima)
  x.beginPath(); x.moveTo(-ew / 2, -eh / 2); x.lineTo(0, -eh / 2 - 250); x.lineTo(ew / 2, -eh / 2); x.closePath(); x.fill();
  x.strokeStyle = _mix(envEsc, '#000000', 0.08); x.lineWidth = 2;
  x.beginPath(); x.moveTo(-ew / 2, eh / 2); x.lineTo(0, 30); x.lineTo(ew / 2, eh / 2); x.stroke();   // dobras de baixo
  x.restore();

  // cartão na frente
  const cw = 1180, ch = 680;
  x.save(); x.translate(760, 470); x.rotate(-0.025);
  x.shadowColor = 'rgba(0,0,0,0.18)'; x.shadowBlur = 50; x.shadowOffsetY = 22;
  x.fillStyle = papel; x.beginPath(); x.roundRect(-cw / 2, -ch / 2, cw, ch, 18); x.fill();
  x.shadowColor = 'transparent';
  // moldura dupla fina
  x.strokeStyle = P.principal; x.lineWidth = 2.5; x.beginPath(); x.roundRect(-cw / 2 + 22, -ch / 2 + 22, cw - 44, ch - 44, 10); x.stroke();
  x.lineWidth = 1; x.beginPath(); x.roundRect(-cw / 2 + 32, -ch / 2 + 32, cw - 64, ch - 64, 8); x.stroke();

  // raminhos de folhas (cor de acento) nos cantos
  _ramo(x, cw / 2 - 70, -ch / 2 + 70, -2.4, 1.15, P.acento);
  _ramo(x, cw / 2 - 90, -ch / 2 + 60, -1.75, 0.8, _mix(P.acento, papel, 0.3));
  _ramo(x, -cw / 2 + 60, ch / 2 - 60, 0.75, 1, P.acento);

  // fita vertical + laço
  const fx = -cw / 2 + 300;
  x.fillStyle = P.principal; x.fillRect(fx - 22, -ch / 2, 44, ch);
  x.fillStyle = _mix(P.principal, '#ffffff', 0.18); x.fillRect(fx - 22, -ch / 2, 8, ch);
  const by = -ch / 2 + 150;
  x.fillStyle = P.principal;
  x.save(); x.translate(fx, by); x.scale(0.78, 0.78); x.translate(-fx, -by);   // laço um pouco menor
  for (const s of [-1, 1]) {                               // alças do laço
    x.beginPath(); x.moveTo(fx, by);
    x.bezierCurveTo(fx + s * 40, by - 120, fx + s * 170, by - 90, fx + s * 120, by - 10);
    x.bezierCurveTo(fx + s * 100, by + 30, fx + s * 40, by + 20, fx, by); x.fill();
    x.beginPath(); x.moveTo(fx, by);                        // pontas
    x.lineTo(fx + s * 70, by + 150); x.lineTo(fx + s * 48, by + 140); x.lineTo(fx + s * 30, by + 160); x.closePath(); x.fill();
  }
  x.fillStyle = _mix(P.principal, '#000000', 0.15); x.beginPath(); x.ellipse(fx, by, 26, 22, 0, 0, Math.PI * 2); x.fill();
  x.restore();

  // lado esquerdo: logo (ou monograma) + nome do negócio
  const lx = -cw / 2 + 150;
  const logo = logoUrl ? await _img(logoUrl) : null;
  if (logo) {
    const k = Math.min(170 / logo.width, 170 / logo.height);
    x.drawImage(logo, lx - logo.width * k / 2, 60 - logo.height * k / 2, logo.width * k, logo.height * k);
    if (logo.close) logo.close();
  } else {
    x.strokeStyle = P.principal; x.lineWidth = 2; x.beginPath(); x.arc(lx, 60, 72, 0, Math.PI * 2); x.stroke();
    x.fillStyle = P.principal; x.font = `600 76px ${SERIF}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText((nomeNegocio || 'P').trim().charAt(0).toUpperCase(), lx, 66);
  }
  x.fillStyle = P.texto; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  _quebrar(x, (nomeNegocio || '').toUpperCase(), lx, 190, 220, `700 19px ${SANS}`, 26, 3, 3);

  // lado direito: textos
  const tx = fx + 165, tw = cw / 2 - 70 - tx;
  x.textAlign = 'left'; x.fillStyle = P.principal; x.font = `700 22px ${SANS}`;
  _espacado(x, 'VALE-PRESENTE', tx, -ch / 2 + 105, 6);
  x.fillStyle = P.texto; x.font = `600 96px ${SERIF}`;
  x.fillText(`Para ${c.cliente_nome || ''}`, tx, -ch / 2 + 205, tw);
  let y = _quebrar(x, `1 sessão de ${String(c.servico_nome || '').split(' (')[0]}`, tx, -ch / 2 + 268, tw, `500 italic 46px ${SERIF}`, 50, 2, 0, _mix(P.texto, P.principal, 0.35));
  if (c.descricao) y = _quebrar(x, `“${c.descricao}”`, tx, y + 58, tw, `500 24px ${SANS}`, 34, 3, 0, _mix(P.texto, '#ffffff', 0.25));
  if (c.de_nome) { x.font = `500 italic 38px ${SERIF}`; x.fillStyle = P.texto; x.fillText(`com carinho, ${c.de_nome}`, tx, y + 58, tw); }

  // ticket picotado com o código
  const ty = ch / 2 - 150;
  x.strokeStyle = _mix(P.principal, papel, 0.25); x.lineWidth = 2; x.setLineDash([10, 9]);
  x.beginPath(); x.moveTo(fx + 40, ty); x.lineTo(cw / 2 - 40, ty); x.stroke(); x.setLineDash([]);
  x.fillStyle = P.fundo; for (const s of [fx + 40, cw / 2 - 40]) { x.beginPath(); x.arc(s, ty, 12, 0, Math.PI * 2); x.fill(); }
  x.fillStyle = P.principal; x.font = `700 18px ${SANS}`; _espacado(x, 'CÓDIGO PRA AGENDAR', tx, ty + 46, 4);
  x.fillStyle = P.texto; x.font = `700 44px ${SANS}`; _espacado(x, c.codigo || '', tx, ty + 100, 3);
  x.textAlign = 'right'; x.fillStyle = P.principal; x.font = `700 16px ${SANS}`; _espacado(x, 'VÁLIDO ATÉ', cw / 2 - 64, ty + 46, 3);
  x.fillStyle = P.texto; x.font = `600 34px ${SERIF}`; x.fillText(_dataBr(c.validade), cw / 2 - 64, ty + 96);
  x.restore();

  const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.93)); cv.width = 0; cv.height = 0;
  return blob;
}
// raminho: caule curvo com folhas alternadas
function _ramo(x, cx, cy, ang, esc, cor) {
  x.save(); x.translate(cx, cy); x.rotate(ang); x.scale(esc, esc);
  x.strokeStyle = cor; x.fillStyle = cor; x.lineWidth = 3; x.lineCap = 'round';
  x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(60, -10, 150, 0); x.stroke();
  for (let i = 0; i < 6; i++) {
    const t = 18 + i * 22, s = i % 2 ? 1 : -1, tam = 26 - i * 2.5;
    x.save(); x.translate(t, -t * 0.03); x.rotate(s * 0.75);
    x.beginPath(); x.ellipse(0, s * -tam * 0.55, tam * 0.36, tam * 0.75, 0, 0, Math.PI * 2); x.fill(); x.restore();
  }
  x.beginPath(); x.ellipse(160, 0, 8, 16, Math.PI / 2, 0, Math.PI * 2); x.fill();
  x.restore();
}
// texto com letras espaçadas (small caps de luxo)
function _espacado(x, t, px, py, esp) {
  const al = x.textAlign; let w = 0; for (const ch of t) w += x.measureText(ch).width + esp;
  let cx = al === 'center' ? px - w / 2 : al === 'right' ? px - w : px;
  x.textAlign = 'left'; for (const ch of t) { x.fillText(ch, cx, py); cx += x.measureText(ch).width + esp; } x.textAlign = al;
}
// quebra em linhas; devolve o y da última linha
function _quebrar(x, t, px, py, max, fonte, alt, maxLin = 3, esp = 0, cor = null) {
  x.font = fonte; if (cor) x.fillStyle = cor;
  const ls = [''];
  const larg = t2 => x.measureText(t2).width + esp * t2.length;   // conta o espaçamento das letras
  for (const p of String(t).split(' ')) { const n = (ls[ls.length - 1] + ' ' + p).trim(); if (larg(n) > max && ls[ls.length - 1]) ls.push(p); else ls[ls.length - 1] = n; }
  ls.slice(0, maxLin).forEach((l, i) => (esp ? _espacado(x, l, px, py + i * alt, esp) : x.fillText(l, px, py + i * alt)));
  return py + (Math.min(maxLin, ls.length) - 1) * alt;
}

// === BLOCO 4: PALETA A PARTIR DA LOGO ===
// Pega a cor mais forte (principal), deriva um fundo bem claro e um texto escuro.
export async function paletaDaLogo(blob) {
  const b = await createImageBitmap(blob), cv = document.createElement('canvas'), k = Math.min(1, 120 / Math.max(b.width, b.height));
  cv.width = Math.max(1, Math.round(b.width * k)); cv.height = Math.max(1, Math.round(b.height * k));
  const x = cv.getContext('2d', { willReadFrequently: true }); x.drawImage(b, 0, 0, cv.width, cv.height); if (b.close) b.close();
  const d = x.getImageData(0, 0, cv.width, cv.height).data, baldes = new Map();
  for (let i = 0; i < d.length; i += 4) {
    const [r, g, bb, a] = [d[i], d[i + 1], d[i + 2], d[i + 3]]; if (a < 128) continue;
    const mx = Math.max(r, g, bb), mn = Math.min(r, g, bb); if (mx > 235 && mn > 225) continue;   // ignora branco
    const sat = mx ? (mx - mn) / mx : 0; if (sat < 0.12 && mx > 60) continue;                       // ignora cinza claro
    const key = [r, g, bb].map(v => v >> 4).join(','); const o = baldes.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    o.n++; o.r += r; o.g += g; o.b += bb; baldes.set(key, o);
  }
  cv.width = 0; cv.height = 0;
  const top = [...baldes.values()].sort((a, b2) => b2.n - a.n)[0];
  if (!top) return null;
  const hex = v => Math.round(v).toString(16).padStart(2, '0');
  const principal = '#' + hex(top.r / top.n) + hex(top.g / top.n) + hex(top.b / top.n);
  const seg = [...baldes.values()].sort((a, b2) => b2.n - a.n).find(o => Math.abs(o.r / o.n - top.r / top.n) + Math.abs(o.g / o.n - top.g / top.n) + Math.abs(o.b / o.n - top.b / top.n) > 90);
  const acento = seg ? '#' + hex(seg.r / seg.n) + hex(seg.g / seg.n) + hex(seg.b / seg.n) : _mix(principal, '#888888', 0.4);
  return { fundo: _mix(principal, '#ffffff', 0.86), principal, acento, texto: _mix(principal, '#000000', 0.62) };
}
