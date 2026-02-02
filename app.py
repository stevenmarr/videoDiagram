"""
app.py - Controller layer for the Video Flow Line Diagram Editor

Flask application with MVC structure:
- Models: models.py (SQLAlchemy models)
- Views: templates/index.html + client-side JS
- Controller: this file (routes, business logic)

Uses SQLite for persistence (node types, manufacturers, connection types).
Node type registration happens client-side via /api/node_types.

Run with: python3 app.py
"""

from flask import Flask, render_template, jsonify, request
from db import db
from models import (
    EquipmentType,
    Manufacturer,
    Model,
    ConnectionType,
    NodeType,
    Association,
    EQUIPMENT_TYPES,
    MANUFACTURERS_BY_TYPE,
    MODELS_BY_MANUFACTURER,
    VIDEO_STANDARDS
)

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///data.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)


def seed_database():
    """Seed initial data if tables are empty."""
    db.create_all()

    # Equipment Types
    if EquipmentType.query.count() == 0:
        for name in EQUIPMENT_TYPES:
            db.session.add(EquipmentType(name=name))
        db.session.commit()

    # Manufacturers & associations
    if Manufacturer.query.count() == 0:
        for eq_type_name, man_list in MANUFACTURERS_BY_TYPE.items():
            eq_type = EquipmentType.query.filter_by(name=eq_type_name).first()
            if not eq_type:
                continue
            for man_name in man_list:
                man = Manufacturer.query.filter_by(name=man_name).first()
                if not man:
                    man = Manufacturer(name=man_name)
                    db.session.add(man)
                    db.session.commit()
                if man not in eq_type.manufacturers:
                    eq_type.manufacturers.append(man)
        db.session.commit()

    # Models
    if Model.query.count() == 0:
        for man_name, model_list in MODELS_BY_MANUFACTURER.items():
            man = Manufacturer.query.filter_by(name=man_name).first()
            if man:
                for model_name in model_list:
                    if not Model.query.filter_by(name=model_name, manufacturer_id=man.id).first():
                        db.session.add(Model(name=model_name, manufacturer_id=man.id))
        db.session.commit()

    # Connection Types (video standards)
    if ConnectionType.query.count() == 0:
        for std in VIDEO_STANDARDS:
            db.session.add(ConnectionType(
                name=std['name'],
                color=std['color'],
                group=std['group']
            ))
        db.session.commit()


@app.before_request
def initialize_db():
    """Run seeding once at startup (safe to call multiple times)."""
    if not hasattr(initialize_db, 'has_run'):
        with app.app_context():
            seed_database()
        initialize_db.has_run = True


@app.route('/')
def index():
    """Serve the main single-page application."""
    return render_template('index.html')


@app.route('/api/equipment_types', methods=['GET'])
def api_equipment_types():
    """List all equipment types."""
    types = [t.name for t in EquipmentType.query.all()]
    return jsonify(types)


@app.route('/api/manufacturers', methods=['GET'])
def api_all_manufacturers():
    """List all manufacturers (used in wizard dropdown)."""
    manufacturers = [m.name for m in Manufacturer.query.all()]
    return jsonify(manufacturers)


@app.route('/api/manufacturers/<equipment_type>', methods=['GET'])
def api_manufacturers_for_type(equipment_type):
    """Manufacturers associated with a specific equipment type."""
    eq_type = EquipmentType.query.filter_by(name=equipment_type).first()
    if eq_type:
        return jsonify([m.name for m in eq_type.manufacturers])
    return jsonify([])


@app.route('/api/models/<manufacturer>', methods=['GET'])
def api_models_for_manufacturer(manufacturer):
    """Models for a given manufacturer."""
    man = Manufacturer.query.filter_by(name=manufacturer).first()
    if man:
        return jsonify([m.name for m in man.models])
    return jsonify([])


@app.route('/api/connection_types', methods=['GET'])
def api_connection_types():
    """All video/connection standards with color and group."""
    types = [
        {"name": t.name, "color": t.color, "group": t.group}
        for t in ConnectionType.query.all()
    ]
    return jsonify(types)


@app.route('/api/node_types', methods=['GET'])
def api_node_types():
    """All persisted custom node types (for client-side registration)."""
    nodes = [
        {"key": nt.key, "spec": nt.spec}
        for nt in NodeType.query.all()
    ]
    return jsonify(nodes)


@app.route('/api/add_type', methods=['POST'])
def api_add_equipment_type():
    name = request.form.get('name', '').strip()
    if not name:
        return jsonify({"error": "Name required"}), 400
    if not EquipmentType.query.filter_by(name=name).first():
        db.session.add(EquipmentType(name=name))
        db.session.commit()
    return jsonify({"status": "ok"})


@app.route('/api/add_manufacturer', methods=['POST'])
def api_add_manufacturer():
    name = request.form.get('name', '').strip()
    type_name = request.form.get('type', '').strip()

    if not name:
        return jsonify({"error": "Name required"}), 400

    if Manufacturer.query.filter_by(name=name).first():
        return jsonify({"status": "already exists"})

    new_man = Manufacturer(name=name)
    db.session.add(new_man)
    db.session.commit()

    # Optional: associate with type
    if type_name:
        eq_type = EquipmentType.query.filter_by(name=type_name).first()
        if eq_type:
            eq_type.manufacturers.append(new_man)
            db.session.commit()

    return jsonify({"status": "ok"})


@app.route('/api/add_model', methods=['POST'])
def api_add_model():
    name = request.form.get('name', '').strip()
    man_name = request.form.get('manufacturer', '').strip()

    if not name or not man_name:
        return jsonify({"error": "Name and manufacturer required"}), 400

    man = Manufacturer.query.filter_by(name=man_name).first()
    if not man:
        return jsonify({"error": "Manufacturer not found"}), 404

    if Model.query.filter_by(name=name, manufacturer_id=man.id).first():
        return jsonify({"status": "already exists"})

    db.session.add(Model(name=name, manufacturer_id=man.id))
    db.session.commit()
    return jsonify({"status": "ok"})


@app.route('/api/add_node_type', methods=['POST'])
def api_add_node_type():
    key = request.form.get('key', '').strip()
    spec = request.form.get('spec', '').strip()  # JSON string

    if not key or not spec:
        return jsonify({"error": "key and spec required"}), 400

    nt = NodeType.query.filter_by(key=key).first()
    if nt:
        nt.spec = spec
    else:
        nt = NodeType(key=key, spec=spec)
        db.session.add(nt)

    db.session.commit()
    return jsonify({"status": "ok", "key": key})


if __name__ == '__main__':
    app.run(debug=True, extra_files=[
        'templates/index.html',
        'static/js/app.js',
        'static/css/styles.css',
        'static/litegraph.js',
        'static/litegraph.css',
        'models.py',
        'db.py'
    ])