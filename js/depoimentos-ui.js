// ─── ÍNDICE ──────────────────────────────────────────────────
// DEPOIMENTOS DOS CLIENTES (18/11/2026) — prints do WhatsApp e vídeos de
// depoimento guardados no perfil de cada cliente da Agenda Online.
//   BLOCO 1 — dados (tabela `depoimentos`, arquivo no R2 tipo "depo")
//   BLOCO 2 — bloco "💬 Depoimentos" no perfil (miniaturas + adicionar)
//   BLOCO 3 — ver um depoimento (legenda, pode divulgar, apagar)
// SQL: sql/depoimentos.sql · Arquivos: arquivos-r2.js (só a dona vê)
// ─────────────────────────────────────────────────────────────
import { supabase } from './config-supabase.js';
import { auth } from './autenticacao.js';
import { subirR2, assinarR2 } from './arquivos-r2.js';
import { mesmoNumero } from './ficha-modelo.js';
import { showToast, confirmModal } from './aviso-tela.js';
import { trapModalBack } from './modal-voltar.js';

// === BLOCO 1: DADOS ===
let _lista = null, _erroSql = false;
const _esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const _dig = s => String(s || '').replace(/\D/g, '');
const _dataBr = iso => { const [y, m, d] = String(iso || '').split('-'); return d ? `${d}/${m}/${y}` : ''; };
const MAX_VIDEO = 95 * 1024 * 1024;

async function _carregar() {
  if (_lista) return _lista;
  const { data, error } = await supabase.from('depoimentos').select('*').order('created_at', { ascending: false });
  if (error) { _erroSql = true; _lista = []; return _lista; }
  _erroSql = false; _lista = data || [];
  return _lista;
}
const _doCliente = c => (_lista || []).filter(d => c.contato
  ? mesmoNumero(d.cliente_digitos || d.cliente_contato, c.contato)
  : (!d.cliente_digitos && (d.cliente_nome || '').trim().toLowerCase() === (c.nome || '').trim().toLowerCase()));

// Print: reduz pra no máx. 1600 px (continua legível). Vídeo vai como está.
async function _prepararImagem(file) {
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { return file; }
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  if (bmp.close) bmp.close();
  const blob = await new Promise(res => cv.toBlob(b => res(b || file), 'image/jpeg', 0.85));
  cv.width = 0; cv.height = 0;
  return blob;
}

