// Client-side JavaScript logic for the Video Flow Line Diagram Editor.
// This handles the node editor, wizard, and report generation using LiteGraph.

// Global variables
let videoStandards = [];
let graph;
let canvas;
let selectedNode = null;  // For editing
let editingType = null;  // For wizard mode (create or edit)
let instanceNode = null;  // For instance edit

// Registered types for sidebar
const registeredTypes = {};

// Wait for DOM to load before initializing
document.addEventListener('DOMContentLoaded', async function() {
    // Fetch video standards (connection types) from DB
    const standardsRes = await fetch('/api/connection_types');
    videoStandards = await standardsRes.json();

    // Setup LiteGraph
    var canvasEl = document.getElementById('mycanvas');
    var dpr = window.devicePixelRatio || 1;
    var cssWidth = window.innerWidth - 200;  // Adjust for sidebar
    var cssHeight = window.innerHeight * 0.8;
    canvasEl.width = cssWidth * dpr;
    canvasEl.height = cssHeight * dpr;
    canvasEl.style.width = cssWidth + 'px';
    canvasEl.style.height = cssHeight + 'px';
    graph = new LGraph();
    graph.config = { links_ontop: true };
    canvas = new LGraphCanvas("#mycanvas", graph);
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

    // Override drawing to color ports and connections
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

    // Override drawLink for connection colors
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
        ctx.strokeStyle = LiteGraph.LINK_COLOR;  // Reset
    };

    // Add event listeners for buttons
    document.getElementById('createNodeButton').addEventListener('click', () => openWizard('create'));
    document.getElementById('generateReportButton').addEventListener('click', generateReport);

    // Canvas drop for dragging from sidebar
    canvasEl.addEventListener('drop', (e) => {
        e.preventDefault();
        const type = e.dataTransfer.getData('node-type');
        if (type) {
            addNodeInstance(type, e.clientX - 200, e.clientY);  // Adjust for sidebar
        }
    });
    canvasEl.addEventListener('dragover', (e) => e.preventDefault());

    // Override canvas context menu for right-click "Create New Node"
    canvas.showMenu = function(e) {
        const menu = new LiteGraph.ContextMenu([
            {title: "Create New Node", callback: () => openWizard('create')}
        ], {event: e});
    };

    // Override node context menu for instance edit
    canvas.onShowNodePanel = function(node, e) {
        if (node) {
            openInstanceEdit(node);
        }
    };

    // Sidebar right-click for edit
    document.getElementById('nodeList').addEventListener('contextmenu', (e) => {
        if (e.target.tagName === 'LI') {
            editingType = e.target.dataset.type;
            openWizard('edit', editingType);
            e.preventDefault();
        }
    });
});

// Function to update sidebar
function updateSidebar() {
    const nodeList = document.getElementById('nodeList');
    nodeList.innerHTML = '';
    Object.keys(LiteGraph.registered_node_types).forEach(type => {
        if (type.startsWith('equipment/')) {
            const title = LiteGraph.registered_node_types[type].title;
            const li = document.createElement('li');
            li.textContent = title;
            li.draggable = true;
            li.dataset.type = type;
            li.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('node-type', type);
            });
            nodeList.appendChild(li);
        }
    });
}

// Open wizard for create or edit
async function openWizard(mode, type = null) {
    editingType = type;
    document.getElementById('wizardModal').style.display = 'block';
    // Clear previous fields
    document.getElementById('inputsList').innerHTML = '';
    document.getElementById('outputsList').innerHTML = '';
    document.getElementById('nodeForm').reset();

    if (mode === 'edit' && type) {
        const nodeClass = LiteGraph.registered_node_types[type];
        if (nodeClass) {
            document.getElementById('equipmentType').value = nodeClass.properties.equipmentType || '';
            document.getElementById('manufacturer').value = nodeClass.properties.manufacturer || '';
            document.getElementById('model').value = nodeClass.properties.model || '';
            document.getElementById('ipCapable').checked = nodeClass.properties.ipCapable || false;

            // Prefill inputs/outputs
            nodeClass.prototype.inputs.forEach(([n, t]) => {
                const [portName, portType] = n.split(' ');
                addDynamicField('inputs', portName, portType);
            });
            nodeClass.prototype.outputs.forEach(([n, t]) => {
                const [portName, portType] = n.split(' ');
                addDynamicField('outputs', portName, portType);
            });
        }
    }
}

function closeWizard() {
    document.getElementById('wizardModal').style.display = 'none';
}

