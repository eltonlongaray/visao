// ─── ÍNDICE ──────────────────────────────────────────────────
// FALCON · Deixar um vídeo mais leve antes de enviar
// Vídeo da prova que passou do limite do envio (50 MB): toca o vídeo
// escondido, redesenha menor (360×640, 15 quadros/s) e grava de novo com o
// som. Leva o tempo do próprio vídeo, com a barra de progresso na tela.
// (Élton, 16/10: depoimento de 5 min deu mais de 50 MB no Android.)
// ─────────────────────────────────────────────────────────────
import './vendor/fix-webm-duration.js';   // window.ysFixWebmDuration

const W = 360, H = 640;

function _mime() {
  if (typeof MediaRecorder === 'undefined') return null;
  const op = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4',
              'video/webm;codecs=vp8,opus', 'video/webm'];
  return op.find(m => MediaRecorder.isTypeSupported?.(m)) || '';
}
const _mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Devolve o Blob mais leve, ou null se a pessoa cancelou / o aparelho não dá conta.
export function deixarVideoLeve(blob) {
  return new Promise((resolve) => {
    const mime = _mime();
    const tela = document.createElement('canvas');
    if (mime === null || typeof tela.captureStream !== 'function') return resolve(null);
    tela.width = W; tela.height = H;
    const ctx = tela.getContext('2d');

    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `
      <div class="modal" style="max-width:360px;text-align:center">
        <div class="modal-title">🪶 Deixando o vídeo mais leve</div>
        <div class="modal-hint">O vídeo passou do tamanho máximo. Deixa o app aberto: leva o tempo do vídeo.</div>
        <div style="height:8px;border-radius:4px;background:rgba(255,255,255,.12);overflow:hidden;margin:14px 0 6px">
          <div data-leve-barra style="height:100%;width:0;background:#a78bfa;transition:width .25s"></div>
        </div>
        <div data-leve-tempo class="modal-hint">0:00</div>
        <div class="modal-actions"><button class="btn-secondary" data-leve-cancelar style="width:100%">Cancelar</button></div>
      </div>`;
    document.body.appendChild(ov);
    const barra = ov.querySelector('[data-leve-barra]');
    const tempo = ov.querySelector('[data-leve-tempo]');

    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.playsInline = true;
    video.muted = true;   // não toca no alto-falante; o som gravado vem do captureStream
    video.src = url;
    let mr = null, raf = 0, fim = false, cancelado = false;
    const pedacos = [];
    let t0 = 0;

    const acabar = (res) => {
      if (fim) return; fim = true;
      cancelAnimationFrame(raf);
      try { video.pause(); } catch {}
      URL.revokeObjectURL(url);
      ov.remove();
      resolve(res);
    };
    ov.querySelector('[data-leve-cancelar]').onclick = () => {
      cancelado = true;
      if (mr && mr.state !== 'inactive') mr.stop(); else acabar(null);
    };

    function desenhar() {
      raf = requestAnimationFrame(desenhar);
      const vw = video.videoWidth, vh = video.videoHeight;
      if (vw && vh) {
        const k = Math.max(W / vw, H / vh);
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
        ctx.drawImage(video, (W - vw * k) / 2, (H - vh * k) / 2, vw * k, vh * k);
      }
      const dur = isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      const t = video.currentTime || 0;
      tempo.textContent = dur ? `${_mmss(t)} / ${_mmss(dur)}` : _mmss(t);
      if (dur) barra.style.width = `${Math.min(100, (t / dur) * 100)}%`;
    }

    video.onerror = () => acabar(null);
    video.onended = () => { if (mr && mr.state !== 'inactive') mr.stop(); };
    video.onloadedmetadata = async () => {
      try {
        // O som vem do próprio vídeo; a imagem, do desenho menor
        const som = typeof video.captureStream === 'function' ? video.captureStream().getAudioTracks()
          : typeof video.mozCaptureStream === 'function' ? video.mozCaptureStream().getAudioTracks() : [];
        const fonte = new MediaStream([...tela.captureStream(15).getVideoTracks(), ...som]);
        mr = new MediaRecorder(fonte, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 300000, audioBitsPerSecond: 48000 });
        mr.ondataavailable = (e) => { if (e.data?.size) pedacos.push(e.data); };
        mr.onstop = async () => {
          if (cancelado || !pedacos.length) return acabar(null);
          let saida = new Blob(pedacos, { type: (mr.mimeType || mime || 'video/webm').split(';')[0] });
          if (/webm/.test(saida.type) && window.ysFixWebmDuration) {
            try { saida = await window.ysFixWebmDuration(saida, performance.now() - t0, { logger: false }); } catch {}
          }
          acabar(saida);
        };
        desenhar();
        await video.play();
        t0 = performance.now();
        mr.start(1000);
      } catch { acabar(null); }
    };
  });
}
