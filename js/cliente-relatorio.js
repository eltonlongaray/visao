// ─── ÍNDICE ──────────────────────────────────────────────────
// 📋 PROPOSTA E RELATÓRIO DO CLIENTE (Fontes de renda › card de clientes). Élton, 27/11/2026
// Tocar num cliente com proposta abre esta folha: as fases (✅ feita · 📍 agora · ○ próxima),
// quanto pagou, os resultados da campanha, desafios, melhorias (campanha e Instagram) e os
// bônus com quanto custaria cada um (já entregue × ainda vai ser entregue).
//   BLOCO 1: modelo (proposta em 3 fases) e conta
//   BLOCO 2: folha (Dados · Ajustar · Resumo no WhatsApp · PDF)
//   BLOCO 3: ajustar (fases, resultados, textos e bônus)
//   BLOCO 4: automático — números da agenda/triagem da cliente (RPC campanha_agencia) e do
//            Google Ads (anuncios_dia, enviado pelo script que o app monta). SQL: sql/agencia-campanhas.sql
// Dados: renda_clientes.jornada (jsonb) — SQL: sql/renda-cliente-jornada.sql
// Visual: mesmas classes .mt-rel-* / .rel-* do relatório da aluna (mentoria-relatorio.js)
// ─────────────────────────────────────────────────────────────
import * as R from './renda.js';
import { digitosDe } from './mentoria.js';
import { showToast } from './aviso-tela.js';
import { trapModalBack } from './modal-voltar.js';
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config-supabase.js';

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
    const auto = resultadosAuto(c._auto);
    const res = auto.length ? [...auto, ...r.resultados.filter(x => String(x.valor ?? '').trim() && !auto.some(a => a.rot === x.rot))] : r.resultados;
    const funil = (c._auto?.funil || []).filter(f => f.pessoas > 0);
    const topo = funil.length ? Math.max(...funil.map(f => f.pessoas)) : 0;
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
          <div class="rel-res">${res.map(x => `<div class="rel-res-it"><b>${_esc(String(x.valor ?? '').trim() || '—')}</b><small>${_esc(x.rot)}</small></div>`).join('')}</div>${auto.length ? `<div class="rel-auto">Atualizado sozinho${c._auto?.ads?.ate ? ` · Google até ${c._auto.ads.ate.split('-').reverse().slice(0, 2).join('/')}` : ''}${c._auto?.desde ? ` · desde ${c._auto.desde.split('-').reverse().slice(0, 2).join('/')}` : ''}</div>` : ''}` : ''}
        ${funil.length ? `<h3 class="rel-h">🔎 Onde as pessoas param na triagem</h3>
          <div class="rel-funil">${funil.map(f => `<div class="rel-funil-it"><span>${_esc(f.passo)}</span><i style="width:${Math.max(4, Math.round(f.pessoas / topo * 100))}%"></i><b>${f.pessoas}</b></div>`).join('')}</div>` : ''}
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
        <footer class="rel-rodape">Feito com 💛 no Falcon</footer>
      </article>`;
    ov.querySelector('[data-voltar]').onclick = () => history.back();
    ov.querySelector('[data-pdf]').onclick = () => window.print();
    ov.querySelector('[data-dados]').onclick = () => aoEditarDados?.();
    ov.querySelector('[data-zap]').onclick = () => {
      const d = digitosDe(c.contato || ''), txt = encodeURIComponent(textoResumoCliente(c));
      window.open(d.length >= 10 ? `https://wa.me/55${d}?text=${txt}` : `https://wa.me/?text=${txt}`, '_blank', 'noopener');
    };
    ov.querySelector('[data-ajustar]').onclick = () => _modalAjustar(c, async jornada => {
      try { await R.mudarCliente(c.id, { jornada }); c.jornada = jornada; c._auto = await lerAuto(c).catch(() => null); desenhar(); aoMudar?.(); showToast('Salvo ✓', 'success'); }
      catch (e) { showToast(/jornada|column/i.test(e.message) ? 'Falta rodar o SQL (sql/renda-cliente-jornada.sql)' : 'Não consegui salvar: ' + e.message, 'error'); }
    });
  };
  desenhar();
  lerAuto(c).then(x => { c._auto = x; if (x && ov.isConnected) desenhar(); }).catch(() => {});
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
    <div class="mt-rot2">🔗 Resultados automáticos</div>
    <div class="fi-secao-sub">Com isso preenchido, os números entram sozinhos no relatório.</div>
    <div class="obj-linha"><label class="obj-mini"><span class="mt-rot2">Agenda da cliente</span><input class="input-field" id="cr-slug" value="${_esc(j.auto?.slug || '')}" placeholder="código (ex.: V83)" maxlength="20"></label>
      <label class="obj-mini"><span class="mt-rot2">Desde</span><input class="input-field" id="cr-desde" type="date" value="${_esc(j.auto?.desde || '')}"></label></div>
    <label class="mt-rot2" for="cr-camp">Nome da campanha no Google (um pedaço já serve)</label>
    <input class="input-field" id="cr-camp" value="${_esc(j.auto?.campanha || '')}" placeholder="Ex.: Celulite">
    <button class="mt-link-mini" data-google type="button">🔗 Ligar o Google Ads (uma vez só)</button>
    <label class="mt-rot2" for="cr-res">📊 Outros resultados (um por linha, "nome: número")</label>
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
  ov.querySelector('[data-google]').onclick = () => abrirLigarGoogle();
  ov.querySelector('[data-x]').onclick = () => history.back();
  ov.addEventListener('click', e => { if (e.target === ov) history.back(); });
  ov.querySelector('[data-ok]').onclick = () => {
    ler();
    const linhasDe = id => ov.querySelector(id).value.split('\n').map(x => x.trim()).filter(Boolean);
    const nova = { ...j, titulo: ov.querySelector('#cr-t').value.trim() || 'Campanha',
      fases: j.fases.filter(f => f.nome), bonus: j.bonus.filter(b => b.nome),
      resultados: linhasDe('#cr-res').map(l => { const m = /^(.*?)\s*[:=]\s*(.*)$/.exec(l); return m ? { rot: m[1], valor: m[2] } : { rot: l, valor: '' }; }),
      melhorias: linhasDe('#cr-mel'), instagram: linhasDe('#cr-ig'), desafios: linhasDe('#cr-des'),
      auto: { ...(j.auto || {}), slug: ov.querySelector('#cr-slug').value.trim(), campanha: ov.querySelector('#cr-camp').value.trim(), desde: ov.querySelector('#cr-desde').value || null } };
    history.back(); salvar(nova);
  };
}

