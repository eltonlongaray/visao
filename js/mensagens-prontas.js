// mensagens-prontas.js — "💬 Mensagens prontas" no perfil da cliente (25/11/2026, caso Alê).
// A profissional escolhe a situação (primeiro contato, tá comparando, tá caro, não é o momento,
// horário não bate, sem resposta, produtos pra casa) e a mensagem vem PREENCHIDA com o nome,
// o que a cliente marcou na triagem, o serviço indicado e 2 horários livres de verdade da agenda.
// Ela pode editar o texto e toca em "Enviar no WhatsApp": abre direto a conversa da cliente.

// === BLOCO 1: IMPORTS E CONFIG ===
import { getSlotsOcupados, estaOcupado } from './agenda.js';
import { showToast } from './aviso-tela.js';

// Promoção por profissional (some sozinha depois de "ate"). Mesmo texto aprovado da triagem/agenda.
const PROMO = {
  V83: { ate: '2026-11-30', nome: 'preço da Black', prazo: '30/11' },
};
// Preço de promoção por serviço (início do nome), quando difere do preço da agenda
const PRECO_PROMO = {
  V83: { 'Esculpe Detox': 597, 'Deusa Grega': 197 },
};

// === BLOCO 2: HELPERS ===
const _esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const SEM = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const reais = v => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: Number(v) % 1 ? 2 : 0, maximumFractionDigits: 2 });
const primeiro = n => String(n || '').trim().split(/\s+/)[0] || '';
const nomeCurto = n => String(n || '').split(' – ')[0].split(' (')[0].trim();
// "a, b e c" e tudo minúsculo (respostas da triagem vêm separadas por vírgula)
const lista = v => {
  const xs = String(v || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  return xs.length > 1 ? xs.slice(0, -1).join(', ') + ' e ' + xs[xs.length - 1] : (xs[0] || '');
};
const promoAtiva = slug => { const p = PROMO[slug]; return p && iso(new Date()) <= p.ate ? p : null; };

function _zapLink(contato, texto) {
  let d = String(contato || '').replace(/\D/g, '');
  if (!d) return null;
  if (!d.startsWith('55') && d.length <= 11) d = '55' + d;
  return `https://wa.me/${d}?text=${encodeURIComponent(texto)}`;
}
// "Alexandra - Espaço Viver" → { prof: 'Alê'?, negocio: 'Espaço Viver' }
function _quem(cfg) {
  const t = String(cfg?.titulo || '');
  const [a, b] = t.split(/\s[-–·]\s/);
  const apelido = { V83: 'Alê' }[cfg?.slug];
  return { prof: apelido || primeiro(a) || 'eu', negocio: (b || '').trim() };
}

// === BLOCO 3: 2 HORÁRIOS LIVRES DE VERDADE (dias diferentes, a partir de amanhã) ===
const _segISO = d => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return iso(x); };
function _horariosDoDia(cfg, d) {
  const wk = cfg.semanas && cfg.semanas[_segISO(d)];
  const base = wk != null ? wk : (cfg.disponibilidade || {});
  return (base[String(d.getDay())] || []).slice().sort();
}
// (27/11) Horário oferecido numa mensagem fica guardado pra AQUELA cliente por 2 dias (neste aparelho):
// a próxima cliente recebe outros horários, pra duas não aceitarem o mesmo.
const _OFK = slug => `falcon_hor_oferecidos_${slug}`;
function _oferecidos(slug) {
  try { const a = JSON.parse(localStorage.getItem(_OFK(slug)) || '[]'); return Array.isArray(a) ? a.filter(x => x.ate > Date.now()) : []; } catch { return []; }
}
function marcarOferecidos(slug, cli, hs) {
  try {
    const a = _oferecidos(slug).filter(x => x.cli !== cli);
    for (const h of hs) a.push({ k: h.k, dur: h.dur || 60, cli, ate: Date.now() + 2 * 86400000 });
    localStorage.setItem(_OFK(slug), JSON.stringify(a.slice(-80)));
  } catch {}
}
async function horariosLivres(cfg, cli, n = 2, durCli = 0) {
  const ini = new Date(); ini.setHours(0, 0, 0, 0); ini.setDate(ini.getDate() + 1);
  const fim = new Date(ini); fim.setDate(fim.getDate() + 30);
  let ocup = new Map();
  try { ocup = await getSlotsOcupados(cfg.slug, iso(ini), iso(fim)); } catch {}
  const DUR = durCli || cfg.duracao_min || 60, INT = Number(cfg.intervalo_min) || 0, out = [];
  // oferecido pra OUTRA cliente conta como ocupado (com a duração do serviço dela + intervalo), pra não encavalar
  const toM = h => { const [a, b] = h.split(':').map(Number); return a * 60 + (b || 0); };
  const ofs = _oferecidos(cfg.slug).filter(x => x.cli !== cli);
  const deOutra = (isoD, h) => ofs.some(x => { const [d0, h0] = x.k.split(' '); if (d0 !== isoD) return false;
    const a = toM(h0), b = toM(h); return b < a + (x.dur || 60) + INT && a < b + DUR + INT; });
  for (let d = new Date(ini); d <= fim && out.length < n; d.setDate(d.getDate() + 1)) {
    const livres = _horariosDoDia(cfg, d).filter(h => !estaOcupado(ocup, iso(d), h, DUR, INT));
    // prefere o 2º horário do dia (nem o primeiro nem o último) e pula o que já foi oferecido pra outra cliente
    const ordem = livres.length > 1 ? [livres[1], livres[0], ...livres.slice(2)] : livres;
    const h = ordem.find(x => !deOutra(iso(d), x));
    if (h) out.push({ k: `${iso(d)} ${h}`, dur: DUR, txt: `${SEM[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)} às ${h.replace(':', 'h')}` });
  }
  return out;
}

