// ─── ÍNDICE ──────────────────────────────────────────────────
// FALCON · Prova dos desafios: vídeo AO VIVO (câmera do app, sem galeria),
// print do Strava na corrida e o registro do check-in com a prova.
// Usado pela aba Desafios e pelo Pet (BLOCO 8.17) — o mesmo caminho nos dois.
// BLOCO 1 — GRAVADOR AO VIVO
// BLOCO 2 — PRINT DA CORRIDA
// BLOCO 3 — CORRIDA: STRAVA E PASSO A PASSO
// BLOCO 4 — REGISTRAR COM PROVA
// ─────────────────────────────────────────────────────────────
import { addCheckin, subirProva } from './desafios.js';
import { showToast } from './aviso-tela.js';
import { trapModalBack } from './modal-voltar.js';

const _esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const _hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: GRAVADOR AO VIVO
// ═══════════════════════════════════════════════════════════════
// Abre a câmera DENTRO do app e grava ali. Não existe botão de galeria: o
// único jeito de entregar a prova é gravando agora. Para sozinho no tempo
// máximo. Resolve com o Blob do vídeo, ou null se a pessoa desistiu.
const MAX_SEG = 30;

function _mimeVideo() {
  if (typeof MediaRecorder === 'undefined') return null;
  const op = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  return op.find(m => MediaRecorder.isTypeSupported?.(m)) || '';
}

