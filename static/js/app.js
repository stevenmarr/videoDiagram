// Client-side JavaScript logic for the Video Flow Line Diagram Editor.
// This handles the node editor, wizard, and report generation using LiteGraph.

// Global video standards (fetched from API)
let videoStandards = [];

// Global graph for generateReport
let graph;

// Wait for DOM to load before initializing
document.addEventListener('DOMContentLoaded', async function() {
    // Fetch video standards
    const standardsRes = await fetch('/api/video_standards');
    videoStandards = await standardsRes.json();

    // Setup LiteGraph
    var canvasEl = document.getElementById('mycanvas');
    var dpr = window.devicePixelRatio || 1;
    var cssWidth = window.innerWidth;
    var cssHeight = window.innerHeight * 0.8;
    canvasEl.width = cssWidth * dpr;
    canvasEl.height = cssHeight * dpr;
    canvasEl.style.width = cssWidth + 'px';
    canvasEl.style.height = cssHeight + 'px';
    graph = new LGraph();  // Now global
    graph.config = { links_ontop: true };
    var canvas = new LGraphCanvas("#mycanvas", graph);
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

    // Add event listeners for buttons
    document.getElementById('addNodeButton').addEventListener('click', openWizard);
    document.getElementById('generateReportButton').addEventListener('click', generateReport);
});

// Wizard Functions
async function openWizard() {
    document.getElementById('wizardModal').style.display = 'block';
    // Clear previous fields
    document.getElementById('inputsList').innerHTML = '';
    document.getElementById('outputsList').innerHTML = '';
    document.getElementById('nodeForm').reset();
    document.getElementById('customType').style.display = 'none';
    document.getElementById('customManufacturer').style.display = 'none';
    document.getElementById('customModel').style.display = 'none';

    // Populate Equipment Types
    const typesRes = await fetch('/api/equipment_types');
    const types = await typesRes.json();
    const typeSelect = document.getElementById('equipmentType');
    typeSelect.innerHTML = '<option value="">Select Type</option>';
    types.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        typeSelect.appendChild(opt);
    });
    // Add New Type option
    const newTypeOpt = document.createElement('option');
    newTypeOpt.value = 'new';
    newTypeOpt.textContent = 'New Type';
    typeSelect.appendChild(newTypeOpt);

    typeSelect.addEventListener('change', () => {
        document.getElementById('customType').style.display = (typeSelect.value === 'new') ? 'block' : 'none';
        updateManufacturers();
    });
}

function closeWizard() {
    document.getElementById('wizardModal').style.display = 'none';
}

async function updateManufacturers() {
    let type = document.getElementById('equipmentType').value;
    if (type === 'new') {
        type = document.getElementById('customType').value || 'Custom';
    }
    if (!type) return;

    const manuRes = await fetch(`/api/manufacturers/${encodeURIComponent(type)}`);
    const manufacturers = await manuRes.json();
    const manuSelect = document.getElementById('manufacturer');
    manuSelect.innerHTML = '<option value="">Select Manufacturer</option>';
    manufacturers.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        manuSelect.appendChild(opt);
    });
    // Add New Manufacturer option
    const newManuOpt = document.createElement('option');
    newManuOpt.value = 'new';
    newManuOpt.textContent = 'New Manufacturer';
    manuSelect.appendChild(newManuOpt);

    manuSelect.addEventListener('change', () => {
        document.getElementById('customManufacturer').style.display = (manuSelect.value === 'new') ? 'block' : 'none';
        updateModels();
    });
    updateModels();  // Clear models if type changes
}

async function updateModels() {
    let manu = document.getElementById('manufacturer').value;
    if (manu === 'new') {
        manu = document.getElementById('customManufacturer').value || 'Custom';
    }
    if (!manu) return;

    const modelsRes = await fetch(`/api/models/${encodeURIComponent(manu)}`);
    const models = await modelsRes.json();
    const modelSelect = document.getElementById('model');
    modelSelect.innerHTML = '<option value="">Select Model</option>';
    models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        modelSelect.appendChild(opt);
    });
    // Add New Model option
    const newModelOpt = document.createElement('option');
    newModelOpt.value = 'new';
    newModelOpt.textContent = 'New Model';
    modelSelect.appendChild(newModelOpt);

    modelSelect.addEventListener('change', () => {
        document.getElementById('customModel').style.display = (modelSelect.value === 'new') ? 'block' : 'none';
    });
}

