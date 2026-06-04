# 👁 Visão — Consultor Pessoal de Planejamento Estratégico

> App PWA para organizar rotina diária e acompanhar desempenho de hábitos.
> Login, sincronização entre dispositivos, gráficos de aderência, reflexões semanais.

## 👥 Integrantes
- Élton de Oliveira Longaray — [@eltonlongaray](https://github.com/eltonlongaray)

## 📋 Descrição do Projeto

Visão é um PWA mobile-first construído para personalizar e acompanhar rotinas diárias com base em três pilares:

- ✅ **Atividades** — biblioteca de tipos de prática (Treino, Estudo, Meditação...) com recorrência por dia da semana
- ✅ **Ritual** — view semanal navegável, 7 dias com tarefas, edição inline, drag-drop
- ✅ **Desempenho** — gráficos % por categoria, qualidade do sono, trajetória semanal com reflexões
- ✅ **Lembretes** — central na Home com tarefas marcadas com 🔔 da semana atual + próxima

## 🎯 O Que Foi Entregue

### Frontend (PWA)
| Item | Status | Arquivo |
|------|--------|---------|
| Login + signup (e-mail/senha + Google) | ✅ | `js/screens/login.js`, `signup.js` |
| Home — biblioteca de atividades + lembretes + preferências de sono | ✅ | `js/screens/home.js` |
| Ritual — week view com 7 dias colapsáveis | ✅ | `js/screens/ritual.js` |
| Desempenho — gráficos + trajetória por ano | ✅ | `js/screens/desempenho.js` |
| Paleta dia/noite (toggle) | ✅ | `css/styles.css`, `js/theme.js` |
| PWA installable + offline cache | ✅ | `manifest.json`, `sw.js` |

### Backend (Firebase)
| Componente | Status |
|------------|--------|
| Authentication (e-mail/senha + Google) | ✅ |
| Firestore (dados por usuário) | ✅ |
| Security Rules (cada uid acessa só seus dados) | ✅ |

## 🏗️ Arquitetura Técnica

```
USUÁRIO
   ↓ (login)
FRONTEND (HTML/CSS/JS · Modular ES6)
   ├── js/main.js          → entry point + auth state
   ├── js/router.js        → hash routing
   ├── js/firebase.js      → SDK + config
   ├── js/store.js         → data layer (CRUD Firestore)
   ├── js/theme.js         → dia/noite
   ├── js/toast.js         → notificações
   └── js/screens/*        → telas (login, home, ritual, desempenho, welcome)
   ↓ (HTTPS)
FIREBASE
   ├── Auth        → identidade
   └── Firestore   → /users/{uid}/{shifts|categories|days/{date}/tasks|weeks|...}
```

## 📁 Estrutura de Diretórios

```
visao-app/
├── README.md                # Este arquivo
├── index.html               # Entry point HTML + PWA meta
├── manifest.json            # PWA manifest
├── sw.js                    # Service Worker (offline cache)
├── firestore.rules          # Regras de segurança
├── css/
│   └── styles.css           # Tema dia/noite + componentes
├── js/
│   ├── main.js              # Auth state + rotas
│   ├── router.js            # Roteador hash
│   ├── firebase.js          # Init Firebase SDK
│   ├── firebase-config.js   # Credenciais (público por design)
│   ├── theme.js             # Gerenciador de tema
│   ├── toast.js             # Toast + modal de confirmação
│   ├── store.js             # CRUD Firestore (10 blocos)
│   ├── components/
│   │   └── bottom-nav.js    # Nav inferior
│   └── screens/
│       ├── login.js
│       ├── signup.js
│       ├── welcome.js       # Escolha de template (após signup)
│       ├── home.js          # Biblioteca + lembretes + sono
│       ├── ritual.js        # Week view
│       └── desempenho.js    # Gráficos + trajetória
└── icons/                   # PWA icons (192, 512, maskable)
```

## ⚙️ Como Executar

### Pré-requisitos
- Python 3.10+ (para servir local) **ou** qualquer HTTP server estático
- Conta Firebase com projeto configurado (já incluído em `firebase-config.js`)

### Local
```bash
# Subir servidor local na porta 5173
python -m http.server 5173

# Abrir no navegador
http://localhost:5173
```

### Online (GitHub Pages)
Acesse: **https://eltonlongaray.github.io/visao/**

## ✅ Checklist de Verificação

- ☐ Servidor responde em `http://localhost:5173`
- ☐ Login com e-mail/senha funciona
- ☐ Cria atividade na Home
- ☐ Tarefas aparecem automaticamente no Ritual conforme `daysOfWeek`
- ☐ Marca tarefa como feita (👍) — mostra mensagem motivacional
- ☐ Desempenho carrega gráficos
- ☐ Toggle dia/noite funciona
- ☐ Pode ser instalado como PWA no celular

## ❌ Troubleshooting

### "Carregando Visão..." trava
- Hard refresh (Ctrl+Shift+R) ou abrir em InPrivate
- Causa comum: cache de módulos ES antigos

### "Missing or insufficient permissions"
- As regras do Firestore não foram publicadas
- Solução: aplicar conteúdo de `firestore.rules` no console Firebase

### Tarefas não auto-geram nas semanas seguintes
- Confirme que a atividade tem `daysOfWeek` configurado (Home → ✏️)
- O sistema só gera tarefas em dias **virgens** (que ainda não foram abertos)

## 📌 Versões

- **1.0.0** — 2026-06-05 — MVP completo
  - ✅ Auth + Home + Ritual + Desempenho
  - ✅ Template por dia da semana
  - ✅ Lembretes (centralizados)
  - ✅ Reflexão semanal
  - ✅ PWA installable
  - ✅ Tema dia/noite

## 📋 Licença

Uso pessoal. © 2026 Élton Longaray.

## 🎯 Próximas Etapas

- ☐ Wizard de boas-vindas pra novos usuários
- ☐ Notificações push reais (precisa Firebase Cloud Messaging)
- ☐ Integração com IA + WhatsApp
- ☐ Templates pré-prontos (Estudos, Bem-estar)

---

**Visão · MVP · 2026-06-05**

*"Sua rotina, sob o seu olhar."*
