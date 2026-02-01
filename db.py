# db.py (New File - Breaks Circular Import)
"""
Separate DB module to break circular imports between app.py and models.py.
This allows db to be imported independently in both files.

For testing: Import and check db instance (e.g., assert isinstance(db, SQLAlchemy)).
"""

from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()