from flask import Flask, jsonify, render_template, Response, stream_with_context, make_response, send_file, request
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

# Load environment variables
load_dotenv()

app = Flask(__name__, 
    static_folder='../frontend/static',
    template_folder='../frontend/templates'
)
CORS(app)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create temp directory for converted images
TEMP_DIR = os.path.join(os.path.dirname(__file__), 'temp')
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

@app.route('/')
def index():
    return render_template('index.html')

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
        logger.info(f"Streaming request for song ID: {song_id}")
        
        # Fetch song data from Supabase
        response = supabase.table('songs').select('*').eq('id', song_id).execute()
        
        if not response.data:
            logger.error(f"Song with ID {song_id} not found")
            return jsonify({'error': 'Song not found'}), 404
            
        song_data = response.data[0]
        logger.info(f"Found song data: {song_data}")
        
        if 'storage_path' not in song_data:
            logger.error("Missing storage_path in song data")
            return jsonify({'error': 'Invalid song data - missing storage path'}), 500
            
        try:
            # Generate a pre-signed URL for the object
            storage_path = song_data['storage_path']
            logger.info(f"Generating pre-signed URL for: {storage_path}")
            
            try:
                presigned_url = s3_client.generate_presigned_url(
                    'get_object',
                    Params={
                        'Bucket': B2_BUCKET_NAME,
                        'Key': storage_path
                    },
                    ExpiresIn=3600  # URL valid for 1 hour
                )
                logger.info(f"Generated pre-signed URL (first 100 chars): {presigned_url[:100]}...")
                
                # Test the URL directly
                test_response = requests.get(presigned_url, stream=True)
                if test_response.status_code != 200:
                    logger.error(f"Pre-signed URL test failed with status {test_response.status_code}")
                    logger.error(f"Response headers: {dict(test_response.headers)}")
                    logger.error(f"Response text: {test_response.text}")
                    return jsonify({'error': 'Failed to verify audio source'}), 500
                else:
                    logger.info("Pre-signed URL test successful")
                test_response.close()
                
            except Exception as e:
                logger.error(f"Failed to generate or test pre-signed URL: {str(e)}", exc_info=True)
                return jsonify({'error': f'Failed to generate streaming URL: {str(e)}'}), 500
            
            # Create streaming response
            def generate():
                try:
                    stream_response = requests.get(presigned_url, stream=True)
                    if stream_response.status_code != 200:
                        logger.error(f"Streaming request failed with status {stream_response.status_code}")
                        return
                        
                    for chunk in stream_response.iter_content(chunk_size=8192):
                        if chunk:
                            yield chunk
                except Exception as e:
                    logger.error(f"Error during streaming: {str(e)}", exc_info=True)
                    raise
                finally:
                    stream_response.close()
                            
            response = Response(generate(), content_type='audio/mpeg')
            response.headers.update({
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'no-cache',
                'Access-Control-Allow-Origin': '*'
            })
            
            logger.info("Successfully initiated audio stream")
            return response
                
        except Exception as e:
            logger.error(f"Error in streaming process: {str(e)}", exc_info=True)
            return jsonify({'error': f'Streaming error: {str(e)}'}), 500
            
    except Exception as e:
        logger.error(f"Error in stream_song endpoint: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500

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
                
                return send_file(
                    output,
                    mimetype='image/png',
                    as_attachment=False,
                    download_name=f"{song_id}.png"
                )
                
            except Exception as e:
                logger.error(f"Error converting WebP to PNG: {str(e)}")
                return jsonify({'error': 'Failed to convert image'}), 500

        except Exception as e:
            logger.error(f"Error accessing thumbnail: {str(e)}")
            return jsonify({'error': 'Failed to access thumbnail'}), 500

    except Exception as e:
        logger.error(f"Error in get_thumbnail: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True) 