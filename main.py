from backend.app import app, frontend_logger
import os
import logging
from logging.handlers import RotatingFileHandler
import time
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    
    # Set up logging
    if os.environ.get('RAILWAY_ENVIRONMENT_PRODUCTION') == 'True':
        # In production
        app.run(host='0.0.0.0', port=port, debug=False)
    else:
        # In development - set up file logging
        log_dir = 'logs'
        if not os.path.exists(log_dir):
            os.makedirs(log_dir)
        
        # Backend log file
        backend_log_file = os.path.join(log_dir, 'app.log')
        
        # Clear the log file on startup
        with open(backend_log_file, 'w') as f:
            f.write('=== New Application Run ===\n')
        
        # Set up a file handler for backend logs
        backend_file_handler = RotatingFileHandler(backend_log_file, maxBytes=10485760, backupCount=1)
        backend_file_handler.setLevel(logging.DEBUG)
        formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        backend_file_handler.setFormatter(formatter)
        
        # Add the file handler to the root logger
        root_logger = logging.getLogger()
        root_logger.setLevel(logging.DEBUG)
        root_logger.addHandler(backend_file_handler)
        
        # Add the handler to Flask's logger as well
        app.logger.addHandler(backend_file_handler)
        
        # Set up separate frontend log file
        frontend_log_file = os.path.join(log_dir, 'frontend.log')
        
        # Clear the frontend log file on startup
        with open(frontend_log_file, 'w') as f:
            f.write('=== New Frontend Log ===\n')
        
        # Set up a file handler for frontend logs
        frontend_file_handler = RotatingFileHandler(frontend_log_file, maxBytes=10485760, backupCount=1)
        frontend_file_handler.setLevel(logging.DEBUG)
        frontend_formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
        frontend_file_handler.setFormatter(frontend_formatter)
        
        # Add the file handler to the frontend logger
        frontend_logger.addHandler(frontend_file_handler)
        
        # Log startup message
        app.logger.info('Development server starting up with file logging enabled')
        frontend_logger.info('Frontend logging initialized')
        
        # Run the app in debug mode
        app.run(host='0.0.0.0', port=port, debug=True)
