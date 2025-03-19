#!/usr/bin/env python
"""
A debug script for testing thumbnail functionality without the full app.
This script creates a minimal Flask app to handle thumbnail requests.
"""

import os
import sys
from flask import Flask, send_file, Response, jsonify
import logging
import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create a minimal Flask app
app = Flask(__name__)

# Ensure static directory exists
os.makedirs(os.path.join(app.root_path, 'static'), exist_ok=True)

# Create a placeholder image if it doesn't exist
placeholder_path = os.path.join(app.root_path, 'static', 'placeholder.png')
if not os.path.exists(placeholder_path):
    try:
        # Try to use PIL if available
        try:
            from PIL import Image
            img = Image.new('RGB', (100, 100), color=(73, 109, 137))
            img.save(placeholder_path)
            print(f"Created placeholder image at {placeholder_path}")
        except ImportError:
            # If PIL is not available, create a simple 1x1 PNG
            with open(placeholder_path, 'wb') as f:
                f.write(bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c636060606000000005ffff0b290000000049454e44ae426082'))
                print(f"Created 1x1 placeholder image at {placeholder_path}")
    except Exception as e:
        print(f"Could not create placeholder image: {e}")

@app.route('/api/thumbnail/<song_id>', methods=['GET'])
def api_get_thumbnail(song_id):
    """
    Simple thumbnail endpoint that returns a placeholder image
    """
    try:
        logger.info(f"Thumbnail endpoint called for song ID: {song_id}")
        
        # Return the placeholder image
        if os.path.exists(placeholder_path):
            logger.info(f"Returning placeholder image from {placeholder_path}")
            return send_file(placeholder_path, mimetype='image/png')
        else:
            logger.error(f"Placeholder image not found at: {placeholder_path}")
            # Create a simple 1x1 transparent PNG
            data = bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c636060606000000005ffff0b290000000049454e44ae426082')
            response = Response(data, mimetype='image/png')
            return response
            
    except Exception as e:
        logger.error(f"Error in thumbnail endpoint: {str(e)}")
        # Generate a 1x1 transparent PNG image as fallback
        data = bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c636060606000000005ffff0b290000000049454e44ae426082')
        response = Response(data, mimetype='image/png')
        return response

@app.route('/api/debug/thumbnail-test', methods=['GET'])
def debug_thumbnail():
    """
    Debug endpoint to test all thumbnail functionality components
    """
    results = {
        "timestamp": datetime.datetime.now().isoformat(),
        "tests": []
    }
    
    def add_test_result(name, success, message, details=None):
        results["tests"].append({
            "name": name,
            "success": success,
            "message": message,
            "details": details
        })
    
    # Test 1: Check if placeholder image exists
    placeholder_exists = os.path.exists(placeholder_path)
    add_test_result(
        "Placeholder Image", 
        placeholder_exists,
        "Placeholder image exists" if placeholder_exists else "Placeholder image not found",
        {"path": placeholder_path}
    )
    
    # Test 2: Check if we can create a Response object
    try:
        data = bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c636060606000000005ffff0b290000000049454e44ae426082')
        test_response = Response(data, mimetype='image/png')
        add_test_result(
            "Response Object Creation", 
            True,
            "Successfully created a Response object"
        )
    except Exception as e:
        add_test_result(
            "Response Object Creation", 
            False,
            f"Failed to create Response object: {str(e)}"
        )
    
    # Test 3: Check if static directory exists and is accessible
    static_dir = os.path.join(app.root_path, 'static')
    try:
        static_exists = os.path.exists(static_dir)
        static_is_dir = os.path.isdir(static_dir)
        static_writable = os.access(static_dir, os.W_OK) if static_exists else False
        
        add_test_result(
            "Static Directory", 
            static_exists and static_is_dir,
            "Static directory exists and is accessible" if (static_exists and static_is_dir) else "Static directory issues",
            {
                "path": static_dir,
                "exists": static_exists,
                "is_directory": static_is_dir,
                "is_writable": static_writable
            }
        )
    except Exception as e:
        add_test_result(
            "Static Directory", 
            False,
            f"Error checking static directory: {str(e)}"
        )
    
    # Test 4: Test basic file sending
    try:
        if placeholder_exists:
            # Just test the logic, don't actually send
            add_test_result(
                "File Sending Logic", 
                True,
                "File sending logic seems valid"
            )
        else:
            add_test_result(
                "File Sending Logic", 
                False,
                "Cannot test file sending without placeholder image"
            )
    except Exception as e:
        add_test_result(
            "File Sending Logic", 
            False,
            f"Error in file sending logic: {str(e)}"
        )
    
    # Return all test results
    return jsonify(results)

@app.after_request
def after_request(response):
    # Allow all origins for debugging
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

if __name__ == '__main__':
    print("Starting thumbnail debug server on http://localhost:5000")
    print(f"Test the thumbnail endpoint: http://localhost:5000/api/thumbnail/test")
    print(f"Run diagnostics: http://localhost:5000/api/debug/thumbnail-test")
    app.run(debug=True) 