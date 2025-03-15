document.addEventListener('DOMContentLoaded', () => {
    const songsContainer = document.querySelector('.songs-container');
    let audioPlayer = document.createElement('audio');
    audioPlayer.crossOrigin = 'anonymous'; // Add CORS support
    document.body.appendChild(audioPlayer); // Add to DOM for better browser support
    
    // Store event listeners
    const audioEventListeners = {
        timeupdate: [],
        ended: [],
        error: []
    };
    
    const playPauseButton = document.getElementById('play-pause');
    const previousButton = document.getElementById('previous');
    const nextButton = document.getElementById('next');
    const progressBar = document.querySelector('.progress-bar');
    const progress = document.querySelector('.progress');
    const currentTimeDisplay = document.getElementById('current-time');
    const totalDurationDisplay = document.getElementById('total-duration');
    const searchInput = document.getElementById('search');
    const currentSongElement = document.getElementById('current-song');
    const currentArtistElement = document.getElementById('current-artist');
    const currentThumbnail = document.getElementById('current-thumbnail');
    const volumeControl = document.querySelector('.volume-slider');
    const volumeProgress = document.querySelector('.volume-progress');

    let currentSong = null;
    let currentSongIndex = -1;
    let songs = []; // All loaded songs

    // Constants for pagination
    const TOTAL_SONGS = 70;        // Total songs to keep in memory
    const VISIBLE_SONGS = 30;      // Number of songs visible in viewport
    const LOAD_CHUNK = 20;         // Number of songs to load/remove at once
    const SCROLL_THRESHOLD = 0.05;  // 5% threshold for triggering load

    let currentOffset = 0;
    let hasMoreSongs = true;
    let isLoading = false;
    let totalSongsCount = 0;
    let loadCooldown = false;

    // Helper function to add event listeners
    function addAudioEventListener(event, listener) {
        audioEventListeners[event].push(listener);
        audioPlayer.addEventListener(event, listener);
    }

    // Debug logging for audio events
    ['loadstart', 'loadeddata', 'loadedmetadata', 'canplay', 'canplaythrough', 'error'].forEach(eventName => {
        audioPlayer.addEventListener(eventName, (e) => {
            console.log(`Audio event: ${eventName}`, e);
        });
    });

    // Helper function to format time in MM:SS
    function formatTime(seconds) {
        if (isNaN(seconds)) return "00:00";
        const minutes = Math.floor(seconds / 60);
        seconds = Math.floor(seconds % 60);
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    // Add event listeners with our helper function
    addAudioEventListener('timeupdate', () => {
        if (!currentSong) return;
        const currentTime = audioPlayer.currentTime;
        const duration = audioPlayer.duration;
        const progressPercent = (currentTime / duration) * 100;
        progressBar.style.width = `${progressPercent}%`;
        
        // Update time displays
        currentTimeDisplay.textContent = formatTime(currentTime);
        totalDurationDisplay.textContent = formatTime(duration);
    });

    addAudioEventListener('ended', () => {
        if (currentSongIndex < songs.length - 1) {
            playSong(songs[currentSongIndex + 1]);
        }
    });

    addAudioEventListener('error', (e) => {
        console.error('Audio playback error:', e);
        alert('Error playing the song. Please try again.');
    });

    // Modified displaySongs function
    function displaySongs(songsToDisplay, scrollPosition = 'maintain') {
        const container = document.querySelector('.songs-container');
        const oldScrollTop = container.scrollTop;
        
        // Clear container
        container.innerHTML = '';
        
        // Display songs
        songsToDisplay.forEach(song => {
            const songElement = createSongElement(song);
            container.appendChild(songElement);
        });
        
        // Update current song highlight
        if (currentSong) {
            const currentElement = container.querySelector(`[data-song-id="${currentSong.id}"]`);
            if (currentElement) {
                currentElement.classList.add('playing');
            }
        }
    }

    // Helper function to create song element
    function createSongElement(song) {
        const songElement = document.createElement('div');
        songElement.className = 'song-card';
        songElement.dataset.songId = song.id;
        
        if (currentSong && song.id === currentSong.id) {
            songElement.classList.add('playing');
        }
        
        songElement.innerHTML = `
            <img src="/api/thumbnail/${song.id}" 
                 alt="Album Art" 
                 onerror="this.src='/static/images/default.png'">
            <h3>${song.title}</h3>
            <p>${song.artist || 'Unknown Artist'}</p>
        `;
        
        songElement.addEventListener('click', () => playSong(song));
        return songElement;
    }

    // Play a song
    async function playSong(song, autoplay = true) {
        try {
            console.log('Attempting to play song:', song);
            
            if (currentSong && currentSong.id === song.id && !audioPlayer.paused) {
                audioPlayer.pause();
                playPauseButton.innerHTML = '<i class="fas fa-play"></i>';
                return;
            }

            currentSong = song;
            currentSongIndex = songs.findIndex(s => s.id === song.id);
            
            // Use our streaming endpoint instead of direct B2 URL
            const streamUrl = `/api/stream/${song.id}`;
            console.log('Stream URL:', streamUrl);

            // First check if the stream is accessible
            try {
                const response = await fetch(streamUrl, { method: 'HEAD' });
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                console.log('Stream headers:', Object.fromEntries(response.headers));
            } catch (error) {
                console.error('Error checking stream:', error);
                alert('Error accessing the audio stream. Please try again later.');
                return;
            }
            
            // Reset the audio player
            audioPlayer.pause();
            audioPlayer.currentTime = 0;
            
            // Create a new Audio element for each song to avoid caching issues
            const newAudioPlayer = document.createElement('audio');
            newAudioPlayer.crossOrigin = 'anonymous';
            
            // Copy event listeners from our stored list
            Object.entries(audioEventListeners).forEach(([event, listeners]) => {
                listeners.forEach(listener => {
                    newAudioPlayer.addEventListener(event, listener);
                });
            });
            
            // Replace old player
            audioPlayer.remove();
            document.body.appendChild(newAudioPlayer);
            audioPlayer = newAudioPlayer;
            
            // Set new source
            audioPlayer.src = streamUrl;
            
            if (autoplay) {
                try {
                    await audioPlayer.load(); // Explicitly load the audio
                    console.log('Audio loaded, attempting to play...');
                    
                    const playPromise = audioPlayer.play();
                    if (playPromise !== undefined) {
                        await playPromise;
                        console.log('Playback started successfully');
                        playPauseButton.innerHTML = '<i class="fas fa-pause"></i>';
                    }
                } catch (error) {
                    console.error('Error playing song:', error);
                    playPauseButton.innerHTML = '<i class="fas fa-play"></i>';
                    if (error.name === 'NotSupportedError') {
                        alert('This audio format is not supported by your browser.');
                    } else if (error.name === 'NotAllowedError') {
                        alert('Playback was prevented by your browser. Please try again.');
                    } else {
                        alert('Error playing the song. Please try again.');
                    }
                }
            }
            
            // Update UI elements with error handling for thumbnail
            currentSongElement.textContent = song.title;
            currentArtistElement.textContent = song.artist || 'Unknown Artist';
            currentThumbnail.src = `/api/thumbnail/${song.id}`;
            currentThumbnail.onerror = () => {
                currentThumbnail.src = '/static/images/default.png';
            };
            document.title = `${song.title} - ${song.artist || 'Unknown Artist'}`;
            
            // Load songs around the current song
            loadSongsAroundIndex(currentSongIndex);
            
        } catch (error) {
            console.error('Error in playSong:', error);
            alert('Error playing the song. Please try again.');
        }
    }

    // Play/Pause button handler
    playPauseButton.addEventListener('click', () => {
        if (!currentSong) return;
        
        if (audioPlayer.paused) {
            const playPromise = audioPlayer.play();
            if (playPromise !== undefined) {
                playPromise
                    .then(() => {
                        playPauseButton.innerHTML = '<i class="fas fa-pause"></i>';
                    })
                    .catch(error => {
                        console.error('Error playing song:', error);
                        playPauseButton.innerHTML = '<i class="fas fa-play"></i>';
                    });
            }
        } else {
            audioPlayer.pause();
            playPauseButton.innerHTML = '<i class="fas fa-play"></i>';
        }
    });

    // Previous and Next buttons
    previousButton.addEventListener('click', () => {
        if (currentSongIndex > 0) {
            playSong(songs[currentSongIndex - 1]);
        }
    });

    nextButton.addEventListener('click', () => {
        if (currentSongIndex < songs.length - 1) {
            playSong(songs[currentSongIndex + 1]);
        }
    });

    // Progress bar
    progress.addEventListener('click', (e) => {
        if (!currentSong || !audioPlayer.duration) return;
        
        const rect = progress.getBoundingClientRect();
        const clickPosition = (e.clientX - rect.left) / rect.width;
        
        // Ensure clickPosition is between 0 and 1
        const normalizedPosition = Math.max(0, Math.min(1, clickPosition));
        const newTime = normalizedPosition * audioPlayer.duration;
        
        // Set the time and update UI immediately
        audioPlayer.currentTime = newTime;
        progressBar.style.width = `${normalizedPosition * 100}%`;
        currentTimeDisplay.textContent = formatTime(newTime);
    });

    // Volume control
    volumeControl.addEventListener('click', (e) => {
        const volumeWidth = volumeControl.clientWidth;
        const clickX = e.offsetX;
        const volume = clickX / volumeWidth;
        audioPlayer.volume = volume;
        volumeProgress.style.width = `${volume * 100}%`;
    });

    // Search functionality
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredSongs = songs.filter(song => 
            song.title.toLowerCase().includes(searchTerm) ||
            (song.artist && song.artist.toLowerCase().includes(searchTerm))
        );
        displaySongs(filteredSongs);
    });

    // Modified fetchMoreSongs function
    async function fetchMoreSongs(direction = 'down') {
        if (isLoading || loadCooldown || (!hasMoreSongs && direction === 'down')) return;
        
        try {
            isLoading = true;
            const fetchOffset = direction === 'down' ? 
                currentOffset + songs.length : 
                Math.max(0, currentOffset - LOAD_CHUNK);
            
            console.log(`Fetching songs from offset: ${fetchOffset}, direction: ${direction}, current songs: ${songs.length}`);
            
            const response = await fetch(`/api/songs?offset=${fetchOffset}&limit=${LOAD_CHUNK}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            
            totalSongsCount = data.total;
            hasMoreSongs = data.has_more;
            
            if (data.songs.length > 0) {
                // Store current scroll info
                const container = songsContainer;
                const oldScrollTop = container.scrollTop;
                const oldHeight = container.scrollHeight;
                const oldClientHeight = container.clientHeight;
                
                if (direction === 'down') {
                    // Remove LOAD_CHUNK songs from the top if we exceed TOTAL_SONGS
                    if (songs.length >= TOTAL_SONGS - LOAD_CHUNK) {
                        songs = songs.slice(LOAD_CHUNK);
                        currentOffset += LOAD_CHUNK;
                    }
                    // Add new songs to the end
                    songs = [...songs, ...data.songs];
                } else {
                    // Remove LOAD_CHUNK songs from the bottom if we exceed TOTAL_SONGS
                    if (songs.length >= TOTAL_SONGS - LOAD_CHUNK) {
                        songs = songs.slice(0, -LOAD_CHUNK);
                    }
                    // Add new songs to the beginning and update offset
                    songs = [...data.songs, ...songs];
                    currentOffset = fetchOffset;
                }
                
                console.log(`After update - Total songs: ${songs.length}, Offset: ${currentOffset}`);
                
                // Display the songs
                displaySongs(songs);

                // Handle scroll position after content update
                const newHeight = container.scrollHeight;
                if (direction === 'up') {
                    // When loading upward, maintain relative position to new content
                    const heightDiff = newHeight - oldHeight;
                    container.scrollTop = oldScrollTop + heightDiff;
                } else {
                    // When loading downward, maintain the same scroll position
                    container.scrollTop = oldScrollTop;
                }

                // Set cooldown to prevent cascade loading
                loadCooldown = true;
                setTimeout(() => {
                    loadCooldown = false;
                }, 250); // 250ms cooldown
            }
            
        } catch (error) {
            console.error('Error fetching songs:', error);
            alert('Error loading songs. Please try again.');
        } finally {
            isLoading = false;
        }
    }

    // Function to load songs around current index
    async function loadSongsAroundIndex(index) {
        if (isLoading) return;

        const startOffset = Math.max(0, index - LOAD_CHUNK);
        const endOffset = index + LOAD_CHUNK;

        try {
            isLoading = true;
            const response = await fetch(`/api/songs?offset=${startOffset}&limit=${LOAD_CHUNK * 2 + 1}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            
            // Update total count if we don't have it
            if (!totalSongsCount) totalSongsCount = data.total;

            // Add new songs while maintaining the MAX_SONGS limit
            const existingSongIds = new Set(songs.map(s => s.id));
            data.songs.forEach(song => {
                if (!existingSongIds.has(song.id)) {
                    songs.push(song);
                }
            });

            // Keep current song in the middle with buffer on both sides
            if (songs.length > VISIBLE_SONGS) {
                const currentIndex = songs.findIndex(s => s.id === currentSong?.id);
                const start = Math.max(0, currentIndex - Math.floor(VISIBLE_SONGS / 2));
                songs = songs.slice(start, start + VISIBLE_SONGS);
            }

            // Update display
            displaySongs(songs);
        } catch (error) {
            console.error('Error loading songs around index:', error);
        } finally {
            isLoading = false;
        }
    }

    // Improved scroll handler
    function handleScroll() {
        if (loadCooldown) return;

        const container = songsContainer;
        const scrollTop = container.scrollTop;
        const scrollHeight = container.scrollHeight;
        const clientHeight = container.clientHeight;
        
        // Calculate scroll percentages
        const scrolledFromTop = scrollTop / scrollHeight;
        const scrolledFromBottom = 1 - ((scrollTop + clientHeight) / scrollHeight);
        
        // Debug logging
        console.log('Scroll Debug:', {
            scrollTop,
            clientHeight,
            scrollHeight,
            totalSongs: songs.length,
            currentOffset,
            scrolledFromTop: (scrolledFromTop * 100).toFixed(4) + '%',
            scrolledFromBottom: (scrolledFromBottom * 100).toFixed(4) + '%',
            threshold: (SCROLL_THRESHOLD * 100).toFixed(4) + '%'
        });

        // Load more songs when near the edges
        if (scrolledFromBottom < SCROLL_THRESHOLD && !isLoading && hasMoreSongs) {
            console.log('Near bottom - Loading more songs!');
            fetchMoreSongs('down');
        } else if (scrolledFromTop < SCROLL_THRESHOLD && !isLoading && currentOffset > 0) {
            console.log('Near top - Loading previous songs!');
            fetchMoreSongs('up');
        }
    }

    // Update scroll event listener with throttling
    let scrollTimeout;
    
    // Debug - log initial container dimensions
    console.log('Initial container dimensions:', {
        scrollHeight: songsContainer.scrollHeight,
        clientHeight: songsContainer.clientHeight,
        offsetHeight: songsContainer.offsetHeight
    });

    songsContainer.addEventListener('scroll', (e) => {
        // Immediate debug log for every scroll event
        console.log('Raw scroll event detected');
        
        if (!scrollTimeout) {
            scrollTimeout = setTimeout(() => {
                console.log('Processing scroll event');
                handleScroll();
                scrollTimeout = null;
            }, 150); // Throttle to once every 150ms
        }
    }, { passive: true });

    // Also listen for wheel events as backup
    songsContainer.addEventListener('wheel', (e) => {
        console.log('Wheel event detected');
    }, { passive: true });

    // Initial load
    fetchMoreSongs('down');
}); 