// ─── ÍNDICE ──────────────────────────────────────────────────
// 📄 RELATÓRIO DA ALUNA (Élton, 27/11/2026): prestação de contas da mentoria pra aluna ver
// o andamento da entrega dos dois lados, sem se sentir em desvantagem.
//   BLOCO 1: a jornada padrão (Mentoria Comunicação Holística, 6 meses, 15 fases)
//   BLOCO 2: conta (fase atual, R$ entregue por pilar, presentes)
//   BLOCO 3: tela do relatório (Salvar PDF · Mandar resumo no WhatsApp · Ajustar)
//   BLOCO 4: ajustar (fase atual e presentes com valor)
// Dados: mentoria_leads.jornada (jsonb) — { atual, presentes: [{ nome, valor, nota, grupo }] }.
// Sem nada salvo, usa a jornada padrão e a fase vem pela data. SQL: sql/mentoria-jornada.sql
// A entrega DELA vem da permuta (mentoria.js → resumoPermuta).
// ─────────────────────────────────────────────────────────────
import { resumoPermuta, salvarLead, digitosDe } from './mentoria.js';
import { showToast } from './aviso-tela.js';
import { trapModalBack } from './modal-voltar.js';

const _esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const _plural = w => /m$/.test(w) ? w.slice(0, -1) + 'ns' : /[rsz]$/.test(w) ? w + 'es' : w + 's';
const _brl = v => 'R$ ' + Math.round(Number(v) || 0).toLocaleString('pt-BR');

// === BLOCO 1: JORNADA PADRÃO ===
// Pilares com o valor da proposta (total R$ 15.000), cada um dividido igual pelas fases dele.
// Datas: AAAA-MM-DD (fase sem data = conta pela ordem).
export const JORNADA_PADRAO = {
  titulo: 'Mentoria Comunicação Holística',
  sub: '6 meses (30/08 a 28/02) · 1 encontro por semana',
  pausa: { ini: '2026-12-24', fim: '2027-01-04', txt: 'pausa das festas: 24/12 a 04/01' },
  pilares: [
    { nome: 'Início', icone: '🟢', valor: 0, fases: [{ n: 0, nome: 'Preparação: alinhamento de expectativas, horas de dedicação e meta financeira' }] },
    { nome: '1. Identidade de marca', valor: 1500, fases: [{ n: 1, nome: 'Teste de arquétipo, habilidades e paixões, fontes, cores e superpoderes' }] },
    { nome: '2. Mecanismo de vendas', valor: 1500, fases: [
      { n: 2, nome: 'Público alvo e problemas, dificuldades e medos', ini: '2026-11-26', fim: '2026-12-02', obs: 'a pesquisa com as colegas está no ar, coletando as respostas' },
      { n: 3, nome: 'Problemas externos, internos e filosóficos e qual problema eu resolvo', ini: '2026-12-03', fim: '2026-12-09' },
      { n: 4, nome: 'Mecanismo do problema, da solução, mecanismo único e diferenciais', ini: '2026-12-10', fim: '2026-12-16', obs: 'aqui nasce o nome do teu método (com checagem no INPI)' }] },
    { nome: '3. Posicionamento', valor: 2000, fases: [
      { n: 5, nome: 'A grande tese e a narrativa', ini: '2026-12-17', fim: '2026-12-23' },
      { n: 6, nome: 'Pitch de elevador e bio do Instagram', ini: '2027-01-05', fim: '2027-01-11' },
      { n: 7, nome: 'Brand book', ini: '2027-01-12', fim: '2027-01-18' }] },
    { nome: '4. Produto high ticket', sub: 'a mentoria em grupo', valor: 2500, fases: [
      { n: 8, nome: 'Precificação, nome e formato', ini: '2027-01-19', fim: '2027-01-25' },
      { n: 9, nome: 'Problema que resolve e transformação', ini: '2027-01-26', fim: '2027-02-01' },
      { n: 10, nome: 'Promessa, ticket, entrega e bônus', ini: '2027-02-02', fim: '2027-02-08' }] },
    { nome: '5. Produto de entrada', sub: 'o início do programa: o workshop', valor: 2500, fases: [
      { n: 11, nome: 'Precificação, nome e formato · problema e transformação · promessa, ticket, entrega e bônus', ate: 13, ini: '2027-02-09', fim: '2027-02-15' }] },
    { nome: 'Chegada · Jornada de vendas', icone: '🏁', valor: 5000, fases: [
      { n: 14, nome: 'Criação de conteúdo: reels, carrossel e imagem', ini: '2027-02-16', fim: '2027-02-22' },
      { n: 15, nome: 'Página de apresentação dos produtos, checkout e automação · Instagram, jornada do cliente e script de vendas', ini: '2027-02-23', fim: '2027-02-28' }] },
  ],
};

