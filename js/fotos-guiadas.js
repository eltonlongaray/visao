// ─── ÍNDICE ──────────────────────────────────────────────────
// FOTOS GUIADAS DE ANTES × DEPOIS (18/11/2026) — lado da PROFISSIONAL
//   BLOCO 1 — protocolos (rosto, celulite, corpo e medidas): poses + instruções
//   BLOCO 2 — sugerir o tipo de acompanhamento pelo nome do serviço
//   BLOCO 3 — conferir foto da galeria (resolução, tremida, luz, reflexo, posição)
//   BLOCO 4 — câmera guiada: molde + "aproxime/afaste/vire" e foto AUTOMÁTICA,
//             nível de inclinação na lateral e rosto em oval com o fundo escurecido
//   BLOCO 5 — montar o antes × depois (com o nome do negócio), baixar e compartilhar
// A detecção (MediaPipe Pose, Google) roda NO APARELHO: a foto não sai pra análise.
// Sem o modelo (internet ruim, celular antigo), a câmera continua com o botão manual.
// ─────────────────────────────────────────────────────────────

// === BLOCO 1: PROTOCOLOS ===
// Corpo: 6 fotos como na Composição Corporal (3 de cima + 3 de baixo), UM lado só
// (as medidas por altura já pegam direito e esquerdo). Rosto só aparece no protocolo de rosto.
const ROUPA = 'De <b>biquíni</b> (mulher) ou <b>sunga</b> (homem), descalça(o), num fundo liso.';
const LUZ = 'Sempre <b>no mesmo lugar e com a mesma luz</b>, sem flash.';
export const PROTOCOLOS = {
  rosto: {
    nome: 'Rosto', icone: '🙂',
    instr: `Rosto <b>limpo e seco</b> (sem reflexo), sem maquiagem, cabelo preso. Cliente sentada, celular na altura do rosto. ${LUZ}`,
    poses: [
      { k: 'rosto_esq', nome: 'Lado esquerdo do rosto', alvo: 'rosto_lado' },
      { k: 'rosto_frente', nome: 'Rosto de frente', alvo: 'rosto_frente' },
      { k: 'rosto_dir', nome: 'Lado direito do rosto', alvo: 'rosto_lado' },
    ],
  },
  celulite: {
    nome: 'Celulite e estrias', icone: '🍑',
    instr: `${ROUPA} Músculos <b>relaxados</b> (sem contrair), pés juntos. ${LUZ} O rosto não aparece.`,
    poses: [
      { k: 'gluteo_costas', nome: 'Glúteos e coxas de costas', alvo: 'gluteo_costas' },
      { k: 'gluteo_lado', nome: 'Glúteo e coxa de lado', alvo: 'gluteo_lado' },
      { k: 'coxas_frente', nome: 'Coxas de frente', alvo: 'coxas_frente' },
    ],
  },
  corpo: {
    nome: 'Corpo e medidas', icone: '📏',
    instr: `${ROUPA} Braços um pouco afastados do corpo. ${LUZ} O rosto não aparece: o app corta no pescoço.`,
    poses: [
      { k: 'tronco_frente', nome: 'Tronco de frente', alvo: 'tronco_frente' },
      { k: 'tronco_lado', nome: 'Tronco de lado', alvo: 'tronco_lado' },
      { k: 'tronco_costas', nome: 'Tronco de costas', alvo: 'tronco_costas' },
      { k: 'pernas_frente', nome: 'Pernas de frente', alvo: 'pernas_frente' },
      { k: 'pernas_lado', nome: 'Pernas de lado', alvo: 'pernas_lado' },
      { k: 'pernas_costas', nome: 'Pernas de costas', alvo: 'pernas_costas' },
    ],
  },
};
export const ACOMPS = Object.keys(PROTOCOLOS);
// Poses antigas (sessões de antes de 18/11): continuam aparecendo no antes × depois.
const POSES_ANTIGAS = { frente: 'Frente', costas: 'Costas', lado_d: 'Lado direito', lado_e: 'Lado esquerdo' };
export const nomePose = k => Object.values(PROTOCOLOS).flatMap(p => p.poses).find(p => p.k === k)?.nome || POSES_ANTIGAS[k] || k;
export const posesDe = acomps => (acomps || []).flatMap(a => PROTOCOLOS[a]?.poses || []);

