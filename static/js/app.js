// static/js/app.js
// Client-side logic for the Video Flow Line Diagram Editor using LiteGraph.js

// Global variables
let videoStandards = [];          // Connection types from DB
let graph;                        // The LGraph instance
let canvas;                       // The LGraphCanvas instance
let editingType = null;           // Currently edited node type key
let instanceNode = null;          // Currently edited instance node

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', async function () {
    // Fetch connection types (video standards) from database
    const res = await fetch('/api/connection_types');
    videoStandards = await res.json();

    // Setup LiteGraph
    const canvasEl = document.getElementById('mycanvas');
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = window.innerWidth - 200;   // Leave space for sidebar
    const cssHeight = window.innerHeight * 0.8;

    canvasEl.width = cssWidth * dpr;
    canvasEl.height = cssHeight * dpr;
    canvasEl.style.width = cssWidth + 'px';
    canvasEl.style.height = cssHeight + 'px';

    graph = new LGraph();
    graph.config = { links_ontop: true };
    canvas = new LGraphCanvas("#mycanvas", graph);

    // Apply DPI scaling
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
            const inStd  = videoStandards.find(s => s.name === input.type);
            if (outStd && inStd && outStd.group !== inStd.group) {
                alert(`Incompatible connection: ${output.type} → ${input.type}`);
                return false;
            }
        }
        return originalConnect.apply(this, arguments);
    };

    // Custom drawing: color ports and port labels
    const originalDrawNode = LGraphCanvas.prototype.drawNode;
    LGraphCanvas.prototype.drawNode = function (node, ctx) {
        originalDrawNode.apply(this, arguments);

        // Color input ports + labels
        if (node.inputs) {
            node.inputs.forEach((input, i) => {
                if (input.pos && input.pos.length >= 2) {
                    const std = videoStandards.find(s => s.name === input.type);
                    if (std) {
                        // Port circle
                        ctx.fillStyle = std.color;
                        ctx.beginPath();
                        ctx.arc(input.pos[0], input.pos[1], 6, 0, 2 * Math.PI);
                        ctx.fill();

                        // Port label
                        ctx.fillStyle = std.color;
                        ctx.font = "11px Arial";
                        ctx.textAlign = "left";
                        ctx.fillText(input.type, input.pos[0] + 10, input.pos[1] + 4);
                    }
                }
            });
        }

        // Color output ports + labels
        if (node.outputs) {
            node.outputs.forEach((output, i) => {
                if (output.pos && output.pos.length >= 2) {
                    const std = videoStandards.find(s => s.name === output.type);
                    if (std) {
                        // Port circle
                        ctx.fillStyle = std.color;
                        ctx.beginPath();
                        ctx.arc(output.pos[0], output.pos[1], 6, 0, 2 * Math.PI);
                        ctx.fill();

                        // Port label
                        ctx.fillStyle = std.color;
                        ctx.font = "11px Arial";
                        ctx.textAlign = "right";
                        ctx.fillText(output.type, output.pos[0] - 10, output.pos[1] + 4);
                    }
                }
            });
        }
    };

    // Custom link color (matches source port)
    const originalDrawLink = LGraphCanvas.prototype.drawLink;
    LGraphCanvas.prototype.drawLink = function (link, ctx) {
        const output = link.origin_node.outputs[link.origin_slot];
        if (output) {
            const std = videoStandards.find(s => s.name === output.type);
            if (std) {
                ctx.strokeStyle = std.color;
                ctx.lineWidth = 2.5;
            }
        }
        originalDrawLink.apply(this, arguments);
        ctx.strokeStyle = LiteGraph.LINK_COLOR; // reset
        ctx.lineWidth = 1;
    };

    // Button listeners
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

    // Right-click on canvas → create new node
    canvas.showMenu = function (e) {
        const menu = new LiteGraph.ContextMenu([
            { title: "Create New Node", callback: () => openWizard('create') }
        ], { event: e });
    };
});

