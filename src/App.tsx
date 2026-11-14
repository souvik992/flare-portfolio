import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Globe, Instagram, Twitter, X, Check, Film, Upload, Loader2 } from 'lucide-react';
import heroCharacterScene from './assets/images/hero_character_scene_1794675476056.jpg';
import { AnimatedFlares } from './components/AnimatedFlares';
import { CharacterMotionCanvas } from './components/CharacterMotionCanvas';

const FADE_DURATION_MS = 500;
const FADE_OUT_LEAD_SEC = 0.55;
const LOOP_RESTART_DELAY_MS = 100;

type ModalKind = 'manifesto' | 'animate' | 'features' | 'pricing' | 'about' | 'signup' | 'login' | null;
type VideoAspectRatio = '16:9' | '9:16';

export default function App() {
  const bgLayerRef = useRef<HTMLDivElement | null>(null);
  const heroVideoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const restartTimeoutRef = useRef<number | null>(null);
  const fadingOutRef = useRef<boolean>(false);
  const currentOpacityRef = useRef<number>(0);

  const [useStaticFallback, setUseStaticFallback] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageAspectRatio, setImageAspectRatio] = useState<number>(16 / 9);
  const [email, setEmail] = useState('');
  const [emailStatus, setEmailStatus] = useState<'idle' | 'error' | 'success'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [activeModal, setActiveModal] = useState<ModalKind>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authSubmitted, setAuthSubmitted] = useState(false);

  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const [uploadBase64, setUploadBase64] = useState<string>('');
  const [uploadMimeType, setUploadMimeType] = useState<string>('image/jpeg');
  const [videoAspectRatio, setVideoAspectRatio] = useState<VideoAspectRatio>('16:9');
  const [motionPrompt, setMotionPrompt] = useState<string>(
    'Natural steady typing motion on the laptop keyboard, gentle breathing, and luminous golden and cyan light flares orbiting smoothly.'
  );
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoError, setVideoError] = useState<string>('');
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [heroVideoUrl, setHeroVideoUrl] = useState<string | null>(null);

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

  const animateHeroVideoOpacity = useCallback(
    (targetOpacity: number) => {
      const video = heroVideoRef.current;
      if (!video) return;

      cancelCurrentFade();
      const startOpacity = currentOpacityRef.current;
      if (Math.abs(targetOpacity - startOpacity) < 0.001) {
        currentOpacityRef.current = targetOpacity;
        video.style.opacity = String(targetOpacity);
        return;
      }

      const startTime = performance.now();
      const step = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / FADE_DURATION_MS, 1);
        const nextOpacity = startOpacity + (targetOpacity - startOpacity) * progress;

        currentOpacityRef.current = nextOpacity;
        if (heroVideoRef.current) {
          heroVideoRef.current.style.opacity = String(nextOpacity);
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
    if (heroVideoUrl && heroVideoRef.current) {
      currentOpacityRef.current = 0;
      heroVideoRef.current.style.opacity = '0';
      fadingOutRef.current = false;
    } else if (bgLayerRef.current) {
      bgLayerRef.current.style.opacity = '0';
    }

    return () => {
      cancelCurrentFade();
      if (restartTimeoutRef.current !== null) {
        window.clearTimeout(restartTimeoutRef.current);
      }
    };
  }, [cancelCurrentFade, heroVideoUrl]);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setVideoError('');
    setUploadMimeType(file.type || 'image/jpeg');

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      setUploadPreviewUrl(dataUrl);
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      setUploadBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateVideo = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!uploadBase64) {
      setVideoError('Please upload a photo first.');
      return;
    }

    setIsGeneratingVideo(true);
    setVideoError('');
    setGeneratedVideoUrl(null);

    try {
      const response = await fetch('/api/animate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: uploadBase64,
          mimeType: uploadMimeType,
          prompt: motionPrompt,
          aspectRatio: videoAspectRatio,
        }),
      });

      const payload = (await response.json()) as {
        videoBase64?: string;
        videoUri?: string;
        mimeType?: string;
        error?: string;
      };

      if (!response.ok) {
        setVideoError(payload.error || 'Video generation failed.');
        return;
      }

      if (payload.videoBase64) {
        const mime = payload.mimeType || 'video/mp4';
        setGeneratedVideoUrl(`data:${mime};base64,${payload.videoBase64}`);
      } else if (payload.videoUri) {
        setGeneratedVideoUrl(payload.videoUri);
      } else {
        setVideoError('No video data was returned.');
      }
    } catch {
      setVideoError('Network error while generating video. Please try again.');
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  const handleNewsletterSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = email.trim();
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);

    if (!isValid) {
      setEmailStatus('error');
      setStatusMessage('Please enter a valid email address.');
      return;
    }

    setEmailStatus('success');
    setStatusMessage(`You're on the list — updates will arrive at ${trimmed}.`);
    setEmail('');
  };

  const openModal = (kind: ModalKind) => {
    setAuthSubmitted(false);
    setAuthEmail('');
    setAuthPassword('');
    setVideoError('');
    setActiveModal(kind);
  };

  const handleAuthSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!authEmail.trim() || !authPassword.trim()) return;
    setAuthSubmitted(true);
  };

  return (
    <div className="relative min-h-screen bg-black overflow-hidden flex flex-col">
      {/* Full-screen animated character background scene or user-generated video */}
      {heroVideoUrl ? (
        <video
          ref={heroVideoRef}
          src={heroVideoUrl}
          autoPlay
          muted
          playsInline
          onLoadedData={() => {
            if (!fadingOutRef.current) animateHeroVideoOpacity(1);
          }}
          onPlay={() => {
            if (!fadingOutRef.current && currentOpacityRef.current < 1) {
              animateHeroVideoOpacity(1);
            }
          }}
          onTimeUpdate={() => {
            const v = heroVideoRef.current;
            if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return;
            if (v.duration - v.currentTime <= FADE_OUT_LEAD_SEC && !fadingOutRef.current) {
              fadingOutRef.current = true;
              animateHeroVideoOpacity(0);
            }
          }}
          onEnded={() => {
            const v = heroVideoRef.current;
            if (!v) return;
            cancelCurrentFade();
            currentOpacityRef.current = 0;
            v.style.opacity = '0';
            fadingOutRef.current = false;
            if (restartTimeoutRef.current !== null) {
              window.clearTimeout(restartTimeoutRef.current);
            }
            restartTimeoutRef.current = window.setTimeout(() => {
              const el = heroVideoRef.current;
              if (!el) return;
              el.currentTime = 0;
              el.play().catch(() => {});
              animateHeroVideoOpacity(1);
            }, LOOP_RESTART_DELAY_MS);
          }}
          style={{ opacity: 0 }}
          className="absolute inset-0 w-full h-full object-cover translate-y-[4%] pointer-events-none select-none"
        />
      ) : !imageError ? (
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
              alt="Curiosity workspace scene with person at laptop surrounded by glowing light ring and yellow lilies"
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

      {/* Navigation bar */}
      <header className="relative z-20 pl-6 pr-6 py-6">
        <div className="rounded-full px-6 py-3 flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-8">
            <a
              href="#top"
              onClick={(e) => {
                e.preventDefault();
                setActiveModal(null);
              }}
              className="flex items-center gap-2 text-white font-semibold text-lg whitespace-nowrap shrink-0"
            >
              <Globe size={24} className="text-white" />
              <span>Asme</span>
            </a>

            <nav className="hidden md:flex items-center gap-8">
              <button
                type="button"
                onClick={() => openModal('features')}
                className="text-white/80 hover:text-white transition-colors text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer"
              >
                Features
              </button>
              <button
                type="button"
                onClick={() => openModal('pricing')}
                className="text-white/80 hover:text-white transition-colors text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer"
              >
                Pricing
              </button>
              <button
                type="button"
                onClick={() => openModal('about')}
                className="text-white/80 hover:text-white transition-colors text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer"
              >
                About
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <button
              type="button"
              onClick={() => openModal('signup')}
              className="text-white hover:text-white/80 transition-colors text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer"
            >
              Sign Up
            </button>
            <button
              type="button"
              onClick={() => openModal('login')}
              className="liquid-glass rounded-full px-6 py-2 text-white text-sm font-medium hover:bg-white/5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Login
            </button>
          </div>
        </div>
      </header>

      {/* Hero content area */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-12 text-center -translate-y-[20%]">
        <h1
          className="text-5xl md:text-6xl lg:text-7xl text-white mb-8 tracking-tight whitespace-nowrap"
          style={{ fontFamily: "'Instrument Serif', serif" }}
        >
          Built for the curious
        </h1>

        <div className="max-w-xl w-full space-y-4">
          <form onSubmit={handleNewsletterSubmit} noValidate>
            <div className="liquid-glass rounded-full pl-6 pr-2 py-2 flex items-center gap-3">
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailStatus !== 'idle') {
                    setEmailStatus('idle');
                    setStatusMessage('');
                  }
                }}
                placeholder="Enter your email"
                aria-label="Email address"
                className="flex-1 min-w-0 bg-transparent text-white placeholder:text-white/40 text-base outline-none"
              />
              <button
                type="submit"
                aria-label="Subscribe to newsletter"
                className="bg-white rounded-full p-3 text-black hover:bg-white/90 transition-colors shrink-0 cursor-pointer"
              >
                <ArrowRight size={20} />
              </button>
            </div>
            {emailStatus !== 'idle' && (
              <p
                role="status"
                className={`mt-2 text-xs px-4 ${
                  emailStatus === 'error' ? 'text-rose-300' : 'text-white/90'
                }`}
              >
                {statusMessage}
              </p>
            )}
          </form>

          <p className="text-white text-sm leading-relaxed px-4">
            Stay updated with the latest news and insights. Subscribe to our newsletter today and
            never miss out on exciting updates.
          </p>

          <div className="flex flex-wrap justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => openModal('manifesto')}
              className="liquid-glass rounded-full px-8 py-3 text-white text-sm font-medium hover:bg-white/5 transition-colors cursor-pointer"
            >
              Manifesto
            </button>
            <button
              type="button"
              onClick={() => openModal('animate')}
              className="liquid-glass rounded-full px-6 py-3 text-white text-sm font-medium hover:bg-white/5 transition-colors inline-flex items-center gap-2 cursor-pointer"
            >
              <Film size={16} />
              <span>Animate Photo</span>
            </button>
          </div>
        </div>
      </main>

      {/* Social icons footer */}
      <footer className="relative z-10 flex justify-center gap-4 pb-12">
        <a
          href="#instagram"
          onClick={(e) => {
            e.preventDefault();
            openModal('about');
          }}
          aria-label="Follow Asme on Instagram"
          className="liquid-glass rounded-full p-4 text-white/80 hover:text-white hover:bg-white/5 transition-all"
        >
          <Instagram size={20} />
        </a>
        <a
          href="#twitter"
          onClick={(e) => {
            e.preventDefault();
            openModal('about');
          }}
          aria-label="Follow Asme on Twitter"
          className="liquid-glass rounded-full p-4 text-white/80 hover:text-white hover:bg-white/5 transition-all"
        >
          <Twitter size={20} />
        </a>
        <a
          href="#website"
          onClick={(e) => {
            e.preventDefault();
            openModal('manifesto');
          }}
          aria-label="Visit Asme web journal"
          className="liquid-glass rounded-full p-4 text-white/80 hover:text-white hover:bg-white/5 transition-all"
        >
          <Globe size={20} />
        </a>
      </footer>

      {/* Interactive liquid-glass dialog overlay */}
      {activeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-6"
          onClick={() => setActiveModal(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={activeModal}
            onClick={(e) => e.stopPropagation()}
            className="liquid-glass rounded-3xl max-w-lg w-full p-8 text-white bg-black/80"
          >
            <div className="flex items-center justify-between mb-6">
              <h2
                className="text-3xl tracking-tight text-white"
                style={{ fontFamily: "'Instrument Serif', serif" }}
              >
                {activeModal === 'manifesto' && 'Our Manifesto'}
                {activeModal === 'animate' && 'Animate Photo into Video'}
                {activeModal === 'features' && 'Features'}
                {activeModal === 'pricing' && 'Pricing'}
                {activeModal === 'about' && 'About Asme'}
                {activeModal === 'signup' && 'Create an account'}
                {activeModal === 'login' && 'Welcome back'}
              </h2>
              <button
                type="button"
                aria-label="Close dialog"
                onClick={() => setActiveModal(null)}
                className="liquid-glass rounded-full p-2 text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {activeModal === 'manifesto' && (
              <div className="space-y-4 text-sm text-white/80 leading-relaxed">
                <p>
                  Curiosity is the quiet engine behind every meaningful discovery. Asme is built as
                  a calm space for deep reading, original research, and slow thinking.
                </p>
                <p>
                  No algorithmic noise or endless feeds—just weekly dispatches crafted for people
                  who prefer depth over haste.
                </p>
              </div>
            )}

            {activeModal === 'animate' && (
              <form onSubmit={handleGenerateVideo} className="space-y-4">
                <label className="liquid-glass rounded-2xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-white/5 transition-colors text-center">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="sr-only"
                  />
                  {uploadPreviewUrl ? (
                    <img
                      src={uploadPreviewUrl}
                      alt="Uploaded photo preview"
                      referrerPolicy="no-referrer"
                      className="max-h-36 rounded-xl object-contain"
                    />
                  ) : (
                    <>
                      <Upload size={20} className="text-white/70" />
                      <span className="text-sm text-white/80">Choose a photo to animate</span>
                    </>
                  )}
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setVideoAspectRatio('16:9')}
                    className={`flex-1 rounded-full py-2 text-xs font-medium transition-colors cursor-pointer ${
                      videoAspectRatio === '16:9'
                        ? 'bg-white text-black'
                        : 'liquid-glass text-white/80 hover:text-white'
                    }`}
                  >
                    16:9 Landscape
                  </button>
                  <button
                    type="button"
                    onClick={() => setVideoAspectRatio('9:16')}
                    className={`flex-1 rounded-full py-2 text-xs font-medium transition-colors cursor-pointer ${
                      videoAspectRatio === '9:16'
                        ? 'bg-white text-black'
                        : 'liquid-glass text-white/80 hover:text-white'
                    }`}
                  >
                    9:16 Portrait
                  </button>
                </div>

                <div className="liquid-glass rounded-2xl px-4 py-3">
                  <textarea
                    rows={2}
                    value={motionPrompt}
                    onChange={(e) => setMotionPrompt(e.target.value)}
                    placeholder="Describe the motion you want..."
                    aria-label="Motion prompt"
                    className="w-full bg-transparent text-white placeholder:text-white/40 text-sm outline-none resize-none"
                  />
                </div>

                {videoError && (
                  <p role="alert" className="text-xs text-rose-300 leading-relaxed">
                    {videoError}
                  </p>
                )}

                {generatedVideoUrl && (
                  <div className="space-y-3">
                    <video
                      src={generatedVideoUrl}
                      controls
                      autoPlay
                      loop
                      playsInline
                      className="w-full max-h-56 rounded-2xl bg-black object-contain"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setHeroVideoUrl(generatedVideoUrl);
                        setActiveModal(null);
                      }}
                      className="w-full liquid-glass rounded-full py-2.5 text-xs font-medium text-white hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      Use as Hero Background
                    </button>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isGeneratingVideo}
                  className="w-full bg-white text-black rounded-full py-3 text-sm font-medium hover:bg-white/90 transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
                >
                  {isGeneratingVideo ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Generating Video...</span>
                    </>
                  ) : (
                    <span>Generate Video</span>
                  )}
                </button>
              </form>
            )}

            {activeModal === 'features' && (
              <div className="space-y-3 text-sm text-white/80 leading-relaxed">
                <p>
                  <span className="text-white font-medium">Weekly Dispatches</span> — Long-form
                  essays and field notes delivered every Sunday morning.
                </p>
                <p>
                  <span className="text-white font-medium">Living Archive</span> — Searchable
                  annotations and primary source collections.
                </p>
                <p>
                  <span className="text-white font-medium">Quiet Reader</span> — Distraction-free
                  typography designed for late-night reading.
                </p>
              </div>
            )}

            {activeModal === 'pricing' && (
              <div className="space-y-4 text-sm text-white/80 leading-relaxed">
                <p>
                  <span className="text-white font-medium">Reader (Free)</span> — Weekly newsletter
                  and public essays.
                </p>
                <p>
                  <span className="text-white font-medium">Patron ($8/month)</span> — Full archive
                  access, research dossiers, and salon invitations.
                </p>
              </div>
            )}

            {activeModal === 'about' && (
              <div className="space-y-4 text-sm text-white/80 leading-relaxed">
                <p>
                  Asme is an independent publication and research studio exploring science, craft,
                  and digital culture.
                </p>
                <p className="text-white/60">Reach us anytime via our weekly newsletter reply.</p>
              </div>
            )}

            {(activeModal === 'signup' || activeModal === 'login') && (
              <div>
                {authSubmitted ? (
                  <div className="flex items-center gap-3 text-sm text-white/90 py-2">
                    <span className="bg-white text-black rounded-full p-1.5">
                      <Check size={16} />
                    </span>
                    <span>
                      {activeModal === 'signup'
                        ? `Account request received for ${authEmail}.`
                        : `Signed in as ${authEmail}.`}
                    </span>
                  </div>
                ) : (
                  <form onSubmit={handleAuthSubmit} className="space-y-4">
                    <div className="liquid-glass rounded-full px-5 py-3">
                      <input
                        type="email"
                        required
                        value={authEmail}
                        onChange={(e) => setAuthEmail(e.target.value)}
                        placeholder="Email address"
                        className="w-full bg-transparent text-white placeholder:text-white/40 text-sm outline-none"
                      />
                    </div>
                    <div className="liquid-glass rounded-full px-5 py-3">
                      <input
                        type="password"
                        required
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                        placeholder="Password"
                        className="w-full bg-transparent text-white placeholder:text-white/40 text-sm outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full bg-white text-black rounded-full py-3 text-sm font-medium hover:bg-white/90 transition-colors cursor-pointer"
                    >
                      {activeModal === 'signup' ? 'Create Account' : 'Login'}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
