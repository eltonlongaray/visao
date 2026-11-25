// ─── ÍNDICE ──────────────────────────────────────────────────
// RELATÓRIO DA SESSÃO em PDF (pra profissional mandar pra cliente a cada sessão)
//   pdfRelatorioSessao({ cliente, sessao, lista, n, cfg, trat }) → Blob (A4, jsPDF)
//   Conteúdo: cabeçalho na cor da marca · dor ao pressionar por região (hoje × anterior
//   × 1ª sessão, com "melhorou/piorou") · gráfico da média de dor sessão a sessão ·
//   medidas (antes/depois ou por altura) · áreas, técnica e o que levou · orientações
//   pra casa (extra.orientacoes). As OBSERVAÇÕES da sessão NÃO entram: são anotações
//   internas da profissional (Élton, 25/11).
//   compartilharPdf(blob, nome, texto) → share do celular (WhatsApp) ou download.
// ─────────────────────────────────────────────────────────────
import { MEDIDAS, MEDIDAS_ALTURA, nomeDa, ladoDa } from './ficha-modelo.js';
import { paletaDe } from './cartao-presente.js';

// === BLOCO 1: AJUDANTES ===
async function _jsPDF() {
  if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;
  await new Promise((ok, erro) => { const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'; s.onload = ok; s.onerror = () => erro(new Error('Sem internet pra montar o PDF')); document.head.appendChild(s); });
  return window.jspdf.jsPDF;
}
// Helvetica do PDF não tem emoji nem setas: tira os símbolos
const _txt = t => String(t ?? '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, '').replace(/\s{2,}/g, ' ').trim();
const _rgb = hex => [1, 3, 5].map(i => parseInt(String(hex || '#7c5ca8').replace('#', '').padEnd(6, '0').slice(i - 1, i + 1), 16) || 0);
const _mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const _num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const _fmt = n => (n == null ? '—' : String(Math.round(n * 10) / 10).replace('.', ','));
const _dataBr = iso => { const [y, m, d] = String(iso || '').split('-'); return d ? `${d}/${m}/${y}` : ''; };
const _pontos = s => Object.entries(s?.palpacao || {}).filter(([, v]) => typeof v === 'number');
const _media = s => { const p = _pontos(s); return p.length ? p.reduce((t, [, v]) => t + v, 0) / p.length : null; };
// cor da bolinha da dor: 0 = verde, 1–10 = do rosa claro ao vermelho
const _corDor = n => (n === 0 ? [16, 185, 129] : _mix([252, 205, 205], [220, 38, 38], n / 10));

// === BLOCO 2: O PDF ===
export async function pdfRelatorioSessao({ cliente, sessao, lista = [], n = 1, cfg = null, trat = null }) {
  const jsPDF = await _jsPDF();
  const marca = cfg?.ficha_cfg?.marca || null;
  const pal = paletaDe(marca);
  const COR = _rgb(pal.principal), TINTA = _rgb(pal.texto || '#2a2a33'), FUNDO = _rgb(pal.fundo || '#f4f1ed');
  const negocio = _txt(marca?.nome || String(cfg?.titulo || '').split(' · ')[1] || cfg?.titulo || '');
  const nome1 = _txt((cliente?.nome || 'cliente').split(' ')[0]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, H = 297, M = 16, LW = W - M * 2;
  let y = 0;
  const cabe = h => { if (y + h > H - 18) { doc.addPage(); y = M; } };
  const titulo = t => {
    cabe(14);
    doc.setFillColor(...COR); doc.rect(M, y - 4.6, 1.6, 6.6, 'F');
    doc.setTextColor(...COR); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    doc.text(_txt(t), M + 4, y); y += 8;
  };
  const paragrafo = (t, tam = 10.5) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(tam); doc.setTextColor(...TINTA);
    const ls = doc.splitTextToSize(_txt(t), LW); cabe(ls.length * 5 + 2); doc.text(ls, M, y); y += ls.length * 5 + 2;
  };

  // --- cabeçalho ---
  doc.setFillColor(...COR); doc.rect(0, 0, W, 34, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(19);
  doc.text(`Sua sessão ${n}${trat?.nome ? ' · ' + _txt(trat.nome) : ''}`, M, 15);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
  doc.text([_txt(cliente?.nome || ''), [negocio, _dataBr(sessao?.data)].filter(Boolean).join(' · ')].filter(Boolean), M, 23);
  y = 44;

  const anteriores = lista.filter(s => s !== sessao && s.id !== sessao?.id && (s.data < sessao?.data || (s.data === sessao?.data && (s.created_at || '') < (sessao?.created_at || '9'))));
  const ant = anteriores[anteriores.length - 1] || null;
  const primeira = anteriores[0] || null;

  // --- dor ao pressionar ---
  const pts = _pontos(sessao);
  if (pts.length) {
    titulo('Dor ao pressionar (de 0 a 10)');
    const mHoje = _media(sessao), mPri = primeira ? _media(primeira) : null;
    if (mPri != null && mHoje != null) {
      const dif = mPri - mHoje;
      paragrafo(dif > 0.05 ? `Na média, a dor caiu de ${_fmt(mPri)} na 1ª sessão para ${_fmt(mHoje)} hoje.`
        : dif < -0.05 ? `Na média, a dor foi de ${_fmt(mPri)} na 1ª sessão para ${_fmt(mHoje)} hoje.`
        : `Na média, a dor está em ${_fmt(mHoje)}, igual à 1ª sessão.`);
      y += 1;
    }
    // tabela: Região | Hoje | Anterior | 1ª sessão | Como está
    const cols = [M, M + 70, M + 94, M + 120, M + 146];
    cabe(10);
    doc.setFillColor(...FUNDO); doc.rect(M, y - 4.5, LW, 7, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...TINTA);
    ['Região', 'Hoje', 'Anterior', '1ª sessão', 'Como está'].forEach((h, i) => doc.text(h, cols[i] + 1.5, y));
    y += 7;
    const ordenados = pts.slice().sort((a, b) => b[1] - a[1]);
    for (const [k, v] of ordenados) {
      cabe(7.5);
      const a = ant?.palpacao?.[k], p = primeira?.palpacao?.[k];
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...TINTA);
      doc.text(_txt(nomeDa(k) + (ladoDa(k) ? ` (${ladoDa(k)})` : '')), cols[0] + 1.5, y);
      doc.setFillColor(..._corDor(v)); doc.circle(cols[1] + 4.5, y - 1.3, 3.1, 'F');
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...(v >= 6 ? [255, 255, 255] : TINTA));
      doc.text(String(v), cols[1] + 4.5, y, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...TINTA);
      doc.text(typeof a === 'number' ? String(a) : '—', cols[2] + 4.5, y, { align: 'center' });
      doc.text(typeof p === 'number' ? String(p) : '—', cols[3] + 6, y, { align: 'center' });
      const base = typeof a === 'number' ? a : null;
      const como = base == null ? 'primeira medida' : v < base ? `melhorou ${base - v}` : v > base ? `subiu ${v - base}` : 'igual';
      doc.setTextColor(...(base != null && v < base ? [16, 140, 100] : base != null && v > base ? [200, 60, 60] : [120, 120, 130]));
      doc.text(como, cols[4] + 1.5, y);
      doc.setDrawColor(230, 228, 232); doc.line(M, y + 2.4, M + LW, y + 2.4);
      y += 7.5;
    }
    y += 4;
  }

  // --- evolução (média de dor sessão a sessão) ---
  const serie = anteriores.concat([sessao]).map((s, i) => ({ i: i + 1, m: _media(s), data: s.data })).filter(x => x.m != null);
  if (serie.length >= 2) {
    titulo('Sua evolução');
    cabe(52);
    const gx = M + 8, gy = y + 2, gw = LW - 14, gh = 36;
    doc.setDrawColor(225, 222, 228); doc.setLineWidth(0.2);
    for (let v = 0; v <= 10; v += 5) { const yy = gy + gh - (v / 10) * gh; doc.line(gx, yy, gx + gw, yy);
      doc.setFontSize(8); doc.setTextColor(150, 150, 160); doc.text(String(v), gx - 4, yy + 1); }
    const px = j => gx + (serie.length === 1 ? gw / 2 : (j / (serie.length - 1)) * gw);
    const py = m => gy + gh - (m / 10) * gh;
    doc.setDrawColor(...COR); doc.setLineWidth(0.9);
    for (let j = 1; j < serie.length; j++) doc.line(px(j - 1), py(serie[j - 1].m), px(j), py(serie[j].m));
    serie.forEach((s, j) => {
      doc.setFillColor(...COR); doc.circle(px(j), py(s.m), 1.6, 'F');
      doc.setFontSize(8.5); doc.setTextColor(...TINTA); doc.text(_fmt(s.m), px(j), py(s.m) - 3, { align: 'center' });
      doc.setTextColor(140, 140, 150); doc.text(`S${s.i}`, px(j), gy + gh + 5, { align: 'center' });
    });
    doc.setLineWidth(0.2);
    y = gy + gh + 12;
    doc.setFontSize(9); doc.setTextColor(120, 120, 130);
    doc.text('Média da dor ao pressionar em cada sessão (quanto mais baixo, melhor).', M, y); y += 8;
  }

  // --- medidas ---
  const med = sessao?.medidas || {};
  const ks = Object.keys(med).filter(k => med[k] && (_num(med[k].antes) != null || _num(med[k].depois) != null));
  if (ks.length) {
    titulo('Medidas');
    const porAltura = ks.some(k => MEDIDAS_ALTURA.some(m => m.k === k));
    const nomeMed = k => (MEDIDAS.concat(MEDIDAS_ALTURA).find(m => m.k === k)?.nome || med[k]?.nome || k.replace(/^x_/, '')).split(' (')[0];
    for (const k of ks) {
      cabe(7);
      const a = _num(med[k].antes), d = _num(med[k].depois);
      const pri = primeira?.medidas?.[k], vPri = pri ? (_num(pri.depois) ?? _num(pri.antes)) : null;
      const agora = d ?? a;
      let linha = porAltura || d == null ? `${_fmt(agora)} cm` : `antes ${_fmt(a)} · depois ${_fmt(d)} cm`;
      if (!porAltura && a != null && d != null && a !== d) linha += ` (${d < a ? '-' : '+'}${_fmt(Math.abs(a - d))} na sessão)`;
      if (vPri != null && agora != null && vPri !== agora) linha += ` · desde a 1ª sessão: ${agora < vPri ? '-' : '+'}${_fmt(Math.abs(vPri - agora))} cm`;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...TINTA); doc.text(_txt(nomeMed(k)), M + 1.5, y);
      doc.setFont('helvetica', 'normal'); doc.text(_txt(linha), M + 58, y);
      y += 6.5;
    }
    y += 4;
  }

  // --- o que foi feito ---
  const ex = sessao?.extra || {};
  const feito = [
    (ex.areas || []).length ? ['Áreas tratadas', ex.areas.join(', ')] : null,
    ex.tecnica ? ['Técnica', ex.tecnica] : null,
    ex.levou ? ['Levou pra casa', ex.levou] : null,
  ].filter(Boolean);
  if (feito.length) {
    titulo('O que fizemos hoje');
    for (const [r, t] of feito) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(110, 110, 120);
      cabe(12); doc.text(_txt(r), M, y); y += 4.6; paragrafo(t); y += 1;
    }
    y += 2;
  }

  // --- orientações pra casa ---
  if (_txt(ex.orientacoes)) {
    titulo('Pra fazer em casa');
    const ls = String(ex.orientacoes).split('\n').map(_txt).filter(Boolean);
    for (const l of ls) paragrafo(l.startsWith('-') || l.startsWith('•') ? l : '• ' + l);
    y += 2;
  }

  // --- rodapé em todas as páginas ---
  const tot = doc.getNumberOfPages();
  for (let p = 1; p <= tot; p++) {
    doc.setPage(p);
    doc.setDrawColor(...COR); doc.setLineWidth(0.4); doc.line(M, H - 14, W - M, H - 14);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(130, 130, 140);
    doc.text(_txt(`${negocio ? negocio + ' · ' : ''}Relatório da sessão ${n} de ${nome1}`), M, H - 9);
    if (tot > 1) doc.text(`${p}/${tot}`, W - M, H - 9, { align: 'right' });
  }
  return doc.output('blob');
}

// === BLOCO 3: COMPARTILHAR ===
export async function compartilharPdf(blob, nome, texto) {
  const file = new File([blob], nome, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], text: texto }); return; } catch { return; } }
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
export const nomeArquivo = (cliente, n) => `relatorio-sessao-${n}-${String(cliente?.nome || 'cliente').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cliente'}.pdf`;
