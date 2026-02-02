// static/js/app.js
// Client-side JavaScript logic for the Video Flow Line Diagram Editor
// Uses LiteGraph.js for node-based editor

// Globals
let videoStandards = [];
let graph;
let editingType = null;           // Currently edited node type key
let instanceNode = null;          // Currently edited instance node

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', async function () {
    // Fetch connection types (video standards) from database
    const standardsRes = await fetch('/api/connection_types');
    videoStandards = await standardsRes.json();

    // Fetch and register persisted custom node types from DB
    const nodeTypesRes = await fetch('/api/node_types');
    const persistedNodes = await nodeTypesRes.json();
    persistedNodes.forEach(({ key, spec }) => {
        try {
            const nodeSpec = JSON.parse(spec);

            function CustomEquipment() {
                (nodeSpec.inputs || []).forEach(([n, t]) => this.addInput(n, t));
                (nodeSpec.outputs || []).forEach(([n, t]) => this.addOutput(n, t));
                this.properties = nodeSpec.properties || {};
            }

            CustomEquipment.title = nodeSpec.title || key.replace('equipment/', '');
            CustomEquipment.prototype.onDrawBackground = function (ctx) { /* optional */ };

            LiteGraph.registerNodeType(key, CustomEquipment);
        } catch (e) {
            console.error(`Failed to register persisted node type ${key}:`, e);
        }
    });

    // Initialize LiteGraph canvas
    const canvasEl = document.getElementById('mycanvas');
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = window.innerWidth - 200;   // sidebar width
    const cssHeight = window.innerHeight * 0.8;

    canvasEl.width = cssWidth * dpr;
    canvasEl.height = cssHeight * dpr;
    canvasEl.style.width = cssWidth + 'px';
    canvasEl.style.height = cssHeight + 'px';

    graph = new LGraph();
    graph.config = { links_ontop: true };
    const canvas = new LGraphCanvas("#mycanvas", graph);

    canvas.ctx.scale(dpr, dpr);
    canvas.bgctx.scale(dpr, dpr);
    canvas.bgcanvas.width = canvasEl.width;
    canvas.bgcanvas.height = canvasEl.height;

    graph.start();

    // Prevent incompatible connections
    const originalConnect = LGraphNode.prototype.connect;
    LGraphNode.prototype.connect = function (slot, targetNode, targetSlot) {
        const output = this.outputs[slot];
        const input = targetNode.inputs[targetSlot];
        if (output && input) {
            const outStd = videoStandards.find(s => s.name === output.type);
            const inStd = videoStandards.find(s => s.name === input.type);
            if (outStd && inStd && outStd.group !== inStd.group) {
                alert(`Cannot connect ${output.type} → ${input.type} (different families)`);
                return false;
            }
        }
        return originalConnect.apply(this, arguments);
    };

    // Custom port rendering (color circles)
    const originalDrawNode = LGraphCanvas.prototype.drawNode;
    LGraphCanvas.prototype.drawNode = function (node, ctx) {
        originalDrawNode.apply(this, arguments);

        if (node.inputs) {
            node.inputs.forEach(input => {
                if (input.pos && input.pos.length >= 2) {
                    const std = videoStandards.find(s => s.name === input.type);
                    if (std) {
                        ctx.fillStyle = std.color;
                        ctx.beginPath();
                        ctx.arc(input.pos[0], input.pos[1], 6, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            });
        }

        if (node.outputs) {
            node.outputs.forEach(output => {
                if (output.pos && output.pos.length >= 2) {
                    const std = videoStandards.find(s => s.name === output.type);
                    if (std) {
                        ctx.fillStyle = std.color;
                        ctx.beginPath();
                        ctx.arc(output.pos[0], output.pos[1], 6, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            });
        }
    };

    // Custom link color (matches source port)
    const originalDrawLink = LGraphCanvas.prototype.drawLink;
    LGraphCanvas.prototype.drawLink = function (link, ctx) {
        const out = link.origin_node.outputs[link.origin_slot];
        if (out) {
            const std = videoStandards.find(s => s.name === out.type);
            if (std) ctx.strokeStyle = std.color;
        }
        originalDrawLink.apply(this, arguments);
        ctx.strokeStyle = LiteGraph.LINK_COLOR; // reset
    };

    // Right-click context menu on canvas
    canvas.canvas.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        e.stopPropagation();

        const canvasX = canvas.canvasX;
        const canvasY = canvas.canvasY;

        const menuItems = [
            {
                title: "Add Node",
                has_submenu: true,
                submenu: {
                    options: [
                        {
                            title: "Create new node",
                            callback: () => openWizard('create')
                        },
                        {
                            title: "Add existing node",
                            has_submenu: true,
                            submenu: {
                                options: [
                                    {
                                        title: "By device type",
                                        has_submenu: true,
                                        submenu: buildByDeviceTypeMenu(canvasX, canvasY)
                                    },
                                    {
                                        title: "By manufacturer",
                                        has_submenu: true,
                                        submenu: buildByManufacturerMenu(canvasX, canvasY)
                                    },
                                    {
                                        title: "Recently added",
                                        has_submenu: true,
                                        submenu: buildRecentlyAddedMenu(canvasX, canvasY)
                                    }
                                ]
                            }
                        }
                    ]
                }
            }
        ];

        new LiteGraph.ContextMenu(menuItems, {
            event: e,
            callback: null,
            parentMenu: null
        });
    });

    // Right-click on node → edit instance properties
    canvas.onShowNodePanel = function (node) {
        openInstanceEdit(node);
    };

    // Right-click on sidebar item → edit node type
    document.getElementById('nodeList').addEventListener('contextmenu', e => {
        if (e.target.tagName === 'LI') {
            editingType = e.target.dataset.type;
            openWizard('edit', editingType);
            e.preventDefault();
        }
    });

    // Initial sidebar population
    updateSidebar();
});

// Build "By device type" submenu
function buildByDeviceTypeMenu(x, y) {
    const groups = {};
    Object.keys(LiteGraph.registered_node_types).forEach(key => {
        if (!key.startsWith('equipment/')) return;
        const nodeClass = LiteGraph.registered_node_types[key];
        const category = nodeClass.properties?.equipmentType || 'Other';
        if (!groups[category]) groups[category] = [];
        groups[category].push({
            title: nodeClass.title,
            callback: () => addNodeInstance(key, x, y)
        });
    });

    const options = [];
    Object.keys(groups).sort().forEach(cat => {
        options.push({
            title: cat,
            has_submenu: true,
            submenu: { options: groups[cat] }
        });
    });

    return { options: options.length ? options : [{ title: "(No nodes yet)", disabled: true }] };
}

// Build "By manufacturer" submenu
function buildByManufacturerMenu(x, y) {
    const groups = {};
    Object.keys(LiteGraph.registered_node_types).forEach(key => {
        if (!key.startsWith('equipment/')) return;
        const nodeClass = LiteGraph.registered_node_types[key];
        const manu = nodeClass.properties?.manufacturer || 'Unknown';
        if (!groups[manu]) groups[manu] = [];
        groups[manu].push({
            title: nodeClass.title,
            callback: () => addNodeInstance(key, x, y)
        });
    });

    const options = [];
    Object.keys(groups).sort().forEach(manu => {
        options.push({
            title: manu,
            has_submenu: true,
            submenu: { options: groups[manu] }
        });
    });

    return { options: options.length ? options : [{ title: "(No nodes yet)", disabled: true }] };
}

// Build "Recently added" submenu (simple last-in-first-out approximation)
function buildRecentlyAddedMenu(x, y) {
    const recent = [];
    const allKeys = Object.keys(LiteGraph.registered_node_types)
        .filter(k => k.startsWith('equipment/'))
        .slice(-10)   // last 10
        .reverse();   // most recent first

    allKeys.forEach(key => {
        const nodeClass = LiteGraph.registered_node_types[key];
        recent.push({
            title: nodeClass.title,
            callback: () => addNodeInstance(key, x, y)
        });
    });

    return { options: recent.length ? recent : [{ title: "(No recent nodes)", disabled: true }] };
}

// Refresh sidebar (grouped by equipment type)
function updateSidebar() {
    const list = document.getElementById('nodeList');
    list.innerHTML = '';

    const groups = {};
    Object.keys(LiteGraph.registered_node_types).forEach(key => {
        if (!key.startsWith('equipment/')) return;
        const nodeClass = LiteGraph.registered_node_types[key];
        const cat = nodeClass.properties?.equipmentType || 'Uncategorized';
        if (!groups[cat]) groups[cat] = [];
        const li = document.createElement('li');
        li.textContent = nodeClass.title;
        li.draggable = true;
        li.dataset.type = key;
        li.addEventListener('dragstart', e => e.dataTransfer.setData('node-type', key));
        groups[cat].push(li);
    });

    Object.keys(groups).sort().forEach(cat => {
        const header = document.createElement('strong');
        header.textContent = cat;
        header.style.display = 'block';
        header.style.margin = '10px 0 5px 10px';
        list.appendChild(header);
        groups[cat].forEach(li => list.appendChild(li));
    });
}

// Open wizard (create or edit mode)
async function openWizard(mode, typeKey = null) {
    editingType = typeKey;
    document.getElementById('wizardModal').style.display = 'block';
    document.getElementById('inputsList').innerHTML = '';
    document.getElementById('outputsList').innerHTML = '';
    document.getElementById('nodeForm').reset();

    // Manufacturer dropdown from DB
    const manuSelect = document.getElementById('manufacturer');
    manuSelect.innerHTML = '<option value="new">Add New Manufacturer</option>';
    const res = await fetch('/api/manufacturers');
    const mans = await res.json();
    mans.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        manuSelect.appendChild(opt);
    });

    if (mode === 'edit' && typeKey) {
        const nodeClass = LiteGraph.registered_node_types[typeKey];
        if (nodeClass?.properties) {
            document.getElementById('equipmentType').value = nodeClass.properties.equipmentType || '';
            document.getElementById('manufacturer').value   = nodeClass.properties.manufacturer   || '';
            document.getElementById('model').value          = nodeClass.properties.model          || '';
            document.getElementById('ipCapable').checked    = !!nodeClass.properties.ipCapable;

            (nodeClass.prototype.inputs || []).forEach(([n, t]) => {
                const namePart = n.split(' ')[0];
                addDynamicField('inputs', namePart, t);
            });
            (nodeClass.prototype.outputs || []).forEach(([n, t]) => {
                const namePart = n.split(' ')[0];
                addDynamicField('outputs', namePart, t);
            });
        }
    }
}

