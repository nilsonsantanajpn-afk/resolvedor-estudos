import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_PROMPT = `Voce e um professor resolvendo exercicios para um aluno que vai ESCUTAR a resposta em audio.

REGRAS:
1. Para cada questao com calculo: mostre formula, substituicao de valores, operacoes, resultado final. Sem pular etapas.
2. Para questao teorica: resposta direta em texto.
3. Seja eficiente: clareza, nao verbosidade.

NARRACAO DE AUDIO (sera lida por voz sintetica):
- Comece cada questao com "Questao numero [um/dois/tres]..."
- Leia o enunciado de forma natural
- Liste dados em voz alta
- Traduza formulas: "v_0 + a*t" vira "v zero mais a vezes t"; "x^2" vira "x ao quadrado"; "\\\\frac{a}{b}" vira "a dividido por b"
- Numeros soletre por extenso na primeira mencao ("vinte metros por segundo")
- Narre operacoes em voz alta com pontuacao clara
- Finalize cada questao com "Portanto a resposta e [valor]."

FORMATO DE SAIDA: JSON puro, sem markdown, sem fences.

{
  "questoes": [
    {
      "numero": "1",
      "enunciado": "texto do enunciado",
      "tipo": "calculo" ou "teorica",
      "dados": "dados em texto, ou null",
      "passos": [
        { "descricao": "o que esta sendo feito", "latex": "formula em LaTeX sem cifrao, ou null" }
      ],
      "resposta_final_latex": "LaTeX sem cifrao, ou null",
      "resposta_final_texto": "resposta clara em texto",
      "narracao_audio": "narracao falada completa desta questao, sem LaTeX, sem simbolos"
    }
  ]
}

No JSON, use barras duplas para comandos LaTeX. Retorne SOMENTE o JSON.`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY não configurada');
    return res.status(500).json({
      error: 'Servidor não configurado. Contate o administrador.'
    });
  }

  try {
    const { fileData, mediaType } = req.body;

    if (!fileData || !mediaType) {
      return res.status(400).json({ error: 'Dados do arquivo faltando.' });
    }

    const approxSize = (fileData.length * 3) / 4;
    if (approxSize > 10 * 1024 * 1024) {
      return res.status(413).json({ error: 'Arquivo muito grande. Máximo 10MB.' });
    }

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

    // STREAMING: usa stream em vez de esperar resposta completa
    // - Evita timeout do Vercel Hobby (60s)
    // - Modelo começa a enviar tokens assim que tem, sem buffer total
    const stream = await client.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            contentBlock,
            {
              type: 'text',
              text: 'Resolva os exercicios deste documento no formato JSON especificado. Mostre todos os calculos passo a passo e prepare a narracao de audio.'
            }
          ]
        }
      ]
    });

    // Acumula o texto conforme chega (via stream)
    let fullText = '';
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        fullText += event.delta.text;
      }
    }

    // Limpa possíveis fences de markdown
    const cleanText = fullText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/, '')
      .replace(/```\s*$/, '')
      .trim();

    // Parse do JSON
    let parsed;
    try {
      parsed = JSON.parse(cleanText);
    } catch (e) {
      const match = cleanText.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch (e2) {
          console.error('Falha no parse do JSON. Resposta:', cleanText.slice(0, 500));
          return res.status(502).json({
            error: 'A IA retornou formato inválido. Tente novamente com outra imagem.'
          });
        }
      } else {
        console.error('JSON não encontrado. Resposta:', cleanText.slice(0, 500));
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

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '15mb'
    }
  }
};
