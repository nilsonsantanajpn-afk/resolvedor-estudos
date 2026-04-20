# Resolvedor — Estudos

Web app acadêmico que resolve exercícios via foto e narra a resposta em áudio.

**Stack:** HTML/CSS/JavaScript vanilla (frontend) + Vercel Serverless Function (backend) + Claude API (Anthropic) + MathJax + Web Speech API.

---

## Arquitetura

```
┌──────────────┐      POST /api/resolve      ┌─────────────────┐
│   Frontend   │ ─────────────────────────▶ │  Serverless     │
│ (index.html) │                             │  (api/resolve)  │
└──────────────┘                             └────────┬────────┘
                                                      │
                                                      ▼
                                             ┌─────────────────┐
                                             │  Claude API     │
                                             │  (Anthropic)    │
                                             └─────────────────┘
```

A API key fica **apenas no backend** como variável de ambiente no Vercel, nunca exposta no código cliente.

---

## Deploy no Vercel (passo a passo)

### 1. Colocar o projeto no GitHub

```bash
cd resolvedor-app
git init
git add .
git commit -m "Initial commit: resolvedor de estudos"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/resolvedor-estudos.git
git push -u origin main
```

### 2. Importar no Vercel

1. Acesse [vercel.com/new](https://vercel.com/new)
2. Selecione o repositório `resolvedor-estudos`
3. Framework Preset: **Other** (é projeto estático + serverless)
4. Build Command: deixe vazio
5. Output Directory: deixe vazio
6. **Não clique em Deploy ainda** — vamos configurar a variável de ambiente primeiro

### 3. Configurar a API key

Ainda na tela de importação:

1. Expanda **Environment Variables**
2. Adicione:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** sua chave `sk-ant-...`
3. Clique em **Add**
4. Agora sim, clique em **Deploy**

### 4. Pronto

O Vercel vai construir e publicar. Em cerca de 1 minuto você recebe uma URL do tipo `https://resolvedor-estudos.vercel.app`.

---

## Desenvolvimento local (opcional)

Se quiser rodar localmente antes de publicar:

```bash
# Instalar dependências
npm install

# Instalar CLI do Vercel (uma vez)
npm install -g vercel

# Criar arquivo de ambiente local
echo "ANTHROPIC_API_KEY=sua_chave_aqui" > .env.local

# Rodar servidor local
vercel dev
```

Acesse `http://localhost:3000`.

---

## Estrutura de arquivos

```
resolvedor-app/
├── api/
│   └── resolve.js        # Serverless function que chama a Claude API
├── index.html            # Frontend completo (HTML + CSS + JS)
├── package.json          # Dependência: @anthropic-ai/sdk
├── vercel.json           # Config de timeout da função
├── .gitignore            # Protege .env e node_modules
└── README.md             # Este arquivo
```

---

## Como funciona

1. Usuário tira foto ou anexa PDF do exercício
2. Frontend converte para base64 e envia `POST /api/resolve`
3. Backend valida (tamanho, tipo), instancia o SDK da Anthropic com a key protegida
4. Claude Sonnet 4.5 faz OCR + raciocínio em uma única chamada (Vision Language Model)
5. Retorna JSON estruturado: questões, dados, passos (com LaTeX), resposta final, narração em áudio
6. Frontend renderiza os cálculos com MathJax e monta a fila de reprodução de áudio
7. Web Speech API narra cada questão 2 vezes (configurável) com velocidade ajustável

---

## Segurança

- API key **nunca** aparece no código cliente (navegador)
- Variável de ambiente protegida pelo Vercel
- Validação de tipo de arquivo e tamanho no backend
- Limite de tamanho para evitar abuso (10 MB)

---

## Limitações conhecidas

- **iOS Safari:** a Web Speech API pode pausar quando a tela bloqueia. Para escutar com tela apagada, seria preciso migrar para TTS em backend (ElevenLabs, OpenAI TTS) gerando MP3.
- **Vozes em português:** qualidade varia por dispositivo/navegador. No iPhone, as vozes Siri são as melhores — selecione em "Voz" no canto superior direito.
- **Custo:** cada resolução consome tokens da API (~poucos centavos por exercício). Monitore em [console.anthropic.com](https://console.anthropic.com).

---

## Créditos

Projeto acadêmico desenvolvido com Claude API (Anthropic) · MathJax · Web Speech API · Vercel Serverless.
# Deploy trigger seg 20 abr 2026 19:33:26 -03
