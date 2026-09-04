// ─── ÍNDICE ──────────────────────────────────────────────────
// Página PÚBLICA da rifa: escolher 1+ números; ocupados marcados; doação extra
// opcional; gera Pix (QR + copia-e-cola) do total na chave do dono. O app NÃO
// processa pagamento — só mostra o código pra a pessoa pagar direto no banco.
// ─────────────────────────────────────────────────────────────
import { getRifa, getNumerosOcupados, escolherNumeros } from './rifa-publica-dados.js';

const _esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const _tela = inner => `<div class="rf-wrap">${inner}</div>`;
const _preco = v => (v == null ? '' : Number(v).toFixed(2).replace('.', ','));
const _dataBr = s => { try { const [y, m, d] = String(s).split('-'); return `${d}/${m}/${y}`; } catch { return s; } };
const _pad2 = n => String(n).padStart(2, '0');
const _semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const WA_SVG_RF = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style="flex:none"><path d="M17.5 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.09 3.2 5.07 4.49.71.31 1.26.49 1.69.63.71.23 1.35.19 1.86.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.42-.07-.12-.27-.19-.57-.34zM12 2a10 10 0 0 0-8.55 15.2L2 22l4.9-1.28A10 10 0 1 0 12 2zm5.9 15.9A8 8 0 0 1 7.6 19.2l-.28-.17-2.9.76.77-2.83-.18-.29A8 8 0 1 1 17.9 17.9z"/></svg>';

function _waRifaLink(rifa, extraMsg) {
  let d = String(rifa?.whatsapp || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length <= 11) d = '55' + d;
  const msg = encodeURIComponent(extraMsg || `Olá! Quero participar da ${rifa.titulo || 'rifa'} 🎟️`);
  return `https://wa.me/${d}?text=${msg}`;
}

// ── Pix "copia e cola" (BR Code EMV) + CRC16 ──────────────────
function _emv(id, value) { return id + String(value.length).padStart(2, '0') + value; }
function _crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) { crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1); crc &= 0xFFFF; }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
function _pixPayload({ chave, nome, cidade, valor, txid }) {
  const mai = _emv('26', _emv('00', 'br.gov.bcb.pix') + _emv('01', chave));
  const nomeF = _semAcento(nome || 'RECEBEDOR').toUpperCase().substring(0, 25);
  const cidadeF = _semAcento(cidade || 'BRASIL').toUpperCase().substring(0, 15);
  const ref = _semAcento(txid || '').toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 25) || '***';
  const add = _emv('62', _emv('05', ref));
  let p = _emv('00', '01') + mai + _emv('52', '0000') + _emv('53', '986');
  if (valor != null && valor > 0) p += _emv('54', Number(valor).toFixed(2));
  p += _emv('58', 'BR') + _emv('59', nomeF) + _emv('60', cidadeF) + add + '6304';
  return p + _crc16(p);
}

// ── Pix DINÂMICO via Mercado Pago (Edge Function) ─────────────
// Reserva os números + gera o Pix no MP; o webhook confirma sozinho.
const FN_URL = 'https://snbxaudykjpqqgocgaoz.supabase.co/functions/v1/quick-service';
async function _criarPix({ slug, numeros, nome, contato, valor }) {
  const r = await fetch(FN_URL + '?action=criar', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, numeros, nome, contato, valor }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) throw new Error(d.error || 'Falha ao gerar o Pix');
  return d; // { payment_id, qr_code, qr_code_base64, status }
}
async function _statusPix(paymentId) {
  try {
    const r = await fetch(FN_URL + '?action=status&payment_id=' + encodeURIComponent(paymentId));
    const d = await r.json().catch(() => ({}));
    return d.status || 'pending';
  } catch { return 'pending'; }
}

