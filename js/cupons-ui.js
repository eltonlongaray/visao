// ─── ÍNDICE ──────────────────────────────────────────────────
// CUPONS DE DESCONTO (18/11/2026) — lado da PROFISSIONAL
//   BLOCO 1 — dados (tabela `cupons`, só a dona)
//   BLOCO 2 — popup "🎟️ Cupons" (criar, editar, ligar/desligar, apagar)
// Quem agenda pelo link digita o código; o agendamento ganha `cupom` e
// `cupom_desconto` (sql/cupons.sql). Ao finalizar, o pagamento já vem como
// cortesia (100%) ou com o desconto (financeiro-ui.js aoFinalizarAtendimento).
// ─────────────────────────────────────────────────────────────
import { supabase } from './config-supabase.js';
import { auth } from './autenticacao.js';
import { showToast } from './aviso-tela.js';
import { trapModalBack } from './modal-voltar.js';

// === BLOCO 1: DADOS ===
const _esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const _erro = e => new Error(/cupons/i.test(e?.message || '') ? 'Falta rodar o SQL dos cupons (sql/cupons.sql)' : (e?.message || 'Erro'));

async function _listar() {
  const { data, error } = await supabase.from('cupons').select('*').order('created_at', { ascending: true });
  if (error) throw _erro(error);
  return data || [];
}

// === BLOCO 2: POPUP ===
export async function abrirCupons() {
  let lista = [], erro = '';
  try { lista = await _listar(); } catch (e) { erro = e.message; }
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'cup-ov';
  document.body.appendChild(ov);
  const close = trapModalBack(() => ov.remove());
  ov.addEventListener('click', e => { if (e.target === ov) close(); });

  const desenhar = () => {
    ov.innerHTML = `<div class="modal ag-fmodal"><div class="ag-fcorpo">
      <div class="ag-fhead">🎟️ Cupons de desconto</div>
      <div class="fi-secao-sub" style="margin-top:0">Quem agenda pelo seu link pode digitar o cupom. Ele aparece no agendamento e, ao finalizar, o pagamento já vem como <b>cortesia</b> (100%) ou com o desconto.</div>
      ${erro ? `<div class="fi-aviso">${_esc(erro)}</div>` : ''}
      ${lista.map(c => `<div class="cp-cup-lin" data-cup="${_esc(c.id)}">
        <input class="cp-cup-cod" value="${_esc(c.codigo)}" maxlength="30" data-f="codigo" aria-label="Código">
        <input inputmode="numeric" value="${c.desconto}" maxlength="3" data-f="desconto" aria-label="Desconto em %" title="% de desconto">
        <button type="button" class="cp-cup-on ${c.ativo ? 'on' : ''}" data-on>${c.ativo ? 'Ativo' : 'Pausado'}</button>
        <input class="cp-cup-desc" value="${_esc(c.descricao || '')}" maxlength="80" data-f="descricao" placeholder="Pra quem e pra quê? Ex: Larissa, modelo de glúteos, 5 sessões de Deusa Grega">
      </div>`).join('') || (erro ? '' : '<div class="fi-vazio">Nenhum cupom ainda.</div>')}
      <div class="fi-secao-sub">Cada código tem o seu desconto em %. <b>100% = desconto integral</b> (parceria: a pessoa não paga nada). Pra apagar um cupom, deixe o código em branco e salve.</div>
      ${erro ? '' : '<button class="fi-btn" id="cup-novo" type="button">➕ Novo cupom</button>'}
      <div class="ag-fbtns">
        <button class="btn-secondary" id="cup-fechar" type="button">Fechar</button>
        ${erro ? '' : '<button class="btn-primary" id="cup-salvar" type="button">Salvar</button>'}
      </div>
    </div></div>`;
    ov.querySelector('#cup-fechar').onclick = () => close();
    ov.querySelector('#cup-novo')?.addEventListener('click', () => {
      lerTela(); lista.push({ id: 'novo' + Date.now(), codigo: lista.length ? '' : 'PARCERIA', desconto: 100, ativo: true, descricao: '', _novo: true }); desenhar();
      const ult = ov.querySelectorAll('.cp-cup-cod'); ult[ult.length - 1]?.focus();
    });
    ov.querySelectorAll('[data-on]').forEach(b => b.onclick = () => {
      lerTela(); const c = lista.find(x => x.id === b.closest('[data-cup]').dataset.cup); c.ativo = !c.ativo; desenhar();
    });
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
        const row = { codigo: c.codigo, desconto: c.desconto, ativo: c.ativo, descricao: c.descricao || null };
        if (!c.codigo) {   // código apagado = apagar o cupom
          if (!c._novo) { const { error } = await supabase.from('cupons').delete().eq('id', c.id); if (error) throw _erro(error); }
          continue;
        }
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