// === BLOCO 2: SUGESTÃO PELO NOME DO SERVIÇO ===
const _n = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export function sugerirAcomp(nome) {
  const n = _n(nome), out = [];
  if (/limpeza|pele|mancha|acne|facial|rosto|peeling/.test(n)) out.push('rosto');
  if (/celulite|estria|deusa|gluteo/.test(n)) out.push('celulite');
  if (/esculpe|drenagem|modelad|medida|detox|deusa|redu/.test(n)) out.push('corpo');
  return out;
}
// Acompanhamento do serviço: o que a profissional marcou; se nunca mexeu, a sugestão.
export const acompDoServico = s => Array.isArray(s?.acomp) ? s.acomp : sugerirAcomp(s?.nome);
// Qual FICHA o serviço usa. Quem atende só massagem (profissão massoterapia) usa sempre a de massoterapia.
// Estética: serviço com fotos/medidas (tratamento com acompanhamento) → ficha de estética; massagem → massoterapia.
export function fichaDoServico(s, padrao) {
  if (s?.ficha) return s.ficha;
  if (padrao !== 'estetica') return padrao || 'massoterapia';
  if (/acne|espinha|oleosidade|acneica/.test(_n(s?.nome))) return 'pele';
  return acompDoServico(s).length ? 'estetica' : 'massoterapia';
}
export const FICHAS_NOMES = { estetica: '✨ Estética', massoterapia: '💆 Massagem', pele: '🌸 Pele e acne' };

// === BLOCO 3: CONFERIR FOTO (galeria ou câmera) ===
// Heurísticas no próprio aparelho. Não bloqueia: devolve avisos com a orientação certa.
export async function conferirFoto(blob, pose, antesUrl = null) {
  const avisos = [];
  let bmp; try { bmp = await createImageBitmap(blob); } catch { return ['Não consegui abrir essa foto.']; }
  const W = bmp.width, H = bmp.height;
  const tipo = String(pose || '').split('_')[0];
  if (Math.min(W, H) < 1000) avisos.push('Foto com <b>pouca resolução</b>: o antes × depois fica borrado. Tire pela câmera do app.');
  if (tipo !== 'rosto' && W > H * 1.05) avisos.push('Foto do corpo deve ser <b>em pé (vertical)</b>, não deitada.');
  const st = _estatisticas(bmp);
  if (st.nitidez < 18) avisos.push('A foto ficou <b>tremida ou desfocada</b>. Apoie o celular e espere focar antes de tirar.');
  if (st.media < 70) avisos.push('Ficou <b>escura</b>. Procure luz natural de frente (janela), sem flash.');
  else if (st.media > 205) avisos.push('Ficou <b>clara demais</b> (luz estourada). Saia da luz direta do sol ou do flash.');
  if (tipo === 'rosto' && st.estouro > 0.05) avisos.push('Tem <b>reflexo na pele</b>. Seque bem o rosto com papel antes da foto.');
  if (antesUrl) {
    try {
      const a = await createImageBitmap(await (await fetch(antesUrl)).blob());
      const sa = _estatisticas(a);
      if (Math.abs(sa.media - st.media) > 38) avisos.push('A <b>luz está bem diferente</b> da foto do antes: a comparação pode enganar. Use o mesmo lugar e a mesma luz.');
      if (a.close) a.close();
    } catch { /* sem a foto do antes: segue */ }
  }
  if (bmp.close) bmp.close();
  return avisos;
}
// Média de brilho, % de pixels estourados e nitidez (variância do Laplaciano) numa cópia pequena.
function _estatisticas(bmp) {
  const k = Math.min(1, 360 / Math.max(bmp.width, bmp.height));
  const w = Math.max(8, Math.round(bmp.width * k)), h = Math.max(8, Math.round(bmp.height * k));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(bmp, 0, 0, w, h);
  const d = cx.getImageData(0, 0, w, h).data, g = new Float32Array(w * h);
  let soma = 0, estouro = 0;
  for (let i = 0, j = 0; i < d.length; i += 4, j++) { const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; g[j] = y; soma += y; if (y > 245) estouro++; }
  let s = 0, s2 = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, l = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w];
    s += l; s2 += l * l; n++;
  }
  cv.width = 0; cv.height = 0;
  const mL = s / n;
  return { media: soma / (w * h), estouro: estouro / (w * h), nitidez: Math.sqrt(Math.max(0, s2 / n - mL * mL)) };
}

