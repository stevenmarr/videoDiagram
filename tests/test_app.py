"""
Test suite for the Video Flow Line Diagram Editor.

Focuses on controller (app.py) routes and model (models.py/db.py) DB interactions.
Run with: pytest (from project root in venv).

Agile note: Expand in sprints—add more tests for new features (e.g., wizard endpoints).
"""

import pytest
from app import app, db
from models import EquipmentType

@pytest.fixture
def client():
    app.testing = True
    with app.test_client() as client:
        with app.app_context():
            db.create_all()
        yield client
        with app.app_context():
            db.drop_all()

def test_index(client):
    """Test main route (controller)."""
    response = client.get('/')
    assert response.status_code == 200
    assert b'Video Flow Line Diagram Editor' in response.data  # Check view renders

def test_get_types(client):
    """Test equipment types API (controller/model integration)."""
    with app.app_context():
        db.session.add(EquipmentType(name='Test Type'))
        db.session.commit()
    response = client.get('/api/equipment_types')
    assert response.status_code == 200
    assert 'Test Type' in response.json

def test_add_type(client):
    """Test adding custom type (POST to controller, affects model)."""
    response = client.post('/api/add_type', data={'name': 'New Test Type'})
    assert response.status_code == 200
    with app.app_context():
        assert EquipmentType.query.filter_by(name='New Test Type').first() is not None