function addDynamicField(type) {
    var list = document.getElementById(type + 'List');
    var item = document.createElement('div');
    item.className = 'dynamic-item';
    item.innerHTML = `
        <input type="text" placeholder="Port Name (e.g., Input 1)" class="portName" required>
        <select class="portType" required>
            <option value="">Select Video Standard</option>
            ${videoStandards.map(s => `<option value="${s.name}">${s.name}</option>`).join('')}
        </select>
    `;
    list.appendChild(item);
}

async function createNodeType() {
    let equipmentType = document.getElementById('equipmentType').value;
    let isNewType = equipmentType === 'new';
    if (isNewType) {
        equipmentType = document.getElementById('customType').value;
        await fetch('/api/add_type', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `name=${encodeURIComponent(equipmentType)}`
        });
    }

    let manufacturer = document.getElementById('manufacturer').value;
    let isNewManu = manufacturer === 'new';
    if (isNewManu) {
        manufacturer = document.getElementById('customManufacturer').value;
        await fetch('/api/add_manufacturer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `name=${encodeURIComponent(manufacturer)}&type=${encodeURIComponent(equipmentType)}`
        });
    }

    let model = document.getElementById('model').value;
    let isNewModel = model === 'new';
    if (isNewModel) {
        model = document.getElementById('customModel').value;
        await fetch('/api/add_model', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `name=${encodeURIComponent(model)}&manufacturer=${encodeURIComponent(manufacturer)}`
        });
    }

    var name = `${equipmentType} - ${manufacturer} ${model}`;

    // Collect inputs
    var inputs = [];
    var inputItems = document.querySelectorAll('#inputsList .dynamic-item');
    inputItems.forEach((item, index) => {
        var portName = item.querySelector('.portName').value || `Input ${index + 1}`;
        var portType = item.querySelector('.portType').value;
        if (portName && portType) {
            inputs.push([`${portName} ${portType}`, portType]);
        }
    });

    // Collect outputs
    var outputs = [];
    var outputItems = document.querySelectorAll('#outputsList .dynamic-item');
    outputItems.forEach((item, index) => {
        var portName = item.querySelector('.portName').value || `Output ${index + 1}`;
        var portType = item.querySelector('.portType').value;
        if (portName && portType) {
            outputs.push([`${portName} ${portType}`, portType]);
        }
    });

    // Define custom node
    function CustomEquipment() {
        inputs.forEach(([n, t]) => this.addInput(n, t));
        outputs.forEach(([n, t]) => this.addOutput(n, t));
        this.properties = { equipmentType, manufacturer, model };
    }
    CustomEquipment.title = name;
    CustomEquipment.prototype.onDrawBackground = function(ctx) {
        // Optional: Custom rendering
    };

    LiteGraph.registerNodeType("equipment/" + name.replace(/\s/g, '_'), CustomEquipment);
    closeWizard();
    alert('New equipment type "' + name + '" created! Search for it in the editor to add instances.');
}

// Generate Report
function generateReport() {
    var data = graph.serialize();
    var reportDiv = document.getElementById('report');
    reportDiv.innerHTML = '';
    reportDiv.style.display = 'block';
    // Inventory Table
    var inventoryHtml = '<h2>Inventory List</h2><table border="1"><tr><th>ID</th><th>Type</th><th>Manufacturer</th><th>Model</th></tr>';
    data.nodes.forEach(node => {
        inventoryHtml += `<tr>
            <td>${node.id}</td>
            <td>${node.properties.equipmentType || 'N/A'}</td>
            <td>${node.properties.manufacturer || 'N/A'}</td>
            <td>${node.properties.model || 'N/A'}</td>
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