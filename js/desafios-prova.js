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
import { salvarRascunho } from './desafios-rascunho.js';
import './vendor/fix-webm-duration.js';   // window.ysFixWebmDuration
import { roteiroDepoimento, passouDoLimite, horaLimite, aindaNaoComecou, textoComeca, depoimentoConta, ehAgua } from './desafios-moldes.js';

const _esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const _hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: GRAVADOR AO VIVO
// ═══════════════════════════════════════════════════════════════
// Abre a câmera DENTRO do app e grava ali. Não existe botão de galeria: o
// único jeito de entregar a prova é gravando agora. Para sozinho no tempo
// máximo. Resolve com o Blob do vídeo, ou null se a pessoa desistiu.
const MAX_SEG = 30;
const MAX_SEG_DEPOIMENTO = 300;   // 5 min (pedido do Élton)
// Sempre em pé (9:16): a câmera passa por um canvas em pé e é ele que grava.
// O que aparece na tela é exatamente o que vai no vídeo.
const REC_W = 540, REC_H = 960;

function _mimeVideo() {
  if (typeof MediaRecorder === 'undefined') return null;
  const op = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  return op.find(m => MediaRecorder.isTypeSupported?.(m)) || '';
}

// rascunho = mostra "Salvar rascunho" na revisão: o Blob volta marcado com
// __rascunho e quem chamou guarda no aparelho em vez de mandar.
// Texto pra ler enquanto grava (teleprompter): fica guardado no aparelho
const TP_TEXTO = 'visao_teleprompter';
const TP_VEL = 'visao_teleprompter_vel';
const _lerLS = (k, padrao) => { try { return localStorage.getItem(k) ?? padrao; } catch { return padrao; } };
const _gravarLS = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };

// 187 → "3:07": em segundos ninguém sabia quantos minutos já tinham passado
const _mmss = (seg) => `${Math.floor(seg / 60)}:${String(Math.floor(seg % 60)).padStart(2, '0')}`;