// === BLOCO 4: CÂMERA GUIADA ===
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODELO = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
let _detector = null, _carregando = null;
async function _carregarDetector() {
  if (_detector) return _detector;
  if (!_carregando) _carregando = (async () => {
    const { FilesetResolver, PoseLandmarker } = await import(`${MP}/vision_bundle.mjs`);
    const fs = await FilesetResolver.forVisionTasks(`${MP}/wasm`);
    const criar = delegate => PoseLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: MODELO, delegate }, runningMode: 'VIDEO', numPoses: 1 });
    try { _detector = await criar('GPU'); } catch { _detector = await criar('CPU'); }
    return _detector;
  })().catch(e => { _carregando = null; throw e; });
  return _carregando;
}

// Avalia o enquadramento. L = 33 pontos normalizados (0–1). Devolve { ok, msg, corte }.
// corte = {y0, y1} (fração da altura) pra tirar o rosto das fotos de corpo.
const VIS = 0.55;
const _v = p => p && (p.visibility ?? 1) > VIS;
function _avaliar(alvo, L) {
  if (!L) return { ok: false, msg: 'Enquadre a cliente na tela' };
  const P = i => L[i];
  const meio = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const lado = (a, b, ref) => Math.abs(a.x - b.x) / Math.max(0.01, ref);   // largura ÷ referência vertical
  // Sem 'esquerda/direita' (confundia conforme a câmera): o ponto na tela mostra onde a cliente está.
  const centro = x => (x < 0.38 || x > 0.62 ? 'Leve o ponto pro meio do contorno' : '');
  const narizVisivel = (P(0).visibility ?? 0) > 0.6;

  if (alvo.startsWith('rosto')) {
    const nz = P(0), oe = P(7), od = P(8);
    if (!_v(nz)) return { ok: false, msg: 'Enquadre o rosto da cliente' };
    // Tamanho do rosto = largura dos pontos do rosto (olhos, orelhas, boca): vale de frente e de lado.
    const xs = L.slice(0, 11).map(p => p.x), larg = Math.max(...xs) - Math.min(...xs);
    // Giro: nariz em relação ao meio das orelhas (0 = de frente; ~0,5+ = de perfil).
    // O modelo "chuta" a orelha escondida com visibilidade alta, então vale o giro, não a visibilidade.
    const giro = Math.abs(nz.x - (oe.x + od.x) / 2) / Math.max(0.01, Math.abs(oe.x - od.x));
    if (larg < 0.26) return { ok: false, msg: 'Aproxime-se um pouco' };
    if (larg > 0.55) return { ok: false, msg: 'Afaste-se um pouco' };
    const c = centro(nz.x); if (c) return { ok: false, msg: c };
    if (nz.y < 0.30 || nz.y > 0.62) return { ok: false, msg: nz.y < 0.30 ? 'Abaixe um pouco o celular' : 'Suba um pouco o celular' };
    if (alvo === 'rosto_frente' && giro > 0.22) return { ok: false, msg: 'Peça pra cliente olhar reto pra câmera' };
    if (alvo === 'rosto_lado' && giro < 0.45) return { ok: false, msg: 'Peça pra cliente virar mais o rosto de lado' };
    return { ok: true, msg: 'Perfeito! Segura assim…' };
  }

  const ombro = [P(11), P(12)], quadril = [P(23), P(24)], joelho = [P(25), P(26)], tornozelo = [P(27), P(28)];
  const temOmbro = ombro.every(_v), temQuadril = quadril.every(_v), temJoelho = joelho.some(_v), temTorno = tornozelo.some(_v);
  const mO = meio(...ombro), mQ = meio(...quadril), mJ = meio(...joelho), mT = meio(...tornozelo);
  const orient = (larg, ref, quer) => {
    const r = lado(larg[0], larg[1], ref);
    if (quer === 'lado') return r < 0.30 ? '' : 'Peça pra cliente virar de lado';
    if (r < 0.40) return 'Peça pra cliente ficar ' + (quer === 'costas' ? 'de costas' : 'de frente') + ' pra câmera';
    if (quer === 'frente' && !narizVisivel) return 'Peça pra cliente ficar de frente pra câmera';
    if (quer === 'costas' && narizVisivel) return 'Peça pra cliente ficar de costas pra câmera';
    return '';
  };
  const tamanho = (h, min, max) => (h < min ? 'Aproxime-se um pouco' : h > max ? 'Afaste-se um pouco' : '');
  const quer = alvo.endsWith('lado') ? 'lado' : alvo.endsWith('costas') ? 'costas' : 'frente';

  if (alvo.startsWith('tronco')) {
    if (!temOmbro || !temQuadril) return { ok: false, msg: 'Enquadre dos ombros até o quadril' };
    const h = mQ.y - mO.y;
    const m = orient(ombro, h, quer) || tamanho(h, 0.42, 0.62) || centro(mQ.x)
      || (mO.y < 0.12 ? 'Abaixe um pouco o celular' : mQ.y > 0.86 ? 'Suba um pouco o celular' : '');
    return m ? { ok: false, msg: m } : { ok: true, msg: 'Perfeito! Segura assim…', corte: { y0: Math.max(0, mO.y - 0.03), y1: Math.min(1, mQ.y + 0.14) } };
  }
  if (alvo.startsWith('pernas')) {
    if (!temQuadril || !temTorno) return { ok: false, msg: 'Enquadre do quadril até os pés' };
    const h = mT.y - mQ.y;
    const m = orient(quadril, h, quer) || tamanho(h, 0.62, 0.86) || centro(mQ.x);
    return m ? { ok: false, msg: m } : { ok: true, msg: 'Perfeito! Segura assim…', corte: { y0: Math.max(0, mQ.y - 0.08), y1: Math.min(1, mT.y + 0.06) } };
  }
  // celulite: glúteos e coxas
  if (!temQuadril || !temJoelho) return { ok: false, msg: 'Enquadre da cintura até os joelhos' };
  const h = mJ.y - mQ.y;
  const m = orient(quadril, h * 2, quer) || tamanho(h, 0.30, 0.50) || centro(mQ.x);
  return m ? { ok: false, msg: m } : { ok: true, msg: 'Perfeito! Segura assim…', corte: { y0: Math.max(0, mQ.y - 0.16), y1: Math.min(1, mJ.y + 0.08) } };
}

