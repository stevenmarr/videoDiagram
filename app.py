"""
Controller module for the Video Flow Line Diagram Editor.

This file sets up the Flask application, defines routes, and handles server-side logic.
Currently, it serves the main view. In future iterations, add routes for saving/loading diagrams
(integrating with models.py for persistence).

For testing: Use pytest for route tests (e.g., test_index_route).
"""

from flask import Flask, render_template

app = Flask(__name__)

@app.route('/')
def index():
    """
    Route for the main page.
    Renders the index.html template.
    """
    return render_template('index.html')

if __name__ == '__main__':
    app.run(debug=True)