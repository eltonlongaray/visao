// ─── ÍNDICE ──────────────────────────────────────────────────
// IDENTIDADE VISUAL DA PROFISSIONAL (18/11/2026)
//   Paleta pronta ou cores próprias, logo e nome que vão nas artes do app
//   (cartão presente; depois, antes × depois e catálogo).
//   Guarda em agenda_config.ficha_cfg.marca = { paleta, cores, logo, nome }.
//   BLOCO 1 — abrir o popup · BLOCO 2 — prévia ao vivo · BLOCO 3 — salvar
// ─────────────────────────────────────────────────────────────
import { PALETAS, paletaDe, desenharCartao, paletaDaLogo } from './cartao-presente.js';
import { salvarFichaCfg } from './ficha.js';
import { subirFotoCorpo, assinarFotos } from './corpo.js';
import { showToast } from './aviso-tela.js';
import { trapModalBack } from './modal-voltar.js';

const _esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const CAMPOS = [['fundo', 'Fundo'], ['principal', 'Principal'], ['acento', 'Detalhes'], ['texto', 'Texto']];
export const nomeNegocioDe = cfg => (cfg?.ficha_cfg?.marca?.nome || String(cfg?.titulo || '').split(' · ')[1] || cfg?.titulo || '').trim();
export async function logoUrlDe(cfg) {
  const cam = cfg?.ficha_cfg?.marca?.logo; if (!cam) return null;
  try { return (await assinarFotos([cam])).get(cam) || null; } catch { return null; }
}