export function gravarVideoAoVivo({ titulo = 'Prova do desafio', dica = '', maxSeg = MAX_SEG, rascunho = false, enviarTxt = 'Enviar prova' } = {}) {
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
      <div class="cam-guia-msg"><b>${_esc(titulo)}</b>${dica ? `<br>${dica}` : ''}<br><small>🔴 Gravação ao vivo · até ${maxSeg >= 60 ? `${Math.round(maxSeg / 60)} min` : `${maxSeg} s`}</small></div>
      <video class="cam-guia-video ds-rec-fonte" autoplay playsinline muted></video>
      <canvas class="cam-guia-video ds-rec-video" width="${REC_W}" height="${REC_H}"></canvas>
      <div class="ds-rec-tempo" hidden>● <span>0:00</span> / ${_mmss(maxSeg)}</div>
      <div class="ds-tp" hidden>
        <div class="ds-tp-texto"></div>
        <div class="ds-tp-ctrl">
          <button type="button" data-rec="tp-menos" aria-label="Mais devagar">🐢</button>
          <span class="ds-tp-vel"></span>
          <button type="button" data-rec="tp-mais" aria-label="Mais rápido">🐇</button>
          <button type="button" data-rec="texto" aria-label="Editar roteiro">✏️</button>
          <button type="button" data-rec="tp-fechar" aria-label="Tirar roteiro">✕</button>
        </div>
      </div>
      <button type="button" class="ds-tp-abrir" data-rec="texto">📝 Roteiro</button>
      <div class="ds-tp-editor" hidden>
        <div class="ds-tp-ed-tit">📝 Roteiro pra ler enquanto grava</div>
        <small>Cola ou escreve aqui. O roteiro aparece no alto da tela e vai subindo sozinho enquanto tu grava. Ele não entra no vídeo.</small>
        <textarea maxlength="5000" rows="8" placeholder="Ex: Hoje é o dia 5 do desafio. O que eu aprendi foi…"></textarea>
        <div class="ds-tp-ed-acoes">
          <button type="button" class="cam-guia-btn" data-rec="tp-cancelar">Cancelar</button>
          <button type="button" class="btn-primary" data-rec="tp-usar">Usar roteiro</button>
        </div>
      </div>
      <div class="cam-guia-barra">
        <button type="button" class="cam-guia-btn" data-rec="cancel">Cancelar</button>
        <button type="button" class="cam-guia-shot ds-rec-shot" data-rec="go" aria-label="Gravar"></button>
        <button type="button" class="cam-guia-flip" data-rec="flip" aria-label="Virar câmera">🔄</button>
        <button type="button" class="cam-guia-flip ds-rec-pausa" data-rec="pause" aria-label="Pausar" hidden>⏸</button>
      </div>
      <div class="ds-rec-revisao" hidden>
        <video class="ds-rec-play" playsinline controls></video>
        <div class="ds-rec-acoes">
          <button type="button" class="cam-guia-btn" data-rec="again">↺ Gravar de novo</button>
          ${rascunho ? '<button type="button" class="cam-guia-btn" data-rec="draft">💾 Salvar rascunho</button>' : ''}
          <button type="button" class="btn-primary" data-rec="send">${_esc(enviarTxt)}</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const video = ov.querySelector('.ds-rec-fonte');
    const tela = ov.querySelector('.ds-rec-video');
    const ctx = tela.getContext('2d');
    const podeCanvas = typeof tela.captureStream === 'function';
    let raf = 0;
    // Câmera em pé: preenche (corta só um pouco). Câmera deitada: mostra
    // inteira no meio, com a própria imagem escurecida atrás (sem zoom).
    function desenhar() {
      raf = requestAnimationFrame(desenhar);
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) return;
      const cobre = Math.max(REC_W / vw, REC_H / vh);
      const cabe = Math.min(REC_W / vw, REC_H / vh);
      const emPe = vh >= vw;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, REC_W, REC_H);
      if (emPe) {
        ctx.drawImage(video, (REC_W - vw * cobre) / 2, (REC_H - vh * cobre) / 2, vw * cobre, vh * cobre);
        return;
      }
      ctx.globalAlpha = 0.35;
      ctx.drawImage(video, (REC_W - vw * cobre) / 2, (REC_H - vh * cobre) / 2, vw * cobre, vh * cobre);
      ctx.globalAlpha = 1;
      ctx.drawImage(video, (REC_W - vw * cabe) / 2, (REC_H - vh * cabe) / 2, vw * cabe, vh * cabe);
    }
    const tempo = ov.querySelector('.ds-rec-tempo');
    const shot = ov.querySelector('[data-rec="go"]');
    const flip = ov.querySelector('[data-rec="flip"]');
    const pausa = ov.querySelector('[data-rec="pause"]');
    // ── Texto pra ler: fica por cima da imagem (fora do canvas, então não é gravado)
    const tp = ov.querySelector('.ds-tp');
    const tpTexto = ov.querySelector('.ds-tp-texto');
    const tpAbrir = ov.querySelector('.ds-tp-abrir');
    const tpEditor = ov.querySelector('.ds-tp-editor');
    // Velocidades em px por segundo (as duas primeiras são bem devagar, pra quem lê com calma)
    const TP_VELS = [4, 7, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];
    const tpPerto = (v) => TP_VELS.reduce((m, x, i) => Math.abs(x - v) < Math.abs(TP_VELS[m] - v) ? i : m, 0);
    let tpVel = TP_VELS[tpPerto(Number(_lerLS(TP_VEL, 30)) || 30)];
    let tpRaf = 0, tpUlt = 0, tpPos = 0;
    const tpTem = () => !!String(_lerLS(TP_TEXTO, '')).trim();
    function tpMostrar() {
      const txt = String(_lerLS(TP_TEXTO, '')).trim();
      tpTexto.textContent = txt;
      tp.hidden = !txt;
      tpAbrir.hidden = !!txt;
      ov.classList.toggle('com-texto', !!txt);
      ov.querySelector('.ds-tp-vel').textContent = `${tpPerto(tpVel) + 1}`;
    }
    // Sobe sozinho só enquanto grava (pausou, para junto). Dá pra arrastar com o dedo.
    function tpRolar(agora) {
      tpRaf = requestAnimationFrame(tpRolar);
      const dt = tpUlt ? (agora - tpUlt) / 1000 : 0;
      tpUlt = agora;
      if (!mr || mr.state !== 'recording' || tp.hidden) return;
      if (Math.abs(tpTexto.scrollTop - Math.round(tpPos)) > 2) tpPos = tpTexto.scrollTop;   // a pessoa arrastou
      tpPos += tpVel * dt;
      tpTexto.scrollTop = tpPos;
    }
    tpMostrar();

    let lado = 'user', stream = null, mr = null, pedacos = [], timer = null, seg = 0, blob = null, fechado = false, entregue = null, t0 = 0, durMs = 0, acum = 0, pausado = false;

    const parar = () => { cancelAnimationFrame(raf); raf = 0; if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; };
    const fim = (v) => {
      if (fechado) return;
      fechado = true;
      cancelAnimationFrame(tpRaf);
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
        // Sem pedir tamanho: cada aparelho entrega o formato natural dele (pedir
        // 720x1280 fazia alguns Android abrirem a câmera deitada e com zoom)
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: lado }, audio: true });
        video.srcObject = stream;
        await video.play().catch(() => {});
        tela.classList.toggle('espelho', lado === 'user');
        if (!raf) desenhar();
      } catch {
        showToast('Não consegui abrir a câmera. Libera a câmera e o microfone pro Falcon.', 'error');
        fechar();
      }
    }

    function gravar() {
      if (!stream) return;
      pedacos = []; seg = 0;
      // Grava o canvas em pé + o som do microfone (sem canvas: a câmera direto)
      const fonte = podeCanvas
        ? new MediaStream([...tela.captureStream(30).getVideoTracks(), ...stream.getAudioTracks()])
        : stream;
      // Vídeo longo (depoimento de até 5 min) grava mais leve pra caber nos
      // 25 MB do bucket: 5 min × (500k + 64k) ≈ 21 MB. Rosto falando fica bom assim.
      const vbps = maxSeg > 60 ? 500000 : 900000;
      mr = new MediaRecorder(fonte, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: vbps, audioBitsPerSecond: 64000 });
      mr.ondataavailable = (e) => { if (e.data?.size) pedacos.push(e.data); };
      mr.onstop = async () => {
        if (fechado) return;
        blob = new Blob(pedacos, { type: (mr.mimeType || mime || 'video/webm').split(';')[0] });
        parar();
        // O Chrome grava o WebM sem a duração: o player chutava o tempo e a barra
        // andava fora do compasso. Escreve a duração real medida no relógio.
        if (/webm/.test(blob.type) && window.ysFixWebmDuration) {
          try { blob = await window.ysFixWebmDuration(blob, durMs, { logger: false }); } catch { /* fica como está */ }
        }
        if (fechado) return;
        const rev = ov.querySelector('.ds-rec-revisao');
        tp.hidden = true; tpAbrir.hidden = true;
        const play = rev.querySelector('video');
        play.src = URL.createObjectURL(blob);
        rev.hidden = false;
      };
      mr.start(500);
      tpTexto.scrollTop = 0; tpPos = 0; tpUlt = 0;
      tpAbrir.hidden = true;
      if (!tpRaf) tpRaf = requestAnimationFrame(tpRolar);
      t0 = performance.now(); durMs = 0; acum = 0; pausado = false;
      shot.classList.add('gravando');
      flip.disabled = true;
      flip.hidden = true;
      pausa.hidden = false;
      pausa.textContent = '⏸';
      tempo.hidden = false;
      tempo.querySelector('span').textContent = '0:00';
      // Conta pelo relógio, não por "tique": com o celular ocupado os tiques
      // atrasam e a gravação passava do limite sem o contador ver
      timer = setInterval(() => {
        seg = Math.floor(_gravado() / 1000);
        tempo.querySelector('span').textContent = _mmss(seg);
        if (seg >= maxSeg) pararGravacao();
      }, 250);
    }
    // Tempo gravado de verdade: o que ficou em pausa não conta
    const _gravado = () => acum + (pausado || !t0 ? 0 : performance.now() - t0);
    function pausarOuContinuar() {
      if (!mr || mr.state === 'inactive') return;
      if (!pausado) {
        acum += performance.now() - t0;
        pausado = true;
        try { mr.pause(); } catch { /* sem pausa nesse aparelho */ }
        pausa.textContent = '▶';
        pausa.setAttribute('aria-label', 'Continuar');
        tempo.classList.add('pausado');
      } else {
        t0 = performance.now();
        pausado = false;
        try { mr.resume(); } catch { /* idem */ }
        pausa.textContent = '⏸';
        pausa.setAttribute('aria-label', 'Pausar');
        tempo.classList.remove('pausado');
      }
    }
    function pararGravacao() {
      clearInterval(timer);
      if (t0 && !durMs) durMs = _gravado();
      pausa.hidden = true;
      flip.hidden = false;
      tempo.classList.remove('pausado');
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
      if (act === 'pause') return pausarOuContinuar();
      if (act === 'texto') {
        tpEditor.querySelector('textarea').value = _lerLS(TP_TEXTO, '');
        tpEditor.hidden = false;
        return tpEditor.querySelector('textarea').focus();
      }
      if (act === 'tp-cancelar') { tpEditor.hidden = true; return; }
      if (act === 'tp-usar') {
        _gravarLS(TP_TEXTO, tpEditor.querySelector('textarea').value.trim());
        tpEditor.hidden = true;
        tpTexto.scrollTop = 0; tpPos = 0;
        tpMostrar();
        if (mr && mr.state !== 'inactive') tpAbrir.hidden = true;
        return;
      }
      if (act === 'tp-fechar') { _gravarLS(TP_TEXTO, ''); tpMostrar(); if (mr && mr.state !== 'inactive') tpAbrir.hidden = true; return; }
      if (act === 'tp-mais' || act === 'tp-menos') {
        tpVel = TP_VELS[Math.min(TP_VELS.length - 1, Math.max(0, tpPerto(tpVel) + (act === 'tp-mais' ? 1 : -1)))];
        _gravarLS(TP_VEL, String(tpVel));
        return tpMostrar();
      }
      if (act === 'go') {
        if (mr && (mr.state === 'recording' || mr.state === 'paused')) { if (seg >= 2) pararGravacao(); return; }
        return gravar();
      }
      if (act === 'again') {
        ov.querySelector('.ds-rec-revisao').hidden = true;
        blob = null; flip.disabled = false;
        tpTexto.scrollTop = 0; tpPos = 0;
        tpMostrar();
        return abrir();
      }
      if (act === 'send' && blob) { entregue = blob; fechar(); }
      if (act === 'draft' && blob) { blob.__rascunho = true; entregue = blob; fechar(); }
    });
    abrir();
  });
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: PRINT DA CORRIDA E FOTO AO VIVO (ESTEIRA)
// ═══════════════════════════════════════════════════════════════
// Foto tirada AGORA pela câmera do app (sem galeria): o painel da esteira.
// Resolve com um Blob JPEG, ou null se a pessoa desistiu.
export function tirarFotoAoVivo({ titulo = 'Foto', dica = '' } = {}) {
  return new Promise((resolve) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      showToast('Esse aparelho não deixa abrir a câmera pelo app. Tenta pelo Chrome atualizado.', 'error');
      resolve(null);
      return;
    }
    const ov = document.createElement('div');
    ov.className = 'cam-guia-ov ds-rec-ov';
    ov.innerHTML = `
      <div class="cam-guia-msg"><b>${_esc(titulo)}</b>${dica ? `<br>${dica}` : ''}<br><small>📸 Foto ao vivo, pela câmera do Falcon</small></div>
      <video class="cam-guia-video" autoplay playsinline muted></video>
      <div class="cam-guia-barra">
        <button type="button" class="cam-guia-btn" data-ft="cancel">Cancelar</button>
        <button type="button" class="cam-guia-shot" data-ft="shot" aria-label="Tirar foto"></button>
        <button type="button" class="cam-guia-flip" data-ft="flip" aria-label="Virar câmera">🔄</button>
      </div>`;
    document.body.appendChild(ov);
    const video = ov.querySelector('video');
    let lado = 'environment', stream = null, fechado = false, entregue = null;
    const parar = () => { if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; };
    const fechar = trapModalBack(() => {
      if (fechado) return;
      fechado = true;
      parar();
      ov.remove();
      resolve(entregue);
    });
    async function abrir() {
      parar();
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: lado }, audio: false });
        video.srcObject = stream;
        await video.play().catch(() => {});
      } catch {
        showToast('Não consegui abrir a câmera. Libera a câmera pro Falcon.', 'error');
        fechar();
      }
    }
    ov.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ft]');
      if (!b) return;
      if (b.dataset.ft === 'cancel') return fechar();
      if (b.dataset.ft === 'flip') { lado = lado === 'user' ? 'environment' : 'user'; return abrir(); }
      if (b.dataset.ft === 'shot' && video.videoWidth) {
        const c = document.createElement('canvas');
        const k = Math.min(1, 1080 / Math.max(video.videoWidth, video.videoHeight));
        c.width = Math.round(video.videoWidth * k);
        c.height = Math.round(video.videoHeight * k);
        c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
        c.toBlob((bl) => { entregue = bl; fechar(); }, 'image/jpeg', 0.85);
      }
    });
    abrir();
  });
}