// Presentes: entregues sem custo pra ela, mas com o valor de cada um (Élton quer que ela saiba).
export const PRESENTES_PADRAO = [
  { grupo: 'Programação', nome: 'Agenda online no Falcon', valor: 2000, nota: 'tu pagava R$ 60 por mês em outra' },
  { grupo: 'Programação', nome: 'Ficha e relatório de sessão', valor: 1500 },
  { grupo: 'Programação', nome: 'Pesquisa das colegas com sorteio', valor: 1500 },
  { grupo: 'Programação', nome: 'Seleção com painel de inscritas e alunas no teu Falcon', valor: 3500 },
  { grupo: 'Programação', nome: 'Página de vendas da mentoria e painel de vendas', valor: 3500 },
  { grupo: 'Programação', nome: 'Página privada do workshop, com login', valor: 1500 },
  { grupo: 'Campanha', nome: 'Sessão especial da Black Friday', valor: 600 },
  { grupo: 'Campanha', nome: 'Campanha de Black Friday (estratégia e roteiro)', valor: 1500 },
  { grupo: 'Conteúdo', nome: 'Carrosséis prontos (sorteio e Black Friday)', valor: 800 },
];

// === BLOCO 2: CONTA ===
const _dia = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const _dBR = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? `${m[3]}/${m[2]}` : ''; };
const _fases = () => JORNADA_PADRAO.pilares.flatMap(p => p.fases);

// Fase atual pela data: a que tem hoje dentro; na pausa ou entre fases, a próxima.
export function faseDaData(hoje = new Date()) {
  const h = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const datadas = _fases().filter(f => f.ini);
  if (!datadas.length || h < _dia(datadas[0].ini)) return datadas.length ? datadas[0].n : 0;
  for (const f of datadas) if (h <= _dia(f.fim)) return f.n;
  return 16; // passou de tudo = concluída
}

export function resumoJornada(l, hoje = new Date()) {
  const j = l?.jornada || {};
  const atual = Number.isInteger(j.atual) ? j.atual : faseDaData(hoje);
  const ultima = f => f.ate || f.n;
  const pilares = JORNADA_PADRAO.pilares.map(p => {
    const nf = p.fases.reduce((s, f) => s + (ultima(f) - f.n + 1), 0);
    const feitas = p.fases.reduce((s, f) => s + Math.max(0, Math.min(ultima(f), atual - 1) - f.n + 1), 0);
    const st = feitas >= nf ? 'ok' : p.fases.some(f => atual >= f.n && atual <= ultima(f)) ? 'agora' : 'depois';
    return { ...p, st, entregue: p.valor * feitas / nf };
  });
  const total = pilares.reduce((s, p) => s + p.valor, 0);
  const entregue = pilares.reduce((s, p) => s + p.entregue, 0);
  const presentes = Array.isArray(j.presentes) ? j.presentes : PRESENTES_PADRAO;
  return { atual, pilares, total, entregue, pct: total ? Math.round(entregue / total * 100) : 0,
    presentes, presentesTotal: presentes.reduce((s, p) => s + (Number(p.valor) || 0), 0),
    permuta: resumoPermuta(l?.permuta, hoje) };
}

