#!/usr/bin/env python3
"""
Thumbnail Direct Tester

This script tests direct access to thumbnails in the B2 bucket and verifies if
they can be downloaded successfully. It also checks for caching issues.
"""

import os
import sys
import argparse
import logging
from dotenv import load_dotenv
import boto3
from botocore.client import Config
import requests
import time
import random
import json
from datetime import datetime
from supabase import create_client, Client

# Set up logging
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('thumbnail_tester')

def setup_argparse():
    parser = argparse.ArgumentParser(description='Test thumbnail loading from B2')
    parser.add_argument('--limit', type=int, default=10, help='Number of songs to test')
    parser.add_argument('--clear-cache', action='store_true', help='Clear local cache before testing')
    parser.add_argument('--verbose', action='store_true', help='Show verbose output')
    parser.add_argument('--ascii', action='store_true', help='Use ASCII art for thumbnails preview')
    parser.add_argument('--save-dir', type=str, default='downloaded_thumbnails', 
                        help='Directory to save downloaded thumbnails')
    parser.add_argument('--song-ids', type=str, help='Comma-separated list of song IDs to test')
    return parser.parse_args()

def setup_b2_client():
    # Load environment variables
    load_dotenv()
    
    # B2 configuration
    B2_KEY_ID = os.getenv('B2_KEY_ID')
    B2_APP_KEY = os.getenv('B2_APP_KEY')
    B2_BUCKET_NAME = os.getenv('B2_BUCKET_NAME')
    
    if not all([B2_KEY_ID, B2_APP_KEY, B2_BUCKET_NAME]):
        logger.error("Missing B2 credentials. Please set B2_KEY_ID, B2_APP_KEY, and B2_BUCKET_NAME in .env file.")
        return None, None
    
    # Initialize S3 client for B2
    try:
        s3_client = boto3.client(
            's3',
            endpoint_url='https://s3.us-west-004.backblazeb2.com',
            aws_access_key_id=B2_KEY_ID,
            aws_secret_access_key=B2_APP_KEY,
            config=Config(signature_version='s3v4')
        )
        logger.info(f"B2 client initialized for bucket {B2_BUCKET_NAME}")
        return s3_client, B2_BUCKET_NAME
    except Exception as e:
        logger.error(f"Failed to initialize B2 client: {str(e)}")
        return None, None

def setup_supabase_client():
    # Load environment variables
    load_dotenv()
    
    # Supabase configuration
    SUPABASE_URL = os.getenv('SUPABASE_URL')
    SUPABASE_KEY = os.getenv('SUPABASE_KEY')
    
    if not all([SUPABASE_URL, SUPABASE_KEY]):
        logger.error("Missing Supabase credentials. Please set SUPABASE_URL and SUPABASE_KEY in .env file.")
        return None
    
    # Initialize Supabase client
    try:
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("Supabase client initialized")
        return supabase
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {str(e)}")
        return None

def get_songs_from_supabase(supabase, limit=10, song_ids=None):
    try:
        if song_ids:
            # Get specific songs by IDs
            logger.info(f"Fetching songs with IDs: {song_ids}")
            response = supabase.table('songs').select('*').in_('id', song_ids).execute()
        else:
            # Get random songs
            logger.info(f"Fetching {limit} random songs")
            response = supabase.table('songs').select('*').limit(limit).execute()
        
        if not response.data:
            logger.error("No songs found in Supabase")
            return []
        
        logger.info(f"Found {len(response.data)} songs")
        return response.data
    except Exception as e:
        logger.error(f"Error fetching songs from Supabase: {str(e)}")
        return []

def create_output_dir(dir_name):
    """Create directory for downloaded thumbnails"""
    if not os.path.exists(dir_name):
        os.makedirs(dir_name)
        logger.info(f"Created directory {dir_name}")
    return dir_name

def get_thumbnail_from_b2(s3_client, bucket_name, song_id, output_dir):
    """Download thumbnail from B2 and save to output directory"""
    # Clean the song ID
    # First strip leading zeros
    clean_id = song_id.lstrip('0')
    # Then format to 6 digits with leading zeros
    formatted_id = clean_id.zfill(6)
    
    # Generate the thumbnail path
    thumbnail_path = f"thumbnails/{formatted_id}.png"
    logger.info(f"Looking for thumbnail at path: {thumbnail_path}")
    
    try:
        # Check if the object exists
        s3_client.head_object(Bucket=bucket_name, Key=thumbnail_path)
        
        # Generate presigned URL
        presigned_url = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': bucket_name, 'Key': thumbnail_path},
            ExpiresIn=3600
        )
        
        # Download the thumbnail
        start_time = time.time()
        response = requests.get(presigned_url, timeout=10)
        download_time = time.time() - start_time
        
        if response.status_code == 200:
            # Save the thumbnail
            output_path = os.path.join(output_dir, f"{song_id}.png")
            with open(output_path, 'wb') as f:
                f.write(response.content)
            
            logger.info(f"✅ Downloaded thumbnail for song {song_id} ({len(response.content)/1024:.2f} KB in {download_time:.2f}s)")
            return True, output_path, response.content
        else:
            logger.error(f"❌ Failed to download thumbnail for song {song_id}: HTTP {response.status_code}")
            return False, None, None
    
    except s3_client.exceptions.ClientError as e:
        error_code = e.response.get('Error', {}).get('Code', 'Unknown')
        if error_code == '404':
            logger.error(f"❌ Thumbnail not found for song {song_id} at path {thumbnail_path}")
        else:
            logger.error(f"❌ Error accessing thumbnail for song {song_id}: {error_code} - {str(e)}")
        return False, None, None
    
    except Exception as e:
        logger.error(f"❌ Error downloading thumbnail for song {song_id}: {str(e)}")
        return False, None, None

