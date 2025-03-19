#!/usr/bin/env python
"""
Update Thumbnail Paths

This script updates the thumbnail paths in Supabase to match the format in the Backblaze B2 bucket.
The B2 bucket contains thumbnails with format: thumbnails/000XXX.png (6 digits with 3 leading zeros)
"""

import os
import sys
import logging
from dotenv import load_dotenv
from supabase import create_client, Client

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def main():
    # Load environment variables
    if os.path.exists('.env'):
        load_dotenv()
    
    # Initialize Supabase connection
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_KEY')
    
    if not supabase_url or not supabase_key:
        logger.error("Missing Supabase credentials. Please add SUPABASE_URL and SUPABASE_KEY to your .env file")
        sys.exit(1)
    
    logger.info(f"Connecting to Supabase at {supabase_url}")
    supabase = create_client(supabase_url, supabase_key)
    
    # Fetch songs from the database
    try:
        logger.info("Fetching songs from the database...")
        response = supabase.table('songs').select('id', 'thumbnail_path').execute()
        
        if not response.data:
            logger.error("No songs found in the database")
            sys.exit(1)
            
        songs = response.data
        logger.info(f"Retrieved {len(songs)} songs from the database")
    except Exception as e:
        logger.error(f"Error fetching songs: {str(e)}")
        sys.exit(1)
    
    # Update thumbnail paths
    updated_count = 0
    for song in songs:
        song_id = song.get('id')
        thumbnail_path = song.get('thumbnail_path')
        
        if not thumbnail_path:
            logger.info(f"Song {song_id} has no thumbnail path, skipping")
            continue
        
        # Extract the numeric ID without leading zeros
        numeric_id = song_id.lstrip('0')
        
        # Format according to B2 bucket pattern: thumbnails/000XXX.png (3 leading zeros)
        correct_path = f"thumbnails/000{numeric_id}.png"
        
        # Only update if different
        if thumbnail_path != correct_path:
            try:
                logger.info(f"Updating thumbnail path for song {song_id}: {thumbnail_path} -> {correct_path}")
                supabase.table('songs').update({"thumbnail_path": correct_path}).eq('id', song_id).execute()
                updated_count += 1
            except Exception as e:
                logger.error(f"Error updating thumbnail path for song {song_id}: {str(e)}")
    
    logger.info(f"Update complete. Updated {updated_count} out of {len(songs)} songs.")

if __name__ == "__main__":
    main() 