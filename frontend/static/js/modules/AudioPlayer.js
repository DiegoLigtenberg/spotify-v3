class AudioPlayer {
    constructor() {
        // Create an actual audio element in the DOM for better browser support
        this.audioElement = document.createElement('audio');
        this.audioElement.id = 'main-audio-player';
        this.audioElement.preload = 'auto';
        this.audioElement.crossOrigin = 'anonymous'; // Enable CORS
        
        // Add to DOM but hide it
        this.audioElement.style.display = 'none';
        document.body.appendChild(this.audioElement);
        
        this.progressBar = document.querySelector('.progress-bar');
        this.progressContainer = document.querySelector('.progress');
        this.currentUrl = null;
        this.lastPosition = 0;
        this.isLoaded = false;
        this.isPlaying = false;
        this.pendingSeek = false;
        this.seekAttempts = 0;
        
        this.eventListeners = {
            timeupdate: [],
            ended: [],
            error: [],
            play: [],
            pause: [],
            seek: []
        };
        
        // Set up audio event listeners
        this._setupAudioEvents();
        
        // Set up progress bar click handling
        this.progressContainer?.addEventListener('click', (e) => {
            if (!this.isLoaded) return;
            const rect = this.progressContainer.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            const duration = this.duration;
            if (duration) {
                this.seek(percent * duration);
            }
        });

        // Set up spacebar handling for skipping forward
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !e.target.matches('input, textarea')) {
                e.preventDefault();
                if (this.isLoaded) {
                    this.skipForward(10);
                }
            }
        });
        
        // Debug the server's range request support
        this._checkRangeSupport();
    }
    
    async _checkRangeSupport() {
        try {
            const response = await fetch('/api/stream/1', {
                method: 'HEAD'
            });
            console.log('Server headers:', {
                'Accept-Ranges': response.headers.get('Accept-Ranges'),
                'Content-Type': response.headers.get('Content-Type'),
                'Content-Length': response.headers.get('Content-Length')
            });
        } catch (e) {
            console.error('Error checking range support:', e);
        }
    }

    _setupAudioEvents() {
        // Setup HTML5 audio events
        this.audioElement.addEventListener('timeupdate', () => {
            // Update our last position continuously
            if (!this.pendingSeek) {
                this.lastPosition = this.audioElement.currentTime;
            }
            
            // Update progress bar
            if (this.progressBar && this.isLoaded) {
                const percent = (this.audioElement.currentTime / this.audioElement.duration) * 100;
                this.progressBar.style.width = `${percent}%`;
                this._triggerEvent('timeupdate');
            }
        });
        
        this.audioElement.addEventListener('play', () => {
            console.log('Playing from:', this.formatTime(this.audioElement.currentTime));
            this.isPlaying = true;
            this._triggerEvent('play');
        });
        
        this.audioElement.addEventListener('pause', () => {
            console.log('Paused at:', this.formatTime(this.audioElement.currentTime));
            this.isPlaying = false;
            this._triggerEvent('pause');
        });
        
        this.audioElement.addEventListener('ended', () => {
            console.log('Playback ended');
            this.isPlaying = false;
            this.lastPosition = 0;
            this._triggerEvent('ended');
        });
        
        this.audioElement.addEventListener('loadedmetadata', () => {
            console.log('Audio metadata loaded, duration:', this.formatTime(this.audioElement.duration));
            this.isLoaded = true;
        });
        
        this.audioElement.addEventListener('canplay', () => {
            console.log('Audio can now play');
            // If we have a pending seek, apply it
            if (this.pendingSeek && this.lastPosition > 0) {
                console.log('Applying pending seek to:', this.formatTime(this.lastPosition));
                this._performSeek(this.lastPosition);
                this.pendingSeek = false;
            }
        });
        
        this.audioElement.addEventListener('error', (e) => {
            console.error('Audio error:', e);
            this.isLoaded = false;
            this._triggerEvent('error', { error: e });
        });
        
        this.audioElement.addEventListener('seeked', () => {
            console.log('Seek completed to:', this.formatTime(this.audioElement.currentTime));
            this.pendingSeek = false;
            this._triggerEvent('seek', { position: this.audioElement.currentTime });
        });
        
        this.audioElement.addEventListener('seeking', () => {
            console.log('Seeking started');
            this.pendingSeek = true;
        });
    }

    addEventListener(event, listener) {
        if (this.eventListeners[event]) {
            this.eventListeners[event].push(listener);
        }
    }

    _triggerEvent(eventName, data = {}) {
        if (this.eventListeners[eventName]) {
            this.eventListeners[eventName].forEach(listener => {
                try {
                    listener({
                        type: eventName,
                        ...data
                    });
                } catch (error) {
                    console.error(`Error in ${eventName} listener:`, error);
                }
            });
        }
    }

    formatTime(seconds) {
        seconds = Math.floor(seconds);
        const minutes = Math.floor(seconds / 60);
        seconds = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    async togglePlayPause() {
        if (!this.isLoaded) return;
        
        if (this.isPlaying) {
            this.pause();
        } else {
            await this.resume();
        }
    }

    async play(streamUrl) {
        try {
            // If no URL provided, try to resume current track
            if (!streamUrl) {
                if (this.currentUrl) {
                    return this.resume();
                }
                return;
            }

            // Make sure we have a valid URL
            if (!streamUrl.startsWith('http') && !streamUrl.startsWith('/')) {
                streamUrl = '/' + streamUrl;
            }
            
            // Remove any range information from the URL (like :1)
            if (streamUrl.includes(':')) {
                streamUrl = streamUrl.split(':')[0];
            }

            // If we're trying to play the same audio that's loaded
            if (this.isLoaded && this.currentUrl === streamUrl) {
                return this.resume();
            }

            console.log('Loading new audio:', streamUrl);
            this.currentUrl = streamUrl;
            this.lastPosition = 0;
            this.isLoaded = false;
            this.pendingSeek = false;
            
            // Clear any existing sources and errors
            this.audioElement.removeAttribute('src');
            while (this.audioElement.firstChild) {
                this.audioElement.removeChild(this.audioElement.firstChild);
            }
            
            // Add unique cache-busting parameter
            const uniqueUrl = `${streamUrl}?t=${Date.now()}`;
            console.log('Using URL with cache-busting:', uniqueUrl);
            
            // Use source elements instead of setting src directly
            // This provides better browser compatibility
            const source = document.createElement('source');
            source.src = uniqueUrl;
            source.type = 'audio/mpeg'; // Default type
            this.audioElement.appendChild(source);
            
            // Force reload
            this.audioElement.load();
            
            // Create a variable to track successful metadata loading
            let metadataLoaded = false;
            
            // Handle errors more robustly
            this.audioElement.onerror = (e) => {
                const errorCode = this.audioElement.error ? this.audioElement.error.code : 'unknown';
                const errorMessage = this.audioElement.error ? this.audioElement.error.message : 'Unknown error';
                console.error(`Audio element error: code=${errorCode}, message=${errorMessage}`, e);
                
                // If we haven't loaded metadata yet, try the alternative approach
                if (!metadataLoaded) {
                    console.log('Error before metadata loaded, trying alternative loading method...');
                    this._tryAlternativeLoading(uniqueUrl);
                } else {
                    this._triggerEvent('error', { error: this.audioElement.error });
                }
            };
            
            // Handle metadata loading with timeout fallback
            try {
                let timeoutOccurred = false;
                
                await Promise.race([
                    // Wait for metadata to load
                    new Promise((resolve) => {
                        const onMetadataLoaded = () => {
                            console.log('Metadata loaded successfully, duration:', this.formatTime(this.audioElement.duration));
                            this.audioElement.removeEventListener('loadedmetadata', onMetadataLoaded);
                            metadataLoaded = true;
                            this.isLoaded = true;
                            resolve();
                        };
                        
                        this.audioElement.addEventListener('loadedmetadata', onMetadataLoaded, { once: true });
                        
                        // Also resolve on canplay event
                        this.audioElement.addEventListener('canplay', () => {
                            if (!metadataLoaded) {
                                console.log('Can play event received before metadata loaded');
                                metadataLoaded = true;
                                this.isLoaded = true;
                                resolve();
                            }
                        }, { once: true });
                    }),
                    
                    // Set a timeout for metadata loading
                    new Promise(resolve => setTimeout(() => {
                        if (!metadataLoaded) {
                            console.warn('Metadata loading timed out, continuing anyway');
                            timeoutOccurred = true;
                            // Continue without waiting for metadata
                            this.isLoaded = true;
                            resolve();
                        }
                    }, 3000))
                ]);
                
                // Start playing
                console.log('Starting playback...');
                if (timeoutOccurred) {
                    console.log('Trying to play despite metadata timeout');
                }
                
                await this.audioElement.play();
                this.isPlaying = true;
                console.log('Playback started successfully');
                
            } catch (error) {
                console.error('Error during audio loading/playing:', error);
                
                // Try the alternative loading method
                console.log('Trying alternative loading method after play error');
                await this._tryAlternativeLoading(uniqueUrl, true);
            }

        } catch (error) {
            console.error('Error in play method:', error);
            this.isLoaded = false;
            this._triggerEvent('error', { error });
            throw error;
        }
    }

    async resume() {
        if (!this.isLoaded) return;
        
        try {
            // Make sure we're at the last known position
            if (this.lastPosition > 0 && Math.abs(this.audioElement.currentTime - this.lastPosition) > 0.5) {
                console.log('Resuming from saved position:', this.formatTime(this.lastPosition));
                this._performSeek(this.lastPosition);
            }
            
            await this.audioElement.play();
            this.isPlaying = true;
        } catch (error) {
            console.error('Error resuming audio:', error);
            throw error;
        }
    }

    pause() {
        if (!this.isLoaded) return;
        
        // Store current position before pausing
        if (!this.pendingSeek) {
            this.lastPosition = this.audioElement.currentTime;
        }
        
        console.log('Pausing at position:', this.formatTime(this.lastPosition));
        this.audioElement.pause();
        this.isPlaying = false;
    }

    _performSeek(time) {
        if (!this.isLoaded) return;
        
        // Set position on audio element
        try {
            console.log(`Attempting to seek to ${this.formatTime(time)}`);
            this.audioElement.currentTime = time;
            
            // Verify the seek actually worked
            setTimeout(() => {
                const actualTime = this.audioElement.currentTime;
                console.log(`Actual position after seek: ${this.formatTime(actualTime)}`);
                
                // If the seek failed (more than 1 second difference), try again
                if (Math.abs(actualTime - time) > 1 && this.seekAttempts < 3) {
                    console.warn('Seek verification failed, retrying');
                    this.seekAttempts++;
                    this._performSeek(time);
                } else {
                    this.seekAttempts = 0;
                    // Force a timeupdate event to update UI
                    this._triggerEvent('timeupdate');
                }
            }, 100);
        } catch (err) {
            console.error('Error during seeking:', err);
            this.seekAttempts = 0;
        }
    }

    seek(time) {
        if (!this.isLoaded) return;
        
        console.log('Seeking to:', this.formatTime(time));
        
        // Initialize seek attempts
        this.seekAttempts = 0;
        
        // Mark that we're seeking
        this.pendingSeek = true;
        
        // Remember playback state
        const wasPlaying = this.isPlaying;
        
        // Always pause before seeking to avoid playback issues
        if (wasPlaying) {
            this.audioElement.pause();
        }
        
        // Update our position
        this.lastPosition = time;
        
        // Perform the seek
        this._performSeek(time);
        
        // Resume if needed
        if (wasPlaying) {
            setTimeout(() => {
                this.audioElement.play()
                    .then(() => {
                        console.log(`Playback resumed at ${this.formatTime(this.audioElement.currentTime)}`);
                        // Force a seek event
                        this._triggerEvent('seek', { position: time });
                    })
                    .catch(err => {
                        console.error('Error resuming after seek:', err);
                        this.pendingSeek = false;
                    });
            }, 200); // Increased delay to give the seek more time
        } else {
            // Still trigger seek event even if not playing
            setTimeout(() => {
                this._triggerEvent('seek', { position: time });
                this.pendingSeek = false;
            }, 100);
        }
    }

    skipForward(seconds) {
        if (!this.isLoaded) return;
        
        const newTime = Math.min(this.audioElement.currentTime + seconds, this.audioElement.duration);
        
        console.log('Skipping forward:', {
            from: this.formatTime(this.audioElement.currentTime),
            to: this.formatTime(newTime)
        });
        
        this.seek(newTime);
    }

    get currentTime() {
        return this.isLoaded ? this.audioElement.currentTime : 0;
    }

    set currentTime(value) {
        if (this.isLoaded) {
            this.seek(value);
        }
    }

    get duration() {
        return this.isLoaded ? this.audioElement.duration : 0;
    }

    get paused() {
        return !this.isPlaying;
    }

    get volume() {
        return this.audioElement ? this.audioElement.volume : 1;
    }

    set volume(value) {
        if (this.audioElement) {
            this.audioElement.volume = value;
        }
    }

    _tryAlternativeLoading(url, forceTryPlay = false) {
        return new Promise((resolve, reject) => {
            console.log('Using alternative loading method with forceTryPlay =', forceTryPlay);
            
            // Create a completely new audio element
            const newAudio = document.createElement('audio');
            newAudio.id = 'main-audio-player-alt';
            newAudio.preload = 'auto';
            newAudio.crossOrigin = 'anonymous';
            
            // Copy our event listeners
            const events = ['timeupdate', 'play', 'pause', 'ended', 'loadedmetadata', 'canplay', 'error', 'seeked', 'seeking'];
            events.forEach(event => {
                const listeners = this.audioElement[`on${event}`];
                if (listeners) {
                    newAudio[`on${event}`] = listeners;
                }
            });
            
            // Set a more comprehensive error handler
            newAudio.onerror = (e) => {
                const errorInfo = newAudio.error 
                    ? `Code: ${newAudio.error.code}, Message: ${newAudio.error.message}` 
                    : 'Unknown error';
                console.error(`Alternative audio loading error: ${errorInfo}`, e);
                
                // Report the error
                this._triggerEvent('error', { 
                    error: new Error(`Failed to load audio: ${errorInfo}`)
                });
                
                reject(new Error(`Failed to load audio with alternative method: ${errorInfo}`));
            };
            
            // Add a direct source without using source elements
            try {
                // Add cache buster parameter and specify type=audio/mpeg
                const modifiedUrl = `${url}&altmethod=true`;
                console.log('Alternative method using URL:', modifiedUrl);
                
                newAudio.src = modifiedUrl;
                
                // Set up handling for metadata loading success
                newAudio.onloadedmetadata = () => {
                    console.log('Metadata loaded in alternative audio element, duration:', 
                        this.formatTime(newAudio.duration));
                    this.isLoaded = true;
                    
                    if (forceTryPlay && !this.isPlaying) {
                        console.log('Force playing with alternative audio element');
                        newAudio.play().then(() => {
                            this.isPlaying = true;
                            resolve();
                        }).catch(e => {
                            console.error('Failed to play with alternative method:', e);
                            this._triggerEvent('error', { error: e });
                            reject(e);
                        });
                    } else {
                        resolve();
                    }
                };
                
                // Handle canplay as backup if metadata doesn't load
                newAudio.oncanplay = () => {
                    if (!this.isLoaded) {
                        console.log('Can play event in alternative audio (metadata never loaded)');
                        this.isLoaded = true;
                        
                        if (forceTryPlay && !this.isPlaying) {
                            newAudio.play().then(() => {
                                this.isPlaying = true;
                                resolve();
                            }).catch(e => {
                                console.error('Failed to play on canplay event:', e);
                                reject(e);
                            });
                        } else {
                            resolve();
                        }
                    }
                };
                
                // Replace the audio element in the DOM
                const parent = this.audioElement.parentNode;
                if (parent) {
                    parent.replaceChild(newAudio, this.audioElement);
                    this.audioElement = newAudio;
                    console.log('Replaced audio element with alternative version');
                    
                    // Force load
                    this.audioElement.load();
                    
                    // Set a failsafe timeout in case neither metadata nor canplay fire
                    setTimeout(() => {
                        if (!this.isLoaded) {
                            console.log('Metadata/canplay events never fired, forcing continue');
                            this.isLoaded = true;
                            
                            if (forceTryPlay && !this.isPlaying) {
                                console.log('Last-resort playback attempt');
                                this.audioElement.play().then(() => {
                                    this.isPlaying = true;
                                    resolve();
                                }).catch(e => {
                                    console.error('Final playback attempt failed:', e);
                                    reject(e);
                                });
                            } else {
                                resolve();
                            }
                        }
                    }, 5000);
                } else {
                    reject(new Error('Could not find parent for audio element'));
                }
            } catch (error) {
                console.error('Error in alternative loading setup:', error);
                reject(error);
            }
        });
    }
}

export default AudioPlayer; 