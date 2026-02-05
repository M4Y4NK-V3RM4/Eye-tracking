import React, { useState } from 'react';

export function Calibration({ onComplete, webgazer }) {
    // 9 Points standard calibration
    const points = [
        { x: 10, y: 10 }, { x: 50, y: 10 }, { x: 90, y: 10 },
        { x: 10, y: 50 }, { x: 50, y: 50 }, { x: 90, y: 50 },
        { x: 10, y: 90 }, { x: 50, y: 90 }, { x: 90, y: 90 }
    ];

    const [currentPointIndex, setCurrentPointIndex] = useState(0);
    const [clickCount, setClickCount] = useState(0);
    const CLICKS_NEEDED = 5; // More clicks for better accuracy

    // Handle transitions when clickCount reaches target
    React.useEffect(() => {
        if (clickCount >= CLICKS_NEEDED) {
            const nextIndex = currentPointIndex + 1;
            if (nextIndex < points.length) {
                setCurrentPointIndex(nextIndex);
                setClickCount(0);
            } else {
                onComplete();
            }
        }
    }, [clickCount, currentPointIndex, onComplete, points.length]);

    const handlePointClick = (e) => {
        // Explicitly train WebGazer
        if (webgazer) {
            const { clientX, clientY } = e;
            webgazer.recordScreenPosition(clientX, clientY, 'click');
        }

        setClickCount(prev => prev + 1);
    };

    const currentPoint = points[currentPointIndex];

    return (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center">
            {/* Helper Text */}
            <div className="absolute top-10 text-white text-2xl font-bold text-center">
                Calibration Step {currentPointIndex + 1} / {points.length}
                <div className="text-sm font-normal text-gray-400 mt-2">
                    Click the {clickCount >= CLICKS_NEEDED ? 'Green' : 'Red'} Dot {CLICKS_NEEDED - clickCount} more times.
                    <br />Keep looking at it!
                </div>
            </div>

            {/* Render ONLY the current point to force focus */}
            <button
                className="w-12 h-12 rounded-full border-4 border-white bg-red-500 cursor-crosshair transition-all active:scale-90 animate-pulse"
                style={{
                    position: 'absolute',
                    left: `${currentPoint.x}%`,
                    top: `${currentPoint.y}%`,
                    transform: 'translate(-50%, -50%)',
                    backgroundColor: clickCount > 0 ? '#ef4444' : '#f87171' // Slight color change on click
                }}
                onClick={handlePointClick}
            >
                <span className="absolute inset-0 flex items-center justify-center text-xs font-bold pointer-events-none">
                    {CLICKS_NEEDED - clickCount}
                </span>
            </button>
        </div>
    );
}
