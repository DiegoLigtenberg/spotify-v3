import AudioPlayer from './modules/AudioPlayer.js';
import SongListManager from './modules/SongListManager.js';
import UIManager from './modules/UIManager.js';
import PlaylistManager from './modules/PlaylistManager.js';
import { authFetch, isAuthenticated } from './modules/supabase/auth.js';

// SongCache class for client-side caching of song data
class SongCache {
    constructor() {
        this.dbPromise = this._initDatabase();
        this.isCacheEnabled = this._checkIfCacheIsSupported();
        
        if (this.isCacheEnabled) {
            console.log('Song cache initialized with IndexedDB support');
        } else {
            console.warn('IndexedDB not supported in this browser, song caching disabled');
        }
    }
    
    _checkIfCacheIsSupported() {
        return 'indexedDB' in window;
    }
    
    async _initDatabase() {
        if (!this.isCacheEnabled) return null;
        
        return new Promise((resolve, reject) => {
            try {
                const request = indexedDB.open('songCache', 1);
                
                request.onerror = (event) => {
                    console.error('IndexedDB error:', event.target.error);
                    this.isCacheEnabled = false;
                    resolve(null);
                };
                
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    
                    // Create object stores if they don't exist
                    if (!db.objectStoreNames.contains('songs')) {
                        db.createObjectStore('songs', { keyPath: 'id' });
                    }
                    
                    if (!db.objectStoreNames.contains('thumbnails')) {
                        db.createObjectStore('thumbnails', { keyPath: 'id' });
                    }
                    
                    if (!db.objectStoreNames.contains('likedSongs')) {
                        db.createObjectStore('likedSongs', { keyPath: 'id' });
                    }
                };
                
                request.onsuccess = (event) => {
                    resolve(event.target.result);
                };
            } catch (error) {
                console.error('Error initializing IndexedDB:', error);
                this.isCacheEnabled = false;
                resolve(null);
            }
        });
    }
    
    async cacheSongs(songs) {
        if (!this.isCacheEnabled || !songs || !songs.length) return false;
        
        try {
            const db = await this.dbPromise;
            if (!db) return false;
            
            const tx = db.transaction('songs', 'readwrite');
            const store = tx.objectStore('songs');
            
            // Add each song to the store
            for (const song of songs) {
                if (song && song.id) {
                    store.put(song);
                }
            }
            
            // Wait for transaction to complete
            await new Promise((resolve, reject) => {
                tx.oncomplete = () => resolve();
                tx.onerror = (event) => reject(event.target.error);
            });
            
            return true;
        } catch (error) {
            console.error('Error caching songs:', error);
            return false;
        }
    }
    
    async getCachedSongs() {
        if (!this.isCacheEnabled) return [];
        
        try {
            const db = await this.dbPromise;
            if (!db) return [];
            
            const tx = db.transaction('songs', 'readonly');
            const store = tx.objectStore('songs');
            
            // Get all songs from the store
            const songs = await new Promise((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = (event) => reject(event.target.error);
            });
            
            return songs || [];
        } catch (error) {
            console.error('Error getting cached songs:', error);
            return [];
        }
    }
    
    async getCachedSong(songId) {
        if (!this.isCacheEnabled || !songId) return null;
        
        try {
            const db = await this.dbPromise;
            if (!db) return null;
            
            const tx = db.transaction('songs', 'readonly');
            const store = tx.objectStore('songs');
            
            // Get specific song by ID
            const song = await new Promise((resolve, reject) => {
                const request = store.get(songId);
                request.onsuccess = () => resolve(request.result);
                request.onerror = (event) => reject(event.target.error);
            });
            
            return song || null;
        } catch (error) {
            console.error(`Error getting cached song ${songId}:`, error);
            return null;
        }
    }
    
    async cacheLikedSongs(songs) {
        if (!this.isCacheEnabled || !songs) return false;
        
        try {
            const db = await this.dbPromise;
            if (!db) return false;
            
            const tx = db.transaction('likedSongs', 'readwrite');
            const store = tx.objectStore('likedSongs');
            
            // Clear existing liked songs
            store.clear();
            
            // Add each liked song
            for (const song of songs) {
                if (song && song.id) {
                    store.put(song);
                }
            }
            
            // Wait for transaction to complete
            await new Promise((resolve, reject) => {
                tx.oncomplete = () => resolve();
                tx.onerror = (event) => reject(event.target.error);
            });
            
            return true;
        } catch (error) {
            console.error('Error caching liked songs:', error);
            return false;
        }
    }
    
    async getCachedLikedSongs() {
        if (!this.isCacheEnabled) return [];
        
        try {
            const db = await this.dbPromise;
            if (!db) return [];
            
            const tx = db.transaction('likedSongs', 'readonly');
            const store = tx.objectStore('likedSongs');
            
            // Get all liked songs
            const songs = await new Promise((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = (event) => reject(event.target.error);
            });
            
            return songs || [];
        } catch (error) {
            console.error('Error getting cached liked songs:', error);
            return [];
        }
    }
}