function addDynamicField(type, name = '', std = '') {
    var list = document.getElementById(type + 'List');
    var item = document.createElement('div');
    item.className = 'dynamic-item';
    item.innerHTML = `
        <input type="text" placeholder="Port Name (e.g., Input 1)" class="portName" value="${name}" required>
        <select class="portType" required>
            <option value="">Select Video Standard</option>
            ${videoStandards.map(s => `<option value="${s.name}" ${s.name === std ? 'selected' : ''}>${s.name}</option>`).join('')}
        </select>
    `;
    list.appendChild(item);
}

async function createOrEditNodeType() {
    const equipmentType = document.getElementById('equipmentType').value.trim();
    const manufacturer   = document.getElementById('manufacturer').value.trim();
    const model          = document.getElementById('model').value.trim();
    const ipCapable      = document.getElementById('ipCapable').checked;

    if (!equipmentType || !manufacturer || !model) {
        alert("Please fill in Equipment Type, Manufacturer, and Model.");
        return;
    }

    const name = `${equipmentType} - ${manufacturer} ${model}`;
    const typeKey = "equipment/" + name.replace(/\s+/g, '_');

    // Collect inputs
    const inputs = [];
    const inputItems = document.querySelectorAll('#inputsList .dynamic-item');
    inputItems.forEach((item, index) => {
        const portName = item.querySelector('.portName').value.trim() || `Input ${index + 1}`;
        const portType = item.querySelector('.portType').value;
        if (portName && portType) {
            inputs.push([`${portName} ${portType}`, portType]);
        }
    });

    // Collect outputs
    const outputs = [];
    const outputItems = document.querySelectorAll('#outputsList .dynamic-item');
    outputItems.forEach((item, index) => {
        const portName = item.querySelector('.portName').value.trim() || `Output ${index + 1}`;
        const portType = item.querySelector('.portType').value;
        if (portName && portType) {
            outputs.push([`${portName} ${portType}`, portType]);
        }
    });

    // If we're editing an existing type → unregister first (but only if it exists)
    if (editingType && LiteGraph.registered_node_types[editingType]) {
        LiteGraph.unregisterNodeType(editingType);
    }

    // Define / override the node type
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
    CustomEquipment.prototype.onDrawBackground = function(ctx) {
        // Optional: custom rendering
    };

    LiteGraph.registerNodeType(typeKey, CustomEquipment);

    // Refresh sidebar
    updateSidebar();

    closeWizard();

    alert((editingType ? 'Edited' : 'Created') + ' node type: ' + name);
}

// Add node instance with count
function addNodeInstance(type, x, y) {
    const node = LiteGraph.createNode(type);
    const baseTitle = node.title.replace(/\ \d+$/, '');  // Remove existing count
    const existing = graph.findNodesByTitle(baseTitle);
    const count = existing.length + 1;
    node.title = baseTitle + ' ' + count;
    node.pos = [x, y];
    graph.add(node);
}

// Open instance edit dialog
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
    if (instanceNode) {
        instanceNode.properties.deviceId = document.getElementById('deviceId').value;
        if (instanceNode.properties.ipCapable) {
            instanceNode.properties.ipAddress = document.getElementById('ipAddress').value;
        }
        closeInstanceEdit();
    }
}

// Generate Report with summary
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
            inventory[key] = { count: 0, details: node.properties };
        }
        inventory[key].count++;
    });
    var inventoryHtml = '<h2>Inventory List</h2><table border="1"><tr><th>Type</th><th>Manufacturer</th><th>Model</th><th>Count</th></tr>';
    Object.keys(inventory).forEach(key => {
        const item = inventory[key];
        inventoryHtml += `<tr>
            <td>${item.details.equipmentType}</td>
            <td>${item.details.manufacturer}</td>
            <td>${item.details.model}</td>
            <td>${item.count}</td>
        </tr>`;
    });
    inventoryHtml += '</table>';

    // Connection Tables
    var connectionsHtml = '<h2>Input/Output Connections</h2><table border="1"><tr><th>From Equipment (ID)</th><th>Output Port</th><th>To Equipment (ID)</th><th>Input Port</th></tr>';
    data.links.forEach(link => {
        var [, fromId, fromSlot, toId, toSlot] = link;
        var fromNode = data.nodes.find(n => n.id === fromId);
        var toNode = data.nodes.find(n => n.id === toId);
        var outputName = fromNode.outputs[fromSlot].name;
        var inputName = toNode.inputs[toSlot].name;
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