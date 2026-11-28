// planilha-compartilhar.js — (27/11/2026) manda a planilha pro WhatsApp (ou outro app) pelo menu de compartilhar.
// Por quê: o Chrome do Android NÃO deixa compartilhar .xlsx (só imagem, pdf, csv, txt…). Antes o botão
// caía no "baixar" calado e parecia que não fazia nada. Agora:
//   1) tenta compartilhar o .xlsx (iPhone e alguns aparelhos aceitam);
//   2) senão, compartilha a mesma planilha em .csv (abre no Excel/Planilhas, e o WhatsApp aceita);
//   3) senão (computador), baixa o .xlsx e avisa.
import { showToast } from './aviso-tela.js';

export async function carregarXLSX() {
  if (window.XLSX) return window.XLSX;
  await new Promise((ok, erro) => { const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = ok; s.onerror = () => erro(new Error('Sem internet pra montar a planilha')); document.head.appendChild(s); });
  return window.XLSX;
}

async function _compartilhar(file, titulo) {
  if (!navigator.canShare?.({ files: [file] })) return false;
  try { await navigator.share({ files: [file], title: titulo }); }
  catch (e) { if (e?.name !== 'AbortError') throw e; }   // fechar o menu sem escolher não é erro
  return true;
}

// X = SheetJS, ws = a aba, aba = nome da aba, base = nome do arquivo sem extensão
export async function compartilharPlanilha(X, ws, aba, base) {
  const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, aba);
  const tipo = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const blob = new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })], { type: tipo });
  const xlsx = new File([blob], `${base}.xlsx`, { type: tipo });
  if (await _compartilhar(xlsx, base)) return;
  // CSV com ";" e BOM: o Excel em português abre com as colunas certas e os acentos certos
  const csv = new File(['﻿' + X.utils.sheet_to_csv(ws, { FS: ';' })], `${base}.csv`, { type: 'text/csv' });
  if (await _compartilhar(csv, base)) return;
  const u = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = u; a.download = xlsx.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
  showToast('📗 Planilha baixada. No WhatsApp, anexe em 📎 Documento.', 'success');
}