function closeWizard() {
    document.getElementById('wizardModal').style.display = 'none';
    editingType = null;
}

// Add port row
function addDynamicField(type, name = '', std = '') {
    const list = document.getElementById(type + 'List');
    const div = document.createElement('div');
    div.className = 'dynamic-item';
    div.innerHTML = `
        <input type="text" class="portName" placeholder="e.g. Input 1" value="${name}" required>
        <select class="portType" required>
            <option value="">Select</option>
            ${videoStandards.map(s => `<option value="${s.name}" ${s.name === std ? 'selected' : ''}>${s.name}</option>`).join('')}
        </select>
        <button type="button" onclick="duplicatePort(this.parentElement, '${type}')">Duplicate</button>
    `;
    list.appendChild(div);
}

// Duplicate port with auto-incremented ID
function duplicatePort(item, type) {
    const nameInput = item.querySelector('.portName');
    const typeSelect = item.querySelector('.portType');

    let name = nameInput.value.trim();
    if (!name) {
        alert("Fill port name first.");
        return;
    }

    const idMatch = name.match(/(\d+)$/);
    const base = name.replace(/\d+$/, '').trim();
    const nextId = idMatch ? parseInt(idMatch[1]) + 1 : 2;

    addDynamicField(type, `${base}${nextId}`, typeSelect.value);
}

