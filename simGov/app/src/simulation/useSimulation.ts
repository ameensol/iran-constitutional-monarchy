import { useReducer, useRef, useCallback, useEffect, useState } from 'react';
import type { GovState, GovAction, Headline } from './types';
import { createInitialState } from './initialState';
import { applyAction, findNextEventDay } from './engine';
import { getShahCommentary } from './shah/index';
import type { ShahCommentaryResult } from './shah/index';
import { generateHeadline } from '../dashboard/headlines';

export type PlaySpeed = 'paused' | 'step' | '0.25x' | '1x' | '10x' | '100x';

function reducer(state: GovState, action: GovAction): GovState {
  return applyAction(state, action);
}

/** How long before the banner auto-dismisses (ms) */
function getAutoDismissMs(speed: PlaySpeed): number {
  switch (speed) {
    case 'paused': case 'step': return 10000;
    case '0.25x': return 6000;
    case '1x':    return 5000;
    case '10x':   return 3000;
    case '100x':  return 2000;
  }
}

/** Minimum real-time gap between banners (ms) */
function getBannerCooldownMs(speed: PlaySpeed): number {
  switch (speed) {
    case 'paused': case 'step': return 0;
    case '0.25x': return 4000;
    case '1x':    return 3000;
    case '10x':   return 2000;
    case '100x':  return 5000;
  }
}

export interface SimulationControls {
  state: GovState;
  dispatch: React.Dispatch<GovAction>;
  speed: PlaySpeed;
  setSpeed: (speed: PlaySpeed) => void;
  skip: () => void;
  commentary: string | null;
  commentaryTrigger: string | null;
  clearCommentary: () => void;
  breakingHeadline: Headline | null;
  breakingAutoDismissMs: number;
  dismissBreaking: () => void;
}

export function useSimulation(): SimulationControls {
  const [state, dispatch] = useReducer(reducer, null, createInitialState);
  const [speed, setSpeedRaw] = useState<PlaySpeed>('paused');
  const [commentaryResult, setCommentaryResult] = useState<ShahCommentaryResult | null>(null);
  const [breakingHeadline, setBreakingHeadline] = useState<Headline | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevEventCountRef = useRef(state.events.length);
  const lastBannerTimeRef = useRef(0);

  // Check for new events and trigger commentary + breaking news
  useEffect(() => {
    if (state.events.length > prevEventCountRef.current) {
      const latestEvent = state.events[0];

      // Shah commentary
      const result = getShahCommentary(latestEvent, state);
      if (result) {
        setCommentaryResult(result);
      }

      // Breaking news banner (rate-limited)
      const headline = generateHeadline(latestEvent);
      if (headline.breaking) {
        const now = Date.now();
        const cooldown = getBannerCooldownMs(speed);
        if (now - lastBannerTimeRef.current >= cooldown) {
          setBreakingHeadline(headline);
          lastBannerTimeRef.current = now;
        }
      }
    }
    prevEventCountRef.current = state.events.length;
  }, [state.events, speed]);

  // Handle speed changes, including step mode
  const setSpeed = useCallback((newSpeed: PlaySpeed) => {
    if (newSpeed === 'step') {
      // Step mode: advance one day, then pause
      dispatch({ type: 'ADVANCE_DAY' });
      setSpeedRaw('paused');
    } else {
      setSpeedRaw(newSpeed);
    }
  }, []);

  // Auto-advance timer
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (speed === 'paused') return;

    const ms = speed === '0.25x' ? 4000 : speed === '1x' ? 1000 : speed === '10x' ? 100 : 10;
    intervalRef.current = setInterval(() => {
      dispatch({ type: 'ADVANCE_DAY' });
    }, ms);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [speed]);

  const skip = useCallback(() => {
    const targetDay = findNextEventDay(state);
    const steps = Math.min(targetDay - state.day, 120);
    for (let i = 0; i < steps; i++) {
      dispatch({ type: 'ADVANCE_DAY' });
    }
  }, [state]);

  const clearCommentary = useCallback(() => {
    setCommentaryResult(null);
  }, []);

  const dismissBreaking = useCallback(() => {
    setBreakingHeadline(null);
  }, []);

  return {
    state,
    dispatch,
    speed,
    setSpeed,
    skip,
    commentary: commentaryResult?.text ?? null,
    commentaryTrigger: commentaryResult?.trigger ?? null,
    clearCommentary,
    breakingHeadline,
    breakingAutoDismissMs: getAutoDismissMs(speed),
    dismissBreaking,
  };
}
