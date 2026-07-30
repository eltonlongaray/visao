// ─── ÍNDICE ──────────────────────────────────────────────────
// BLOCO 1 — IMPORTS
// BLOCO 2 — FÓRMULAS PURAS (% gordura US Navy, meta de água IMC-ajustada)
// BLOCO 3 — PERFIL (sexo, altura, peso)
// BLOCO 4 — REGISTROS (medições datadas)
// BLOCO 5 — FOTOS (bucket permanente + URLs assinadas)
// ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
// BLOCO 1: IMPORTS
// ═══════════════════════════════════════════════════════════════
import { supabase } from './config-supabase.js';
import { auth } from './autenticacao.js';
import { getProfile, setProfile } from './banco-dados.js';

function _uid() { return auth.currentUser?.uid || null; }
function _num(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : null; }

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: FÓRMULAS PURAS
// ═══════════════════════════════════════════════════════════════
// % de gordura — método US Navy (fita métrica). Homem usa pescoço+cintura;
// mulher usa pescoço+cintura+quadril. Tudo em cm. Retorna null se faltar dado.
export function gorduraNavy({ sexo, alturaCm, pescoco, cintura, quadril }) {
  const h = _num(alturaCm), p = _num(pescoco), c = _num(cintura), q = _num(quadril);
  if (!h || !p || !c) return null;
  const log10 = Math.log10;
  let pct;
  if (sexo === 'F') {
    if (!q) return null;
    if (c + q - p <= 0) return null;
    pct = 495 / (1.29579 - 0.35004 * log10(c + q - p) + 0.22100 * log10(h)) - 450;
  } else {
    if (c - p <= 0) return null;
    pct = 495 / (1.0324 - 0.19077 * log10(c - p) + 0.15456 * log10(h)) - 450;
  }
  if (!Number.isFinite(pct)) return null;
  return Math.max(2, Math.min(60, Math.round(pct * 10) / 10));
}

// Meta de água = 35 ml/kg, mas com PESO AJUSTADO pelo IMC (obeso não bebe pelo
// peso cru). IMC ≤ 25 → peso real. IMC > 25 → base(IMC 25) + 40% do excesso.
export function metaAgua(pesoKg, alturaCm) {
  const kg = _num(pesoKg); if (!kg) return 0;
  const h = (_num(alturaCm) || 0) / 100;
  let base = kg;
  if (h > 0) {
    const imc = kg / (h * h);
    if (imc > 25) { const pesoMax = 25 * h * h; base = pesoMax + 0.4 * (kg - pesoMax); }
  }
  return Math.round(base * 35);
}

export function imc(pesoKg, alturaCm) {
  const kg = _num(pesoKg), h = (_num(alturaCm) || 0) / 100;
  if (!kg || !h) return null;
  return Math.round((kg / (h * h)) * 10) / 10;
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: PERFIL (sexo, altura, peso — vivem no profiles.extra)
// ═══════════════════════════════════════════════════════════════
export async function getDadosCorpo() {
  const p = await getProfile() || {};
  return { sexo: p.sexo || null, alturaCm: p.alturaCm || null, pesoKg: p.pesoKg || null };
}
export async function salvarDadosCorpo({ sexo, alturaCm, pesoKg }) {
  const patch = {};
  if (sexo !== undefined) patch.sexo = sexo || null;
  if (alturaCm !== undefined) patch.alturaCm = _num(alturaCm);
  if (pesoKg !== undefined) patch.pesoKg = _num(pesoKg);
  await setProfile(patch);
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: REGISTROS (medições datadas — histórico de evolução)
// ═══════════════════════════════════════════════════════════════
const CAMPOS = ['peso', 'pescoco', 'peitoral', 'cintura', 'quadril', 'braco', 'coxa', 'panturrilha'];

export async function carregarRegistros() {
  const { data, error } = await supabase
    .from('corpo_registros')
    .select('id, data, peso, pescoco, peitoral, cintura, quadril, braco, coxa, panturrilha, gordura_pct, foto_frente, foto_lado, foto_costas')
    .order('data', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

// Salva uma medição. `medidas` = { peso, pescoco, ... }, `fotos` = { frente, lado, costas }
// (paths já subidos). gorduraPct calculado no cliente.
export async function salvarRegistro({ medidas, gorduraPct, fotos, data }) {
  const linha = { user_id: _uid(), data: data || undefined, gordura_pct: gorduraPct ?? null,
    foto_frente: fotos?.frente || null, foto_lado: fotos?.lado || null, foto_costas: fotos?.costas || null };
  for (const c of CAMPOS) linha[c] = _num(medidas?.[c]);
  const { data: row, error } = await supabase
    .from('corpo_registros').insert(linha)
    .select('id, data, peso, pescoco, peitoral, cintura, quadril, braco, coxa, panturrilha, gordura_pct, foto_frente, foto_lado, foto_costas')
    .single();
  if (error) throw new Error(error.message);
  // peso mais recente vira o peso do perfil (pra meta de água acompanhar)
  if (_num(medidas?.peso)) { try { await setProfile({ pesoKg: _num(medidas.peso) }); } catch {} }
  return row;
}

export async function apagarRegistro(id) {
  const { error } = await supabase.from('corpo_registros').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 5: FOTOS (bucket privado permanente + URLs assinadas)
// ═══════════════════════════════════════════════════════════════
export async function subirFotoCorpo(blob, lado) {
  const id = _uid();
  if (!id) throw new Error('Sessão expirada');
  const caminho = `${id}/${Date.now()}-${lado}.jpg`;
  const { error } = await supabase.storage.from('corpo-fotos')
    .upload(caminho, blob, { contentType: blob.type || 'image/jpeg' });
  if (error) throw new Error(error.message || 'Não deu pra enviar a foto');
  return caminho;
}

// Assina em lote (URLs de bucket privado expiram; 1h e reassina ao abrir).
export async function assinarFotos(caminhos) {
  const limpos = [...new Set((caminhos || []).filter(Boolean))];
  const mapa = new Map();
  if (!limpos.length) return mapa;
  const { data, error } = await supabase.storage.from('corpo-fotos').createSignedUrls(limpos, 3600);
  if (error) return mapa;
  (data || []).forEach(d => { if (d.signedUrl && !d.error) mapa.set(d.path, d.signedUrl); });
  return mapa;
}
