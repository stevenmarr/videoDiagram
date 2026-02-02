// Client-side JavaScript logic for the Video Flow Line Diagram Editor.
// This handles the node editor, wizard, and report generation using LiteGraph.

// Global variables
let videoStandards = [];
let graph;
let editingType = null;  // For edit mode
let instanceNode = null;  // For instance edit

// Wait for DOM to load before initializing
document.addEventListener('DOMContentLoaded', async function() {
    // Fetch video standards from DB
    const standardsRes = await fetch('/api/connection_types');
    videoStandards = await standardsRes.json();

    // Fetch and register persisted node types
    const nodeTypesRes = await fetch('/api/node_types');
    const persistedNodes = await nodeTypesRes.json();
    persistedNodes.forEach(({ key, spec }) => {
        const nodeSpec = JSON.parse(spec);
        function CustomEquipment() {
            nodeSpec.inputs.forEach(([n, t]) => this.addInput(n, t));
            nodeSpec.outputs.forEach(([n, t]) => this.addOutput(n, t));
            this.properties = nodeSpec.properties;
        }
        CustomEquipment.title = nodeSpec.title;
        CustomEquipment.prototype.onDrawBackground = function(ctx) {
            // Optional
        };
        LiteGraph.registerNodeType(key, CustomEquipment);
    });

    // Setup LiteGraph
    const canvasEl = document.getElementById('mycanvas');
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = window.innerWidth - 200;
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

    // Override connect for compatibility
    const originalConnect = LGraphNode.prototype.connect;
    LGraphNode.prototype.connect = function(slot, targetNode, targetSlot) {
        const output = this.outputs[slot];
        const input = targetNode.inputs[targetSlot];
        if (output && input) {
            const outputStd = videoStandards.find(s => s.name === output.type);
            const inputStd = videoStandards.find(s => s.name === input.type);
            if (outputStd && inputStd && outputStd.group !== inputStd.group) {
                alert('Incompatible port types: ' + output.type + ' and ' + input.type);
                return false;
            }
        }
        return originalConnect.apply(this, arguments);
    };

    // Override drawing for colored ports
    const originalDrawNode = LGraphCanvas.prototype.drawNode;
    LGraphCanvas.prototype.drawNode = function(node, ctx) {
        originalDrawNode.apply(this, arguments);
        if (node.inputs) {
            node.inputs.forEach((input, i) => {
                if (input.pos && input.pos.length >= 2) {
                    const std = videoStandards.find(s => s.name === input.type);
                    if (std) {
                        ctx.fillStyle = std.color;
                        ctx.beginPath();
                        ctx.arc(input.pos[0], input.pos[1], 5, 0, 2 * Math.PI);
                        ctx.fill();
                    }
                }
            });
        }
        if (node.outputs) {
            node.outputs.forEach((output, i) => {
                if (output.pos && output.pos.length >= 2) {
                    const std = videoStandards.find(s => s.name === output.type);
                    if (std) {
                        ctx.fillStyle = std.color;
                        ctx.beginPath();
                        ctx.arc(output.pos[0], output.pos[1], 5, 0, 2 * Math.PI);
                        ctx.fill();
                    }
                }
            });
        }
    };

    // Override link drawing for color
    const originalDrawLink = LGraphCanvas.prototype.drawLink;
    LGraphCanvas.prototype.drawLink = function(link, ctx) {
        const output = link.origin_node.outputs[link.origin_slot];
        if (output) {
            const std = videoStandards.find(s => s.name === output.type);
            if (std) {
                ctx.strokeStyle = std.color;
            }
        }
        originalDrawNode.apply(this, arguments);
        ctx.strokeStyle = LiteGraph.LINK_COLOR; // reset
    };

    // Event listeners
    document.getElementById('createNodeButton').addEventListener('click', () => openWizard('create'));
    document.getElementById('generateReportButton').addEventListener('click', generateReport);

    // Drag & drop from sidebar
    canvasEl.addEventListener('drop', (e) => {
        e.preventDefault();
        const type = e.dataTransfer.getData('node-type');
        if (type) {
            addNodeInstance(type, e.clientX - 200, e.clientY);
        }
    });
    canvasEl.addEventListener('dragover', (e) => e.preventDefault());

    // Canvas right-click
    canvas.showMenu = function(e) {
        new LiteGraph.ContextMenu([{title: "Create New Node", callback: () => openWizard('create')}], {event: e});
    };

    // Instance right-click edit
    canvas.onShowNodePanel = function(node, e) {
        openInstanceEdit(node);
    };

    // Sidebar right-click edit
    document.getElementById('nodeList').addEventListener('contextmenu', (e) => {
        if (e.target.tagName === 'LI') {
            editingType = e.target.dataset.type;
            openWizard('edit', editingType);
            e.preventDefault();
        }
    });

    // Initial sidebar update
    updateSidebar();
});

