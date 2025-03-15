from backend.app import app
import os

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    if os.environ.get('RAILWAY_ENVIRONMENT'):
        # In production
        app.run(host='0.0.0.0', port=port, debug=False)
    else:
        # In development
        app.run(host='0.0.0.0', port=port, debug=True)