// Set up client-side logging to server
class BrowserLogger {
    constructor() {
        this.isProduction = window.ENV && window.ENV.IS_PRODUCTION === true;
        this.logQueue = [];
        this.isSending = false;
        this.logLevel = 'debug'; // default level
        this.userAgent = navigator.userAgent;
        
        // Don't set up logging in production
        if (this.isProduction) {
            console.log('Production mode detected, server logging disabled');
            return;
        }
        
        // Log initial browser info
        this.logBrowserInfo();
        
        this.setupConsoleOverrides();
        this.setupErrorHandling();
        
        // Flush logs periodically
        setInterval(() => this.flushLogs(), 2000);
        
        // Flush logs on page unload
        window.addEventListener('beforeunload', () => this.flushLogs(true));
    }
    
    logBrowserInfo() {
        const browserInfo = {
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            screenWidth: window.screen.width,
            screenHeight: window.screen.height,
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
            pixelRatio: window.devicePixelRatio,
            cookiesEnabled: navigator.cookieEnabled,
            timestamp: new Date().toISOString()
        };
        
        this.addToQueue('info', [`Browser Session Started: ${JSON.stringify(browserInfo)}`]);
    }
    
    // Get approximate source location for logging
    getCallerInfo() {
        try {
            const err = new Error();
            const stack = err.stack.split('\n');
            // Skip the first few entries as they'll be this logger's functions
            for (let i = 3; i < stack.length; i++) {
                const line = stack[i].trim();
                if (line.includes('at ') && !line.includes('BrowserLogger')) {
                    // Extract just the file name and line number
                    const match = line.match(/at .*\((.*):(\d+):(\d+)\)/) || 
                                  line.match(/at (.*):(\d+):(\d+)/);
                    if (match) {
                        const [_, file, lineNum, colNum] = match;
                        // Get just the file name without the path
                        const fileName = file.split('/').pop();
                        return `${fileName}:${lineNum}`;
                    }
                    return line.replace('at ', '').trim();
                }
            }
            return '';
        } catch (e) {
            return '';
        }
    }
    
    setupConsoleOverrides() {
        // Store original console methods
        const originalConsole = {
            log: console.log,
            info: console.info,
            warn: console.warn,
            error: console.error,
            debug: console.debug
        };
        
        // Override console methods
        console.log = (...args) => {
            this.addToQueue('log', args, this.getCallerInfo());
            originalConsole.log.apply(console, args);
        };
        
        console.info = (...args) => {
            this.addToQueue('info', args, this.getCallerInfo());
            originalConsole.info.apply(console, args);
        };
        
        console.warn = (...args) => {
            this.addToQueue('warn', args, this.getCallerInfo());
            originalConsole.warn.apply(console, args);
        };
        
        console.error = (...args) => {
            this.addToQueue('error', args, this.getCallerInfo());
            originalConsole.error.apply(console, args);
        };
        
        console.debug = (...args) => {
            this.addToQueue('debug', args, this.getCallerInfo());
            originalConsole.debug.apply(console, args);
        };
    }
    
    setupErrorHandling() {
        window.addEventListener('error', (event) => {
            const location = `${event.filename.split('/').pop()}:${event.lineno}:${event.colno}`;
            this.addToQueue('error', [`Uncaught error: ${event.message}`, 
                                     `at ${location}`,
                                     event.error?.stack]);
        });
        
        window.addEventListener('unhandledrejection', (event) => {
            this.addToQueue('error', [`Unhandled Promise rejection: ${event.reason}`,
                                     event.reason?.stack]);
        });
        
        // Additional events
        window.addEventListener('load', () => {
            this.addToQueue('info', ['Page fully loaded']);
            this.logResourceStats();
        });
        
        // Track page visibility changes
        document.addEventListener('visibilitychange', () => {
            this.addToQueue('info', [`Page visibility changed: ${document.visibilityState}`]);
        });
    }
    
