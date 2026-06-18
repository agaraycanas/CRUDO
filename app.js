// CRUDO App State
const state = {
    entities: [
        {
            id: '1',
            name: 'Categoria',
            x: 100,
            y: 150,
            attributes: [
                { name: 'id', type: 'Long' },
                { name: 'nombre', type: 'String' }
            ]
        },
        {
            id: '2',
            name: 'Producto',
            x: 500,
            y: 150,
            attributes: [
                { name: 'id', type: 'Long' },
                { name: 'nombre', type: 'String' },
                { name: 'precio', type: 'Double' }
            ]
        },
        {
            id: '3',
            name: 'Cliente',
            x: 300,
            y: 450,
            attributes: [
                { name: 'id', type: 'Long' },
                { name: 'nombre', type: 'String' },
                { name: 'email', type: 'String' }
            ]
        }
    ],
    relations: [
        { id: 'r1', sourceEntityId: '2', targetEntityId: '1', type: 'Na1', sourceRole: 'productos', targetRole: 'categoria' }, // Producto a Categoria
        { id: 'r2', sourceEntityId: '3', targetEntityId: '2', type: 'NaN', sourceRole: 'clientes', targetRole: 'productos' }  // Cliente a Producto
    ],
    dbConfig: {
        appName: 'inventario',
        dbUrl: 'jdbc:postgresql://localhost:5432/inventario_db',
        dbUser: 'postgres',
        dbPass: 'postgres'
    },
    
    // Interaction States
    draggedEntityId: null,
    dragOffset: { x: 0, y: 0 },
    
    connectingSourceId: null,
    tempLineEndX: 0,
    tempLineEndY: 0,
    
    // Click tracking to differentiate click vs drag
    lastMouseDownPos: { x: 0, y: 0 },
    lastMouseDownTime: 0
};

// DOM Elements
const canvas = document.getElementById('interactive-canvas');
const canvasContainer = document.getElementById('canvas-container');
const relationsSvg = document.getElementById('relations-svg');
const statusBar = document.getElementById('status-bar');
const statusText = document.getElementById('status-text');

// Init application on load
window.addEventListener('load', () => {
    renderEntities();
    // Use requestAnimationFrame or setTimeout to let DOM parse card sizes for correct relation line rendering
    setTimeout(() => {
        renderRelations();
    }, 0);
    initGlobalEvents();
    loadDbConfigValues();
});

// Setup global events
function initGlobalEvents() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAllModals();
            abortRelationCreation();
        }
    });

    // Global mouse move and mouse up for dragging nodes and connections
    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
}

function closeAllModals() {
    closeModal('modal-entity-create');
    closeModal('modal-entity-edit');
    closeModal('modal-relation-config');
    closeModal('modal-db-config');
    closeModal('modal-custom-alert');
}

function showAlert(message) {
    document.getElementById('custom-alert-message').innerText = message;
    openModal('modal-custom-alert');
}

function loadDbConfigValues() {
    document.getElementById('config-app-name').value = state.dbConfig.appName;
    document.getElementById('config-db-url').value = state.dbConfig.dbUrl;
    document.getElementById('config-db-user').value = state.dbConfig.dbUser;
    document.getElementById('config-db-pass').value = state.dbConfig.dbPass;
}

// Clear canvas elements with verification
function clearCanvas() {
    if (confirm('¿Estás seguro de que deseas borrar todo el canvas? Se eliminarán todas las entidades y relaciones actuales.')) {
        state.entities = [];
        state.relations = [];
        renderEntities();
        renderRelations();
    }
}

// Render entities on Canvas
function renderEntities() {
    const container = document.getElementById('entities-container');
    container.innerHTML = '';
    
    state.entities.forEach(entity => {
        const div = document.createElement('div');
        div.id = `entity-${entity.id}`;
        div.className = `absolute bg-slate-900 border-2 border-slate-800 rounded-xl shadow-2xl px-4 py-3 cursor-pointer w-48 transition-all z-20 select-none hover:border-indigo-500/60 flex items-center justify-between pointer-events-auto`;
        div.style.left = `${entity.x}px`;
        div.style.top = `${entity.y}px`;

        // Handle mousedown inside entity
        div.addEventListener('mousedown', (e) => {
            e.stopPropagation(); // Prevent canvas trigger
            
            state.lastMouseDownPos = { x: e.clientX, y: e.clientY };
            state.lastMouseDownTime = Date.now();

            const isMoveHandle = e.target.closest('.move-handle');
            if (isMoveHandle) {
                // Drag entity position
                state.draggedEntityId = entity.id;
                state.dragOffset.x = e.clientX - entity.x;
                state.dragOffset.y = e.clientY - entity.y;
                e.preventDefault();
            } else {
                // Drag relationship line
                state.connectingSourceId = entity.id;
                updateTempConnectionLine(e);
                statusBar.classList.remove('hidden');
                statusBar.classList.add('flex');
                statusText.innerText = `Arrastrando relación desde "${entity.name}"...`;
            }
        });

        // Entity Content (Display only name and a move icon)
        div.innerHTML = `
            <span class="font-bold text-white text-base truncate pr-2" title="${entity.name}">${entity.name}</span>
            <span class="move-handle cursor-move px-2 py-1 text-slate-500 hover:text-indigo-400 transition-colors" title="Arrastrar para mover">
                <i class="fa-solid fa-arrows-up-down-left-right text-xs"></i>
            </span>
        `;
        container.appendChild(div);
    });

    renderSidebarEntities();
}

// Render sidebar list
function renderSidebarEntities() {
    const container = document.getElementById('sidebar-entities-list');
    if (state.entities.length === 0) {
        container.innerHTML = `<p class="text-slate-600 italic px-2 py-1">Ninguna entidad creada.</p>`;
        return;
    }

    container.innerHTML = state.entities.map(e => `
        <div onclick="openEntityEditModal('${e.id}')" class="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-800/40 text-slate-300 cursor-pointer transition-all">
            <span class="font-medium truncate"><i class="fa-solid fa-cube text-slate-500 mr-1.5"></i>${e.name}</span>
            <span class="text-[10px] text-slate-500">${e.attributes.length} attrs</span>
        </div>
    `).join('');
}

// Helper to calculate card boundary point facing target
function getBorderPoint(source, target) {
    const el = document.getElementById(`entity-${source.id}`);
    const w = el ? el.offsetWidth / 2 : 96; // half width
    const h = el ? el.offsetHeight / 2 : 22; // half height

    const sX = source.x + w;
    const sY = source.y + h;
    
    // For target, retrieve its dimensions too to find target center
    const targetEl = document.getElementById(`entity-${target.id}`);
    const tW = targetEl ? targetEl.offsetWidth / 2 : 96;
    const tH = targetEl ? targetEl.offsetHeight / 2 : 22;
    const tX = target.x + tW;
    const tY = target.y + tH;
    
    const dx = tX - sX;
    const dy = tY - sY;
    const angle = Math.atan2(dy, dx);
    
    let scale = 0;
    if (Math.abs(dx) * h > Math.abs(dy) * w) {
        scale = w / Math.abs(Math.cos(angle));
    } else {
        scale = h / Math.abs(Math.sin(angle));
    }
    
    return {
        x: sX + Math.cos(angle) * scale,
        y: sY + Math.sin(angle) * scale
    };
}

