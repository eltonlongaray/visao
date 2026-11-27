// ─── ÍNDICE ──────────────────────────────────────────────────
// 📋 PROPOSTA E RELATÓRIO DO CLIENTE (Fontes de renda › card de clientes). Élton, 27/11/2026
// Tocar num cliente com proposta abre esta folha: as fases (✅ feita · 📍 agora · ○ próxima),
// quanto pagou, os resultados da campanha, desafios, melhorias (campanha e Instagram) e os
// bônus com quanto custaria cada um (já entregue × ainda vai ser entregue).
//   BLOCO 1: modelo (proposta em 3 fases) e conta
//   BLOCO 2: folha (Dados · Ajustar · Resumo no WhatsApp · PDF)
//   BLOCO 3: ajustar (fases, resultados, textos e bônus)
// Dados: renda_clientes.jornada (jsonb) — SQL: sql/renda-cliente-jornada.sql
// Visual: mesmas classes .mt-rel-* / .rel-* do relatório da aluna (mentoria-relatorio.js)
// ─────────────────────────────────────────────────────────────
import * as R from './renda.js';
import { digitosDe } from './mentoria.js';
import { showToast } from './aviso-tela.js';
import { trapModalBack } from './modal-voltar.js';

const _esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const _brl = v => 'R$ ' + Math.round(Number(v) || 0).toLocaleString('pt-BR');
const _num = v => v === '' || v == null ? null : Math.max(0, Number(String(v).replace(/\./g, '').replace(',', '.')) || 0);

// === BLOCO 1: MODELO E CONTA ===
// Proposta padrão de campanha em 3 fases (cada fase paga uma vez, sem mensalidade).
export const MODELO_CAMPANHA = () => ({
  titulo: 'Campanha',
  fases: [
    { nome: 'Fase 1 · Google', st: 'agora', itens: ['Estratégia de vendas', 'Anúncio no Google', 'Formulário que filtra a cliente'], valor: null, pago: null, anuncio: null },
    { nome: 'Fase 2 · YouTube, Instagram e Facebook', st: 'depois', itens: [] },
    { nome: 'Fase 3 · Página de vendas e automação', st: 'depois', itens: [] },
  ],
  bonus: [], resultados: [], desafios: [], melhorias: [], instagram: [],
});

export function resumoCliente(c) {
  const j = c?.jornada || {};
  const fases = Array.isArray(j.fases) ? j.fases : [];
  const atual = fases.find(f => f.st === 'agora') || fases.find(f => f.st !== 'ok') || null;
  const trabalho = fases.reduce((s, f) => s + (Number(f.pago) || 0), 0);
  const anuncio = fases.reduce((s, f) => s + (Number(f.anuncio) || 0), 0);
  const bonus = Array.isArray(j.bonus) ? j.bonus : [];
  const soma = l => l.reduce((s, b) => s + (Number(b.valor) || 0), 0);
  return { j, fases, atual, trabalho, anuncio, investido: trabalho + anuncio,
    bonus, bEnt: bonus.filter(b => b.st !== 'falta'), bFal: bonus.filter(b => b.st === 'falta'),
    bonusEntregue: soma(bonus.filter(b => b.st !== 'falta')), bonusFalta: soma(bonus.filter(b => b.st === 'falta')),
    resultados: (Array.isArray(j.resultados) ? j.resultados : []).filter(r => r.rot),
    lista: k => (Array.isArray(j[k]) ? j[k] : []).filter(Boolean) };
}