const _esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

// Abre a câmera pra uma pose. Devolve o Blob aprovado (JPEG até 2000 px) ou null.
// fantasma: link da foto do antes (aparece transparente por cima pra alinhar).
export function abrirCameraGuiada(pose, { instr = '', fantasma = null, passo = '' } = {}) {
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'cam-guia-ov fg-ov';
    ov.innerHTML = `
      <div class="fg-topo"><div class="fg-passo">${_esc(passo)}</div><b>${_esc(pose.nome)}</b><div class="fg-instr">${instr}</div></div>
      <div class="fg-palco">
        <video class="fg-video" autoplay playsinline muted></video>
        ${fantasma ? `<img class="fg-fantasma" src="${_esc(fantasma)}" alt="">` : ''}
        ${pose.alvo.startsWith('rosto') ? '<div class="fg-mascara" aria-hidden="true"></div>' : ''}
        <div class="fg-molde ${pose.alvo.startsWith('rosto') ? 'oval' : ''}"></div>
        <div class="fg-alvo"></div><div class="fg-ponto" hidden></div>
        <div class="fg-nivel" hidden aria-label="Nível do celular">
          <div class="fg-nivel-trilho">${'<i></i>'.repeat(9)}</div>
          <div class="fg-nivel-linha"></div>
          <span class="fg-nivel-grau"></span>
        </div>
        <button type="button" class="fg-nivel-ativar" data-fg="nivel" hidden>📐 Ativar nível</button>
      </div>
      <div class="fg-status" id="fg-status">Abrindo a câmera…</div>
      <div class="fg-dica">Ajuste até o contorno ficar <b>verde</b>: o app tira a foto sozinho.</div>
      <div class="cam-guia-barra">
        <button type="button" class="cam-guia-btn" data-fg="cancel">Cancelar</button>
        <button type="button" class="cam-guia-shot" data-fg="shot" aria-label="Tirar foto agora"></button>
        <button type="button" class="cam-guia-btn" data-fg="fant"${fantasma ? '' : ' hidden'}>Antes ◐</button>
      </div>`;
    document.body.appendChild(ov);
    const video = ov.querySelector('video'), status = ov.querySelector('#fg-status'), molde = ov.querySelector('.fg-molde');
    let stream = null, rodando = true, okDesde = 0, ultimo = null, detector = null;
    const fim = v => { rodando = false; window.removeEventListener('deviceorientation', aoInclinar); if (stream) stream.getTracks().forEach(t => t.stop()); ov.remove(); resolve(v); };

    // NÍVEL (Élton, 26/11): barra vertical na lateral. A linha anda pra cima/baixo
    // conforme a inclinação pra frente/trás (beta: 90° = celular em pé) e fica
    // VERDE no meio quando está a 90° ± 2°. Sem sensor (computador), não aparece.
    const nivel = ov.querySelector('.fg-nivel'), nivelGrau = ov.querySelector('.fg-nivel-grau'), btNivel = ov.querySelector('.fg-nivel-ativar');
    let beta = null;
    function aoInclinar(e) {
      if (e.beta == null) return;
      beta = beta == null ? e.beta : beta + (e.beta - beta) * 0.3;    // suaviza o tremido da mão
      const d = beta - 90, reto = Math.abs(d) <= 2;
      nivel.hidden = false; btNivel.hidden = true;
      nivel.style.setProperty('--off', Math.max(-1, Math.min(1, d / 20)).toFixed(3));
      nivel.classList.toggle('ok', reto);
      nivelGrau.textContent = reto ? '90°' : `${Math.round(beta)}°`;
    }
    async function ligarNivel() {
      const D = window.DeviceOrientationEvent;
      if (!D) return;
      window.removeEventListener('deviceorientation', aoInclinar);
      window.addEventListener('deviceorientation', aoInclinar);   // sem permissão, só não chega nada
      if (typeof D.requestPermission !== 'function') return;
      // iPhone (e alguns navegadores): o sensor só libera com um toque → botão "Ativar nível"
      try { if ((await D.requestPermission()) !== 'granted' && beta == null) btNivel.hidden = false; }
      catch { if (beta == null) btNivel.hidden = false; }
    }
    ligarNivel();
    const msg = (t, ok) => { status.textContent = t; status.classList.toggle('ok', !!ok); molde.classList.toggle('ok', !!ok); };
    // ponto onde a cliente está (rosto: nariz; corpo: meio do tronco/quadril), na posição da imagem na tela
    const ponto = ov.querySelector('.fg-ponto');
    const marcar = L => {
      if (!L || !video.videoWidth) { ponto.hidden = true; return; }
      const ref = pose.alvo.startsWith('rosto') ? L[0] : (L[23] && L[24] ? { x: (L[23].x + L[24].x + (L[11]?.x ?? L[23].x) + (L[12]?.x ?? L[24].x)) / 4, y: ((L[23].y + L[24].y) / 2 + ((L[11]?.y ?? L[23].y) + (L[12]?.y ?? L[24].y)) / 2) / 2 } : L[0]);
      const cw = video.clientWidth, ch = video.clientHeight, k = Math.min(cw / video.videoWidth, ch / video.videoHeight);
      const ox = (cw - video.videoWidth * k) / 2, oy = (ch - video.videoHeight * k) / 2;
      ponto.style.left = (ox + ref.x * video.videoWidth * k) + 'px'; ponto.style.top = (oy + ref.y * video.videoHeight * k) + 'px'; ponto.hidden = false;
    };

    async function capturar(corte) {
      if (!video.videoWidth) return;
      const vw = video.videoWidth, vh = video.videoHeight;
      const y0 = corte ? Math.round(corte.y0 * vh) : 0, y1 = corte ? Math.round(corte.y1 * vh) : vh;
      const k = Math.min(1, 2000 / Math.max(vw, y1 - y0));
      const cv = document.createElement('canvas'); cv.width = Math.round(vw * k); cv.height = Math.round((y1 - y0) * k);
      cv.getContext('2d').drawImage(video, 0, y0, vw, y1 - y0, 0, 0, cv.width, cv.height);
      const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.9)); cv.width = 0; cv.height = 0;
      rodando = false;
      revisar(blob);
    }
    // Revisão: aprovar ou tirar de novo (não salva nada sem aprovação).
    function revisar(blob) {
      const url = URL.createObjectURL(blob);
      const rv = document.createElement('div'); rv.className = 'fg-rev';
      rv.innerHTML = `<img src="${url}" alt=""><div class="fg-rev-avisos" id="fg-avisos"></div>
        <div class="cam-guia-barra"><button type="button" class="cam-guia-btn" data-rv="de-novo">Tirar de novo</button>
        <button type="button" class="btn-primary fg-aprovar" data-rv="ok">✅ Aprovar</button></div>`;
      ov.appendChild(rv);
      conferirFoto(blob, pose.k).then(av => { const b = rv.querySelector('#fg-avisos'); if (b && av.length) b.innerHTML = av.map(a => `<div>⚠️ ${a}</div>`).join(''); });
      rv.addEventListener('click', e => {
        const a = e.target.closest('[data-rv]')?.dataset.rv; if (!a) return;
        URL.revokeObjectURL(url);
        if (a === 'ok') return fim(blob);
        rv.remove(); okDesde = 0; rodando = true; loop();
      });
    }
    function loop() {
      if (!rodando) return;
      if (detector && video.readyState >= 2) {
        try {
          const r = detector.detectForVideo(video, performance.now());
          const av = _avaliar(pose.alvo, r?.landmarks?.[0]);
          marcar(r?.landmarks?.[0]);
          ultimo = av;
          if (av.ok) {
            if (!okDesde) okDesde = performance.now();
            const falta = Math.max(0, 1200 - (performance.now() - okDesde));
            msg(falta > 0 ? av.msg : '📸', true);
            if (falta === 0) { capturar(av.corte); return; }
          } else { okDesde = 0; msg(av.msg, false); }
        } catch { /* um quadro ruim não para a câmera */ }
      }
      setTimeout(() => requestAnimationFrame(loop), 110);
    }
    ov.addEventListener('click', e => {
      const a = e.target.closest('[data-fg]')?.dataset.fg; if (!a) return;
      if (a === 'cancel') return fim(null);
      if (a === 'shot') return capturar(ultimo?.ok ? ultimo.corte : null);
      if (a === 'fant') ov.querySelector('.fg-fantasma')?.classList.toggle('fora');
      if (a === 'nivel') { btNivel.hidden = true; ligarNivel(); }
    });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 2560 } }, audio: false });
        video.srcObject = stream;
      } catch { msg('Não consegui abrir a câmera. Use a galeria.', false); return; }
      msg('Preparando o guia de enquadramento…', false);
      try {
        detector = await Promise.race([_carregarDetector(), new Promise((_, rej) => setTimeout(() => rej(new Error('demorou')), 15000))]);
      } catch { msg('Guia automático indisponível: enquadre e toque no botão redondo.', false); return; }
      loop();
    })();
  });
}

