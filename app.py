"""
Controller module for the Video Flow Line Diagram Editor.

Fixed many-to-many association by appending to relationship instead of instantiating Table.
No new data—using presented lists.

For testing: Run pytest for routes/DB (see tests/test_app.py).
"""

from flask import Flask, render_template, jsonify, request
from db import db  # Import db from db.py

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///data.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)

# Import models after db init
from models import EquipmentType, Manufacturer, Model, EQUIPMENT_TYPES, MANUFACTURERS_BY_TYPE, MODELS_BY_MANUFACTURER, VIDEO_STANDARDS

def create_db():
    """
    Seed initial data if DB empty.
    """
    db.create_all()
    if EquipmentType.query.count() == 0:
        # Seed types
        for t in EQUIPMENT_TYPES:
            db.session.add(EquipmentType(name=t))
        db.session.commit()
        
        # Seed manufacturers and associations
        for t_name, mans in MANUFACTURERS_BY_TYPE.items():
            type_obj = EquipmentType.query.filter_by(name=t_name).first()
            for m in mans:
                man_obj = Manufacturer.query.filter_by(name=m).first()
                if not man_obj:
                    man_obj = Manufacturer(name=m)
                    db.session.add(man_obj)
                    db.session.commit()
                if type_obj and man_obj not in type_obj.manufacturers:
                    type_obj.manufacturers.append(man_obj)
                    db.session.commit()
        
        # Seed models
        for m_name, mods in MODELS_BY_MANUFACTURER.items():
            man_obj = Manufacturer.query.filter_by(name=m_name).first()
            if man_obj:
                for mod in mods:
                    mod_obj = Model(name=mod, manufacturer_id=man_obj.id)
                    db.session.add(mod_obj)
        db.session.commit()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/equipment_types', methods=['GET'])
def get_equipment_types():
    types = [t.name for t in EquipmentType.query.all()]
    return jsonify(types)

@app.route('/api/manufacturers/<equipment_type>', methods=['GET'])
def get_manufacturers(equipment_type):
    type_obj = EquipmentType.query.filter_by(name=equipment_type).first()
    if type_obj:
        mans = [assoc.manufacturer.name for assoc in type_obj.manufacturers]
    else:
        mans = []
    return jsonify(mans)

@app.route('/api/models/<manufacturer>', methods=['GET'])
def get_models(manufacturer):
    man_obj = Manufacturer.query.filter_by(name=manufacturer).first()
    if man_obj:
        mods = [m.name for m in man_obj.models]
    else:
        mods = []
    return jsonify(mods)

@app.route('/api/video_standards', methods=['GET'])
def get_video_standards():
    return jsonify(VIDEO_STANDARDS)

@app.route('/api/add_type', methods=['POST'])
def add_type():
    name = request.form['name']
    if not EquipmentType.query.filter_by(name=name).first():
        new_type = EquipmentType(name=name)
        db.session.add(new_type)
        db.session.commit()
    return jsonify({"status": "ok"})

@app.route('/api/add_manufacturer', methods=['POST'])
def add_manufacturer():
    name = request.form['name']
    type_name = request.form['type']
    type_obj = EquipmentType.query.filter_by(name=type_name).first()
    if not Manufacturer.query.filter_by(name=name).first():
        new_man = Manufacturer(name=name)
        db.session.add(new_man)
        db.session.commit()
        if type_obj:
            type_obj.manufacturers.append(new_man)
            db.session.commit()
    return jsonify({"status": "ok"})

@app.route('/api/add_model', methods=['POST'])
def add_model():
    name = request.form['name']
    man_name = request.form['manufacturer']
    man_obj = Manufacturer.query.filter_by(name=man_name).first()
    if man_obj and not Model.query.filter_by(name=name, manufacturer_id=man_obj.id).first():
        new_mod = Model(name=name, manufacturer_id=man_obj.id)
        db.session.add(new_mod)
        db.session.commit()
    return jsonify({"status": "ok"})

if __name__ == '__main__':
    with app.app_context():
        create_db()
    app.run(debug=True, extra_files=[
        'templates/index.html',
        'static/js/app.js',
        'static/css/styles.css',
        'static/litegraph.js',
        'static/litegraph.css',
        'models.py',
        'db.py'
    ])