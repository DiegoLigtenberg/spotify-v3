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

    let songs = [];
    let currentSong = null;
    let currentSongIndex = -1;

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

    // Fetch songs from the API
    async function fetchSongs() {
        try {
            const response = await fetch('/api/songs');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            console.log('Fetched songs:', data);
            songs = data;
            displaySongs(songs);
        } catch (error) {
            console.error('Error fetching songs:', error);
            alert('Error loading songs. Please try again later.');
        }
    }

    // Display songs in the container
    function displaySongs(songsToDisplay) {
        songsContainer.innerHTML = '';
        songsToDisplay.forEach(song => {
            const songElement = document.createElement('div');
            songElement.className = 'song-card';
            
            // Create image element with error handling
            const img = document.createElement('img');
            img.src = song.id ? `/api/thumbnail/${song.id}` : '/static/images/default-album.png';
            img.alt = song.title;
            img.onerror = () => {
                img.src = '/static/images/default-album.png';
            };
            
            songElement.appendChild(img);
            songElement.innerHTML += `
                <h3>${song.title}</h3>
                <p>${song.artist || 'Unknown Artist'}</p>
            `;
            songElement.addEventListener('click', () => playSong(song));
            songsContainer.appendChild(songElement);
        });
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
            currentThumbnail.src = song.id ? `/api/thumbnail/${song.id}` : '/static/images/default-album.png';
            currentThumbnail.onerror = () => {
                currentThumbnail.src = '/static/images/default-album.png';
            };
            document.title = `${song.title} - ${song.artist || 'Unknown Artist'}`;
            
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

    // Initial load
    fetchSongs();
}); 