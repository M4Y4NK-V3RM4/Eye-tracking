// timer.worker.js
// A simple worker to provide a steady clock unaffected by main thread throttling
let intervalId = null;

self.onmessage = (e) => {
    if (e.data === 'start') {
        if (!intervalId) {
            intervalId = setInterval(() => {
                self.postMessage('tick');
            }, 33); // ~30 FPS
        }
    } else if (e.data === 'stop') {
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
    }
};
