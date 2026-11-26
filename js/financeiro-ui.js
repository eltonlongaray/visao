// ─── ÍNDICE ──────────────────────────────────────────────────
// Telas do FINANCEIRO (lado da profissional), usadas pela Agenda (agenda-ui.js):
//   · Perfil do cliente: 💆 tratamento (pacote: sessões feitas/faltam + próximo),
//     💰 compras (valor pago ✏️ editável), total pago · lucro · 💡 interesse
//   · Registrar/editar venda (atendimento, pacote, produto)
//   · Finalizar atendimento → lança a venda (ou conta a sessão do pacote)
//   · 💰 Financeiro: bruto e lucro do mês + histórico dos meses anteriores
//   · 📣 Campanhas: triagens → agendaram → atendidas → faturado, investido e retorno
// Dados: financeiro.js · SQL: sql/financeiro.sql
// ─────────────────────────────────────────────────────────────
import { getVendas, salvarVenda, excluirVenda, getFinCfg, salvarFinCfg, getCampanhas, salvarCampanha, pacotesDoCliente, somar, porMes, digitos } from './financeiro.js';
import { showToast } from './aviso-tela.js';
import { trapModalBack } from './modal-voltar.js';
import { supabase } from './config-supabase.js';

// === BLOCO 1: ESTADO E AJUDANTES ===
let _vendas = [], _fin = { custos: {}, produtos: [] }, _camps = [], _erroSql = false;
const _esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
export const reais = n => 'R$ ' + (Number(n) || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const _num = s => { const t = String(s ?? '').trim().replace(/\./g, '').replace(',', '.'); return t === '' ? 0 : Number(t) || 0; };
const _numTxt = n => (Number(n) || 0).toFixed(2).replace('.', ',');
const _hoje = () => new Date().toISOString().slice(0, 10);
const _fmtData = iso => { try { const [, m, d] = iso.split('-'); return `${d}/${m}`; } catch { return iso; } };
const SEM3 = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const _fmtDia = iso => { const [y, m, d] = iso.split('-').map(Number); const dt = new Date(y, m - 1, d); return `${SEM3[dt.getDay()]} ${_fmtData(iso)}`; };
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const _nomeMes = k => { const [y, m] = k.split('-').map(Number); return `${MESES[m - 1]} ${y}`; };
const FORMAS = [['pix', 'Pix'], ['cartao', 'Cartão'], ['dinheiro', 'Dinheiro'], ['cortesia', 'Cortesia']];   // cortesia = não cobrou (modelo, brinde…)
const _formaTxt = f => (FORMAS.find(x => x[0] === f) || [, ''])[1];
export const vendasDoCliente = c => _vendasDe(c);
const _vendasDe = c => { const d = digitos(c.contato || c.key); return d ? _vendas.filter(v => digitos(v.cliente_digitos || v.cliente_contato) === d) : []; };

export async function carregarFinanceiro() {
  _erroSql = false;
  const [v, f, c] = await Promise.all([getVendas().catch(e => { _erroSql = /SQL/.test(e.message); return []; }),
    getFinCfg().catch(() => ({ custos: {}, produtos: [] })), getCampanhas().catch(() => [])]);
  _vendas = v; _fin = f; _camps = c;
}
// Demonstração (página demo / testes): usa dados de mentira, sem banco
export function demoFinanceiro(vendas = [], fin = { custos: {}, produtos: [] }) { _vendas = vendas; _fin = fin; _erroSql = false; }
export const custoServico = sid => Number(_fin.custos?.[sid]) || 0;
export async function salvarCustos(custos) { _fin.custos = custos; await salvarFinCfg(_fin); }
export const finCfg = () => _fin;

// === BLOCO 2: PERFIL DO CLIENTE (tratamento · compras · total · lucro · interesse) ===
export function perfilFinanceiroHtml(c, { servicos = [] } = {}) {
  if (_erroSql) return `<div class="fin-box"><div class="fin-aviso">💰 Pra controlar compras e pagamentos, falta rodar o SQL do financeiro (sql/financeiro.sql).</div></div>`;
  const vs = _vendasDe(c);
  const pacs = pacotesDoCliente(vs, c.ags || []);
  const hoje = _hoje();
  const prox = (c.ags || []).filter(a => a.status === 'confirmado' && a.data >= hoje).sort((a, b) => (a.data + a.hora < b.data + b.hora ? -1 : 1))[0];
  const tot = somar(vs);
  const inter = interesseDe(c, servicos);
  return `<div class="fin-box">
    ${pacs.length ? pacs.map(p => `<div class="fin-trat">
      <div class="fin-trat-t">💆 ${_esc(p.venda.item)}</div>
      <div class="fin-barra"><i style="width:${Math.round(p.feitas / p.total * 100)}%"></i></div>
      <div class="fin-trat-d"><b>${p.feitas} de ${p.total}</b> sessões feitas · ${p.faltam ? `faltam <b>${p.faltam}</b>` : '✅ pacote concluído'}</div>
      ${p.ativo ? `<div class="fin-trat-d">📅 Próximo: ${p.prox ? `<b>${_fmtDia(p.prox.data)} às ${_esc(p.prox.hora)}</b>` : '<span class="fin-alerta">nenhum marcado</span>'}</div>` : ''}
    </div>`).join('') : (prox ? `<div class="fin-trat"><div class="fin-trat-d">📅 Próximo atendimento: <b>${_fmtDia(prox.data)} às ${_esc(prox.hora)}</b>${prox.servico ? ` · ${_esc(prox.servico)}` : ''}</div></div>` : '')}
    <div class="fin-resumo">
      <div><small>Total pago</small><b>${reais(tot.bruto)}</b></div>
      <div><small>Lucro</small><b>${reais(tot.lucro)}</b></div>
      <div><small>💡 Interesse</small><b>${inter.itens.length ? (inter.valor ? reais(inter.valor) : inter.itens.length + ' item' + (inter.itens.length > 1 ? 's' : '')) : '—'}</b></div>
    </div>
    ${inter.itens.length ? `<div class="fin-inter">💡 Interessada em: ${inter.itens.map(i => `${_esc(i.nome)}${i.preco != null ? ` · ${reais(i.preco)}` : ''}`).join(' · ')}</div>` : ''}
    <div class="fin-compras-h"><span>🛍️ Compras</span><button class="fin-add" id="fin-add" type="button">＋ Registrar venda</button></div>
    ${vs.length ? vs.map(v => `<button class="fin-compra" data-venda="${_esc(v.id)}" type="button">
      <span class="fin-c-info"><b>${_esc(v.item)}</b><small>${_fmtData(v.data)}${v.tipo === 'pacote' ? ` · pacote ${v.sessoes} sessões` : v.tipo === 'produto' ? ' · produto' : ''}${v.forma ? ` · ${_formaTxt(v.forma)}` : ''}</small></span>
      <span class="fin-c-val">${v.forma === 'cortesia' ? '🎁 Cortesia' : reais(v.valor)} ✏️</span>
    </button>`).join('') : '<div class="fin-vazio">Nenhuma compra registrada ainda.</div>'}
  </div>`;
}
// 💡 Interesse: o que ela marcou na triagem e ainda não comprou (serviço com preço soma valor)
export function interesseDe(c, servicos = []) {
  const t = (c.triagens || [])[0]; if (!t) return { itens: [], valor: 0 };
  const r = t.respostas || {};
  const comprados = _vendasDe(c).map(v => v.item.toLowerCase());
  const n = s => String(s || '').toLowerCase();
  const nomes = [...new Set([...(r.interesses || [])])].filter(x => !comprados.some(cp => cp.startsWith(n(x)) || n(x).startsWith(cp)));
  const itens = nomes.map(nome => { const s = servicos.find(x => n(x.nome) === n(nome) || n(x.nome).startsWith(n(nome))); return { nome, preco: s?.preco ?? null }; });
  return { itens, valor: itens.reduce((t2, i) => t2 + (Number(i.preco) || 0), 0) };
}
export function wirePerfilFinanceiro(ov, c, { servicos = [], aoMudar } = {}) {
  ov.querySelector('#fin-add')?.addEventListener('click', () => abrirFormVenda({ cliente: c, servicos, aoSalvar: aoMudar }));
  ov.querySelectorAll('[data-venda]').forEach(b => b.addEventListener('click', () => {
    const v = _vendas.find(x => x.id === b.dataset.venda);
    if (v) abrirFormVenda({ venda: v, cliente: c, servicos, aoSalvar: aoMudar });
  }));
}

// === BLOCO 3: REGISTRAR / EDITAR VENDA ===
export function abrirFormVenda({ venda = null, cliente, servicos = [], agendamento = null, aoSalvar, titulo } = {}) {
  const v = venda || {};
  const prods = _fin.produtos || [];
  const opcoes = [...servicos.map(s => ({ k: 's:' + s.id, nome: s.nome, preco: s.preco, custo: custoServico(s.id), sessoes: s.sessoes || 1, tipo: (s.sessoes || 1) > 1 ? 'pacote' : 'servico', sid: s.id })),
    ...prods.map(p => ({ k: 'p:' + p.id, nome: p.nome, preco: p.preco, custo: p.custo, sessoes: 1, tipo: 'produto' }))];
  const selK = v.servico_id ? 's:' + v.servico_id : (opcoes.find(o => o.nome === v.item)?.k || '');
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'fin-venda-ov';
  ov.innerHTML = `<div class="modal ag-fmodal"><div class="ag-fcorpo">
    <div class="ag-fhead">${_esc(titulo || (venda ? '✏️ Editar venda' : '🛍️ Registrar venda'))}</div>
    <div class="ag-cli-perfil-sub">${_esc(cliente?.nome || v.cliente_nome || '')}</div>
    ${opcoes.length ? `<div class="input-field"><div class="input-field-label">O que foi vendido</div>
      <button type="button" class="fin-pick-btn" id="fv-pick"></button>
      <select id="fv-op" hidden><option value=""></option>
        ${opcoes.map(o => `<option value="${_esc(o.k)}" ${o.k === selK ? 'selected' : ''}>${_esc(o.nome)}</option>`).join('')}
      </select></div>` : ''}
    <label class="input-field"><div class="input-field-label">Item</div><input id="fv-item" value="${_esc(v.item || '')}" placeholder="Ex: Blend Celulite"></label>
    <label class="input-field"><div class="input-field-label">Valor pago (R$)</div><input id="fv-valor" inputmode="decimal" value="${v.id ? _numTxt(v.valor) : ''}" placeholder="0,00"></label>
    <input type="hidden" id="fv-custo" value="${v.id ? _numTxt(v.custo) : ''}">
    <div class="fin-res" id="fv-res"></div>
    <div class="fin-2col">
      <label class="input-field"><div class="input-field-label">Tipo</div><select id="fv-tipo">
        ${[['servico', 'Atendimento'], ['pacote', 'Pacote'], ['produto', 'Produto']].map(([k, l]) => `<option value="${k}" ${(v.tipo || 'servico') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="input-field" id="fv-sess-box"><div class="input-field-label">Sessões do pacote</div><input id="fv-sess" type="number" min="1" inputmode="numeric" value="${v.sessoes || 1}"></label>
    </div>
    <div class="input-field-label">Forma de pagamento</div>
    <div class="fin-formas">${FORMAS.map(([k, l]) => `<button type="button" class="fin-forma ${v.forma === k ? 'on' : ''}" data-forma="${k}">${l}</button>`).join('')}</div>
    <label class="input-field"><div class="input-field-label">Data</div><input id="fv-data" type="date" value="${_esc(v.data || _hoje())}"></label>
    <div class="ag-fbtns">
      ${venda ? '<button class="btn-secondary" id="fv-excluir" type="button">🗑 Excluir</button>' : '<button class="btn-secondary" id="fv-pular" type="button">Agora não</button>'}
      <button class="btn-primary" id="fv-salvar" type="button">Salvar</button>
    </div>
  </div></div>`;
  document.body.appendChild(ov);
  const close = trapModalBack(() => ov.remove());
  ov.addEventListener('click', e => { if (e.target === ov) close(); });
  let forma = v.forma || null, sid = v.servico_id || null;
  const $ = s => ov.querySelector(s);
  const sessVis = () => { $('#fv-sess-box').style.display = $('#fv-tipo').value === 'pacote' ? '' : 'none'; };
  const aplicar = o => {
    if (!o) { sid = null; return; }
    $('#fv-item').value = o.nome; sid = o.sid || null;
    $('#fv-valor').value = o.preco != null ? _numTxt(o.preco) : '';
    $('#fv-custo').value = o.custo ? _numTxt(o.custo) : '';
    custoCadastrado = !!o.custo;
    $('#fv-tipo').value = o.tipo; $('#fv-sess').value = o.sessoes || 1; sessVis(); resumo();
  };
  // Custo vem do cadastro (Serviços/Produtos) — a profissional não digita. Lucro calculado na hora.
  let custoCadastrado = !!v.custo;
  const resumo = () => {
    const val = _num($('#fv-valor').value), cus = _num($('#fv-custo').value), luc = val - cus;
    $('#fv-res').innerHTML = `<div><span>Custo</span><b>${cus ? reais(cus) : '—'}</b></div>
      <div><span>Lucro</span><b class="${luc < 0 ? 'neg' : 'pos'}">${reais(luc)}</b></div>
      ${!custoCadastrado && !cus ? '<small>Custo ainda não cadastrado pra esse item: o lucro está sem descontar material.</small>' : ''}`;
  };
  $('#fv-valor').addEventListener('input', resumo);
  $('#fv-op')?.addEventListener('change', e => { if (!e.target.value) { $('#fv-custo').value = ''; custoCadastrado = false; resumo(); } });
  $('#fv-op')?.addEventListener('change', e => { aplicar(opcoes.find(o => o.k === e.target.value)); pintarPick(); });
  // Escolher o item: lista no visual do Falcon (o <select> nativo do Android fica feio e corta os nomes)
  const _partes = nome => { const i = nome.indexOf(' – '); return i > 0 ? [nome.slice(0, i), nome.slice(i + 3)] : [nome, '']; };
  const _tag = o => o.tipo === 'pacote' ? `Pacote ${o.sessoes} sessões` : o.tipo === 'produto' ? 'Produto' : 'Sessão';
  function pintarPick() {
    const b = $('#fv-pick'); if (!b) return;
    const o = opcoes.find(x => x.k === $('#fv-op').value);
    b.innerHTML = o ? `<span class="fin-pick-txt"><b>${_esc(_partes(o.nome)[0])}</b><small>${_esc(_tag(o))}${o.preco != null ? ' · ' + reais(o.preco) : ''}</small></span><span class="fin-pick-seta">▾</span>`
      : `<span class="fin-pick-txt"><b>Escolher…</b><small>ou escreva no campo "Item" abaixo</small></span><span class="fin-pick-seta">▾</span>`;
  }
  $('#fv-pick')?.addEventListener('click', () => {
    const fundo = document.createElement('div'); fundo.className = 'fin-pick-ov';
    const grupos = [['Sessões', opcoes.filter(o => o.tipo === 'servico')], ['Pacotes', opcoes.filter(o => o.tipo === 'pacote')], ['Produtos', opcoes.filter(o => o.tipo === 'produto')]].filter(g => g[1].length);
    fundo.innerHTML = `<div class="fin-pick-folha" role="dialog" aria-label="O que foi vendido">
      <div class="fin-pick-tit">O que foi vendido?</div>
      <div class="fin-pick-lista">${grupos.map(([g, os]) => `<div class="fin-pick-grupo">${g}</div>` + os.map(o => { const [n, d] = _partes(o.nome); return `<button type="button" class="fin-pick-op ${o.k === $('#fv-op').value ? 'on' : ''}" data-k="${_esc(o.k)}">
        <span class="fin-pick-txt"><b>${_esc(n)}</b>${d ? `<small>${_esc(d)}</small>` : ''}</span><span class="fin-pick-preco">${o.preco != null ? reais(o.preco) : ''}</span></button>`; }).join('')).join('')}
        <button type="button" class="fin-pick-op fin-pick-outro" data-k=""><span class="fin-pick-txt"><b>✏️ Outro</b><small>escrever o nome do item</small></span></button>
      </div></div>`;
    document.body.appendChild(fundo);
    const fechar = () => fundo.remove();
    fundo.addEventListener('click', e => { if (e.target === fundo) fechar(); });
    fundo.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
      const sel = $('#fv-op'); sel.value = b.dataset.k; sel.dispatchEvent(new Event('change')); fechar();
      if (!b.dataset.k) { $('#fv-item').value = ''; $('#fv-item').focus(); }
    });
  });
  pintarPick();
  $('#fv-tipo').onchange = sessVis; sessVis();
  if (!venda && selK) aplicar(opcoes.find(o => o.k === selK));
  resumo();
  ov.querySelectorAll('.fin-forma').forEach(b => b.onclick = () => {
    forma = forma === b.dataset.forma ? null : b.dataset.forma;
    ov.querySelectorAll('.fin-forma').forEach(x => x.classList.toggle('on', x.dataset.forma === forma));
    // cortesia: não cobrou nada (o custo continua contando no lucro)
    if (forma === 'cortesia') $('#fv-valor').value = '0,00';
    resumo();
  });
  $('#fv-pular')?.addEventListener('click', () => close());
  $('#fv-excluir')?.addEventListener('click', async () => {
    if (!confirm('Excluir esta venda?')) return;
    try { await excluirVenda(v.id); _vendas = _vendas.filter(x => x.id !== v.id); close(); showToast('Venda excluída', 'info'); aoSalvar?.(); }
    catch (e) { showToast('Erro: ' + e.message, 'error'); }
  });
  $('#fv-salvar').onclick = async () => {
    const item = $('#fv-item').value.trim();
    if (!item) { showToast('Escreva o que foi vendido', 'info'); return; }
    const btn = $('#fv-salvar'); btn.disabled = true; btn.textContent = 'Salvando…';
    try {
      const nova = await salvarVenda({ id: v.id, cliente_nome: cliente?.nome || v.cliente_nome, cliente_contato: cliente?.contato || v.cliente_contato,
        cliente_digitos: digitos(cliente?.contato || cliente?.key || v.cliente_digitos),
        tipo: $('#fv-tipo').value, item, servico_id: sid, agendamento_id: v.agendamento_id || agendamento?.id || null,
        sessoes: $('#fv-tipo').value === 'pacote' ? $('#fv-sess').value : 1,
        valor: _num($('#fv-valor').value), custo: _num($('#fv-custo').value), forma, data: $('#fv-data').value || _hoje() });
      _vendas = [nova, ..._vendas.filter(x => x.id !== nova.id)];
      close(); showToast('✅ Venda salva', 'success'); aoSalvar?.();
    } catch (e) { showToast('Erro: ' + e.message, 'error'); btn.disabled = false; btn.textContent = 'Salvar'; }
  };
}

// === BLOCO 4: FINALIZAR ATENDIMENTO → VENDA (ou sessão do pacote) ===
export async function aoFinalizarAtendimento(ag, { servicos = [], todos = [], aoSalvar } = {}) {
  try { if (!_vendas.length) await carregarFinanceiro(); } catch {}
  if (_erroSql) return;
  if (_vendas.some(v => v.agendamento_id === ag.id)) return;   // já lançado
  const cli = { nome: ag.cliente_nome, contato: ag.cliente_contato, key: digitos(ag.cliente_contato) };
  const agsCli = todos.filter(a => digitos(a.cliente_contato) && digitos(a.cliente_contato) === cli.key);
  const pac = pacotesDoCliente(_vendasDe(cli), agsCli).find(p => p.feitasReal <= p.total && p.venda.data <= ag.data
    && String(ag.servico || '').toLowerCase().includes(String(p.venda.item).toLowerCase().split(' (')[0]));
  if (pac) { showToast(`💆 Sessão ${pac.feitas} de ${pac.total} do pacote ${pac.venda.item.split(' –')[0]}`, 'success'); aoSalvar?.(); return; }
  const s = servicos.find(x => x.nome === ag.servico);
  abrirFormVenda({ cliente: cli, servicos, agendamento: ag, aoSalvar, titulo: '💰 Registrar pagamento' });
  // pré-preenche com o serviço do atendimento (valor = preço; custo = custo do serviço)
  const ov = document.getElementById('fin-venda-ov');
  if (ov && s) {
    const op = ov.querySelector('#fv-op'); if (op) { op.value = 's:' + s.id; op.dispatchEvent(new Event('change')); }
  } else if (ov && ag.servico) {
    ov.querySelector('#fv-item').value = ag.servico;
    if (ag.preco != null) { ov.querySelector('#fv-valor').value = _numTxt(ag.preco); ov.querySelector('#fv-valor').dispatchEvent(new Event('input')); }
  }
  // Agendou com cupom de desconto: 100% → já marca Cortesia; senão aplica o desconto no valor.
  if (ov && ag.cupom) {
    const d = Number(ag.cupom_desconto || 0);
    if (d >= 100) ov.querySelector('[data-forma="cortesia"]')?.click();
    else if (d > 0) {
      const inp = ov.querySelector('#fv-valor');
      const v = parseFloat(String(inp?.value || '').replace(/\./g, '').replace(',', '.'));
      if (inp && Number.isFinite(v)) { inp.value = _numTxt(Math.round(v * (100 - d)) / 100); inp.dispatchEvent(new Event('input')); }
    }
    showToast(`🎟️ Cupom ${ag.cupom}: ${d >= 100 ? 'cortesia' : d + '% de desconto'}`, 'info');
  }
}

// === BLOCO 5: 💰 FINANCEIRO (mês atual + histórico) ===
export async function abrirFinanceiro({ clientes = [], servicos = [] } = {}) {
  await carregarFinanceiro().catch(() => {});
  const meses = porMes(_vendas);
  const atual = new Date().toISOString().slice(0, 7);
  const mesAtual = meses.find(m => m.mes === atual) || { mes: atual, bruto: 0, custo: 0, lucro: 0, qtd: 0, vendas: [] };
  const anteriores = meses.filter(m => m.mes !== atual);
  const maior = Math.max(1, ...meses.map(m => m.bruto));
  const porForma = FORMAS.filter(([k]) => k !== 'cortesia').map(([k, l]) => [l, mesAtual.vendas.filter(v => v.forma === k).reduce((t, v) => t + Number(v.valor || 0), 0)]).filter(x => x[1] > 0);
  const cortesias = mesAtual.vendas.filter(v => v.forma === 'cortesia');
  const inter = clientes.map(c => ({ c, i: interesseDe(c, servicos) })).filter(x => x.i.itens.length);
  const interValor = inter.reduce((t, x) => t + x.i.valor, 0);
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'fin-ov';
  ov.innerHTML = `<div class="modal ag-fmodal"><div class="ag-fcorpo">
    <div class="ag-fhead">💰 Financeiro</div>
    ${_erroSql ? '<div class="fin-aviso">Falta rodar o SQL do financeiro (sql/financeiro.sql).</div>' : ''}
    <div class="fin-mes-t">${_nomeMes(atual)}</div>
    <div class="fin-resumo grande">
      <div><small>Recebido (bruto)</small><b>${reais(mesAtual.bruto)}</b></div>
      <div><small>Lucro</small><b>${reais(mesAtual.lucro)}</b></div>
    </div>
    <div class="fin-sub">${mesAtual.qtd} venda${mesAtual.qtd === 1 ? '' : 's'} · custos ${reais(mesAtual.custo)}${porForma.length ? ' · ' + porForma.map(([l, v]) => `${l} ${reais(v)}`).join(' · ') : ''}${cortesias.length ? ` · 🎁 ${cortesias.length} cortesia${cortesias.length > 1 ? 's' : ''} (custo ${reais(cortesias.reduce((t, v) => t + Number(v.custo || 0), 0))})` : ''}</div>
    ${inter.length ? `<div class="fin-inter">💡 ${interValor ? `<b>${reais(interValor)}</b> em interesse` : 'Interesse'} de <b>${inter.length}</b> cliente${inter.length > 1 ? 's' : ''} que ainda não fech${inter.length > 1 ? 'aram' : 'ou'}: ${inter.slice(0, 6).map(x => _esc(x.c.nome)).join(', ')}${inter.length > 6 ? '…' : ''}</div>` : ''}
    <div class="fin-mes-t" style="margin-top:16px">Meses anteriores</div>
    ${anteriores.length ? anteriores.map(m => `<div class="fin-hist">
      <div class="fin-hist-l"><b>${_nomeMes(m.mes)}</b><small>${m.qtd} venda${m.qtd === 1 ? '' : 's'}</small></div>
      <div class="fin-hist-v"><span>${reais(m.bruto)}</span><small>lucro ${reais(m.lucro)}</small></div>
      <div class="fin-barra"><i style="width:${Math.round(m.bruto / maior * 100)}%"></i></div>
    </div>`).join('') : '<div class="fin-vazio">O histórico aparece aqui a partir do mês que vem.</div>'}
    <div class="ag-fbtns"><button class="btn-primary" id="fin-ok" type="button">Fechar</button></div>
  </div></div>`;
  document.body.appendChild(ov);
  const close = trapModalBack(() => ov.remove());
  ov.addEventListener('click', e => { if (e.target === ov) close(); });
  ov.querySelector('#fin-ok').onclick = () => close();
}

// === BLOCO 6: 📣 CAMPANHAS (de onde veio a cliente → quanto voltou) ===
// A origem vem da triagem (utm_source/utm_campaign do link do anúncio).
// (26/11) Funil da triagem: quantas pessoas chegaram em cada tela (sql/triagem-funil.sql)
const _ORIG_NOME = { google: 'Google', instagram: 'Instagram', whatsapp: 'WhatsApp', direto: 'Link direto' };
// (26/11) Planilha (.xlsx) da TRIAGEM: 1 linha por triagem, 1 coluna por pergunta (vale pra toda profissional)
async function _planilhaTriagem(clientes, botao) {
  const txt0 = botao.textContent; botao.disabled = true; botao.textContent = 'Montando a planilha…';
  try {
    if (!window.XLSX) await new Promise((ok, erro) => { const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = ok; s.onerror = () => erro(new Error('Sem internet pra montar a planilha')); document.head.appendChild(s); });
    const X = window.XLSX;
    const ts = clientes.flatMap(c => (c.triagens || []).map(t => ({ c, t })))
      .sort((a, b) => String(a.t.created_at).localeCompare(String(b.t.created_at)));
    const perguntas = [...new Set(ts.flatMap(({ t }) => Object.keys(t.respostas?.respostas || {})))];
    const val = v => Array.isArray(v) ? v.join(' · ') : (v ?? '');
    const dt = s => s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const linhas = [['Respondeu em', 'Nome', 'WhatsApp', 'Veio de', 'Indicação', 'Quer agendar', 'Também interessa', 'Agendou?', ...perguntas],
      ...ts.map(({ c, t }) => { const r = t.respostas || {};
        return [dt(t.respondida_em || t.created_at), t.cliente_nome || c.nome || '', t.cliente_contato || c.contato || '',
          r.origem?.source || 'direto', r.indicacao || '', val(r.plano), val(r.interesses),
          (c.ags || []).some(a => a.created_at >= t.created_at) ? 'Sim' : 'Não',
          ...perguntas.map(k => val(r.respostas?.[k]))]; })];
    const ws = X.utils.aoa_to_sheet(linhas);
    ws['!cols'] = linhas[0].map((t, i) => ({ wch: i < 4 ? 18 : Math.min(50, Math.max(16, String(t).length + 4)) }));
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Triagem');
    const blob = new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const nome = `triagem-respostas-${new Date().toLocaleDateString('pt-BR').split('/').join('-')}.xlsx`;
    const file = new File([blob], nome, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: nome }); } catch {} }
    else { const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }
  } catch (e) { showToast('Erro: ' + e.message, 'error'); }
  finally { botao.disabled = false; botao.textContent = txt0; }
}
const _FORM_NOME = { triagem: 'Triagem', selecao: 'Seleção (alunas)', pesquisa: 'Pesquisa (colegas)' };
async function _funilTriagem(box, dias = 7, origem = '', form = '') {
  if (!box) return;
  const de = new Date(); de.setDate(de.getDate() - (dias - 1));
  const iso = `${de.getFullYear()}-${String(de.getMonth() + 1).padStart(2, '0')}-${String(de.getDate()).padStart(2, '0')}`;
  let rows = [];
  try { const { data, error } = await supabase.rpc('triagem_funil', { p_de: iso }); if (error) throw error; rows = data || []; }
  catch { box.innerHTML = '<div class="camp-t">🔎 Onde as pessoas param na triagem</div><div class="fin-sub">Ainda não disponível.</div>'; return; }
  rows.forEach(r => { r.form = r.form || 'triagem'; });
  const forms = [...new Set(rows.map(r => r.form))];
  if (!form || !forms.includes(form)) form = forms.includes('triagem') ? 'triagem' : (forms[0] || 'triagem');
  rows = rows.filter(r => r.form === form);
  const origens = [...new Set(rows.map(r => r.origem))];
  const filtro = rows.filter(r => !origem || r.origem === origem);
  const porPasso = new Map();
  for (const r of filtro) { const x = porPasso.get(r.passo) || { ordem: r.ordem, passo: r.passo, n: 0 }; x.n += Number(r.pessoas) || 0; x.ordem = Math.min(x.ordem, r.ordem); porPasso.set(r.passo, x); }
  const passos = [...porPasso.values()].sort((a, b) => a.ordem - b.ordem);
  const topo = passos[0]?.n || 0;
  const chip = (v, txt, on) => `<button type="button" class="camp-fchip${on ? ' sel' : ''}" ${v}>${txt}</button>`;
  box.innerHTML = `<div class="camp-t">🔎 Onde as pessoas param ${forms.length > 1 ? 'nos formulários' : 'na triagem'}</div>
    ${forms.length > 1 ? `<div class="camp-fchips">${forms.map(f => chip(`data-form="${_esc(f)}"`, _esc(_FORM_NOME[f] || f), form === f)).join('')}</div>` : ''}
    <div class="camp-fchips">${chip('data-dias="7"', '7 dias', dias === 7)}${chip('data-dias="30"', '30 dias', dias === 30)}
      <span class="camp-fsep"></span>${chip('data-orig=""', 'Todas', !origem)}${origens.map(o => chip(`data-orig="${_esc(o)}"`, _esc(_ORIG_NOME[o] || o), origem === o)).join('')}</div>
    ${passos.length ? `<div class="camp-flista">${passos.map((p, i) => {
      const ant = i ? passos[i - 1].n : p.n, perdeu = Math.max(0, ant - p.n);
      return `<div class="camp-fl"><div class="camp-fl-t"><span>${_esc(p.passo)}</span><b>${p.n}</b></div>
        <div class="camp-fl-barra"><i style="width:${topo ? Math.round(p.n / topo * 100) : 0}%"></i></div>
        ${perdeu ? `<small class="camp-fl-perda">−${perdeu} pararam aqui</small>` : ''}</div>`; }).join('')}</div>
      <div class="fin-sub">Conta pessoas (sem nome), uma vez por tela. Começou a contar em 26/11.</div>`
    : '<div class="fin-sub">Ninguém abriu a triagem nesse período ainda.</div>'}`;
  box.querySelectorAll('[data-dias]').forEach(b => b.onclick = () => _funilTriagem(box, Number(b.dataset.dias), origem, form));
  box.querySelectorAll('[data-orig]').forEach(b => b.onclick = () => _funilTriagem(box, dias, b.dataset.orig, form));
  box.querySelectorAll('[data-form]').forEach(b => b.onclick = () => _funilTriagem(box, dias, '', b.dataset.form));
}

export async function abrirCampanhas({ clientes = [] } = {}) {
  await carregarFinanceiro().catch(() => {});
  const grupos = new Map();
  for (const c of clientes) for (const t of (c.triagens || [])) {
    const o = t.respostas?.origem || {}; const cod = o.campaign || (o.source ? o.source : 'direto');
    if (!grupos.has(cod)) grupos.set(cod, { codigo: cod, origem: o.source || '', clientes: new Map(), primeira: t.created_at });
    const g = grupos.get(cod); g.clientes.set(c.key, { c, t });
    if (t.created_at < g.primeira) g.primeira = t.created_at;
  }
  for (const k of _camps) if (!grupos.has(k.codigo)) grupos.set(k.codigo, { codigo: k.codigo, origem: k.origem || '', clientes: new Map(), primeira: k.created_at });
  const linhas = [...grupos.values()].map(g => {
    const camp = _camps.find(k => k.codigo === g.codigo);
    const cs = [...g.clientes.values()];
    const agendaram = cs.filter(({ c, t }) => (c.ags || []).some(a => a.created_at >= t.created_at || a.data >= String(t.created_at).slice(0, 10))).length;
    const atendidas = cs.filter(({ c, t }) => (c.ags || []).some(a => a.status === 'finalizado' && a.data >= String(t.created_at).slice(0, 10))).length;
    const vendas = cs.flatMap(({ c, t }) => _vendasDe(c).filter(v => v.data >= String(t.created_at).slice(0, 10)));
    const s = somar(vendas);
    const inv = Number(camp?.investido) || 0;
    return { g, camp, triagens: cs.length, agendaram, atendidas, ...s, inv };
  }).sort((a, b) => b.triagens - a.triagens);
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'camp-ov';
  ov.innerHTML = `<div class="modal ag-fmodal"><div class="ag-fcorpo">
    <div class="ag-fhead">📣 Campanhas</div>
    <div class="ag-cli-perfil-sub">De onde vieram as clientes (pelo link da triagem) e quanto voltou.</div>
    ${linhas.length ? linhas.map(l => `<div class="camp-card">
      <div class="camp-t">${_esc(l.camp?.nome || (l.g.codigo === 'direto' ? 'Sem anúncio (link direto / bio)' : l.g.codigo))}${l.g.origem ? ` <small>· ${_esc(l.g.origem)}</small>` : ''}</div>
      <div class="camp-funil">
        <div><b>${l.triagens}</b><small>triagens</small></div><span>→</span>
        <div><b>${l.agendaram}</b><small>agendaram</small></div><span>→</span>
        <div><b>${l.atendidas}</b><small>atendidas</small></div>
      </div>
      <div class="fin-resumo">
        <div><small>Faturado</small><b>${reais(l.bruto)}</b></div>
        <div><small>Lucro</small><b>${reais(l.lucro)}</b></div>
        ${l.g.codigo !== 'direto' ? `<div><small>Investido</small><b>${reais(l.inv)}</b></div>` : ''}
      </div>
      ${l.g.codigo !== 'direto' && l.inv ? `<div class="fin-sub">Custo por cliente atendida: <b>${l.atendidas ? reais(l.inv / l.atendidas) : '—'}</b> · Retorno: <b>${l.inv ? 'cada R$ 1 virou ' + reais(l.bruto / l.inv) : '—'}</b></div>` : ''}
      ${l.g.codigo !== 'direto' ? `<div class="camp-inv"><input class="camp-inv-in" data-camp="${_esc(l.g.codigo)}" data-origem="${_esc(l.g.origem)}" inputmode="decimal" placeholder="Quanto investiu (R$)" value="${l.inv ? _numTxt(l.inv) : ''}">
        <button class="btn-secondary camp-inv-ok" data-camp="${_esc(l.g.codigo)}" type="button">Salvar</button></div>` : ''}
    </div>`).join('') : '<div class="fin-vazio">Quando alguém fizer a triagem pelo link de um anúncio, a campanha aparece aqui.</div>'}
    ${clientes.some(c => (c.triagens || []).length) ? '<button class="btn-secondary mt-planilha" id="camp-planilha" type="button">📗 Compartilhar planilha com as respostas da triagem</button>' : ''}
    <div class="camp-card" id="camp-tri-funil"><div class="camp-t">🔎 Onde as pessoas param na triagem</div><div class="fin-sub">Carregando…</div></div>
    <div class="ag-fbtns"><button class="btn-primary" id="camp-ok" type="button">Fechar</button></div>
  </div></div>`;
  document.body.appendChild(ov);
  const close = trapModalBack(() => ov.remove());
  ov.addEventListener('click', e => { if (e.target === ov) close(); });
  ov.querySelector('#camp-ok').onclick = () => close();
  _funilTriagem(ov.querySelector('#camp-tri-funil'));
  ov.querySelector('#camp-planilha')?.addEventListener('click', e => _planilhaTriagem(clientes, e.currentTarget));
  ov.querySelectorAll('.camp-inv-ok').forEach(b => b.onclick = async () => {
    const inp = ov.querySelector(`.camp-inv-in[data-camp="${CSS.escape(b.dataset.camp)}"]`);
    b.disabled = true;
    try {
      await salvarCampanha({ codigo: b.dataset.camp, origem: inp.dataset.origem, investido: _num(inp.value),
        nome: _camps.find(k => k.codigo === b.dataset.camp)?.nome || null });
      close(); showToast('✅ Investimento salvo', 'success'); abrirCampanhas({ clientes });
    } catch (e) { showToast('Erro: ' + e.message, 'error'); b.disabled = false; }
  });
}

// === BLOCO 7: 🧴 PRODUTOS (catálogo da profissional: preço, custo e a ficha do produto) ===
// Serve pra qualquer profissional: blends, cremes, kits… Aparece no "Registrar venda".
export async function abrirProdutos() {
  await carregarFinanceiro().catch(() => {});
  let lista = (_fin.produtos || []).map(p => ({ ...p }));
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'prod-ov';
  document.body.appendChild(ov);
  const close = trapModalBack(() => ov.remove());
  ov.addEventListener('click', e => { if (e.target === ov) close(); });
  const sid = () => 'p' + Math.random().toString(36).slice(2, 8);
  const ler = () => ov.querySelectorAll('.prod-ed').forEach(row => {
    const p = lista.find(x => x.id === row.dataset.pid); if (!p) return;
    const v = c => row.querySelector(c).value.trim();
    p.nome = v('.pe-nome'); p.subtitulo = v('.pe-sub'); p.preco = v('.pe-preco') === '' ? null : _num(v('.pe-preco'));
    p.custo = _num(v('.pe-custo')); p.composicao = v('.pe-comp'); p.modo = v('.pe-modo'); p.recomendacoes = v('.pe-rec');
  });
  const draw = () => {
    ov.innerHTML = `<div class="modal ag-fmodal"><div class="ag-fcorpo">
      <div class="ag-fhead">🧴 Produtos</div>
      <div class="ag-cli-perfil-sub">O que você vende além dos atendimentos. O custo só você vê.</div>
      ${_erroSql ? '<div class="fin-aviso">Falta rodar o SQL do financeiro (sql/financeiro.sql).</div>' : ''}
      ${lista.map(p => `<div class="prod-ed" data-pid="${_esc(p.id)}">
        <input class="pe-nome" value="${_esc(p.nome || '')}" placeholder="Nome (ex: Xô Celulite)">
        <input class="pe-sub" value="${_esc(p.subtitulo || '')}" placeholder="Tipo (ex: Blend anticelulítico)">
        <div class="fin-2col"><input class="pe-preco" inputmode="decimal" value="${p.preco != null ? _numTxt(p.preco) : ''}" placeholder="Preço R$">
          <input class="pe-custo" inputmode="decimal" value="${p.custo ? _numTxt(p.custo) : ''}" placeholder="Custo R$"></div>
        <textarea class="pe-comp" rows="2" placeholder="Composição (ex: Base vegetal: amêndoa doce · Óleos essenciais: alecrim, lavanda)">${_esc(p.composicao || '')}</textarea>
        <textarea class="pe-modo" rows="2" placeholder="Modo de usar">${_esc(p.modo || '')}</textarea>
        <textarea class="pe-rec" rows="2" placeholder="Recomendações">${_esc(p.recomendacoes || '')}</textarea>
        <button class="pe-x" data-rm="${_esc(p.id)}" type="button">🗑 Remover produto</button>
      </div>`).join('') || '<div class="fin-vazio">Nenhum produto ainda.</div>'}
      <button class="ag-serv-add-btn" id="pe-add" type="button">➕ Adicionar produto</button>
      <div class="ag-fbtns"><button class="btn-secondary" id="pe-fechar" type="button">Fechar</button>
        <button class="btn-primary" id="pe-salvar" type="button">Salvar</button></div>
    </div></div>`;
    ov.querySelector('#pe-add').onclick = () => { ler(); lista.push({ id: sid(), nome: '', preco: null, custo: 0 }); draw(); };
    ov.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { ler(); lista = lista.filter(x => x.id !== b.dataset.rm); draw(); });
    ov.querySelector('#pe-fechar').onclick = () => close();
    ov.querySelector('#pe-salvar').onclick = async () => {
      ler();
      const b = ov.querySelector('#pe-salvar'); b.disabled = true; b.textContent = 'Salvando…';
      try { _fin.produtos = lista.filter(p => p.nome); await salvarFinCfg(_fin); close(); showToast('✅ Produtos salvos', 'success'); }
      catch (e) { showToast('Erro: ' + e.message, 'error'); b.disabled = false; b.textContent = 'Salvar'; }
    };
  };
  draw();
}
