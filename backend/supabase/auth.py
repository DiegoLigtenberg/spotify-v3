"""
Authentication utilities for Flask integration with Supabase Auth.
"""
import os
import json
from functools import wraps
from flask import request, jsonify, g
import jwt
from jwt.exceptions import InvalidTokenError
from .client import supabase

# Get JWT secret from Supabase project settings for verification
# This is typically the same as your SUPABASE_JWT_SECRET
JWT_SECRET = os.getenv('SUPABASE_JWT_SECRET', None)

def get_user_from_request():
    """
    Extract and validate the user from the request's Authorization header.
    
    Returns:
        dict: User object if authenticated, None otherwise
    """
    auth_header = request.headers.get('Authorization', '')
    
    if not auth_header.startswith('Bearer '):
        return None
    
    token = auth_header.replace('Bearer ', '')
    
    try:
        # Get user from Supabase's auth.getUser()
        response = supabase.auth.get_user(token)
        return response.user if response and hasattr(response, 'user') else None
    except Exception as e:
        print(f"Error verifying token: {str(e)}")
        return None

def require_auth(f):
    """
    Decorator for routes that require authentication.
    Checks the Authorization header and verifies the JWT token.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_user_from_request()
        
        if not user:
            return jsonify({'error': 'Unauthorized'}), 401
        
        # Store user in Flask's g object for the current request
        g.user = user
        return f(*args, **kwargs)
    
    return decorated

def get_current_user():
    """
    Get the current authenticated user from Flask's g object.
    For use in route handlers after @require_auth decorator.
    
    Returns:
        dict: User object or None
    """
    return getattr(g, 'user', None)

def verify_webhook(request_data, signature, webhook_secret):
    """
    Verify a Supabase webhook signature.
    For handling auth webhooks from Supabase.
    
    Args:
        request_data (bytes): Raw request body
        signature (str): Signature from the request header
        webhook_secret (str): Your webhook secret
        
    Returns:
        bool: True if verified, False otherwise
    """
    # Implementation would go here if using webhooks
    # This is a placeholder for future webhook integration
    return False 