// Create or edit node type
async function createOrEditNodeType() {
    const eqType = document.getElementById('equipmentType').value.trim();
    let manu = document.getElementById('manufacturer').value;
    if (manu === 'new') {
        manu = document.getElementById('customManufacturer').value.trim();
    }
    const mdl = document.getElementById('model').value.trim();
    const ipCapable = document.getElementById('ipCapable').checked;

    if (!eqType || !manu || !mdl) {
        alert("Equipment Type, Manufacturer, and Model are required.");
        return;
    }

    const title = `${eqType} - ${manu} ${mdl}`;
    const key = `equipment/${title.replace(/\s+/g, '_')}`;

    const inputs = [];
    document.querySelectorAll('#inputsList .dynamic-item').forEach(div => {
        const name = div.querySelector('.portName').value.trim();
        const typ = div.querySelector('.portType').value;
        if (name && typ) inputs.push([`${name} ${typ}`, typ]);
    });

    const outputs = [];
    document.querySelectorAll('#outputsList .dynamic-item').forEach(div => {
        const name = div.querySelector('.portName').value.trim();
        const typ = div.querySelector('.portType').value;
        if (name && typ) outputs.push([`${name} ${typ}`, typ]);
    });

    function CustomEquipment() {
        inputs.forEach(([n, t]) => this.addInput(n, t));
        outputs.forEach(([n, t]) => this.addOutput(n, t));
        this.properties = {
            equipmentType: eqType,
            manufacturer: manu,
            model: mdl,
            ipCapable,
            deviceId: '',
            ipAddress: ''
        };
    }
    CustomEquipment.title = title;
    CustomEquipment.prototype.onDrawBackground = function (ctx) { };

    if (editingType && LiteGraph.registered_node_types[editingType]) {
        LiteGraph.unregisterNodeType(editingType);
    }

    LiteGraph.registerNodeType(key, CustomEquipment);

    // Persist to database
    const specObj = {
        title,
        inputs,
        outputs,
        properties: { equipmentType: eqType, manufacturer: manu, model: mdl, ipCapable }
    };
    await fetch('/api/add_node_type', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `key=${encodeURIComponent(key)}&spec=${encodeURIComponent(JSON.stringify(specObj))}`
    });

    updateSidebar();
    closeWizard();
    alert(`Node type "${title}" ${editingType ? 'updated' : 'created'} successfully.`);
}

