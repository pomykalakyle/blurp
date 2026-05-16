// @ts-nocheck
import { useEffect, useState } from 'react';

export function useTTS() {
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, []);
  const speak = (text) => {
    if (!text || typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;
    u.onend = () => { setSpeaking(false); setPaused(false); };
    u.onerror = () => { setSpeaking(false); setPaused(false); };
    window.speechSynthesis.speak(u);
    setSpeaking(true); setPaused(false);
  };
  const pause = () => { window.speechSynthesis?.pause(); setPaused(true); };
  const resume = () => { window.speechSynthesis?.resume(); setPaused(false); };
  const stop = () => { window.speechSynthesis?.cancel(); setSpeaking(false); setPaused(false); };
  return { speaking, paused, speak, pause, resume, stop };
}
