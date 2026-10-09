// ─── ÍNDICE ──────────────────────────────────────────────────
// Pet + IA de linguagem na nuvem (Worker da Cloudflare, cloudflare/pet-ia).
// Só entra quando o Pet de sempre NÃO entendeu. A IA devolve um JSON com a
// ação; aqui ele vira uma FRASE que o Pet já sabe executar ("agendar academia
// amanhã às 07:00"), então tudo continua passando pelos cards de confirmação.
// Sem URL configurada, ou se a nuvem falhar (sem internet, cota do dia acabou),
// devolve null e o Pet segue como sempre.
// BLOCO 1 — CONFIG
// BLOCO 2 — CHAMADA
// BLOCO 3 — JSON → FRASE DO APP
// ─────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════
// BLOCO 1: CONFIG
// ═══════════════════════════════════════════════════════════════
// Endereço do Worker publicado (não é segredo). Vazio = desligado.
export const PET_IA_URL = 'https://pet-ia.eltonvisao.workers.dev';
const TEMPO_MAX = 8000;

// ═══════════════════════════════════════════════════════════════
// BLOCO 2: CHAMADA
// ═══════════════════════════════════════════════════════════════
export const nuvemLigada = () => !!PET_IA_URL && navigator.onLine !== false;

// { texto, pergunta?, opcoes?: [{id,label}], historico?: [{quem:'pessoa'|'pet', texto}] } → objeto da IA ou null
export async function perguntarNuvem({ texto, pergunta = '', opcoes = [], historico = [] }) {
  if (!nuvemLigada() || !String(texto || '').trim()) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TEMPO_MAX);
  try {
    const { supabase } = await import('./config-supabase.js');
    const token = (await supabase.auth.getSession())?.data?.session?.access_token;
    if (!token) return null;
    const r = await fetch(PET_IA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ texto, pergunta, opcoes, historico }),
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.acao ? j : null;
  } catch (err) {
    console.warn('[pet-nuvem]', err?.name === 'AbortError' ? 'demorou demais' : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 3: JSON → FRASE DO APP
// ═══════════════════════════════════════════════════════════════
const limpa = (s) => String(s || '').replace(/[<>]/g, '').trim();
const juntar = (itens) => {
  const xs = (Array.isArray(itens) ? itens : [itens]).map(limpa).filter(Boolean);
  return xs.length > 1 ? `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}` : xs[0] || '';
};
const CONSULTA_FRASE = {
  proximo_compromisso: 'qual meu próximo compromisso',
  tarefas_hoje: 'o que eu tenho hoje',
  sono: 'como foi meu sono',
  agua: 'quanta água eu bebi',
  sequencia: 'qual minha constância',
  perfil_treino: 'qual meu perfil de treino',
  cartao_dia: 'mostra o cartão do dia',
};

// Devolve a frase que o roteador do Pet entende, ou null (só conversa)
export function fraseDoApp(j) {
  switch (j?.acao) {
    case 'agendar': {
      const titulo = limpa(j.titulo);
      if (!titulo) return null;
      const hora = limpa(j.hora);
      const desc = limpa(j.texto);
      return ['agendar', titulo, limpa(j.quando), hora ? `às ${hora}` : '', desc ? `descrição ${desc}` : ''].filter(Boolean).join(' ');
    }
    case 'marcar_feito':
    case 'desmarcar_feito': {
      const titulo = limpa(j.titulo);
      if (!titulo) return null;
      const quando = /^hoje$/i.test(limpa(j.quando)) ? '' : limpa(j.quando);
      return [j.acao === 'marcar_feito' ? 'fiz' : 'desmarca', titulo, quando].filter(Boolean).join(' ');
    }
    case 'excluir':
      return limpa(j.titulo) ? `apaga ${limpa(j.titulo)} de ${limpa(j.quando) || 'hoje'}${j.todas ? ' todas' : ''}` : null;
    case 'agua': {
      const n = Math.round(Number(j.numero) || 0);
      if (n <= 0 && j.campo !== 'definir') return null;
      const quando = limpa(j.quando) || 'hoje';
      if (j.campo === 'tirar') return `tira ${n} ml da água de ${quando}`;
      if (j.campo === 'definir') return n ? `minha água de ${quando} foi ${n} ml` : `zera a água de ${quando}`;
      return `bebi ${n} ml de água ${quando}`;
    }
    case 'sono': {
      const quando = limpa(j.quando);
      const hora = /^\d{1,2}:\d{2}$/.test(limpa(j.hora)) ? limpa(j.hora) : '';
      const n = Math.round(Number(j.numero) || 0);
      if (j.campo === 'acordei' && hora) return `acordei às ${hora} ${quando}`.trim();
      if (j.campo === 'dormi' && hora) return `dormi às ${hora} ${quando}`.trim();
      if (j.campo === 'cochilo') return n ? `cochilei ${n} min ${quando}`.trim() : null;
      if (j.campo === 'madrugada') return `fiquei acordado ${n} min de madrugada ${quando}`.trim();
      return null;
    }
    case 'nota': {
      const quando = limpa(j.quando) || 'hoje';
      if (j.campo === 'apagar') return `apaga a nota de ${quando}`;
      const texto = limpa(j.texto);
      if (!texto || j.campo === 'preencher') return `preenche a nota de ${quando}`;
      return `anota na nota de ${quando} que ${j.campo === 'melhorar' ? 'melhorar: ' : ''}${texto}`;
    }
    case 'consultar_dia': {
      const quando = limpa(j.quando) || 'hoje';
      if (/semana/i.test(quando)) return /que vem|pr[oó]xima/i.test(quando) ? 'minha agenda da semana que vem' : 'minha agenda da semana';
      return j.campo === 'passado' ? `o que eu fiz ${quando}` : `o que tenho ${quando}?`;
    }
    case 'notas_periodo': {
      const periodo = limpa(j.quando || j.periodo) || 'últimos 7 dias';
      const oque = j.campo === 'falhas' ? 'falhas' : j.campo === 'melhorias' ? 'melhorias' : 'anotações';
      return `quais minhas ${oque} ${/^(ultimos|últimos)/i.test(periodo) ? 'nos' : 'de'} ${periodo}`;
    }
    case 'converter': {
      const nome = limpa(j.titulo), quando = limpa(j.quando), ini = limpa(j.hora), fim = limpa(j.texto);
      if (!nome) return null;
      const vira = /tarefa|atividade/i.test(j.campo || '') ? 'tarefa' : 'compromisso';
      const faixa = ini ? (fim ? ` das ${ini} às ${fim}` : ` às ${ini}`) : '';
      return `transforma ${nome}${quando ? ' de ' + quando : ''} em ${vira}${vira === 'compromisso' ? faixa : ''}`;
    }
    case 'configurar': {
      const nome = limpa(j.titulo), valor = limpa(j.texto), hora = limpa(j.hora) || valor;
      switch (j.campo) {
        case 'acordar_padrao': return hora ? `meu horário padrão de acordar é ${hora}` : null;
        case 'dormir_padrao': return hora ? `meu horário padrão de dormir é ${hora}` : null;
        case 'tema': return /clar|light/i.test(valor) ? 'muda pro tema claro' : /escur|dark/i.test(valor) ? 'muda pro tema escuro' : 'troca o tema';
        case 'abrir_tela': return valor ? `abre ${valor}` : null;
        case 'atividades_listar': return 'quais são minhas atividades';
        case 'atividade_criar': return nome ? `cria a atividade ${nome}` : null;
        case 'atividade_renomear': return nome && valor ? `renomeia a atividade ${nome} pra ${valor}` : null;
        case 'atividade_icone': return nome ? `troca o ícone da atividade ${nome} pra ${valor}`.trim() : null;
        case 'atividade_cor': return nome ? `muda a cor da atividade ${nome} pra ${valor}`.trim() : null;
        case 'atividade_excluir': return nome ? `apaga a atividade ${nome}` : null;
        default: return null;
      }
    }
    case 'desempenho': {
      const nome = limpa(j.titulo), quando = limpa(j.quando), texto = limpa(j.texto);
      const periodo = !quando ? '' : /^(ultimos|últimos)/i.test(quando) ? ` nos ${quando}` : /passad/i.test(quando) ? ` ${/semana/i.test(quando) ? 'da' : 'do'} ${quando}` : /^(esse|essa|este|esta|nesse|nessa|neste|nesta)\b/i.test(quando) ? ` ${quando}` : ` ${/semana/i.test(quando) ? 'essa' : 'esse'} ${quando.replace(/^(a|o)\s+/i, '')}`;
      const per = /m[eê]s/i.test(quando) ? 'mês' : 'semana';
      switch (j.campo) {
        case 'geral': return `meu desempenho${periodo || ' do mês'}`;
        case 'atividade': return nome ? `quantas vezes fiz ${nome}${periodo || ' esse mês'}` : null;
        case 'recorde': return 'meu recorde';
        case 'sono': return `média de sono${periodo || ' da semana'}`;
        case 'reflexao_ver': return `qual minha reflexão da semana${/passada/i.test(quando) ? ' passada' : ''}?`;
        case 'reflexao_anotar': return texto ? `reflexão da semana: ${texto}` : 'preenche a reflexão da semana';
        case 'objetivos_ver': return 'como tão meus objetivos?';
        case 'objetivo_criar': return nome && j.numero > 0 ? `cria um objetivo de ${nome} ${j.numero} vezes por ${per}` : null;
        case 'objetivo_mudar': return nome && j.numero > 0 ? `muda o objetivo de ${nome} pra ${j.numero} vezes por ${per}` : null;
        case 'objetivo_apagar': return nome ? `apaga o objetivo de ${nome}` : null;
        default: return null;
      }
    }
    case 'lista_adicionar': {
      const itens = juntar(j.itens);
      return itens ? `adiciona ${itens} na lista ${limpa(j.lista) || 'mercado'}` : null;
    }
    case 'lista_marcar': {
      const itens = juntar(j.itens);
      return itens ? `marca ${itens} como feito${limpa(j.lista) ? ` na lista ${limpa(j.lista)}` : ''}` : null;
    }
    case 'contas_pagar': {
      // Volta no formato que o leitor de contas entende: "contas a pagar: Luz - dia 10, Água - dia 15"
      const itens = (Array.isArray(j.itens) ? j.itens : []).map(limpa)
        .filter(i => /\bdia\s+\d{1,2}\b/i.test(i)).slice(0, 20);
      return itens.length ? `contas a pagar: ${itens.join(', ')}` : null;
    }
    case 'treino_frequencia':
      return j.numero >= 1 && j.numero <= 7 ? `treino ${j.numero} vezes por semana` : null;
    case 'consultar':
      return CONSULTA_FRASE[j.consulta] || null;
    default:
      return null;
  }
}
