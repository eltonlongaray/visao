// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — IMPORTS + FORMATO
// BLOCO 2 — PERÍODO (semana começa na SEGUNDA)
// BLOCO 3 — LEITURA E ESCRITA
// BLOCO 4 — CÁLCULO DE PROGRESSO
// ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS + FORMATO
// ═══════════════════════════════════════════════════════════════
// Objetivos são o ALVO declarado da constância. Sem eles o Desempenho media
// "40 dias seguidos" sem responder seguidos EM QUÊ.
//
// Cada objetivo tem a própria periodicidade — 4× por semana e 1× por mês são
// alvos diferentes e não podem ser medidos pela mesma régua.
//
// Dois modos de contagem:
//   'ritual' — puxa das tarefas concluídas no Ritual. É o caminho bom: a
//              pessoa já marca a academia lá, e pedir pra marcar de novo aqui
//              seria trabalho dobrado com duas contagens que divergem.
//   'manual' — pra objetivo que não vira tarefa (ex.: "ligar pra mãe").
//
// Ficam em profiles.extra (o setProfile joga chave desconhecida pra lá), o
// que evita tabela nova e SQL pra rodar. São poucos por pessoa e sempre lidos
// junto do perfil.
import { getProfile, setProfile, fetchDaysRange } from './banco-dados.js';

export const PERIODOS = {
  semana: { nome: 'por semana', dias: 7 },
  mes:    { nome: 'por mês',    dias: 30 },
};

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: PERÍODO — a semana começa na SEGUNDA
// ═══════════════════════════════════════════════════════════════
// Decisão do Elton. Importa mais do que parece: é o dia em que "4× por
// semana" zera. Se zerar num dia que a pessoa não espera, ela perde progresso
// sem entender por quê.
function idDoDia(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function inicioDoPeriodo(periodo, hoje = new Date()) {
  const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  if (periodo === 'mes') return new Date(d.getFullYear(), d.getMonth(), 1);
  // getDay(): 0 = domingo. Para semana começando na segunda, domingo é o
  // ÚLTIMO dia e precisa voltar 6, não 0.
  const diaSemana = d.getDay();
  const voltar = diaSemana === 0 ? 6 : diaSemana - 1;
  d.setDate(d.getDate() - voltar);
  return d;
}

export function fimDoPeriodo(periodo, hoje = new Date()) {
  const ini = inicioDoPeriodo(periodo, hoje);
  if (periodo === 'mes') return new Date(ini.getFullYear(), ini.getMonth() + 1, 0);
  const f = new Date(ini);
  f.setDate(f.getDate() + 6);
  return f;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: LEITURA E ESCRITA
// ═══════════════════════════════════════════════════════════════
export async function listarObjetivos() {
  const p = await getProfile();
  const lista = p?.objetivos;
  return Array.isArray(lista) ? lista : [];
}

export async function salvarObjetivo(obj) {
  const lista = await listarObjetivos();
  const i = lista.findIndex(o => o.id === obj.id);
  if (i >= 0) lista[i] = { ...lista[i], ...obj };
  else lista.push({ ...obj, id: obj.id || _novoId(), criadoEm: idDoDia(new Date()) });
  await setProfile({ objetivos: lista });
  return lista;
}

export async function removerObjetivo(id) {
  const lista = (await listarObjetivos()).filter(o => o.id !== id);
  await setProfile({ objetivos: lista });
  return lista;
}

// Marca/desmarca um dia num objetivo manual. Guarda a data, não um contador:
// com contador não dá pra saber se a pessoa marcou duas vezes no mesmo dia,
// nem pra mostrar quais dias foram.
export async function alternarMarcacao(id, diaId = idDoDia(new Date())) {
  const lista = await listarObjetivos();
  const obj = lista.find(o => o.id === id);
  if (!obj) return lista;
  const marcados = new Set(obj.marcados || []);
  if (marcados.has(diaId)) marcados.delete(diaId); else marcados.add(diaId);
  // guarda no máximo ~1 ano: o histórico velho não é usado e só engorda o perfil
  obj.marcados = [...marcados].sort().slice(-370);
  await setProfile({ objetivos: lista });
  return lista;
}

function _novoId() {
  return 'obj-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: CÁLCULO DE PROGRESSO
// ═══════════════════════════════════════════════════════════════
// Uma única leitura do banco cobre TODOS os objetivos do período: buscar por
// objetivo seriam N consultas a cada abertura da Home.
export async function progressoDosObjetivos(objetivos, hoje = new Date()) {
  if (!objetivos?.length) return new Map();

  // O intervalo é o do período mais LARGO em uso — assim uma consulta serve
  // pros de semana e pros de mês.
  const temMes = objetivos.some(o => o.periodo === 'mes');
  const ini = inicioDoPeriodo(temMes ? 'mes' : 'semana', hoje);
  const fim = fimDoPeriodo(temMes ? 'mes' : 'semana', hoje);

  let dias = [];
  const precisaRitual = objetivos.some(o => o.origem === 'ritual');
  if (precisaRitual) {
    try { dias = await fetchDaysRange(ini, fim); }
    catch (e) { console.warn('[objetivos] fetchDaysRange:', e.message); }
  }
  const porDia = new Map(dias.map(d => [d.id, d]));

  const mapa = new Map();
  for (const obj of objetivos) {
    const i = inicioDoPeriodo(obj.periodo || 'semana', hoje);
    const f = fimDoPeriodo(obj.periodo || 'semana', hoje);
    const feitos = obj.origem === 'ritual'
      ? _contarNoRitual(obj, porDia, i, f)
      : _contarManual(obj, i, f);
    const alvo = Math.max(1, Number(obj.vezes) || 1);
    mapa.set(obj.id, {
      feitos,
      alvo,
      // O teto em 100% é de propósito: fazer 5 de 4 é ótimo, mas mostrar
      // 125% faria a barra estourar e a leitura perder o sentido.
      pct: Math.min(100, Math.round((feitos / alvo) * 100)),
      cumprido: feitos >= alvo,
      inicio: idDoDia(i),
      fim: idDoDia(f),
    });
  }
  return mapa;
}

// Conta DIAS com a atividade concluída, não tarefas: duas idas à academia no
// mesmo dia continuam sendo um dia de academia.
function _contarNoRitual(obj, porDia, ini, fim) {
  let n = 0;
  for (const d = new Date(ini); d <= fim; d.setDate(d.getDate() + 1)) {
    const dia = porDia.get(idDoDia(d));
    if (!dia?.tasks?.length) continue;
    if (dia.tasks.some(t => t.done && _casa(t, obj))) n++;
  }
  return n;
}

// Casa por activityId quando existe — renomear a atividade não pode quebrar o
// vínculo. O título é só reserva, para tarefa criada solta.
function _casa(tarefa, obj) {
  if (obj.atividadeId && tarefa.activityId) return tarefa.activityId === obj.atividadeId;
  return _limpo(tarefa.title) === _limpo(obj.atividadeNome || obj.nome);
}

function _limpo(s) {
  return String(s || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function _contarManual(obj, ini, fim) {
  const a = idDoDia(ini), b = idDoDia(fim);
  return (obj.marcados || []).filter(d => d >= a && d <= b).length;
}

export function marcadoHoje(obj) {
  return (obj.marcados || []).includes(idDoDia(new Date()));
}
