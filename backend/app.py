from flask import Flask, jsonify, render_template, Response, stream_with_context, make_response, send_file, request, redirect
from flask_cors import CORS
import os
from supabase import create_client, Client
import requests
from dotenv import load_dotenv
import logging
import mimetypes
import boto3
from botocore.client import Config
from PIL import Image
from io import BytesIO
import tempfile

# Load environment variables only in development
if os.path.exists('.env'):
    load_dotenv()

app = Flask(__name__, 
    static_folder='../frontend/static',
    template_folder='../frontend/templates'
)

# Configure CORS based on environment
if os.getenv('RAILWAY_ENVIRONMENT') == 'True':
    # In production, only allow requests from your Railway domain
    CORS(app, resources={
        r"/api/*": {
            "origins": [
                f"https://{os.getenv('RAILWAY_STATIC_URL')}",
                os.getenv('RAILWAY_PUBLIC_DOMAIN', '*')
            ]
        }
    })
else:
    # In development, allow all origins
    CORS(app)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Set up separate frontend logger
frontend_logger = logging.getLogger('frontend')
frontend_logger.setLevel(logging.DEBUG)
frontend_logger.propagate = False  # Don't send logs to parent logger

# Create temp directory for converted images
TEMP_DIR = os.path.join(tempfile.gettempdir(), 'music_player_temp')
os.makedirs(TEMP_DIR, exist_ok=True)

def convert_webp_to_png(webp_data):
    try:
        # Open WebP image from bytes
        img = Image.open(BytesIO(webp_data))
        
        # Convert to RGB if necessary
        if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
            img = img.convert('RGBA')
        else:
            img = img.convert('RGB')
            
        # Save as PNG to BytesIO
        output = BytesIO()
        img.save(output, format='PNG')
        output.seek(0)
        return output
    except Exception as e:
        logger.error(f"Error converting WebP to PNG: {str(e)}")
        return None

# Validate B2 credentials
B2_KEY_ID = os.getenv('B2_KEY_ID')
B2_APP_KEY = os.getenv('B2_APP_KEY')
B2_BUCKET_NAME = os.getenv('B2_BUCKET_NAME')

if not B2_KEY_ID or not B2_APP_KEY or not B2_BUCKET_NAME:
    logger.error("Missing B2 credentials:")
    logger.error(f"B2_KEY_ID: {'Present' if B2_KEY_ID else 'Missing'}")
    logger.error(f"B2_APP_KEY: {'Present' if B2_APP_KEY else 'Missing'}")
    logger.error(f"B2_BUCKET_NAME: {'Present' if B2_BUCKET_NAME else 'Missing'}")
    raise ValueError("Missing required B2 credentials in .env file")

# Format credentials and endpoint for S3 compatibility
s3_key_id = B2_KEY_ID
B2_ENDPOINT = 'https://s3.eu-central-003.backblazeb2.com'  # Use EU Central endpoint
logger.info(f"Using B2 endpoint: {B2_ENDPOINT}")
logger.info(f"Using key ID: {s3_key_id[:10]}...")  # Log first part of key ID

# Initialize Supabase client
supabase: Client = create_client(
    os.getenv('SUPABASE_URL'),
    os.getenv('SUPABASE_KEY')
)

# Initialize S3 client for B2
try:
    logger.info("Initializing S3 client with B2 credentials...")
    s3_client = boto3.client(
        's3',
        endpoint_url=B2_ENDPOINT,
        aws_access_key_id=B2_KEY_ID,
        aws_secret_access_key=B2_APP_KEY,
        region_name='eu-central-003',
        config=Config(
            signature_version='s3v4',
            s3={
                'addressing_style': 'path',
                'payload_signing_enabled': True
            }
        )
    )
    logger.info("S3 client initialized successfully")
    
    # Test bucket access
    try:
        s3_client.list_objects_v2(Bucket=B2_BUCKET_NAME, MaxKeys=1)
        logger.info("Successfully verified bucket access")
    except Exception as e:
        logger.error(f"Failed to access bucket: {str(e)}")
        raise
