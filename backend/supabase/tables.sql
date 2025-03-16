-- Original Tables --------------------------------------------------------------

-- Songs table - main table for song metadata
CREATE TABLE IF NOT EXISTS public.songs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    artist TEXT,
    album TEXT,
    duration FLOAT NOT NULL,
    release_date DATE,
    view_count BIGINT,
    like_count BIGINT,
    description TEXT,
    source_url TEXT,  -- Source URL (e.g., YouTube video URL)
    youtube_url TEXT, -- Direct YouTube URL
    storage_path TEXT NOT NULL,  -- Relative path in B2 (e.g., "audio/0169512.mp3")
    thumbnail_path TEXT NOT NULL,  -- Relative path in B2 (e.g., "thumbnails/0169512.webp")
    storage_url TEXT NOT NULL,  -- Full B2 URL for audio
    thumbnail_url TEXT NOT NULL,  -- Full B2 URL for thumbnail
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Tags table - for storing unique tags
CREATE TABLE IF NOT EXISTS public.tags (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

-- Song tags junction table - for many-to-many relationship
CREATE TABLE IF NOT EXISTS public.song_tags (
    song_id TEXT REFERENCES public.songs(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES public.tags(id) ON DELETE CASCADE,
    PRIMARY KEY (song_id, tag_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_songs_title ON public.songs(title);
CREATE INDEX IF NOT EXISTS idx_songs_artist ON public.songs(artist);
CREATE INDEX IF NOT EXISTS idx_songs_album ON public.songs(album);
CREATE INDEX IF NOT EXISTS idx_songs_release_date ON public.songs(release_date);
CREATE INDEX IF NOT EXISTS idx_songs_youtube_url ON public.songs(youtube_url);
CREATE INDEX IF NOT EXISTS idx_songs_source_url ON public.songs(source_url);
CREATE INDEX IF NOT EXISTS idx_tags_name ON public.tags(name);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updating updated_at timestamp (if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'update_songs_updated_at'
    ) THEN
        CREATE TRIGGER update_songs_updated_at
            BEFORE UPDATE ON public.songs
            FOR EACH ROW
            EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END
$$;

-- Authentication Related Tables ------------------------------------------------------

-- Playlists table - for user-created playlists
CREATE TABLE IF NOT EXISTS public.playlists (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Create trigger for updating playlists.updated_at
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'update_playlists_updated_at'
    ) THEN
        CREATE TRIGGER update_playlists_updated_at
            BEFORE UPDATE ON public.playlists
            FOR EACH ROW
            EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END
$$;

-- Playlist songs junction table
CREATE TABLE IF NOT EXISTS public.playlist_songs (
    playlist_id INTEGER REFERENCES public.playlists(id) ON DELETE CASCADE,
    song_id TEXT REFERENCES public.songs(id) ON DELETE CASCADE,
    position INTEGER,
    PRIMARY KEY (playlist_id, song_id)
);

-- Liked songs table - for tracking which songs users have liked
CREATE TABLE IF NOT EXISTS public.liked_songs (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    song_id TEXT REFERENCES public.songs(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    PRIMARY KEY (user_id, song_id)
);

-- Row Level Security (RLS) Policies ----------------------------------------------

-- Enable RLS on playlists
ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;

-- Create policies for playlists table
CREATE POLICY "Users can view their own playlists" 
ON public.playlists FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own playlists" 
ON public.playlists FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own playlists" 
ON public.playlists FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own playlists" 
ON public.playlists FOR DELETE 
USING (auth.uid() = user_id);

-- Enable RLS on playlist_songs
ALTER TABLE public.playlist_songs ENABLE ROW LEVEL SECURITY;

-- Create policies for playlist_songs table
CREATE POLICY "Users can view songs in their playlists" 
ON public.playlist_songs FOR SELECT 
USING (
  playlist_id IN (
    SELECT id FROM public.playlists 
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can add songs to their playlists" 
ON public.playlist_songs FOR INSERT 
WITH CHECK (
  playlist_id IN (
    SELECT id FROM public.playlists 
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update songs in their playlists" 
ON public.playlist_songs FOR UPDATE 
USING (
  playlist_id IN (
    SELECT id FROM public.playlists 
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can remove songs from their playlists" 
ON public.playlist_songs FOR DELETE 
USING (
  playlist_id IN (
    SELECT id FROM public.playlists 
    WHERE user_id = auth.uid()
  )
);

-- Enable RLS on liked_songs
ALTER TABLE public.liked_songs ENABLE ROW LEVEL SECURITY;

-- Create policies for liked_songs table
CREATE POLICY "Users can view their liked songs" 
ON public.liked_songs FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can like songs" 
ON public.liked_songs FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike songs" 
ON public.liked_songs FOR DELETE 
USING (auth.uid() = user_id); 