// === BLOCO 4: DADOS DA CLIENTE (triagem) ===
function dadosCliente(cfg, c) {
  const t = (c.triagens || [])[0];
  const r = t?.respostas || {}, resp = r.respostas || {};
  const servNome = (r.plano || [])[0] || r.indicacao || '';
  const serv = (cfg?.servicos || []).find(s => s.nome === servNome) || (cfg?.servicos || []).find(s => servNome && s.nome.startsWith(nomeCurto(servNome)));
  const promoPreco = Object.entries(PRECO_PROMO[cfg?.slug] || {}).find(([k]) => nomeCurto(servNome).startsWith(k))?.[1];
  const preco = promoAtiva(cfg?.slug) && promoPreco != null ? promoPreco : serv?.preco;
  const queixa = lista(resp['Incômodo']);
  const regiao = lista(resp['Região']);
  const casa = String(resp['Cuidar em casa'] || '');
  return {
    nome: primeiro(c.nome),
    temTriagem: !!t,
    servico: nomeCurto(servNome),
    sessoes: Number(serv?.sessoes) > 1 ? Number(serv.sessoes) : 0,
    duracao: Number(serv?.duracaoMin) || 0,   // pra sugerir horário que caiba o serviço dela   // pacote (ex.: Esculpe = 5 sessões)
    preco: preco != null ? reais(preco) : '',
    queixa: queixa ? queixa + (regiao ? ` (${regiao})` : '') : '',
    querExperimentar: /experimentar/i.test(resp['Objetivo'] || ''),
    casa: casa && !/não tenho interesse/i.test(casa) ? casa.toLowerCase() : '',   // opções da pergunta já têm vírgula ('Celulite, gordura e inchaço')
    catalogo: /sim/i.test(resp['Catálogo'] || ''),
  };
}

