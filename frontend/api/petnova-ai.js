const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

function extractOutputText(responseData) {
  if (responseData?.output_text) {
    return responseData.output_text;
  }

  const outputItems = Array.isArray(responseData?.output) ? responseData.output : [];

  return outputItems
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .map((content) => content.text ?? '')
    .filter(Boolean)
    .join('\n')
    .trim();
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    response.status(405).json({ error: 'Metodo no permitido.' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    response.status(500).json({ error: 'Falta configurar OPENAI_API_KEY en Vercel.' });
    return;
  }

  try {
    const { messages = [], dataContext = {} } = request.body ?? {};
    const cleanMessages = Array.isArray(messages)
      ? messages
        .slice(-10)
        .map((message) => ({
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: String(message.content ?? '').slice(0, 3000),
        }))
      : [];

    const contextText = JSON.stringify(dataContext).slice(0, 28000);
    const conversationText = cleanMessages
      .map((message) => `${message.role === 'assistant' ? 'IA' : 'Usuario'}: ${message.content}`)
      .join('\n');

    const openaiResponse = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        max_output_tokens: 1200,
        input: [
          {
            role: 'system',
            content: [
              'Eres la IA interna de PETnova para calidad, produccion, almacen y sistema de gestion ISO 9001.',
              'Responde siempre en espanol, con tono claro y practico.',
              'Usa solamente los datos de contexto entregados por la aplicacion cuando hables de registros reales.',
              'Si falta informacion, dilo y sugiere que dato registrar o revisar.',
              'No inventes resultados de produccion, reclamos, defectos ni certificados.',
              'Cuando el usuario pida una grafica, primero da una frase corta y luego agrega un bloque fenced ```chart con JSON valido.',
              'El JSON de grafica debe tener type bar, line o pie; title; xLabel; yLabel; y data como lista de objetos { "label": "...", "value": numero }.',
              'Usa maximo 12 puntos por grafica y no pongas texto dentro del bloque chart.',
            ].join(' '),
          },
          {
            role: 'user',
            content: `Contexto actual de PETnova:\n${contextText}\n\nConversacion:\n${conversationText}`,
          },
/*  */        ],
      }),
    });

    const data = await openaiResponse.json();

    if (!openaiResponse.ok) {
      response.status(openaiResponse.status).json({
        error: data?.error?.message ?? 'OpenAI no pudo procesar la solicitud.',
      });
      return;
    }

    response.status(200).json({
      answer: extractOutputText(data) || 'No pude generar una respuesta con la informacion disponible.',
    });
  } catch (error) {
    response.status(500).json({ error: error.message ?? 'Error inesperado en la IA.' });
  }
}