// Texto curto pro WhatsApp (e pro Pet).
export function textoResumo(l, hoje = new Date()) {
  const r = resumoJornada(l, hoje), nome = (l?.nome || '').split(' ')[0] || 'tu';
  const agora = r.pilares.find(p => p.st === 'agora');
  const linhas = [`📄 *Nossa jornada, ${nome}* · ${JORNADA_PADRAO.titulo}`, ''];
  linhas.push(`🎓 *Minha entrega:* ${_brl(r.entregue)} de ${_brl(r.total)} da mentoria (${r.pct}%)${agora ? `, agora em ${agora.nome.replace(/^\d+\.\s*/, '')}` : ''}.`);
  if (r.permuta) {
    const p = r.permuta, serv = p.servico.toLowerCase();
    linhas.push(`🔁 *Tua entrega:* ${p.feitas} de ${p.precisa} ${_plural(serv)}, ${_brl(p.pago)} de ${_brl(p.total)}${p.quitada ? ' ✅' : p.atrasadas ? ` (${p.atrasadas} atrasada${p.atrasadas === 1 ? '' : 's'})` : ' (em dia)'}.`);
  }
  linhas.push('', `🎁 *Presentes, sem custo pra ti:* ${_brl(r.presentesTotal)} em ${r.presentes.map(p => p.nome.toLowerCase()).slice(0, 3).join(', ')}${r.presentes.length > 3 ? ' e mais' : ''}.`);
  return linhas.join('\n');
}