// === BLOCO 4: AUTOMÁTICO (agenda da cliente + Google Ads) ===
// jornada.auto = { slug: código da agenda dela, campanha: parte do nome da campanha no Google, desde: 'AAAA-MM-DD', origem: 'google' }
export async function lerAuto(c) {
  const a = c?.jornada?.auto;
  if (!a || (!a.slug && !a.campanha)) return null;
  const desde = a.desde || null, origem = String(a.origem || 'google').toLowerCase();
  const out = { desde, origem, ads: null, cli: null, funil: [] };
  if (a.campanha) {
    try {
      let q = supabase.from('anuncios_dia').select('data,campanha,impressoes,cliques,custo').ilike('campanha', `%${a.campanha}%`);
      if (desde) q = q.gte('data', desde);
      const { data, error } = await q;
      if (!error && data?.length) out.ads = data.reduce((s, r) => ({ imp: s.imp + (r.impressoes || 0), cli: s.cli + (r.cliques || 0), custo: s.custo + Number(r.custo || 0), ate: r.data > s.ate ? r.data : s.ate }), { imp: 0, cli: 0, custo: 0, ate: '' });
    } catch { /* sem SQL */ }
  }
  if (a.slug) {
    try {
      const { data, error } = await supabase.rpc('campanha_agencia', { p_slug: a.slug, p_de: desde });
      if (!error && data?.ok) {
        out.cli = (data.origens || []).find(o => o.origem === origem) || { triagens: 0, agendaram: 0, atendidas: 0 };
        out.funil = (data.funil || []).filter(f => f.origem === origem).sort((x, y) => x.ordem - y.ordem);
      }
    } catch { /* sem SQL */ }
  }
  return out.ads || out.cli ? out : null;
}