export function textoResumoCliente(c) {
  const r = resumoCliente(c), nome = (c?.nome || '').split(' ')[0];
  const l = [`📋 *${r.j.titulo || 'Campanha'}${nome ? ` · ${nome}` : ''}*`, ''];
  if (r.atual) l.push(`📍 Agora: ${r.atual.nome}`);
  const res = r.resultados.filter(x => String(x.valor ?? '').trim());
  if (res.length) l.push('', '📊 *Resultados*', ...res.map(x => `• ${x.rot}: ${x.valor}`));
  const mel = [...r.lista('melhorias'), ...r.lista('instagram')];
  if (mel.length) l.push('', `✅ *${mel.length} melhorias feitas*`, ...mel.slice(0, 4).map(x => `• ${x}`), mel.length > 4 ? '• e mais…' : '');
  if (r.bonusEntregue) l.push('', `🎁 Bônus já entregues: ${_brl(r.bonusEntregue)} sem custo pra ti.`);
  return l.filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n').trim();
}

// === BLOCO 2: FOLHA ===
// opts.aoEditarDados(): abre o editor antigo (nome, WhatsApp, pagamentos, anotações)
export function abrirFichaCliente(c, { aoEditarDados, aoMudar } = {}) {
  if (!c) return;
  if (!c.jornada) c.jornada = MODELO_CAMPANHA();
  const ov = document.createElement('div');
  ov.className = 'mt-rel-ov';
  document.body.appendChild(ov);
  document.body.classList.add('mt-rel-aberto');
  const fechar = trapModalBack(() => { ov.remove(); document.body.classList.remove('mt-rel-aberto'); });

  const desenhar = () => {
    const r = resumoCliente(c), nome = _esc((c.nome || '').split(' ')[0]);
    const lista = (k, ic) => r.lista(k).map(x => `<li class="rel-fase ok"><span class="rel-ic">${ic}</span><div>${_esc(x)}</div></li>`).join('');
    const faseHtml = f => {
      const ic = f.st === 'ok' ? '✅' : f.st === 'agora' ? '📍' : '○';
      const itens = (f.itens || []).filter(Boolean);
      const preco = f.pago != null || f.valor != null
        ? `<span>${f.valor != null && f.pago != null && Number(f.valor) > Number(f.pago) ? `<s>${_brl(f.valor)}</s> ` : ''}${_brl(f.pago ?? f.valor)}</span>` : '';
      return `<section class="rel-pilar ${f.st === 'ok' ? 'ok' : f.st === 'agora' ? 'agora' : ''}">
        <div class="rel-pilar-top"><b>${ic} ${_esc(f.nome)}${f.st === 'agora' ? ' <em class="rel-aqui">estamos aqui</em>' : ''}</b>${preco}</div>
        ${f.anuncio ? `<div class="rel-pilar-sub">+ ${_brl(f.anuncio)} de anúncio</div>` : ''}
        ${itens.length ? `<ul>${itens.map(i => `<li class="rel-fase ${f.st === 'ok' ? 'ok' : f.st === 'agora' ? '' : 'depois'}"><span class="rel-ic">•</span><div>${_esc(i)}</div></li>`).join('')}</ul>` : ''}
      </section>`;
    };
    const bonusHtml = l => [...new Set(l.map(x => x.grupo || ''))].map(g => `${g ? `<div class="rel-grupo">${_esc(g)}</div>` : ''}${l.filter(x => (x.grupo || '') === g).map(x => `
      <div class="rel-pres"><div>${_esc(x.nome)}${x.nota ? `<small>${_esc(x.nota)}</small>` : ''}</div><span>${_brl(x.valor)}</span></div>`).join('')}`).join('');
    const res = r.resultados;
    ov.innerHTML = `
      <div class="mt-rel-barra no-print">
        <button class="mt-rel-btn" data-voltar type="button" aria-label="Voltar">←</button>
        <button class="mt-rel-btn" data-dados type="button">👤 Dados</button>
        <button class="mt-rel-btn" data-ajustar type="button">✏️ Ajustar</button>
        <button class="mt-rel-btn" data-zap type="button">💬</button>
        <button class="mt-rel-btn on" data-pdf type="button">📄 PDF</button>
      </div>
      <article class="mt-rel-folha">
        <header class="rel-cab">
          <div class="rel-tit">${_esc(r.j.titulo || 'Campanha')}</div>
          <div class="rel-sub">Relatório${nome ? ` pra ${nome}` : ''} · ${new Date().toLocaleDateString('pt-BR')}</div>
        </header>
        <div class="rel-cards">
          <div class="rel-card"><div class="rel-card-rot">📍 Agora</div><div class="rel-card-num" style="font-size:18px">${_esc(r.atual?.nome || 'Tudo concluído ✅')}</div>
            <div class="rel-card-sub">${r.fases.filter(f => f.st === 'ok').length} de ${r.fases.length} fases concluídas</div></div>
          ${r.investido ? `<div class="rel-card"><div class="rel-card-rot">💰 Investido até aqui</div><div class="rel-card-num">${_brl(r.investido)}</div>
            <div class="rel-card-sub">${[r.trabalho && `trabalho ${_brl(r.trabalho)}`, r.anuncio && `anúncio ${_brl(r.anuncio)}`].filter(Boolean).join(' + ')}</div></div>` : ''}
        </div>
        ${res.length ? `<h3 class="rel-h">📊 Resultados da campanha</h3>
          <div class="rel-res">${res.map(x => `<div class="rel-res-it"><b>${_esc(String(x.valor ?? '').trim() || '—')}</b><small>${_esc(x.rot)}</small></div>`).join('')}</div>` : ''}
        ${r.lista('melhorias').length ? `<h3 class="rel-h">✅ Melhorias na campanha</h3><ul class="rel-ul">${lista('melhorias', '✅')}</ul>` : ''}
        ${r.lista('instagram').length ? `<h3 class="rel-h">📸 Melhorias no teu Instagram</h3><ul class="rel-ul">${lista('instagram', '✅')}</ul>` : ''}
        ${r.lista('desafios').length ? `<h3 class="rel-h">⚠️ Desafios e o que estamos fazendo</h3><ul class="rel-ul">${r.lista('desafios').map(x => `<li class="rel-fase"><span class="rel-ic">→</span><div>${_esc(x)}</div></li>`).join('')}</ul>` : ''}
        <h3 class="rel-h">🧭 As fases</h3>
        ${r.fases.map(faseHtml).join('')}
        ${r.bonus.length ? `<div class="rel-linha"></div>
          <h3 class="rel-h">🎁 Bônus que tu ganhou</h3>
          <p class="rel-p">Tudo isso é bônus, sem custo pra ti. Coloquei quanto custaria cada item só pra tu saber o que estás ganhando além da campanha.</p>
          ${r.bEnt.length ? `<div class="rel-bonus-tit">✅ Já entregue</div>${bonusHtml(r.bEnt)}<div class="rel-pres rel-pres-tot"><div>Já entregue</div><span>${_brl(r.bonusEntregue)}</span></div>` : ''}
          ${r.bFal.length ? `<div class="rel-bonus-tit">🔜 Ainda vai ser entregue <small>no mínimo, porque podem surgir mais coisas</small></div>${bonusHtml(r.bFal)}<div class="rel-pres rel-pres-tot"><div>Ainda vai ser entregue</div><span>${_brl(r.bonusFalta)}</span></div>` : ''}` : ''}
        <footer class="rel-rodape">Feito com 🤍 no Falcon</footer>
      </article>`;
    ov.querySelector('[data-voltar]').onclick = () => history.back();
    ov.querySelector('[data-pdf]').onclick = () => window.print();
    ov.querySelector('[data-dados]').onclick = () => aoEditarDados?.();
    ov.querySelector('[data-zap]').onclick = () => {
      const d = digitosDe(c.contato || ''), txt = encodeURIComponent(textoResumoCliente(c));
      window.open(d.length >= 10 ? `https://wa.me/55${d}?text=${txt}` : `https://wa.me/?text=${txt}`, '_blank', 'noopener');
    };
    ov.querySelector('[data-ajustar]').onclick = () => _modalAjustar(c, async jornada => {
      try { await R.mudarCliente(c.id, { jornada }); c.jornada = jornada; desenhar(); aoMudar?.(); showToast('Salvo ✓', 'success'); }
      catch (e) { showToast(/jornada|column/i.test(e.message) ? 'Falta rodar o SQL (sql/renda-cliente-jornada.sql)' : 'Não consegui salvar: ' + e.message, 'error'); }
    });
  };
  desenhar();
  return { fechar, desenhar };
}

