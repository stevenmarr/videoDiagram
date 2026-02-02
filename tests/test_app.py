"""
Test suite for the Video Flow Line Diagram Editor.

Expanded for node type persistence.
Run with: pytest.
"""

import pytest
from app import app, db
from models import EquipmentType, NodeType

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

def test_add_type(client):
    response = client.post('/api/add_type', data={'name': 'New Test Type'})
    assert response.status_code == 200
    with app.app_context():
        assert EquipmentType.query.filter_by(name='New Test Type').first() is not None

def test_node_type_persistence(client):
    with app.app_context():
        db.session.add(NodeType(key='test_key', spec='{"title": "Test"}'))
        db.session.commit()
    with app.app_context():
        assert NodeType.query.filter_by(key='test_key').first() is not None