// Draw connection lines
function renderRelations() {
    relationsSvg.innerHTML = `
        <defs>
            <marker id="diamond-indigo" viewBox="0 0 14 12" refX="13" refY="6" markerWidth="11" markerHeight="9" orient="auto-start-reverse">
                <path d="M 1 6 L 7 2 L 13 6 L 7 10 Z" fill="#020617" stroke="#6366f1" stroke-width="1.5" />
            </marker>
            <marker id="diamond-emerald" viewBox="0 0 14 12" refX="13" refY="6" markerWidth="11" markerHeight="9" orient="auto-start-reverse">
                <path d="M 1 6 L 7 2 L 13 6 L 7 10 Z" fill="#020617" stroke="#10b981" stroke-width="1.5" />
            </marker>
            <marker id="diamond-amber" viewBox="0 0 14 12" refX="13" refY="6" markerWidth="11" markerHeight="9" orient="auto-start-reverse">
                <path d="M 1 6 L 7 2 L 13 6 L 7 10 Z" fill="#020617" stroke="#f59e0b" stroke-width="1.5" />
            </marker>
            <marker id="diamond-rose" viewBox="0 0 14 12" refX="13" refY="6" markerWidth="11" markerHeight="9" orient="auto-start-reverse">
                <path d="M 1 6 L 7 2 L 13 6 L 7 10 Z" fill="#020617" stroke="#f43f5e" stroke-width="1.5" />
            </marker>
            <marker id="diamond-cyan" viewBox="0 0 14 12" refX="13" refY="6" markerWidth="11" markerHeight="9" orient="auto-start-reverse">
                <path d="M 1 6 L 7 2 L 13 6 L 7 10 Z" fill="#020617" stroke="#06b6d4" stroke-width="1.5" />
            </marker>
        </defs>
    `;

    // Palette for distinguishing multiple relationships
    const colorPalette = [
        { stroke: '#6366f1', name: 'indigo' },  // Indigo
        { stroke: '#10b981', name: 'emerald' }, // Emerald
        { stroke: '#f59e0b', name: 'amber' },   // Amber
        { stroke: '#f43f5e', name: 'rose' },    // Rose
        { stroke: '#06b6d4', name: 'cyan' }     // Cyan
    ];
    
    // Render static connections
    state.relations.forEach(rel => {
        const source = state.entities.find(e => e.id === rel.sourceEntityId);
        const target = state.entities.find(e => e.id === rel.targetEntityId);
        
        if (!source || !target) return;

        // Find all relationships between these same two entities to assign distinct colors and curves
        const samePairRels = state.relations.filter(r => 
            (r.sourceEntityId === source.id && r.targetEntityId === target.id) ||
            (r.sourceEntityId === target.id && r.targetEntityId === source.id)
        );
        const relIndex = samePairRels.findIndex(r => r.id === rel.id);
        const totalRels = samePairRels.length;

        // Choose color from palette based on index
        const colorObj = colorPalette[relIndex % colorPalette.length];
        const relationColor = colorObj.stroke;
        const colorName = colorObj.name;

        let pathD = '';
        let labelXStart = 0, labelYStart = 0;
        let labelXEnd = 0, labelYEnd = 0;
        
        let startMarker = false;
        let endMarker = false;

        // "to one" gets diamond marker
        if (rel.type === '1a1') {
            startMarker = true;
            endMarker = true;
        } else if (rel.type === '1aN') {
            startMarker = true;
        } else if (rel.type === 'Na1') {
            endMarker = true;
        }

        if (source.id === target.id) {
            // Reflexive loop starting/ending on the top edge
            const el = document.getElementById(`entity-${source.id}`);
            const w = el ? el.offsetWidth / 2 : 96;
            const h = el ? el.offsetHeight / 2 : 22;
            const sX = source.x + w;
            const sY = source.y + h;
            pathD = `M ${sX - 30} ${sY - h} C ${sX - 60} ${sY - h - 58}, ${sX + 60} ${sY - h - 58}, ${sX + 30} ${sY - h}`;
            labelXStart = sX - 35;
            labelYStart = sY - h - 8;
            labelXEnd = sX + 35;
            labelYEnd = sY - h - 8;
        } else {
            const pStart = getBorderPoint(source, target);
            const pEnd = getBorderPoint(target, source);

            const dx = pEnd.x - pStart.x;
            const dy = pEnd.y - pStart.y;
            const len = Math.hypot(dx, dy);

            // Perpendicular vector for offset (-dy, dx)
            const px = -dy / len;
            const py = dx / len;

            if (totalRels > 1) {
                // Symmetrical offsets: e.g. for 2 rels: -45px, 45px; for 3 rels: -55px, 0px, 55px
                const midIndex = (totalRels - 1) / 2;
                
                // Sort by ID to ensure relationship index order is fully stable
                const sortedRels = [...samePairRels].sort((a, b) => a.id.localeCompare(b.id));
                const sortedIndex = sortedRels.findIndex(r => r.id === rel.id);
                
                // Establish a consistent line direction based on lexicographical sorting of entity IDs.
                // This guarantees px and py point in the exact same direction for all parallel relations,
                // regardless of whether entity A or B is the source.
                const sortedEntityIds = [source.id, target.id].sort();
                const stableSourceId = sortedEntityIds[0];
                
                // If this relation runs in the opposite direction of the stable ID sorting,
                // we invert the perpendicular offset to ensure the curves stack on the same side.
                const invertOffset = (rel.sourceEntityId !== stableSourceId) ? -1 : 1;
                const offsetDistance = (sortedIndex - midIndex) * 45 * invertOffset;

                // Center point of the straight line
                const midX = (pStart.x + pEnd.x) / 2;
                const midY = (pStart.y + pEnd.y) / 2;

                // Control point offset perpendicularly
                const ctrlX = midX + px * offsetDistance;
                const ctrlY = midY + py * offsetDistance;

                // Quadratic bezier curve path
                pathD = `M ${pStart.x} ${pStart.y} Q ${ctrlX} ${ctrlY} ${pEnd.x} ${pEnd.y}`;

                // Calculate label positions along the quadratic curve
                const tStart = 0.22;
                const tEnd = 0.78;

                // Quadratic Bezier formula
                const getBezierPt = (t) => {
                    const mt = 1 - t;
                    return {
                        x: mt * mt * pStart.x + 2 * mt * t * ctrlX + t * t * pEnd.x,
                        y: mt * mt * pStart.y + 2 * mt * t * ctrlY + t * t * pEnd.y
                    };
                };

                const ptStart = getBezierPt(tStart);
                const ptEnd = getBezierPt(tEnd);

                // Add small perpendicular offset to text labels
                const labelSign = offsetDistance >= 0 ? 1 : -1;
                const labelPerp = 10 * labelSign;

                labelXStart = ptStart.x + px * labelPerp;
                labelYStart = ptStart.y + py * labelPerp;

                labelXEnd = ptEnd.x + px * labelPerp;
                labelYEnd = ptEnd.y + py * labelPerp;
            } else {
                // Straight line between card borders
                pathD = `M ${pStart.x} ${pStart.y} L ${pEnd.x} ${pEnd.y}`;

                // Along the line: 36px from the border points to clear markers/corners
                const alongDist = 36;
                const lxStart = pStart.x + (dx / len) * alongDist;
                const lyStart = pStart.y + (dy / len) * alongDist;

                const lxEnd = pEnd.x - (dx / len) * alongDist;
                const lyEnd = pEnd.y - (dy / len) * alongDist;

                const perpOffset = 12;
                const sign = py > 0 ? -1 : 1;

                labelXStart = lxStart + px * perpOffset * sign;
                labelYStart = lyStart + py * perpOffset * sign;

                labelXEnd = lxEnd + px * perpOffset * sign;
                labelYEnd = lyEnd + py * perpOffset * sign;
            }
        }

        // Draw Line Path (Visible line)
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathD);
        path.setAttribute('stroke', relationColor);
        path.setAttribute('stroke-width', '2.5');
        path.setAttribute('fill', 'none');
        path.setAttribute('class', 'transition-all duration-150');
        
        if (startMarker) {
            path.setAttribute('marker-start', `url(#diamond-${colorName})`);
        }
        if (endMarker) {
            path.setAttribute('marker-end', `url(#diamond-${colorName})`);
        }
        relationsSvg.appendChild(path);

        // Draw Thick Invisible Path for easy hover and clicking
        const hoverPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        hoverPath.setAttribute('d', pathD);
        hoverPath.setAttribute('stroke', 'transparent');
        hoverPath.setAttribute('stroke-width', '16');
        hoverPath.setAttribute('fill', 'none');
        hoverPath.setAttribute('class', 'cursor-pointer pointer-events-auto');
        
        hoverPath.addEventListener('mouseenter', () => {
            path.setAttribute('stroke-width', '4.5');
        });
        hoverPath.addEventListener('mouseleave', () => {
            path.setAttribute('stroke-width', '2.5');
        });
        
        hoverPath.addEventListener('click', (e) => {
            e.stopPropagation();
            openRelationModal(rel.id);
        });
        relationsSvg.appendChild(hoverPath);

        // Draw role labels (targetRole near source, sourceRole near target)
        if (rel.targetRole) {
            const textStart = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            textStart.setAttribute('x', labelXStart);
            textStart.setAttribute('y', labelYStart);
            textStart.setAttribute('fill', '#38bdf8'); // Sky-400
            textStart.setAttribute('font-size', '13px');
            textStart.setAttribute('font-family', 'sans-serif');
            textStart.setAttribute('font-weight', '600');
            textStart.setAttribute('text-anchor', 'middle');
            textStart.textContent = rel.targetRole;
            textStart.setAttribute('class', 'cursor-pointer hover:fill-sky-300 transition-colors pointer-events-auto select-none');
            textStart.addEventListener('click', (e) => {
                e.stopPropagation();
                openRelationModal(rel.id);
            });
            relationsSvg.appendChild(textStart);
        }

        if (rel.sourceRole) {
            const textEnd = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            textEnd.setAttribute('x', labelXEnd);
            textEnd.setAttribute('y', labelYEnd);
            textEnd.setAttribute('fill', '#38bdf8'); // Sky-400
            textEnd.setAttribute('font-size', '13px');
            textEnd.setAttribute('font-family', 'sans-serif');
            textEnd.setAttribute('font-weight', '600');
            textEnd.setAttribute('text-anchor', 'middle');
            textEnd.textContent = rel.sourceRole;
            textEnd.setAttribute('class', 'cursor-pointer hover:fill-sky-300 transition-colors pointer-events-auto select-none');
            textEnd.addEventListener('click', (e) => {
                e.stopPropagation();
                openRelationModal(rel.id);
            });
            relationsSvg.appendChild(textEnd);
        }
    });

    // Render temporary line if creating connection
    if (state.connectingSourceId) {
        const source = state.entities.find(e => e.id === state.connectingSourceId);
        if (source) {
            const el = document.getElementById(`entity-${source.id}`);
            const w = el ? el.offsetWidth / 2 : 96;
            const h = el ? el.offsetHeight / 2 : 22;
            const sX = source.x + w;
            const sY = source.y + h;
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            path.setAttribute('x1', sX);
            path.setAttribute('y1', sY);
            path.setAttribute('x2', state.tempLineEndX);
            path.setAttribute('y2', state.tempLineEndY);
            path.setAttribute('stroke', '#a5b4fc'); // Indigo-300
            path.setAttribute('stroke-width', '2');
            path.setAttribute('stroke-dasharray', '5,5');
            relationsSvg.appendChild(path);
        }
    }
}

