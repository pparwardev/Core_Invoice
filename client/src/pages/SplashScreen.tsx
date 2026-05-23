import { useEffect, useState } from 'react';

const APP_NAME = 'Core_Invoice';

const QUOTES = [
  "Every invoice tells a story of trust fulfilled.",
  "Accuracy today prevents disputes tomorrow.",
  "On-time payments build lasting partnerships.",
  "Great procurement starts with disciplined processes.",
  "Cash flow clarity drives confident decisions.",
  "A well-tracked PO is a promise kept.",
  "Vendor trust is earned one payment at a time.",
  "Financial precision powers operational excellence.",
  "Efficiency is paying the right amount, at the right time.",
  "Transparent processes create accountable teams."
];

export default function SplashScreen({ onFinish }: { onFinish: () => void }) {
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Initializing modules...');
  const [fadeOut, setFadeOut] = useState(false);
  const [visibleChars, setVisibleChars] = useState(0);
  const [showGlow, setShowGlow] = useState(false);
  const [currentQuote, setCurrentQuote] = useState(0);

  useEffect(() => {
    const steps = [
      { at: 20, text: 'Loading components...' },
      { at: 40, text: 'Loading vendor database...' },
      { at: 60, text: 'Syncing invoice records...' },
      { at: 80, text: 'Preparing dashboard...' },
      { at: 100, text: 'Ready!' },
    ];

    let current = 0;
    const interval = setInterval(() => {
      current += 1;
      if (current > 100) current = 100;
      setProgress(current);
      const step = steps.find((s) => s.at === current);
      if (step) setStatusText(step.text);
      if (current >= 100) clearInterval(interval);
    }, 95);

    // Animate title characters one by one (start after 800ms)
    let charIndex = 0;
    const charTimer = setTimeout(() => {
      const charInterval = setInterval(() => {
        charIndex++;
        setVisibleChars(charIndex);
        if (charIndex >= APP_NAME.length) {
          clearInterval(charInterval);
          setTimeout(() => setShowGlow(true), 300);
        }
      }, 100);
    }, 800);

    // Rotate quotes every 3 seconds
    const quoteInterval = setInterval(() => {
      setCurrentQuote((prev) => (prev + 1) % QUOTES.length);
    }, 3000);

    // After 10 seconds, fade out then finish
    const timer = setTimeout(() => {
      setFadeOut(true);
      setTimeout(() => {
        onFinish();
      }, 500);
    }, 10000);

    return () => {
      clearInterval(interval);
      clearInterval(quoteInterval);
      clearTimeout(timer);
      clearTimeout(charTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <style>{`
        @keyframes splashFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes splashGlow {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.5; }
        }
        @keyframes titleGlow {
          0%, 100% { text-shadow: 0 0 10px rgba(245,166,35,0.3), 0 0 20px rgba(245,166,35,0.1); }
          50% { text-shadow: 0 0 20px rgba(245,166,35,0.6), 0 0 40px rgba(245,166,35,0.3); }
        }
        @keyframes underlineReveal {
          0% { width: 0; }
          100% { width: 100%; }
        }
        @keyframes quoteFadeIn {
          0% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div style={{
        position: 'fixed',
        inset: 0,
        background: '#0a0a1a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        zIndex: 9999,
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        opacity: fadeOut ? 0 : 1,
        transition: 'opacity 0.5s ease',
      }}>
        {/* Background gradient circles */}
        <div style={{
          position: 'absolute',
          width: '400px',
          height: '400px',
          borderRadius: '50%',
          background: '#f59e0b',
          top: '-100px',
          right: '-100px',
          filter: 'blur(80px)',
          opacity: 0.3,
          animation: 'splashGlow 3s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute',
          width: '300px',
          height: '300px',
          borderRadius: '50%',
          background: '#4fc3f7',
          bottom: '-80px',
          left: '-80px',
          filter: 'blur(80px)',
          opacity: 0.3,
          animation: 'splashGlow 3s ease-in-out infinite 1.5s',
        }} />

        {/* Main content */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.5rem',
          zIndex: 1,
        }}>
          {/* Icon */}
          <div style={{
            width: '100px',
            height: '100px',
            borderRadius: '22px',
            overflow: 'hidden',
            boxShadow: '0 15px 50px rgba(245, 158, 11, 0.35)',
            animation: 'splashFloat 3s ease-in-out infinite',
          }}>
            <img
              src="/PO_Invoicing_App_Icon.ico"
              alt="Core Invoice"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => {
                const target = e.currentTarget;
                target.style.display = 'none';
                if (target.parentElement) {
                  target.parentElement.innerHTML = `
                    <div style="width:100%;height:100%;background:linear-gradient(135deg,#f59e0b,#fbbf24);display:flex;align-items:center;justify-content:center;">
                      <svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" stroke-width="1.5">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                      </svg>
                    </div>`;
                }
              }}
            />
          </div>

          {/* Animated App Name */}
          <div style={{ position: 'relative', marginTop: '0.5rem' }}>
            <div style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'center',
              animation: showGlow ? 'titleGlow 2s ease-in-out infinite' : 'none',
            }}>
              {APP_NAME.split('').map((char, i) => (
                <span
                  key={i}
                  style={{
                    display: 'inline-block',
                    fontSize: '2.8rem',
                    fontWeight: 800,
                    letterSpacing: '-0.5px',
                    color: char === '_' ? '#f59e0b' : i < 4 ? '#ffffff' : '#f59e0b',
                    opacity: i < visibleChars ? 1 : 0,
                    transform: i < visibleChars ? 'translateY(0) scale(1)' : 'translateY(-30px) scale(0.5)',
                    transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  }}
                >
                  {char}
                </span>
              ))}
            </div>
            {showGlow && (
              <div style={{
                height: '3px',
                background: 'linear-gradient(90deg, transparent, #f59e0b, #fbbf24, transparent)',
                borderRadius: '2px',
                marginTop: '6px',
                animation: 'underlineReveal 0.6s ease forwards',
                boxShadow: '0 0 12px rgba(245,166,35,0.4)',
              }} />
            )}
          </div>

          {/* Tagline */}
          <div style={{
            fontSize: '0.75rem',
            fontWeight: 500,
            color: '#8b949e',
            letterSpacing: '3px',
            textTransform: 'uppercase',
            opacity: showGlow ? 1 : 0,
            transform: showGlow ? 'translateY(0)' : 'translateY(10px)',
            transition: 'all 0.8s ease',
          }}>
            Precision in Every Payment
          </div>

          {/* Rotating Quotes */}
          <div style={{
            textAlign: 'center',
            marginTop: '1.5rem',
            height: '60px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: showGlow ? 1 : 0,
            transition: 'opacity 0.8s ease 0.3s',
          }}>
            <span style={{ fontSize: '1.3rem', color: '#f59e0b', marginBottom: '0.5rem' }}>❝</span>
            <p
              key={currentQuote}
              style={{
                fontSize: '0.85rem',
                fontStyle: 'italic',
                color: '#8b949e',
                margin: 0,
                animation: 'quoteFadeIn 0.6s ease',
              }}
            >
              {QUOTES[currentQuote]}
            </p>
          </div>
        </div>

        {/* Bottom section */}
        <div style={{
          position: 'absolute',
          bottom: '3rem',
          width: '280px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.75rem',
          zIndex: 1,
        }}>
          <div style={{ fontSize: '0.7rem', color: '#484f58', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
            {statusText}
          </div>
          <div style={{
            width: '100%',
            height: '3px',
            background: '#161b22',
            borderRadius: '2px',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #f59e0b, #fbbf24, #ff9500)',
              borderRadius: '2px',
              transition: 'width 0.1s linear',
              boxShadow: '0 0 10px rgba(245,166,35,0.4)',
            }} />
          </div>
          <div style={{ fontSize: '0.65rem', color: '#484f58', letterSpacing: '0.1em' }}>
            v1.0.0
          </div>
        </div>
      </div>
    </>
  );
}