export function gravarVideoAoVivo({ titulo = 'Prova do desafio', dica = '', maxSeg = MAX_SEG } = {}) {
  return new Promise((resolve) => {
    const mime = _mimeVideo();
    if (mime === null || !navigator.mediaDevices?.getUserMedia) {
      showToast('Esse aparelho não deixa gravar vídeo pelo app. Tenta pelo Chrome atualizado.', 'error');
      resolve(null);
      return;
    }
    const ov = document.createElement('div');
    ov.className = 'cam-guia-ov ds-rec-ov';
    ov.innerHTML = `
      <div class="cam-guia-msg"><b>${_esc(titulo)}</b>${dica ? `<br>${dica}` : ''}<br><small>🔴 Gravação ao vivo · até ${maxSeg} s</small></div>
      <video class="cam-guia-video ds-rec-video" autoplay playsinline muted></video>
      <div class="ds-rec-tempo" hidden>● <span>0</span>s</div>
      <div class="cam-guia-barra">
        <button type="button" class="cam-guia-btn" data-rec="cancel">Cancelar</button>
        <button type="button" class="cam-guia-shot ds-rec-shot" data-rec="go" aria-label="Gravar"></button>
        <button type="button" class="cam-guia-flip" data-rec="flip" aria-label="Virar câmera">🔄</button>
      </div>
      <div class="ds-rec-revisao" hidden>
        <video class="ds-rec-play" playsinline controls></video>
        <div class="ds-rec-acoes">
          <button type="button" class="cam-guia-btn" data-rec="again">↺ Gravar de novo</button>
          <button type="button" class="btn-primary" data-rec="send">Enviar prova</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const video = ov.querySelector('.ds-rec-video');
    const tempo = ov.querySelector('.ds-rec-tempo');
    const shot = ov.querySelector('[data-rec="go"]');
    const flip = ov.querySelector('[data-rec="flip"]');
    let lado = 'user', stream = null, mr = null, pedacos = [], timer = null, seg = 0, blob = null, fechado = false, entregue = null;

    const parar = () => { if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; };
    const fim = (v) => {
      if (fechado) return;
      fechado = true;
      clearInterval(timer);
      try { if (mr && mr.state !== 'inactive') mr.stop(); } catch { /* já parou */ }
      parar();
      ov.remove();
      resolve(v);
    };
    const fechar = trapModalBack(() => fim(entregue));

    async function abrir() {
      parar();
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: lado, width: { ideal: 720 }, height: { ideal: 1280 } },
          audio: true,
        });
        video.srcObject = stream;
        video.classList.toggle('espelho', lado === 'user');
      } catch {
        showToast('Não consegui abrir a câmera. Libera a câmera e o microfone pro Falcon.', 'error');
        fechar();
      }
    }

    function gravar() {
      if (!stream) return;
      pedacos = []; seg = 0;
      mr = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 900000 });
      mr.ondataavailable = (e) => { if (e.data?.size) pedacos.push(e.data); };
      mr.onstop = () => {
        if (fechado) return;
        blob = new Blob(pedacos, { type: (mr.mimeType || mime || 'video/webm').split(';')[0] });
        parar();
        const rev = ov.querySelector('.ds-rec-revisao');
        const play = rev.querySelector('video');
        play.src = URL.createObjectURL(blob);
        rev.hidden = false;
      };
      mr.start(500);
      shot.classList.add('gravando');
      flip.disabled = true;
      tempo.hidden = false;
      tempo.querySelector('span').textContent = '0';
      timer = setInterval(() => {
        seg++;
        tempo.querySelector('span').textContent = String(seg);
        if (seg >= maxSeg) pararGravacao();
      }, 1000);
    }
    function pararGravacao() {
      clearInterval(timer);
      shot.classList.remove('gravando');
      tempo.hidden = true;
      if (mr && mr.state !== 'inactive') mr.stop();
    }

    ov.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-rec]');
      if (!b) return;
      const act = b.dataset.rec;
      if (act === 'cancel') return fechar();
      if (act === 'flip') { lado = lado === 'user' ? 'environment' : 'user'; return abrir(); }
      if (act === 'go') {
        if (mr && mr.state === 'recording') { if (seg >= 2) pararGravacao(); return; }
        return gravar();
      }
      if (act === 'again') {
        ov.querySelector('.ds-rec-revisao').hidden = true;
        blob = null; flip.disabled = false;
        return abrir();
      }
      if (act === 'send' && blob) { entregue = blob; fechar(); }
    });
    abrir();
  });
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: PRINT DA CORRIDA
// ═══════════════════════════════════════════════════════════════
// Único caso em que vale a galeria: o print do Strava.
export function escolherPrint() {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.style.display = 'none';
    let ok = false;
    inp.onchange = () => { ok = true; const f = inp.files?.[0] || null; inp.remove(); resolve(f); };
    // sem 'cancel' em todo navegador: se a pessoa voltar sem escolher, fecha ao recuperar o foco
    window.addEventListener('focus', () => setTimeout(() => { if (!ok) { inp.remove(); resolve(null); } }, 800), { once: true });
    document.body.appendChild(inp);
    inp.click();
  });
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: CORRIDA — STRAVA E PASSO A PASSO
// ═══════════════════════════════════════════════════════════════
// "Correr com o Falcon": por enquanto abre o Strava (ou a loja pra baixar).
// Quando o Falcon virar app de loja, troca aqui pelo corredor próprio.
const STRAVA_PLAY = 'https://play.google.com/store/apps/details?id=com.strava';
const STRAVA_IOS = 'https://apps.apple.com/app/strava/id426826309';

export function abrirStrava() {
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) {
    // Abre o app se estiver instalado; senão cai na Play Store
    location.href = `intent://www.strava.com/#Intent;scheme=https;package=com.strava;S.browser_fallback_url=${encodeURIComponent(STRAVA_PLAY)};end`;
  } else if (/iphone|ipad|ipod/i.test(ua)) {
    window.open(STRAVA_IOS, '_blank');   // a loja mostra "Abrir" se já tiver
  } else {
    window.open('https://www.strava.com/', '_blank');
  }
}

export const PASSOS_CORRIDA = [
  'Toque em <b>🏃 Correr com o Falcon</b>. Abre o Strava (na primeira vez, baixa grátis e cria a conta).',
  'No Strava, toque em <b>Gravar</b> e depois em <b>Iniciar</b>. Corra a distância do desafio.',
  'Nos <b>últimos minutos</b>, abra o Falcon e toque em <b>🎥 Gravar o final da corrida</b>. Grave de 10 a 30 segundos correndo, com o rosto aparecendo: o fôlego e o suor contam.',
  'Termine no Strava: <b>Parar</b> e depois <b>Concluir</b>. Tire um <b>print</b> da tela com a distância, o tempo e a data.',
  'Volte aqui e toque em <b>📷 Enviar o print</b>. Pronto, a corrida entra no desafio.',
];

export function passoAPassoCorrida() {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `
    <div class="modal" style="max-width:420px">
      <div class="modal-title">🏃 Como registrar a corrida</div>
      <ol class="ds-passos">${PASSOS_CORRIDA.map(p => `<li>${p}</li>`).join('')}</ol>
      <div class="modal-hint">O corredor do próprio Falcon está chegando. Até lá, a distância é medida pelo Strava.</div>
      <div class="modal-actions" style="flex-direction:column;gap:8px">
        <button class="btn-primary" data-pp="strava" style="width:100%">🏃 Correr com o Falcon</button>
        <button class="btn-secondary" data-pp="ok" style="width:100%">Entendi</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const close = trapModalBack(() => ov.remove());
  ov.querySelector('[data-pp="ok"]').onclick = close;
  ov.querySelector('[data-pp="strava"]').onclick = () => { close(); abrirStrava(); };
}

// Vídeo da corrida já enviado, esperando o print (a pessoa sai pro Strava no meio)
const PEND_KEY = 'falcon_corrida_pendente';
export function corridaPendente(desafioId) {
  try {
    const p = JSON.parse(localStorage.getItem(PEND_KEY) || 'null');
    return p && p.desafioId === desafioId && p.dia === _hoje() ? p : null;
  } catch { return null; }
}
function _guardarPendente(p) { try { localStorage.setItem(PEND_KEY, JSON.stringify(p)); } catch { /* sem storage */ } }
function _limparPendente() { try { localStorage.removeItem(PEND_KEY); } catch { /* sem storage */ } }

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: REGISTRAR COM PROVA
// ═══════════════════════════════════════════════════════════════
// Registra o check-in pedindo a prova que o desafio exige. true = registrou.
// O banco confere as regras de novo (gatilho) e devolve o erro em português.
export async function registrarComProva(d, { quantidade = 1, exercicio = null } = {}) {
  const corrida = d.prova === 'strava' || exercicio === 'Corrida';
  try {
    if (corrida) return await _registrarCorrida(d, { quantidade, exercicio });
    if (d.prova === 'video') {
      const nome = exercicio || d.titulo;
      const blob = await gravarVideoAoVivo({
        titulo: `🎥 ${nome}`,
        dica: exercicio ? 'Grave você fazendo o exercício, do começo ao fim.' : 'Grave você cumprindo o desafio.',
      });
      if (!blob) return false;
      showToast('Enviando a prova…', 'info');
      const videoPath = await subirProva(blob, 'video');
      await addCheckin(d.id, quantidade, { exercicio, videoPath });
      showToast('🎥 Prova enviada! 🦅', 'success');
      return true;
    }
    await addCheckin(d.id, quantidade, { exercicio });
    return true;
  } catch (e) {
    showToast(e.message || 'Não deu pra registrar', 'error');
    return false;
  }
}

// Corrida em duas partes: vídeo ao vivo no fim da corrida, depois o print.
// Se a pessoa sair pro Strava entre as duas, o vídeo fica guardado e o card
// mostra "Enviar o print".
async function _registrarCorrida(d, { quantidade, exercicio }) {
  let pend = corridaPendente(d.id);
  if (!pend) {
    const blob = await gravarVideoAoVivo({
      titulo: '🏃 Final da corrida',
      dica: 'Grave você correndo, com o rosto aparecendo. Depois termine no Strava e tire o print.',
    });
    if (!blob) return false;
    showToast('Enviando o vídeo…', 'info');
    const videoPath = await subirProva(blob, 'video');
    pend = { desafioId: d.id, dia: _hoje(), videoPath, quantidade, exercicio };
    _guardarPendente(pend);
    showToast('🎥 Vídeo guardado! Agora termine no Strava e mande o print.', 'success');
    return false;   // falta o print: ainda não registrou
  }
  const foto = await escolherPrint();
  if (!foto) return false;
  showToast('Enviando o print…', 'info');
  const printPath = await subirProva(foto, 'print');
  await addCheckin(d.id, pend.quantidade || quantidade, { exercicio: pend.exercicio || exercicio, videoPath: pend.videoPath, printPath });
  _limparPendente();
  showToast('🏃 Corrida registrada! 🦅', 'success');
  return true;
}
