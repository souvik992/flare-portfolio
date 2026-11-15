import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Facebook, Globe, Instagram, Loader2, RotateCcw } from 'lucide-react';
import heroCharacterScene from './assets/images/hero_character_clean_1794682347026.jpg';
import { AnimatedFlares } from './components/AnimatedFlares';
import { CharacterMotionCanvas } from './components/CharacterMotionCanvas';

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
  const [chatError, setChatError] = useState('');

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
    };
  }, [cancelCurrentFade]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isSending]);

  const handleChatSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || isSending) return;

    setChatError('');
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: trimmed,
    };

    setMessages((prev) => [...prev, userMsg]);
    setPrompt('');
    setIsSending(true);

    try {
      const response = await fetch('/api/chat', {
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
    } catch {
      setChatError('Connection error while reaching Souvik. Please try again.');
    } finally {
      setIsSending(false);
    }
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
          <AnimatedFlares imageAspectRatio={imageAspectRatio} />
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

      {/* Minimal brand header (navigation options, Sign Up, and Login removed) */}
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
                  setPrompt(e.target.value);
                  if (chatError) setChatError('');
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
            <p className="text-white/80 text-sm leading-relaxed px-4">
              Ask about projects, engineering, design, or anything you are curious about.
            </p>
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
    </div>
  );
}