// Mouse events on canvas empty spots (to differentiate mousedown/mouseup for clicks)
function handleCanvasMouseDown(e) {
    if (e.target.id !== 'interactive-canvas') return;
    state.lastMouseDownPos = { x: e.clientX, y: e.clientY };
    state.lastMouseDownTime = Date.now();
}

function handleCanvasMouseUp(e) {
    if (e.target.id !== 'interactive-canvas') return;
    
    const clickDuration = Date.now() - state.lastMouseDownTime;
    const distance = Math.hypot(e.clientX - state.lastMouseDownPos.x, e.clientY - state.lastMouseDownPos.y);

    // Click trigger: short time and no moving
    if (clickDuration < 300 && distance < 6) {
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        document.getElementById('entity-create-x').value = clickX;
        document.getElementById('entity-create-y').value = clickY;
        document.getElementById('entity-create-name').value = '';
        openModal('modal-entity-create');
        setTimeout(() => document.getElementById('entity-create-name').focus(), 50);
    }
}

// Global move handler
function handleGlobalMouseMove(e) {
    // 1. Dragging entity card
    if (state.draggedEntityId) {
        const entity = state.entities.find(e => e.id === state.draggedEntityId);
        if (entity) {
            entity.x = Math.max(10, Math.min(2800, e.clientX - state.dragOffset.x));
            entity.y = Math.max(10, Math.min(1900, e.clientY - state.dragOffset.y));
            
            const el = document.getElementById(`entity-${entity.id}`);
            if (el) {
                el.style.left = `${entity.x}px`;
                el.style.top = `${entity.y}px`;
            }
            renderRelations();
        }
    }

    // 2. Dragging relationship connection
    if (state.connectingSourceId) {
        updateTempConnectionLine(e);
        renderRelations();
    }
}

function updateTempConnectionLine(e) {
    const rect = canvas.getBoundingClientRect();
    state.tempLineEndX = e.clientX - rect.left;
    state.tempLineEndY = e.clientY - rect.top;
}

// Global mouse release handler
function handleGlobalMouseUp(e) {
    // 1. Finish entity dragging
    if (state.draggedEntityId) {
        state.draggedEntityId = null;
    }

    // 2. Finish relationship dragging
    if (state.connectingSourceId) {
        const sourceId = state.connectingSourceId;
        state.connectingSourceId = null;
        statusBar.classList.add('hidden');

        // Check if mouse was released over an entity card
        const hoverElement = document.elementFromPoint(e.clientX, e.clientY);
        const targetCard = hoverElement ? hoverElement.closest('[id^="entity-"]') : null;

        if (targetCard) {
            const targetId = targetCard.id.replace('entity-', '');
            const clickDuration = Date.now() - state.lastMouseDownTime;
            const distance = Math.hypot(e.clientX - state.lastMouseDownPos.x, e.clientY - state.lastMouseDownPos.y);

            if (targetId === sourceId && distance < 6) {
                // Simple click on entity itself -> show attributes
                openEntityEditModal(sourceId);
            } else {
                // Dragged to another card -> create relation
                openRelationModal(null, sourceId, targetId);
            }
        } else {
            const clickDuration = Date.now() - state.lastMouseDownTime;
            const distance = Math.hypot(e.clientX - state.lastMouseDownPos.x, e.clientY - state.lastMouseDownPos.y);
            
            if (clickDuration < 300 && distance < 6) {
                openEntityEditModal(sourceId);
            }
        }
        renderEntities();
        setTimeout(() => {
            renderRelations();
        }, 0);
    }
}

function abortRelationCreation() {
    state.connectingSourceId = null;
    statusBar.classList.add('hidden');
    renderRelations();
    renderEntities();
}

// Modal actions
function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

// Submit entity creation
function submitEntityCreate(e) {
    e.preventDefault();
    const nameInput = document.getElementById('entity-create-name').value.trim();
    const name = nameInput.charAt(0).toUpperCase() + nameInput.slice(1);

    if (state.entities.some(ent => ent.name.toLowerCase() === name.toLowerCase())) {
        showAlert('Ya existe una entidad con ese nombre.');
        return;
    }

    const newEntity = {
        id: Date.now().toString(),
        name: name,
        x: parseFloat(document.getElementById('entity-create-x').value) - 96,
        y: parseFloat(document.getElementById('entity-create-y').value) - 22,
        attributes: [
            { name: 'id', type: 'Long' }
        ]
    };

    state.entities.push(newEntity);
    closeModal('modal-entity-create');
    renderEntities();
    renderRelations();
}

// VIEW / EDIT ENTITY MODAL
let activeEditEntityId = null;

function openEntityEditModal(entityId) {
    activeEditEntityId = entityId;
    const entity = state.entities.find(e => e.id === entityId);
    if (!entity) return;

    document.getElementById('entity-edit-name').value = entity.name;
    renderEditAttributesList(entity);
    renderEntityModalRelations(entity);
    openModal('modal-entity-edit');
}

function renderEntityModalRelations(entity) {
    const container = document.getElementById('entity-relations-container');
    container.innerHTML = '';

    const associatedRels = state.relations.filter(r => 
        r.sourceEntityId === entity.id || r.targetEntityId === entity.id
    );

    if (associatedRels.length === 0) {
        container.innerHTML = `<p class="text-slate-500 italic text-xs py-1">Esta entidad no tiene relaciones asociadas.</p>`;
        return;
    }

    associatedRels.forEach(rel => {
        const isSource = rel.sourceEntityId === entity.id;
        const otherEntityId = isSource ? rel.targetEntityId : rel.sourceEntityId;
        const otherEntity = state.entities.find(e => e.id === otherEntityId);
        if (!otherEntity) return;

        // Custom proposed/configured attribute names based on roles
        const currentRoleAttr = isSource ? rel.targetRole : rel.sourceRole;
        
        let typeText = '';
        if (rel.type === '1a1') typeText = '1 a 1';
        else if (rel.type === '1aN') typeText = isSource ? '1 a N' : 'N a 1';
        else if (rel.type === 'Na1') typeText = isSource ? 'N a 1' : '1 a N';
        else if (rel.type === 'NaN') typeText = 'N a N';

        const div = document.createElement('div');
        div.className = 'flex items-center justify-between p-2.5 bg-slate-950 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-900/40 rounded-xl cursor-pointer transition-all text-xs text-slate-300';
        div.onclick = () => {
            closeModal('modal-entity-edit');
            openRelationModal(rel.id);
        };

        div.innerHTML = `
            <div class="flex items-center gap-2">
                <span class="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                <span class="font-medium text-slate-200">Relación con <strong class="text-white">${otherEntity.name}</strong></span>
                <span class="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-400 font-semibold">${typeText}</span>
            </div>
            <div class="text-[11px] text-indigo-400">
                Atributo: <code class="font-mono bg-slate-900 px-1 py-0.5 rounded border border-slate-800/80 text-sky-400">${currentRoleAttr || '---'}</code>
            </div>
        `;
        container.appendChild(div);
    });
}

