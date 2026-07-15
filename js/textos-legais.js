// ═══════════════════════════════════════════════════════════════
// VISÃO · Textos legais (Termos + Privacidade)
// Centralizados aqui pra reaproveitar nas telas /termos, /privacidade
// e no modal de aceite.
// IMPORTANTE: ao alterar conteúdo legal, incrementar TERMS_VERSION
// em consent.js pra forçar re-aceite.
// ═══════════════════════════════════════════════════════════════
// ─── ÍNDICE ──────────────────────────────────────────────────
// Arquivo único: Exporta textos completos dos Termos de Uso e Política de Privacidade
// ─────────────────────────────────────────────────────────────

export const VIGENCIA = '14 de julho de 2026';
export const CONTATO_DPO = 'elton.longaray483@gmail.com';
export const RESPONSAVEL = 'Élton de Oliveira Longaray';


// ═══════════════════════════════════════════════════════════════
// TERMOS DE USO
// ═══════════════════════════════════════════════════════════════
export const TERMOS_HTML = `
  <h1>Termos de Uso · Falcon</h1>
  <p class="legal-meta">Vigência: ${VIGENCIA}</p>

  <h2>1. O que é o Falcon</h2>
  <p>
    Falcon é um aplicativo pessoal de planejamento estratégico que ajuda você
    a organizar sua rotina, acompanhar hábitos e refletir sobre seu desempenho.
    Atualmente é um projeto pessoal, oferecido gratuitamente em fase de testes.
  </p>

  <h2>2. Cadastro e Conta</h2>
  <ul>
    <li>Você deve ter pelo menos <strong>18 anos</strong> pra usar o Falcon.</li>
    <li>Você é responsável pela veracidade dos dados que cadastrar.</li>
    <li>Você é responsável pela segurança do seu e-mail e senha. Não compartilhe sua senha com terceiros.</li>
    <li>Se desconfiar de acesso indevido, troque sua senha imediatamente.</li>
  </ul>

  <h2>3. Uso permitido</h2>
  <p>O Falcon deve ser usado exclusivamente para <strong>uso pessoal e não comercial</strong>.</p>
  <p>É proibido:</p>
  <ul>
    <li>Tentar acessar dados de outros usuários ou burlar a autenticação.</li>
    <li>Copiar, redistribuir ou fazer engenharia reversa do código do app.</li>
    <li>Usar o app pra qualquer atividade ilegal.</li>
  </ul>

  <h2>4. Conteúdo do usuário</h2>
  <p>
    Todo conteúdo que você cadastra no app (atividades, reflexões, rotinas) é seu.
    Você nos concede apenas o necessário pra exibir esse conteúdo pra você mesmo
    e gerar os gráficos/insights do app.
  </p>

  <h2>5. Disponibilidade do serviço</h2>
  <p>
    O Falcon é oferecido <strong>"como está"</strong>. Não garantimos disponibilidade
    100% do tempo nem ausência de bugs. Em caso de manutenção ou falhas, faremos
    o possível pra resolver rapidamente, mas não nos responsabilizamos por perdas
    de dados decorrentes de problemas técnicos ou força maior.
  </p>

  <h2>6. Encerramento</h2>
  <p>
    Você pode encerrar sua conta a qualquer momento pela tela de Ajustes do app
    ("Excluir minha conta"). Após o encerramento, todos os seus dados são
    removidos do nosso banco.
  </p>
  <p>
    Reservamo-nos o direito de suspender contas que violem estes Termos,
    com aviso prévio quando possível.
  </p>

  <h2>7. Alterações nos Termos</h2>
  <p>
    Podemos atualizar estes Termos a qualquer momento. Mudanças relevantes
    serão comunicadas com pelo menos <strong>7 dias de antecedência</strong>
    e exigirão novo aceite na próxima entrada do app.
  </p>

  <h2>8. Lei e Foro</h2>
  <p>
    Estes Termos seguem as leis brasileiras (Marco Civil da Internet, LGPD e
    Código de Defesa do Consumidor quando aplicável). Foro eleito: comarca de
    Porto Alegre/RS.
  </p>

  <h2>9. Contato</h2>
  <p>
    Para dúvidas, sugestões ou exercer seus direitos:
    <a href="mailto:${CONTATO_DPO}">${CONTATO_DPO}</a>
  </p>
`;