// === BLOCO 3: TELA DO RELATÓRIO ===
export function abrirRelatorio(l, { aoSalvar } = {}) {
  if (!l) return;
  const ov = document.createElement('div');
  ov.className = 'mt-rel-ov';
  document.body.appendChild(ov);
  document.body.classList.add('mt-rel-aberto');
  const fechar = trapModalBack(() => { ov.remove(); document.body.classList.remove('mt-rel-aberto'); });

  const desenhar = () => {
    const r = resumoJornada(l), nome = _esc((l.nome || 'aluna').split(' ')[0]);
    const p = r.permuta, hojeBR = new Date().toLocaleDateString('pt-BR');
    const faseHtml = f => {
      const fim = f.ate || f.n, st = r.atual > fim ? 'ok' : r.atual >= f.n ? 'agora' : 'depois';
      const rot = f.n === 0 ? '' : `Fase ${f.n}${f.ate ? ` a ${f.ate}` : ''}`;
      const datas = f.ini ? ` <small>(${_dBR(f.ini)} a ${_dBR(f.fim)})</small>` : '';
      return `<li class="rel-fase ${st}"><span class="rel-ic">${st === 'ok' ? '✅' : st === 'agora' ? '📍' : '○'}</span>
        <div>${rot ? `<b>${rot}</b> · ` : ''}${_esc(f.nome)}${datas}${st === 'agora' ? ' <em>estamos aqui</em>' : ''}${f.obs ? `<div class="rel-obs">→ ${_esc(f.obs)}</div>` : ''}</div></li>`;
    };
    const pilarHtml = pi => {
      const pausa = pi.fases.some(f => f.n === 5) ? `<li class="rel-pausa">${_esc(JORNADA_PADRAO.pausa.txt)}</li>` : '';
      const fases = pi.fases.map(faseHtml);
      if (pausa) fases.splice(1, 0, pausa);
      return `<section class="rel-pilar ${pi.st}">
        <div class="rel-pilar-top"><b>${pi.icone ? pi.icone + ' ' : ''}${_esc(pi.nome)}${pi.st === 'ok' ? ' ✅' : ''}</b>${pi.valor ? `<span>${_brl(pi.valor)}</span>` : ''}</div>
        ${pi.sub ? `<div class="rel-pilar-sub">${_esc(pi.sub)}</div>` : ''}
        <ul>${fases.join('')}</ul></section>`;
    };
    const grupos = [...new Set(r.presentes.map(x => x.grupo || 'Outros'))];
    ov.innerHTML = `
      <div class="mt-rel-barra no-print">
        <button class="mt-rel-btn" data-voltar type="button" aria-label="Voltar">←</button>
        <button class="mt-rel-btn" data-ajustar type="button">✏️ Ajustar</button>
        <button class="mt-rel-btn" data-zap type="button">💬 Resumo</button>
        <button class="mt-rel-btn on" data-pdf type="button">📄 PDF</button>
      </div>
      <article class="mt-rel-folha">
        <header class="rel-cab">
          <div class="rel-tit">Nossa jornada, ${nome} 🤍</div>
          <div class="rel-sub">${_esc(JORNADA_PADRAO.titulo)} · ${_esc(JORNADA_PADRAO.sub)}</div>
          <div class="rel-data">Relatório de ${hojeBR}</div>
        </header>

        <div class="rel-cards">
          <div class="rel-card">
            <div class="rel-card-rot">🎓 Minha entrega (mentoria)</div>
            <div class="rel-card-num">${_brl(r.entregue)} <small>de ${_brl(r.total)}</small></div>
            <div class="rel-barra"><i style="width:${r.pct}%"></i></div>
            <div class="rel-card-sub">${r.pct}% entregue${r.pilares.find(x => x.st === 'agora') ? ` · agora: ${_esc(r.pilares.find(x => x.st === 'agora').nome.replace(/^\d+\.\s*/, ''))}` : ''}</div>
          </div>
          ${p ? `<div class="rel-card">
            <div class="rel-card-rot">🔁 Tua entrega (${_esc(_plural(p.servico.toLowerCase()))})</div>
            <div class="rel-card-num">${_brl(p.pago)} <small>de ${_brl(p.total)}</small></div>
            <div class="rel-barra"><i style="width:${p.pct}%"></i></div>
            <div class="rel-card-sub">${p.feitas} de ${p.precisa} feitas a ${_brl(p.unit)}${p.quitada ? ' · ✅ quitada' : p.esperadas == null ? '' : p.atrasadas ? ` · ⚠️ ${p.atrasadas} atrasada${p.atrasadas === 1 ? '' : 's'}` : ' · em dia'}</div>
          </div>` : ''}
        </div>

        <h3 class="rel-h">A linha do tempo</h3>
        ${r.pilares.map(pilarHtml).join('')}

        <div class="rel-linha"></div>
        <h3 class="rel-h">🎁 Presentes, sem custo pra ti</h3>
        <p class="rel-p">Não cobro nada disso. Coloquei o valor de cada um só pra tu saber o que já foi entregue além da mentoria.</p>
        ${grupos.map(g => `<div class="rel-grupo">${_esc(g)}</div>${r.presentes.filter(x => (x.grupo || 'Outros') === g).map(x => `
          <div class="rel-pres"><div>${_esc(x.nome)}${x.nota ? `<small>${_esc(x.nota)}</small>` : ''}</div><span>${_brl(x.valor)}</span></div>`).join('')}`).join('')}
        <div class="rel-pres rel-pres-tot"><div>Total em presentes</div><span>${_brl(r.presentesTotal)}</span></div>
        <footer class="rel-rodape">Feito com 🤍 no Falcon</footer>
      </article>`;
    ov.querySelector('[data-voltar]').onclick = () => history.back();
    ov.querySelector('[data-pdf]').onclick = () => window.print();
    ov.querySelector('[data-zap]').onclick = () => {
      const d = digitosDe(l.contato || l.digitos), txt = encodeURIComponent(textoResumo(l));
      window.open(d ? `https://wa.me/55${d}?text=${txt}` : `https://wa.me/?text=${txt}`, '_blank', 'noopener');
    };
    ov.querySelector('[data-ajustar]').onclick = () => _modalAjustar(l, async jornada => {
      try { await salvarLead(l.id, { jornada }); l.jornada = jornada; desenhar(); aoSalvar?.(); showToast('Relatório ajustado ✓', 'success'); }
      catch (e) { showToast(/jornada|column/i.test(e.message) ? 'Falta rodar o SQL do relatório (sql/mentoria-jornada.sql)' : 'Não consegui salvar: ' + e.message, 'error'); }
    });
  };
  desenhar();
  return fechar;
}