// Refresh sidebar (grouped by equipment type)
function updateSidebar() {
    const nodeList = document.getElementById('nodeList');
    nodeList.innerHTML = '';

    const groups = {};

    Object.keys(LiteGraph.registered_node_types).forEach(typeKey => {
        if (typeKey.startsWith('equipment/')) {
            const nodeClass = LiteGraph.registered_node_types[typeKey];
            const eqType = nodeClass.properties?.equipmentType || 'Uncategorized';
            if (!groups[eqType]) groups[eqType] = [];

            const li = document.createElement('li');
            li.textContent = nodeClass.title;
            li.draggable = true;
            li.dataset.type = typeKey;
            li.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('node-type', typeKey);
            });
            li.addEventListener('contextmenu', (e) => {
                editingType = typeKey;
                openWizard('edit', typeKey);
                e.preventDefault();
            });

            groups[eqType].push(li);
        }
    });

    // Render grouped
    Object.keys(groups).sort().forEach(groupName => {
        const header = document.createElement('strong');
        header.textContent = groupName;
        header.style.display = 'block';
        header.style.margin = '12px 0 6px 12px';
        nodeList.appendChild(header);

        groups[groupName].forEach(li => nodeList.appendChild(li));
    });
}

// Open wizard (create or edit mode)
async function openWizard(mode, typeKey = null) {
    editingType = typeKey;
    document.getElementById('wizardModal').style.display = 'block';

    // Reset form
    document.getElementById('inputsList').innerHTML = '';
    document.getElementById('outputsList').innerHTML = '';
    document.getElementById('nodeForm').reset();

    if (mode === 'edit' && typeKey) {
        const nodeClass = LiteGraph.registered_node_types[typeKey];
        if (nodeClass && nodeClass.properties) {
            document.getElementById('equipmentType').value = nodeClass.properties.equipmentType || '';
            document.getElementById('manufacturer').value   = nodeClass.properties.manufacturer   || '';
            document.getElementById('model').value          = nodeClass.properties.model          || '';
            document.getElementById('ipCapable').checked    = !!nodeClass.properties.ipCapable;

            // Pre-fill ports
            if (nodeClass.prototype.inputs) {
                nodeClass.prototype.inputs.forEach(([name, type]) => {
                    const [portName] = name.split(' ');
                    addDynamicField('inputs', portName, type);
                });
            }
            if (nodeClass.prototype.outputs) {
                nodeClass.prototype.outputs.forEach(([name, type]) => {
                    const [portName] = name.split(' ');
                    addDynamicField('outputs', portName, type);
                });
            }
        }
    }
}

function closeWizard() {
    document.getElementById('wizardModal').style.display = 'none';
    editingType = null;
}

// Helper: add port row
function addDynamicField(type, name = '', std = '') {
    const list = document.getElementById(type + 'List');
    const item = document.createElement('div');
    item.className = 'dynamic-item';
    item.innerHTML = `
        <input type="text" class="portName" placeholder="Port Name (e.g. Input 1)" value="${name}" required>
        <select class="portType" required>
            <option value="">Select standard</option>
            ${videoStandards.map(s => `<option value="${s.name}" ${s.name === std ? 'selected' : ''}>${s.name}</option>`).join('')}
        </select>
    `;
    list.appendChild(item);
}

