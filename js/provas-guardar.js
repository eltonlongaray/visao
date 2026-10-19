// ─── ÍNDICE ──────────────────────────────────────────────────
// FALCON · Guardar os vídeos das provas antes de sumirem
// O vídeo da prova fica 7 dias. A partir do 4º dia (faltando 3 ou menos), ao
// abrir o grupo, o app pergunta se a pessoa quer guardar os vídeos dela no
// Drive (Élton, 16/10), junto com os mais novos. "Guardar" abre o Compartilhar do
// celular, onde dá pra escolher o Google Drive. O aviso volta 1 vez por dia, até 3 dias; sem resposta, os vídeos somem no prazo.
// BLOCO 1 — QUAIS VÍDEOS
// BLOCO 2 — AVISO E GUARDAR
// ─────────────────────────────────────────────────────────────
import { urlDaProva } from './desafios.js';
import { trapModalBack } from './modal-voltar.js';
import { showToast } from './aviso-tela.js';
import { driveLembradoConectado, driveConectado, conectarDrive, sincronizarDrive } from './drive-provas.js';

const DIA = 864e5;
const CHAVE = 'falcon_provas_aviso';   // { caminho: { n: vezes, d: 'AAAA-MM-DD', ok: guardou } }
const MAX_VEZES = 3;                   // um aviso por dia, até 3 dias (Élton, 16/10)

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: QUAIS VÍDEOS
// ═══════════════════════════════════════════════════════════════
// Meus vídeos que somem em até 3 dias (e ainda não sumiram)
export function videosParaGuardar(checks, uid, agora = Date.now()) {
  return (checks || []).filter(c => c.user_id === uid && c.video_path && c.video_expira_em)
    .filter(c => { const f = new Date(c.video_expira_em).getTime(); return f > agora && f - agora <= 3 * DIA; })
    .sort((a, b) => String(a.dia).localeCompare(String(b.dia)));
}
const _hoje = () => new Date().toLocaleDateString('sv-SE');
function _estado() { try { return JSON.parse(localStorage.getItem(CHAVE) || '{}') || {}; } catch { return {}; } }
function _gravar(est) {
  const chaves = Object.keys(est);
  if (chaves.length > 200) chaves.slice(0, chaves.length - 200).forEach(k => delete est[k]);
  try { localStorage.setItem(CHAVE, JSON.stringify(est)); } catch { /* sem storage */ }
}
// Ainda pode avisar hoje: não guardou, não passou de 3 vezes e não avisou hoje
function _podeAvisar(est, caminho) {
  const e = est[caminho];
  return !e || (!e.ok && (e.n || 0) < MAX_VEZES && e.d !== _hoje());
}
function _contarAviso(caminhos) {
  const est = _estado();
  for (const k of caminhos) est[k] = { n: (est[k]?.n || 0) + 1, d: _hoje(), ok: false };
  _gravar(est);
}
function _guardou(caminhos) {
  const est = _estado();
  for (const k of caminhos) est[k] = { ...(est[k] || {}), ok: true };
  _gravar(est);
}
const _diasAte = (iso) => Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / DIA));
const _dataCurta = (dia) => String(dia || '').split('-').reverse().slice(0, 2).join('/');

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: AVISO E GUARDAR
// ═══════════════════════════════════════════════════════════════
// Ao entrar no grupo: primeira coisa, explica que o vídeo some em 7 dias e
// oferece guardar sozinho no Drive (Élton, 17/10). 1 vez por dia, até 3 dias;
// conectou = nunca mais. Vale pra todos os desafios (o Drive é um só).
const CHAVE_ENTRADA = 'falcon_drive_convite';   // { n: vezes, d: 'AAAA-MM-DD' }
export async function avisoEntradaDrive() {
  if (driveLembradoConectado()) return false;
  let e = {};
  try { e = JSON.parse(localStorage.getItem(CHAVE_ENTRADA) || '{}') || {}; } catch { /* sem storage */ }
  if ((e.n || 0) >= MAX_VEZES || e.d === _hoje()) return false;
  if (await driveConectado()) return false;   // conectou em outro aparelho
  if (document.querySelector('.modal-overlay')) return false;
  try { localStorage.setItem(CHAVE_ENTRADA, JSON.stringify({ n: (e.n || 0) + 1, d: _hoje() })); } catch { /* sem storage */ }
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `
    <div class="modal" style="max-width:380px">
      <div class="modal-title">☁️ Guarde os vídeos das tuas provas</div>
      <div class="modal-hint">Aqui no grupo, cada vídeo de prova fica <b>7 dias</b>. Depois disso ele é apagado e fica só o 📄 Conteúdo com o que foi dito.
        <br><br>Pra não perder nenhum, conecta teu Google Drive: cada vídeo teu vai <b>sozinho</b> pra pasta "Falcon · Provas dos desafios", logo depois de enviar.
        <br><br><small>O Falcon só mexe nessa pasta. Dá pra desligar quando quiser pedindo pro Pet.</small></div>
      <div class="modal-actions" style="flex-direction:column;gap:8px">
        <button class="btn-primary" data-ge-sim style="width:100%">☁️ Guardar automaticamente no meu Drive</button>
        <button class="btn-secondary" data-ge-nao style="width:100%">Agora não</button>
        <small style="opacity:.75;text-align:center">Também dá pra ligar depois no botão ☁️ Drive aqui em cima.</small>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const fechar = trapModalBack(() => ov.remove());
  ov.querySelector('[data-ge-nao]').onclick = () => fechar();
  ov.querySelector('[data-ge-sim]').onclick = () => { fechar(); conectarDrive(); };
  return true;
}

// Abre o aviso se tiver vídeo novo pra oferecer. forcar = o Pet pediu (mostra mesmo já oferecido).
// Cada vídeo tem os seus 7 dias (some um por um). Quando o mais antigo ainda não
// oferecido chega no 4º dia, o aviso oferece ele JUNTO com os mais novos ainda não
// oferecidos: assim tudo vai pro Drive de uma vez (Élton, 16/10).
export async function avisoGuardarVideos(d, checks, uid, { forcar = false } = {}) {
  // Drive conectado: os vídeos já vão sozinhos, sem aviso nenhum
  if (driveLembradoConectado()) { sincronizarDrive(); return false; }
  const est = _estado();
  const vencendo = videosParaGuardar(checks, uid).filter(c => forcar || _podeAvisar(est, c.video_path));
  if (!vencendo.length) return false;
  const agora = Date.now();
  const lista = (checks || []).filter(c => c.user_id === uid && c.video_path && c.video_expira_em
      && new Date(c.video_expira_em).getTime() > agora && (forcar || _podeAvisar(est, c.video_path)))
    .sort((a, b) => String(a.dia).localeCompare(String(b.dia)));
  const caminhos = lista.map(c => c.video_path);
  if (!forcar) _contarAviso(caminhos);

  const n = lista.length;
  const falta = _diasAte(vencendo[0].video_expira_em);
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `
    <div class="modal" style="max-width:380px">
      <div class="modal-title">📦 Guardar ${n > 1 ? `teus ${n} vídeos` : 'teu vídeo'}?</div>
      <div class="modal-hint">${d?.titulo ? `${d.titulo}: ` : ''}${n > 1 ? `cada vídeo some 7 dias depois de enviado, e o primeiro some em ${falta} dia${falta > 1 ? 's' : ''}. Quer guardar todos no teu Drive?` : `o vídeo da tua prova some em ${falta} dia${falta > 1 ? 's' : ''}. Quer guardar no teu Drive?`}
        <br><small>${lista.map(c => `Prova de ${_dataCurta(c.dia)}`).join(' · ')}</small>
        <br><small>Depois que sumir, no grupo fica o 📄 Conteúdo com o que foi dito.</small></div>
      <div class="modal-actions" style="flex-direction:column;gap:8px">
        <button class="btn-primary" data-gv-auto style="width:100%">☁️ Guardar automaticamente no meu Drive</button>
        <button class="btn-secondary" data-gv-ok style="width:100%" disabled>⏳ Preparando os vídeos…</button>
        <button class="btn-secondary" data-gv-nao style="width:100%">Agora não</button>
        <small style="opacity:.75;text-align:center">Automático: o Falcon cria a pasta "Falcon · Provas dos desafios" no teu Drive e só mexe nela.</small>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const fechar = trapModalBack(() => ov.remove());
  const ok = ov.querySelector('[data-gv-ok]');
  ov.querySelector('[data-gv-nao]').onclick = () => fechar();
  ov.querySelector('[data-gv-auto]').onclick = () => { fechar(); conectarDrive(); };

  // Baixa antes: o Compartilhar do celular só abre logo depois do toque
  let arquivos = [];
  try {
    // Do celular se já viu; senão baixa uma vez e fica guardado
    arquivos = (await Promise.all(lista.map(async (c) => {
      const u = await urlDaProva(c.video_path);
      if (!u) return null;
      const blob = await (await fetch(u)).blob();
      const ext = (c.video_path.match(/\.[a-z0-9]+$/i) || ['.mp4'])[0];
      return new File([blob], `prova-falcon-${c.dia || 'video'}${ext}`, { type: blob.type || (ext === '.webm' ? 'video/webm' : 'video/mp4') });
    }))).filter(Boolean);
  } catch { arquivos = []; }
  if (!document.body.contains(ov)) return true;
  if (!arquivos.length) { ok.textContent = 'Não deu pra baixar agora'; return true; }
  ok.disabled = false;
  ok.textContent = '📁 Guardar só estes agora';
  ok.onclick = async () => {
    try {
      if (navigator.canShare?.({ files: arquivos })) {
        await navigator.share({ files: arquivos, title: 'Provas do desafio' });
        _guardou(caminhos);
      } else {
        // Sem Compartilhar (computador): baixa cada um
        for (const f of arquivos) {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(f); a.download = f.name;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 60e3);
        }
        _guardou(caminhos);
      }
      fechar();
    } catch (e) {
      if (e?.name !== 'AbortError') showToast('Não deu pra guardar agora. Tenta pelo ⬇️ Salvar vídeo na conversa.', 'error');
    }
  };
  return true;
}