// === BLOCO 5: MODELOS DE MENSAGEM ===
// Regras (o "jeito de abordar"): nome · o que ela marcou · tirar as travas (data e pagamento) · 2 horários
function modelos(cfg, c, hs) {
  const d = dadosCliente(cfg, c), q = _quem(cfg), p = promoAtiva(cfg?.slug);
  const oi = `Oi${d.nome ? ', ' + d.nome : ''}!`;
  const h2 = hs.length >= 2 ? `${hs[0]} ou ${hs[1]}` : (hs[0] || 'um horário essa semana');
  // (27/11) pacote diz que são N sessões, e o preço é do tratamento todo
  const serv = !d.servico ? 'o cuidado certo pra ti' : d.sessoes ? `o ${d.servico}, um tratamento de ${d.sessoes} sessões` : `a ${d.servico}`;
  const precoServ = d.preco && d.servico ? ` (${d.preco}${d.sessoes ? ` pelas ${d.sessoes} sessões` : ''})` : '';
  const promo = p ? `Ainda dá pra garantir o ${p.nome}${precoServ} marcando até ${p.prazo}, mesmo que a primeira sessão seja em dezembro. ` : '';
  const pagaDepois = 'E tu só paga no dia, depois do atendimento.';
  const out = [];
  if (d.temTriagem) out.push({ id: 'primeiro', rot: '👋 Primeiro contato', txt:
`${oi} Aqui é a ${q.prof}${q.negocio ? ', do ' + q.negocio : ''} 💜
Vi tua triagem${d.queixa ? `: tu quer cuidar de ${d.queixa}` : ''}. ${d.querExperimentar ? `Como tu quer experimentar primeiro, eu indico começar com uma sessão de ${d.servico || 'avaliação'}.` : `Pro teu caso eu indico ${serv}.`}
${promo}${pagaDepois}
Tenho ${h2}. Qual fica melhor pra ti?` });
  out.push({ id: 'comparando', rot: '🔍 Tá comparando / avaliando', txt:
`${oi} Tu tá certíssima em comparar 💜
Pra tu ver se funciona de verdade: no atendimento eu acompanho tua evolução, então tu vê o resultado em números.
E tu não arrisca nada: só paga depois do atendimento.${p ? ` Marcando até ${p.prazo} sai pelo ${p.nome}${precoServ}, mesmo que a primeira sessão seja em dezembro.` : ''}
Quer que eu reserve ${h2} pra ti?` });
  out.push({ id: 'caro', rot: '💰 Achou caro', txt:
`Entendo${d.nome ? ', ' + d.nome : ''}! 💜 Pra começar sem pesar no bolso, tu pode fazer uma sessão avulsa e sentir o resultado antes de decidir o tratamento.
Tu só paga no dia, depois do atendimento${p ? `, e marcando até ${p.prazo} ainda garante o ${p.nome}` : ''}.
Quer que eu reserve ${h2}?` });
  out.push({ id: 'momento', rot: '⏳ Não é o momento', txt:
`Tudo bem${d.nome ? ', ' + d.nome : ''}, sem pressa 💜
Só pra tu saber: dá pra marcar agora uma data mais pra frente${p ? ` e garantir o ${p.nome}` : ''}, e tu só paga no dia, depois do atendimento.
Se quiser, eu seguro ${h2} pra ti. Se não der, é só me avisar.` });
  out.push({ id: 'horario', rot: '🕐 Horário não bate', txt:
`Sem problema${d.nome ? ', ' + d.nome : ''}! 💜 Me diz qual dia e turno ficam melhor pra ti (manhã, tarde ou noite) que eu vejo um encaixe na minha agenda.` });
  out.push({ id: 'sem-resposta', rot: '🔔 Não respondeu (2 dias)', txt: p
    ? `${d.nome ? d.nome + ', s' : 'S'}ó pra tu não perder: o ${p.nome} vale pra quem marcar até ${p.prazo}, e a primeira sessão pode ser em dezembro. Quer que eu reserve ${hs[0] || 'um horário'} pra ti? Pagamento só no dia 💜`
    : `${oi} Passando pra saber se tu conseguiu ver minha mensagem 💜 Ainda tenho ${hs[0] || 'horário'} livre. Quer que eu reserve pra ti?` });
  if (d.casa || d.catalogo) out.push({ id: 'casa', rot: '🌿 Produtos pra casa', txt:
`${oi} Tu marcou na triagem que quer continuar o cuidado em casa${d.casa ? ` (${d.casa})` : ''}. Separei os produtos que combinam contigo 💜
Quer que eu te mande os valores aqui, ou prefere ver no dia da sessão?` });
  return out;
}