function cleanup() { document.body.classList.remove('rota-publica'); }
// Números que ESTE aparelho já reservou (registro local por rifa).
const _meusKey = slug => `falcon_rifa_${slug}`;
function _lerMeus(slug) { try { const a = JSON.parse(localStorage.getItem(_meusKey(slug)) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } }
function _salvarMeus(slug, nums) { try { const s = new Set([..._lerMeus(slug), ...nums]); localStorage.setItem(_meusKey(slug), JSON.stringify([...s].sort((a, b) => a - b))); } catch {} }
let _avisoT = null;
function _aviso(msg) {
  let el = document.querySelector('.ap-toast');
  if (!el) { el = document.createElement('div'); el.className = 'ap-toast'; document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('on');
  clearTimeout(_avisoT); _avisoT = setTimeout(() => el.classList.remove('on'), 2600);
}

export async function renderRifaPublica(app, slug) {
  document.body.classList.add('rota-publica');
  document.getElementById('visao-pet')?.classList.add('pet-hidden');
  app.innerHTML = _tela('<div class="ap-load">Carregando rifa…</div>');

  let rifa;
  try { rifa = await getRifa(slug); }
  catch { app.innerHTML = _tela('<div class="ap-erro">Não foi possível carregar esta rifa agora.</div>'); return cleanup; }
  if (!rifa) { app.innerHTML = _tela('<div class="ap-erro">Esta rifa não existe ou está encerrada. 🔒</div>'); return cleanup; }

  const total = rifa.total_numeros || 342;
  const valorNum = rifa.valor_numero != null ? Number(rifa.valor_numero) : 0;
  let ocupados = new Set();
  try { ocupados = await getNumerosOcupados(slug); } catch {}
  const sel = new Set();   // números selecionados (multi)
  let extra = 0;           // doação a mais (R$)
  let _pollT = null;       // polling do status do Pix
  const _pararPoll = () => { if (_pollT) { clearInterval(_pollT); _pollT = null; } };
  let _tickT = null, _drawPollT = null;   // contagem regressiva + poll do sorteio
  const _pararSorteioTimers = () => {
    if (_tickT) { clearInterval(_tickT); _tickT = null; }
    if (_drawPollT) { clearInterval(_drawPollT); _drawPollT = null; }
  };

  const _totalReais = () => sel.size * valorNum + (extra || 0);
  // Alvo da contagem: sorteio_em (data+hora) ou, no legado, data_sorteio às 20h.
  function _alvoMs() {
    if (rifa.sorteio_em) { const t = new Date(rifa.sorteio_em).getTime(); return isNaN(t) ? 0 : t; }
    if (rifa.data_sorteio) { const t = new Date(rifa.data_sorteio + 'T20:00:00').getTime(); return isNaN(t) ? 0 : t; }
    return 0;
  }
  function _fmtSorteioBr() {
    const ms = _alvoMs(); if (!ms) return '';
    const d = new Date(ms);
    return `📅 ${_pad2(d.getDate())}/${_pad2(d.getMonth() + 1)}/${d.getFullYear()} às ${_pad2(d.getHours())}:${_pad2(d.getMinutes())}`;
  }

  function desenhar() {
    _pararSorteioTimers();
    const livres = total - ocupados.size;
    const premios = Array.isArray(rifa.premios) ? rifa.premios : [];
    const wa = _waRifaLink(rifa);
    app.innerHTML = _tela(`
      <div class="rf-head">
        <div class="rf-titulo">🎟️ ${_esc(rifa.titulo || 'Falcon Rifa')}</div>
        ${rifa.subtitulo ? `<div class="rf-subt">${_esc(rifa.subtitulo)}</div>` : '<div class="rf-sub">Escolha seu número da sorte</div>'}
        ${rifa.descricao ? `<div class="rf-desc">${_esc(rifa.descricao)}</div>` : ''}
        <div class="rf-badges">
          ${valorNum ? `<span class="rf-badge">🎟️ R$ ${_preco(valorNum)} por número</span>` : ''}
          ${rifa.data_sorteio ? `<span class="rf-badge">📅 Sorteio: ${_dataBr(rifa.data_sorteio)}</span>` : ''}
        </div>
        ${premios.length ? `<div class="rf-premios">
          <div class="rf-premios-t">🏆 Prêmios</div>
          ${premios.map((p, i) => `<div class="rf-premio"><b>${i + 1}º</b> ${_esc(p)}</div>`).join('')}
        </div>` : ''}
        <div class="rf-info"><b>${livres}</b> disponíveis · ${ocupados.size} escolhidos</div>
      </div>
      ${_lerMeus(slug).length ? `<div class="rf-meus">🎟️ <b>Seus números:</b> ${_lerMeus(slug).join(', ')}${rifa.data_sorteio ? ` <span class="rf-meus-sorteio">· 📅 Sorteio ${_dataBr(rifa.data_sorteio)}</span>` : ''}</div>` : ''}
      <div class="rf-grid">
        ${Array.from({ length: total }, (_, i) => {
          const n = i + 1;
          return ocupados.has(n)
            ? `<span class="rf-num ocupado" title="Já escolhido">${n}</span>`
            : `<button class="rf-num ${sel.has(n) ? 'sel' : ''}" data-num="${n}" type="button">${n}</button>`;
        }).join('')}
      </div>
      ${sel.size ? _painelHtml() : '<div class="rf-dica">Toque nos números que quer reservar (pode escolher vários).</div>'}
      ${wa ? `<div class="ap-wa-pro-wrap"><a class="ap-wa-pro" href="${wa}" target="_blank" rel="noopener">${WA_SVG_RF} Me chama no WhatsApp</a></div>` : ''}
      <div id="rf-sorteio-sec"></div>
    `);
    wire();
    _montarSorteio();
  }

  // ── SORTEIO AO VIVO (fim do link): contagem → ao vivo → resultados ──
  // 1 resultado por PRÊMIO (a rifa pode ter vários prêmios = vários sorteios).
  function _montarSorteio() {
    const sec = app.querySelector('#rf-sorteio-sec');
    if (!sec) return;
    _pararSorteioTimers();
    const premios = Array.isArray(rifa.premios) && rifa.premios.length ? rifa.premios : ['Prêmio único'];
    const sorteados = Array.isArray(rifa.sorteados) ? rifa.sorteados : [];
    const st = rifa.sorteio_status;
    const alvo = _alvoMs();
    const comecou = st === 'ao_vivo' || st === 'encerrado' || sorteados.length > 0 || (alvo && Date.now() >= alvo);

    // 1) Sorteio começou → mostra a lista dos prêmios (ganhos + aguardando)
    if (comecou) {
      const porOrdem = {}; sorteados.forEach(s => { porOrdem[s.ordem] = s; });
      const encerrado = st === 'encerrado' || sorteados.length >= premios.length;
      sec.innerHTML = `<div class="rf-sorteio ${encerrado ? 'rf-sorteio-fim' : 'rf-sorteio-live'}">
        ${encerrado ? '' : '<div class="rf-live-badge">🔴 AO VIVO</div>'}
        <div class="rf-sorteio-t">${encerrado ? '🎉 Resultado do sorteio' : 'Sorteio acontecendo agora…'}</div>
        <div class="rf-draws">
          ${premios.map((p, i) => {
            const g = porOrdem[i + 1];
            return `<div class="rf-draw-row ${g ? 'ok' : ''}">
              <span class="rf-draw-premio">${i + 1}º · ${_esc(p)}</span>
              <span class="rf-draw-res">${g ? `<b class="rf-reveal">${g.numero}</b> <span class="rf-draw-nome">${_esc(g.nome || 'não vendido')}</span>` : '<i>aguardando…</i>'}</span>
            </div>`;
          }).join('')}
        </div>
        ${encerrado ? '<div class="rf-sorteio-sub">Parabéns aos ganhadores! 🏆</div>' : '<div class="rf-live-spin">🎲</div>'}
      </div>`;
      if (!encerrado) _drawPollT = setInterval(_checarSorteio, 4000);
      return;
    }
    // 2) Contagem regressiva
    if (alvo) {
      sec.innerHTML = `<div class="rf-sorteio">
        <div class="rf-sorteio-t">⏳ Sorteio ao vivo em</div>
        <div class="rf-countdown">
          <div class="rf-cd-cell"><b id="rf-cd-d">--</b><span>dias</span></div>
          <div class="rf-cd-cell"><b id="rf-cd-h">--</b><span>horas</span></div>
          <div class="rf-cd-cell"><b id="rf-cd-m">--</b><span>min</span></div>
          <div class="rf-cd-cell"><b id="rf-cd-s">--</b><span>seg</span></div>
        </div>
        <div class="rf-sorteio-sub">${_fmtSorteioBr()}</div>
      </div>`;
      const tick = () => {
        let dif = alvo - Date.now();
        if (dif <= 0) { _montarSorteio(); return; }   // vira "ao vivo"
        const d = Math.floor(dif / 86400000); dif -= d * 86400000;
        const h = Math.floor(dif / 3600000); dif -= h * 3600000;
        const m = Math.floor(dif / 60000); dif -= m * 60000;
        const s = Math.floor(dif / 1000);
        const put = (id, v) => { const e = app.querySelector(id); if (e) e.textContent = _pad2(v); };
        put('#rf-cd-d', d); put('#rf-cd-h', h); put('#rf-cd-m', m); put('#rf-cd-s', s);
      };
      tick();
      _tickT = setInterval(tick, 1000);
      _drawPollT = setInterval(_checarSorteio, 8000);   // dono pode sortear antes da hora
      return;
    }
    sec.innerHTML = '';   // sem data marcada
  }

  // Re-consulta a rifa; se saiu resultado novo ou mudou o status, re-render.
  async function _checarSorteio() {
    try {
      const r = await getRifa(slug);
      if (!r) return;
      const mudou = JSON.stringify(r.sorteados || []) !== JSON.stringify(rifa.sorteados || [])
        || r.sorteio_status !== rifa.sorteio_status;
      if (mudou) {
        rifa.sorteados = r.sorteados;
        rifa.sorteio_status = r.sorteio_status;
        _montarSorteio();
      }
    } catch {}
  }

  function _painelHtml() {
    const nums = [...sel].sort((a, b) => a - b);
    return `
      <div class="rf-form">
        <div class="rf-form-res">🎟️ ${nums.length} número${nums.length > 1 ? 's' : ''}: <b>${nums.join(', ')}</b></div>
        <label class="input-field"><div class="input-field-label">💛 Quer doar um valor a mais? (opcional)</div>
          <input id="rf-extra" inputmode="decimal" placeholder="R$ 0,00" value="${extra ? _preco(extra) : ''}"></label>
        <div class="rf-total">Total: <b>R$ ${_preco(_totalReais())}</b>${valorNum ? ` <small>(${nums.length} × R$ ${_preco(valorNum)}${extra ? ` + R$ ${_preco(extra)}` : ''})</small>` : ''}</div>
        <label class="input-field"><div class="input-field-label">Seu nome</div>
          <input id="rf-nome" placeholder="Nome completo" autocomplete="name"></label>
        <label class="input-field"><div class="input-field-label">Seu WhatsApp</div>
          <input id="rf-zap" inputmode="tel" placeholder="(DDD) 9 9999-9999" autocomplete="tel"></label>
        <button class="btn-primary" id="rf-confirmar" type="button">Reservar e pagar com Pix</button>
      </div>`;
  }

  function wire() {
    app.querySelectorAll('[data-num]').forEach(b => b.addEventListener('click', () => {
      const n = +b.dataset.num;
      if (sel.has(n)) sel.delete(n); else sel.add(n);
      desenhar();
    }));
    const ex = app.querySelector('#rf-extra');
    if (ex) ex.addEventListener('input', () => {
      const v = parseFloat(ex.value.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, ''));
      extra = isNaN(v) ? 0 : v;
      const t = app.querySelector('.rf-total b'); if (t) t.textContent = `R$ ${_preco(_totalReais())}`;
    });
    const c = app.querySelector('#rf-confirmar');
    if (c) c.addEventListener('click', confirmar);
  }

  async function confirmar() {
    const nome = app.querySelector('#rf-nome')?.value.trim() || '';
    const zap = app.querySelector('#rf-zap')?.value.trim() || '';
    if (nome.length < 2) { _aviso('Escreva seu nome'); return; }
    if (zap.replace(/\D/g, '').length < 8) { _aviso('Escreva um WhatsApp válido'); return; }
    const nums = [...sel].sort((a, b) => a - b);
    const valor = _totalReais();
    const btn = app.querySelector('#rf-confirmar'); btn.disabled = true; btn.textContent = 'Reservando…';
    try {
      if (rifa.pix_modo === 'estatico') {
        // Rifa do usuário: reserva o número + Pix estático na chave do próprio criador.
        await escolherNumeros(slug, nums, nome, zap);
        nums.forEach(n => ocupados.add(n));
        _salvarMeus(slug, nums);
        _telaPix(nums, valor, null);
      } else {
        // Rifa especial (Pitter) ou legado: Pix automático pelo Mercado Pago.
        btn.textContent = 'Gerando Pix…';
        const pix = await _criarPix({ slug, numeros: nums, nome, contato: zap, valor });
        nums.forEach(n => ocupados.add(n));
        _salvarMeus(slug, nums);
        _telaPix(nums, valor, pix);
      }
    } catch (e) {
      // Se o MP falhar mas houver chave do criador, cai pro Pix estático.
      if (rifa.pix_modo !== 'estatico' && rifa.pix_chave) {
        try {
          await escolherNumeros(slug, nums, nome, zap);
          nums.forEach(n => ocupados.add(n));
          _salvarMeus(slug, nums);
          _telaPix(nums, valor, null);
          return;
        } catch {}
      }
      _aviso(e.message || 'Não deu pra reservar');
      try { ocupados = await getNumerosOcupados(slug); } catch {}
      sel.clear(); desenhar();
    }
  }

  // Tela final com o Pix. `pix` = resposta do Mercado Pago (auto-confirma) OU
  // null (fallback estático — a pessoa envia o comprovante no WhatsApp).
  function _telaPix(nums, valor, pix) {
    _pararPoll();
    _pararSorteioTimers();
    const dinamico = !!(pix && (pix.qr_code || pix.qr_code_base64));
    const codigo = dinamico ? (pix.qr_code || '') : (rifa.pix_chave
      ? _pixPayload({ chave: rifa.pix_chave, nome: rifa.pix_nome, cidade: rifa.pix_cidade, valor, txid: 'RIFA' + slug }) : '');
    const qrImg = dinamico && pix.qr_code_base64 ? `data:image/png;base64,${pix.qr_code_base64}` : '';
    const wa = _waRifaLink(rifa, `Oi! Reservei o(s) número(s) ${nums.join(', ')} da ${rifa.titulo || 'rifa'} e já fiz o Pix 🎟️`);
    app.innerHTML = _tela(`
      <div class="rf-pix">
        <div class="rf-pix-t">🎟️ Número${nums.length > 1 ? 's' : ''} ${nums.join(', ')} reservado${nums.length > 1 ? 's' : ''}!</div>
        ${rifa.data_sorteio ? `<div class="rf-pix-sorteio">📅 Sorteio: <b>${_dataBr(rifa.data_sorteio)}</b></div>` : ''}
        <div class="rf-pix-valor">Pague <b>R$ ${_preco(valor)}</b> no Pix</div>
        ${dinamico ? `<div class="rf-pix-status" id="rf-status">⏳ Aguardando o pagamento cair…</div>` : ''}
        ${!dinamico && codigo ? `<div class="rf-pix-doacao">💛 Na <b>descrição/mensagem</b> do Pix escreva: <b>Doação — ${_esc(rifa.titulo || 'rifa')}</b></div>` : ''}
        ${codigo ? `${qrImg ? `<div class="rf-qr"><img src="${qrImg}" alt="QR Code Pix" width="220" height="220" style="border-radius:12px;background:#fff;padding:8px"></div>` : '<div class="rf-qr" id="rf-qr"></div>'}
        <div class="rf-pix-lbl">Pix copia e cola</div>
        <div class="rf-pix-code" id="rf-code">${_esc(codigo)}</div>
        <button class="btn-primary" id="rf-copiar" type="button">📋 Copiar código Pix</button>`
        : `<div class="rf-dica">Pix indisponível agora — combine o pagamento pelo WhatsApp.</div>`}
        ${wa ? `<a class="ap-wa-pro" href="${wa}" target="_blank" rel="noopener" style="margin-top:12px">${WA_SVG_RF} ${dinamico ? 'Me chama no WhatsApp' : 'Enviar comprovante no WhatsApp'}</a>` : ''}
        <button class="btn-secondary" id="rf-voltar" type="button" style="margin-top:10px">Ver a rifa</button>
      </div>`);
    // QR estático (fallback) desenhado via lib
    if (!qrImg && codigo && window.QRCode) {
      try { new window.QRCode(document.getElementById('rf-qr'), { text: codigo, width: 220, height: 220, correctLevel: window.QRCode.CorrectLevel.M }); } catch {}
    }
    app.querySelector('#rf-copiar')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(codigo); _aviso('✅ Código Pix copiado!'); }
      catch { _aviso('Selecione o código e copie'); }
    });
    app.querySelector('#rf-voltar')?.addEventListener('click', () => { _pararPoll(); sel.clear(); extra = 0; desenhar(); });

    // Confirmação automática: pergunta o status ao MP a cada 4s.
    if (dinamico && pix.payment_id) {
      let tentativas = 0;
      _pollT = setInterval(async () => {
        tentativas++;
        const st = await _statusPix(pix.payment_id);
        if (st === 'approved') {
          _pararPoll();
          const el = app.querySelector('#rf-status');
          if (el) { el.textContent = '✅ Pagamento confirmado! Obrigado 💛'; el.classList.add('ok'); }
          const t = app.querySelector('.rf-pix-t');
          if (t) t.textContent = `✅ Número${nums.length > 1 ? 's' : ''} ${nums.join(', ')} confirmado${nums.length > 1 ? 's' : ''}!`;
          const c = app.querySelector('#rf-copiar'); if (c) c.style.display = 'none';
          _aviso('✅ Pagamento confirmado!');
        } else if (['rejected', 'cancelled', 'refunded'].includes(st) || tentativas > 225) {
          _pararPoll();  // ~15 min de espera no máximo
        }
      }, 4000);
    }
  }

  desenhar();

  const _onVis = async () => {
    if (document.visibilityState !== 'visible') return;
    try { ocupados = await getNumerosOcupados(slug); if (!document.querySelector('.rf-pix')) desenhar(); } catch {}
  };
  document.addEventListener('visibilitychange', _onVis);
  return () => { _pararPoll(); _pararSorteioTimers(); document.removeEventListener('visibilitychange', _onVis); cleanup(); };
}
