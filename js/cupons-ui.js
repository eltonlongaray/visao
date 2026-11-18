// ─── ÍNDICE ──────────────────────────────────────────────────
// CUPONS DE DESCONTO (18/11/2026) — lado da PROFISSIONAL
//   BLOCO 1 — dados (tabela `cupons` + uso contado pelos agendamentos)
//   BLOCO 2 — popup "🎟️ Cupons de desconto" (criar, sessões −/+, renovar, pausar)
//   BLOCO 3 — cupom gerado PRA UMA cliente (no perfil) + mandar pelo WhatsApp
// Cada código vale N sessões por ciclo (padrão 5). Uso = agendamentos com o
// cupom, não cancelados, desde o início do ciclo (cancelou → volta pro saldo).
// "Renovar" começa um ciclo novo com o MESMO código. Ao finalizar, o pagamento
// já vem como cortesia (100%) ou com o desconto (financeiro-ui.js).
// SQL: sql/cupons.sql + sql/cupons-limite.sql
// ─────────────────────────────────────────────────────────────
import { supabase } from './config-supabase.js';
import { auth } from './autenticacao.js';
import { showToast } from './aviso-tela.js';
import { trapModalBack } from './modal-voltar.js';

// === BLOCO 1: DADOS ===
const _esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const _dig = s => String(s || '').replace(/\D/g, '');
const _erro = e => new Error(/cupons|limite|ciclo_inicio|cliente_digitos/i.test(e?.message || '')
  ? 'Falta rodar o SQL dos cupons (sql/cupons.sql e sql/cupons-limite.sql)' : (e?.message || 'Erro'));

async function _listar() {
  const { data, error } = await supabase.from('cupons').select('*').order('created_at', { ascending: true });
  if (error) throw _erro(error);
  return data || [];
}
// Quantas sessões cada código já usou no ciclo atual.
async function _usos(lista) {
  const { data, error } = await supabase.from('agendamentos').select('cupom, status, created_at').not('cupom', 'is', null);
  if (error) return {};
  const out = {};
  for (const c of lista) {
    const ini = c.ciclo_inicio || c.created_at || '';
    out[c.id] = (data || []).filter(a => String(a.cupom).toUpperCase() === String(c.codigo).toUpperCase()
      && a.status !== 'cancelado' && a.created_at >= ini).length;
  }
  return out;
}
// Código fácil de ditar: primeiro nome + desconto (MARIA10). Se já existe, acrescenta número.
function _codigoPara(nome, desconto, existentes) {
  const base = (String(nome || 'CLIENTE').trim().split(/\s+/)[0] || 'CLIENTE').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'CLIENTE';
  const fim = desconto >= 100 ? 'VIP' : String(desconto);
  const usados = new Set(existentes.map(x => String(x.codigo).toUpperCase()));
  let cod = base + fim, n = 2;
  while (usados.has(cod)) cod = base + fim + (n++);
  return cod;
}
const _txtDesc = d => d >= 100 ? 'desconto integral' : `${d}% de desconto`;