// Create instance with incremental ID
function addNodeInstance(typeKey, x, y) {
    const node = LiteGraph.createNode(typeKey);
    if (!node) return;

    const base = node.title.replace(/\s+\d+$/, '');
    const sameType = graph._nodes.filter(n => n.title.startsWith(base));
    const nextId = sameType.length + 1;

    node.title = base + (nextId > 1 ? ' ' + nextId : '');
    node.pos = [x, y];
    graph.add(node);
}

// Instance edit modal
function openInstanceEdit(node) {
    instanceNode = node;
    document.getElementById('instanceEditModal').style.display = 'block';
    document.getElementById('deviceId').value = node.properties.deviceId || '';
    const ip = document.getElementById('ipAddress');
    ip.value = node.properties.ipAddress || '';
    ip.disabled = !node.properties.ipCapable;
}

function closeInstanceEdit() {
    document.getElementById('instanceEditModal').style.display = 'none';
}

function saveInstanceEdit() {
    if (instanceNode) {
        instanceNode.properties.deviceId = document.getElementById('deviceId').value.trim();
        if (instanceNode.properties.ipCapable) {
            instanceNode.properties.ipAddress = document.getElementById('ipAddress').value.trim();
        }
        closeInstanceEdit();
    }
}

// Generate report
function generateReport() {
    const data = graph.serialize();
    const reportDiv = document.getElementById('report');
    reportDiv.innerHTML = '';
    reportDiv.style.display = 'block';

    // Inventory summary
    const counts = {};
    data.nodes.forEach(n => {
        const key = `${n.properties.equipmentType} - ${n.properties.manufacturer} ${n.properties.model}`;
        counts[key] = (counts[key] || 0) + 1;
    });

    let invHtml = '<h2>Inventory</h2><table border="1"><tr><th>Type</th><th>Manufacturer</th><th>Model</th><th>Count</th></tr>';
    Object.entries(counts).forEach(([key, cnt]) => {
        const [type, rest] = key.split(' - ');
        const [manu, model] = rest.split(' ');
        invHtml += `<tr><td>${type}</td><td>${manu}</td><td>${model}</td><td>${cnt}</td></tr>`;
    });
    invHtml += '</table>';

    // Connections
    let connHtml = '<h2>Connections</h2><table border="1"><tr><th>From</th><th>Output</th><th>To</th><th>Input</th></tr>';
    data.links.forEach(link => {
        const [, fromId, fromSlot, toId, toSlot] = link;
        const from = data.nodes.find(n => n.id === fromId);
        const to = data.nodes.find(n => n.id === toId);
        const fromLabel = `${from.properties.manufacturer} - ${from.properties.model} - ID ${fromId}`;
        const toLabel = `${to.properties.manufacturer} - ${to.properties.model} - ID ${toId}`;
        connHtml += `<tr>
            <td>${fromLabel}</td>
            <td>${from.outputs[fromSlot]?.name || '?'}</td>
            <td>${toLabel}</td>
            <td>${to.inputs[toSlot]?.name || '?'}</td>
        </tr>`;
    });
    connHtml += '</table>';

    reportDiv.innerHTML = invHtml + connHtml;
}