import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

interface ChatRequestBody {
  message?: string;
  previousInteractionId?: string;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.post('/api/chat', async (req, res) => {
    try {
      const { message, previousInteractionId } = (req.body || {}) as ChatRequestBody;

      if (!message || typeof message !== 'string' || !message.trim()) {
        res.status(400).json({ error: 'Please enter a message to ask Souvik.' });
        return;
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.status(500).json({
          error: 'GEMINI_API_KEY is not configured on the server. Please add it in Settings > Secrets.',
        });
        return;
      }

      const ai = new GoogleGenAI({ apiKey });

      const interaction = await ai.interactions.create({
        model: 'gemini-4-hydrogen',
        input: message.trim(),
        system_instruction:
          'You are Souvik—a curious, thoughtful engineer, product builder, and designer. Answer visitors clearly, warmly, and concisely in natural conversational prose (2-4 sentences unless more detail is requested).',
        ...(typeof previousInteractionId === 'string' && previousInteractionId.trim()
          ? { previous_interaction_id: previousInteractionId.trim() }
          : {}),
      });

      const reply = interaction.output_text?.trim();
      if (!reply) {
        res.status(502).json({ error: 'No response was generated. Please try again.' });
        return;
      }

      res.json({
        reply,
        interactionId: interaction.id,
      });
    } catch (err: unknown) {
      const errorObj = err as { status?: number; message?: string };
      const status = typeof errorObj?.status === 'number' ? errorObj.status : 500;
      const rawMessage = errorObj?.message || 'Unable to generate a response right now.';

      let friendlyMessage = rawMessage;
      if (status === 403 || rawMessage.includes('PERMISSION_DENIED') || rawMessage.includes('API_KEY_INVALID')) {
        friendlyMessage = 'Invalid or unauthorized Gemini API key. Please check Settings > Secrets.';
      } else if (status === 429 || rawMessage.includes('RESOURCE_EXHAUSTED')) {
        friendlyMessage = 'Rate limit reached. Please wait a moment and try again.';
      }

      res.status(status >= 400 && status < 600 ? status : 500).json({ error: friendlyMessage });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