// === BLOCO 6: HTML + LIGAÇÕES NO PERFIL ===
export function mensagensPerfilHtml(c) {
  if (!c?.contato) return '';
  return `<div class="ag-msg">
    <button class="ag-cli-hist-btn" id="agp-msg-btn" type="button">💬 Mensagens prontas <span class="ag-cli-hist-seta" id="agp-msg-seta">▾</span></button>
    <div id="agp-msg" hidden></div>
  </div>`;
}
export function wireMensagensPerfil(ov, cfg, c) {
  const btn = ov.querySelector('#agp-msg-btn'); if (!btn) return;
  const box = ov.querySelector('#agp-msg'), seta = ov.querySelector('#agp-msg-seta');
  let ms = null, sel = null, hsObj = [];
  const desenhar = () => {
    const m = ms.find(x => x.id === sel);
    box.innerHTML = `
      <details class="ag-msg-dica"><summary>Como abordar (toca pra ver)</summary>
        <ul><li>Chama pelo <b>nome</b>.</li><li>Fala o que ela <b>marcou na triagem</b>.</li>
        <li>Tira as travas: <b>pode ser outra data</b> e <b>só paga depois</b>.</li><li>Termina com <b>2 horários</b> pra ela escolher.</li>
        <li>Revisa antes de mandar. Se não responder em 2 dias, manda a de "Não respondeu".</li></ul></details>
      <div class="ag-msg-ops">${ms.map(x => `<button type="button" class="ag-msg-op${x.id === sel ? ' sel' : ''}" data-msg="${x.id}" aria-pressed="${x.id === sel}">${_esc(x.rot)}</button>`).join('')}</div>
      ${m ? `<textarea class="ag-msg-txt" id="agp-msg-txt" rows="8">${_esc(m.txt)}</textarea>
        <div class="ag-msg-acoes">
          <button type="button" class="ag-cli-wa" id="agp-msg-env">📲 Enviar no WhatsApp</button>
          <button type="button" class="ag-cli-wa-ed" id="agp-msg-cop">Copiar</button>
        </div>
        <div class="ag-msg-obs">Dá pra editar o texto antes de enviar.</div>` : '<div class="ag-msg-obs">Escolhe a situação e a mensagem já vem pronta.</div>'}`;
    box.querySelectorAll('[data-msg]').forEach(b => b.onclick = () => { sel = b.dataset.msg; desenhar(); });
    const txt = () => box.querySelector('#agp-msg-txt')?.value || '';
    box.querySelector('#agp-msg-env')?.addEventListener('click', () => {
      const url = _zapLink(c.contato, txt()); if (url) window.open(url, '_blank', 'noopener');
      marcarOferecidos(cfg?.slug, c.key, hsObj);   // esses horários ficam pra ela por 2 dias
    });
    box.querySelector('#agp-msg-cop')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(txt()); marcarOferecidos(cfg?.slug, c.key, hsObj); showToast('Mensagem copiada', 'success'); } catch { showToast('Não deu pra copiar', 'error'); }
    });
  };
  btn.addEventListener('click', async () => {
    const abrir = box.hidden; box.hidden = !abrir; if (seta) seta.textContent = abrir ? '▴' : '▾';
    if (!abrir || ms) return;
    box.innerHTML = '<div class="ag-msg-obs">Montando as mensagens…</div>';
    const dc = dadosCliente(cfg, c);
    hsObj = await horariosLivres(cfg || {}, c.key, 2, dc.duracao);
    ms = modelos(cfg, c, hsObj.map(h => h.txt));
    sel = ms[0]?.id || null;
    desenhar();
  });
}