except Exception as e:
    logger.error(f"Failed to initialize S3 client: {str(e)}")
    raise

# Context processor to inject environment variables into templates
@app.context_processor
def inject_env_variables():
    return {
        'env_vars': {
            'IS_PRODUCTION': os.environ.get('RAILWAY_ENVIRONMENT_PRODUCTION') == 'True',
            'SUPABASE_URL': os.environ.get('SUPABASE_URL', ''),
            'SUPABASE_KEY': os.environ.get('SUPABASE_ANON_KEY', '')
        }
    }

@app.route('/')
def index():
    is_production = os.getenv('RAILWAY_ENVIRONMENT_PRODUCTION') == 'True'
    env_vars = {
        'IS_PRODUCTION': is_production
    }
    return render_template('index.html', env_vars=env_vars)

@app.route('/api/songs')
def get_songs():
    try:
        # Get pagination parameters from query string
        try:
            page_size = min(int(request.args.get('limit', '30')), 30)  # Default and max 30
            offset = int(request.args.get('offset', '0'))
            logger.info(f"Fetching songs with limit {page_size} and offset {offset}")
        except ValueError:
            logger.error("Invalid pagination parameters")
            return jsonify({'error': 'Invalid pagination parameters'}), 400

        # First get total count
        count_response = supabase.table('songs').select('*', count='exact').execute()
        total_count = count_response.count if hasattr(count_response, 'count') else 0
        logger.info(f"Total songs in database: {total_count}")

        # Then get paginated results
        response = supabase.table('songs') \
            .select('*') \
            .range(offset, offset + page_size - 1) \
            .execute()

        logger.info(f"Found {len(response.data)} songs for this page")
        
        return jsonify({
            'songs': response.data,
            'total': total_count,
            'offset': offset,
            'limit': page_size,
            'has_more': (offset + len(response.data)) < total_count
        })

    except Exception as e:
        logger.error(f"Error fetching songs: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500

@app.route('/api/stream/<song_id>')
def stream_song(song_id):
    try:
        # Remove any range-related portions from the song_id (like :1)
        if ':' in song_id:
            song_id = song_id.split(':')[0]
            
        logger.info(f"Streaming request for song ID: {song_id}")
        
        # Check for test request - return a success response for HEAD requests to any ID
        # This allows the AudioPlayer's range check to succeed even during initial load
        if request.method == 'HEAD' and (song_id == 'test' or song_id == '1'):
            logger.info(f"Received HEAD request for test song ID {song_id}, returning 200 OK")
            response = Response('', content_type='audio/mpeg')
            response.headers['Accept-Ranges'] = 'bytes'
            response.headers['Content-Length'] = '0'  # No content for test
            return response
            
        # Fetch song data from Supabase
        response = supabase.table('songs').select('*').eq('id', song_id).execute()
        
        if not response.data:
            logger.error(f"Song with ID {song_id} not found")
            return jsonify({'error': 'Song not found'}), 404
            
        song_data = response.data[0]
        logger.info(f"Found song data: {song_data['title'] if 'title' in song_data else 'Unknown'}")
        
        if 'storage_path' not in song_data:
            logger.error("Missing storage_path in song data")
            return jsonify({'error': 'Invalid song data - missing storage path'}), 500
            
        # Generate a pre-signed URL for the B2 object
        storage_path = song_data['storage_path']
        logger.info(f"Generating pre-signed URL for: {storage_path}")
        
        # Determine content type based on file extension
        if storage_path.lower().endswith('.mp3'):
            content_type = 'audio/mpeg'
        elif storage_path.lower().endswith('.m4a'):
            content_type = 'audio/mp4'
        elif storage_path.lower().endswith('.aac'):
            content_type = 'audio/aac'
        else:
            content_type = 'audio/mpeg'  # Default to MP3
            
        try:
            # Generate presigned URL with longer expiration
            presigned_url = s3_client.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': B2_BUCKET_NAME,
                    'Key': storage_path
                },
                ExpiresIn=3600  # URL valid for 1 hour
            )
            logger.info(f"Successfully generated presigned URL")
            
            # Simple proxy approach - forward the request to B2 and stream the response back
            # This avoids CORS issues entirely as the request comes from our server
            
            # Forward the Range header if it exists
            headers = {}
            if 'Range' in request.headers:
                headers['Range'] = request.headers['Range']
                logger.info(f"Forwarding Range header: {headers['Range']}")
            
            # Make request to B2
            logger.info(f"Making request to B2 for audio content")
            b2_response = requests.get(presigned_url, headers=headers, stream=True)
            
            # Log response details
            status_code = b2_response.status_code
            response_headers = dict(b2_response.headers)
            logger.info(f"B2 response status: {status_code}, headers: {response_headers}")
            
            # Create a Flask response that streams the content
            def generate():
                for chunk in b2_response.iter_content(chunk_size=8192):
                    if chunk:
                        yield chunk
            
            # Create appropriate response based on whether it's a range request
            if status_code == 206:  # Partial content for range requests
                flask_response = Response(
                    generate(),
                    status=206,
                    content_type=content_type
                )
                
                # Copy necessary headers from B2 response
                for header in ['Content-Range', 'Content-Length', 'Accept-Ranges']:
                    if header in response_headers:
                        flask_response.headers[header] = response_headers[header]
            else:
                # Full content response
                flask_response = Response(
                    generate(),
                    content_type=content_type
                )
                
                # Set Content-Length if available
                if 'Content-Length' in response_headers:
                    flask_response.headers['Content-Length'] = response_headers['Content-Length']
                
                flask_response.headers['Accept-Ranges'] = 'bytes'
            
            # Add common headers for better caching and CORS handling
            flask_response.headers.update({
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Range, Origin, X-Requested-With, Content-Type, Accept',
                'Cache-Control': 'public, max-age=86400',  # Cache for 1 day
                'Pragma': 'cache',
                'Expires': '86400'
            })
            
            logger.info(f"Successfully streaming audio content, content-type: {content_type}")
            return flask_response
            
        except Exception as e:
            logger.error(f"Error in streaming process: {str(e)}", exc_info=True)
            return jsonify({'error': f'Streaming error: {str(e)}'}), 500
            
    except Exception as e:
        logger.error(f"Error in stream_song endpoint: {str(e)}", exc_info=True)
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@app.route('/api/thumbnail/<song_id>')
def get_thumbnail(song_id):
    try:
        # Fetch song data from Supabase
        response = supabase.table('songs').select('*').eq('id', song_id).execute()
        
        if not response.data:
            logger.error(f"Song with ID {song_id} not found")
            return jsonify({'error': 'Song not found'}), 404
            
        song_data = response.data[0]
        if not song_data.get('thumbnail_path'):
            logger.error("Missing thumbnail_path in song data")
            return jsonify({'error': 'No thumbnail available'}), 404

        # Generate a pre-signed URL for the thumbnail
        try:
            presigned_url = s3_client.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': B2_BUCKET_NAME,
                    'Key': song_data['thumbnail_path']
                },
                ExpiresIn=3600
            )
            logger.info(f"Generated pre-signed URL for thumbnail: {song_data['thumbnail_path']}")
            
            # Download the thumbnail
            response = requests.get(presigned_url)
            if response.status_code != 200:
                logger.error(f"Failed to download thumbnail: {response.status_code}")
                return jsonify({'error': 'Failed to download thumbnail'}), 404

            # Convert WebP to PNG
            try:
                # Open WebP image from bytes
                img = Image.open(BytesIO(response.content))
                
                # Convert to RGB/RGBA as needed
                if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
                    img = img.convert('RGBA')
                else:
                    img = img.convert('RGB')
                
                # Save as PNG to BytesIO
                output = BytesIO()
                img.save(output, format='PNG')
                output.seek(0)
                
                response = send_file(
                    output,
                    mimetype='image/png',
                    as_attachment=False,
                    download_name=f"{song_id}.png"
                )
                
                # Add caching headers for better performance
                response.headers.update({
                    'Cache-Control': 'public, max-age=604800',  # Cache for 1 week
                    'Pragma': 'cache',
                    'Expires': '604800'
                })
                
                return response
                
            except Exception as e:
                logger.error(f"Error converting WebP to PNG: {str(e)}")
                return jsonify({'error': 'Failed to convert image'}), 500

        except Exception as e:
            logger.error(f"Error accessing thumbnail: {str(e)}")
            return jsonify({'error': 'Failed to access thumbnail'}), 500

    except Exception as e:
        logger.error(f"Error in get_thumbnail: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.after_request
def after_request(response):
    # Allow all origins for now - you can restrict this in production
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization,Range')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

@app.route('/api/stream/<song_id>', methods=['OPTIONS'])
def stream_song_options(song_id):
    # Handle OPTIONS preflight requests for CORS
    response = jsonify({'status': 'ok'})
    return response

@app.route('/api/client-logs', methods=['POST'])
def client_logs():
    """Endpoint to receive client-side logs from the browser"""
    if os.getenv('RAILWAY_ENVIRONMENT_PRODUCTION') == 'True':
        # Don't log in production
        return jsonify({'status': 'ignored'})
    
    try:
        log_data = request.get_json()
        if not log_data or 'logs' not in log_data:
            return jsonify({'status': 'error', 'message': 'Invalid log data'}), 400
        
        logs = log_data['logs']
        for log in logs:
            level = log.get('level', 'info').upper()
            timestamp = log.get('timestamp', '')
            message = log.get('message', '')
            
            # Write to the frontend logger
            log_message = f"{timestamp} - {message}"
            
            # Choose the appropriate log level
            if level == 'ERROR':
                frontend_logger.error(log_message)
            elif level == 'WARN' or level == 'WARNING':
                frontend_logger.warning(log_message)
            elif level == 'INFO':
                frontend_logger.info(log_message)
            else:
                frontend_logger.debug(log_message)
        
        return jsonify({'status': 'success', 'count': len(logs)})
    except Exception as e:
        logger.error(f"Error processing client logs: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/song-metadata/<song_id>')
def get_song_metadata(song_id):
    """Endpoint to get detailed metadata for a song including tags"""
    try:
        logger.info(f"Fetching metadata for song ID: {song_id}")
        
        # Fetch song data from Supabase including view_count and like_count
        song_response = supabase.table('songs').select('*').eq('id', song_id).execute()
        
        if not song_response.data:
            logger.error(f"Song with ID {song_id} not found")
            return jsonify({'error': 'Song not found'}), 404
            
        song_data = song_response.data[0]
        
        # Fetch tags for this song using a direct join query
        # This works with the existing schema without needing a custom function
        tags_query = supabase.from_('song_tags') \
            .select('tags!inner(name)') \
            .eq('song_id', song_id) \
            .limit(3)
            
        tags_response = tags_query.execute()
        
        # Extract tag names from the nested structure
        tags = []
        if tags_response.data:
            for item in tags_response.data:
                if item.get('tags') and item['tags'].get('name'):
                    tags.append(item['tags']['name'])
        
        logger.info(f"Found {len(tags)} tags for song {song_id}: {tags}")
        
        # Create response object
        metadata = {
            'song': song_data,
            'tags': tags
        }
        
        return jsonify(metadata)
    except Exception as e:
        logger.error(f"Error fetching song metadata: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500

@app.route('/api/like-song', methods=['POST'])
def like_song():
    """Add a song to the user's liked songs"""
    try:
        # Get the song ID from the request body
        data = request.get_json()
        if not data or 'songId' not in data:
            logger.error("Missing songId in request")
            return jsonify({'error': 'Missing songId parameter'}), 400
            
        song_id = data['songId']
        logger.info(f"Adding song ID '{song_id}' to liked songs")
        
        # Get the user ID from the JWT token in the Authorization header
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            logger.error("Missing or invalid Authorization header")
            return jsonify({'error': 'Authentication required'}), 401
            
        token = auth_header.split(' ')[1]
        
        # Verify the token with Supabase
        try:
            user = supabase.auth.get_user(token)
            user_id = user.user.id
            logger.info(f"User authenticated: {user_id}")
        except Exception as e:
            logger.error(f"Failed to authenticate user: {str(e)}")
            return jsonify({'error': 'Invalid authentication token'}), 401
        
        # Check if the song exists
        # First, try to find it by ID directly
        numeric_id = None
        if song_id.isdigit():
            numeric_id = song_id
        else:
            # If it's not a numeric ID, try to find the song by title/artist components
            # This handles the case where the frontend sends a title-based ID
            logger.info(f"Song ID '{song_id}' is not numeric, attempting to find matching song")
            
            # Extract potential title/artist from the ID format: "title-artist"
            parts = song_id.split('-')
            if len(parts) > 1:
                # Try to reconstruct potential title and artist for searching
                potential_title_parts = []
                for part in parts:
                    if part and part != 'unknown' and part != 'artist':
                        potential_title_parts.append(part)
                
                if potential_title_parts:
                    # Join with wildcard for flexible matching
                    search_term = '%'.join(potential_title_parts)
                    search_term = f"%{search_term}%"
                    
                    logger.info(f"Searching for song with title like: {search_term}")
                    
                    # Search for song by title (case insensitive)
                    try:
                        song_search = supabase.table('songs').select('id, title').ilike('title', search_term).limit(1).execute()
                        
                        if song_search.data:
                            numeric_id = song_search.data[0]['id']
                            logger.info(f"Found matching song with ID: {numeric_id}")
                        else:
                            logger.warning(f"No matching song found for search term: {search_term}")
                    except Exception as e:
                        logger.error(f"Error searching for song: {str(e)}")
                
        # If we couldn't find a numeric ID, return an error
        if not numeric_id:
            logger.error(f"Song with ID '{song_id}' not found")
            return jsonify({'error': 'Song not found'}), 404
            
        # Insert the liked song record
        try:
            liked_song = {
                'user_id': user_id,
                'song_id': numeric_id
            }
            
            # Use upsert to handle case where it might already exist
            result = supabase.table('liked_songs').upsert(liked_song).execute()
            
            if not result.data:
                raise Exception("No data returned from database operation")
                
            logger.info(f"Successfully added song '{numeric_id}' to liked songs for user '{user_id}'")
            return jsonify({'success': True, 'message': 'Song added to liked songs'})
            
        except Exception as e:
            logger.error(f"Database error adding liked song: {str(e)}")
            return jsonify({'error': f'Database error: {str(e)}'}), 500
            
    except Exception as e:
        logger.error(f"Error adding song to liked songs: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500

@app.route('/api/unlike-song', methods=['POST'])
def unlike_song():
    """Remove a song from the user's liked songs"""
    try:
        # Get the song ID from the request body
        data = request.get_json()
        if not data or 'songId' not in data:
            logger.error("Missing songId in request")
            return jsonify({'error': 'Missing songId parameter'}), 400
            
        song_id = data['songId']
        logger.info(f"Removing song ID '{song_id}' from liked songs")
        
        # Get the user ID from the JWT token in the Authorization header
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            logger.error("Missing or invalid Authorization header")
            return jsonify({'error': 'Authentication required'}), 401
            
        token = auth_header.split(' ')[1]
        
        # Verify the token with Supabase
        try:
            user = supabase.auth.get_user(token)
            user_id = user.user.id
            logger.info(f"User authenticated: {user_id}")
        except Exception as e:
            logger.error(f"Failed to authenticate user: {str(e)}")
            return jsonify({'error': 'Invalid authentication token'}), 401
        
        # If it's not a numeric ID, try to find the song by title/artist components
        numeric_id = None
        if song_id.isdigit():
            numeric_id = song_id
        else:
            # This handles the case where the frontend sends a title-based ID
            logger.info(f"Song ID '{song_id}' is not numeric, attempting to find matching song")
            
            # Extract potential title/artist from the ID format: "title-artist"
            parts = song_id.split('-')
            if len(parts) > 1:
                # Try to reconstruct potential title and artist for searching
                potential_title_parts = []
                for part in parts:
                    if part and part != 'unknown' and part != 'artist':
                        potential_title_parts.append(part)
                
                if potential_title_parts:
                    # Join with wildcard for flexible matching
                    search_term = '%'.join(potential_title_parts)
                    search_term = f"%{search_term}%"
                    
                    logger.info(f"Searching for song with title like: {search_term}")
                    
                    # Search for song by title (case insensitive)
                    try:
                        song_search = supabase.table('songs').select('id, title').ilike('title', search_term).limit(1).execute()
                        
                        if song_search.data:
                            numeric_id = song_search.data[0]['id']
                            logger.info(f"Found matching song with ID: {numeric_id}")
                        else:
                            logger.warning(f"No matching song found for search term: {search_term}")
                    except Exception as e:
                        logger.error(f"Error searching for song: {str(e)}")
            
        # Delete the liked song record - even if we couldn't find a match, attempt to remove by the original ID
        # This way we clean up any potential mismatches
        try:
            if numeric_id:
                # If we found a numeric ID, use that
                result = supabase.table('liked_songs') \
                    .delete() \
                    .eq('user_id', user_id) \
                    .eq('song_id', numeric_id) \
                    .execute()
            else:
                # If we couldn't find a numeric ID, try with the original ID
                # This is a fallback for edge cases
                result = supabase.table('liked_songs') \
                    .delete() \
                    .eq('user_id', user_id) \
                    .eq('song_id', song_id) \
                    .execute()
                
            logger.info(f"Successfully removed song '{numeric_id or song_id}' from liked songs for user '{user_id}'")
            return jsonify({'success': True, 'message': 'Song removed from liked songs'})
            
        except Exception as e:
            logger.error(f"Database error removing liked song: {str(e)}")
            return jsonify({'error': f'Database error: {str(e)}'}), 500
            
    except Exception as e:
        logger.error(f"Error removing song from liked songs: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500

@app.route('/api/liked-songs')
def get_liked_songs():
    """Get all songs liked by the current user"""
    try:
        # Get the user ID from the JWT token in the Authorization header
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            logger.error("Missing or invalid Authorization header")
            return jsonify({'error': 'Authentication required'}), 401
            
        token = auth_header.split(' ')[1]
        
        # Verify the token with Supabase
        try:
            user = supabase.auth.get_user(token)
            user_id = user.user.id
            logger.info(f"User authenticated: {user_id}")
        except Exception as e:
            logger.error(f"Failed to authenticate user: {str(e)}")
            return jsonify({'error': 'Invalid authentication token'}), 401
        
        # Query for the user's liked songs with song details
        try:
            # First get the liked song IDs
            liked_songs_response = supabase.table('liked_songs') \
                .select('song_id') \
                .eq('user_id', user_id) \
                .execute()
                
            if not liked_songs_response.data:
                logger.info(f"No liked songs found for user {user_id}")
                return jsonify({'songs': []})
                
            # Extract song IDs
            song_ids = [item['song_id'] for item in liked_songs_response.data]
            
            # Get the full song details
            songs_response = supabase.table('songs') \
                .select('*') \
                .in_('id', song_ids) \
                .execute()
                
            logger.info(f"Found {len(songs_response.data)} liked songs for user {user_id}")
            
            return jsonify({'songs': songs_response.data})
            
        except Exception as e:
            logger.error(f"Database error fetching liked songs: {str(e)}")
            return jsonify({'error': f'Database error: {str(e)}'}), 500
            
    except Exception as e:
        logger.error(f"Error fetching liked songs: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True) 