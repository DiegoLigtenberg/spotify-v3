class AudioPlayer {
    constructor() {
        this.player = document.createElement('audio');
        this.player.crossOrigin = 'anonymous';
        document.body.appendChild(this.player);
        
        this.eventListeners = {
            timeupdate: [],
            ended: [],
            error: []
        };
        
        // Debug logging for audio events
        ['loadstart', 'loadeddata', 'loadedmetadata', 'canplay', 'canplaythrough', 'error'].forEach(eventName => {
            this.player.addEventListener(eventName, (e) => {
                console.log(`Audio event: ${eventName}`, e);
            });
        });
    }

    addEventListener(event, listener) {
        this.eventListeners[event].push(listener);
        this.player.addEventListener(event, listener);
    }

    async play(streamUrl) {
        try {
            // First check if the stream is accessible
            const response = await fetch(streamUrl, { method: 'HEAD' });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            // Reset the current player
            this.player.pause();
            this.player.currentTime = 0;
            
            // Create new player to avoid caching issues
            const newPlayer = document.createElement('audio');
            newPlayer.crossOrigin = 'anonymous';
            
            // Copy event listeners
            Object.entries(this.eventListeners).forEach(([event, listeners]) => {
                listeners.forEach(listener => {
                    newPlayer.addEventListener(event, listener);
                });
            });
            
            // Replace old player
            this.player.remove();
            document.body.appendChild(newPlayer);
            this.player = newPlayer;
            
            // Set source and play
            this.player.src = streamUrl;
            await this.player.load();
            return this.player.play();
        } catch (error) {
            console.error('Error in AudioPlayer.play:', error);
            throw error;
        }
    }

    pause() {
        this.player.pause();
    }

    get currentTime() {
        return this.player.currentTime;
    }

    set currentTime(value) {
        this.player.currentTime = value;
    }

    get duration() {
        return this.player.duration;
    }

    get paused() {
        return this.player.paused;
    }

    get volume() {
        return this.player.volume;
    }

    set volume(value) {
        this.player.volume = value;
    }
}

export default AudioPlayer; 