// Update sidebar
function updateSidebar() {
    const nodeList = document.getElementById('nodeList');
    nodeList.innerHTML = '';
    const groups = {};
    Object.keys(LiteGraph.registered_node_types).forEach(type => {
        if (type.startsWith('equipment/')) {
            const nodeClass = LiteGraph.registered_node_types[type];
            const eqType = nodeClass.properties?.equipmentType || 'Uncategorized';
            if (!groups[eqType]) groups[eqType] = [];
            const li = document.createElement('li');
            li.textContent = nodeClass.title;
            li.draggable = true;
            li.dataset.type = type;
            li.addEventListener('dragstart', (e) => e.dataTransfer.setData('node-type', type));
            groups[eqType].push(li);
        }
    });
    Object.keys(groups).sort().forEach(group => {
        const header = document.createElement('strong');
        header.textContent = group;
        header.style.display = 'block';
        header.style.margin = '10px 0 5px 10px';
        nodeList.appendChild(header);
        groups[group].forEach(li => nodeList.appendChild(li));
    });
}

// Open wizard
async function openWizard(mode, type = null) {
    editingType = type;
    document.getElementById('wizardModal').style.display = 'block';
    document.getElementById('inputsList').innerHTML = '';
    document.getElementById('outputsList').innerHTML = '';
    document.getElementById('nodeForm').reset();

    // Manufacturer dropdown
    const manuSelect = document.getElementById('manufacturer');
    manuSelect.innerHTML = '<option value="new">Add New Manufacturer</option>';
    const manuRes = await fetch('/api/manufacturers');
    const manufacturers = await manuRes.json();
    manufacturers.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        manuSelect.appendChild(opt);
    });

    if (mode === 'edit' && type) {
        const nodeClass = LiteGraph.registered_node_types[type];
        if (nodeClass) {
            document.getElementById('equipmentType').value = nodeClass.properties.equipmentType || '';
            document.getElementById('manufacturer').value = nodeClass.properties.manufacturer || '';
            document.getElementById('model').value = nodeClass.properties.model || '';
            document.getElementById('ipCapable').checked = nodeClass.properties.ipCapable || false;
            nodeClass.prototype.inputs.forEach(([n, t]) => addDynamicField('inputs', n.split(' ')[0], t));
            nodeClass.prototype.outputs.forEach(([n, t]) => addDynamicField('outputs', n.split(' ')[0], t));
        }
    }
}

function closeWizard() {
    document.getElementById('wizardModal').style.display = 'none';
}

function addDynamicField(type, name = '', std = '') {
    const list = document.getElementById(type + 'List');
    const item = document.createElement('div');
    item.className = 'dynamic-item';
    item.innerHTML = `
        <input type="text" placeholder="Port Name (e.g., Input 1)" class="portName" value="${name}" required>
        <select class="portType" required>
            <option value="">Select Video Standard</option>
            ${videoStandards.map(s => `<option value="${s.name}" ${s.name === std ? 'selected' : ''}>${s.name}</option>`).join('')}
        </select>
        <button type="button" onclick="duplicatePort(this.parentElement, '${type}')">Duplicate</button>
    `;
    list.appendChild(item);
}

function duplicatePort(item, type) {
    const portName = item.querySelector('.portName').value;
    const portType = item.querySelector('.portType').value;
    if (portName && portType) {
        const idMatch = portName.match(/\d+$/);
        const base = portName.replace(/\d+$/, '').trim();
        const nextId = idMatch ? parseInt(idMatch[0]) + 1 : 2;
        addDynamicField(type, `${base} ${nextId}`, portType);
    } else {
        alert('Fill name and type before duplicating.');
    }
}

