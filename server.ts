import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

interface AnimateVideoBody {
  imageBase64?: string;
  mimeType?: string;
  prompt?: string;
  aspectRatio?: string;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  app.post('/api/animate-video', async (req, res) => {
    try {
      const { imageBase64, mimeType, prompt, aspectRatio } = (req.body || {}) as AnimateVideoBody;

      if (!imageBase64 || typeof imageBase64 !== 'string') {
        res.status(400).json({ error: 'Please upload an image before generating a video.' });
        return;
      }

      const validMime =
        typeof mimeType === 'string' && mimeType.startsWith('image/')
          ? mimeType
          : 'image/jpeg';

      const selectedRatio: '16:9' | '9:16' = aspectRatio === '9:16' ? '9:16' : '16:9';

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.status(500).json({
          error:
            'GEMINI_API_KEY is not configured on the server. Add a billing-enabled Gemini API key in Settings > Secrets.',
        });
        return;
      }

      const ai = new GoogleGenAI({ apiKey });
      const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
      const motionPrompt =
        typeof prompt === 'string' && prompt.trim().length > 0
          ? prompt.trim()
          : 'Natural subtle typing motion, calm steady hands on keyboard, gentle breathing, and smooth luminous golden and cyan light flares orbiting gracefully around the scene.';

      const interaction = await ai.interactions.create(
        {
          model: 'gemini-omni-1.2-flash',
          input: [
            {
              type: 'image',
              mime_type: validMime,
              data: cleanBase64,
            },
            {
              type: 'text',
              text: motionPrompt,
            },
          ],
          background: false,
          store: false,
          stream: false,
          response_format: {
            type: 'video',
            aspect_ratio: selectedRatio,
          },
        },
        { timeout: 300000 }
      );

      const videoPart = interaction.output_video;
      if (!videoPart) {
        res.status(502).json({ error: 'Video generation returned no video output.' });
        return;
      }

      if (videoPart.data) {
        res.json({
          videoBase64: videoPart.data,
          mimeType: videoPart.mime_type || 'video/mp4',
          aspectRatio: selectedRatio,
        });
        return;
      }

      if (videoPart.uri) {
        res.json({
          videoUri: videoPart.uri,
          mimeType: videoPart.mime_type || 'video/mp4',
          aspectRatio: selectedRatio,
        });
        return;
      }

      res.status(502).json({ error: 'Generated video did not include playable data or URI.' });
    } catch (err: unknown) {
      const errorObj = err as { status?: number; message?: string };
      const status = typeof errorObj?.status === 'number' ? errorObj.status : 500;
      const rawMessage = errorObj?.message || 'Failed to generate video from image.';

      let friendlyMessage = rawMessage;
      if (status === 403 || rawMessage.includes('PERMISSION_DENIED')) {
        friendlyMessage =
          'Access denied for gemini-omni-1.2-flash. Please configure a billing-enabled GEMINI_API_KEY in Settings > Secrets.';
      } else if (status === 429 || rawMessage.includes('RESOURCE_EXHAUSTED')) {
        friendlyMessage =
          'Quota exhausted or paid tier required for gemini-omni-1.2-flash. Please select a billing-enabled API key in Settings > Secrets.';
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
