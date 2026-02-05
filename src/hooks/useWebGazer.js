import { useEffect, useRef, useState } from 'react';

export function useWebGazer() {
    const [isReady, setIsReady] = useState(false);
    const [gazeData, setGazeData] = useState({ x: null, y: null }); // Start null to hide until tracking
    const [isCalibrating, setIsCalibrating] = useState(false);

    useEffect(() => {
        const loadWebGazer = async () => {
            if (window.webgazer) {
                initWebGazer();
                return;
            }

            try {
                const webgazerModule = await import('webgazer');
                if (webgazerModule.default) {
                    window.webgazer = webgazerModule.default;
                } else {
                    window.webgazer = webgazerModule;
                }
                initWebGazer();
            } catch (e) {
                console.error("Failed to load webgazer", e);
            }
        };

        const initWebGazer = () => {
            if (!window.webgazer) return;

            // V1 Stability Settings: 
            // Ridge regression, Kalman Filter ON, Default Tracker
            window.webgazer.setRegression('ridge')
                .begin()
                .then(() => {
                    console.log("WebGazer started successfully");
                    window.webgazer.showVideoPreview(true)
                        .showPredictionPoints(false)
                        .applyKalmanFilter(true);

                    // Verify video element exists
                    const videoEl = document.getElementById('webgazerVideoFeed');
                    if (videoEl) {
                        // Ensure it's not hidden by style
                        videoEl.style.display = 'block';
                        videoEl.style.position = 'fixed';
                        videoEl.style.bottom = '0';
                        videoEl.style.right = '0';
                        videoEl.style.zIndex = '9999';
                    }

                    setIsReady(true);
                })
                .catch(err => {
                    console.error("WebGazer failed to start:", err);
                    setIsReady(false);
                });

            // Setup listener
            window.webgazer.setGazeListener((data, clock) => {
                if (data) {
                    setGazeData({ x: data.x, y: data.y });
                } else {
                    setGazeData({ x: null, y: null }); // Hide if tracking lost
                }
            });
        };

        loadWebGazer();

        return () => {
            if (window.webgazer) {
                window.webgazer.end();
            }
        };
    }, []);

    return { isReady, gazeData, webgazer: window.webgazer };
}
