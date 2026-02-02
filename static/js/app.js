// Client-side JavaScript logic for the Video Flow Line Diagram Editor.
// This handles the node editor, wizard, and report generation using LiteGraph.

// Global variables
let videoStandards = [];
let graph;
let editingType = null;  // Currently edited node type key
let instanceNode = null;  // Currently edited instance node

// Wait for DOM to load before initializing
document.addEventListener('DOMContentLoaded', async function() {
    // Fetch video standards from DB
    const standardsRes = await fetch('/api/connection_types');
    videoStandards = await standardsRes.json();

    // Fetch and register persisted node types from DB
    const nodeTypesRes = await fetch('/api/node_types');
    const persistedNodes = await nodeTypesRes.json();
    persistedNodes.forEach(({ key, spec }) => {
        try {
            const nodeSpec = JSON.parse(spec);
            function CustomEquipment() {
                nodeSpec.inputs.forEach(([n, t]) => this.addInput(n, t));
                nodeSpec.outputs.forEach(([n, t]) => this.addOutput(n, t));
                this.properties = nodeSpec.properties;
            }
            CustomEquipment.title = nodeSpec.title;
            CustomEquipment.prototype.onDrawBackground = function(ctx) {
                // Optional: Custom rendering
            };
            LiteGraph.registerNodeType(key, CustomEquipment);
        } catch (e) {
            console.error(`Failed to register node type ${key}:`, e);
        }
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
    // Scale contexts
    canvas.ctx.scale(dpr, dpr);
    canvas.bgctx.scale(dpr, dpr);
    // Set bgcanvas size
    canvas.bgcanvas.width = canvasEl.width;
    canvas.bgcanvas.height = canvasEl.height;
    graph.start();

    // Override connect to check compatibility
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

    // Override drawing to color ports
    const originalDrawNode = LGraphCanvas.prototype.drawNode;
    LGraphCanvas.prototype.drawNode = function(node, ctx) {
        originalDrawNode.apply(this, arguments);
        // Color inputs/outputs based on standard
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
        originalDrawLink.apply(this, arguments);
        ctx.strokeStyle = LiteGraph.LINK_COLOR; // reset
    };

    // Event listeners for buttons
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

    // Canvas right-click menu
    canvas.canvas.addEventListener('contextmenu', function(e) {
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
                            callback: () => showNodeCreator(canvasX, canvasY, false)
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

    // Node right-click for instance edit
    canvas.onShowNodePanel = function (node, e) {
        openInstanceEdit(node);
    };

    // Sidebar right-click for type edit
    document.getElementById('nodeList').addEventListener('contextmenu', (e) => {
        if (e.target.tagName === 'LI') {
            editingType = e.target.dataset.type;
            showNodeCreator(null, null, true); // edit mode
            e.preventDefault();
        }
    });

    // Initial sidebar
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

// Build "Recently added" submenu
function buildRecentlyAddedMenu(x, y) {
    const recent = [];
    const keys = Object.keys(LiteGraph.registered_node_types)
        .filter(k => k.startsWith('equipment/'))
        .slice(-10)
        .reverse();

    keys.forEach(key => {
        const nodeClass = LiteGraph.registered_node_types[key];
        recent.push({
            title: nodeClass.title,
            callback: () => addNodeInstance(key, x, y)
        });
    });

    return { options: recent.length ? recent : [{ title: "(No recent nodes)", disabled: true }] };
}

// Update sidebar (grouped by equipment type)
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
        li.addEventListener('dragstart', (e) => e.dataTransfer.setData('node-type', key));
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

// Show floating node creator panel
function showNodeCreator(x = 300, y = 300, isEdit = false) {
    if (currentCreatorPanel) {
        currentCreatorPanel.remove();
    }

    currentCreatorPanel = document.createElement('div');
    currentCreatorPanel.style.position = 'absolute';
    currentCreatorPanel.style.left = `${x}px`;
    currentCreatorPanel.style.top = `${y}px`;
    currentCreatorPanel.style.background = '#222';
    currentCreatorPanel.style.color = 'white';
    currentCreatorPanel.style.padding = '15px';
    currentCreatorPanel.style.border = '1px solid #555';
    currentCreatorPanel.style.zIndex = '1000';
    currentCreatorPanel.style.minWidth = '380px';
    currentCreatorPanel.style.boxShadow = '0 0 20px rgba(0,0,0,0.7)';
    currentCreatorPanel.innerHTML = `
        <h3>${isEdit ? 'Edit Node Type' : 'Create New Node Type'}</h3>
        <label>Device Type:</label><br>
        <select id="nc-device-type" style="width:100%; margin:5px 0;">
            <option value="new">Add new device type...</option>
            <option value="Hi Res Switcher">Hi Res Switcher</option>
            <option value="Video Switcher">Video Switcher</option>
            <option value="Convertor">Convertor</option>
        </select>
        <input id="nc-device-new" type="text" placeholder="New device type name" style="width:100%; margin:5px 0; display:none;"><br><br>

        <label>Manufacturer:</label><br>
        <select id="nc-manu" style="width:100%; margin:5px 0;">
            <option value="new">Add new manufacturer...</option>
            <option value="Barco">Barco</option>
            <option value="BlackMagic">BlackMagic</option>
            <option value="Decimator">Decimator</option>
        </select>
        <input id="nc-manu-new" type="text" placeholder="New manufacturer name" style="width:100%; margin:5px 0; display:none;"><br><br>

        <label>Model:</label><br>
        <input id="nc-title" type="text" placeholder="e.g. ATEM Constellation 8K" style="width:100%; margin:5px 0;"><br><br>

        <label>IP Capable:</label>
        <input id="nc-ipcapable" type="checkbox" style="margin-left:10px;"><br><br>

        <h4>Inputs</h4>
        <div id="nc-inputs"></div>
        <button onclick="addPortToCreator('input')">+ Add Input</button><br><br>

        <h4>Outputs</h4>
        <div id="nc-outputs"></div>
        <button onclick="addPortToCreator('output')">+ Add Output</button><br><br>

        <button onclick="saveNodeCreator()" style="padding:8px 16px; background:#4CAF50; border:none; color:white; cursor:pointer;">Save Node Type</button>
        <button onclick="closeNodeCreator()" style="padding:8px 16px; margin-left:10px; background:#f44336; border:none; color:white; cursor:pointer;">Cancel</button>
    `;

    document.body.appendChild(currentCreatorPanel);

    // Device type listener
    document.getElementById('nc-device-type').addEventListener('change', e => {
        document.getElementById('nc-device-new').style.display = e.target.value === 'new' ? 'block' : 'none';
    });

    // Manufacturer listener
    document.getElementById('nc-manu').addEventListener('change', e => {
        document.getElementById('nc-manu-new').style.display = e.target.value === 'new' ? 'block' : 'none';
    });

    // Pre-fill if editing
    if (isEdit && editingType) {
        const cls = LiteGraph.registered_node_types[editingType];
        if (cls && cls.properties) {
            document.getElementById('nc-title').value = cls.properties.model || '';
            document.getElementById('nc-device-type').value = cls.properties.equipmentType || '';
            document.getElementById('nc-manu').value = cls.properties.manufacturer || '';
            document.getElementById('nc-ipcapable').checked = !!cls.properties.ipCapable;

            (cls.prototype.inputs || []).forEach(([n, t]) => addPortRow('nc-inputs', n.split(' ')[0], t));
            (cls.prototype.outputs || []).forEach(([n, t]) => addPortRow('nc-outputs', n.split(' ')[0], t));
        }
    }
}

// Close creator panel
function closeNodeCreator() {
    if (currentCreatorPanel) {
        currentCreatorPanel.remove();
        currentCreatorPanel = null;
    }
    editingType = null;
}

// Add port row to creator panel
function addPortRow(containerId, name = '', std = '') {
    const container = document.getElementById(containerId);
    const row = document.createElement('div');
    row.style.margin = '6px 0';
    row.innerHTML = `
        <input type="text" value="${name}" placeholder="Port name (e.g. SDI In 1)" style="width:45%;">
        <select style="width:45%;">
            <option value="">Select type</option>
            ${videoStandards.map(s => `<option value="${s.name}" ${s.name === std ? 'selected' : ''}>${s.name}</option>`).join('')}
        </select>
        <button onclick="this.parentElement.remove()" style="margin-left:5px;">×</button>
    `;
    container.appendChild(row);
}

// Add new port button handler
function addPortToCreator(portType) {
    const containerId = portType === 'input' ? 'nc-inputs' : 'nc-outputs';
    addPortRow(containerId);
}

// Save node creator
async function saveNodeCreator() {
    if (!currentCreatorPanel) {
        alert("Editor panel not open.");
        return;
    }

    const titleEl = document.getElementById('nc-title');
    const categoryEl = document.getElementById('nc-device-type');
    const manuEl = document.getElementById('nc-manu');
    const manuNewEl = document.getElementById('nc-manu-new');
    const ipEl = document.getElementById('nc-ipcapable');

    let category = categoryEl.value;
    if (category === 'new') {
        category = document.getElementById('nc-device-new').value.trim();
    }

    let manufacturer = manuEl.value;
    if (manufacturer === 'new') {
        manufacturer = manuNewEl.value.trim();
    }

    const title = titleEl.value.trim();
    const ipCapable = ipEl.checked;

    if (!title || !category || !manufacturer) {
        alert("Title, Device Type, and Manufacturer are required.");
        return;
    }

    const name = `${category} - ${manufacturer} ${title}`;
    const key = `equipment/${name.replace(/\s+/g, '_')}`;

    // Collect inputs
    const inputs = [];
    document.querySelectorAll('#nc-inputs > div').forEach(row => {
        const portNameInput = row.querySelector('input');
        const portTypeSelect = row.querySelector('select');
        const portName = portNameInput.value.trim();
        const portType = portTypeSelect.value;
        if (portName && portType) inputs.push([`${portName} ${portType}`, portType]);
    });

    // Collect outputs
    const outputs = [];
    document.querySelectorAll('#nc-outputs > div').forEach(row => {
        const portNameInput = row.querySelector('input');
        const portTypeSelect = row.querySelector('select');
        const portName = portNameInput.value.trim();
        const portType = portTypeSelect.value;
        if (portName && portType) outputs.push([`${portName} ${portType}`, portType]);
    });

    // Define node class
    function CustomEquipment() {
        inputs.forEach(([n, t]) => this.addInput(n, t));
        outputs.forEach(([n, t]) => this.addOutput(n, t));
        this.properties = {
            equipmentType: category,
            manufacturer,
            model: title,
            ipCapable,
            deviceId: '',
            ipAddress: ''
        };
    }
    CustomEquipment.title = name;
    CustomEquipment.prototype.onDrawBackground = function(ctx) { /* optional */ };

    // If editing, unregister old
    if (editingType && LiteGraph.registered_node_types[editingType]) {
        LiteGraph.unregisterNodeType(editingType);
    }

    LiteGraph.registerNodeType(key, CustomEquipment);

    // Save to DB
    const specObj = {
        title: name,
        inputs,
        outputs,
        properties: {
            equipmentType: category,
            manufacturer,
            model: title,
            ipCapable
        }
    };

    try {
        const res = await fetch('/api/add_node_type', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `key=${encodeURIComponent(key)}&spec=${encodeURIComponent(JSON.stringify(specObj))}`
        });

        if (!res.ok) {
            throw new Error(`Server error: ${res.status}`);
        }

        updateSidebar();
        closeNodeCreator();
        alert(`Node type "${name}" ${editingType ? 'updated' : 'created'} successfully!`);
    } catch (e) {
        console.error('Save failed:', e);
        alert('Failed to save node type: ' + e.message);
    }
}

// Add instance with count
function addNodeInstance(key, x, y) {
    const node = LiteGraph.createNode(key);
    if (!node) return;

    const base = node.title.replace(/\ \d+$/, '');
    const same = graph._nodes.filter(n => n.title.startsWith(base));
    const count = same.length + 1;
    node.title = base + ' ' + count;
    node.pos = [x, y];
    graph.add(node);
}

// Open instance edit
function openInstanceEdit(node) {
    instanceNode = node;
    document.getElementById('instanceEditModal').style.display = 'block';
    document.getElementById('deviceId').value = node.properties.deviceId || '';
    const ipField = document.getElementById('ipAddress');
    ipField.value = node.properties.ipAddress || '';
    ipField.disabled = !node.properties.ipCapable;
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

// Generate Report
function generateReport() {
    const data = graph.serialize();
    const reportDiv = document.getElementById('report');
    reportDiv.innerHTML = '';
    reportDiv.style.display = 'block';

    const inventory = {};
    data.nodes.forEach(node => {
        const key = `${node.properties.equipmentType} - ${node.properties.manufacturer} ${node.properties.model}`;
        inventory[key] = (inventory[key] || 0) + 1;
    });

    let inventoryHtml = '<h2>Inventory List</h2><table border="1"><tr><th>Type</th><th>Manufacturer</th><th>Model</th><th>Count</th></tr>';
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

    let connectionsHtml = '<h2>Input/Output Connections</h2><table border="1"><tr><th>From Equipment (ID)</th><th>Output Port</th><th>To Equipment (ID)</th><th>Input Port</th></tr>';
    data.links.forEach(link => {
        const [, fromId, fromSlot, toId, toSlot] = link;
        const fromNode = data.nodes.find(n => n.id === fromId);
        const toNode = data.nodes.find(n => n.id === toId);
        const outputName = fromNode.outputs[fromSlot].name;
        const inputName = toNode.inputs[toSlot].name;
        connectionsHtml += `<tr>
            <td>${fromId} (${fromNode.title})</td>
            <td>${outputName}</td>
            <td>${toId} (${toNode.title})</td>
            <td>${inputName}</td>
        </tr>`;
    });
    connectionsHtml += '</table>';

    reportDiv.innerHTML = inventoryHtml + connectionsHtml;
}