// === BLOCO 4: AJUSTAR (fase atual e presentes) ===
function _modalAjustar(l, salvar) {
  const j = l.jornada || {}, r = resumoJornada(l);
  let pres = r.presentes.map(x => ({ ...x }));
  const auto = !Number.isInteger(j.atual);
  const opcoes = [..._fases().map(f => [f.n, f.n === 0 ? 'Início (preparação)' : `Fase ${f.n}${f.ate ? `–${f.ate}` : ''} · ${f.nome.slice(0, 38)}${f.nome.length > 38 ? '…' : ''}`]), [16, 'Concluída 🏁']];
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.style.zIndex = '9500'; // acima da folha do relatório
  const lista = () => pres.map((x, i) => `<div class="rel-ed-item" data-i="${i}">
      <input class="input-field" data-k="nome" value="${_esc(x.nome)}" placeholder="O que foi">
      <div class="obj-linha"><input class="input-field" data-k="valor" type="number" inputmode="numeric" min="0" value="${_esc(x.valor)}" placeholder="R$">
      <input class="input-field" data-k="grupo" value="${_esc(x.grupo || '')}" placeholder="Grupo"><button class="mt-perm-x" data-rm type="button" aria-label="Tirar">✕</button></div></div>`).join('');
  ov.innerHTML = `<div class="modal mt-perm-modal"><div class="modal-title">✏️ Ajustar relatório</div>
    <label class="mt-rot2" for="rl-f">Onde vocês estão</label>
    <select class="input-field" id="rl-f"><option value="auto"${auto ? ' selected' : ''}>Pela data (agora: fase ${faseDaData()})</option>
      ${opcoes.map(([n, t]) => `<option value="${n}"${!auto && j.atual === n ? ' selected' : ''}>${_esc(t)}</option>`).join('')}</select>
    <div class="mt-rot2">🎁 Presentes e valores</div><div id="rl-pres">${lista()}</div>
    <button class="mt-link-mini" data-add type="button">＋ Presente</button>
    <div class="modal-actions"><button class="btn-secondary" data-x type="button">Cancelar</button><button class="btn-primary" data-ok type="button">Salvar</button></div></div>`;
  document.body.appendChild(ov);
  trapModalBack(() => ov.remove());
  const ler = () => { ov.querySelectorAll('.rel-ed-item').forEach(el => { const x = pres[+el.dataset.i]; el.querySelectorAll('[data-k]').forEach(inp => { x[inp.dataset.k] = inp.dataset.k === 'valor' ? Math.max(0, Number(inp.value) || 0) : inp.value.trim(); }); }); };
  const religar = () => {
    ov.querySelector('#rl-pres').innerHTML = lista();
    ov.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { ler(); pres.splice(+b.closest('.rel-ed-item').dataset.i, 1); religar(); });
  };
  religar();
  ov.querySelector('[data-add]').onclick = () => { ler(); pres.push({ nome: '', valor: 0, grupo: 'Programação' }); religar(); };
  ov.querySelector('[data-x]').onclick = () => history.back();
  ov.addEventListener('click', e => { if (e.target === ov) history.back(); });
  ov.querySelector('[data-ok]').onclick = () => {
    ler();
    const f = ov.querySelector('#rl-f').value;
    const nova = { ...j, presentes: pres.filter(x => x.nome) };
    if (f === 'auto') delete nova.atual; else nova.atual = parseInt(f, 10);
    history.back(); salvar(nova);
  };
}
