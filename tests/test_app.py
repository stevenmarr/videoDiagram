"""
Test suite for the Video Flow Line Diagram Editor.

Expanded for new features (e.g., connection types).
Run with: pytest.
"""

import pytest
from app import app, db
from models import EquipmentType, ConnectionType

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
    response = client.get('/')
    assert response.status_code == 200
    assert b'Video Flow Line Diagram Editor' in response.data

def test_get_types(client):
    with app.app_context():
        db.session.add(EquipmentType(name='Test Type'))
        db.session.commit()
    response = client.get('/api/equipment_types')
    assert response.status_code == 200
    assert 'Test Type' in response.json

def test_add_type(client):
    response = client.post('/api/add_type', data={'name': 'New Test Type'})
    assert response.status_code == 200
    with app.app_context():
        assert EquipmentType.query.filter_by(name='New Test Type').first() is not None

def test_get_connection_types(client):
    with app.app_context():
        db.session.add(ConnectionType(name='HDMI 1.4', color='#0000FF', group='HDMI'))
        db.session.commit()
    response = client.get('/api/connection_types')
    assert response.status_code == 200
    assert any(ct['name'] == 'HDMI 1.4' for ct in response.json)