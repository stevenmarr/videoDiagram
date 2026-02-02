"""
Model module for the Video Flow Line Diagram Editor.

Added ConnectionType for standards. No new data added—using presented lists.

For testing: Query counts (e.g., assert EquipmentType.query.count() > 0).
"""

from db import db  # Import db from db.py

# Many-to-many association for types and manufacturers
Association = db.Table('association',
    db.Column('type_id', db.Integer, db.ForeignKey('equipment_type.id'), primary_key=True),
    db.Column('manufacturer_id', db.Integer, db.ForeignKey('manufacturer.id'), primary_key=True)
)

class EquipmentType(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)
    manufacturers = db.relationship('Manufacturer', secondary=Association, backref=db.backref('types', lazy=True))

class Manufacturer(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)
    models = db.relationship('Model', backref='manufacturer', lazy=True)

class Model(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    manufacturer_id = db.Column(db.Integer, db.ForeignKey('manufacturer.id'), nullable=False)

class ConnectionType(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False)
    color = db.Column(db.String(7), nullable=False)  # Hex color
    group = db.Column(db.String(50), nullable=False)

# Initial seed data (used in app.py; no new additions)
EQUIPMENT_TYPES = [
    "Graphics Source",
    "Camera Source",
    "Playback Source",
    "Media Server Source",
    "Video Switcher",
    "Router",
    "Hi Res Switcher",
    "Monitor Display",
    "LED Processor",
    "Projector",
    "Convertor",
    "Recorder",
    "Test Equipment",
    "Control System",
]

MANUFACTURERS_BY_TYPE = {
    "Graphics Source": ["Barco", "Christie", "Singular.live", "Notch.one", "Superside"],
    "Camera Source": ["Sony", "Canon", "Panasonic", "PTZOptics", "BirdDog", "Marshall"],
    "Playback Source": ["EVS", "MultiTracks.com", "Electronic Creatives", "SpotMe"],
    "Media Server Source": ["Christie (Pandoras Box)", "Green Hippo", "Lux Machina", "AV Stumpfl", "Analog Way", "Dataton"],
    "Video Switcher": ["Blackmagic Design", "Roland", "Ross Video", "Grass Valley", "Panasonic", "Sony"],
    "Router": ["TP-Link", "ASUS", "NETGEAR", "Synology", "TVU Networks"],
    "Hi Res Switcher": ["Blackmagic Design", "Roland", "Ross Video", "Grass Valley", "Panasonic", "Sony"],
    "Monitor Display": ["Planar", "Samsung", "LG", "ROE Visual", "Leyard", "Daktronics"],
    "LED Processor": ["NovaStar", "Colorlight", "Linsn", "Vanguard LED Displays", "ROE Visual", "Absen"],
    "Projector": ["Epson", "Optoma", "BenQ", "Panasonic", "Barco", "Christie"],
    "Convertor": ["URayCoder", "Datavideo", "LiveU", "Epiphan", "AJA", "Blackmagic Design"],
    "Recorder": ["Tascam", "Zoom", "Roland", "Sound Devices", "Aaton Digital", "Zaxcom"],
    "Test Equipment": ["Tektronix", "Leader Electronics", "PHABRIX", "Ross Video", "Keysight Technologies"],
    "Control System": ["Crestron", "Extron", "QSC", "Yamaha", "Shure"],
    "Custom": [],
}

MODELS_BY_MANUFACTURER = {
    "Barco": ["ImagePro II", "E2 Gen 2"],
    "Christie": ["Pandoras Box", "Spyder X80"],
    "Singular.live": ["Singular Graphics Platform"],
    "Notch.one": ["Notch Builder"],
    "Superside": ["Motion Graphics Suite"],
    "Sony": ["ZV-1", "FR7", "HDC-5500"],
    "Canon": ["PowerShot G7 X Mark III"],
    "Panasonic": ["AW-UE50 PTZ", "Lumix Series"],
    "PTZOptics": ["PTZ Cameras"],
    "BirdDog": ["PTZ Cameras"],
    "Marshall": ["Miniature HD/4K Cameras"],
    "EVS": ["XtraMotion", "LiveCeption"],
    "MultiTracks.com": ["Playback 8"],
    "Electronic Creatives": ["Ableton Rigs"],
    "SpotMe": ["Event Platforms"],
    "Christie (Pandoras Box)": ["Pandoras Box Software"],
    "Green Hippo": ["Tierra+ MK2 Hippotizer"],
    "Lux Machina": ["Lux Arca"],
    "AV Stumpfl": ["Modular Platforms"],
    "Analog Way": ["LivePremier"],
    "Dataton": ["WATCHPAX"],
    "Blackmagic Design": ["ATEM Mini Pro", "ATEM Constellation"],
    "Roland": ["V-1HD", "V-8HD", "VR-120HD"],
    "Ross Video": ["Carbonite Ultra"],
    "Grass Valley": ["Kayenne"],
    "Panasonic": ["AV-HS Series"],
    "Sony": ["M2 Live"],
    "TP-Link": ["Archer AXE75", "Deco BE65 Pro"],
    "ASUS": ["ROG Rapture GT-BE98 Pro"],
    "NETGEAR": ["Nighthawk RS300"],
    "Synology": ["WRX560"],
    "TVU Networks": ["TVU Router"],
    "Planar": ["DirectLight Ultra Series"],
    "Samsung": ["The Wall"],
    "LG": ["Magnit"],
    "ROE Visual": ["Black Pearl BP2V2"],
    "Leyard": ["MG-2COB Series"],
    "Daktronics": ["Stadium Displays"],
    "NovaStar": ["NovaPro UHD"],
    "Colorlight": ["Z6 Pro"],
    "Linsn": ["RV908M"],
    "Vanguard LED Displays": ["Sentinel Processor"],
    "ROE Visual": ["Vanish ST"],
    "Absen": ["Acclaim Series"],
    "Epson": ["EB-PU1008B", "PowerLite L790U"],
    "Optoma": ["Short-Throw Series"],
    "BenQ": ["GP520", "X500i"],
    "Panasonic": ["PT-MZ13KL"],
    "Barco": ["UDX-4K32", "G100-W22"],
    "Christie": ["Event Projectors"],
    "URayCoder": ["H.265 Encoder"],
    "Datavideo": ["NVS-35"],
    "LiveU": ["LiveU Solo"],
    "Epiphan": ["Pearl Nano"],
    "AJA": ["HELO Plus"],
    "Blackmagic Design": ["Teranex Mini"],
    "Tascam": ["DR-40X", "Portacapture X8"],
    "Zoom": ["H1 Essential", "H6essential"],
    "Roland": ["R-07"],
    "Sound Devices": ["833", "888"],
    "Aaton Digital": ["Cantar X3"],
    "Zaxcom": ["Nova"],
    "Tektronix": ["WFM Series"],
    "Leader Electronics": ["LT4670"],
    "PHABRIX": ["Qx Series"],
    "Ross Video": ["Test Solutions"],
    "Keysight Technologies": ["Oscilloscopes"],
    "Crestron": ["Wireless Horizon Keypads"],
    "Extron": ["Touch Panels"],
    "QSC": ["Q-Sys"],
    "Yamaha": ["Control Systems"],
    "Shure": ["Audio Solutions"],
    "Custom": [],
}

# Video Standards (moved to DB seeding in app.py)
VIDEO_STANDARDS = [
    {"name": "HDMI 1.4", "color": "#0000FF", "group": "HDMI"},
    {"name": "HDMI 2.0", "color": "#0000CC", "group": "HDMI"},
    {"name": "SDI 3G", "color": "#008000", "group": "SDI"},
    {"name": "SDI 12G", "color": "#006400", "group": "SDI"},
    {"name": "DP 1.2", "color": "#FF0000", "group": "DP"},
    {"name": "DVI", "color": "#FFA500", "group": "DVI"},
    {"name": "USB Type-C", "color": "#800080", "group": "USB-C"},
    {"name": "NDI", "color": "#FFFF00", "group": "NDI"},
    {"name": "SMPTE 2110", "color": "#00FFFF", "group": "SMPTE"},
    {"name": "Composite", "color": "#A52A2A", "group": "Analog"},
    {"name": "S-Video", "color": "#808080", "group": "Analog"},
    {"name": "Component", "color": "#4B0082", "group": "Analog"},
]