export function resultadosAuto(x) {
  if (!x) return [];
  const r = [], n = v => Number(v || 0).toLocaleString('pt-BR');
  if (x.ads) r.push({ rot: 'Vezes que o anúncio apareceu', valor: n(x.ads.imp) }, { rot: 'Cliques no anúncio', valor: n(x.ads.cli) }, { rot: 'Investido no Google', valor: _brl(x.ads.custo) });
  if (x.cli) r.push({ rot: 'Fizeram a triagem', valor: n(x.cli.triagens) }, { rot: 'Agendaram', valor: n(x.cli.agendaram) }, { rot: 'Foram atendidas', valor: n(x.cli.atendidas) });
  if (x.ads && x.cli?.agendaram) r.push({ rot: 'Custo por agendamento', valor: _brl(x.ads.custo / x.cli.agendaram) });
  if (x.ads?.cli && x.cli) r.push({ rot: 'Dos cliques, fizeram a triagem', valor: Math.round(x.cli.triagens / x.ads.cli * 100) + '%' });
  return r;
}

// Script do Google Ads (Ferramentas › Scripts): manda os últimos 30 dias de cada campanha, todo dia.
async function _chave() {
  const { data } = await supabase.from('agencia_chaves').select('chave').maybeSingle();
  if (data?.chave) return data.chave;
  const b = new Uint8Array(24); crypto.getRandomValues(b);
  const chave = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  const { error } = await supabase.from('agencia_chaves').insert({ chave });
  if (error) throw error;
  return chave;
}
export function scriptGoogleAds(chave) {
  return `// Falcon · manda os números das campanhas pro relatório (roda 1x por dia)
function main() {
  var linhas = [];
  var rel = AdsApp.search("SELECT segments.date, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date DURING LAST_30_DAYS");
  while (rel.hasNext()) {
    var r = rel.next();
    linhas.push({ d: r.segments.date, c: r.campaign.name, i: Number(r.metrics.impressions || 0), k: Number(r.metrics.clicks || 0),
      g: Number(r.metrics.costMicros || 0) / 1000000, v: Number(r.metrics.conversions || 0) });
  }
  var resp = UrlFetchApp.fetch("${SUPABASE_URL}/rest/v1/rpc/anuncio_registrar", {
    method: "post", contentType: "application/json", muteHttpExceptions: true,
    headers: { apikey: "${SUPABASE_PUBLISHABLE_KEY}" },
    payload: JSON.stringify({ p_chave: "${chave}", p_linhas: linhas })
  });
  Logger.log(resp.getResponseCode() + " " + resp.getContentText());
}`;
}
export async function abrirLigarGoogle() {
  let txt;
  try { txt = scriptGoogleAds(await _chave()); }
  catch (e) { showToast(/agencia_chaves|relation|column/i.test(e.message || '') ? 'Falta rodar o SQL (sql/agencia-campanhas.sql)' : 'Não consegui: ' + e.message, 'error'); return; }
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.style.zIndex = '9600';
  ov.innerHTML = `<div class="modal mt-perm-modal"><div class="modal-title">🔗 Ligar o Google Ads</div>
    <ol class="rel-passos">
      <li>Toca em <b>Copiar o script</b>.</li>
      <li>No Google Ads (no computador): <b>Ferramentas › Ações em massa › Scripts</b> e o <b>＋</b> pra criar um novo.</li>
      <li>Apaga o que vier escrito, cola o script e dá o nome <b>Falcon</b>.</li>
      <li>Toca em <b>Autorizar</b> e depois em <b>Visualizar</b>: embaixo tem que aparecer <b>200</b> e <b>"ok":true</b>.</li>
      <li>Salva e, em <b>Frequência</b>, escolhe <b>Diariamente</b>.</li>
    </ol>
    <div class="fi-secao-sub">A chave dentro do script é só tua: não manda pra ninguém.</div>
    <textarea class="input-field rel-script" readonly rows="6">${_esc(txt)}</textarea>
    <div class="modal-actions"><button class="btn-secondary" data-x type="button">Fechar</button><button class="btn-primary" data-copiar type="button">📋 Copiar o script</button></div></div>`;
  document.body.appendChild(ov);
  trapModalBack(() => ov.remove());
  ov.querySelector('[data-x]').onclick = () => history.back();
  ov.querySelector('[data-copiar]').onclick = async e => {
    try { await navigator.clipboard.writeText(txt); } catch { const t = ov.querySelector('.rel-script'); t.select(); document.execCommand('copy'); }
    e.currentTarget.textContent = '✅ Copiado';
  };
}