async function _adicionar(c, file) {
  const uid = auth.currentUser?.uid; if (!uid) throw new Error('Sessão expirada');
  const video = /^video\//.test(file.type);
  if (!video && !/^image\//.test(file.type)) throw new Error('Só foto/print ou vídeo');
  if (video && file.size > MAX_VIDEO) throw new Error('Vídeo grande demais (máx. 95 MB)');
  const blob = video ? file : await _prepararImagem(file);
  const ext = video ? ('.' + ((file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'mp4')) : '.jpg';
  const mime = video ? (file.type || 'video/mp4') : 'image/jpeg';
  const arquivo = await subirR2(uid, 'depo', blob, ext, mime);
  const row = { owner_id: uid, cliente_nome: c.nome || null, cliente_contato: c.contato || null, cliente_digitos: _dig(c.contato) || null,
    tipo: video ? 'video' : 'print', arquivo, mime };
  const { data, error } = await supabase.from('depoimentos').insert(row).select('*').single();
  if (error) throw new Error(/depoimentos/i.test(error.message || '') ? 'Falta rodar o SQL dos depoimentos (sql/depoimentos.sql)' : error.message);
  _lista.unshift(data);
  return data;
}

// === BLOCO 2: BLOCO NO PERFIL ===
export function depoimentosPerfilHtml() {
  return `<div class="dp-box" id="dp-box"><div class="dp-tit">💬 Depoimentos</div><div class="fi-vazio">Carregando…</div></div>`;
}

export async function wireDepoimentosPerfil(ov, c) {
  const box = ov.querySelector('#dp-box'); if (!box) return;
  await _carregar();
  const desenhar = async () => {
    const meus = _doCliente(c);
    box.innerHTML = `<div class="dp-tit">💬 Depoimentos${meus.length ? ` <small>${meus.length}</small>` : ''}</div>
      ${_erroSql ? '<div class="fi-aviso">Falta rodar o SQL dos depoimentos (sql/depoimentos.sql).</div>' : ''}
      ${meus.length ? `<div class="dp-grade">${meus.map(d => `<button class="dp-mini" type="button" data-dp="${_esc(d.id)}">
        ${d.tipo === 'video' ? '<span class="dp-play">▶</span>' : '<img alt="" data-cam="' + _esc(d.arquivo) + '">'}
        ${d.pode_divulgar ? '<span class="dp-ok">📣</span>' : ''}</button>`).join('')}</div>`
        : '<div class="fi-vazio">Prints do WhatsApp e vídeos que a cliente mandou ficam guardados aqui.</div>'}
      <button class="fi-btn" id="dp-add" type="button">➕ Adicionar print ou vídeo</button>
      <input type="file" id="dp-in" accept="image/*,video/*" multiple hidden>`;
    box.querySelector('#dp-add').onclick = () => box.querySelector('#dp-in').click();
    box.querySelector('#dp-in').onchange = async e => {
      const files = [...(e.target.files || [])]; if (!files.length) return;
      const b = box.querySelector('#dp-add'); b.disabled = true;
      let ok = 0;
      for (const [i, f] of files.entries()) {
        b.textContent = `Enviando ${i + 1} de ${files.length}…`;
        try { await _adicionar(c, f); ok++; } catch (err) { showToast(err.message, 'error'); }
      }
      if (ok) showToast(`💬 ${ok} depoimento${ok > 1 ? 's' : ''} guardado${ok > 1 ? 's' : ''}`, 'success');
      desenhar();
    };
    box.querySelectorAll('[data-dp]').forEach(el => el.onclick = () => {
      const d = _lista.find(x => x.id === el.dataset.dp); if (d) abrirDepoimento(d, desenhar);
    });
    const cams = meus.filter(d => d.tipo !== 'video').map(d => d.arquivo);
    if (cams.length) {
      const mapa = await assinarR2(cams);
      box.querySelectorAll('img[data-cam]').forEach(i => { const u = mapa.get(i.dataset.cam); if (u) i.src = u; });
    }
  };
  desenhar();
}

// === BLOCO 3: VER UM DEPOIMENTO ===
async function abrirDepoimento(d, aoMudar) {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'dp-ver-ov';
  ov.innerHTML = `<div class="modal ag-fmodal"><div class="ag-fcorpo">
    <div class="ag-fhead">💬 ${d.tipo === 'video' ? 'Vídeo' : 'Print'} · ${_esc((d.cliente_nome || '').split(' ')[0])}</div>
    <div class="fi-secao-sub" style="margin-top:0">Guardado em ${_dataBr(d.data)}</div>
    <div class="dp-midia" id="dp-midia"><div class="fi-vazio">Carregando…</div></div>
    <label class="input-field"><div class="input-field-label">Legenda <span class="ag-lbl-opt">— opcional</span></div>
      <input id="dp-leg" maxlength="200" placeholder="Ex: depois da 3ª sessão de Deusa Grega" value="${_esc(d.legenda || '')}"></label>
    <button type="button" class="fi-tipo ${d.pode_divulgar ? 'on' : ''}" id="dp-div"><span class="fi-chk"></span>📣 A cliente autorizou divulgar</button>
    <button class="fi-excluir" id="dp-apagar" type="button">🗑 Apagar depoimento</button>
    <div class="ag-fbtns">
      <button class="btn-secondary" id="dp-fechar" type="button">Fechar</button>
      <button class="btn-primary" id="dp-salvar" type="button">Salvar</button>
    </div>
  </div></div>`;
  document.body.appendChild(ov);
  const close = trapModalBack(() => ov.remove());
  ov.addEventListener('click', e => { if (e.target === ov) close(); });
  let divulgar = !!d.pode_divulgar;
  ov.querySelector('#dp-div').onclick = e => { divulgar = !divulgar; e.currentTarget.classList.toggle('on', divulgar); };
  ov.querySelector('#dp-fechar').onclick = () => close();
  ov.querySelector('#dp-salvar').onclick = async () => {
    const upd = { legenda: ov.querySelector('#dp-leg').value.trim() || null, pode_divulgar: divulgar };
    const { error } = await supabase.from('depoimentos').update(upd).eq('id', d.id);
    if (error) { showToast(error.message, 'error'); return; }
    Object.assign(d, upd); close(); aoMudar?.(); showToast('✅ Salvo', 'success');
  };
  ov.querySelector('#dp-apagar').onclick = async () => {
    const ok = await confirmModal({ title: 'Apagar depoimento?', message: 'O print ou vídeo some do perfil da cliente.', confirmText: 'Apagar', danger: true });
    if (!ok) return;
    const { error } = await supabase.from('depoimentos').delete().eq('id', d.id);
    if (error) { showToast(error.message, 'error'); return; }
    _lista = _lista.filter(x => x.id !== d.id); close(); aoMudar?.(); showToast('Depoimento apagado', 'info');
  };
  const u = (await assinarR2([d.arquivo])).get(d.arquivo);
  const box = ov.querySelector('#dp-midia');
  if (!u) { box.innerHTML = '<div class="fi-aviso">Não consegui abrir o arquivo agora.</div>'; return; }
  box.innerHTML = d.tipo === 'video'
    ? `<video src="${_esc(u)}" controls playsinline preload="metadata"></video>`
    : `<a href="${_esc(u)}" target="_blank" rel="noopener"><img src="${_esc(u)}" alt="Print do depoimento"></a>`;
}