    logResourceStats() {
        if (!window.performance || !window.performance.getEntriesByType) return;
        
        const resources = window.performance.getEntriesByType('resource');
        let stats = {
            totalResources: resources.length,
            totalSize: 0,
            totalTime: 0,
            slowestResource: { name: 'none', time: 0 }
        };
        
        resources.forEach(resource => {
            const size = resource.transferSize || 0;
            const time = resource.duration || 0;
            
            stats.totalSize += size;
            stats.totalTime += time;
            
            if (time > stats.slowestResource.time) {
                stats.slowestResource = {
                    name: resource.name.split('/').pop(), // Just the filename
                    time: time
                };
            }
        });
        
        // Convert totalSize to KB for readability
        stats.totalSize = (stats.totalSize / 1024).toFixed(2) + ' KB';
        stats.totalTime = stats.totalTime.toFixed(2) + ' ms';
        stats.slowestResource.time = stats.slowestResource.time.toFixed(2) + ' ms';
        
        this.addToQueue('info', [`Page resource stats: ${JSON.stringify(stats)}`]);
    }
    
    addToQueue(level, args, source = '') {
        // Don't queue logs in production
        if (this.isProduction) return;
        
        try {
            const timestamp = new Date().toISOString();
            let message = args.map(arg => {
                if (typeof arg === 'object') {
                    try {
                        return JSON.stringify(arg);
                    } catch (e) {
                        return String(arg);
                    }
                }
                return String(arg);
            }).join(' ');
            
            // Add source information if available
            if (source) {
                message = `[${source}] ${message}`;
            }
            
            const logEntry = {
                timestamp,
                level,
                message,
                source
            };
            
            this.logQueue.push(logEntry);
            
            // Flush immediately for errors
            if (level === 'error') {
                this.flushLogs();
            }
        } catch (e) {
            // Don't break if there's an error in logging
        }
    }
    
    async flushLogs(isUnloading = false) {
        // Skip if no logs or already sending
        if (this.logQueue.length === 0 || this.isSending) return;
        
        // Mark as sending to prevent concurrent sends
        this.isSending = true;
        
        const logs = [...this.logQueue];
        this.logQueue = [];
        
        try {
            const fetchOptions = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ logs }),
                // For page unload, use keepalive to ensure the request completes
                keepalive: isUnloading
            };
            
            await fetch('/api/client-logs', fetchOptions);
        } catch (e) {
            // If sending fails, add logs back to the queue
            this.logQueue = [...logs, ...this.logQueue];
        } finally {
            this.isSending = false;
        }
    }
}