def render_ascii_art(image_data, width=40):
    """Create a simple ASCII representation of an image for console preview"""
    try:
        from PIL import Image
        import io
        
        # Open the image from bytes
        image = Image.open(io.BytesIO(image_data))
        
        # Resize image to maintain aspect ratio
        height = int((width / image.width) * image.height) // 2
        image = image.resize((width, height))
        
        # Convert to grayscale
        image = image.convert('L')
        
        # ASCII characters from darkest to lightest
        ascii_chars = '@%#*+=-:. '
        
        # Create ASCII representation
        ascii_art = []
        for y in range(height):
            line = ''
            for x in range(width):
                pixel_value = image.getpixel((x, y))
                # Map pixel value to ASCII character
                char_index = min(len(ascii_chars) - 1, pixel_value * len(ascii_chars) // 255)
                line += ascii_chars[char_index]
            ascii_art.append(line)
        
        return '\n'.join(ascii_art)
    
    except ImportError:
        return "[ASCII preview requires Pillow library]"
    except Exception as e:
        return f"[Error generating ASCII preview: {str(e)}]"

def main():
    args = setup_argparse()
    
    if args.verbose:
        logger.setLevel(logging.DEBUG)
    
    # Initialize Supabase client
    supabase = setup_supabase_client()
    if not supabase:
        return
    
    # Initialize B2 client
    s3_client, bucket_name = setup_b2_client()
    if not s3_client or not bucket_name:
        return
    
    # Confirm connection to B2
    try:
        s3_client.list_buckets()
        logger.info(f"Successfully connected to B2")
    except Exception as e:
        logger.error(f"Failed to connect to B2: {str(e)}")
        return
    
    # Create output directory
    output_dir = create_output_dir(args.save_dir)
    
    # Clear output directory if requested
    if args.clear_cache and os.path.exists(output_dir):
        for filename in os.listdir(output_dir):
            file_path = os.path.join(output_dir, filename)
            if os.path.isfile(file_path):
                os.unlink(file_path)
        logger.info(f"Cleared output directory: {output_dir}")
    
    # Get songs to test
    song_ids_list = None
    if args.song_ids:
        song_ids_list = [s.strip() for s in args.song_ids.split(',')]
        logger.info(f"Testing specific song IDs: {song_ids_list}")
    
    songs = get_songs_from_supabase(supabase, args.limit, song_ids_list)
    if not songs:
        logger.error("No songs to test. Exiting.")
        return
    
    # Test thumbnails
    results = {
        "timestamp": datetime.now().isoformat(),
        "total_songs": len(songs),
        "success_count": 0,
        "failure_count": 0,
        "song_results": []
    }
    
    for song in songs:
        song_id = song.get('id')
        if not song_id:
            logger.warning(f"Song missing ID, skipping: {song}")
            continue
        
        song_id = str(song_id)
        logger.info(f"Testing thumbnail for song: {song_id} - {song.get('title', 'Unknown Title')}")
        
        success, output_path, image_data = get_thumbnail_from_b2(
            s3_client, bucket_name, song_id, output_dir
        )
        
        result = {
            "song_id": song_id,
            "title": song.get('title', 'Unknown'),
            "artist": song.get('artist', 'Unknown'),
            "success": success,
            "output_path": output_path
        }
        
        if success:
            results["success_count"] += 1
            # Display ASCII preview if requested
            if args.ascii and image_data:
                ascii_art = render_ascii_art(image_data)
                print("\n" + "-" * 80)
                print(f"Song: {song.get('title', 'Unknown')} by {song.get('artist', 'Unknown')}")
                print("-" * 80)
                print(ascii_art)
                print("-" * 80 + "\n")
        else:
            results["failure_count"] += 1
        
        results["song_results"].append(result)
    
    # Write results to file
    results_path = os.path.join(output_dir, "results.json")
    with open(results_path, 'w') as f:
        json.dump(results, f, indent=2)
    
    # Print summary
    print("\n" + "=" * 80)
    print(f"THUMBNAIL TEST RESULTS")
    print("=" * 80)
    print(f"Total songs tested: {results['total_songs']}")
    print(f"Successful downloads: {results['success_count']}")
    print(f"Failed downloads: {results['failure_count']}")
    print(f"Success rate: {results['success_count'] / results['total_songs'] * 100:.1f}%")
    print(f"Detailed results saved to: {results_path}")
    print("=" * 80)

if __name__ == "__main__":
    main() 