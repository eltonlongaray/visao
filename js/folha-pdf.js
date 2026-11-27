// ─── ÍNDICE ──────────────────────────────────────────────────
// 📄 FOLHA EM PDF (27/11/2026): transforma a folha do relatório (.mt-rel-folha) num PDF A4
// em formato de celular, do jeito que aparece na tela (foto da folha com html2canvas, páginas com jsPDF) e abre o
// compartilhar do celular com o ARQUIVO (WhatsApp → qualquer contato ou grupo).
//   BLOCO 1: carregar as bibliotecas (só quando precisa)
//   BLOCO 2: folhaParaPdf(el) → Blob, quebrando a página entre blocos, nunca no meio da linha
//   BLOCO 3: enviarPdf(blob, nome) → compartilhar ou baixar
// ─────────────────────────────────────────────────────────────

// === BLOCO 1: BIBLIOTECAS ===
const _script = (src, pronto) => pronto() ? Promise.resolve() : new Promise((ok, erro) => {
  const s = document.createElement('script');
  s.src = src; s.onload = ok; s.onerror = () => erro(new Error('Sem internet pra montar o PDF'));
  document.head.appendChild(s);
});
async function _libs() {
  await _script('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', () => !!window.jspdf?.jsPDF);
  await _script('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', () => !!window.html2canvas);
  return { jsPDF: window.jspdf.jsPDF, html2canvas: window.html2canvas };
}

// === BLOCO 2: FOLHA → PDF ===
// Formato celular (27/11: o Élton achou a letra pequena no A4): folha estreita (como na tela)
// e página em pé 9:16, então no WhatsApp a letra fica grande sem zoom.
const LARG = 440;
const QUEBRAS = '.rel-cab, .rel-cards, .rel-card, .rel-h, .rel-p, .rel-pilar, .rel-pilar li, .rel-linha, .rel-bonus-tit, .rel-grupo, .rel-pres, .rel-rodape, section, li, p, h3';

export async function folhaParaPdf(el) {
  const { jsPDF, html2canvas } = await _libs();
  let cortes = [];
  const escala = 2;
  const canvas = await html2canvas(el, {
    scale: escala, backgroundColor: '#fffaf4', useCORS: true, windowWidth: LARG + 40,
    onclone: doc => {
      const f = doc.querySelector('.mt-rel-folha');
      if (!f) return;
      f.style.width = LARG + 'px'; f.style.maxWidth = LARG + 'px'; f.style.margin = '0';
      f.style.boxShadow = 'none'; f.style.borderRadius = '0'; f.classList.add('rel-pdf');
      const topo = f.getBoundingClientRect().top;
      // título nunca fica sozinho no fim da página: não corta logo depois de um título
      const proib = [...f.querySelectorAll('.rel-pilar-top, .rel-pilar-sub, .rel-grupo, .rel-bonus-tit, .rel-h')].map(e => {
        const r = e.getBoundingClientRect();
        return [Math.round((r.top - topo) * escala), Math.round((r.bottom - topo + 40) * escala)];
      });
      cortes = [...f.querySelectorAll(QUEBRAS)].map(e => Math.round((e.getBoundingClientRect().top - topo) * escala))
        .filter(y => y > 0 && !proib.some(([a, b]) => y > a && y <= b));
    },
  });
  cortes = [...new Set(cortes)].sort((a, b) => a - b);

  const W = 120, H = 213, M = 5, RODAPE = 7;
  const doc = new jsPDF({ unit: 'mm', format: [W, H] });
  const pxPorMm = canvas.width / (W - 2 * M);
  const alturaPag = Math.floor((H - 2 * M - RODAPE) * pxPorMm);
  let y = 0, pag = 0;
  while (y < canvas.height - 4) {
    let fim = Math.min(canvas.height, y + alturaPag);
    if (fim < canvas.height) {
      // corta no último começo de bloco que cabe (sem página quase vazia)
      const bom = cortes.filter(c => c > y + alturaPag * 0.5 && c <= fim).pop();
      if (bom) fim = bom;
    }
    const pedaco = document.createElement('canvas');
    pedaco.width = canvas.width; pedaco.height = fim - y;
    const ctx = pedaco.getContext('2d');
    ctx.fillStyle = '#fffaf4'; ctx.fillRect(0, 0, pedaco.width, pedaco.height);
    ctx.drawImage(canvas, 0, y, canvas.width, fim - y, 0, 0, canvas.width, fim - y);
    if (pag) doc.addPage();
    doc.setFillColor(255, 250, 244); doc.rect(0, 0, W, H, 'F');
    doc.addImage(pedaco.toDataURL('image/jpeg', 0.9), 'JPEG', M, M, W - 2 * M, (fim - y) / pxPorMm);
    y = fim; pag++;
  }
  const tot = doc.getNumberOfPages();
  for (let p = 1; p <= tot; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(150, 130, 115);
    doc.text(`${p} de ${tot}`, W / 2, H - 4.5, { align: 'center' });
  }
  return doc.output('blob');
}

// === BLOCO 3: ENVIAR ===
// 'compartilhado' | 'cancelado' | 'baixado' | 'sem-gesto' (o celular pediu outro toque)
export async function enviarPdf(blob, nome, texto = '') {
  const file = new File([blob], nome, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share(texto ? { files: [file], text: texto } : { files: [file] }); return 'compartilhado'; }
    catch (e) { return e?.name === 'NotAllowedError' ? 'sem-gesto' : 'cancelado'; }
  }
  baixarPdf(blob, nome);
  return 'baixado';
}
export function baixarPdf(blob, nome) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
export const nomePdf = (base, nome) => `${base}-${String(nome || '').trim().split(' ')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-') || 'relatorio'}.pdf`;