// === BLOCO 1: POPUP ===
export async function abrirIdentidade(cfg, aoSalvar) {
  const m0 = cfg.ficha_cfg?.marca || {};
  const st = { paleta: m0.paleta || 'lilas', cores: { ...(m0.cores || {}) }, logo: m0.logo || null, nome: nomeNegocioDe(cfg) };
  let logoUrl = await logoUrlDe(cfg), logoBlob = null;
  const ov = document.createElement('div'); ov.className = 'modal-overlay'; ov.id = 'idv-ov';
  document.body.appendChild(ov);
  const close = trapModalBack(() => ov.remove());
  ov.addEventListener('click', e => { if (e.target === ov) close(); });

  const pinta = () => {
    const P = paletaDe(st);
    ov.innerHTML = `<div class="modal ag-fmodal"><div class="ag-fcorpo">
      <div class="ag-fhead">🎨 Identidade visual</div>
      <div class="fi-secao-sub" style="margin-top:0">As cores e a logo do seu negócio entram nas artes que o app gera, como o <b>cartão presente</b>.</div>
      <div class="idv-previa" id="idv-previa"><span>Montando a prévia…</span></div>
      <div class="ag-sub-tit">Paleta</div>
      <div class="idv-paletas">${Object.entries(PALETAS).map(([k, p]) => `<button type="button" class="idv-pal ${st.paleta === k && !Object.keys(st.cores).length ? 'on' : ''}" data-pal="${k}">
        <span class="idv-bolas"><i style="background:${p.fundo}"></i><i style="background:${p.principal}"></i><i style="background:${p.acento}"></i></span>${_esc(p.nome)}</button>`).join('')}</div>
      <div class="ag-sub-tit">Ou as cores exatas da marca</div>
      <div class="idv-cores">${CAMPOS.map(([k, l]) => `<label class="idv-cor"><input type="color" data-cor="${k}" value="${P[k]}"><span>${l}</span></label>`).join('')}</div>
      <div class="ag-sub-tit">Logo</div>
      <div class="idv-logo">
        ${logoUrl ? `<img src="${_esc(logoUrl)}" alt="Logo">` : '<span class="fi-vazio">Sem logo: o cartão usa a inicial do nome.</span>'}
        <div class="idv-logo-btns">
          <button type="button" class="fi-btn" id="idv-logo-btn">${logoUrl ? 'Trocar logo' : '➕ Enviar logo'}</button>
          ${logoUrl ? '<button type="button" class="fi-btn" id="idv-logo-cores">🎨 Usar as cores da logo</button><button type="button" class="fi-btn" id="idv-logo-tirar">Tirar logo</button>' : ''}
        </div>
        <input type="file" id="idv-logo-in" accept="image/*" hidden>
      </div>
      <label class="input-field"><div class="input-field-label">Nome que aparece nas artes</div>
        <input id="idv-nome" maxlength="40" value="${_esc(st.nome)}"></label>
      <div class="ag-fbtns">
        <button class="btn-secondary" id="idv-fechar" type="button">Cancelar</button>
        <button class="btn-primary" id="idv-salvar" type="button">Salvar</button>
      </div>
    </div></div>`;
    const $ = q => ov.querySelector(q);
    $('#idv-fechar').onclick = () => close();
    ov.querySelectorAll('[data-pal]').forEach(b => b.onclick = () => { st.paleta = b.dataset.pal; st.cores = {}; pinta(); });
    ov.querySelectorAll('[data-cor]').forEach(i => i.onchange = () => { st.cores = { ...paletaDe(st), ...st.cores, [i.dataset.cor]: i.value }; delete st.cores.nome; pinta(); });
    $('#idv-nome').oninput = e => { st.nome = e.target.value; previa(); };
    $('#idv-logo-btn').onclick = () => $('#idv-logo-in').click();
    $('#idv-logo-in').onchange = async e => {
      const f = e.target.files?.[0]; if (!f) return;
      logoBlob = f; logoUrl = URL.createObjectURL(f); st.logo = '__novo';
      const pal = await paletaDaLogo(f).catch(() => null);
      if (pal) showToast('Logo carregada. Toque em "Usar as cores da logo" se quiser.', 'info');
      pinta();
    };
    $('#idv-logo-cores')?.addEventListener('click', async () => {
      const blob = logoBlob || await (await fetch(logoUrl)).blob();
      const pal = await paletaDaLogo(blob).catch(() => null);
      if (!pal) { showToast('Não achei cores na logo', 'info'); return; }
      st.cores = pal; pinta();
    });
    $('#idv-logo-tirar')?.addEventListener('click', () => { st.logo = null; logoUrl = null; logoBlob = null; pinta(); });
    $('#idv-salvar').onclick = salvar;
    previa();
  };

  // === BLOCO 2: PRÉVIA AO VIVO (o próprio cartão presente com dados de exemplo) ===
  let timer = null, ultimaUrl = null;
  function previa() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const blob = await desenharCartao({ cliente_nome: 'Maria', de_nome: 'Ana', servico_nome: 'Massagem relaxante', descricao: 'Você merece esse cuidado', codigo: 'PRESENTE-AB12', validade: new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10) },
          { marca: st, nomeNegocio: st.nome, logoUrl });
        const box = ov.querySelector('#idv-previa'); if (!box) return;
        if (ultimaUrl) URL.revokeObjectURL(ultimaUrl);
        ultimaUrl = URL.createObjectURL(blob);
        box.innerHTML = `<img src="${ultimaUrl}" alt="Prévia do cartão presente">`;
      } catch { /* prévia é só ajuda visual */ }
    }, 250);
  }

  // === BLOCO 3: SALVAR ===
  async function salvar() {
    const b = ov.querySelector('#idv-salvar'); b.disabled = true; b.textContent = 'Salvando…';
    try {
      if (st.logo === '__novo' && logoBlob) st.logo = await subirFotoCorpo(logoBlob, 'logo');
      const marca = { paleta: st.paleta, ...(Object.keys(st.cores).length ? { cores: st.cores } : {}), ...(st.logo ? { logo: st.logo } : {}), nome: (st.nome || '').trim() };
      const fc = { ...(cfg.ficha_cfg || {}), marca };
      await salvarFichaCfg(fc); cfg.ficha_cfg = fc;
      close(); showToast('🎨 Identidade visual salva', 'success'); aoSalvar?.();
    } catch (e) { showToast('Erro: ' + e.message, 'error'); b.disabled = false; b.textContent = 'Salvar'; }
  }
  pinta();
}