// === BLOCO 2: POPUP ===
export async function abrirCupons() {
  let lista = [], usos = {}, erro = '';
  try { lista = await _listar(); lista.forEach(c => { if (c.limite == null) c.limite = 5; }); usos = await _usos(lista); } catch (e) { erro = e.message; }
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'cup-ov';
  document.body.appendChild(ov);
  const close = trapModalBack(() => ov.remove());
  ov.addEventListener('click', e => { if (e.target === ov) close(); });

  const linha = c => {
    const usados = c._renovar ? 0 : (usos[c.id] || 0), rest = Math.max(0, c.limite - usados);
    return `<div class="cp-cup" data-cup="${_esc(c.id)}">
      <div class="cp-cup-lin">
        <input class="cp-cup-cod" value="${_esc(c.codigo)}" maxlength="30" data-f="codigo" aria-label="Código">
        <label class="cp-cup-pct"><input inputmode="numeric" value="${c.desconto}" maxlength="3" data-f="desconto" aria-label="Desconto em %">%</label>
        <button type="button" class="cp-cup-on ${c.ativo ? 'on' : ''}" data-on>${c.ativo ? 'Ativo' : 'Pausado'}</button>
      </div>
      ${c.cliente_nome ? `<div class="cp-cup-cli">👤 Só pra ${_esc(c.cliente_nome)}</div>` : ''}
      <div class="cp-cup-ses">
        <span>Sessões</span>
        <button type="button" data-menos aria-label="Menos uma sessão">−</button><b>${c.limite}</b><button type="button" data-mais aria-label="Mais uma sessão">+</button>
        <span class="cp-cup-saldo ${rest === 0 ? 'zero' : ''}">${usados} usada${usados === 1 ? '' : 's'} · ${rest === 0 ? 'acabou' : `resta${rest === 1 ? '' : 'm'} ${rest}`}</span>
      </div>
      ${rest === 0 && !c._novo ? '<button type="button" class="fi-btn" data-renovar>↻ Continuar com o mesmo código (mais sessões)</button>' : ''}
      ${c._renovar ? '<div class="cp-cup-cli">↻ Novo ciclo começa ao salvar</div>' : ''}
      <input class="cp-cup-desc" value="${_esc(c.descricao || '')}" maxlength="120" data-f="descricao" placeholder="Anotação só sua. Ex: Larissa, modelo de glúteos, 5 sessões de Deusa Grega">
    </div>`;
  };
  const desenhar = () => {
    ov.innerHTML = `<div class="modal ag-fmodal"><div class="ag-fcorpo">
      <div class="ag-fhead">🎟️ Cupons de desconto</div>
      <div class="fi-secao-sub" style="margin-top:0">Quem agenda pelo seu link digita o código. Cada código tem o seu desconto (<b>100% = integral</b>, a pessoa não paga) e um número de sessões: o saldo baixa sozinho a cada agendamento e volta se a pessoa cancelar.</div>
      ${erro ? `<div class="fi-aviso">${_esc(erro)}</div>` : ''}
      ${lista.map(linha).join('') || (erro ? '' : '<div class="fi-vazio">Nenhum cupom ainda.</div>')}
      <div class="fi-secao-sub">Pra apagar um cupom, deixe o código em branco e salve. Cupom de uma cliente só: abra a cliente em 👥 Clientes → 🎟️ Gerar cupom.</div>
      ${erro ? '' : '<button class="fi-btn" id="cup-novo" type="button">➕ Novo cupom</button>'}
      <div class="ag-fbtns">
        <button class="btn-secondary" id="cup-fechar" type="button">Fechar</button>
        ${erro ? '' : '<button class="btn-primary" id="cup-salvar" type="button">Salvar</button>'}
      </div>
    </div></div>`;
    ov.querySelector('#cup-fechar').onclick = () => close();
    ov.querySelector('#cup-novo')?.addEventListener('click', () => {
      lerTela(); lista.push({ id: 'novo' + Date.now(), codigo: lista.length ? '' : 'PARCERIA', desconto: 100, limite: 5, ativo: true, descricao: '', _novo: true }); desenhar();
      const ult = ov.querySelectorAll('.cp-cup-cod'); ult[ult.length - 1]?.focus();
    });
    const doCup = el => lista.find(x => x.id === el.closest('[data-cup]').dataset.cup);
    ov.querySelectorAll('[data-on]').forEach(b => b.onclick = () => { lerTela(); const c = doCup(b); c.ativo = !c.ativo; desenhar(); });
    ov.querySelectorAll('[data-menos]').forEach(b => b.onclick = () => { lerTela(); const c = doCup(b); c.limite = Math.max(1, c.limite - 1); desenhar(); });
    ov.querySelectorAll('[data-mais]').forEach(b => b.onclick = () => { lerTela(); const c = doCup(b); c.limite = Math.min(999, c.limite + 1); desenhar(); });
    ov.querySelectorAll('[data-renovar]').forEach(b => b.onclick = () => { lerTela(); const c = doCup(b); c._renovar = true; c.limite = 5; c.ativo = true; desenhar(); });
    ov.querySelector('#cup-salvar')?.addEventListener('click', salvar);
  };
  const lerTela = () => ov.querySelectorAll('[data-cup]').forEach(el => {
    const c = lista.find(x => x.id === el.dataset.cup); if (!c) return;
    c.codigo = el.querySelector('[data-f="codigo"]').value.trim().toUpperCase().replace(/\s+/g, '');
    c.desconto = Math.max(1, Math.min(100, parseInt(el.querySelector('[data-f="desconto"]').value, 10) || 100));
    c.descricao = el.querySelector('[data-f="descricao"]').value.trim();
  });
  async function salvar() {
    lerTela();
    const uid = auth.currentUser?.uid; if (!uid) { showToast('Sessão expirada', 'error'); return; }
    const codigos = lista.map(c => c.codigo).filter(Boolean);
    if (new Set(codigos).size !== codigos.length) { showToast('Tem dois cupons com o mesmo código', 'error'); return; }
    const b = ov.querySelector('#cup-salvar'); b.disabled = true; b.textContent = 'Salvando…';
    try {
      for (const c of lista) {
        if (!c.codigo) {   // código apagado = apagar o cupom
          if (!c._novo) { const { error } = await supabase.from('cupons').delete().eq('id', c.id); if (error) throw _erro(error); }
          continue;
        }
        const row = { codigo: c.codigo, desconto: c.desconto, limite: c.limite, ativo: c.ativo, descricao: c.descricao || null };
        if (c._renovar) row.ciclo_inicio = new Date().toISOString();
        const { error } = c._novo
          ? await supabase.from('cupons').insert({ ...row, owner_id: uid })
          : await supabase.from('cupons').update(row).eq('id', c.id);
        if (error) throw _erro(error);
      }
      close(); showToast('🎟️ Cupons salvos', 'success');
    } catch (e) { showToast(e.message, 'error'); b.disabled = false; b.textContent = 'Salvar'; }
  }
  desenhar();
}