function renderEditAttributesList(entity) {
    const tbody = document.getElementById('attributes-list-body');
    tbody.innerHTML = '';

    entity.attributes.forEach((attr, idx) => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-900/40 text-slate-300';
        
        const isId = attr.name.toLowerCase() === 'id';
        const disabledAttr = isId ? 'disabled class="bg-slate-950/80 text-slate-500 opacity-60 border border-slate-900 rounded px-2 py-1 w-full"' : 'class="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white w-full"';

        tr.innerHTML = `
            <td class="px-4 py-2">
                <input type="text" value="${attr.name}" onchange="updateAttributeName(${idx}, this.value)" ${disabledAttr}>
            </td>
            <td class="px-4 py-2">
                <select onchange="updateAttributeType(${idx}, this.value)" ${isId ? 'disabled' : ''} class="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white">
                    <option value="String" ${attr.type === 'String' ? 'selected' : ''}>String</option>
                    <option value="Long" ${attr.type === 'Long' ? 'selected' : ''}>Long</option>
                    <option value="Integer" ${attr.type === 'Integer' ? 'selected' : ''}>Integer</option>
                    <option value="Double" ${attr.type === 'Double' ? 'selected' : ''}>Double</option>
                    <option value="Boolean" ${attr.type === 'Boolean' ? 'selected' : ''}>Boolean</option>
                    <option value="Date" ${attr.type === 'Date' ? 'selected' : ''}>Date (LocalDate)</option>
                </select>
            </td>
            <td class="px-4 py-2 text-center">
                ${isId ? '' : `
                    <button onclick="removeAttribute(${idx})" class="text-rose-500 hover:text-rose-400 p-1">
                        <i class="fa-solid fa-trash-can text-sm"></i>
                    </button>
                `}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renameEntity() {
    if (!activeEditEntityId) return;
    const input = document.getElementById('entity-edit-name').value.trim();
    if (!input) return;

    const newName = input.charAt(0).toUpperCase() + input.slice(1);
    
    if (state.entities.some(e => e.id !== activeEditEntityId && e.name.toLowerCase() === newName.toLowerCase())) {
        showAlert('Ya existe otra entidad con ese nombre.');
        return;
    }

    const entity = state.entities.find(e => e.id === activeEditEntityId);
    if (entity) {
        entity.name = newName;
        renderEntities();
        renderRelations();
    }
}

function updateAttributeName(index, val) {
    const entity = state.entities.find(e => e.id === activeEditEntityId);
    if (entity && entity.attributes[index]) {
        entity.attributes[index].name = val.trim();
        renderEntities();
    }
}

function updateAttributeType(index, val) {
    const entity = state.entities.find(e => e.id === activeEditEntityId);
    if (entity && entity.attributes[index]) {
        entity.attributes[index].type = val;
        renderEntities();
    }
}

function addNewAttributeRow() {
    const entity = state.entities.find(e => e.id === activeEditEntityId);
    if (!entity) return;

    entity.attributes.push({
        name: `attr_${entity.attributes.length}`,
        type: 'String'
    });
    renderEditAttributesList(entity);
    renderEntities();
}

function removeAttribute(index) {
    const entity = state.entities.find(e => e.id === activeEditEntityId);
    if (entity && entity.attributes[index]) {
        entity.attributes.splice(index, 1);
        renderEditAttributesList(entity);
        renderEntities();
    }
}

function deleteEntityFromModal() {
    if (!activeEditEntityId) return;
    if (confirm('¿Estás seguro de que deseas eliminar esta entidad y todas sus relaciones asociadas?')) {
        state.entities = state.entities.filter(e => e.id !== activeEditEntityId);
        state.relations = state.relations.filter(r => r.sourceEntityId !== activeEditEntityId && r.targetEntityId !== activeEditEntityId);
        closeModal('modal-entity-edit');
        renderEntities();
        renderRelations();
    }
}

// Propose custom role names based on entity names and relationship type
function getUniqueRoleName(entity, baseName, excludeRelationId = null) {
    let candidate = baseName;
    let counter = 1;

    function isNameTaken(name) {
        if (entity.attributes.some(a => a.name.toLowerCase() === name.toLowerCase())) {
            return true;
        }
        for (const rel of state.relations) {
            if (excludeRelationId && rel.id === excludeRelationId) continue;
            
            if (rel.sourceEntityId === entity.id && rel.targetRole && rel.targetRole.toLowerCase() === name.toLowerCase()) {
                return true;
            }
            if (rel.targetEntityId === entity.id && rel.sourceRole && rel.sourceRole.toLowerCase() === name.toLowerCase()) {
                return true;
            }
        }
        return false;
    }

    if (isNameTaken(candidate)) {
        candidate = baseName + counter;
        while (isNameTaken(candidate)) {
            counter++;
            candidate = baseName + counter;
        }
    }
    return candidate;
}

function proposeRoleNames(sourceId, targetId, type, excludeRelationId = null) {
    const e1 = state.entities.find(e => e.id === sourceId);
    const e2 = state.entities.find(e => e.id === targetId);
    if (!e1 || !e2) return { sourceRole: '', targetRole: '' };

    let e1Name = e1.name;
    let e2Name = e2.name;

    // Attribute in E1 referencing E2
    let targetRoleBase = ''; 
    if (type === '1a1' || type === 'Na1') {
        targetRoleBase = uncapitalize(e2Name);
    } else {
        targetRoleBase = pluralize(uncapitalize(e2Name));
    }

    // Attribute in E2 referencing E1
    let sourceRoleBase = '';
    if (type === '1a1' || type === '1aN') {
        sourceRoleBase = uncapitalize(e1Name);
    } else {
        sourceRoleBase = pluralize(uncapitalize(e1Name));
    }

    const targetRole = getUniqueRoleName(e1, targetRoleBase, excludeRelationId);
    const sourceRole = getUniqueRoleName(e2, sourceRoleBase, excludeRelationId);

    return { sourceRole, targetRole };
}

// RELATION MODAL
let activeEditRelationId = null;
let activeSourceId = null;
let activeTargetId = null;

function openRelationModal(relationId = null, sourceId = null, targetId = null) {
    activeEditRelationId = relationId;
    activeSourceId = sourceId;
    activeTargetId = targetId;

    const btnDelete = document.getElementById('btn-delete-relation');
    
    let sourceName = '';
    let targetName = '';

    if (relationId) {
        const rel = state.relations.find(r => r.id === relationId);
        activeSourceId = rel.sourceEntityId;
        activeTargetId = rel.targetEntityId;
        sourceName = state.entities.find(e => e.id === activeSourceId).name;
        targetName = state.entities.find(e => e.id === activeTargetId).name;
        
        btnDelete.classList.remove('hidden');
        document.getElementById('relation-modal-title').innerText = 'Editar Relación';
        setupRelationOptions(sourceName, targetName, rel.type);
        
        // Fill roles
        document.getElementById('relation-source-role').value = rel.sourceRole || '';
        document.getElementById('relation-target-role').value = rel.targetRole || '';
    } else {
        sourceName = state.entities.find(e => e.id === sourceId).name;
        targetName = state.entities.find(e => e.id === targetId).name;

        btnDelete.classList.add('hidden');
        document.getElementById('relation-modal-title').innerText = 'Configurar Relación';
        setupRelationOptions(sourceName, targetName, 'Na1');
        
        // Propose roles
        const props = proposeRoleNames(activeSourceId, activeTargetId, 'Na1');
        document.getElementById('relation-source-role').value = props.sourceRole;
        document.getElementById('relation-target-role').value = props.targetRole;
    }

    document.getElementById('lbl-target-role').innerText = `Atributo en ${sourceName} (apunta a ${targetName})`;
    document.getElementById('lbl-source-role').innerText = `Atributo en ${targetName} (apunta a ${sourceName})`;

    openModal('modal-relation-config');
}

function setupRelationOptions(e1, e2, selectedType) {
    const optionsContainer = document.getElementById('relation-options');
    
    const options = [
        { type: '1a1', desc: `1 a 1 entre ${e1} y ${e2}` },
        { type: '1aN', desc: `1 a N entre ${e1} y ${e2}` },
        { type: 'Na1', desc: `N a 1 entre ${e1} y ${e2}` },
        { type: 'NaN', desc: `N a N entre ${e1} y ${e2}` }
    ];

    optionsContainer.innerHTML = options.map(opt => `
        <label class="flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all bg-slate-950/40 
            ${selectedType === opt.type ? 'border-indigo-500 bg-indigo-950/20 text-white font-medium' : 'border-slate-800 text-slate-300 hover:bg-slate-800/40'}">
            <input type="radio" name="relation-type" value="${opt.type}" ${selectedType === opt.type ? 'checked' : ''} class="text-indigo-600 focus:ring-indigo-500 h-4 w-4">
            <span class="text-sm">${opt.desc}</span>
        </label>
    `).join('');

    const radios = document.getElementsByName('relation-type');
    radios.forEach(r => {
        r.addEventListener('change', () => {
            setupRelationOptions(e1, e2, r.value);
            // Re-propose roles based on new type selection
            const props = proposeRoleNames(activeSourceId, activeTargetId, r.value, activeEditRelationId);
            document.getElementById('relation-source-role').value = props.sourceRole;
            document.getElementById('relation-target-role').value = props.targetRole;
        });
    });
}

function saveRelationConfig() {
    const radios = document.getElementsByName('relation-type');
    let selectedType = 'Na1';
    radios.forEach(r => {
        if (r.checked) selectedType = r.value;
    });

    const sourceRole = document.getElementById('relation-source-role').value.trim();
    const targetRole = document.getElementById('relation-target-role').value.trim();

    if (!sourceRole || !targetRole) {
        showAlert('Debes ingresar los nombres de atributos para ambos extremos.');
        return;
    }

    if (activeEditRelationId) {
        const rel = state.relations.find(r => r.id === activeEditRelationId);
        if (rel) {
            rel.type = selectedType;
            rel.sourceRole = sourceRole;
            rel.targetRole = targetRole;
        }
    } else {
        state.relations.push({
            id: 'r_' + Date.now(),
            sourceEntityId: activeSourceId,
            targetEntityId: activeTargetId,
            type: selectedType,
            sourceRole: sourceRole,
            targetRole: targetRole
        });
    }

    closeModal('modal-relation-config');
    renderRelations();
}

function deleteRelationFromModal() {
    if (!activeEditRelationId) return;
    if (confirm('¿Estás seguro de que deseas eliminar esta relación?')) {
        state.relations = state.relations.filter(r => r.id !== activeEditRelationId);
        closeModal('modal-relation-config');
        renderRelations();
    }
}

// Database config
function openDbConfigModal() {
    loadDbConfigValues();
    openModal('modal-db-config');
}

function saveDbConfig() {
    state.dbConfig.appName = document.getElementById('config-app-name').value.trim() || 'inventario';
    state.dbConfig.dbUrl = document.getElementById('config-db-url').value.trim() || 'jdbc:postgresql://localhost:5432/inventario_db';
    state.dbConfig.dbUser = document.getElementById('config-db-user').value.trim() || 'postgres';
    state.dbConfig.dbPass = document.getElementById('config-db-pass').value.trim() || 'postgres';
    closeModal('modal-db-config');
}

document.querySelector('#modal-db-config button').addEventListener('click', saveDbConfig);


// ==========================================
//   SPRING BOOT PROJECT GENERATOR ENGINE
// ==========================================

function pluralize(str) {
    const last = str.slice(-1).toLowerCase();
    if ('aeiou'.includes(last)) {
        return str + 's';
    } else if (last === 'y') {
        return str.slice(0, -1) + 'ies';
    } else {
        return str + 'es';
    }
}

function uncapitalize(str) {
    return str.charAt(0).toLowerCase() + str.slice(1);
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

async function generateProjectZip() {
    saveDbConfig();

    const zip = new JSZip();
    const appName = state.dbConfig.appName.toLowerCase();
    const pkgPath = `src/main/java/org/agaray/swagger/${appName}`;

    // 1. pom.xml
    const pomContent = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
	xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
	xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
	<modelVersion>4.0.0</modelVersion>
	<parent>
		<groupId>org.springframework.boot</groupId>
		<artifactId>spring-boot-starter-parent</artifactId>
		<version>3.4.0</version>
		<relativePath />
	</parent>
	<groupId>org.agaray.swagger</groupId>
	<artifactId>${appName}</artifactId>
	<version>0.0.1-SNAPSHOT</version>
	<name>${appName}</name>
	<description>Generated with CRUDO</description>
	<properties>
		<java.version>21</java.version>
	</properties>
	<dependencies>
		<dependency>
			<groupId>org.springframework.boot</groupId>
			<artifactId>spring-boot-starter-data-jpa</artifactId>
		</dependency>
		<dependency>
			<groupId>org.springframework.boot</groupId>
			<artifactId>spring-boot-starter-web</artifactId>
		</dependency>
		<dependency>
			<groupId>org.postgresql</groupId>
			<artifactId>postgresql</artifactId>
			<scope>runtime</scope>
		</dependency>
		<dependency>
			<groupId>org.springframework.boot</groupId>
			<artifactId>spring-boot-starter-test</artifactId>
			<scope>test</scope>
		</dependency>
		<dependency>
			<groupId>org.projectlombok</groupId>
			<artifactId>lombok</artifactId>
			<optional>true</optional>
		</dependency>
		<dependency>
			<groupId>org.springdoc</groupId>
			<artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
			<version>2.7.0</version>
		</dependency>
		<dependency>
			<groupId>org.springframework.boot</groupId>
			<artifactId>spring-boot-starter-thymeleaf</artifactId>
		</dependency>
	</dependencies>
	<build>
		<plugins>
			<plugin>
				<groupId>org.springframework.boot</groupId>
				<artifactId>spring-boot-maven-plugin</artifactId>
			</plugin>
		</plugins>
	</build>
</project>`;
    zip.file("pom.xml", pomContent);

    // 2. Application Class
    const mainClassName = capitalize(appName) + "Application";
    const appClassContent = `package org.agaray.swagger.${appName};

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class ${mainClassName} {
    public static void main(String[] args) {
        SpringApplication.run(${mainClassName}.class, args);
    }
}`;
    zip.file(`${pkgPath}/${mainClassName}.java`, appClassContent);

    // 3. application.properties
    const propsContent = `spring.application.name=${appName}

spring.datasource.url=${state.dbConfig.dbUrl}
spring.datasource.username=${state.dbConfig.dbUser}
spring.datasource.password=${state.dbConfig.dbPass}
spring.datasource.driver-class-name=org.postgresql.Driver

spring.datasource.hikari.maximum-pool-size=5
spring.datasource.hikari.minimum-idle=2
spring.datasource.hikari.connection-timeout=30000

spring.jpa.hibernate.ddl-auto=update
spring.jpa.show-sql=true
spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.PostgreSQLDialect
spring.jpa.properties.hibernate.temp.use_jdbc_metadata_defaults=false
spring.jpa.properties.hibernate.connection.handling_mode=DELAYED_ACQUISITION_AND_RELEASE_AFTER_TRANSACTION
`;
    zip.file("src/main/resources/application.properties", propsContent);

    // Analyze relationships
    const entityRelations = {};
    state.entities.forEach(ent => {
        entityRelations[ent.id] = {
            manyToOnes: [],
            oneToManyMappedBys: [],
            manyToManySource: [],
            manyToManyTarget: [],
            oneToOnes: []
        };
    });

    state.relations.forEach(rel => {
        const source = state.entities.find(e => e.id === rel.sourceEntityId);
        const target = state.entities.find(e => e.id === rel.targetEntityId);
        if (!source || !target) return;

        // Custom field names from role inputs
        const sRole = rel.sourceRole;
        const tRole = rel.targetRole;

        if (rel.type === 'Na1') {
            // source (N) -> target (1)
            entityRelations[source.id].manyToOnes.push({ target: target, fieldName: tRole });
            entityRelations[target.id].oneToManyMappedBys.push({ source: source, fieldName: sRole, mappedByField: tRole });
        } else if (rel.type === '1aN') {
            // source (1) -> target (N)
            entityRelations[target.id].manyToOnes.push({ target: source, fieldName: sRole });
            entityRelations[source.id].oneToManyMappedBys.push({ source: target, fieldName: tRole, mappedByField: sRole });
        } else if (rel.type === 'NaN') {
            // source (N) -> target (N)
            entityRelations[source.id].manyToManySource.push({ target: target, fieldName: tRole });
            entityRelations[target.id].manyToManyTarget.push({ source: source, fieldName: sRole, mappedByField: tRole });
        } else if (rel.type === '1a1') {
            // source (1) -> target (1)
            entityRelations[source.id].oneToOnes.push({ target: target, fieldName: tRole, isOwner: true });
            entityRelations[target.id].oneToOnes.push({ target: source, fieldName: sRole, isOwner: false, mappedByField: tRole });
        }
    });

    // Generate Java Classes and templates for each entity
    state.entities.forEach(ent => {
        const entPlural = pluralize(ent.name);
        const entPluralLower = entPlural.toLowerCase();
        const entLower = uncapitalize(ent.name);
        const relationsInfo = entityRelations[ent.id];

        // --- MODEL ---
        let imports = new Set([
            'jakarta.persistence.*',
            'lombok.AllArgsConstructor',
            'lombok.Data',
            'lombok.NoArgsConstructor',
            'io.swagger.v3.oas.annotations.media.Schema'
        ]);

        let modelFields = [];

        ent.attributes.forEach(attr => {
            if (attr.name.toLowerCase() === 'id') {
                modelFields.push(`    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Schema(description = "Identificador único", accessMode = Schema.AccessMode.READ_ONLY)
    private Long id;`);
            } else {
                let jType = attr.type;
                if (jType === 'Date') {
                    jType = 'java.time.LocalDate';
                }
                modelFields.push(`    @Column(nullable = false)
    @Schema(description = "${attr.name}", example = "")
    private ${jType} ${attr.name};`);
            }
        });

        relationsInfo.manyToOnes.forEach(rel => {
            imports.add('lombok.ToString');
            modelFields.push(`    @ManyToOne(fetch = FetchType.EAGER)
    @ToString.Exclude
    @Schema(description = "Relación con ${rel.target.name}")
    private ${rel.target.name} ${rel.fieldName};`);
        });

        relationsInfo.oneToManyMappedBys.forEach(rel => {
            imports.add('java.util.List');
            imports.add('com.fasterxml.jackson.annotation.JsonIgnore');
            modelFields.push(`    @OneToMany(mappedBy = "${rel.mappedByField}", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    @JsonIgnore
    @Schema(description = "Listado de ${rel.source.name} asociados")
    private List<${rel.source.name}> ${rel.fieldName};`);
        });

        relationsInfo.manyToManySource.forEach(rel => {
            imports.add('java.util.Set');
            imports.add('java.util.HashSet');
            modelFields.push(`    @ManyToMany(fetch = FetchType.EAGER)
    @JoinTable(
        name = "${entLower}_${rel.fieldName}_join",
        joinColumns = @JoinColumn(name = "${entLower}_id"),
        inverseJoinColumns = @JoinColumn(name = "${uncapitalize(rel.target.name)}_id")
    )
    @Schema(description = "Relación muchos a muchos con ${rel.target.name}")
    private Set<${rel.target.name}> ${rel.fieldName} = new HashSet<>();`);
        });

        relationsInfo.manyToManyTarget.forEach(rel => {
            imports.add('java.util.Set');
            imports.add('java.util.HashSet');
            imports.add('com.fasterxml.jackson.annotation.JsonIgnore');
            modelFields.push(`    @ManyToMany(mappedBy = "${rel.mappedByField}", fetch = FetchType.LAZY)
    @JsonIgnore
    @Schema(description = "Relación muchos a muchos con ${rel.source.name} (no propietaria)")
    private Set<${rel.source.name}> ${rel.fieldName} = new HashSet<>();`);
        });

        relationsInfo.oneToOnes.forEach(rel => {
            if (rel.isOwner) {
                modelFields.push(`    @OneToOne(cascade = CascadeType.ALL)
    @JoinColumn(name = "${rel.fieldName}_id", referencedColumnName = "id")
    @Schema(description = "Relación uno a uno con ${rel.target.name}")
    private ${rel.target.name} ${rel.fieldName};`);
            } else {
                imports.add('com.fasterxml.jackson.annotation.JsonIgnore');
                modelFields.push(`    @OneToOne(mappedBy = "${rel.mappedByField}", fetch = FetchType.LAZY)
    @JsonIgnore
    @Schema(description = "Relación uno a uno con ${rel.target.name} (no propietaria)")
    private ${rel.target.name} ${rel.fieldName};`);
            }
        });

        const sortedImports = Array.from(imports).sort().map(imp => `import ${imp};`).join('\n');

        const modelCode = `package org.agaray.swagger.${appName}.models;

${sortedImports}

@Entity
@Table(name = "${entPluralLower}")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Modelo para representar ${ent.name}")
public class ${ent.name} {

${modelFields.join('\n\n')}
}`;
        zip.file(`${pkgPath}/models/${ent.name}.java`, modelCode);

        // --- REPOSITORY ---
        const repoCode = `package org.agaray.swagger.${appName}.repositories;

import org.agaray.swagger.${appName}.models.${ent.name};
import org.springframework.data.jpa.repository.JpaRepository;

public interface ${ent.name}Repository extends JpaRepository<${ent.name}, Long> {
}`;
        zip.file(`${pkgPath}/repositories/${ent.name}Repository.java`, repoCode);

        // --- SERVICE ---
        const serviceCode = `package org.agaray.swagger.${appName}.services;

import lombok.RequiredArgsConstructor;
import org.agaray.swagger.${appName}.models.${ent.name};
import org.agaray.swagger.${appName}.repositories.${ent.name}Repository;
import org.springframework.stereotype.Service;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ${ent.name}Service {

    private final ${ent.name}Repository repository;

    public List<${ent.name}> obtenerTodas() {
        return repository.findAll();
    }

    public ${ent.name} guardar(${ent.name} obj) {
        return repository.save(obj);
    }

    public ${ent.name} obtenerPorId(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new RuntimeException("${ent.name} no encontrado con ID: " + id));
    }

    public void eliminar(Long id) {
        if (!repository.existsById(id)) {
            throw new RuntimeException("${ent.name} no encontrado con ID: " + id);
        }
        repository.deleteById(id);
    }
}`;
        zip.file(`${pkgPath}/services/${ent.name}Service.java`, serviceCode);

        // --- API REST CONTROLLER ---
        const apiControllerCode = `package org.agaray.swagger.${appName}.controllers.api;

import lombok.RequiredArgsConstructor;
import org.agaray.swagger.${appName}.models.${ent.name};
import org.agaray.swagger.${appName}.services.${ent.name}Service;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;

@RestController
@RequestMapping("/api/${entPluralLower}")
@RequiredArgsConstructor
@Tag(name = "${entPlural}", description = "Endpoints para gestionar ${entPlural}")
public class ${ent.name}Controller {

    private final ${ent.name}Service service;

    @GetMapping
    @Operation(summary = "Listar todos")
    public List<${ent.name}> listar() {
        return service.obtenerTodas();
    }

    @GetMapping("/{id}")
    @Operation(summary = "Obtener por ID")
    public ResponseEntity<${ent.name}> obtener(@PathVariable Long id) {
        return ResponseEntity.ok(service.obtenerPorId(id));
    }

    @PostMapping
    @Operation(summary = "Crear nuevo")
    public ResponseEntity<${ent.name}> crear(@RequestBody ${ent.name} obj) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.guardar(obj));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Actualizar por ID")
    public ResponseEntity<${ent.name}> actualizar(@PathVariable Long id, @RequestBody ${ent.name} obj) {
        ${ent.name} existente = service.obtenerPorId(id);
        ${ent.attributes.filter(a => a.name.toLowerCase() !== 'id').map(a => `existente.set${capitalize(a.name)}(obj.get${capitalize(a.name)}());`).join('\n        ')}
        ${relationsInfo.manyToOnes.map(r => `existente.set${capitalize(r.fieldName)}(obj.get${capitalize(r.fieldName)}());`).join('\n        ')}
        ${relationsInfo.oneToOnes.filter(r => r.isOwner).map(r => `existente.set${capitalize(r.fieldName)}(obj.get${capitalize(r.fieldName)}());`).join('\n        ')}
        
        return ResponseEntity.ok(service.guardar(existente));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Eliminar por ID")
    public ResponseEntity<Void> eliminar(@PathVariable Long id) {
        service.eliminar(id);
        return ResponseEntity.noContent().build();
    }
}`;
        zip.file(`${pkgPath}/controllers/api/${ent.name}Controller.java`, apiControllerCode);

        // --- VIEW CONTROLLER ---
        let injectedServicesFields = [];
        let viewInjectModels = [];

        relationsInfo.manyToOnes.forEach(rel => {
            injectedServicesFields.push(`    private final ${rel.target.name}Service ${uncapitalize(rel.target.name)}Service;`);
            viewInjectModels.push(`        model.addAttribute("${pluralize(uncapitalize(rel.target.name))}", ${uncapitalize(rel.target.name)}Service.obtenerTodas());`);
        });
        relationsInfo.manyToManySource.forEach(rel => {
            injectedServicesFields.push(`    private final ${rel.target.name}Service ${uncapitalize(rel.target.name)}Service;`);
            viewInjectModels.push(`        model.addAttribute("${pluralize(uncapitalize(rel.target.name))}", ${uncapitalize(rel.target.name)}Service.obtenerTodas());`);
        });
        relationsInfo.oneToOnes.filter(r => r.isOwner).forEach(rel => {
            injectedServicesFields.push(`    private final ${rel.target.name}Service ${uncapitalize(rel.target.name)}Service;`);
            viewInjectModels.push(`        model.addAttribute("${pluralize(uncapitalize(rel.target.name))}", ${rel.target.name}Service.obtenerTodas());`);
        });

        const uniqueInjectedServicesFields = Array.from(new Set(injectedServicesFields)).join('\n');
        const uniqueViewInjectModels = Array.from(new Set(viewInjectModels)).join('\n');

        const viewControllerCode = `package org.agaray.swagger.${appName}.controllers.view;

import lombok.RequiredArgsConstructor;
import org.agaray.swagger.${appName}.models.${ent.name};
import org.agaray.swagger.${appName}.services.${ent.name}Service;
${relationsInfo.manyToOnes.map(r => `import org.agaray.swagger.${appName}.services.${r.target.name}Service;`).join('\n')}
${relationsInfo.manyToManySource.map(r => `import org.agaray.swagger.${appName}.services.${r.target.name}Service;`).join('\n')}
${relationsInfo.oneToOnes.filter(r => r.isOwner).map(r => `import org.agaray.swagger.${appName}.services.${r.target.name}Service;`).join('\n')}
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
@RequestMapping("/web/${entPluralLower}")
@RequiredArgsConstructor
public class ${ent.name}ViewController {

    private final ${ent.name}Service service;
${uniqueInjectedServicesFields}

    @GetMapping
    public String listar(Model model) {
        model.addAttribute("${entPluralLower}", service.obtenerTodas());
        return "${entPluralLower}/list";
    }

    @GetMapping("/new")
    public String nuevo(Model model) {
        model.addAttribute("${entLower}", new ${ent.name}());
${uniqueViewInjectModels}
        return "${entPluralLower}/form";
    }

    @GetMapping("/edit/{id}")
    public String editar(@PathVariable Long id, Model model, RedirectAttributes redirectAttributes) {
        try {
            model.addAttribute("${entLower}", service.obtenerPorId(id));
${uniqueViewInjectModels}
            return "${entPluralLower}/form";
        } catch (Exception e) {
            redirectAttributes.addFlashAttribute("error", "No se encontró el registro.");
            return "redirect:/web/${entPluralLower}";
        }
    }

    @PostMapping("/save")
    public String guardar(@ModelAttribute ${ent.name} obj, Model model, RedirectAttributes redirectAttributes) {
        try {
            service.guardar(obj);
            redirectAttributes.addFlashAttribute("success", "Registro guardado con éxito.");
            return "redirect:/web/${entPluralLower}";
        } catch (Exception e) {
            model.addAttribute("error", "Error al guardar el registro.");
            model.addAttribute("${entLower}", obj);
${uniqueViewInjectModels}
            return "${entPluralLower}/form";
        }
    }

    @GetMapping("/delete/{id}")
    public String eliminar(@PathVariable Long id, RedirectAttributes redirectAttributes) {
        try {
            service.eliminar(id);
            redirectAttributes.addFlashAttribute("success", "Registro eliminado con éxito.");
        } catch (Exception e) {
            redirectAttributes.addFlashAttribute("error", "No se puede eliminar el registro debido a dependencias activas.");
        }
        return "redirect:/web/${entPluralLower}";
    }
}`;
        zip.file(`${pkgPath}/controllers/view/${ent.name}ViewController.java`, viewControllerCode);

        // --- THYMELEAF VIEWS ---
        // 1. templates/[pluralName]/list.html
        let listHeaders = ent.attributes.map(a => `<th class="px-6 py-3 font-semibold">${capitalize(a.name)}</th>`);
        relationsInfo.manyToOnes.forEach(r => listHeaders.push(`<th class="px-6 py-3 font-semibold">${capitalize(r.fieldName)}</th>`));
        relationsInfo.oneToOnes.filter(r => r.isOwner).forEach(r => listHeaders.push(`<th class="px-6 py-3 font-semibold">${capitalize(r.fieldName)}</th>`));

        let listValues = ent.attributes.map(a => {
            if (a.name.toLowerCase() === 'id') {
                return `<td class="px-6 py-3.5 font-mono text-indigo-400 font-semibold" th:text="\${item.${a.name}}">1</td>`;
            }
            return `<td class="px-6 py-3.5 text-white font-medium" th:text="\${item.${a.name}}">Valor</td>`;
        });
        relationsInfo.manyToOnes.forEach(r => {
            listValues.push(`<td class="px-6 py-3.5 text-slate-300" th:text="\${item.${r.fieldName} != null ? item.${r.fieldName}.nombre : '-'}">Nombre</td>`);
        });
        relationsInfo.oneToOnes.filter(r => r.isOwner).forEach(r => {
            listValues.push(`<td class="px-6 py-3.5 text-slate-300" th:text="\${item.${r.fieldName} != null ? item.${r.fieldName}.nombre : '-'}">Nombre</td>`);
        });

        const totalCols = listHeaders.length + 1;

        const thListHtml = `<!DOCTYPE html>
<html lang="es" xmlns:th="http://www.thymeleaf.org" th:replace="~{layout :: main(~{::content}, '${entPluralLower}')}">
<head>
    <title>${entPlural} - Panel</title>
</head>
<body>
    <div th:fragment="content" class="flex flex-col gap-6">
        <!-- Badge & "Nuevo" Button Header -->
        <div class="flex items-center gap-4">
            <span class="px-4 py-1.5 rounded-full text-sm font-bold bg-slate-800 text-indigo-400 border border-slate-700 tracking-wider">
                ${entPlural}
            </span>
            <a th:href="@{/web/${entPluralLower}/new}" class="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all text-xs font-bold text-white tracking-wide shadow-md shadow-indigo-600/10">
                Nuevo
            </a>
        </div>

        <!-- Success/Error Messages -->
        <div th:if="\${success}" class="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm" th:text="\${success}"></div>
        <div th:if="\${error}" class="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm" th:text="\${error}"></div>

        <!-- Table -->
        <div class="overflow-hidden bg-slate-900 border border-slate-800 rounded-xl">
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead class="bg-slate-950/80 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        <tr>
                            ${listHeaders.join('\n                            ')}
                            <th class="px-6 py-3 font-semibold">Acciones</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-800/60 text-sm text-slate-300">
                        <tr th:each="item : \${${entPluralLower}}" class="hover:bg-slate-900/30 transition-colors">
                            ${listValues.join('\n                            ')}
                            <td class="px-6 py-3.5">
                                <div class="flex items-center gap-3">
                                    <a th:href="@{/web/${entPluralLower}/edit/{id}(id=\${item.id})}" class="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-800 hover:bg-indigo-600 hover:text-white text-slate-400 transition-all border border-slate-700" title="Editar">
                                        <i class="fa-solid fa-pencil text-xs"></i>
                                    </a>
                                    <a th:href="@{/web/${entPluralLower}/delete/{id}(id=\${item.id})}" class="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-800 hover:bg-rose-600 hover:text-white text-slate-400 transition-all border border-slate-700" title="Borrar" onclick="confirmDelete(event, this.href);">
                                        <i class="fa-solid fa-trash-can text-xs"></i>
                                    </a>
                                </div>
                            </td>
                        </tr>
                        <tr th:if="\${#lists.isEmpty(${entPluralLower})}">
                            <td colspan="${totalCols}" class="py-16 text-center text-slate-500 font-light">
                                <i class="fa-regular fa-folder-open text-3xl mb-2 block"></i>
                                No hay registros cargados.
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</body>
</html>`;
        zip.file(`src/main/resources/templates/${entPluralLower}/list.html`, thListHtml);

        // 2. templates/[pluralName]/form.html
        let formFields = [];
        ent.attributes.forEach(a => {
            if (a.name.toLowerCase() === 'id') return;
            let typeAttr = a.type === 'Double' || a.type === 'Integer' || a.type === 'Long' ? 'type="number" step="any"' :
                           a.type === 'Boolean' ? 'type="checkbox"' :
                           a.type === 'Date' ? 'type="date"' : 'type="text"';

            if (a.type === 'Boolean') {
                formFields.push(`            <div class="flex items-center gap-2">
                <input type="checkbox" th:field="*{\${${a.name}}}" id="${a.name}" class="bg-slate-950 border border-slate-800 rounded focus:ring-indigo-500 h-4 w-4">
                <label for="${a.name}" class="text-xs font-bold text-slate-400 uppercase tracking-wider">${capitalize(a.name)}</label>
            </div>`);
            } else {
                formFields.push(`            <div>
                <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">${capitalize(a.name)}</label>
                <input ${typeAttr} th:field="*{${a.name}}" required class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-sm" placeholder="Ej: ...">
            </div>`);
            }
        });

        relationsInfo.manyToOnes.forEach(r => {
            formFields.push(`            <div>
                <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">${capitalize(r.fieldName)}</label>
                <select th:field="*{${r.fieldName}}" class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-sm">
                    <option value="">-- Selecciona ${r.target.name} --</option>
                    <option th:each="sub : \${${pluralize(uncapitalize(r.target.name))}}" th:value="\${sub.id}" th:text="\${sub.nombre}"></option>
                </select>
            </div>`);
        });

        relationsInfo.oneToOnes.filter(r => r.isOwner).forEach(r => {
            formFields.push(`            <div>
                <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">${capitalize(r.fieldName)}</label>
                <select th:field="*{${r.fieldName}}" class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-sm">
                    <option value="">-- Selecciona ${r.target.name} --</option>
                    <option th:each="sub : \${${pluralize(uncapitalize(r.target.name))}}" th:value="\${sub.id}" th:text="\${sub.nombre}"></option>
                </select>
            </div>`);
        });

        relationsInfo.manyToManySource.forEach(r => {
            formFields.push(`            <div>
                <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">${capitalize(r.fieldName)}</label>
                <select th:field="*{${r.fieldName}}" multiple class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-sm h-28">
                    <option th:each="sub : \${${pluralize(uncapitalize(r.target.name))}}" th:value="\${sub.id}" th:text="\${sub.nombre}"></option>
                </select>
                <span class="text-[10px] text-slate-500 mt-1 block">Presiona Ctrl/Cmd para seleccionar múltiples opciones</span>
            </div>`);
        });

        const thFormHtml = `<!DOCTYPE html>
<html lang="es" xmlns:th="http://www.thymeleaf.org" th:replace="~{layout :: main(~{::content}, '${entPluralLower}')}">
<head>
    <title>Formulario ${ent.name}</title>
</head>
<body>
    <div th:fragment="content" class="max-w-md mx-auto bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <div class="px-5 py-4 border-b border-slate-800">
            <h3 class="text-sm font-bold text-white tracking-wider uppercase" 
                th:text="\${${entLower}.id != null} ? 'Editar ${ent.name} #' + \${${entLower}.id} : 'Nuevo ${ent.name}'">
                Formulario de ${ent.name}
            </h3>
        </div>
        <form th:action="@{/web/${entPluralLower}/save}" th:object="\${${entLower}}" method="post" class="p-5 space-y-4">
            <input type="hidden" th:field="*{id}">
            
            <div th:if="\${error}" class="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm" th:text="\${error}"></div>

            ${formFields.join('\n\n')}

            <div class="flex justify-end gap-3 pt-4 border-t border-slate-800 bg-slate-950/20 -mx-5 -mb-5 px-5 py-3.5">
                <a th:href="@{/web/${entPluralLower}}" class="px-3.5 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs font-semibold text-slate-300 transition-all">
                    Cancelar
                </a>
                <button type="submit" class="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white transition-all">
                    Guardar
                </button>
            </div>
        </form>
    </div>
</body>
</html>`;
        zip.file(`src/main/resources/templates/${entPluralLower}/form.html`, thFormHtml);
    });

    // Sidebar navigation dynamic listing
    let sidebarLinks = state.entities.map(e => {
        const pluralLower = pluralize(e.name).toLowerCase();
        return `                    <a th:href="@{/web/${pluralLower}}" 
                       th:classappend="\${activeTab == '${pluralLower}'} ? 'bg-indigo-600/10 text-white border-indigo-500/30 font-semibold' : 'text-slate-400 border-transparent hover:bg-slate-800/30 hover:text-white'"
                       class="w-full flex items-center justify-between px-4 py-3 rounded-xl text-left text-sm font-semibold transition-all border">
                        <span>${pluralize(e.name)}</span>
                    </a>`;
    }).join('\n');

    const layoutContent = `<!DOCTYPE html>
<html lang="es" class="h-full bg-slate-950 text-slate-100" xmlns:th="http://www.thymeleaf.org" th:fragment="main(content, activeTab)">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Panel de Gestión - CRUDO Generated</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    fontFamily: {
                        sans: ['Outfit', 'sans-serif'],
                    },
                }
            }
        }
    </script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <style>
        ::-webkit-scrollbar {
            width: 6px;
            height: 6px;
        }
        ::-webkit-scrollbar-track {
            background: rgba(15, 23, 42, 0.6);
        }
        ::-webkit-scrollbar-thumb {
            background: rgba(99, 102, 241, 0.3);
            border-radius: 3px;
        }
        ::-webkit-scrollbar-thumb:hover {
            background: rgba(99, 102, 241, 0.6);
        }
    </style>
</head>
<body class="h-full flex flex-col font-sans overflow-hidden">

    <header class="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between z-10">
        <div class="flex items-center gap-4">
            <a th:href="@{/web}" class="text-slate-400 hover:text-white hover:scale-105 active:scale-95 transition-all duration-150" title="Inicio">
                <i class="fa-solid fa-house text-2xl"></i>
            </a>
            <span class="text-xl font-bold tracking-tight text-white">${appName}</span>
        </div>
        <div class="flex items-center gap-4 text-sm font-medium text-slate-400">
            <button onclick="showLoginAlert()" class="hover:text-white transition-colors">Login</button>
            <span class="text-slate-700">|</span>
            <button onclick="showLoginAlert()" class="hover:text-white transition-colors">Registro</button>
        </div>
    </header>

    <div class="flex-1 flex overflow-hidden">
        <aside class="w-60 bg-slate-900/40 border-r border-slate-850 flex flex-col z-20">
            <div class="p-4 flex-1">
                <nav class="space-y-1">
${sidebarLinks}
                </nav>
            </div>
        </aside>

        <main class="flex-1 flex flex-col bg-slate-950 p-8 overflow-y-auto">
            <div th:replace="\${content}"></div>
        </main>
    </div>

    <div id="delete-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onclick="closeDeleteModal()"></div>
        <div class="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm shadow-2xl relative z-10 flex flex-col overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
                <h3 class="text-sm font-bold text-white tracking-wider uppercase">Confirmar Eliminación</h3>
                <button onclick="closeDeleteModal()" class="text-slate-400 hover:text-white transition-colors">
                    <i class="fa-solid fa-xmark text-md"></i>
                </button>
            </div>
            <div class="p-5 text-sm text-slate-300">
                <p>¿Estás seguro de que deseas eliminar este registro? Esta operación es irreversible.</p>
            </div>
            <div class="px-5 py-3.5 border-t border-slate-800 bg-slate-950/40 flex justify-end gap-3">
                <button type="button" onclick="closeDeleteModal()" class="px-3.5 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs font-semibold text-slate-300 transition-all">
                    Cancelar
                </button>
                <button id="btn-confirm-delete" onclick="executeDelete()" class="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white transition-all">
                    Eliminar
                </button>
            </div>
        </div>
    </div>

    <script>
        function showLoginAlert() {
            Swal.fire({
                title: 'Acceso no disponible',
                text: 'La funcionalidad de login/registro no está implementada.',
                icon: 'info',
                background: '#0f172a',
                color: '#f1f5f9',
                confirmButtonColor: '#4f46e5'
            });
        }

        let pendingDeleteUrl = "";
        
        function confirmDelete(event, url) {
            event.preventDefault();
            pendingDeleteUrl = url;
            document.getElementById("delete-modal").classList.remove("hidden");
        }

        function closeDeleteModal() {
            document.getElementById("delete-modal").classList.add("hidden");
            pendingDeleteUrl = "";
        }

        function executeDelete() {
            if (pendingDeleteUrl) {
                window.location.href = pendingDeleteUrl;
            }
        }
    </script>
</body>
</html>`;
    zip.file("src/main/resources/templates/layout.html", layoutContent);

    // 6. HomeViewController & templates/index.html
    const homeViewControllerContent = `package org.agaray.swagger.${appName}.controllers.view;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class HomeViewController {
    @GetMapping({"/", "/web"})
    public String home() {
        return "index";
    }
}`;
    zip.file(`${pkgPath}/controllers/view/HomeViewController.java`, homeViewControllerContent);

    const homeHtmlContent = `<!DOCTYPE html>
<html lang="es" xmlns:th="http://www.thymeleaf.org" th:replace="~{layout :: main(~{::content}, 'home')}">
<head>
    <title>Inicio - Panel de Control</title>
</head>
<body>
    <div th:fragment="content" class="flex flex-col gap-6 max-w-4xl mx-auto py-12">
        <div class="text-center space-y-4">
            <h1 class="text-4xl font-extrabold tracking-tight text-white">¡Bienvenido a ${capitalize(appName)}!</h1>
            <p class="text-slate-400 text-md max-w-xl mx-auto">Tu aplicación web con API REST auto-generada está lista y funcionando con soporte de base de datos relacional PostgreSQL.</p>
        </div>
        
        <div class="grid grid-cols-2 gap-6 mt-8">
            <div class="p-6 bg-slate-900 border border-slate-850 rounded-2xl">
                <h3 class="font-bold text-white text-lg mb-2"><i class="fa-solid fa-code text-indigo-400 mr-2"></i> API REST Swagger</h3>
                <p class="text-slate-400 text-xs mb-4">Explora y prueba los endpoints REST de tus modelos interactuando directamente con OpenAPI.</p>
                <a href="/swagger-ui/index.html" target="_blank" class="text-xs font-bold text-indigo-400 hover:text-indigo-300">Ir a Swagger UI &rarr;</a>
            </div>
            
            <div class="p-6 bg-slate-900 border border-slate-850 rounded-2xl">
                <h3 class="font-bold text-white text-lg mb-2"><i class="fa-solid fa-layer-group text-violet-400 mr-2"></i> Panel de Gestión</h3>
                <p class="text-slate-400 text-xs mb-4">Utiliza el menú lateral para gestionar los registros, crear nuevas entradas y editarlas visualmente.</p>
                <span class="text-xs font-semibold text-slate-500">Usa los enlaces del sidebar lateral</span>
            </div>
        </div>
    </div>
</body>
</html>`;
    zip.file("src/main/resources/templates/index.html", homeHtmlContent);

    // 7. Maven build scripts
    const runTestsBat = `@echo off
mvn clean test
pause`;
    zip.file("run-tests.bat", runTestsBat);

    // Download zip
    zip.generateAsync({type:"blob"}).then(function(content) {
        const element = document.createElement("a");
        element.href = URL.createObjectURL(content);
        element.download = `${appName}_project.zip`;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    });
}