class MusicPlayer {
    constructor() {
        // Initialize the song cache
        this.songCache = new SongCache();
        
        // Initialize UI manager
        this.uiManager = new UIManager();
        
        // Initialize audio player
        this.audioPlayer = new AudioPlayer();
        this.audioPlayer.onPlay = () => this.handlePlayEvent();
        this.audioPlayer.onEnded = () => this.handleEndEvent();
        this.audioPlayer.onError = (error) => this.handleErrorEvent(error);
        
        // Add custom event for song changes
        this.audioPlayer.eventListeners.songChanged = [];
        
        // Initialize song list manager with elements and config
        this.songListContainer = document.querySelector('.songs-container');
        this.songListManager = new SongListManager(this.songListContainer, {
            loadChunk: 20,
            totalSongs: 100,
            cooldownTime: 500
        });
        
        // Initialize playlist manager
        this.playlistManager = new PlaylistManager();
        
        // Store play state
        this.isPlaying = false;
        this.currentSong = null;
        this.currentSongIndex = -1;
        
        // Set up event handlers
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Audio player events
        this.audioPlayer.addEventListener('timeupdate', () => {
            // Update UI based on our reliable position tracker
            this.uiManager.updateProgress(
                this.audioPlayer.currentTime,
                this.audioPlayer.duration
            );
        });

        // Listen for song changed events to update like button state
        this.audioPlayer.addEventListener('songChanged', (event) => {
            if (event && event.songId) {
                console.log('Song changed event detected, updating like button state for song ID:', event.songId);
                
                // Create a centralized approach to updating like button state
                this._updateSongLikeState(event.songId);
            }
        });

        this.audioPlayer.addEventListener('ended', () => {
            if (this.shuffleEnabled) {
                this.playRandomSong();
            } else if (this.currentSongIndex < this.songListManager.songs.length - 1) {
                this.playSong(this.songListManager.songs[this.currentSongIndex + 1]);
            }
        });

        this.audioPlayer.addEventListener('error', (e) => {
            console.error('Audio playback error:', e);
            
            // Get more detailed error information if available
            let errorMessage = 'Error playing the song.';
            if (e.error && e.error.message) {
                errorMessage += ' ' + e.error.message;
            } else if (e.error && e.error.code) {
                // Translate error codes to user-friendly messages
                switch (e.error.code) {
                    case 1: // MEDIA_ERR_ABORTED
                        errorMessage = 'Playback aborted by the system.';
                        break;
                    case 2: // MEDIA_ERR_NETWORK
                        errorMessage = 'Network error occurred during playback. Please check your connection.';
                        break;
                    case 3: // MEDIA_ERR_DECODE
                        errorMessage = 'Unable to decode the audio. The file might be corrupted.';
                        break;
                    case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
                        errorMessage = 'Audio format not supported by your browser.';
                        break;
                    default:
                        errorMessage = 'Unknown playback error occurred.';
                }
            }
            
            // Show error message to user
            this.uiManager.showNotification(errorMessage, 'error');
            
            // Try again after a short delay for network-related errors
            if (e.error && e.error.code === 2) {
                setTimeout(() => {
                    if (this.currentSongIndex >= 0 && this.songListManager.songs[this.currentSongIndex]) {
                        console.log('Retrying playback after network error...');
                        this.playSong(this.songListManager.songs[this.currentSongIndex]);
                    }
                }, 3000);
            }
        });

        // Listen for play events
        this.audioPlayer.addEventListener('play', () => {
            this.uiManager.updatePlayPauseButton(true);
        });

        // Listen for pause events
        this.audioPlayer.addEventListener('pause', () => {
            this.uiManager.updatePlayPauseButton(false);
        });

        // Listen for seek events
        this.audioPlayer.addEventListener('seek', (e) => {
            console.log('Received seek event with position:', this.formatTime(e.position));
            
            // Update UI immediately with the new position
            this.uiManager.updateProgress(
                e.position,
                this.audioPlayer.duration
            );
            
            this.seekInProgress = false;
        });

        // Add repeat change event listener
        this.audioPlayer.addEventListener('repeatChanged', (e) => {
            console.log('Repeat state changed:', e.isRepeatEnabled);
            this.uiManager.updateRepeatButton(e.isRepeatEnabled);
        });

        // UI event handlers
        this.uiManager.onPlayPauseClick = () => this.handlePlayPause();
        this.uiManager.onPreviousClick = () => this.playPrevious();
        this.uiManager.onNextClick = () => this.playNext();
        
        // Add repeat toggle handler
        this.uiManager.onRepeatToggle = () => this.toggleRepeat();
        
        // Add shuffle toggle handler
        this.uiManager.onShuffleToggle = () => this.toggleShuffle();
        
        // Add like toggle handler
        this.uiManager.onLikeToggle = () => {
            console.log('Like button clicked in UI');
            this.toggleLike();
        };
        
        // Add view change handler
        this.uiManager.onViewChange = (view) => {
            console.log('Changing view to:', view);
            this.changeView(view);
        };
        
        // Add album art click handler for metadata panel
        this.uiManager.onAlbumArtClick = () => {
            console.log('Album art clicked, showing metadata panel');
            this.showSongMetadata();
        };
        
        this.uiManager.onProgressClick = (position) => {
            if (!this.currentSong || !this.audioPlayer.duration) return;
            
            // Mark that we're in the middle of a seek operation
            this.seekInProgress = true;
            
            // Calculate the target time
            const seekTime = position * this.audioPlayer.duration;
            console.log('UI Progress click seeking to:', this.formatTime(seekTime));
            
            // Use our reliable seek method
            this.audioPlayer.seek(seekTime);
        };
        this.uiManager.onVolumeChange = (volume) => {
            this.audioPlayer.volume = volume;
            this.uiManager.updateVolume(volume);
        };
        this.uiManager.onSearch = (searchTerm) => {
            const filteredSongs = this.songListManager.filterSongs(searchTerm);
            this.displaySongs(filteredSongs);
        };

        // Override SongListManager's displaySongs method
        this.songListManager.displaySongs = () => {
            this.displaySongs(this.songListManager.songs);
        };
    }

