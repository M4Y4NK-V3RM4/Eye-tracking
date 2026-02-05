import React, { useRef, useEffect } from 'react';

export function Recorder({
    onStreamReady
}) {
    const videoRef = useRef(null);

    useEffect(() => {
        // Just a placeholder to ensure we can access camera if WebGazer doesn't do it alone.
        // WebGazer creates its own video element usually, so we might need to hide it or use it.
        // For now, we will handle custom webcam logic if WebGazer's default is insufficient.
        // Actually, we want to capture the screen, so this component will handle getDisplayMedia.
    }, []);

    const startScreenShare = async () => {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: "always" },
                audio: true
            });
            if (onStreamReady) onStreamReady(stream);
        } catch (err) {
            console.error("Error sharing screen: ", err);
        }
    };

    return (
        <div className="flex flex-col items-center">
            <button
                onClick={startScreenShare}
                className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded"
            >
                Select Screen to Record
            </button>
        </div>
    );
}
