from backend.app import app
import os
import logging
from logging.handlers import RotatingFileHandler

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    
    # Set up logging
    if os.environ.get('RAILWAY_ENVIRONMENT') == 'True':
        # In production
        app.run(host='0.0.0.0', port=port, debug=False)
    else:
        # In development - set up file logging
        log_dir = 'logs'
        if not os.path.exists(log_dir):
            os.makedirs(log_dir)
        
        log_file = os.path.join(log_dir, 'app.log')
        
        # Clear the log file on startup
        with open(log_file, 'w') as f:
            f.write('=== New Application Run ===\n')
        
        # Set up a file handler
        file_handler = RotatingFileHandler(log_file, maxBytes=10485760, backupCount=1)
        file_handler.setLevel(logging.DEBUG)
        formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        file_handler.setFormatter(formatter)
        
        # Add the file handler to the root logger
        root_logger = logging.getLogger()
        root_logger.setLevel(logging.DEBUG)
        root_logger.addHandler(file_handler)
        
        # Add the handler to Flask's logger as well
        app.logger.addHandler(file_handler)
        
        # Log startup message
        app.logger.info('Development server starting up with file logging enabled')
        
        # Run the app in debug mode
        app.run(host='0.0.0.0', port=port, debug=True)