    formatTime(seconds) {
        seconds = Math.floor(seconds);
        const minutes = Math.floor(seconds / 60);
        seconds = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    async initializeApplication() {
        console.log('Initializing music player application...');
        
        try {
            // Override the displaySongs method
            this.songListManager.displaySongs = (songs) => this.displaySongs(songs || this.songListManager.songs);
            
            // Create global reference to the music player for other components
            window.musicPlayer = this;
            console.log('Set global musicPlayer reference');
            
            // Try to load songs from cache first for immediate display
            const cachedSongs = await this.songCache.getCachedSongs();
            if (cachedSongs && cachedSongs.length > 0) {
                console.log(`Loaded ${cachedSongs.length} songs from cache for immediate display`);
                this.songListManager.songs = cachedSongs;
                this.songListManager.songIdSet = new Set(cachedSongs.map(song => song.id));
                this.displaySongs(cachedSongs);
                
                // Set up lazy loading while fetching fresh data
                this._setupLazyLoading();
            }
            
            // Load initial songs from API (in parallel with showing cached songs)
            const initialResponse = await fetch('/api/songs?offset=0&limit=20', {
                headers: {
                    'Cache-Control': 'max-age=300' // Add caching headers
                }
            });
            
            if (!initialResponse.ok) throw new Error('Failed to fetch initial songs');
            
            const initialData = await initialResponse.json();
            const songs = initialData.songs || [];
            
            // Store songs in our song manager and cache
            if (songs.length > 0) {
                songs.forEach(song => this.songListManager.songIdSet.add(song.id));
                this.songListManager.songs = songs;
                this.songListManager.hasMoreSongs = initialData.has_more;
                this.songListManager.totalSongsCount = initialData.total;
                
                // Update display if we didn't have cached songs
                if (!cachedSongs || cachedSongs.length === 0) {
                    this.displaySongs(songs);
                }
                
                // Cache the songs for next time
                this.songCache.cacheSongs(songs);
            }
            
            // Set up lazy loading for song thumbnails
            this._setupLazyLoading();
            
            // Preload a few thumbnails for better UX
            this._preloadThumbnails();
            
            // Load liked songs from cache first
            const cachedLikedSongs = await this.songCache.getCachedLikedSongs();
            if (cachedLikedSongs && cachedLikedSongs.length > 0) {
                console.log(`Loaded ${cachedLikedSongs.length} liked songs from cache`);
                if (this.playlistManager) {
                    this.playlistManager.likedSongs = cachedLikedSongs;
                    this.playlistManager._renderLikedSongs();
                    this.songListManager.loadLikedSongs(cachedLikedSongs);
                }
            }
            
            // Then load fresh liked songs from database if authenticated
            await this._loadUserLikedSongsIntoMemory();
            
            // Load active playlist songs into memory
            this._loadVisiblePlaylistSongsIntoMemory();
            
            console.log('Music player application initialized successfully!');
        } catch (error) {
            console.error('Failed to initialize application:', error);
            this.uiManager.showNotification('Error loading songs. Please try refreshing the page.', 'error');
        }
    }
    
    /**
     * Load the current user's liked songs into memory
     */
    async _loadUserLikedSongsIntoMemory() {
        if (isAuthenticated()) {
            console.log('User is authenticated, preloading liked songs into memory');
            
            try {
                // Use the playlistManager's liked songs if available
                if (this.playlistManager && this.playlistManager.likedSongs && 
                    this.playlistManager.likedSongs.length > 0) {
                    
                    console.log('Using liked songs from PlaylistManager, count:', this.playlistManager.likedSongs.length);
                    this.songListManager.loadLikedSongs(this.playlistManager.likedSongs);
                    
                    // Cache liked songs for future use
                    this.songCache.cacheLikedSongs(this.playlistManager.likedSongs);
                } else {
                    // Otherwise fetch liked songs directly
                    console.log('Fetching liked songs directly from API');
                    const response = await authFetch('/api/liked-songs', {
                        headers: {
                            'Cache-Control': 'max-age=300' // Add caching
                        }
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        if (data.songs && data.songs.length > 0) {
                            console.log(`Loading ${data.songs.length} liked songs into memory from API`);
                            this.songListManager.loadLikedSongs(data.songs);
                            
                            // Also update the PlaylistManager's liked songs for consistency
                            if (this.playlistManager) {
                                this.playlistManager.likedSongs = data.songs;
                                this.playlistManager._saveToStorage();
                                this.playlistManager._renderLikedSongs();
                            }
                            
                            // Cache liked songs for future use
                            this.songCache.cacheLikedSongs(data.songs);
                        }
                    }
                }
            } catch (error) {
                console.error('Error loading liked songs into memory:', error);
                // Non-critical error, continue without liked songs in memory
            }
        }
    }
    
    /**
     * Load currently visible playlist songs into memory
     */
    _loadVisiblePlaylistSongsIntoMemory() {
        if (!this.playlistManager || !this.playlistManager.playlists) {
            return;
        }
        
        const activeView = document.querySelector('.view-container.active');
        if (!activeView) return;
        
        const playlistId = activeView.getAttribute('data-playlist-id');
        if (!playlistId) return;
        
        const playlist = this.playlistManager.playlists.find(p => p.id === playlistId);
        if (playlist && playlist.songs && playlist.songs.length > 0) {
            console.log(`Loading songs from active playlist "${playlist.name}" into memory`);
            this.songListManager.loadPlaylistSongs(playlist.songs);
        }
    }

    // Add a method to preload thumbnails
    _preloadThumbnails() {
        // Preload the first 10 thumbnails
        console.log('Preloading thumbnails for better performance...');
        const songsToPreload = this.songListManager.songs.slice(0, 10);
        
        songsToPreload.forEach(song => {
            if (song && song.id) {
                const img = new Image();
                img.src = `/api/thumbnail/${song.id}?t=${Date.now()}`;
                console.log('Preloading thumbnail:', img.src);
            }
        });
    }

    displaySongs(songs) {
        const container = document.querySelector('.songs-container');
        if (!container) {
            console.error('Songs container element not found');
            return;
        }
        
        container.innerHTML = '';
        
        if (songs.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-songs-message';
            emptyMessage.textContent = 'No songs found';
            container.appendChild(emptyMessage);
            return;
        }
        
        // Use a document fragment for better performance
        const fragment = document.createDocumentFragment();
        
        songs.forEach(song => {
            const songElement = this.uiManager.createSongElement(
                song,
                this.currentSong && song.id === this.currentSong.id
            );
            songElement.addEventListener('click', () => this.playSong(song));
            fragment.appendChild(songElement);
        });
        
        // Add all songs at once for better performance
        container.appendChild(fragment);
        
        // Lazy load images as they come into view
        this._setupLazyLoading();
    }

    _setupLazyLoading() {
        // Use IntersectionObserver for lazy loading
        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        const dataSrc = img.getAttribute('data-src');
                        
                        if (dataSrc) {
                            img.src = dataSrc;
                            img.removeAttribute('data-src');
                        }
                        
                        observer.unobserve(img);
                    }
                });
            });
            
            // Observe all song thumbnails
            document.querySelectorAll('img[data-src]').forEach(img => {
                observer.observe(img);
            });
        } else {
            // Fallback for browsers that don't support IntersectionObserver
            document.querySelectorAll('img[data-src]').forEach(img => {
                img.src = img.getAttribute('data-src');
            });
        }
    }

    /**
     * Play a song
     * @param {Object} song - The song to play
     */
    async playSong(song) {
        if (!song) {
            console.error('Cannot play song: no song provided');
            return;
        }
        
        // Store the song that was requested to play
        const songToPlay = song;
        console.log('Playing song:', songToPlay);
        
        try {
            // Update UI with song info first for immediate feedback
            this.updateSongInfo(songToPlay);
            
            // Set the audio source and play
            await this.audioPlayer.playSong(songToPlay);
            
            // Save as current song
            this.currentSong = songToPlay;
            
            // Save to recently played
            this._addToRecentlyPlayed(songToPlay);
            
            // CRITICAL: Set like button state immediately based on liked songs list
            if (songToPlay.id && this.playlistManager) {
                console.log('Setting initial like state for song:', songToPlay.id);
                // First try by ID
                const isLiked = this.playlistManager.likedSongs.some(
                    likedSong => likedSong && likedSong.id === songToPlay.id
                );
                
                // Update UI
                if (this.uiManager) {
                    this.uiManager.updateLikeButton(isLiked);
                }
                
                // Also use the more robust method as a backup
                this.playlistManager.setInitialLikeState(
                    songToPlay.id, 
                    songToPlay.title, 
                    songToPlay.artist
                );
            }
        } catch (error) {
            console.error('Error playing song:', error);
            this.uiManager.showNotification('Failed to play song', 'error');
        }
    }

    handlePlayPause() {
        if (!this.currentSong) return;
        
        if (this.audioPlayer.paused) {
            this.audioPlayer.resume()
                .then(() => this.uiManager.updatePlayPauseButton(true))
                .catch(error => {
                    console.error('Error playing song:', error);
                    this.uiManager.updatePlayPauseButton(false);
                });
        } else {
            this.audioPlayer.pause();
            this.uiManager.updatePlayPauseButton(false);
        }
    }

    playPrevious() {
        if (this.currentSongIndex > 0) {
            const prevSong = this.songListManager.songs[this.currentSongIndex - 1];
            if (prevSong && prevSong.id) {
                // Update like status before playing the song
                this.updateLikeStatus(prevSong.id);
            }
            this.playSong(prevSong);
        }
    }

    playNext() {
        if (this.currentSongIndex < this.songListManager.songs.length - 1) {
            const nextSong = this.songListManager.songs[this.currentSongIndex + 1];
            if (nextSong && nextSong.id) {
                // Update like status before playing the song
                this.updateLikeStatus(nextSong.id);
            }
            this.playSong(nextSong);
        }
    }

    /**
     * Update song information in the UI
     * @param {Object} song - The song object
     */
    updateSongInfo(song) {
        if (!song) {
            console.warn('Cannot update song info: No song provided');
            return;
        }
        
        console.log('Updating song info:', {
            id: song.id,
            title: song.title,
            artist: song.artist
        });
        
        // Store current song
        this.currentSong = song;
        
        // Update UI elements
        this.uiManager.updateCurrentSong(song);
        this.uiManager.updatePlayPauseButton(true);
        
        // Update the document title
        document.title = `${song.title} - ${song.artist || 'Unknown Artist'}`;
        
        // Update like button state - this is critical for maintaining correct UI state
        if (song.id && this.playlistManager) {
            console.log('Updating like button state for song:', song.id);
            
            // Use the PlaylistManager's method for handling like state
            this.playlistManager.setInitialLikeState(
                song.id,
                song.title,
                song.artist
            );
        } else {
            console.warn('Cannot update like status: Missing song ID or PlaylistManager');
        }
        
        // Load songs around current song for better UX (do this asynchronously)
        if (this.songListManager) {
            this.songListManager.loadSongsAroundIndex(this.currentSongIndex)
                .catch(err => console.error('Error loading songs around current index:', err));
        }
    }

    // Toggle repeat mode
    toggleRepeat() {
        const isRepeatEnabled = this.audioPlayer.toggleRepeat();
        console.log(`Repeat mode ${isRepeatEnabled ? 'enabled' : 'disabled'}`);
        // UI is updated via the repeatChanged event
    }
    
    // Toggle shuffle mode
    toggleShuffle() {
        this.shuffleEnabled = !this.shuffleEnabled;
        console.log(`Shuffle mode ${this.shuffleEnabled ? 'enabled' : 'disabled'}`);
        this.uiManager.updateShuffleButton(this.shuffleEnabled);
    }
    
    // Toggle like status
    toggleLike() {
        if (!this.currentSong) {
            this.uiManager.showNotification('No song is currently playing', 'info');
            return;
        }
        
        console.log('Toggling like status for current song:', this.currentSong.title);
        
        // Call the playlistManager's toggleLike method if available
        if (this.playlistManager) {
            try {
                this.playlistManager.toggleLike();
                
                // Update UI after toggle
                setTimeout(() => {
                    // Check if the song is now liked
                    this.updateLikeStatus(this.currentSong.id);
                }, 100); // Small delay to allow toggle to complete
            } catch (error) {
                console.error('Error toggling like status:', error);
                this.uiManager.showNotification('Error updating like status', 'error');
            }
        } else {
            console.error('PlaylistManager not available');
            this.uiManager.showNotification('Unable to like song: playlist manager not initialized', 'error');
        }
    }
    
    // Update like button based on current song
    updateLikeStatus(songId) {
        if (!this.playlistManager) {
            console.warn('Cannot update like status: PlaylistManager not available');
            return;
        }
        
        if (!songId) {
            console.warn('Cannot update like status: No song ID provided');
            return;
        }
        
        try {
            // Check if we have a UI manager to update
            if (!this.uiManager) {
                console.warn('Cannot update like status: UIManager not available');
                return;
            }
            
            console.log('Checking if song is liked:', {
                id: songId
            });
            
            // Check if the song is in the liked songs list
            const isLiked = this.playlistManager.likedSongs.some(song => 
                song && song.id === songId
            );
            
            console.log('Song like status:', {
                id: songId,
                isLiked: isLiked
            });
            
            // Update our UI - do this in a setTimeout to ensure it runs after any current execution
            setTimeout(() => {
                this.uiManager.updateLikeButton(isLiked);
                
                // Also update any song rows in the list view through the PlaylistManager
                if (this.playlistManager && typeof this.playlistManager._updateSongLikeStateInLists === 'function') {
                    this.playlistManager._updateSongLikeStateInLists(songId, isLiked);
                }
            }, 0);
        } catch (error) {
            console.error('Error updating like status:', error);
        }
    }
    
    // Change the current view
    changeView(view) {
        console.log('Changing to view:', view);
        this.uiManager.showView(view);
    }

    // Show song metadata panel
    async showSongMetadata() {
        if (!this.currentSong) {
            console.warn('No current song to show metadata for');
            return;
        }
        
        try {
            console.log(`Fetching metadata for song ID: ${this.currentSong.id}`);
            
            // Show loading state
            this.uiManager.showNotification('Loading song details...', 'info');
            
            // Fetch metadata from API
            const response = await fetch(`/api/song-metadata/${this.currentSong.id}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch metadata: ${response.status} ${response.statusText}`);
            }
            
            const metadata = await response.json();
            console.log('Received song metadata:', metadata);
            
            // Display metadata in UI
            this.uiManager.showMetadataPanel(metadata);
            
        } catch (error) {
            console.error('Error fetching song metadata:', error);
            this.uiManager.showNotification('Error loading song details', 'error');
        }
    }

    // Play a random song (for shuffle mode)
    playRandomSong() {
        const availableSongs = this.songListManager.songs;
        if (availableSongs.length === 0) return;
        
        // Don't play the current song again
        const filteredSongs = availableSongs.filter(song => 
            !this.currentSong || song.id !== this.currentSong.id
        );
        
        if (filteredSongs.length === 0) {
            // If there's only one song, play it again
            this.playSong(this.currentSong);
            return;
        }
        
        // Pick a random song
        const randomIndex = Math.floor(Math.random() * filteredSongs.length);
        const randomSong = filteredSongs[randomIndex];
        
        this.playSong(randomSong);
    }

    /**
     * Initialize the application
     */
    init() {
        this._setupEventListeners();
        this._loadLastPlayedState();
        
        // Initialize components
        this.audioPlayer.init();
        this.songListManager.init();
        this.uiManager.init();
        this.playlistManager.init();
        
        console.log('Music Player initialized');
        
        // Set global reference
        window.musicPlayer = this;
        
        // Check if we need to refresh liked songs after auth
        if (window.refreshLikedSongsOnReady === true) {
            console.log('Refreshing liked songs from init (delayed from auth)');
            setTimeout(() => {
                if (this.playlistManager) {
                    this.playlistManager.refreshAfterAuthChange();
                }
                window.refreshLikedSongsOnReady = false;
            }, 1000);
        }
    }

    /**
     * Add a song to the recently played list
     * @param {Object} song - The song to add
     * @private
     */
    _addToRecentlyPlayed(song) {
        if (!song || !song.id) return;
        
        // Add to recently played list
        if (!this.recentlyPlayed) {
            this.recentlyPlayed = [];
        }
        
        // Remove the song if it already exists in the list
        this.recentlyPlayed = this.recentlyPlayed.filter(s => s.id !== song.id);
        
        // Add to the beginning of the list
        this.recentlyPlayed.unshift(song);
        
        // Limit the list to 20 songs
        if (this.recentlyPlayed.length > 20) {
            this.recentlyPlayed.pop();
        }
        
        // Save to localStorage
        localStorage.setItem('recentlyPlayed', JSON.stringify(this.recentlyPlayed));
    }

    /**
     * Update the like state for a song across the entire application
     * @param {string} songId - The ID of the song to update
     * @private
     */
    _updateSongLikeState(songId) {
        if (!songId) {
            console.warn('Cannot update song like state: No song ID provided');
            return;
        }
        
        console.log('Updating like state across application for song ID:', songId);
        
        // 1. Update through PlaylistManager if available
        if (this.playlistManager) {
            console.log('Updating like state through PlaylistManager');
            const isLiked = this.playlistManager._updateLikeButtonState(songId);
            
            // 2. Also update through UIManager directly as a fallback
            if (this.uiManager) {
                console.log('Also updating like state through UIManager');
                this.uiManager.updateLikeButton(isLiked);
            }
            
            // Log the final state for debugging
            console.log(`Final like state for song ${songId}: ${isLiked}`);
        } else {
            // If no PlaylistManager, fall back to the updateLikeStatus method
            console.log('PlaylistManager not available, using updateLikeStatus fallback');
            this.updateLikeStatus(songId);
        }
    }
}

// Main initialization function
async function initApp() {
    try {
        console.log('Initializing application...');
        
        // Create and initialize the music player as early as possible
        window.musicPlayer = new MusicPlayer();
        
        // Initialize the application after DOM content is loaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                console.log('DOM content loaded, initializing app components');
                window.musicPlayer.initializeApplication().catch(error => {
                    console.error('Error initializing music player:', error);
                });
            });
        } else {
            // DOM already loaded, initialize immediately
            console.log('DOM already loaded, initializing app components immediately');
            await window.musicPlayer.initializeApplication();
        }
        
    } catch (error) {
        console.error('Failed to initialize application:', error);
        alert('An error occurred during application initialization. Please refresh the page and try again.');
    }
}

// Start initialization
initApp();

// Make authFetch available globally for service worker and other components
window.authFetch = authFetch; 