// Foto do painel "antes" fica no aparelho até o fim da corrida (pequena)
function _blobParaDataURL(blob, larg = 540) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, larg / img.width);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = () => resolve(null);
    img.src = URL.createObjectURL(blob);
  });
}
function _carregar(src) {
  return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}
// Antes | Depois lado a lado numa imagem só (é ela que vai como "print")
async function _juntarAntesDepois(antesURL, depoisBlob) {
  const urlD = URL.createObjectURL(depoisBlob);
  const [a, b] = await Promise.all([_carregar(antesURL), _carregar(urlD)]);
  URL.revokeObjectURL(urlD);
  if (!b) return depoisBlob;
  const H = 900, faixa = 70;
  const wa = a ? Math.round(a.width * H / a.height) : 0;
  const wb = Math.round(b.width * H / b.height);
  const c = document.createElement('canvas');
  c.width = wa + wb + (a ? 12 : 0); c.height = H + faixa;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0b0b10'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.font = 'bold 40px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fbbf24';
  if (a) { ctx.drawImage(a, 0, faixa, wa, H); ctx.fillText('ANTES', wa / 2, 50); }
  const x = a ? wa + 12 : 0;
  ctx.drawImage(b, x, faixa, wb, H);
  ctx.fillText('DEPOIS', x + wb / 2, 50);
  return await new Promise(r => c.toBlob(bl => r(bl || depoisBlob), 'image/jpeg', 0.85));
}

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

