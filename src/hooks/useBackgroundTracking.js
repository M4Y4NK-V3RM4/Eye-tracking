import { useEffect, useRef } from 'react';

export function useBackgroundTracking(isActive) {
    const workerRef = useRef(null);
    const originalRafRef = useRef(null);
    const originalCancelRafRef = useRef(null);
    const callbacksRef = useRef(new Map()); // Map<id, callback>
    const nextIdRef = useRef(0);
    const audioContextRef = useRef(null);

    useEffect(() => {
        if (!isActive) {
            // Restore if we were active and now stopping
            if (originalRafRef.current) {
                window.requestAnimationFrame = originalRafRef.current;
                window.cancelAnimationFrame = originalCancelRafRef.current;
                originalRafRef.current = null;
                originalCancelRafRef.current = null;
            }
            // Stop worker
            if (workerRef.current) {
                workerRef.current.terminate();
                workerRef.current = null;
            }
            // Close Audio Context
            if (audioContextRef.current) {
                audioContextRef.current.close();
                audioContextRef.current = null;
            }
            return;
        }

        // --- Store Originals ---
        if (!originalRafRef.current) {
            originalRafRef.current = window.requestAnimationFrame;
            originalCancelRafRef.current = window.cancelAnimationFrame;
        }

        // --- Initialize Worker ---
        if (!workerRef.current) {
            workerRef.current = new Worker(new URL('../workers/timer.worker.js', import.meta.url));
        }

        // --- Initialize Audio Context (Keep-Alive) ---
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext && !audioContextRef.current) {
                const ctx = new AudioContext();
                const oscillator = ctx.createOscillator();
                const gainNode = ctx.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(ctx.destination);

                // Silent
                gainNode.gain.value = 0.0001;
                oscillator.frequency.value = 100;
                oscillator.start();
                audioContextRef.current = ctx;
                console.log("Audio Context Keep-Alive Started");
            }
        } catch (e) {
            console.warn("Failed to start audio keep-alive", e);
        }


        // --- Shim RequestAnimationFrame ---

        // 1. worker listener
        workerRef.current.onmessage = (e) => {
            if (e.data === 'tick') {
                const now = performance.now();
                // Execute all pending callbacks
                const pending = new Map(callbacksRef.current);
                callbacksRef.current.clear(); // Clear for next frame reqs

                pending.forEach((cb) => {
                    try {
                        cb(now);
                    } catch (err) {
                        console.error("Error in shimmed RAF callback:", err);
                    }
                });
            }
        };

        // 2. Override global functions
        window.requestAnimationFrame = (callback) => {
            const id = nextIdRef.current++;
            callbacksRef.current.set(id, callback);
            return id;
        };

        window.cancelAnimationFrame = (id) => {
            callbacksRef.current.delete(id);
        };

        // 3. Start worker
        workerRef.current.postMessage('start');
        console.log("Background Tracking Active: RAF Shimmed.");

        return () => {
            // Cleanup on unmount (or isActive change handled at top)
            if (originalRafRef.current) {
                window.requestAnimationFrame = originalRafRef.current;
                window.cancelAnimationFrame = originalCancelRafRef.current;
            }
            if (workerRef.current) {
                workerRef.current.terminate();
            }
            if (audioContextRef.current) {
                audioContextRef.current.close();
            }
        };

    }, [isActive]);
}
