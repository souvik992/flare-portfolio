import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  Facebook,
  FileText,
  Globe,
  Instagram,
  Loader2,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import heroCharacterScene from './assets/images/hero_character_clean_1794682347026.jpg';
import { AnimatedFlares } from './components/AnimatedFlares';
import { CharacterMotionCanvas } from './components/CharacterMotionCanvas';

// Backend for the "Ask Souvik" chat. GitHub Pages only serves static files, so the
// Express server (server.ts) must be hosted elsewhere and its URL provided at build
// time via VITE_API_BASE_URL. Empty means same origin (local `npm run dev`).
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
const apiUrl = (path: string) => `${API_BASE}${path}`;
const BACKEND_MISSING = import.meta.env.PROD && !API_BASE;
const BACKEND_MISSING_MSG =
  "The chat backend isn't connected on this deployment yet. Please check back soon!";

const FADE_DURATION_MS = 500;

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

export default function App() {
  const bgLayerRef = useRef<HTMLDivElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const currentOpacityRef = useRef<number>(0);

  const [useStaticFallback, setUseStaticFallback] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageAspectRatio, setImageAspectRatio] = useState<number>(16 / 9);

  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [interactionId, setInteractionId] = useState<string | undefined>(undefined);
  const [isSending, setIsSending] = useState(false);
  const [isUserTyping, setIsUserTyping] = useState(false);
  const [replyPulseCount, setReplyPulseCount] = useState(0);
  const [chatError, setChatError] = useState('');
  const typingTimeoutRef = useRef<number | null>(null);

  const [resumeModalOpen, setResumeModalOpen] = useState(false);
  const [hasResume, setHasResume] = useState(false);
  const [resumeFilename, setResumeFilename] = useState('');
  const [resumeDraft, setResumeDraft] = useState('');
  const [isSavingResume, setIsSavingResume] = useState(false);
  const [resumeError, setResumeError] = useState('');
  const [resumeNotice, setResumeNotice] = useState('');

  const cancelCurrentFade = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const fadeInBackground = useCallback(
    (aspect?: number) => {
      if (aspect && Number.isFinite(aspect)) {
        setImageAspectRatio(aspect);
      }

      const layer = bgLayerRef.current;
      if (!layer) return;

      cancelCurrentFade();
      const startOpacity = currentOpacityRef.current;
      if (startOpacity >= 0.999) {
        currentOpacityRef.current = 1;
        layer.style.opacity = '1';
        return;
      }

      const startTime = performance.now();

      const step = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / FADE_DURATION_MS, 1);
        const nextOpacity = startOpacity + (1 - startOpacity) * progress;

        currentOpacityRef.current = nextOpacity;
        if (bgLayerRef.current) {
          bgLayerRef.current.style.opacity = String(nextOpacity);
        }

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(step);
        } else {
          rafRef.current = null;
        }
      };

      rafRef.current = requestAnimationFrame(step);
    },
    [cancelCurrentFade]
  );

  useEffect(() => {
    if (bgLayerRef.current) {
      bgLayerRef.current.style.opacity = '0';
    }

    return () => {
      cancelCurrentFade();
      if (typingTimeoutRef.current !== null) {
        window.clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [cancelCurrentFade]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isSending]);

  useEffect(() => {
    if (BACKEND_MISSING) return;
    let active = true;
    fetch(apiUrl('/api/resume'))
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data: {
            hasResume?: boolean;
            filename?: string;
            resumeText?: string;
          } | null
        ) => {
          if (!active || !data) return;
          if (data.hasResume) {
            setHasResume(true);
            setResumeFilename(data.filename || 'Resume');
            setResumeDraft(data.resumeText || '');
          }
        }
      )
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const handleResumeFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (BACKEND_MISSING) {
      setResumeError(BACKEND_MISSING_MSG);
      return;
    }

    setResumeError('');
    setResumeNotice('');
    setIsSavingResume(true);

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      const response = await fetch(apiUrl('/api/resume'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64: base64,
          mimeType: file.type || 'application/pdf',
          filename: file.name,
        }),
      });

      const payload = (await response.json()) as {
        hasResume?: boolean;
        filename?: string;
        resumeText?: string;
        error?: string;
      };

      if (!response.ok || !payload.hasResume) {
        setResumeError(payload.error || 'Could not process resume file.');
        return;
      }

      setHasResume(true);
      setResumeFilename(payload.filename || file.name);
      setResumeDraft(payload.resumeText || '');
      setInteractionId(undefined);
      setResumeNotice(`Loaded "${payload.filename || file.name}" into Souvik's memory.`);
    } catch {
      setResumeError('Failed to upload resume. Please try again.');
    } finally {
      setIsSavingResume(false);
      e.target.value = '';
    }
  };

  const handleSaveResumeText = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (BACKEND_MISSING) {
      setResumeError(BACKEND_MISSING_MSG);
      return;
    }
    if (!resumeDraft.trim()) {
      setResumeError('Please upload a file or paste your resume text.');
      return;
    }

    setResumeError('');
    setResumeNotice('');
    setIsSavingResume(true);

    try {
      const response = await fetch(apiUrl('/api/resume'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: resumeDraft.trim(),
          filename: resumeFilename || 'Resume Text',
        }),
      });

      const payload = (await response.json()) as {
        hasResume?: boolean;
        filename?: string;
        resumeText?: string;
        error?: string;
      };

      if (!response.ok || !payload.hasResume) {
        setResumeError(payload.error || 'Could not save resume.');
        return;
      }

      setHasResume(true);
      setResumeFilename(payload.filename || 'Resume Text');
      setResumeDraft(payload.resumeText || resumeDraft.trim());
      setInteractionId(undefined);
      setResumeNotice('Resume saved — Souvik will now answer using your resume.');
    } catch {
      setResumeError('Network error while saving resume.');
    } finally {
      setIsSavingResume(false);
    }
  };

  const handleClearResume = async () => {
    setResumeError('');
    setResumeNotice('');
    setIsSavingResume(true);
    try {
      await fetch(apiUrl('/api/resume'), { method: 'DELETE' });
      setHasResume(false);
      setResumeFilename('');
      setResumeDraft('');
      setInteractionId(undefined);
      setResumeNotice('Resume cleared.');
    } catch {
      setResumeError('Failed to clear resume.');
    } finally {
      setIsSavingResume(false);
    }
  };

  const sendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || isSending) return;

    setChatError('');
    setIsUserTyping(false);
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: trimmed,
    };

    setMessages((prev) => [...prev, userMsg]);
    setPrompt('');

    if (BACKEND_MISSING) {
      setChatError(BACKEND_MISSING_MSG);
      return;
    }

    setIsSending(true);

    try {
      const response = await fetch(apiUrl('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          previousInteractionId: interactionId,
        }),
      });

      const payload = (await response.json()) as {
        reply?: string;
        interactionId?: string;
        error?: string;
      };

      if (!response.ok || !payload.reply) {
        setChatError(payload.error || 'Unable to get a response right now.');
        return;
      }

      if (payload.interactionId) {
        setInteractionId(payload.interactionId);
      }

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: payload.reply,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setReplyPulseCount((c) => c + 1);
    } catch {
      setChatError('Connection error while reaching Souvik. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const handleChatSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await sendMessage(prompt);
  };

  const handleClearChat = () => {
    setMessages([]);
    setInteractionId(undefined);
    setChatError('');
  };

  const hasConversation = messages.length > 0 || isSending;

  return (
    <div className="relative min-h-screen bg-black overflow-hidden flex flex-col">
      {/* Full-screen animated character background scene with volumetric flowing flares */}
      {!imageError ? (
        <div
          ref={bgLayerRef}
          style={{ opacity: 0 }}
          className="absolute inset-0 pointer-events-none select-none overflow-hidden"
        >
          {!useStaticFallback ? (
            <CharacterMotionCanvas
              imageSrc={heroCharacterScene}
              isUserTyping={isUserTyping}
              isThinking={isSending}
              replyPulseCount={replyPulseCount}
              onReady={(aspect) => fadeInBackground(aspect)}
              onFallback={() => setUseStaticFallback(true)}
            />
          ) : (
            <img
              src={heroCharacterScene}
              alt="Souvik typing at laptop surrounded by glowing light flares and yellow lilies"
              referrerPolicy="no-referrer"
              onLoad={(e) => {
                const target = e.currentTarget;
                const aspect =
                  target.naturalWidth > 0 && target.naturalHeight > 0
                    ? target.naturalWidth / target.naturalHeight
                    : 16 / 9;
                fadeInBackground(aspect);
              }}
              onError={() => setImageError(true)}
              className="w-full h-full object-cover object-center translate-y-[4%]"
            />
          )}
          <AnimatedFlares
            imageAspectRatio={imageAspectRatio}
            isThinking={isSending}
            replyPulseCount={replyPulseCount}
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/30"
          />
        </div>
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(56,189,248,0.12),transparent_65%)] pointer-events-none"
        />
      )}

      {/* Minimal brand header with Resume feed button */}
      <header className="relative z-20 pl-6 pr-6 py-6">
        <div className="rounded-full px-6 py-3 flex items-center justify-between max-w-5xl mx-auto">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              handleClearChat();
            }}
            className="flex items-center gap-2 text-white font-semibold text-lg whitespace-nowrap shrink-0"
          >
            <Globe size={24} className="text-white" />
            <span>Souvik</span>
          </a>

          <button
            type="button"
            onClick={() => {
              setResumeError('');
              setResumeNotice('');
              setResumeModalOpen(true);
            }}
            className="liquid-glass rounded-full px-4 py-2 text-white/90 hover:text-white hover:bg-white/5 transition-colors inline-flex items-center gap-2 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileText size={14} />
            <span>{hasResume ? 'Resume Loaded' : 'Feed Resume'}</span>
          </button>
        </div>
      </header>

      {/* Hero AI chat area */}
      <main
        className={`relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-12 text-center transition-transform duration-300 ${
          hasConversation ? '-translate-y-[8%]' : '-translate-y-[20%]'
        }`}
      >
        <h1
          className="text-5xl md:text-6xl lg:text-7xl text-white mb-8 tracking-tight whitespace-nowrap"
          style={{ fontFamily: "'Instrument Serif', serif" }}
        >
          Inside a curious mind
        </h1>

        <div className="max-w-xl w-full space-y-3">
          {hasConversation && (
            <div className="liquid-glass rounded-3xl p-4 bg-black/55 text-left">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-xs font-medium text-white/60">Conversation</span>
                <button
                  type="button"
                  onClick={handleClearChat}
                  aria-label="Clear conversation"
                  className="inline-flex items-center gap-1 text-xs text-white/60 hover:text-white transition-colors cursor-pointer"
                >
                  <RotateCcw size={12} />
                  <span>Reset</span>
                </button>
              </div>
              <div
                ref={chatScrollRef}
                className="max-h-44 overflow-y-auto space-y-2.5 pr-1"
              >
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-white/15 text-white'
                          : 'bg-white/5 text-white/90'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isSending && (
                  <div className="flex justify-start">
                    <div
                      role="status"
                      aria-live="polite"
                      className="inline-flex items-center gap-2 rounded-2xl px-4 py-2 bg-white/5 text-xs text-white/75"
                    >
                      <Loader2 size={14} className="motion-safe:animate-spin text-sky-200/80" />
                      <span className="thinking-pulse">Souvik is thinking...</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleChatSubmit}>
            <div className="liquid-glass rounded-full pl-6 pr-2 py-2 flex items-center gap-3">
              <input
                type="text"
                value={prompt}
                onChange={(e) => {
                  const next = e.target.value;
                  setPrompt(next);
                  if (chatError) setChatError('');
                  setIsUserTyping(next.trim().length > 0);
                  if (typingTimeoutRef.current !== null) {
                    window.clearTimeout(typingTimeoutRef.current);
                  }
                  typingTimeoutRef.current = window.setTimeout(() => {
                    setIsUserTyping(false);
                  }, 650);
                }}
                placeholder="Ask Souvik anything..."
                aria-label="Ask Souvik"
                className="flex-1 min-w-0 bg-transparent text-white placeholder:text-white/40 text-base outline-none"
              />
              <button
                type="submit"
                disabled={isSending || !prompt.trim()}
                aria-label="Send message to Souvik"
                className="bg-white rounded-full p-3 text-black hover:bg-white/90 transition-colors shrink-0 disabled:opacity-60 cursor-pointer"
              >
                {isSending ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <ArrowRight size={20} />
                )}
              </button>
            </div>
            {chatError && (
              <p role="alert" className="mt-2 text-xs px-4 text-rose-300">
                {chatError}
              </p>
            )}
          </form>

          {!hasConversation && (
            <div className="space-y-3 px-4">
              <p className="text-white/75 text-sm leading-relaxed">
                {hasResume
                  ? 'Ask about my experience, projects, or skills—grounded in my resume.'
                  : 'Move your cursor or click anywhere in the night sky, or ask a question below.'}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-xs text-white/60">
                {(hasResume
                  ? [
                      'Walk me through your experience',
                      'What projects have you built?',
                      'What is your core tech stack?',
                    ]
                  : [
                      'What are you building right now?',
                      'Share your design philosophy',
                      'What sparks your curiosity?',
                    ]
                ).map((suggestion, idx) => (
                  <React.Fragment key={suggestion}>
                    {idx > 0 && <span aria-hidden="true">·</span>}
                    <button
                      type="button"
                      onClick={() => sendMessage(suggestion)}
                      className="hover:text-white underline decoration-white/25 underline-offset-4 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {suggestion}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Social icons footer */}
      <footer className="relative z-10 flex justify-center gap-4 pb-12">
        <a
          href="https://www.facebook.com/souvik.gayen.825344/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Souvik on Facebook"
          className="liquid-glass rounded-full p-4 text-white/80 hover:text-white hover:bg-white/5 transition-all"
        >
          <Facebook size={20} />
        </a>
        <a
          href="https://www.instagram.com/souvikg_official/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Souvik on Instagram"
          className="liquid-glass rounded-full p-4 text-white/80 hover:text-white hover:bg-white/5 transition-all"
        >
          <Instagram size={20} />
        </a>
      </footer>

      {resumeModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-6"
          onClick={() => setResumeModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Feed resume data"
            onClick={(e) => e.stopPropagation()}
            className="liquid-glass rounded-3xl max-w-lg w-full p-8 text-white bg-black/85 space-y-5"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2
                  className="text-3xl tracking-tight text-white"
                  style={{ fontFamily: "'Instrument Serif', serif" }}
                >
                  Feed Resume Data
                </h2>
                <p className="text-xs text-white/60 mt-1">
                  {hasResume
                    ? `Active source: ${resumeFilename}`
                    : 'Upload a PDF, TXT, MD, or paste your resume text below.'}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close resume dialog"
                onClick={() => setResumeModalOpen(false)}
                className="liquid-glass rounded-full p-2 text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <label className="liquid-glass rounded-2xl p-4 flex items-center justify-center gap-3 cursor-pointer hover:bg-white/5 transition-colors text-center">
              <input
                type="file"
                accept=".pdf,.txt,.md,image/*"
                onChange={handleResumeFileUpload}
                disabled={isSavingResume}
                className="sr-only"
              />
              {isSavingResume ? (
                <>
                  <Loader2 size={18} className="animate-spin text-white/80" />
                  <span className="text-sm text-white/80">Processing resume...</span>
                </>
              ) : (
                <>
                  <Upload size={18} className="text-white/75" />
                  <span className="text-sm text-white/85">
                    Upload Resume (PDF, TXT, MD, or image)
                  </span>
                </>
              )}
            </label>

            <form onSubmit={handleSaveResumeText} className="space-y-4">
              <div className="liquid-glass rounded-2xl p-4">
                <textarea
                  rows={6}
                  value={resumeDraft}
                  onChange={(e) => setResumeDraft(e.target.value)}
                  placeholder="Or paste your resume text here (experience, projects, skills, education)..."
                  aria-label="Resume text"
                  className="w-full bg-transparent text-white placeholder:text-white/40 text-xs leading-relaxed outline-none resize-none"
                />
              </div>

              {resumeError && (
                <p role="alert" className="text-xs text-rose-300">
                  {resumeError}
                </p>
              )}

              {resumeNotice && (
                <p role="status" className="text-xs text-emerald-300 inline-flex items-center gap-1.5">
                  <Check size={14} />
                  <span>{resumeNotice}</span>
                </p>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={isSavingResume || !resumeDraft.trim()}
                  className="flex-1 bg-white text-black rounded-full py-2.5 text-sm font-medium hover:bg-white/90 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Save Resume Context
                </button>
                {hasResume && (
                  <button
                    type="button"
                    onClick={handleClearResume}
                    disabled={isSavingResume}
                    aria-label="Clear saved resume"
                    className="liquid-glass rounded-full px-4 py-2.5 text-white/75 hover:text-white hover:bg-white/5 transition-colors inline-flex items-center gap-1.5 text-xs cursor-pointer"
                  >
                    <Trash2 size={14} />
                    <span>Clear</span>
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