// === BLOCO 5: ANTES × DEPOIS ===
async function _bitmap(url) { return createImageBitmap(await (await fetch(url)).blob()); }
// Duas fotos lado a lado (mesmo recorte 4:5), etiquetas ANTES/DEPOIS e o nome do negócio.
export async function montarAntesDepois(urlAntes, urlDepois, { marca = '', titulo = '' } = {}) {
  const [a, b] = await Promise.all([_bitmap(urlAntes), _bitmap(urlDepois)]);
  const PW = 900, PH = 1125, GAP = 12, TOPO = marca || titulo ? 96 : 0;
  const cv = document.createElement('canvas'); cv.width = PW * 2 + GAP; cv.height = PH + TOPO;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, cv.width, cv.height);
  const pinta = (bmp, x) => {   // "cover": preenche o painel sem distorcer
    const k = Math.max(PW / bmp.width, PH / bmp.height), w = PW / k, h = PH / k;
    cx.drawImage(bmp, (bmp.width - w) / 2, (bmp.height - h) / 2, w, h, x, TOPO, PW, PH);
  };
  pinta(a, 0); pinta(b, PW + GAP);
  if (TOPO) {
    cx.fillStyle = '#3c285a'; cx.font = '700 44px "Segoe UI", Roboto, Arial, sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillText([marca, titulo].filter(Boolean).join('  ·  '), cv.width / 2, TOPO / 2);
  }
  const etiqueta = (txt, x) => {
    cx.font = '700 46px "Segoe UI", Roboto, Arial, sans-serif'; cx.textAlign = 'left'; cx.textBaseline = 'middle';
    const w = cx.measureText(txt).width + 56, y = TOPO + PH - 92;
    cx.fillStyle = 'rgba(255,255,255,0.94)'; cx.beginPath(); cx.roundRect(x + 32, y, w, 64, 32); cx.fill();
    cx.fillStyle = '#3c285a'; cx.fillText(txt, x + 60, y + 33);
  };
  etiqueta('ANTES', 0); etiqueta('DEPOIS', PW + GAP);
  if (a.close) a.close(); if (b.close) b.close();
  const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.92)); cv.width = 0; cv.height = 0;
  return blob;
}
export function baixarArquivo(blob, nome) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
// Compartilhar (abre WhatsApp, Instagram…). Sem suporte a arquivos: baixa.
export async function compartilharArquivos(blobs, nomes, texto = '') {
  const files = blobs.map((b, i) => new File([b], nomes[i], { type: 'image/jpeg' }));
  if (navigator.canShare?.({ files })) { try { await navigator.share({ files, text: texto }); return true; } catch { return false; } }
  blobs.forEach((b, i) => baixarArquivo(b, nomes[i]));
  return false;
}
