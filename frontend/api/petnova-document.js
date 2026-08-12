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

function parseJsonObject(text) {
  const cleanText = String(text ?? '').trim();

  try {
    return JSON.parse(cleanText);
  } catch {
    const match = cleanText.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error('La IA no devolvio un JSON valido.');
    }
    return JSON.parse(match[0]);
  }
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
    const { type = 'Instructivo', draft = {} } = request.body ?? {};
    const safeType = ['Registro', 'Procedimiento', 'Instructivo'].includes(type) ? type : 'Instructivo';
    const draftText = JSON.stringify(draft).slice(0, 10000);

    const openaiResponse = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        max_output_tokens: 2200,
        input: [
          {
            role: 'system',
            content: [
              'Eres especialista en documentacion ISO 9001 para PETnova/Empacar.',
              'Tu tarea es enriquecer borradores de documentos controlados sin inventar datos tecnicos no entregados.',
              'Escribe en espanol formal, claro y operativo.',
              'Devuelve exclusivamente JSON valido, sin markdown.',
              'El JSON debe tener estas claves exactas: code, title, version, owner, process, objective, scope, responsibilities, steps, records.',
              'steps debe ser un texto con una instruccion por linea.',
              'Si falta un dato, redacta de forma general y deja campos administrativos sin inventar nombres propios.',
            ].join(' '),
          },
          {
            role: 'user',
            content: `Tipo de documento: ${safeType}\nBorrador ingresado por el usuario:\n${draftText}`,
          },
        ],
      }),
    });

    const data = await openaiResponse.json();

    if (!openaiResponse.ok) {
      response.status(openaiResponse.status).json({
        error: data?.error?.message ?? 'OpenAI no pudo generar el documento.',
      });
      return;
    }

    const generated = parseJsonObject(extractOutputText(data));

    response.status(200).json({
      document: {
        code: String(generated.code ?? draft.code ?? ''),
        title: String(generated.title ?? draft.title ?? ''),
        version: String(generated.version ?? draft.version ?? 'Rev.0'),
        owner: String(generated.owner ?? draft.owner ?? ''),
        process: String(generated.process ?? draft.process ?? ''),
        objective: String(generated.objective ?? draft.objective ?? ''),
        scope: String(generated.scope ?? draft.scope ?? ''),
        responsibilities: String(generated.responsibilities ?? draft.responsibilities ?? ''),
        steps: String(generated.steps ?? draft.steps ?? ''),
        records: String(generated.records ?? draft.records ?? ''),
      },
    });
  } catch (error) {
    response.status(500).json({ error: error.message ?? 'Error inesperado generando el documento.' });
  }
}
