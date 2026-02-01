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

def test_get_types(client):
    response = client.get('/api/equipment_types')
    assert response.status_code == 200
    assert len(response.json) > 0

def test_add_type(client):
    response = client.post('/api/add_type', data={'name': 'Test Type'})
    assert response.status_code == 200
    with app.app_context():
        assert EquipmentType.query.filter_by(name='Test Type').first() is not None
# Add to existing test_app.py
def test_add_multi_nodes(client):  # Placeholder for JS-side, but manual for now
    pass  # Integrate Selenium for browser tests in future sprint