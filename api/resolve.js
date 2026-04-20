import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_PROMPT = `Voce e um professor universitario resolvendo exercicios para um aluno que vai ESCUTAR a resposta em audio sem olhar a tela. Identifique TODAS as questoes do documento e, para cada uma, resolva passo a passo.

REGRAS ABSOLUTAS:
1. SEMPRE mostre o calculo passo a passo quando a questao envolver matematica, fisica, quimica, engenharia ou qualquer calculo numerico
2. Mostre: formula original, substituicao de valores, operacoes intermediarias, resultado
3. Nao pule etapas. Prefira mostrar mais passos do que menos
4. Se a questao for puramente teorica (sem calculo), retorne apenas a resposta em texto

REGRAS CRITICAS PARA A NARRACAO DE AUDIO (o aluno vai escutar sem ver a tela):
- A narracao deve ser 100% autossuficiente e clara para quem SO ESCUTA
- Comece cada questao anunciando: "Questao numero um..." (sempre por extenso: um, dois, tres)
- Leia enunciado em voz natural antes de comecar a resolver
- Liste os DADOS em voz alta: "Temos os seguintes dados. Velocidade inicial igual a dez metros por segundo. Aceleracao igual a dois metros por segundo ao quadrado. Tempo igual a cinco segundos."
- Traduza TODAS as formulas para linguagem verbal completa:
  * "v = v0 + a*t" vira "velocidade final e igual a velocidade inicial mais aceleracao vezes tempo"
  * Fracoes: "\\\\frac{a}{b}" vira "a dividido por b" ou "a sobre b"
  * Potencias: "x^2" vira "x ao quadrado", "x^3" vira "x ao cubo", "x^5" vira "x elevado a cinco"
  * Raizes: "sqrt{x}" vira "raiz quadrada de x"
  * Subscritos: "v_0" vira "v zero" ou "velocidade inicial"
- Numeros importantes soletre por extenso na PRIMEIRA mencao: em vez de "20 m/s" escreva "vinte metros por segundo"
- Use pontuacao clara: ponto final no fim de cada passo, virgulas para pausas curtas
- Narre cada operacao em voz alta: "Vamos substituir os valores. V e igual a dez mais dois vezes cinco. Resolvendo a multiplicacao primeiro, dois vezes cinco e igual a dez. Entao temos v igual a dez mais dez, que resulta em vinte."
- No final de cada questao, DESTAQUE a resposta: "Portanto, a resposta da questao um e: a velocidade final e vinte metros por segundo. Vinte metros por segundo e a resposta final."

FORMATO DE SAIDA: retorne APENAS um JSON valido, sem markdown, sem fences de codigo. JSON puro.

Estrutura:
{
  "questoes": [
    {
      "numero": "1",
      "enunciado": "texto do enunciado",
      "tipo": "calculo" ou "teorica",
      "dados": "lista dos dados em texto plano, ou null",
      "passos": [
        {
          "descricao": "o que esta sendo feito neste passo",
          "latex": "expressao matematica em LaTeX sem delimitadores, ou null"
        }
      ],
      "resposta_final_latex": "resposta em LaTeX sem cifrao, ou null",
      "resposta_final_texto": "resposta em texto claro",
      "narracao_audio": "narracao COMPLETA e AUTOSSUFICIENTE desta questao, seguindo todas as regras acima. Deve permitir que alguem feche os olhos e entenda tudo so escutando."
    }
  ]
}

IMPORTANTE: no JSON, use barras duplas para comandos LaTeX. Retorne SOMENTE o JSON, nada antes nem depois.`;

export default async function handler(req, res) {
  // CORS (permite chamadas do mesmo domínio e facilita debug)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  // Verifica se a API key está configurada no ambiente
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY não configurada no ambiente');
    return res.status(500).json({
      error: 'Servidor não configurado. Verifique as variáveis de ambiente no Vercel.'
    });
  }

  try {
    const { fileData, mediaType } = req.body;

    if (!fileData || !mediaType) {
      return res.status(400).json({ error: 'Dados do arquivo faltando.' });
    }

    // Valida tamanho (base64 ~ 1.37x do original; limite pragmático de 10MB original)
    const approxSize = (fileData.length * 3) / 4;
    if (approxSize > 10 * 1024 * 1024) {
      return res.status(413).json({ error: 'Arquivo muito grande. Máximo 10MB.' });
    }

    // Valida tipos
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (!allowedTypes.includes(mediaType)) {
      return res.status(400).json({ error: 'Tipo de arquivo não suportado.' });
    }

    const isImage = mediaType.startsWith('image/');
    const contentBlock = isImage
      ? {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: fileData }
        }
      : {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: fileData }
        };

    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            contentBlock,
            {
              type: 'text',
              text: 'Resolva os exercicios deste documento retornando no formato JSON especificado. Mostre todos os calculos passo a passo e prepare a narracao de audio completa e autossuficiente.'
            }
          ]
        }
      ]
    });

    // Extrai texto da resposta
    const rawText = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    // Limpa possíveis fences de markdown
    const cleanText = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/, '')
      .replace(/```\s*$/, '')
      .trim();

    // Parse do JSON
    let parsed;
    try {
      parsed = JSON.parse(cleanText);
    } catch (e) {
      // Fallback: tenta encontrar objeto JSON dentro do texto
      const match = cleanText.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        console.error('Falha no parse do JSON. Resposta:', cleanText.slice(0, 500));
        return res.status(502).json({
          error: 'A IA retornou formato inválido. Tente novamente com outra imagem.'
        });
      }
    }

    if (!parsed.questoes || !Array.isArray(parsed.questoes)) {
      return res.status(502).json({ error: 'Resposta sem questões válidas.' });
    }

    return res.status(200).json({ questoes: parsed.questoes });
  } catch (err) {
    console.error('Erro na chamada da API:', err);

    // Mensagens específicas por tipo de erro
    if (err.status === 401) {
      return res.status(500).json({
        error: 'Credenciais inválidas no servidor. Contate o administrador.'
      });
    }
    if (err.status === 429) {
      return res.status(429).json({
        error: 'Limite de requisições atingido. Aguarde alguns segundos e tente novamente.'
      });
    }
    if (err.status === 400) {
      return res.status(400).json({
        error: 'Imagem não pôde ser processada. Tente uma foto mais nítida.'
      });
    }

    return res.status(500).json({
      error: 'Erro ao processar o exercício. Tente novamente.'
    });
  }
}

// Config: permite corpo maior (até 10MB base64 ~ 13MB)
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '15mb'
    }
  }
};
