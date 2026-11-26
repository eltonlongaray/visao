// ═══════════════════════════════════════════════════════════════
// FALCON · Financeiro → aba 💼 Profissional (Élton, 25/11/2026)
// Receita do mês separada por FONTE DE RENDA, cada uma no seu card:
//   💆 Clientes  → tabela vendas (o que entra pela Agenda Online)
//   🎓 Mentoria  → mentoria_leads com pago_em (Fontes de renda extra)
// Só LÊ: quem lança continua sendo a Agenda (vendas) e a Mentoria (✅ Pagou).
// Uma fonte que falhar mostra o aviso dela sem esconder as outras.
// ═══════════════════════════════════════════════════════════════

// === BLOCO 1: IMPORTS E ESTADO ===
import { getVendas, somar } from './financeiro.js';
import { getLeads } from './mentoria.js';

let _mes = null;            // 'AAAA-MM' escolhido (null = mês atual)
let _dados = null;          // { vendas, leads, erroVendas, erroLeads }
const _abertos = new Set(); // cards com a lista aberta

const _esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const _pad = n => String(n).padStart(2, '0');
const _mesAtual = () => { const d = new Date(); return `${d.getFullYear()}-${_pad(d.getMonth() + 1)}`; };
const _reais = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const _nomeMes = k => { const [a, m] = k.split('-').map(Number); const t = `${MESES[m - 1]} de ${a}`; return t[0].toUpperCase() + t.slice(1); };
const _somaMes = (k, n) => { const [a, m] = k.split('-').map(Number); const d = new Date(a, m - 1 + n, 1); return `${d.getFullYear()}-${_pad(d.getMonth() + 1)}`; };
const _dataBr = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}/${m[2]}` : ''; };
// pago_em é timestamptz (gravado ao meio-dia local): data LOCAL, não a UTC
const _diaLocal = ts => { const d = new Date(ts); return isNaN(d) ? '' : `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}`; };
const FORMAS = { pix: 'Pix', cartao: 'Cartão', parcelado: 'Parcelado', dinheiro: 'Dinheiro', outro: 'Outro' };

// === BLOCO 2: CARREGAR (as duas fontes ao mesmo tempo) ===
async function _carregar() {
  const [v, l] = await Promise.allSettled([getVendas(), getLeads()]);
  _dados = {
    vendas: v.status === 'fulfilled' ? v.value : [],
    leads: l.status === 'fulfilled' ? l.value : [],
    erroVendas: v.status === 'rejected' ? (v.reason?.message || 'erro') : null,
    erroLeads: l.status === 'rejected' ? (l.reason?.message || 'erro') : null,
  };
}

// === BLOCO 3: AS FONTES DO MÊS ===
function _fontes(mes) {
  const { vendas, leads, erroVendas, erroLeads } = _dados;
  const vMes = vendas.filter(v => String(v.data || '').slice(0, 7) === mes);
  const sv = somar(vMes);
  const pagas = leads.filter(l => l.pago_em);
  const lMes = pagas.filter(l => _diaLocal(l.pago_em).slice(0, 7) === mes);
  const totalMentoria = lMes.reduce((t, l) => t + (Number(l.pago_valor) || 0), 0);
  const fontes = [];
  // Só aparece a fonte que a pessoa usa (tem algum lançamento em qualquer mês) ou que deu erro
  if (vendas.length || erroVendas) fontes.push({
    id: 'clientes', ic: '💆', nome: 'Clientes', cor: '#34d399', erro: erroVendas,
    total: sv.bruto, linhaSub: vMes.length ? `${sv.qtd} venda${sv.qtd === 1 ? '' : 's'} · custo ${_reais(sv.custo)} · lucro ${_reais(sv.lucro)}` : 'Nenhuma venda neste mês',
    itens: vMes.slice().sort((a, b) => (a.data < b.data ? 1 : -1)).map(v => ({
      t: v.cliente_nome || 'Cliente', s: [v.item, FORMAS[v.forma] || v.forma].filter(Boolean).join(' · '), d: _dataBr(v.data), v: v.valor,
    })),
  });
  if (pagas.length || erroLeads) {
    const semValor = lMes.filter(l => l.pago_valor == null).length;
    fontes.push({
      id: 'mentoria', ic: '🎓', nome: 'Mentoria', cor: '#a78bfa', erro: erroLeads,
      total: totalMentoria,
      linhaSub: lMes.length ? `${lMes.length} aluna${lMes.length === 1 ? ' pagou' : 's pagaram'}${semValor ? ` · ${semValor} sem valor anotado` : ''}` : 'Nenhum pagamento neste mês',
      itens: lMes.slice().sort((a, b) => (a.pago_em < b.pago_em ? 1 : -1)).map(l => ({
        t: l.nome || 'Aluna',
        s: [FORMAS[l.pago_forma] || l.pago_forma, l.pago_forma === 'parcelado' && l.pago_parcelas ? `${l.pago_parcelas}x` : ''].filter(Boolean).join(' '),
        d: _dataBr(_diaLocal(l.pago_em)), v: l.pago_valor, semValor: l.pago_valor == null,
      })),
    });
  }
  return fontes;
}

// === BLOCO 4: DESENHO ===
function _html() {
  const mes = _mes || _mesAtual();
  const fontes = _fontes(mes);
  const total = fontes.reduce((t, f) => t + (f.erro ? 0 : f.total), 0);
  const nav = `<div class="finp-nav">
    <button type="button" class="finp-seta" data-finp-mes="-1" aria-label="Mês anterior">‹</button>
    <div class="finp-mes">${_nomeMes(mes)}</div>
    <button type="button" class="finp-seta" data-finp-mes="1" aria-label="Próximo mês" ${mes >= _mesAtual() ? 'disabled' : ''}>›</button>
  </div>`;
  if (!fontes.length) return `${nav}<div class="fin-vazio">Ainda não tem nada lançado.<br>As vendas da <b>Agenda Online</b> e os pagamentos da <b>Mentoria</b> (Fontes de renda extra) aparecem aqui sozinhos, cada um no seu card.</div>`;
  return `${nav}
    <div class="finp-total"><small>Recebido no mês</small><b>${_reais(total)}</b>
      ${fontes.length > 1 ? `<div class="finp-barra">${fontes.filter(f => !f.erro && f.total > 0).map(f => `<i style="width:${(f.total / (total || 1) * 100).toFixed(1)}%;background:${f.cor}" title="${_esc(f.nome)}"></i>`).join('')}</div>` : ''}
    </div>
    ${fontes.map(f => {
      const aberto = _abertos.has(f.id);
      const pct = total > 0 && !f.erro ? Math.round(f.total / total * 100) : 0;
      return `<div class="finp-fonte" style="--fonte-cor:${f.cor}">
        <button type="button" class="finp-fonte-tit" data-finp-abrir="${f.id}" aria-expanded="${aberto}">
          <span class="finp-fonte-ic">${f.ic}</span>
          <span class="finp-fonte-tx"><b>${f.nome}</b><small>${f.erro ? `⚠️ Não deu pra carregar (${_esc(f.erro)})` : _esc(f.linhaSub)}</small></span>
          <span class="finp-fonte-val">${f.erro ? '—' : _reais(f.total)}${pct && fontes.length > 1 ? `<small>${pct}%</small>` : ''}</span>
          <span class="finp-fonte-seta">${aberto ? '▴' : '▾'}</span>
        </button>
        ${aberto && !f.erro ? `<div class="finp-itens">${f.itens.map(i => `<div class="finp-item">
            <span><b>${_esc(i.t)}</b>${i.s ? `<small>${_esc(i.s)}</small>` : ''}</span>
            <span class="finp-item-v">${i.semValor ? '<small>sem valor</small>' : _reais(i.v)}<small>${i.d}</small></span>
          </div>`).join('') || '<div class="finp-item"><small>Nada neste mês.</small></div>'}</div>` : ''}
      </div>`;
    }).join('')}
    <div class="finp-obs">Os valores vêm de onde você já lança: vendas na Agenda Online e "✅ Pagou" na Mentoria. Nada é digitado duas vezes.</div>`;
}

// === BLOCO 5: MONTAR NA TELA ===
export async function montarProfissional(box) {
  box.innerHTML = '<div class="fin-vazio">Carregando…</div>';
  await _carregar();
  if (!box.isConnected) return;
  const pinta = () => { box.innerHTML = _html(); };
  pinta();
  box.onclick = (e) => {
    const s = e.target.closest('[data-finp-mes]');
    if (s && !s.disabled) { _mes = _somaMes(_mes || _mesAtual(), Number(s.dataset.finpMes)); pinta(); return; }
    const a = e.target.closest('[data-finp-abrir]');
    if (a) { const id = a.dataset.finpAbrir; _abertos.has(id) ? _abertos.delete(id) : _abertos.add(id); pinta(); }
  };
}
