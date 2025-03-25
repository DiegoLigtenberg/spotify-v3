import AudioPlayer from './modules/AudioPlayer.js';
import SongListManager from './modules/SongListManager.js';
import UIManager from './modules/UIManager.js';
import PlaylistManager from './modules/PlaylistManager.js';
import { authFetch, isAuthenticated, getAuthToken } from './modules/supabase/auth.js';

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
        
        // Initialize audio player components and state
        this.audio = new Audio();
        this.audio._eventListeners = {}; // Add storage for event listeners
        this.isLoading = false; // Add loading state flag
        this.currentAbortController = null; // For aborting fetch requests
        
        // Detect iOS Safari for special handling
        this.isIOSSafari = this._detectIOSSafari();
        if (this.isIOSSafari) {
            console.log('iOS Safari detected, enabling special audio handling');
        }
        
        // Initialize song list manager with elements and config
        this.songListContainer = document.querySelector('.songs-container');
        this.songListManager = new SongListManager(this.songListContainer, {
            loadChunk: 15,
            totalSongs: 40,
            cooldownTime: 500
        });
        
        // Initialize playlist manager
        this.playlistManager = new PlaylistManager();
        
        // Store play state
        this.isPlaying = false;
        this.currentSong = null;
        this.currentSongIndex = -1;
        this.recentlyPlayed = [];
        this.recentRandoms = new Set();
        
        // Configure audio state
        this.shuffleEnabled = false;
        this.repeatEnabled = false;
        
        // Set up event handlers
        this.setupEventListeners();
    }
    
    // Helper to detect iOS Safari
    _detectIOSSafari() {
        const ua = navigator.userAgent.toLowerCase();
        const isIOS = /iphone|ipad|ipod/.test(ua);
        const isSafari = /safari/.test(ua) && !/chrome/.test(ua);
        return isIOS && isSafari;
    }

    setupEventListeners() {
        // Set up audio event listeners for progress and time updates
        const trackEventListener = (event, listener) => {
            if (!this.audio._eventListeners[event]) {
                this.audio._eventListeners[event] = [];
            }
            this.audio._eventListeners[event].push(listener);
            this.audio.addEventListener(event, listener);
        };

        trackEventListener('timeupdate', () => {
            if (!this.audio.duration) return;
            const currentTime = this.audio.currentTime;
            const duration = this.audio.duration;
            this.uiManager.updateProgress(currentTime, duration);
        });

        trackEventListener('ended', () => {
            console.log('Song ended, playing next');
            this.playNext();
        });

        trackEventListener('error', (e) => {
            console.error('Audio error:', e);
            this.uiManager.showNotification('Error playing song', 'error');
            this.isLoading = false;
        });

        trackEventListener('play', () => {
            this.uiManager.updatePlayPauseButton(true);
        });

        trackEventListener('pause', () => {
            this.uiManager.updatePlayPauseButton(false);
        });

        // Connect UI manager events to audio controls
        this.uiManager.onPlayPauseClick = () => this.handlePlayPause();
        this.uiManager.onPreviousClick = () => this.playPrevious();
        this.uiManager.onNextClick = () => this.playNext();
        
        // Add repeat toggle handler
        this.uiManager.onRepeatToggle = () => this.toggleRepeat();
        
        // Add shuffle toggle handler
        this.uiManager.onShuffleToggle = () => this.toggleShuffle();
        
        // Add like toggle handler
        this.uiManager.onLikeToggle = () => this.toggleLike();
        
        // Add album art click handler to show song metadata
        this.uiManager.onAlbumArtClick = () => this.showSongMetadata();
        
        this.uiManager.onProgressClick = (position) => {
            if (!this.audio.duration) return;
            
            // Prevent seeking if still loading
            if (this.isLoading) {
                console.log('Song is still loading, ignoring seek request');
                return;
            }
            
            const seekTime = position * this.audio.duration;
            this.audio.currentTime = seekTime;
            this.uiManager.updateProgress(seekTime, this.audio.duration);
        };
        
        this.uiManager.onVolumeChange = (volume) => {
            this.audio.volume = volume;
            this.uiManager.updateVolume(volume);
        };
        
        // Set up song click listeners - using event delegation for better performance
        document.addEventListener('click', (event) => {
            // Handle song card clicks
            const songCard = event.target.closest('.song-card');
            if (songCard) {
                const songId = songCard.dataset.songId;
                if (songId) {
                    // Save the scroll position before playing the song
                    const container = songCard.closest('.songs-container');
                    const scrollTop = container ? container.scrollTop : 0;
                    
                    // Set flag to prevent list rebuilding when song clicked
                    this.ignoreNextDisplayCall = true;
                    
                    // Find and play the song
                    const song = this.songListManager.songs.find(s => s.id === songId);
                    if (song) {
                        // Prevent default to avoid any browser scrolling behavior
                        event.preventDefault();
                        
                        // Play the song
                        this.playSong(song);
                        
                        // Restore scroll position with a slight delay to ensure DOM updates
                        if (container) {
                            requestAnimationFrame(() => {
                                container.scrollTop = scrollTop;
                            });
                        }
                    }
                }
            }
        });

        // Set up tag filter dropdown
        const tagSelect = document.getElementById('top-tags');
        if (tagSelect) {
            tagSelect.addEventListener('change', (event) => {
                const selectedTag = event.target.value;
                
                // If we're not on the home view, switch to it
                const homeView = document.getElementById('home-view');
                const activeView = document.querySelector('.view-container.active');
                
                if (activeView !== homeView) {
                    const navItem = document.querySelector('.sidebar-nav-item[data-view="home"]');
                    if (navItem) {
                        navItem.click();
                    }
                }
                
                // Update song list with the selected tag
                this.songListManager.setTag(selectedTag);
            });
        }
    }

    async initializeApplication() {
        console.log('Initializing music player application...');
        
        try {
            // Override the displaySongs method
            this.songListManager.displaySongs = (songs) => this.displaySongs(songs || this.songListManager.songs);
            
            // Create global reference to the music player for other components
            window.musicPlayer = this;
            console.log('Set global musicPlayer reference');
            
            // Load top tags for the dropdown
            this._loadTopTags();
            
            // Set up iOS-specific audio handling
            if (this.isIOSSafari) {
                this._setupIOSAudioHandling();
            }
            
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
        // Only preload a limited number of thumbnails to avoid overwhelming the browser
        console.log('Preloading thumbnails for better performance...');
        const songsToPreload = this.songListManager.songs.slice(0, 5);
        
        // Use a queue system to load images one at a time
        let loadIndex = 0;
        const loadNextThumbnail = () => {
            if (loadIndex >= songsToPreload.length) return;
            
            const song = songsToPreload[loadIndex++];
            if (song && song.id) {
                const img = new Image();
                // Add timestamp to prevent caching issues
                img.src = `/api/thumbnail/${song.id}?t=${Date.now()}`;
                img.onload = () => {
                    console.log(`Successfully preloaded thumbnail for song ${song.id}`);
                    // Update any visible instances of this thumbnail
                    document.querySelectorAll(`[data-song-id="${song.id}"] img`).forEach(imgElement => {
                        imgElement.src = img.src;
                        imgElement.classList.add('loaded');
                    });
                    // Load the next one
                    setTimeout(loadNextThumbnail, 100);
                };
                img.onerror = () => {
                    console.warn(`Failed to preload thumbnail for song ${song.id}`);
                    // Still try to load the next one
                    setTimeout(loadNextThumbnail, 100);
                };
            } else {
                // Skip and move to next
                setTimeout(loadNextThumbnail, 10);
            }
        };
        
        // Start the loading queue
        loadNextThumbnail();
    }

    /**
     * Display songs in the song container
     * @param {Array} songs - Array of song objects to display
     */
    displaySongs(songs) {
        if (!songs || !Array.isArray(songs) || songs.length === 0) {
            console.log('No songs to display');
            return;
        }

        // Ignore display calls during song selection to prevent UI jumps
        if (this.isSelectingSong) {
            console.log('Ignoring display call during song selection');
            return;
        }

        const container = document.querySelector('.songs-container');
        if (!container) {
            console.error('Songs container not found');
            return;
        }

        // Clear existing songs
        container.innerHTML = '';

        // Render songs in batches for better performance
        const batchSize = 30;
        const renderBatch = (startIndex, endIndex) => {
            const fragment = document.createDocumentFragment();
            
            for (let i = startIndex; i < endIndex; i++) {
                const song = songs[i];
                if (!song) continue;

                const songCard = this.uiManager.createSongElement(song);
                if (songCard) {
                    fragment.appendChild(songCard);
                }
            }
            
            container.appendChild(fragment);
        };

        // Render first batch immediately
        renderBatch(0, Math.min(batchSize, songs.length));

        // Set up virtualized scrolling for the rest
        if (songs.length > batchSize) {
            const sentinel = document.createElement('div');
            sentinel.className = 'infinite-scroll-sentinel';
            container.appendChild(sentinel);

            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const currentCount = container.children.length - 1; // -1 for sentinel
                        if (currentCount < songs.length) {
                            renderBatch(currentCount, Math.min(currentCount + batchSize, songs.length));
                        }
                    }
                });
            }, {
                root: container,
                rootMargin: '100px'
            });

            observer.observe(sentinel);
        }

        // Set up lazy loading for images
        const lazyLoadImages = () => {
            const imageObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        const src = img.getAttribute('data-src');
                        if (src) {
                            img.src = src;
                            img.removeAttribute('data-src');
                        }
                    }
                });
            }, {
                rootMargin: '50px'
            });

            container.querySelectorAll('.lazy-thumbnail').forEach(img => {
                imageObserver.observe(img);
            });
        };

        // Initialize lazy loading after a short delay
        setTimeout(lazyLoadImages, 100);
    }

    /**
     * Play a song
     * @param {Object} song - The song to play
     */
    async playSong(song) {
        // Prevent multiple songs from playing simultaneously
        if (this.isLoading) {
            console.log('Already loading a song, ignoring request');
            return;
        }

        try {
            this.isLoading = true;
            
            // IMPORTANT: Store the current list ID to prevent redrawing when this song is playing
            const currentListId = this.lastRenderedListId;
            
            // Save the current scroll position before playing the song
            const scrollingElement = this.getCurrentScrollingElement();
            const currentScrollTop = scrollingElement ? scrollingElement.scrollTop : 0;
            
            // Cancel any previous pending requests
            if (this.currentAbortController) {
                this.currentAbortController.abort();
            }
            
            // Create new abort controller for this request
            this.currentAbortController = new AbortController();
            
            // Stop current audio first
            this.audio.pause();
            this.audio.currentTime = 0;
            
            console.log(`Playing song: ${song.title} by ${song.artist} (ID: ${song.id})`);
            
            // Only update the "now playing" UI without resetting the song list
            this.updateSongInfo(song);
            this.uiManager.updatePlayPauseButton(false);
            
            // Update the active state of song in the list without redrawing the list
            this.updateActiveSongInList(song.id);
            
            // Set src and load the new audio
            const songUrl = `/api/stream/${song.id}`;
            
            // For iOS Safari, we need to handle audio differently
            if (this.isIOSSafari) {
                console.log('Using iOS-optimized playback approach');
                
                // Add a timestamp to avoid caching issues
                this.audio.src = `${songUrl}?t=${Date.now()}`;
                this.audio.preload = 'auto';
                this.audio.load();
                
                // Create a timeout for loading
                const loadTimeout = setTimeout(() => {
                    console.warn('Audio loading timed out on iOS');
                    this.uiManager.showNotification('Playback may be delayed. Please wait...', 'info');
                }, 3000);
                
                try {
                    // Wait for canplaythrough or error
                    await new Promise((resolve, reject) => {
                        // Set up event listeners for this specific load
                        const canPlayHandler = () => {
                            clearTimeout(loadTimeout);
                            this.audio.removeEventListener('canplaythrough', canPlayHandler);
                            this.audio.removeEventListener('error', errorHandler);
                            resolve();
                        };
                        
                        const errorHandler = (e) => {
                            clearTimeout(loadTimeout);
                            this.audio.removeEventListener('canplaythrough', canPlayHandler);
                            this.audio.removeEventListener('error', errorHandler);
                            reject(new Error(`iOS audio load error: ${e.message}`));
                        };
                        
                        // Add event listeners
                        this.audio.addEventListener('canplaythrough', canPlayHandler, { once: true });
                        this.audio.addEventListener('error', errorHandler, { once: true });
                        
                        // For iOS, sometimes canplaythrough doesn't fire if the audio is too short
                        // In that case, we'll just continue after a short delay
                        setTimeout(() => {
                            if (this.audio.readyState >= 2) { // HAVE_CURRENT_DATA or better
                                canPlayHandler();
                            }
                        }, 1000);
                    });
                    
                    // Try to play - this requires user interaction on iOS
                    await this.audio.play();
                    console.log('iOS audio playback started successfully');
                } catch (playError) {
                    console.warn('iOS playback start failed:', playError);
                    
                    // If there's a NotAllowedError, it means we need user interaction
                    if (playError.name === 'NotAllowedError') {
                        // Instead of showing a button, we'll try to play on the next user interaction
                        const playOnNextInteraction = async (e) => {
                            e.preventDefault(); // Prevent default click behavior
                            
                            try {
                                await this.audio.play();
                                console.log('Audio started on user interaction');
                                this.uiManager.updatePlayPauseButton(true);
                                
                                // Remove all interaction listeners
                                ['click', 'touchstart', 'touchend'].forEach(eventType => {
                                    document.removeEventListener(eventType, playOnNextInteraction);
                                });
                            } catch (err) {
                                console.error('Still failed to play on user interaction:', err);
                                // Try one more time with a fresh audio element
                                this._recreateAudioElement();
                                this.uiManager.showNotification('Playback delayed. Try tapping play button again.', 'info');
                            }
                        };
                        
                        // Listen for user interaction
                        ['click', 'touchstart', 'touchend'].forEach(eventType => {
                            document.addEventListener(eventType, playOnNextInteraction, { once: true });
                        });
                        
                        // Show a notification to let the user know they need to interact
                        this.uiManager.showNotification('Tap anywhere to start audio playback', 'info');
                    } else {
                        // For other errors, try the normal approach
                        throw playError;
                    }
                }
            } else {
                // Non-iOS approach (simpler)
                this.audio.src = songUrl;
                
                // Wait for audio to be loaded before playing
                const loadPromise = new Promise((resolve, reject) => {
                    this.audio.oncanplaythrough = resolve;
                    this.audio.onerror = (e) => {
                        console.error('Audio load error:', e);
                        console.error('Audio element error code:', this.audio.error ? this.audio.error.code : 'unknown');
                        reject(new Error(`Failed to load audio: ${song.id}`));
                    };
                    
                    // Set a timeout to prevent indefinite waiting
                    setTimeout(() => reject(new Error('Audio load timeout')), 10000);
                });
                
                await loadPromise;
                
                // Try to play the audio
                await this.audio.play();
            }
            
            this.uiManager.updatePlayPauseButton(true);
            
            // Add to recently played
            this._addToRecentlyPlayed(song);
            
            // Update song's like state
            this._updateSongLikeState(song.id);
            
            // IMPORTANT: Restore the original list ID to prevent reordering
            this.lastRenderedListId = currentListId;
            
            // Restore the scroll position in case it changed
            if (scrollingElement) {
                requestAnimationFrame(() => {
                    scrollingElement.scrollTop = currentScrollTop;
                });
            }
        } catch (error) {
            console.error('Error playing song:', error);
            this.uiManager.showNotification(`Playback issue: ${error.message}`, 'error');
        } finally {
            this.isLoading = false;
        }
    }
    
    // Helper method to recreate audio element when needed (for stubborn iOS cases)
    _recreateAudioElement() {
        const oldAudio = this.audio;
        const volume = oldAudio.volume;
        const currentTime = oldAudio.currentTime;
        const src = oldAudio.src;
        
        // Create new audio element
        this.audio = new Audio();
        this.audio.volume = volume;
        this.audio.preload = 'auto';
        
        // Reattach all event listeners from the old audio element
        const events = ['timeupdate', 'ended', 'error', 'play', 'pause'];
        events.forEach(event => {
            const listeners = oldAudio._eventListeners?.[event] || [];
            listeners.forEach(listener => {
                this.audio.addEventListener(event, listener);
            });
        });
        
        // Set the source and try to maintain playback state
        if (src) {
            this.audio.src = src;
            this.audio.load();
            if (currentTime > 0) {
                this.audio.currentTime = currentTime;
            }
        }
        
        console.log('Audio element recreated for better iOS compatibility');
    }

    // New method to update active song in the list without redrawing everything
    updateActiveSongInList(songId) {
        const songContainers = document.querySelectorAll('.songs-container');
        
        songContainers.forEach(container => {
            // Remove 'playing' class from all songs
            const allSongCards = container.querySelectorAll('.song-card');
            allSongCards.forEach(card => card.classList.remove('playing'));
            
            // Add 'playing' class to the current song
            const currentSongCard = container.querySelector(`.song-card[data-song-id="${songId}"]`);
            if (currentSongCard) {
                currentSongCard.classList.add('playing');
            }
        });
    }

    handlePlayPause() {
        if (this.isLoading) {
            console.log('Song is still loading, ignoring play/pause request');
            return;
        }
        
        if (this.audio.paused) {
            // Special case for iOS Safari
            if (this.isIOSSafari) {
                console.log('iOS-optimized play/pause handling');
                
                try {
                    // For iOS Safari, we need to make sure the audio is properly loaded
                    if (!this.audio.src || this.audio.src === '') {
                        // No source, so nothing to play
                        console.warn('No audio source set, cannot play');
                        this.uiManager.showNotification('Please select a song first', 'info');
                        return;
                    }
                    
                    // Update UI immediately to provide feedback
                    this.uiManager.updatePlayPauseButton(true);
                    
                    // Try to play directly
                    this.audio.play()
                        .then(() => {
                            console.log('iOS playback started successfully');
                        })
                        .catch(err => {
                            console.error('iOS play error:', err);
                            
                            // If playback is not allowed, try reloading the audio
                            if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
                                // Just show a notification - no button needed
                                this.uiManager.showNotification('Tap the play button again to start audio', 'info');
                                
                                // Update UI to reflect paused state
                                this.uiManager.updatePlayPauseButton(false);
                                
                                // Force reload audio to make it work on next attempt
                                this.audio.load();
                            }
                        });
                } catch (e) {
                    console.error('Unexpected error during iOS play:', e);
                }
            } else {
                // Non-iOS browsers
                this.audio.play()
                    .then(() => this.uiManager.updatePlayPauseButton(true))
                    .catch(err => {
                        console.error('Error playing audio:', err);
                        this.uiManager.showNotification('Playback failed, please try again', 'error');
                        this.uiManager.updatePlayPauseButton(false);
                    });
            }
        } else {
            // Pause behavior is the same for all browsers
            this.audio.pause();
            this.uiManager.updatePlayPauseButton(false);
        }
    }

    playPrevious() {
        if (this.isLoading) {
            console.log('Song is still loading, ignoring previous request');
            return;
        }
        
        if (!this.currentSong) return;
        
        // If we're more than 3 seconds into the song, restart the current song
        if (this.audio.currentTime > 3) {
            this.audio.currentTime = 0;
            return;
        }
        
        const currentIndex = this.recentlyPlayed.findIndex(s => s.id === this.currentSong.id);
        if (currentIndex > 0) {
            // There's a previous song in history
            const previousSong = this.recentlyPlayed[currentIndex - 1];
            this.playSong(previousSong);
        } else {
            // Restart current song if no previous song
            this.audio.currentTime = 0;
        }
    }

    playNext() {
        if (this.isLoading) {
            console.log('Song is still loading, ignoring next request');
            return;
        }
        
        if (!this.currentSong) {
            // If no song is playing, play a random one
            if (this.songListManager.songs.length > 0) {
                this.playRandomSong();
            }
            return;
        }
        
        // Check if repeat is enabled
        if (this.repeatEnabled) {
            // Restart the current song
            this.audio.currentTime = 0;
            this.audio.play()
                .catch(err => console.error('Error replaying song:', err));
            return;
        }
        
        // If shuffle is enabled, play a random song
        if (this.shuffleEnabled) {
            this.playRandomSong();
            return;
        }
        
        // Otherwise try to play the next song in the current list
        const currentList = document.querySelector('.songs-container.active') || 
                           document.querySelector('.songs-container');
                           
        if (currentList) {
            // Save scroll position before finding next song
            const scrollTop = currentList.scrollTop;
            
            const songCards = currentList.querySelectorAll('.song-card');
            if (songCards.length > 0) {
                // Find the current song in the list
                let currentIndex = -1;
                for (let i = 0; i < songCards.length; i++) {
                    if (songCards[i].dataset.songId === this.currentSong.id) {
                        currentIndex = i;
                        break;
                    }
                }
                
                // If found and not the last song, play the next one
                if (currentIndex >= 0 && currentIndex < songCards.length - 1) {
                    const nextCard = songCards[currentIndex + 1];
                    const songId = nextCard.dataset.songId;
                    
                    // Find this song in our song list
                    const nextSong = this.songListManager.songs.find(s => s.id === songId);
                    if (nextSong) {
                        // IMPORTANT: Set flag to prevent list rebuilding when song clicked
                        this.ignoreNextDisplayCall = true;
                        
                        this.playSong(nextSong);
                        
                        // Restore scroll position with a delay to make sure DOM is updated
                        requestAnimationFrame(() => {
                            currentList.scrollTop = scrollTop;
                        });
                        
                        return;
                    }
                } else if (currentIndex === songCards.length - 1) {
                    // We're at the last visible song - load more content
                    console.log('At last song in visible list, loading more content if available');
                    
                    // Check if there are more songs to load
                    if (this.songListManager.hasMoreSongs) {
                        // Save list state to prevent jumps
                        this.ignoreNextDisplayCall = true;
                        
                        // Load more songs but don't change scroll position
                        this.songListManager.fetchMoreSongs('down')
                            .then(() => {
                                // Try to find the next song after loading more
                                requestAnimationFrame(() => {
                                    // Maintain scroll position
                                    currentList.scrollTop = scrollTop;
                                    
                                    // Get updated song list and find current song again
                                    const updatedSongCards = currentList.querySelectorAll('.song-card');
                                    let updatedIndex = -1;
                                    for (let i = 0; i < updatedSongCards.length; i++) {
                                        if (updatedSongCards[i].dataset.songId === this.currentSong.id) {
                                            updatedIndex = i;
                                            break;
                                        }
                                    }
                                    
                                    // If we found it and there's a next song now, play it
                                    if (updatedIndex >= 0 && updatedIndex < updatedSongCards.length - 1) {
                                        const nextCard = updatedSongCards[updatedIndex + 1];
                                        const nextSongId = nextCard.dataset.songId;
                                        const nextSong = this.songListManager.songs.find(s => s.id === nextSongId);
                                        if (nextSong) {
                                            this.playSong(nextSong);
                                        }
                                    } else {
                                        // Still no next song, just play random
                                        this.playRandomSong();
                                    }
                                });
                            });
                        return;
                    }
                }
            }
        }
        
        // As a fallback, play a random song
        this.playRandomSong();
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
        
        /* 
         * DISABLED: Don't load songs around current song when playing
         * This was causing list refreshes when clicking songs
         */
        /*
        // Load songs around current song for better UX (do this asynchronously)
        if (this.songListManager) {
            this.songListManager.loadSongsAroundIndex(this.currentSongIndex)
                .catch(err => console.error('Error loading songs around current index:', err));
        }
        */
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
        if (this.isLoading) {
            console.log('Song is still loading, ignoring random song request');
            return;
        }
        
        if (!this.songListManager || !this.songListManager.songs || this.songListManager.songs.length === 0) {
            console.warn('No songs available to play randomly');
            return;
        }
        
        // Keep track of songs that have been played recently to avoid repeats
        if (!this.recentRandoms) {
            this.recentRandoms = new Set();
        }
        
        const availableSongs = this.songListManager.songs.filter(song => 
            // Don't play the current song again or recently played songs
            song.id !== (this.currentSong ? this.currentSong.id : null) && 
            !this.recentRandoms.has(song.id)
        );
        
        // If we've played most of the songs, reset the tracking
        if (availableSongs.length < this.songListManager.songs.length * 0.2) {
            console.log('Resetting recent random songs tracking');
            this.recentRandoms.clear();
            // Still avoid the current song
            const currentId = this.currentSong ? this.currentSong.id : null;
            if (currentId) {
                this.recentRandoms.add(currentId);
            }
        }
        
        let randomSong;
        if (availableSongs.length > 0) {
            // Pick from songs we haven't played recently
            const randomIndex = Math.floor(Math.random() * availableSongs.length);
            randomSong = availableSongs[randomIndex];
        } else {
            // Fallback to completely random selection
            const randomIndex = Math.floor(Math.random() * this.songListManager.songs.length);
            randomSong = this.songListManager.songs[randomIndex];
        }
        
        if (randomSong) {
            // Track this song as recently played
            if (randomSong.id) {
                this.recentRandoms.add(randomSong.id);
                // Limit the size of the set to avoid memory issues
                if (this.recentRandoms.size > 20) {
                    // Remove the oldest item (first in the set)
                    this.recentRandoms.delete([...this.recentRandoms][0]);
                }
            }
            
            console.log('Playing random song:', randomSong.title);
            this.playSong(randomSong);
        }
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

        // Initialize audio state
        this.audio.volume = 0.7; // Default volume
        this.uiManager.updateVolume(0.7);
        
        // Pre-buffer the audio to help avoid loading delays
        this.audio.preload = 'auto';
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

    getCurrentScrollingElement() {
        // Return the active scrolling container
        const activeContainer = document.querySelector('.songs-container.active');
        if (activeContainer) {
            return activeContainer;
        }
        // Fallback to the current view 
        const activeView = document.querySelector('.view-container.active');
        if (activeView) {
            const container = activeView.querySelector('.songs-container');
            if (container) return container;
        }
        // Final fallback to the first songs container
        return document.querySelector('.songs-container');
    }

    /**
     * Get all song cards that are currently visible in the viewport
     * @param {Element} container - The scrollable container
     * @returns {Array} - Array of visible song card elements
     * @private
     */
    _getVisibleSongCards(container) {
        const allCards = Array.from(container.querySelectorAll('.song-card'));
        if (!allCards.length) return [];
        
        const scrollTop = container.scrollTop;
        const scrollBottom = scrollTop + container.clientHeight;
        
        return allCards.filter(card => {
            const cardTop = card.offsetTop;
            const cardBottom = cardTop + card.offsetHeight;
            
            // Card is visible if part of it is in the viewport
            return (cardBottom > scrollTop && cardTop < scrollBottom);
        });
    }

    // Add a method to load top tags for the dropdown
    async _loadTopTags() {
        try {
            const tagSelect = document.getElementById('top-tags');
            if (!tagSelect) return;
            
            // Keep the first option (default)
            const defaultOption = tagSelect.options[0];
            
            // Fetch top tags from API
            const response = await fetch('/api/top-tags');
            if (!response.ok) {
                throw new Error(`Failed to fetch top tags: ${response.status}`);
            }
            
            const data = await response.json();
            if (!data.success || !data.tags || !Array.isArray(data.tags)) {
                throw new Error('Invalid response format for top tags');
            }
            
            // Clear existing options except the default one
            tagSelect.innerHTML = '';
            tagSelect.appendChild(defaultOption);
            
            // Add top tags as options
            data.tags.forEach(tag => {
                const option = document.createElement('option');
                option.value = tag.name;
                option.textContent = `${tag.name} (${tag.count})`;
                tagSelect.appendChild(option);
            });
            
            console.log(`Loaded ${data.tags.length} top tags`);
        } catch (error) {
            console.error('Error loading top tags:', error);
        }
    }

    // Add a method to set up iOS-specific audio handling
    _setupIOSAudioHandling() {
        console.log('Setting up iOS Safari audio handling with seamless approach');
        
        // Create a context unlock function that will be called on first user interaction
        const unlockAudio = () => {
            // Use a silent audio context approach
            if (typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined') {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                const audioContext = new AudioContextClass();
                
                // Create a short silent buffer
                const buffer = audioContext.createBuffer(1, 1, 22050);
                const source = audioContext.createBufferSource();
                source.buffer = buffer;
                source.connect(audioContext.destination);
                
                // Play the buffer
                if (typeof source.start === 'undefined') {
                    source.noteOn(0);
                } else {
                    source.start(0);
                }
                
                // Resume the audio context if needed
                if (audioContext.state === 'suspended') {
                    audioContext.resume();
                }
                
                console.log('Audio context unlocked via user interaction');
            }
            
            // Also create and play a silent HTML5 audio element
            const silentAudio = document.createElement('audio');
            silentAudio.controls = false;
            silentAudio.preload = 'auto';
            silentAudio.loop = false;
            silentAudio.volume = 0.01; // Very low but not zero (zero can fail on iOS)
            silentAudio.src = 'data:audio/mp3;base64,SUQzBAAAAAABEVRYWFgAAAAtAAADY29tbWVudABCaWdTb3VuZEJhbmsuY29tIC8gTGFTb25vdGhlcXVlLm9yZwBURU5DAAAAHQAAA1N3aXRjaCBQbHVzIMKpIE5DSCBTb2Z0d2FyZQBUSVQyAAAABgAAAzIyMzUAVFNTRQAAAA8AAANMYXZmNTcuODMuMTAwAAAAAAAAAAAAAAD/80DEAAAAA0gAAAAATEFNRTMuMTAwVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQsRbAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQMSkAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';
            document.body.appendChild(silentAudio);
            
            // Attempt to play the silent audio
            const playPromise = silentAudio.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    console.log('Silent audio played successfully');
                    // Wait a moment then remove the element
                    setTimeout(() => {
                        if (document.body.contains(silentAudio)) {
                            document.body.removeChild(silentAudio);
                        }
                    }, 1000);
                    
                    // Also initialize our main audio player
                    this.audio.load();
                }).catch(error => {
                    console.error('Silent audio play failed:', error);
                    // Don't remove it - we'll try again on next interaction
                });
            }
            
            // Also modify the main audio element to be more iOS friendly
            this.audio.preload = 'auto';  
            this.audio.autoplay = false; // Never autoplay on iOS
            this.audio.load(); // Force load
        };
        
        // Listen for ANY user interaction to unlock audio
        const events = ['touchstart', 'touchend', 'mousedown', 'keydown', 'click'];
        const unlockOnce = () => {
            unlockAudio();
            // Remove all listeners after first interaction
            events.forEach(event => {
                document.removeEventListener(event, unlockOnce);
            });
        };
        
        // Add all event listeners
        events.forEach(event => {
            document.addEventListener(event, unlockOnce, { once: true });
        });
        
        console.log('iOS audio handlers set up - waiting for user interaction');
    }
}

// Main initialization function
async function initApp() {
    try {
        console.log('Initializing application...');
        
        // Create and initialize the music player as early as possible
        if (!window.musicPlayer) {
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
        }
        
    } catch (error) {
        console.error('Failed to initialize application:', error);
        alert('An error occurred during application initialization. Please refresh the page and try again.');
    }
}

// Initialize thumbnail cache for better performance
if (!window.thumbnailCache) {
    window.thumbnailCache = {};
}

// Make auth functions available globally for components like PlaylistManager
window.isAuthenticated = isAuthenticated;
window.getAuthToken = getAuthToken;
window.authFetch = authFetch;

// Start initialization only once
initApp(); 