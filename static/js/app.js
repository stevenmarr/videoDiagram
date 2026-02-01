// Client-side JavaScript logic for the Video Flow Line Diagram Editor.
// This handles the node editor, wizard, and report generation using LiteGraph.

// Wait for DOM to load before initializing
document.addEventListener('DOMContentLoaded', function() {
    // Setup LiteGraph
    var canvasEl = document.getElementById('mycanvas');
    var dpr = window.devicePixelRatio || 1;
    var cssWidth = window.innerWidth;
    var cssHeight = window.innerHeight * 0.8;
    canvasEl.width = cssWidth * dpr;
    canvasEl.height = cssHeight * dpr;
    canvasEl.style.width = cssWidth + 'px';
    canvasEl.style.height = cssHeight + 'px';
    var graph = new LGraph();
    graph.config = { links_ontop: true };
    var canvas = new LGraphCanvas("#mycanvas", graph);
    // Scale contexts
    canvas.ctx.scale(dpr, dpr);
    canvas.bgctx.scale(dpr, dpr);
    // Set bgcanvas size
    canvas.bgcanvas.width = canvasEl.width;
    canvas.bgcanvas.height = canvasEl.height;
    graph.start();
});

// Wizard Functions (these can be outside the event listener as they reference elements on-demand)
function openWizard() {
    document.getElementById('wizardModal').style.display = 'block';
    // Clear previous fields
    document.getElementById('inputsList').innerHTML = '';
    document.getElementById('outputsList').innerHTML = '';
    document.getElementById('nodeForm').reset();
}

function closeWizard() {
    document.getElementById('wizardModal').style.display = 'none';
}

function addDynamicField(type) {
    var list = document.getElementById(type + 'List');
    var item = document.createElement('div');
    item.className = 'dynamic-item';
    item.innerHTML = `
        <input type="text" placeholder="Port Name" class="portName" required>
        <input type="text" placeholder="Type (e.g., video or any)" class="portType" required>
    `;
    list.appendChild(item);
}

function createNodeType() {
    var name = document.getElementById('nodeName').value;
    var make = document.getElementById('make').value;
    var manufacturer = document.getElementById('manufacturer').value;
    var specs = document.getElementById('specs').value;
    // Collect inputs
    var inputs = [];
    var inputItems = document.querySelectorAll('#inputsList .dynamic-item');
    inputItems.forEach(item => {
        var portName = item.querySelector('.portName').value;
        var portType = item.querySelector('.portType').value;
        if (portName && portType) {
            if (portType === 'any') portType = -1;
            inputs.push([portName, portType]);
        }
    });
    // Collect outputs
    var outputs = [];
    var outputItems = document.querySelectorAll('#outputsList .dynamic-item');
    outputItems.forEach(item => {
        var portName = item.querySelector('.portName').value;
        var portType = item.querySelector('.portType').value;
        if (portName && portType) {
            if (portType === 'any') portType = -1;
            outputs.push([portName, portType]);
        }
    });
    // Define custom node
    function CustomEquipment() {
        inputs.forEach(([n, t]) => this.addInput(n, t));
        outputs.forEach(([n, t]) => this.addOutput(n, t));
        this.properties = { make, manufacturer, specs };
    }
    CustomEquipment.title = name;
    CustomEquipment.prototype.onDrawBackground = function(ctx) {
        // Optional: Custom rendering, e.g., show specs
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
    var inventoryHtml = '<h2>Inventory List</h2><table border="1"><tr><th>ID</th><th>Type</th><th>Make</th><th>Manufacturer</th><th>Specifications</th></tr>';
    data.nodes.forEach(node => {
        inventoryHtml += `<tr>
            <td>${node.id}</td>
            <td>${node.title}</td>
            <td>${node.properties.make || 'N/A'}</td>
            <td>${node.properties.manufacturer || 'N/A'}</td>
            <td>${node.properties.specs || 'N/A'}</td>
        </tr>`;
    });
    inventoryHtml += '</table>';
    // Connection Tables
    var connectionsHtml = '<h2>Input/Output Connections</h2><table border="1"><tr><th>From Equipment (ID)</th><th>Output Port</th><th>To Equipment (ID)</th><th>Input Port</th></tr>';
    data.links.forEach(link => {
        var [, fromId, fromSlot, toId, toSlot] = link;
        var fromNode = data.nodes.find(n => n.id === fromId);
        var toNode = data.nodes.find(n => n.id === toId);
        var outputName = fromNode.outputs[fromSlot][0];
        var inputName = toNode.inputs[toSlot][0];
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