// Create or update node type
async function createOrEditNodeType() {
    const equipmentType = document.getElementById('equipmentType').value.trim();
    const manufacturer   = document.getElementById('manufacturer').value.trim();
    const model          = document.getElementById('model').value.trim();
    const ipCapable      = document.getElementById('ipCapable').checked;

    if (!equipmentType || !manufacturer || !model) {
        alert("Please fill in Equipment Type, Manufacturer and Model.");
        return;
    }

    const name = `${equipmentType} - ${manufacturer} ${model}`;
    const typeKey = "equipment/" + name.replace(/\s+/g, '_');

    // Collect ports
    const inputs = [];
    document.querySelectorAll('#inputsList .dynamic-item').forEach((item, i) => {
        const portName = item.querySelector('.portName').value.trim() || `Input ${i+1}`;
        const portType = item.querySelector('.portType').value;
        if (portName && portType) inputs.push([`${portName} ${portType}`, portType]);
    });

    const outputs = [];
    document.querySelectorAll('#outputsList .dynamic-item').forEach((item, i) => {
        const portName = item.querySelector('.portName').value.trim() || `Output ${i+1}`;
        const portType = item.querySelector('.portType').value;
        if (portName && portType) outputs.push([`${portName} ${portType}`, portType]);
    });

    // If editing, remove old type first (only if it exists)
    if (editingType && LiteGraph.registered_node_types[editingType]) {
        LiteGraph.unregisterNodeType(editingType);
    }

    // Define node class
    function CustomEquipment() {
        inputs.forEach(([n, t]) => this.addInput(n, t));
        outputs.forEach(([n, t]) => this.addOutput(n, t));
        this.properties = {
            equipmentType,
            manufacturer,
            model,
            ipCapable,
            deviceId:   '',
            ipAddress:  ''
        };
    }

    CustomEquipment.title = name;
    CustomEquipment.prototype.onDrawBackground = function (ctx) { /* optional */ };

    LiteGraph.registerNodeType(typeKey, CustomEquipment);

    // Save manufacturer to DB (so it can be reused later)
    if (manufacturer) {
        fetch('/api/add_manufacturer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `name=${encodeURIComponent(manufacturer)}&type=${encodeURIComponent(equipmentType)}`
        }).catch(err => console.warn("Could not save manufacturer:", err));
    }

    updateSidebar();
    closeWizard();

    alert((editingType ? 'Updated' : 'Created') + ' node type: ' + name);
}

// Create instance from sidebar drag
function addNodeInstance(typeKey, x, y) {
    const node = LiteGraph.createNode(typeKey);
    if (!node) return;

    // Instance counting
    const baseTitle = node.title.replace(/\s+\d+$/, '');
    const existing = graph._nodes.filter(n => n.title.startsWith(baseTitle));
    const count = existing.length + 1;
    node.title = baseTitle + (count > 1 ? ' ' + count : '');

    node.pos = [x, y];
    graph.add(node);
}

// Open instance properties editor
function openInstanceEdit(node) {
    instanceNode = node;
    document.getElementById('instanceEditModal').style.display = 'block';
    document.getElementById('deviceId').value = node.properties.deviceId || '';
    const ipInput = document.getElementById('ipAddress');
    ipInput.value = node.properties.ipAddress || '';
    ipInput.disabled = !node.properties.ipCapable;
}

function closeInstanceEdit() {
    document.getElementById('instanceEditModal').style.display = 'none';
    instanceNode = null;
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

// Generate summarized inventory report
function generateReport() {
    const data = graph.serialize();
    const reportDiv = document.getElementById('report');
    reportDiv.innerHTML = '';
    reportDiv.style.display = 'block';

    // Summarize inventory
    const summary = {};
    data.nodes.forEach(node => {
        const key = `${node.properties.equipmentType} - ${node.properties.manufacturer} ${node.properties.model}`;
        if (!summary[key]) {
            summary[key] = { count: 0, props: node.properties };
        }
        summary[key].count++;
    });

    let html = '<h2>Inventory Summary</h2><table border="1"><tr><th>Type</th><th>Manufacturer</th><th>Model</th><th>Count</th></tr>';
    Object.keys(summary).forEach(key => {
        const item = summary[key];
        html += `<tr>
            <td>${item.props.equipmentType}</td>
            <td>${item.props.manufacturer}</td>
            <td>${item.props.model}</td>
            <td>${item.count}</td>
        </tr>`;
    });
    html += '</table>';

    // Connections
    html += '<h2>Connections</h2><table border="1"><tr><th>From (ID)</th><th>Output</th><th>To (ID)</th><th>Input</th></tr>';
    data.links.forEach(link => {
        const [, fromId, fromSlot, toId, toSlot] = link;
        const fromNode = data.nodes.find(n => n.id === fromId);
        const toNode   = data.nodes.find(n => n.id === toId);
        const outName  = fromNode.outputs[fromSlot]?.name || '?';
        const inName   = toNode.inputs[toSlot]?.name   || '?';
        html += `<tr>
            <td>${fromId} (${fromNode.title})</td>
            <td>${outName}</td>
            <td>${toId} (${toNode.title})</td>
            <td>${inName}</td>
        </tr>`;
    });
    html += '</table>';

    reportDiv.innerHTML = html;
}