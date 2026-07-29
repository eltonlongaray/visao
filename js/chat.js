// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — IMPORTS
// BLOCO 2 — MURAL DA COMUNIDADE
// BLOCO 3 — CONVERSAS PRIVADAS
// BLOCO 4 — MEMBROS + FOTOS + FAXINA
// ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS
// ═══════════════════════════════════════════════════════════════
// Camada de dados do chat. Duas modalidades na mesma tabela:
// 'comunidade' (mural, um fala para todos) e 'privado' (dois a dois).
//
// Quem garante a privacidade é o RLS no banco, não este arquivo — mesmo que
// alguém chame estas funções na mão pelo console, o Postgres só devolve o
// que a política permite. Ver migration/chat.sql.
import { supabase } from './config-supabase.js';
import { auth } from './autenticacao.js';
import { getProfile, setProfile } from './banco-dados.js';

const LIMITE = 200;

function _falha(error) {
  if (error) throw new Error(error.message || 'Erro no chat');
}

// Nome que assina a mensagem. Guardado junto na linha porque o autor pode
// mudar o perfil depois — a mensagem antiga mantém como ele assinava na hora.
export async function meuNomeDeChat() {
  try {
    const p = await getProfile();
    return (p?.preferredName || p?.fullName || '').trim() || 'Falcão';
  } catch { return 'Falcão'; }
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: MURAL DA COMUNIDADE
// ═══════════════════════════════════════════════════════════════
export async function fetchMural() {
  const { data, error } = await supabase
    .from('chat_mensagens')
    .select('id, autor_id, autor_nome, texto, imagem_path, arquivo_path, arquivo_nome, arquivo_mime, responde_a, created_at, expira_em, editada_em')
    .eq('escopo', 'comunidade')
    .order('created_at', { ascending: false })
    .limit(LIMITE);
  _falha(error);
  return (data || []).reverse();   // mais antigas em cima, como conversa
}

export async function enviarNoMural(texto, nome, imagemPath = null, respondeA = null, arquivo = null) {
  const t = (texto || '').trim();
  if (!t && !imagemPath) return;
  const { error } = await supabase.from('chat_mensagens').insert({
    escopo: 'comunidade',
    autor_id: auth.currentUser?.uid,
    autor_nome: nome,
    texto: t ? t.slice(0, 2000) : null,
    imagem_path: imagemPath,
    responde_a: respondeA,
  });
  _falha(error);
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: CONVERSAS PRIVADAS
// ═══════════════════════════════════════════════════════════════
export async function fetchConversa(outroId) {
  const meu = auth.currentUser?.uid;
  if (!meu || !outroId) return [];
  // Os dois sentidos da conversa. O RLS já barra o que não é meu, mas o
  // filtro explícito evita puxar o mural junto.
  const { data, error } = await supabase
    .from('chat_mensagens')
    .select('id, autor_id, para_id, autor_nome, texto, imagem_path, arquivo_path, arquivo_nome, arquivo_mime, responde_a, created_at, editada_em')
    .eq('escopo', 'privado')
    .or(`and(autor_id.eq.${meu},para_id.eq.${outroId}),and(autor_id.eq.${outroId},para_id.eq.${meu})`)
    .order('created_at', { ascending: false })
    .limit(LIMITE);
  _falha(error);
  return (data || []).reverse();
}

export async function enviarPrivado(outroId, texto, nome, imagemPath = null, respondeA = null, arquivo = null) {
  const t = (texto || '').trim();
  if ((!t && !imagemPath) || !outroId) return;
  const { error } = await supabase.from('chat_mensagens').insert({
    escopo: 'privado',
    autor_id: auth.currentUser?.uid,
    para_id: outroId,
    autor_nome: nome,
    texto: t ? t.slice(0, 2000) : null,
    imagem_path: imagemPath,
    responde_a: respondeA,
    arquivo_path: arquivo?.path || null,
    arquivo_nome: arquivo?.nome || null,
    arquivo_mime: arquivo?.mime || null,
  });
  _falha(error);
}

// ─── REAGIR E ENCAMINHAR ───────────────────────────────────────
// Uma linha por emoji, em LOTE: buscar reação de mensagem em mensagem seriam
// dezenas de consultas por atualização da lista.
export async function resumoReacoes(ids) {
  const lista = [...new Set((ids || []).filter(Boolean))];
  if (!lista.length) return new Map();
  const { data, error } = await supabase.rpc('resumo_reacoes', { ids: lista });
  if (error) { console.warn('[Falcon] resumo_reacoes:', error.message); return new Map(); }
  const mapa = new Map();
  for (const r of data || []) {
    if (!mapa.has(r.mensagem_id)) mapa.set(r.mensagem_id, []);
    mapa.get(r.mensagem_id).push({ emoji: r.emoji, total: Number(r.total) || 0, eu: !!r.eu });
  }
  return mapa;
}

// UMA reação por pessoa: tocar no mesmo emoji tira, tocar em outro troca.
// O upsert é o que faz a troca ser uma operação só — apagar e recriar faria
// a reação piscar para todo mundo que estivesse com a tela aberta.
export async function reagir(mensagemId, emoji, meuAtual) {
  const id = auth.currentUser?.uid;
  if (!id) throw new Error('Sessão expirada');
  if (meuAtual === emoji) {
    const { error } = await supabase.from('chat_reacoes')
      .delete().eq('mensagem_id', mensagemId).eq('user_id', id);
    _falha(error);
    return;
  }
  const { error } = await supabase.from('chat_reacoes')
    .upsert({ mensagem_id: mensagemId, user_id: id, emoji },
            { onConflict: 'mensagem_id,user_id' });
  _falha(error);
}

// Quem reagiu, pra folha de detalhe. O RLS já garante que só volta gente de
// mensagem que eu posso ver.
export async function quemReagiu(mensagemId) {
  const { data, error } = await supabase
    .from('chat_reacoes')
    .select('user_id, emoji, created_at')
    .eq('mensagem_id', mensagemId)
    .order('created_at', { ascending: true });
  if (error) { console.warn('[Falcon] quemReagiu:', error.message); return []; }
  return data || [];
}

// Encaminhar NÃO copia o arquivo da foto: a mensagem nova aponta pro mesmo
// caminho. A permissão continua correta porque quem pode ler a mensagem nova
// pode ver a imagem dela.
export async function encaminhar(msg, paraId, nome) {
  if (!paraId) return;
  const { error } = await supabase.from('chat_mensagens').insert({
    escopo: 'privado',
    autor_id: auth.currentUser?.uid,
    para_id: paraId,
    autor_nome: nome,
    texto: msg.texto || null,
    imagem_path: msg.imagem_path || null,
    arquivo_path: msg.arquivo_path || null,
    arquivo_nome: msg.arquivo_nome || null,
    arquivo_mime: msg.arquivo_mime || null,
  });
  _falha(error);
}

// ─── FOTO NA MENSAGEM ──────────────────────────────────────────
// Sobe a imagem primeiro e insere a mensagem depois. Se o envio falhar, não
// nasce mensagem quebrada apontando pra arquivo que não existe.
export async function subirFotoDoChat(blob) {
  const id = auth.currentUser?.uid;
  if (!id) throw new Error('Sessão expirada');
  const nome = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const caminho = `${id}/${nome}`;
  const { error } = await supabase.storage
    .from('chat-fotos')
    .upload(caminho, blob, { contentType: 'image/jpeg' });
  if (error) throw new Error(error.message || 'Não deu pra enviar a foto');
  return caminho;
}

// O bucket é privado, então a imagem só abre por URL assinada. Assina em
// LOTE: uma chamada por mensagem seriam dezenas de idas ao servidor a cada
// atualização da lista. Validade curta de propósito — a lista se redesenha
// sozinha e as URLs são refeitas junto.
const ASSINATURA_SEG = 60 * 60;
export async function assinarFotos(caminhos) {
  const unicos = [...new Set((caminhos || []).filter(Boolean))];
  if (!unicos.length) return new Map();
  const { data, error } = await supabase.storage
    .from('chat-fotos')
    .createSignedUrls(unicos, ASSINATURA_SEG);
  if (error) {
    console.warn('[Falcon] assinarFotos:', error.message);
    return new Map();
  }
  return new Map((data || []).filter(d => d.signedUrl).map(d => [d.path, d.signedUrl]));
}

// ─── ARQUIVOS E ÁUDIO ──────────────────────────────────────────
// Sobe o arquivo e devolve o que a mensagem precisa guardar. Preserva o nome
// original (pra mostrar e baixar) e o mime (pra decidir player x card).
export async function subirArquivoDoChat(file) {
  const id = auth.currentUser?.uid;
  if (!id) throw new Error('Sessão expirada');
  if (file.size > 10 * 1024 * 1024) throw new Error('Arquivo grande demais (máx 10 MB).');
  // extensão preservada só pra o navegador reconhecer no download; o nome
  // real fica em arquivo_nome
  const ext = (file.name.match(/\.[a-z0-9]{1,8}$/i) || [''])[0].toLowerCase();
  const caminho = `${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  const { error } = await supabase.storage
    .from('chat-arquivos')
    .upload(caminho, file, { contentType: file.type || 'application/octet-stream' });
  if (error) throw new Error(error.message || 'Não deu pra enviar o arquivo');
  return { path: caminho, nome: file.name || 'arquivo', mime: file.type || '' };
}

// Assina em lote, igual às fotos — bucket privado.
export async function assinarArquivos(caminhos) {
  const unicos = [...new Set((caminhos || []).filter(Boolean))];
  if (!unicos.length) return new Map();
  const { data, error } = await supabase.storage
    .from('chat-arquivos')
    .createSignedUrls(unicos, ASSINATURA_SEG);
  if (error) { console.warn('[Falcon] assinarArquivos:', error.message); return new Map(); }
  return new Map((data || []).filter(d => d.signedUrl).map(d => [d.path, d.signedUrl]));
}

// Faxina dos arquivos vencidos, mesma lógica das fotos.
export async function faxinaArquivos() {
  const id = auth.currentUser?.uid;
  if (!id) return;
  try {
    const { data: arqs, error } = await supabase.storage
      .from('chat-arquivos').list(id, { limit: 200 });
    if (error || !arqs?.length) return;
    const { data: vivas } = await supabase
      .from('chat_mensagens')
      .select('arquivo_path')
      .eq('autor_id', id)
      .not('arquivo_path', 'is', null);
    const usados = new Set((vivas || []).map(v => v.arquivo_path));
    const lixo = arqs.map(a => `${id}/${a.name}`).filter(c => !usados.has(c));
    if (lixo.length) await supabase.storage.from('chat-arquivos').remove(lixo);
  } catch { /* acessória */ }
}

// Apaga do armazenamento toda foto MINHA que não está mais presa a uma
// mensagem viva — expirada ou apagada. Sem isto o arquivo sobreviveria à
// mensagem e o "some em 7 dias" valeria só para o texto.
//
// Cada um limpa a própria pasta porque a policy de remoção só permite isso.
// Consequência assumida: quem nunca mais abre o chat deixa arquivo pra trás.
export async function faxinaFotos() {
  const id = auth.currentUser?.uid;
  if (!id) return;
  try {
    const { data: arquivos, error } = await supabase.storage
      .from('chat-fotos').list(id, { limit: 200 });
    if (error || !arquivos?.length) return;

    const { data: vivas } = await supabase
      .from('chat_mensagens')
      .select('imagem_path')
      .eq('autor_id', id)
      .not('imagem_path', 'is', null);

    const usados = new Set((vivas || []).map(v => v.imagem_path));
    const lixo = arquivos.map(a => `${id}/${a.name}`).filter(c => !usados.has(c));
    if (lixo.length) await supabase.storage.from('chat-fotos').remove(lixo);
  } catch { /* faxina é acessória: falhar aqui não pode atrapalhar o chat */ }
}

// Lista de quem já trocou mensagem comigo, com a última de cada conversa.
export async function fetchConversas() {
  const { data, error } = await supabase.rpc('minhas_conversas');
  if (error) { console.warn('[Falcon] minhas_conversas:', error.message); return []; }
  return data || [];
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: MEMBROS + FAXINA
// ═══════════════════════════════════════════════════════════════
// Só id e nome de exibição — a função no banco não devolve e-mail nem telefone.
export async function fetchMembros() {
  const { data, error } = await supabase.rpc('membros_comunidade');
  // Propaga em vez de devolver lista vazia: "a chamada falhou" e "não há mais
  // ninguém" apareciam iguais na tela, e isso escondia o motivo real.
  if (error) throw new Error(error.message || 'Erro ao listar membros');
  return data || [];
}

// ─── FOTOS ─────────────────────────────────────────────────────
// Mapa id -> { nome, foto } de todo mundo, inclusive de quem está chamando:
// o mural mostra as minhas mensagens junto das outras e elas também precisam
// de rosto. A mensagem guarda o NOME de quando foi escrita, mas a foto é
// sempre a atual — trocou nos Ajustes, muda no histórico inteiro.
let _perfis = null;
let _perfisEm = 0;
const PERFIS_TTL = 5 * 60 * 1000;

export async function fetchPerfis({ forcar = false } = {}) {
  if (!forcar && _perfis && Date.now() - _perfisEm < PERFIS_TTL) return _perfis;
  const { data, error } = await supabase.rpc('perfis_do_chat');
  if (error) {
    // Sem foto o chat continua funcionando com as iniciais coloridas.
    console.warn('[Falcon] perfis_do_chat:', error.message);
    return _perfis || new Map();
  }
  _perfis = new Map((data || []).map(p => [p.user_id, { nome: p.nome, foto: p.foto || null }]));
  _perfisEm = Date.now();
  return _perfis;
}

export function limparCachePerfis() { _perfis = null; _perfisEm = 0; }

// Sobe a foto escolhida e aponta o perfil pra ela. O caminho é sempre
// '{uid}/foto.jpg' — a política do bucket exige que a primeira pasta seja o
// próprio id, então ninguém sobrescreve a foto de outro.
export async function trocarMinhaFoto(blob) {
  const id = auth.currentUser?.uid;
  if (!id) throw new Error('Sessão expirada');
  const caminho = `${id}/foto.jpg`;
  const { error } = await supabase.storage
    .from('avatares')
    .upload(caminho, blob, { upsert: true, contentType: 'image/jpeg' });
  if (error) throw new Error(error.message || 'Não deu pra enviar a foto');

  const { data } = supabase.storage.from('avatares').getPublicUrl(caminho);
  // ?t= derruba o cache do CDN: o caminho é o mesmo a cada troca e sem isso
  // a foto antiga continuaria aparecendo.
  const url = `${data.publicUrl}?t=${Date.now()}`;
  await setProfile({ fotoUrl: url });
  limparCachePerfis();
  return url;
}

// Traz a foto do Google pra DENTRO do nosso bucket, uma vez só. Apontar pro
// lh3.googleusercontent.com deixava a foto refém de um servidor que não é
// nosso: link que caduca, política que muda, conta que some. Depois disto a
// imagem é nossa e não depende de mais ninguém.
//
// Roda em silêncio: se falhar, a foto do Google continua sendo usada como
// estava e ninguém perde nada.
const MARCA_ESPELHO = 'falcon_foto_espelhada';
export async function espelharFotoDoGoogle() {
  try {
    if (localStorage.getItem(MARCA_ESPELHO) === '1') return;
    const id = auth.currentUser?.uid;
    const origem = auth.currentUser?.photoURL;
    if (!id || !origem) return;

    // Já tem foto escolhida? Então não há o que espelhar — a dela vence.
    const p = await getProfile();
    if (p?.fotoUrl) { localStorage.setItem(MARCA_ESPELHO, '1'); return; }

    const resp = await fetch(origem, { mode: 'cors', referrerPolicy: 'no-referrer' });
    if (!resp.ok) return;
    const blob = await resp.blob();
    if (!blob.size || blob.size > 2_000_000) return;

    const caminho = `${id}/foto.jpg`;
    const { error } = await supabase.storage
      .from('avatares').upload(caminho, blob, { upsert: true, contentType: blob.type || 'image/jpeg' });
    if (error) return;

    const { data } = supabase.storage.from('avatares').getPublicUrl(caminho);
    await setProfile({ fotoUrl: `${data.publicUrl}?t=${Date.now()}` });
    localStorage.setItem(MARCA_ESPELHO, '1');
    limparCachePerfis();
  } catch { /* silencioso de propósito: a foto do Google segue valendo */ }
}

// Volta pra foto do Google (ou pras iniciais, se a pessoa não entrou por lá).
export async function removerMinhaFoto() {
  const id = auth.currentUser?.uid;
  if (id) await supabase.storage.from('avatares').remove([`${id}/foto.jpg`]);
  await setProfile({ fotoUrl: null });
  limparCachePerfis();
}

// Só o texto muda. Um gatilho no banco rejeita qualquer outra alteração —
// sem ele, editar seria uma porta pra esticar a validade da mensagem ou
// mover uma conversa privada pro mural.
export async function editarMensagem(id, texto) {
  const t = (texto || '').trim();
  if (!t) return;
  const { error } = await supabase.from('chat_mensagens')
    .update({ texto: t.slice(0, 2000) }).eq('id', id);
  _falha(error);
}

export async function apagarMensagem(id) {
  const { error } = await supabase.from('chat_mensagens').delete().eq('id', id);
  _falha(error);
}

// Chamada de vez em quando ao abrir o chat. A expiração já é garantida na
// leitura pelo RLS; isto só evita a tabela crescer para sempre.
export async function faxinaChat() {
  try { await supabase.rpc('limpar_chat_expirado'); } catch { /* silencioso */ }
}

// Quanto falta para a mensagem sumir — o chat é temporário e isso precisa
// ficar visível, senão as pessoas contam com um histórico que não existe.
export function tempoRestante(criadaEm) {
  const fim = new Date(criadaEm).getTime() + 7 * 24 * 60 * 60 * 1000;
  const falta = fim - Date.now();
  if (falta <= 0) return 'expirando';
  const dias = Math.floor(falta / 86400000);
  if (dias >= 1) return `${dias}d`;
  const horas = Math.floor(falta / 3600000);
  return horas >= 1 ? `${horas}h` : 'menos de 1h';
}