// === BLOCO 3: CUPOM PRA UMA CLIENTE (perfil) ===
// linkAgenda: link público da agenda (vai junto na mensagem do WhatsApp).
export async function gerarCupomCliente(c, { linkAgenda = '' } = {}) {
  let existentes = [];
  try { existentes = await _listar(); } catch (e) { showToast(e.message, 'error'); return; }
  const st = { desconto: 10, limite: 1 };
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'cup-cli-ov';
  document.body.appendChild(ov);
  const close = trapModalBack(() => ov.remove());
  ov.addEventListener('click', e => { if (e.target === ov) close(); });
  const primeiro = String(c.nome || '').trim().split(/\s+/)[0] || '';
  let codigo = _codigoPara(c.nome, st.desconto, existentes), codigoEditado = false;

  const desenhar = () => {
    ov.innerHTML = `<div class="modal ag-fmodal"><div class="ag-fcorpo">
      <div class="ag-fhead">🎟️ Cupom pra ${_esc(primeiro || 'a cliente')}</div>
      <div class="fi-secao-sub" style="margin-top:0">Só vale com o WhatsApp dela${c.contato ? ` (${_esc(c.contato)})` : ''}.</div>
      ${c.contato ? '' : '<div class="fi-aviso">Essa cliente está sem WhatsApp: cadastre o contato antes de gerar o cupom.</div>'}
      <div class="input-field-label">Desconto</div>
      <div class="fin-formas">${[10, 15, 20, 30, 50, 100].map(d => `<button type="button" class="fin-forma ${st.desconto === d ? 'on' : ''}" data-d="${d}">${d === 100 ? 'Integral' : d + '%'}</button>`).join('')}</div>
      <div class="cp-cup-ses" style="margin:12px 0">
        <span>Sessões</span>
        <button type="button" id="cc-menos" aria-label="Menos uma sessão">−</button><b>${st.limite}</b><button type="button" id="cc-mais" aria-label="Mais uma sessão">+</button>
      </div>
      <label class="input-field"><div class="input-field-label">Código</div>
        <input id="cc-cod" class="cp-cup-cod" value="${_esc(codigo)}" maxlength="30"></label>
      <div class="ag-fbtns">
        <button class="btn-secondary" id="cc-fechar" type="button">Cancelar</button>
        <button class="btn-primary" id="cc-criar" type="button"${c.contato ? '' : ' disabled'}>Gerar e mandar no WhatsApp</button>
      </div>
    </div></div>`;
    ov.querySelector('#cc-fechar').onclick = () => close();
    ov.querySelectorAll('[data-d]').forEach(b => b.onclick = () => {
      st.desconto = +b.dataset.d; if (!codigoEditado) codigo = _codigoPara(c.nome, st.desconto, existentes); desenhar();
    });
    ov.querySelector('#cc-menos').onclick = () => { st.limite = Math.max(1, st.limite - 1); desenhar(); };
    ov.querySelector('#cc-mais').onclick = () => { st.limite = Math.min(99, st.limite + 1); desenhar(); };
    ov.querySelector('#cc-cod').oninput = e => { codigo = e.target.value.toUpperCase().replace(/\s+/g, ''); codigoEditado = true; };
    ov.querySelector('#cc-criar').onclick = criar;
  };
  async function criar() {
    const uid = auth.currentUser?.uid; if (!uid) { showToast('Sessão expirada', 'error'); return; }
    if (!codigo) { showToast('Coloque um código', 'error'); return; }
    if (existentes.some(x => String(x.codigo).toUpperCase() === codigo)) { showToast('Já existe um cupom com esse código', 'error'); return; }
    // abre a janela JÁ no clique (o navegador do celular bloqueia window.open depois de um await)
    const janela = window.open('', '_blank');
    const b = ov.querySelector('#cc-criar'); b.disabled = true; b.textContent = 'Gerando…';
    const { error } = await supabase.from('cupons').insert({ owner_id: uid, codigo, desconto: st.desconto, limite: st.limite, ativo: true,
      cliente_nome: c.nome || null, cliente_digitos: _dig(c.contato) || null, descricao: `Cupom da cliente ${c.nome || ''}`.trim() });
    if (error) { janela?.close(); showToast(_erro(error).message, 'error'); b.disabled = false; b.textContent = 'Gerar e mandar no WhatsApp'; return; }
    close();
    showToast(`🎟️ Cupom ${codigo} criado`, 'success');
    const ses = st.limite === 1 ? '1 sessão' : `${st.limite} sessões`;
    const msg = `Oi ${primeiro}! 💜 Separei um presente pra você: *${_txtDesc(st.desconto)}* em ${ses}.\n\n`
      + `Na hora de agendar${linkAgenda ? ` (${linkAgenda})` : ''}, toque em "Tenho um cupom de desconto" e digite: *${codigo}*\n\n`
      + `Ele vale só pro seu WhatsApp.`;
    let d = _dig(c.contato); if (d.length <= 11) d = '55' + d;
    const url = `https://wa.me/${d}?text=${encodeURIComponent(msg)}`;
    if (janela) janela.location.href = url; else location.href = url;
  }
  desenhar();
}