// === BLOCO 3: AJUSTAR ===
const ST = [['ok', '✅ Feita'], ['agora', '📍 Agora'], ['depois', '○ Próxima']];
function _modalAjustar(c, salvar) {
  const j = JSON.parse(JSON.stringify(c.jornada || MODELO_CAMPANHA()));
  j.fases = j.fases || []; j.bonus = j.bonus || [];
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.style.zIndex = '9500';
  const linhas = k => (j[k] || []).join('\n');
  const resTxt = () => (j.resultados || []).map(x => `${x.rot}: ${x.valor ?? ''}`).join('\n');
  const fasesHtml = () => j.fases.map((f, i) => `<div class="rel-ed-item" data-f="${i}">
      <input class="input-field" data-k="nome" value="${_esc(f.nome)}" placeholder="Nome da fase">
      <div class="obj-linha"><select class="input-field" data-k="st">${ST.map(([v, t]) => `<option value="${v}"${f.st === v ? ' selected' : ''}>${t}</option>`).join('')}</select><button class="mt-perm-x" data-rmf type="button" aria-label="Tirar">✕</button></div>
      <div class="obj-linha"><label class="obj-mini"><span class="mt-rot2">Preço cheio</span><input class="input-field" data-k="valor" inputmode="decimal" value="${f.valor ?? ''}" placeholder="R$"></label>
        <label class="obj-mini"><span class="mt-rot2">Pagou</span><input class="input-field" data-k="pago" inputmode="decimal" value="${f.pago ?? ''}" placeholder="R$"></label>
        <label class="obj-mini"><span class="mt-rot2">Anúncio</span><input class="input-field" data-k="anuncio" inputmode="decimal" value="${f.anuncio ?? ''}" placeholder="R$"></label></div>
      <textarea class="input-field" data-k="itens" rows="3" placeholder="O que tem nessa fase (um por linha)">${_esc((f.itens || []).join('\n'))}</textarea></div>`).join('');
  const bonusHtml = () => j.bonus.map((x, i) => `<div class="rel-ed-item" data-b="${i}">
      <input class="input-field" data-k="nome" value="${_esc(x.nome)}" placeholder="O que foi">
      <input class="input-field" data-k="nota" value="${_esc(x.nota || '')}" placeholder="O que tem dentro (opcional)">
      <div class="obj-linha"><input class="input-field" data-k="valor" inputmode="decimal" value="${x.valor ?? ''}" placeholder="Quanto custaria (R$)">
      <select class="input-field" data-k="st"><option value="entregue"${x.st !== 'falta' ? ' selected' : ''}>✅ Já entregue</option><option value="falta"${x.st === 'falta' ? ' selected' : ''}>🔜 Ainda vai</option></select>
      <button class="mt-perm-x" data-rmb type="button" aria-label="Tirar">✕</button></div></div>`).join('');
  ov.innerHTML = `<div class="modal mt-perm-modal"><div class="modal-title">✏️ Proposta e relatório</div>
    <label class="mt-rot2" for="cr-t">Nome da campanha</label>
    <input class="input-field" id="cr-t" value="${_esc(j.titulo || '')}" placeholder="Ex.: Campanha de Black Friday">
    <div class="mt-rot2">🧭 Fases</div><div id="cr-fases">${fasesHtml()}</div>
    <button class="mt-link-mini" data-addf type="button">＋ Fase</button>
    <label class="mt-rot2" for="cr-res">📊 Resultados (um por linha, "nome: número")</label>
    <textarea class="input-field" id="cr-res" rows="5" placeholder="Cliques: 42&#10;Agendamentos: 3">${_esc(resTxt())}</textarea>
    <label class="mt-rot2" for="cr-mel">✅ Melhorias na campanha (uma por linha)</label>
    <textarea class="input-field" id="cr-mel" rows="4">${_esc(linhas('melhorias'))}</textarea>
    <label class="mt-rot2" for="cr-ig">📸 Melhorias no Instagram (uma por linha)</label>
    <textarea class="input-field" id="cr-ig" rows="3">${_esc(linhas('instagram'))}</textarea>
    <label class="mt-rot2" for="cr-des">⚠️ Desafios e o que estamos fazendo (um por linha)</label>
    <textarea class="input-field" id="cr-des" rows="3">${_esc(linhas('desafios'))}</textarea>
    <div class="mt-rot2">🎁 Bônus e quanto custaria</div><div id="cr-bonus">${bonusHtml()}</div>
    <button class="mt-link-mini" data-addb type="button">＋ Bônus</button>
    <div class="modal-actions"><button class="btn-secondary" data-x type="button">Cancelar</button><button class="btn-primary" data-ok type="button">Salvar</button></div></div>`;
  document.body.appendChild(ov);
  trapModalBack(() => ov.remove());
  const ler = () => {
    ov.querySelectorAll('[data-f]').forEach(el => { const f = j.fases[+el.dataset.f]; el.querySelectorAll('[data-k]').forEach(inp => {
      const k = inp.dataset.k; f[k] = ['valor', 'pago', 'anuncio'].includes(k) ? _num(inp.value) : k === 'itens' ? inp.value.split('\n').map(x => x.trim()).filter(Boolean) : inp.value.trim(); }); });
    ov.querySelectorAll('[data-b]').forEach(el => { const b = j.bonus[+el.dataset.b]; el.querySelectorAll('[data-k]').forEach(inp => {
      b[inp.dataset.k] = inp.dataset.k === 'valor' ? _num(inp.value) : inp.value.trim(); }); });
  };
  const religar = () => {
    ov.querySelector('#cr-fases').innerHTML = fasesHtml();
    ov.querySelector('#cr-bonus').innerHTML = bonusHtml();
    ov.querySelectorAll('[data-rmf]').forEach(b => b.onclick = () => { ler(); j.fases.splice(+b.closest('[data-f]').dataset.f, 1); religar(); });
    ov.querySelectorAll('[data-rmb]').forEach(b => b.onclick = () => { ler(); j.bonus.splice(+b.closest('[data-b]').dataset.b, 1); religar(); });
  };
  religar();
  ov.querySelector('[data-addf]').onclick = () => { ler(); j.fases.push({ nome: `Fase ${j.fases.length + 1}`, st: 'depois', itens: [] }); religar(); };
  ov.querySelector('[data-addb]').onclick = () => { ler(); j.bonus.push({ nome: '', valor: null, st: 'falta' }); religar(); };
  ov.querySelector('[data-x]').onclick = () => history.back();
  ov.addEventListener('click', e => { if (e.target === ov) history.back(); });
  ov.querySelector('[data-ok]').onclick = () => {
    ler();
    const linhasDe = id => ov.querySelector(id).value.split('\n').map(x => x.trim()).filter(Boolean);
    const nova = { ...j, titulo: ov.querySelector('#cr-t').value.trim() || 'Campanha',
      fases: j.fases.filter(f => f.nome), bonus: j.bonus.filter(b => b.nome),
      resultados: linhasDe('#cr-res').map(l => { const m = /^(.*?)\s*[:=]\s*(.*)$/.exec(l); return m ? { rot: m[1], valor: m[2] } : { rot: l, valor: '' }; }),
      melhorias: linhasDe('#cr-mel'), instagram: linhasDe('#cr-ig'), desafios: linhasDe('#cr-des') };
    history.back(); salvar(nova);
  };
}