async function createOrEditNodeType() {
    const equipmentType = document.getElementById('equipmentType').value;
    let manufacturer = document.getElementById('manufacturer').value;
    if (manufacturer === 'new') {
        manufacturer = document.getElementById('customManufacturer').value;
    }
    const model = document.getElementById('model').value;
    const ipCapable = document.getElementById('ipCapable').checked;
    const name = `${equipmentType} - ${manufacturer} ${model}`;
    const typeKey = "equipment/" + name.replace(/\s/g, '_');

    const inputs = [];
    document.querySelectorAll('#inputsList .dynamic-item').forEach(item => {
        const portName = item.querySelector('.portName').value;
        const portType = item.querySelector('.portType').value;
        if (portName && portType) {
            inputs.push([`${portName} ${portType}`, portType]);
        }
    });

    const outputs = [];
    document.querySelectorAll('#outputsList .dynamic-item').forEach(item => {
        const portName = item.querySelector('.portName').value;
        const portType = item.querySelector('.portType').value;
        if (portName && portType) {
            outputs.push([`${portName} ${portType}`, portType]);
        }
    });

    function CustomEquipment() {
        inputs.forEach(([n, t]) => this.addInput(n, t));
        outputs.forEach(([n, t]) => this.addOutput(n, t));
        this.properties = { equipmentType, manufacturer, model, ipCapable, deviceId: '', ipAddress: '' };
    }
    CustomEquipment.title = name;
    CustomEquipment.prototype.onDrawBackground = function(ctx) {
        // Optional
    };

    if (editingType) {
        LiteGraph.unregisterNodeType(editingType);
    }

    LiteGraph.registerNodeType(typeKey, CustomEquipment);

    // Save to DB
    const spec = JSON.stringify({ title: name, inputs, outputs, properties: { equipmentType, manufacturer, model, ipCapable } });
    await fetch('/api/add_node_type', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `key=${encodeURIComponent(typeKey)}&spec=${encodeURIComponent(spec)}`
    });

    updateSidebar();
    closeWizard();
    alert('New node type "' + name + '" created! Search for it in the editor to add instances.');
}

// Add node instance with unique ID
function addNodeInstance(type, x, y) {
    const node = LiteGraph.createNode(type);
    const baseTitle = node.title.replace(/\ \d+$/, '');
    const existing = graph.findNodesByTitle(baseTitle);
    const count = existing.length + 1;
    node.title = baseTitle + ' ' + count;
    node.pos = [x, y];
    graph.add(node);
}

// Open instance edit
function openInstanceEdit(node) {
    instanceNode = node;
    document.getElementById('instanceEditModal').style.display = 'block';
    document.getElementById('deviceId').value = node.properties.deviceId || '';
    document.getElementById('ipAddress').value = node.properties.ipAddress || '';
    document.getElementById('ipAddress').disabled = !node.properties.ipCapable;
}

function closeInstanceEdit() {
    document.getElementById('instanceEditModal').style.display = 'none';
}

function saveInstanceEdit() {
    instanceNode.properties.deviceId = document.getElementById('deviceId').value;
    if (instanceNode.properties.ipCapable) {
        instanceNode.properties.ipAddress = document.getElementById('ipAddress').value;
    }
    closeInstanceEdit();
}

// Generate Report
function generateReport() {
    var data = graph.serialize();
    var reportDiv = document.getElementById('report');
    reportDiv.innerHTML = '';
    reportDiv.style.display = 'block';

    // Inventory Summary
    const inventory = {};
    data.nodes.forEach(node => {
        const key = `${node.properties.equipmentType} - ${node.properties.manufacturer} ${node.properties.model}`;
        if (!inventory[key]) {
            inventory[key] = 0;
        }
        inventory[key]++;
    });
    var inventoryHtml = '<h2>Inventory List</h2><table border="1"><tr><th>Type</th><th>Manufacturer</th><th>Model</th><th>Count</th></tr>';
    Object.keys(inventory).forEach(key => {
        const [type, manuModel] = key.split(' - ');
        const [manu, model] = manuModel.split(' ');
        inventoryHtml += `<tr>
            <td>${type}</td>
            <td>${manu}</td>
            <td>${model}</td>
            <td>${inventory[key]}</td>
        </tr>`;
    });
    inventoryHtml += '</table>';

    // Connection Tables
    var connectionsHtml = '<h2>Input/Output Connections</h2><table border="1"><tr><th>From Equipment</th><th>Output Port</th><th>To Equipment</th><th>Input Port</th></tr>';
    data.links.forEach(link => {
        var [, fromId, fromSlot, toId, toSlot] = link;
        var fromNode = data.nodes.find(n => n.id === fromId);
        var toNode = data.nodes.find(n => n.id === toId);
        var fromLabel = `${fromNode.properties.manufacturer} - ${fromNode.properties.model} - ID ${fromId}`;
        var toLabel = `${toNode.properties.manufacturer} - ${toNode.properties.model} - ID ${toId}`;
        var outputName = fromNode.outputs[fromSlot].name;
        var inputName = toNode.inputs[toSlot].name;
        connectionsHtml += `<tr>
            <td>${fromLabel}</td>
            <td>${outputName}</td>
            <td>${toLabel}</td>
            <td>${inputName}</td>
        </tr>`;
    });
    connectionsHtml += '</table>';

    reportDiv.innerHTML = inventoryHtml + connectionsHtml;
}