export const PASSOS_ESTEIRA = [
  'Antes de começar, toque em <b>🏃 Corrida</b> no desafio e escolha <b>🏋️ Na esteira</b>. Tire a foto do <b>painel zerado</b> pelo Falcon.',
  'Corra a distância do desafio.',
  'Nos <b>últimos minutos</b>, toque em <b>🎥 Gravar o final da corrida</b> e grave você correndo, igual na rua (10 a 30 segundos, com o rosto).',
  'Assim que parar, toque em <b>📸 Foto do painel no fim</b> com a distância e o tempo. Pronto, a corrida entra no desafio.',
];

export function passoAPassoCorrida() {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `
    <div class="modal" style="max-width:420px">
      <div class="modal-title">🏃 Como registrar a corrida</div>
      <div class="ds-regras-tit">🛣️ Na rua</div>
      <ol class="ds-passos">${PASSOS_CORRIDA.map(p => `<li>${p}</li>`).join('')}</ol>
      <div class="ds-regras-tit">🏋️ Na esteira</div>
      <ol class="ds-passos">${PASSOS_ESTEIRA.map(p => `<li>${p}</li>`).join('')}</ol>
      <div class="modal-hint">O corredor do próprio Falcon está chegando. Até lá, na rua a distância é medida pelo Strava.</div>
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
// O que falta na corrida começada hoje: { rotulo, dica } pro botão do card,
// da sala e do Pet. null = nenhuma corrida no meio.
export function proximoPassoCorrida(desafioId) {
  const p = corridaPendente(desafioId);
  if (!p) return null;
  if (p.local === 'esteira' && !p.videoPath) {
    return { rotulo: '🎥 Gravar o final da corrida', dica: '📸 Painel da esteira (antes) guardado. Nos últimos minutos, grava o vídeo correndo.' };
  }
  if (p.local === 'esteira') {
    return { rotulo: '📸 Foto do painel no fim', dica: '🎥 Vídeo guardado. Falta a foto do painel da esteira com a distância e o tempo.' };
  }
  return { rotulo: '📷 Enviar o print da corrida', dica: '🎥 Vídeo da corrida já guardado. Falta só o print do Strava.' };
}
function _guardarPendente(p) { try { localStorage.setItem(PEND_KEY, JSON.stringify(p)); } catch { /* sem storage */ } }
function _limparPendente() { try { localStorage.removeItem(PEND_KEY); } catch { /* sem storage */ } }

// ═══════════════════════════════════════════════════════════════
// BLOCO 4: REGISTRAR COM PROVA
// ═══════════════════════════════════════════════════════════════
// Registra o check-in pedindo a prova que o desafio exige. true = registrou.
// O banco confere as regras de novo (gatilho) e devolve o erro em português.
// falhou = largar um vício, dia em que não conseguiu (entra com quantidade 0).
export async function registrarComProva(d, { quantidade = 1, exercicio = null, falhou = false } = {}) {
  const corrida = d.prova === 'strava' || exercicio === 'Corrida';
  if (falhou) quantidade = 0;
  else if (depoimentoConta(d)) quantidade = d.meta_diaria || 1;   // Leitura: quanto leu, fala no vídeo
  if (aindaNaoComecou(d)) {
    showToast(`Calma! O desafio ${textoComeca(d)}. Até lá, aquece 🦅`, 'info');
    return false;
  }
  if (passouDoLimite(d)) {
    showToast(`Esse desafio só aceita a prova do dia até as ${horaLimite(d)}. Amanhã tem de novo 🦅`, 'error');
    return false;
  }
  try {
    if (d.prova === 'depoimento') {
      const roteiro = roteiroDepoimento(d, { falhou });
      const blob = await gravarVideoAoVivo({
        titulo: falhou ? '🎙️ Como foi hoje' : `🎙️ ${d.titulo}`,
        dica: `Fale sobre:<ul class="ds-rec-roteiro">${roteiro.map(r => `<li>${_esc(r)}</li>`).join('')}</ul>`,
        maxSeg: MAX_SEG_DEPOIMENTO,
        rascunho: true,
      });
      if (!blob) return false;
      if (blob.__rascunho) return await _guardarRascunho(d, blob, { quantidade, exercicio, falhou, tipo: 'depoimento' });
      showToast('Enviando o depoimento…', 'info');
      const videoPath = await subirProva(blob, 'video');
      await addCheckin(d.id, quantidade, { exercicio, videoPath });
      showToast(falhou ? '💪 Depoimento enviado, dia contado. Amanhã é um novo dia.' : '🎙️ Depoimento enviado! 🦅', 'success');
      return true;
    }
    if (corrida) return await _registrarCorrida(d, { quantidade, exercicio });
    if (d.prova === 'video') {
      const nome = exercicio || d.titulo;
      const blob = await gravarVideoAoVivo({
        titulo: `🎥 ${nome}`,
        dica: exercicio ? 'Grave você fazendo o exercício, do começo ao fim.'
          : ehAgua(d) ? `Mostre o copo ou a garrafa, diga quanto cabe (${quantidade} ml) e beba tudo.`
          : horaLimite(d) ? 'Mostre a hora na tela do celular e o seu rosto.' : 'Grave você cumprindo o desafio.',
        rascunho: true,
      });
      if (!blob) return false;
      if (blob.__rascunho) return await _guardarRascunho(d, blob, { quantidade, exercicio, falhou, tipo: 'video' });
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

// Rascunho: fica só no aparelho, aparece apagado na conversa do grupo com a
// hora em que foi gravado e o botão Enviar (desafios-rascunho.js).
async function _guardarRascunho(d, blob, extra) {
  await salvarRascunho({ desafioId: d.id, blob, ...extra });
  showToast('💾 Rascunho salvo na conversa do grupo. Manda quando quiser, hoje.', 'success');
  return false;
}

// Corrida em partes, guardando o que já foi feito (a pessoa sai do app no meio):
//   rua:     vídeo ao vivo no fim → print do Strava
//   esteira: foto do painel antes → vídeo ao vivo no fim → foto do painel depois
// O card mostra o próximo passo (proximoPassoCorrida).
function _ondeCorrer() {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `
      <div class="modal" style="max-width:380px">
        <div class="modal-title">🏃 Onde tu vai correr?</div>
        <div class="modal-actions" style="flex-direction:column;gap:8px">
          <button class="btn-primary" data-onde="rua" style="width:100%">🛣️ Na rua (Strava)</button>
          <button class="btn-primary" data-onde="esteira" style="width:100%">🏋️ Na esteira</button>
          <button class="btn-secondary" data-onde="" style="width:100%">Cancelar</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    let escolha = null;
    // Só segue depois que o "voltar" do modal passou: senão ele fecha a câmera que abre em seguida
    const depois = () => {
      let feito = false;
      const ir = () => { if (feito) return; feito = true; window.removeEventListener('popstate', ir); setTimeout(() => resolve(escolha), 0); };
      window.addEventListener('popstate', ir);
      setTimeout(ir, 600);
    };
    const close = trapModalBack(() => { ov.remove(); depois(); });
    ov.querySelectorAll('[data-onde]').forEach(b => b.onclick = () => { escolha = b.dataset.onde || null; close(); });
  });
}

