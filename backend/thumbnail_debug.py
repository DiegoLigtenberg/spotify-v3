#!/usr/bin/env python3
"""
Thumbnail Debug Tool

This script helps diagnose issues with thumbnail loading, caching, and rendering.
It provides functions to check thumbnail cache, B2 connectivity, and browser behavior.
"""

import os
import sys
import shutil
import requests
import logging
from flask import Flask, jsonify, send_file, Response
from dotenv import load_dotenv
import boto3
from botocore.client import Config

# Set up logging
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('thumbnail_debug')

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)

# B2 configuration
B2_KEY_ID = os.getenv('B2_KEY_ID')
B2_APP_KEY = os.getenv('B2_APP_KEY')
B2_BUCKET_NAME = os.getenv('B2_BUCKET_NAME')

# Initialize S3 client for B2
s3_client = None
if B2_KEY_ID and B2_APP_KEY:
    try:
        s3_client = boto3.client(
            's3',
            endpoint_url='https://s3.us-west-004.backblazeb2.com',
            aws_access_key_id=B2_KEY_ID,
            aws_secret_access_key=B2_APP_KEY,
            config=Config(signature_version='s3v4')
        )
        logger.info("B2 client initialized")
    except Exception as e:
        logger.error(f"Failed to initialize B2 client: {str(e)}")
        s3_client = None
else:
    logger.warning("B2 credentials not found in environment variables")

# Ensure thumbnail cache directory exists and is empty
cache_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 
                          'backend', 'thumbnails_cache')
os.makedirs(cache_dir, exist_ok=True)

# Check if server can reach B2
def check_b2_connection():
    if not s3_client:
        return False, "B2 client not initialized"
    
    try:
        response = s3_client.list_buckets()
        buckets = [bucket['Name'] for bucket in response.get('Buckets', [])]
        if B2_BUCKET_NAME in buckets:
            return True, f"Connected to B2, found bucket '{B2_BUCKET_NAME}'"
        else:
            return False, f"Connected to B2, but bucket '{B2_BUCKET_NAME}' not found. Available buckets: {buckets}"
    except Exception as e:
        return False, f"Failed to connect to B2: {str(e)}"

# Clear thumbnail cache
def clear_thumbnail_cache():
    try:
        if os.path.exists(cache_dir):
            # Remove all files in the directory but keep the directory
            for filename in os.listdir(cache_dir):
                file_path = os.path.join(cache_dir, filename)
                if os.path.isfile(file_path):
                    os.unlink(file_path)
        return True, f"Cleared thumbnail cache directory: {cache_dir}"
    except Exception as e:
        return False, f"Failed to clear thumbnail cache: {str(e)}"

# Debug API endpoint to test thumbnail loading
@app.route('/api/debug/thumbnail-test', methods=['GET'])
def debug_thumbnail():
    # Check placeholder
    placeholder_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static', 'placeholder.png')
    placeholder_exists = os.path.exists(placeholder_path)
    
    # Check B2 connection
    b2_connected, b2_message = check_b2_connection()
    
    # Check cache directory
    cache_status = f"Cache directory: {cache_dir}"
    if os.path.exists(cache_dir):
        files = os.listdir(cache_dir)
        cache_status += f", contains {len(files)} files"
    else:
        cache_status += " (does not exist)"
    
    results = {
        "status": "ok",
        "placeholder_image": {
            "exists": placeholder_exists,
            "path": placeholder_path
        },
        "b2_connection": {
            "connected": b2_connected,
            "message": b2_message
        },
        "cache": {
            "status": cache_status
        }
    }
    
    return jsonify(results)

# Test endpoint that serves the placeholder image
@app.route('/api/thumbnail/<song_id>', methods=['GET'])
def test_thumbnail(song_id):
    """
    Simple endpoint that always returns the placeholder image
    for debugging thumbnail loading issues
    """
    logger.info(f"Test thumbnail endpoint called for song ID: {song_id}")
    
    # Return the placeholder image
    placeholder_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static', 'placeholder.png')
    if os.path.exists(placeholder_path):
        logger.info(f"Returning placeholder image from {placeholder_path}")
        return send_file(placeholder_path, mimetype='image/png')
    else:
        logger.error(f"Placeholder image not found at: {placeholder_path}")
        # Create a simple 1x1 transparent PNG as fallback
        data = bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c636060606000000005ffff0b290000000049454e44ae426082')
        response = Response(data, mimetype='image/png')
        return response

@app.after_request
def add_cors_headers(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization,Range')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

if __name__ == '__main__':
    logger.info(f"Starting thumbnail debug server on port 5000")
    app.run(debug=True, port=5000) 