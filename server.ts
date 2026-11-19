import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(__dirname, 'data');
const RESUME_FILE = path.join(DATA_DIR, 'souvik-resume.json');

interface StoredResume {
  filename: string;
  resumeText: string;
  updatedAt: string;
}

interface ChatRequestBody {
  message?: string;
  previousInteractionId?: string;
}

interface ResumeUploadBody {
  fileBase64?: string;
  mimeType?: string;
  filename?: string;
  rawText?: string;
}

async function readStoredResume(): Promise<StoredResume | null> {
  try {
    const raw = await fs.readFile(RESUME_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoredResume>;
    if (typeof parsed.resumeText === 'string' && parsed.resumeText.trim().length > 0) {
      return {
        filename: parsed.filename || 'Resume',
        resumeText: parsed.resumeText.trim(),
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function writeStoredResume(data: StoredResume): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(RESUME_FILE, JSON.stringify(data, null, 2), 'utf8');
}

async function clearStoredResume(): Promise<void> {
  try {
    await fs.unlink(RESUME_FILE);
  } catch {
    // Ignore if already absent
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '20mb' }));

  // Allow the static frontend (e.g. GitHub Pages) to call this API from another origin.
  // Set ALLOWED_ORIGINS to a comma-separated list, e.g. "https://souvik992.github.io".
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.use('/api', (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.get('/api/resume', async (_req, res) => {
    const stored = await readStoredResume();
    if (!stored) {
      res.json({ hasResume: false });
      return;
    }

    res.json({
      hasResume: true,
      filename: stored.filename,
      updatedAt: stored.updatedAt,
      resumeText: stored.resumeText,
    });
  });

  app.delete('/api/resume', async (_req, res) => {
    await clearStoredResume();
    res.json({ hasResume: false });
  });

  app.post('/api/resume', async (req, res) => {
    try {
      const { fileBase64, mimeType, filename, rawText } = (req.body || {}) as ResumeUploadBody;

      if (typeof rawText === 'string' && rawText.trim().length > 0) {
        const stored: StoredResume = {
          filename: filename?.trim() || 'Pasted Resume',
          resumeText: rawText.trim(),
          updatedAt: new Date().toISOString(),
        };
        await writeStoredResume(stored);
        res.json({ hasResume: true, ...stored });
        return;
      }

      if (!fileBase64 || typeof fileBase64 !== 'string') {
        res.status(400).json({ error: 'Please upload a resume file or paste your resume text.' });
        return;
      }

      const cleanBase64 = fileBase64.replace(/^data:[^;]+;base64,/, '');
      const safeFilename = filename?.trim() || 'Uploaded Resume';
      const lowerName = safeFilename.toLowerCase();
      const mime = (mimeType || '').toLowerCase();

      // Plain text or Markdown resumes can be decoded directly without an API roundtrip
      if (
        mime === 'text/plain' ||
        mime === 'text/markdown' ||
        lowerName.endsWith('.txt') ||
        lowerName.endsWith('.md')
      ) {
        const decoded = Buffer.from(cleanBase64, 'base64').toString('utf8').trim();
        if (!decoded) {
          res.status(400).json({ error: 'The uploaded text file is empty.' });
          return;
        }
        const stored: StoredResume = {
          filename: safeFilename,
          resumeText: decoded,
          updatedAt: new Date().toISOString(),
        };
        await writeStoredResume(stored);
        res.json({ hasResume: true, ...stored });
        return;
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.status(500).json({
          error:
            'GEMINI_API_KEY is required to extract PDF/image resumes. You can also paste your resume text directly.',
        });
        return;
      }

      const ai = new GoogleGenAI({ apiKey });
      const isImage = mime.startsWith('image/');
      const extractPrompt =
        'Extract all factual information from this resume verbatim into clean structured Markdown (name, contact/links if shown, summary, work experience with companies, roles, dates, and accomplishments, projects, technical skills, education, certifications). Do not invent or embellish anything.';

      const interaction = await ai.interactions.create({
        model: 'gemini-4-hydrogen',
        input: [
          isImage
            ? {
                type: 'image',
                mime_type: mime || 'image/png',
                data: cleanBase64,
              }
            : {
                type: 'document',
                mime_type: 'application/pdf',
                data: cleanBase64,
              },
          {
            type: 'text',
            text: extractPrompt,
          },
        ],
      });

      const extracted = interaction.output_text?.trim();
      if (!extracted) {
        res.status(502).json({
          error: 'Could not extract text from this file. Try pasting your resume text instead.',
        });
        return;
      }

      const stored: StoredResume = {
        filename: safeFilename,
        resumeText: extracted,
        updatedAt: new Date().toISOString(),
      };
      await writeStoredResume(stored);
      res.json({ hasResume: true, ...stored });
    } catch (err: unknown) {
      const errorObj = err as { status?: number; message?: string };
      const status = typeof errorObj?.status === 'number' ? errorObj.status : 500;
      const rawMessage = errorObj?.message || 'Failed to process resume.';
      res.status(status >= 400 && status < 600 ? status : 500).json({ error: rawMessage });
    }
  });

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

      const storedResume = await readStoredResume();
      const basePersona =
        'You are Souvik—a curious, thoughtful engineer, product builder, and designer. Speak in first person ("I", "my") when answering visitors about your work and background. Answer clearly, warmly, and concisely in natural conversational prose (2-4 sentences unless more detail is requested).';

      const systemInstruction = storedResume
        ? `${basePersona}\n\nGround all factual answers about your background, work experience, roles, companies, projects, skills, and education strictly in the resume below. If a visitor asks about something not covered in the resume, say so honestly instead of guessing.\n\n--- SOUVIK'S RESUME (${storedResume.filename}) ---\n${storedResume.resumeText}`
        : basePersona;

      const ai = new GoogleGenAI({ apiKey });

      const interaction = await ai.interactions.create({
        model: 'gemini-4-hydrogen',
        input: message.trim(),
        system_instruction: systemInstruction,
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