async function _gravarFinal() {
  return gravarVideoAoVivo({
    titulo: '🏃 Final da corrida',
    dica: 'Grave você correndo, com o rosto aparecendo: o fôlego e o suor contam.',
  });
}

async function _registrarCorrida(d, { quantidade, exercicio }) {
  let pend = corridaPendente(d.id);
  if (!pend) {
    const local = await _ondeCorrer();
    if (!local) return false;
    if (local === 'esteira') {
      const foto = await tirarFotoAoVivo({ titulo: '📸 Painel da esteira (antes)', dica: 'Mostre o painel <b>zerado</b>, antes de começar.' });
      if (!foto) return false;
      const antes = await _blobParaDataURL(foto);
      _guardarPendente({ desafioId: d.id, dia: _hoje(), local, antes, quantidade, exercicio });
      showToast('📸 Painel guardado! Bora correr. Nos últimos minutos, grava o vídeo 🏃', 'success');
      return false;
    }
    const blob = await _gravarFinal();
    if (!blob) return false;
    showToast('Enviando o vídeo…', 'info');
    const videoPath = await subirProva(blob, 'video');
    _guardarPendente({ desafioId: d.id, dia: _hoje(), local, videoPath, quantidade, exercicio });
    showToast('🎥 Vídeo guardado! Agora termine no Strava e mande o print.', 'success');
    return false;   // falta o print: ainda não registrou
  }
  if (pend.local === 'esteira' && !pend.videoPath) {
    const blob = await _gravarFinal();
    if (!blob) return false;
    showToast('Enviando o vídeo…', 'info');
    pend.videoPath = await subirProva(blob, 'video');
    _guardarPendente(pend);
    showToast('🎥 Vídeo guardado! Agora a foto do painel com a distância e o tempo.', 'success');
    return false;
  }
  let foto;
  if (pend.local === 'esteira') {
    const depois = await tirarFotoAoVivo({ titulo: '📸 Painel da esteira (depois)', dica: 'Mostre a <b>distância</b> e o <b>tempo</b> no painel.' });
    if (!depois) return false;
    foto = await _juntarAntesDepois(pend.antes, depois);
  } else {
    foto = await escolherPrint();
    if (!foto) return false;
  }
  showToast(pend.local === 'esteira' ? 'Enviando as fotos do painel…' : 'Enviando o print…', 'info');
  const printPath = await subirProva(foto, 'print');
  await addCheckin(d.id, pend.quantidade || quantidade, { exercicio: pend.exercicio || exercicio, videoPath: pend.videoPath, printPath });
  _limparPendente();
  showToast('🏃 Corrida registrada! 🦅', 'success');
  return true;
}
