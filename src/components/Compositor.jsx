import React, { useRef, useEffect, useState } from 'react';

export function Compositor({
    screenStream,
    webgazer,
    gazeData,
    isRecording,
    onStop
}) {
    const canvasRef = useRef(null);
    const pathCanvasRef = useRef(null); // Canvas for Path Video
    const mediaRecorderRef = useRef(null);
    const workerRef = useRef(null);

    // Gaze Data Handling
    const gazeRef = useRef(gazeData);
    const gazeHistoryRef = useRef([]); // Store full history for path/heatmap

    useEffect(() => {
        gazeRef.current = gazeData;
    }, [gazeData]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const pathCanvas = pathCanvasRef.current;
        if (!canvas || !pathCanvas || !screenStream) return;

        const ctx = canvas.getContext('2d');
        const pathCtx = pathCanvas.getContext('2d');

        const screenVideo = document.createElement('video');
        screenVideo.srcObject = screenStream;
        screenVideo.muted = true;

        // --- Setup recording when metadata loads ---
        screenVideo.onloadedmetadata = () => {
            // 1. Set Dimensions
            canvas.width = screenVideo.videoWidth;
            canvas.height = screenVideo.videoHeight;
            pathCanvas.width = screenVideo.videoWidth;
            pathCanvas.height = screenVideo.videoHeight;

            console.log(`Compositor: Video Loaded. Dimensions: ${canvas.width}x${canvas.height}`);

            // 2. Initialize Worker
            if (!workerRef.current) {
                workerRef.current = new Worker(new URL('../workers/timer.worker.js', import.meta.url));
            }

            // 3. Render Loop
            const render = () => {
                if (!canvas || !pathCanvas || !screenVideo) return;

                // Safety Resize
                if (canvas.width !== screenVideo.videoWidth) {
                    canvas.width = screenVideo.videoWidth;
                    canvas.height = screenVideo.videoHeight;
                    pathCanvas.width = screenVideo.videoWidth;
                    pathCanvas.height = screenVideo.videoHeight;
                }

                // --- A. Draw Base Screen (Both Canvases) ---
                try {
                    ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
                    pathCtx.drawImage(screenVideo, 0, 0, pathCanvas.width, pathCanvas.height);
                } catch (e) { }

                // --- B. Draw FACE PIP (Only on Main Canvas) ---
                const faceVideo = document.getElementById('webgazerVideoFeed');
                if (faceVideo && faceVideo.readyState === 4 && faceVideo.videoWidth > 0) {
                    try {
                        const pipWidth = canvas.width * 0.15;
                        const pipHeight = (faceVideo.videoHeight / faceVideo.videoWidth) * pipWidth;
                        if (isFinite(pipWidth)) {
                            const pipX = canvas.width - pipWidth - 20;
                            const pipY = canvas.height - pipHeight - 20;

                            // Draw on Main Canvas
                            ctx.save();
                            ctx.beginPath();
                            ctx.rect(pipX, pipY, pipWidth, pipHeight);
                            ctx.clip();
                            ctx.drawImage(faceVideo, pipX, pipY, pipWidth, pipHeight);
                            ctx.strokeStyle = '#fff';
                            ctx.lineWidth = 2;
                            ctx.strokeRect(pipX, pipY, pipWidth, pipHeight);
                            ctx.restore();
                        }
                    } catch (e) { }
                }

                // --- C. Gaze Processing ---
                const currentGaze = gazeRef.current;

                if (currentGaze && currentGaze.x !== null && currentGaze.x !== undefined) {
                    try {
                        const { x, y } = currentGaze;
                        const normX = x / (window.innerWidth || 1);
                        const normY = y / (window.innerHeight || 1);
                        const drawX = normX * canvas.width;
                        const drawY = normY * canvas.height;

                        if (isFinite(drawX) && isFinite(drawY)) {
                            // 1. Draw Dot on Main Canvas
                            ctx.beginPath();
                            ctx.arc(drawX, drawY, 15, 0, 2 * Math.PI);
                            ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
                            ctx.fill();
                            ctx.strokeStyle = 'white';
                            ctx.lineWidth = 3;
                            ctx.stroke();

                            // 2. Add to History (if recording)
                            if (isRecording) {
                                gazeHistoryRef.current.push({ x: drawX, y: drawY });
                            }
                        }
                    } catch (e) { }
                }

                // --- D. Draw Path (On Path Canvas) ---
                if (gazeHistoryRef.current.length > 1) {
                    pathCtx.beginPath();
                    pathCtx.strokeStyle = 'rgba(255, 0, 0, 0.6)';
                    pathCtx.lineWidth = 3;
                    pathCtx.lineJoin = 'round';
                    pathCtx.lineCap = 'round';

                    const history = gazeHistoryRef.current;
                    pathCtx.moveTo(history[0].x, history[0].y);
                    for (let i = 1; i < history.length; i++) {
                        pathCtx.lineTo(history[i].x, history[i].y);
                    }
                    pathCtx.stroke();
                }
            };

            workerRef.current.onmessage = (e) => { if (e.data === 'tick') render(); };
            workerRef.current.postMessage('start');

            // --- 4. Start Recording (3 Streams!) ---
            if (isRecording && !mediaRecorderRef.current) {
                gazeHistoryRef.current = []; // Clear history on start

                const mimeType = getBestMimeType();
                const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';

                // OPTIMIZATION FOR LONG SESSIONS (1 Hour safe)
                // Cap bitrate at 1.5 Mbps (~700MB per hour per stream)
                const RECORDER_OPTS = { mimeType, videoBitsPerSecond: 1500000 };
                const FPS = 24; // Cinema standard, saves RAM

                // Safe audio track add
                let streamToRecord = canvas.captureStream(FPS);
                try {
                    const audioTracks = screenStream.getAudioTracks();
                    if (audioTracks.length > 0) streamToRecord.addTrack(audioTracks[0]);
                } catch (e) { console.warn("Audio track add failed", e); }

                // A. Main (Dot) Recorder
                const canvasRecorder = new MediaRecorder(streamToRecord, RECORDER_OPTS);
                const chunks = [];
                canvasRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
                canvasRecorder.onstop = () => {
                    if (chunks.length > 0) {
                        downloadBlob(new Blob(chunks, { type: 'application/octet-stream' }), `recording-dot-${Date.now()}.${extension}`);
                    }
                };
                canvasRecorder.start(1000); // 1s slices

                // B. Path Recorder
                const pathStream = pathCanvas.captureStream(FPS);
                const pathRecorder = new MediaRecorder(pathStream, RECORDER_OPTS);
                const pathChunks = [];
                pathRecorder.ondataavailable = e => { if (e.data.size > 0) pathChunks.push(e.data); };
                pathRecorder.onstop = () => {
                    if (pathChunks.length > 0) {
                        downloadBlob(new Blob(pathChunks, { type: 'application/octet-stream' }), `recording-path-${Date.now()}.${extension}`);
                    }
                };
                pathRecorder.start(1000);

                // C. Camera Recorder
                let cameraRecorder = null;
                const fv = document.getElementById('webgazerVideoFeed');
                if (fv && fv.srcObject) {
                    try {
                        const camMime = getBestMimeType();
                        // Cam can be lower bitrate
                        cameraRecorder = new MediaRecorder(fv.srcObject, { mimeType: camMime, videoBitsPerSecond: 1000000 });
                        const camChunks = [];
                        cameraRecorder.ondataavailable = e => { if (e.data.size > 0) camChunks.push(e.data); };
                        cameraRecorder.onstop = () => {
                            if (camChunks.length > 0) {
                                downloadBlob(new Blob(camChunks, { type: 'application/octet-stream' }), `camera-${Date.now()}.${extension}`);
                            }
                        };
                        cameraRecorder.start(1000);
                    } catch (e) { console.warn("Cam rec fail", e); }
                }

                mediaRecorderRef.current = { canvas: canvasRecorder, path: pathRecorder, camera: cameraRecorder };
            }
        };

        screenVideo.play().catch(e => console.error("Screen video play failed", e));

        // CLEANUP (Handles STOP logic)
        return () => {
            if (workerRef.current) {
                workerRef.current.postMessage('stop');
                workerRef.current.terminate();
                workerRef.current = null;
            }
            screenVideo.srcObject = null;
            screenVideo.pause();

            // STOP ALL RECORDERS
            if (mediaRecorderRef.current) {
                const { canvas, path, camera } = mediaRecorderRef.current;

                [canvas, path, camera].forEach(r => {
                    if (r && r.state !== 'inactive') r.stop();
                });

                // Generate Heatmap (if we were recording)
                if (isRecording && pathCanvas) {
                    const historySnap = [...gazeHistoryRef.current];
                    // capture node now, use in timeout
                    const cvs = pathCanvas;
                    setTimeout(() => generateHeatmap(cvs, historySnap), 500);
                }

                mediaRecorderRef.current = null;
            }
        };
    }, [isRecording, screenStream, onStop]);

    // Helpers
    const downloadBlob = (blob, filename) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
    };

    const generateHeatmap = (canvas, history) => {
        if (!history || history.length === 0) return;
        const ctx = canvas.getContext('2d');

        // Heatmap config
        ctx.globalCompositeOperation = 'source-over';

        // Draw "Heat" points
        history.forEach(pt => {
            ctx.beginPath();
            const grad = ctx.createRadialGradient(pt.x, pt.y, 10, pt.x, pt.y, 50);
            grad.addColorStop(0, 'rgba(255, 0, 0, 0.05)');
            grad.addColorStop(1, 'rgba(255, 0, 0, 0)');
            ctx.fillStyle = grad;
            ctx.arc(pt.x, pt.y, 50, 0, 2 * Math.PI);
            ctx.fill();
        });

        // Export
        canvas.toBlob(blob => {
            if (blob) downloadBlob(blob, `heatmap-${Date.now()}.png`);
        }, 'image/png');
    };

    const getBestMimeType = () => {
        const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
        for (const type of types) if (MediaRecorder.isTypeSupported(type)) return type;
        return 'video/webm';
    };

    return (
        <>
            <div className="fixed inset-0 opacity-0 pointer-events-none z-[-50]">
                <canvas ref={canvasRef} />
            </div>
            <div className="fixed inset-0 opacity-0 pointer-events-none z-[-51]">
                <canvas ref={pathCanvasRef} />
            </div>
        </>
    );
}