// ═══════════════════════════════════════════════════════════════
// POLÍTICA DE PRIVACIDADE
// ═══════════════════════════════════════════════════════════════
export const PRIVACIDADE_HTML = `
  <h1>Política de Privacidade · Falcon</h1>
  <p class="legal-meta">Vigência: ${VIGENCIA}</p>
  <p class="legal-meta">Base legal: Lei nº 13.709/2018 (LGPD)</p>

  <h2>1. Quem é o controlador</h2>
  <p>
    <strong>${RESPONSAVEL}</strong>, pessoa física, é o controlador dos seus
    dados pessoais. Também atuo como Encarregado pelo Tratamento de Dados (DPO):
    <a href="mailto:${CONTATO_DPO}">${CONTATO_DPO}</a>.
  </p>

  <h2>2. Quais dados coletamos</h2>
  <p><strong>2.1 Dados de cadastro:</strong></p>
  <ul>
    <li>E-mail (obrigatório)</li>
    <li>Nome (opcional, se entrar pelo Google)</li>
    <li>Data de criação da conta</li>
  </ul>

  <p><strong>2.2 Dados de uso (gerados por você):</strong></p>
  <ul>
    <li>Atividades cadastradas (nome, ícone, recorrência)</li>
    <li>Tarefas marcadas como feitas/não feitas por dia</li>
    <li>Horários de acordar e dormir, qualidade do sono</li>
    <li>Hidratação diária</li>
    <li>Reflexões semanais (texto livre)</li>
  </ul>

  <p>
    ⚠️ <strong>Atenção:</strong> dados de sono, hidratação e rotina podem ser
    enquadrados como <strong>dados pessoais sensíveis de saúde</strong> (Art. 5º, II
    da LGPD) e recebem proteção reforçada.
  </p>

  <p><strong>2.3 Dados técnicos:</strong></p>
  <ul>
    <li>Identificador de sessão (token de autenticação)</li>
    <li>Identificador da credencial biométrica (não a digital em si — apenas um ID)</li>
  </ul>

  <p><strong>2.4 Dados de contato e perfil (opcionais):</strong></p>
  <ul>
    <li>Nome completo e como você prefere ser chamado(a)</li>
    <li>Data de nascimento</li>
    <li>WhatsApp</li>
  </ul>
  <p>
    Esses dados são <strong>totalmente opcionais</strong> — o app funciona sem eles.
    Você pode preencher, editar ou remover a qualquer momento em <strong>Ajustes → Meu perfil</strong>.
  </p>

  <p><strong>2.5 Sugestões de melhoria:</strong> quando você envia uma sugestão pelo app, guardamos o texto enviado para aprimorar o Falcon.</p>

  <h2>3. Para que usamos seus dados</h2>
  <ul>
    <li>Permitir o login e a autenticação</li>
    <li>Exibir suas atividades, ritual e gráficos de desempenho</li>
    <li>Gerar insights personalizados (pontos fortes/fracos da semana)</li>
    <li>Entrar em contato para <strong>suporte e acompanhamento</strong>, quando você informa o WhatsApp</li>
    <li><strong>Parabenizá-lo(a) no seu aniversário</strong>, quando você informa a data de nascimento</li>
    <li>Convidar e manter você informado(a) sobre a <strong>comunidade Falcon Hunters</strong></li>
    <li>Aprimorar o app a partir das <strong>sugestões de melhoria</strong> que você envia</li>
    <li>Cumprir obrigações legais quando houver</li>
  </ul>
  <p><strong>Não usamos seus dados pra publicidade, perfilamento comercial ou venda a terceiros.</strong></p>

  <h2>4. Base legal do tratamento</h2>
  <ul>
    <li><strong>Consentimento</strong> (Art. 7º, I e Art. 11, I LGPD): você nos autoriza expressamente ao aceitar esta Política e os Termos no cadastro.</li>
    <li><strong>Execução de contrato</strong> (Art. 7º, V): tratamentos necessários pra uso do app que você solicitou.</li>
  </ul>

  <h2>5. Onde os dados ficam armazenados</h2>
  <p>
    Seus dados ficam no <strong>Supabase</strong> (banco de dados PostgreSQL),
    em datacenter localizado em <strong>São Paulo, Brasil</strong>.
    Toda transmissão é criptografada em HTTPS (TLS). O acesso é protegido por
    <strong>Row Level Security (RLS)</strong> — cada usuário só acessa os próprios dados.
  </p>
  <p>
    As notificações são entregues pela <strong>Cloudflare</strong>, que processa
    apenas o necessário para enviar o lembrete (título, horário e um identificador),
    sem acesso ao conteúdo da sua rotina.
  </p>

  <h2>6. Quem tem acesso</h2>
  <ul>
    <li><strong>Você</strong> — acesso completo aos seus próprios dados pelo app.</li>
    <li><strong>${RESPONSAVEL}</strong> — como administrador do projeto, tenho acesso técnico ao banco de dados pra manutenção. Não acessamos seus dados rotineiramente.</li>
    <li><strong>Supabase</strong> — como operador, hospeda o banco de dados conforme nossas instruções.</li>
    <li><strong>Cloudflare</strong> — como operador, processa apenas o envio das notificações.</li>
    <li><strong>Autoridades</strong> — apenas mediante ordem judicial válida.</li>
  </ul>
  <p>Não compartilhamos seus dados com nenhum outro terceiro.</p>

  <h2>7. Por quanto tempo guardamos</h2>
  <p>
    Enquanto sua conta existir. Ao excluir sua conta no app, todos os seus dados
    são <strong>removidos do banco</strong> imediatamente (incluindo atividades,
    rotinas, reflexões, configurações).
  </p>
  <p>
    Backups do Firebase podem reter dados por até 30 dias adicionais antes do
    descarte definitivo.
  </p>

  <h2>8. Seus direitos (Art. 18 LGPD)</h2>
  <p>Você pode, a qualquer momento:</p>
  <ul>
    <li>Confirmar se tratamos seus dados</li>
    <li>Acessar seus dados</li>
    <li>Corrigir dados incompletos ou desatualizados</li>
    <li>Exportar seus dados em formato legível (JSON e PDF disponíveis no Ajustes)</li>
    <li>Excluir sua conta e seus dados</li>
    <li>Revogar o consentimento (encerra a conta)</li>
    <li>Apresentar reclamação à ANPD (<a href="https://www.gov.br/anpd" target="_blank" rel="noopener">gov.br/anpd</a>)</li>
  </ul>
  <p>
    Como exercer: principalmente <strong>pelo próprio app</strong> (tela de Ajustes).
    Ou via e-mail: <a href="mailto:${CONTATO_DPO}">${CONTATO_DPO}</a>.
  </p>

  <h2>9. Segurança</h2>
  <p>Adotamos as seguintes medidas técnicas:</p>
  <ul>
    <li>Autenticação obrigatória via Firebase Auth</li>
    <li>Regras de isolamento (cada usuário só acessa seus próprios dados)</li>
    <li>Bloqueio biométrico opcional (Face ID, digital ou senha do celular)</li>
    <li>Transmissão criptografada (HTTPS/TLS)</li>
    <li>Sem armazenamento de senha em texto plano (Firebase hash padrão)</li>
  </ul>

  <h2>10. Cookies e armazenamento local</h2>
  <p>
    Usamos <strong>localStorage</strong> do navegador apenas pra guardar suas
    preferências (tema, configuração de biometria, sessão de login).
    <strong>Não usamos cookies de rastreamento, analytics nem publicidade.</strong>
  </p>

  <h2>11. Menores de idade</h2>
  <p>
    O Falcon não é destinado a menores de 18 anos. Se identificarmos cadastro de
    menor, removeremos os dados.
  </p>

  <h2>12. Alterações nesta Política</h2>
  <p>
    Mudanças relevantes serão comunicadas com pelo menos 7 dias de antecedência
    e poderão exigir novo aceite.
  </p>

  <h2>13. Contato e Encarregado (DPO)</h2>
  <p>
    <strong>${RESPONSAVEL}</strong><br>
    E-mail: <a href="mailto:${CONTATO_DPO}">${CONTATO_DPO}</a>
  </p>
`;


// ═══════════════════════════════════════════════════════════════
// TEXTO RESUMO PARA O MODAL DE ACEITE (signup + retroativo)
// ═══════════════════════════════════════════════════════════════
export const RESUMO_CONSENT = `
  Ao continuar você declara que tem 18 anos ou mais e concorda com os
  <strong>Termos de Uso</strong> e a <strong>Política de Privacidade</strong>,
  incluindo o tratamento de <strong>dados sensíveis de saúde</strong>
  (sono, hidratação, rotinas) necessários pra uso do app.
`;

export const RESUMO_PESSOAL = `
  Esta seção coleta dados sobre suas <strong>rotinas, sono e hidratação</strong> —
  considerados <strong>dados sensíveis de saúde</strong> pela LGPD.
  Eles serão usados apenas pra mostrar seus gráficos e insights.
  Você pode exportar ou apagar tudo a qualquer momento.
`;
