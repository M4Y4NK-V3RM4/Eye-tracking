import { useState, useRef, useEffect } from 'react'
import { useWebGazer } from './hooks/useWebGazer'
import { useBackgroundTracking } from './hooks/useBackgroundTracking'
import { Calibration } from './components/Calibration'
import { Compositor } from './components/Compositor'

function App() {
  const { isReady, gazeData, webgazer } = useWebGazer();
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [screenStream, setScreenStream] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [showLiveOverlay, setShowLiveOverlay] = useState(true);

  // Enable background tracking magic when recording
  useBackgroundTracking(isRecording);

  const [hasCalibrated, setHasCalibrated] = useState(false);

  const videoPreviewRef = useRef(null);

  const startCalibration = () => {
    setIsCalibrating(true);
    // WebGazer calibration usually involves clearing data
    if (webgazer) {
      webgazer.clearData();
    }
  };

  const finishCalibration = () => {
    setIsCalibrating(false);
    setHasCalibrated(true);
    // Remove listeners to stop learning/drift
    if (webgazer) {
      webgazer.removeMouseEventListeners();
    }
  };



  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always" },
        audio: true
      });
      setScreenStream(stream);
      setIsRecording(true);

      // Update preview
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        videoPreviewRef.current.play();
      }

      // Handle stream stop (user clicks "Stop Sharing" in browser UI)
      stream.getVideoTracks()[0].onended = () => {
        stopRecording(stream);
      };

    } catch (err) {
      console.error("Failed to get display media", err);
    }
  };

  const stopRecording = (explicitStream = null) => {
    setIsRecording(false);

    // Use the explicitly passed stream (from onended) OR the state stream
    const targetStream = explicitStream || screenStream;

    if (targetStream) {
      targetStream.getTracks().forEach(track => track.stop());
      setScreenStream(null);
    }
    if (videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = null;
    }
  };

  return (
    <div className="w-full min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4 relative overflow-hidden">

      {/* Background/UI */}
      <h1 className="text-3xl font-bold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
        Active Eye Tracker
      </h1>

      <div className={`grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-6xl z-10 transition-opacity duration-300 ${isCalibrating ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>

        {/* Controls Panel */}
        <div className="bg-gray-800/80 backdrop-blur-sm p-6 rounded-xl border border-gray-700 shadow-2xl flex flex-col gap-6">
          <div>
            <h2 className="text-xl font-semibold mb-2">Status</h2>
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${isReady ? 'bg-green-500' : 'bg-red-500'}`}></span>
              <span>WebGazer: {isReady ? "Ready" : "Loading..."}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`w-3 h-3 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-500'}`}></span>
              <span>Recording: {isRecording ? "Active" : "Idle"}</span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={startCalibration}
              className={`px-6 py-3 rounded-lg font-medium transition-all shadow-lg flex items-center justify-center gap-2 ${hasCalibrated
                ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/30'
                : 'bg-yellow-600 hover:bg-yellow-500 shadow-yellow-500/30 animate-pulse'
                }`}
            >
              {hasCalibrated ? "Recalibrate (9-Point)" : "Start Calibration (Required)"}
            </button>

            {!isRecording ? (
              <button
                onClick={handleStartRecording}
                disabled={!hasCalibrated}
                className={`px-6 py-3 rounded-lg font-medium transition-all shadow-lg flex items-center justify-center gap-2 ${hasCalibrated
                  ? 'bg-red-600 hover:bg-red-500 shadow-red-500/30 cursor-pointer'
                  : 'bg-gray-600 cursor-not-allowed opacity-50'
                  }`}
              >
                <span>{hasCalibrated ? "Start Recording" : "Calibrate First"}</span>
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="px-6 py-3 bg-gray-600 hover:bg-gray-500 rounded-lg font-medium transition-all"
              >
                Stop Recording
              </button>
            )}

            {/* Emergency Stop Button - Always Visible if Recording/Stream active */}
            {(screenStream || isRecording) && (
              <button
                onClick={stopRecording}
                className="mt-2 text-xs text-red-400 hover:text-red-300 underline"
              >
                Force Stop Session
              </button>
            )}

            <div className="flex items-center gap-2 mt-2 p-2 bg-gray-700/50 rounded">
              <input
                type="checkbox"
                id="overlayToggle"
                checked={showLiveOverlay}
                onChange={e => setShowLiveOverlay(e.target.checked)}
                className="w-5 h-5 accent-blue-500"
              />
              <label htmlFor="overlayToggle" className="cursor-pointer select-none">
                Show Gaze Overlay in Preview
              </label>
            </div>
          </div>

          <div className="text-sm text-gray-400 mt-auto">
            <p>1. Allow Camera access.</p>
            <p>2. Calibrate by looking at the dots.</p>
            <p>3. Start Recording (Select Screen).</p>
            <p className="mt-2 text-xs opacity-70">
              * The recording will always contain the eye tracking overlay, even if hidden in preview.
            </p>
          </div>
        </div>

        {/* Live Preview */}
        <div className="bg-gray-800/80 backdrop-blur-sm p-4 rounded-xl border border-gray-700 shadow-2xl relative">
          <h2 className="text-xl font-semibold mb-4 text-center">Live Preview</h2>
          <div className="aspect-video bg-black rounded-lg overflow-hidden relative border border-gray-600">
            <video
              ref={videoPreviewRef}
              className="w-full h-full object-contain"
              muted
            />

            {/* Live Gaze Overlay (Dom based) - Removed inside preview to avoid confusion, global overlay is better */}

            {!screenStream && (
              <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                <span>No Screen Selected</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Logic Components */}
      {isCalibrating && (
        <Calibration onComplete={finishCalibration} webgazer={webgazer} />
      )}

      {/* Global Gaze Overlay (Standard React Render) */}
      {showLiveOverlay && gazeData.x !== null && (
        <div
          className="fixed w-8 h-8 rounded-full border-2 border-white bg-red-500/50 pointer-events-none z-50 transform -translate-x-1/2 -translate-y-1/2 transition-transform duration-75 ease-out"
          style={{ left: gazeData.x, top: gazeData.y }}
        >
        </div>
      )}

      {/* Logic Components */}


      <Compositor
        screenStream={screenStream}
        webgazer={webgazer}
        gazeData={gazeData}
        isRecording={isRecording}
      />
    </div>
  )
}

export default App
