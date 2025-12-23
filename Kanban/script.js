// --- State & Config ---
const quotes = ["Make it happen.", "Focus on the now.", "One step at a time.", "Deep work mode: On.", "Build consistency."];
let boards = [];
let activeBoardId = 1;
let editingTaskId = null;
let lastPriority = 'Medium';
let history = []; // Stack to store deep copies of 'boards' for undo

// --- Initialization ---
async function initData() {
    return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['orbit_boards', 'orbit_active', 'orbit_theme', 'lastPriority'], (result) => {
                boards = result.orbit_boards || [{ id: 1, name: "My Board", tasks: [] }];
                activeBoardId = parseInt(result.orbit_active) || 1;
                lastPriority = result.lastPriority || 'Medium';
                if (result.orbit_theme === 'dark') document.body.classList.add('dark-mode');
                resolve();
            });
        } else {
            // Fallback to localStorage for web testing
            boards = JSON.parse(localStorage.getItem('orbit_boards')) || [{ id: 1, name: "My Board", tasks: [] }];
            activeBoardId = parseInt(localStorage.getItem('orbit_active')) || 1;
            lastPriority = localStorage.getItem('lastPriority') || 'Medium';
            if (localStorage.getItem('orbit_theme') === 'dark') document.body.classList.add('dark-mode');
            resolve();
        }
    });
}

window.onload = async () => {
    await initData();
    setupUI();
    renderTabs();
    renderBoard();

    // Double click anywhere to open add task modal
    document.body.ondblclick = (e) => {
        // Ignore if clicking inside interactive elements
        if (e.target.closest('.task-card') ||
            e.target.closest('button') ||
            e.target.closest('input') ||
            e.target.closest('.settings-btn') ||
            e.target.closest('.action-dropdown') ||
            e.target.closest('.tab-item')) {

            if (e.target.closest('#addTaskModal')) return;
            return;
        }
        if (document.getElementById('addTaskModal').contains(e.target)) return;
        openModal();
    };
};

// --- Modal Logic ---
function openModal(isEdit = false) {
    if (!isEdit) {
        editingTaskId = null;
        document.getElementById('taskInput').value = '';
        const radios = document.getElementsByName('prio');
        for (let r of radios) r.checked = (r.value === lastPriority);
    }

    document.getElementById('modalBackdrop').classList.add('active');
    document.getElementById('addTaskModal').classList.add('active');
    setTimeout(() => document.getElementById('taskInput').focus(), 100);
}

function openSettings() {
    document.getElementById('modalBackdrop').classList.add('active');
    document.getElementById('settingsModal').classList.add('active');
}

function closeModal() {
    document.getElementById('modalBackdrop').classList.remove('active');
    document.getElementById('addTaskModal').classList.remove('active');
    document.getElementById('settingsModal').classList.remove('active');
    document.getElementById('nameModal').classList.remove('active');
}

let pendingNameAction = null; // Store function to call after name input

function openNameModal(placeholder, callback) {
    const modal = document.getElementById('nameModal');
    const input = document.getElementById('nameInput');
    input.placeholder = placeholder;
    input.value = '';
    pendingNameAction = callback;

    document.getElementById('modalBackdrop').classList.add('active');
    modal.classList.add('active');
    setTimeout(() => input.focus(), 100);
}

function handleNameSubmit() {
    const input = document.getElementById('nameInput');
    const name = input.value.trim();
    if (name && pendingNameAction) {
        pendingNameAction(name);
        closeModal();
    }
}

function setupUI() {
    // Random Quote
    document.getElementById('welcome-text').innerText = quotes[Math.floor(Math.random() * quotes.length)];
    // Date
    const opts = { weekday: 'long', month: 'long', day: 'numeric' };
    document.getElementById('date-display').innerText = new Date().toLocaleDateString('en-US', opts);
}

// --- Core Logic ---
function pushToHistory() {
    // Keep last 30 states
    if (history.length >= 30) history.shift();
    history.push(JSON.parse(JSON.stringify(boards)));
}

function undo() {
    if (history.length === 0) return;
    const lastState = history.pop();
    boards = lastState;
    // Ensure activeBoardId still exists
    if (!boards.find(b => b.id === activeBoardId)) {
        activeBoardId = boards[0]?.id || 1;
    }
    saveAndRender();
}

function handleEnter(e) {
    if (e.key === 'Enter') addTask();
}

function addTask() {
    const input = document.getElementById('taskInput');
    const text = input.value.trim();
    if (!text) return;

    const radios = document.getElementsByName('prio');
    let priority = 'Medium';
    for (let r of radios) if (r.checked) priority = r.value;
    lastPriority = priority;

    const board = getActiveBoard();
    pushToHistory();

    if (editingTaskId) {
        const task = board.tasks.find(t => t.id === editingTaskId);
        if (task) {
            task.text = text;
            task.priority = priority;
        }
    } else {
        board.tasks.push({
            id: Date.now(),
            text: text,
            priority: priority,
            status: 'todo',
            date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    }

    input.value = '';
    saveAndRender();
    closeModal();
}

function editTask(id) {
    const board = getActiveBoard();
    const task = board.tasks.find(t => t.id === id);
    if (!task) return;

    editingTaskId = task.id;
    document.getElementById('taskInput').value = task.text;

    const radios = document.getElementsByName('prio');
    for (let r of radios) {
        if (r.value === task.priority) r.checked = true;
    }

    openModal(true);
}

function getActiveBoard() {
    let board = boards.find(b => b.id === activeBoardId);
    if (!board) {
        if (boards.length > 0) {
            activeBoardId = boards[0].id;
            return boards[0];
        } else {
            addNewBoard("Main Board");
            return boards[0];
        }
    }
    return board;
}

// --- Rendering ---
function renderBoard() {
    const board = getActiveBoard();
    if (!board) return;

    const cols = ['todo', 'inprogress', 'done'];

    cols.forEach(status => {
        const list = document.getElementById(status);
        list.innerHTML = '';

        const tasks = board.tasks.filter(t => t.status === status);
        document.getElementById(`count-${status}`).innerText = tasks.length;

        tasks.forEach(t => {
            const card = document.createElement('div');
            card.className = `task-card p-${t.priority}`;
            card.draggable = true;
            card.dataset.id = t.id;

            card.ondragstart = (e) => {
                e.dataTransfer.setData("text/plain", t.id);
                e.dataTransfer.effectAllowed = "move";
                card.classList.add('dragging');
            };
            card.ondragend = (e) => {
                card.classList.remove('dragging');
                document.querySelectorAll('.column').forEach(c => c.classList.remove('drag-over'));
            };

            card.ondblclick = (e) => {
                e.stopPropagation();
                editTask(t.id);
            };

            card.innerHTML = `
                <div class="delete-icon" data-id="${t.id}">×</div>
                <div class="task-body">${t.text}</div>
                <div class="task-meta">
                    <span>Added: ${t.date}</span>
                </div>
            `;

            // Add click listener to delete icon (since inline onclick is bad for extensions)
            card.querySelector('.delete-icon').addEventListener('click', (e) => {
                e.stopPropagation();
                deleteTask(t.id);
            });

            list.appendChild(card);
        });
    });
}

function renderTabs() {
    const dock = document.getElementById('tabs-container');
    dock.innerHTML = '';

    boards.forEach(b => {
        const tab = document.createElement('div');
        tab.className = `tab-item ${b.id === activeBoardId ? 'active' : ''}`;
        tab.onclick = () => { activeBoardId = b.id; saveAndRender(); };
        tab.innerHTML = `
            ${b.name}
            <span class="tab-close" data-id="${b.id}">×</span>
        `;

        tab.ondblclick = (e) => {
            e.stopPropagation();
            openNameModal("Rename Board:", (newName) => {
                pushToHistory();
                b.name = newName;
                saveAndRender();
            });
        };

        tab.querySelector('.tab-close').addEventListener('click', (e) => {
            e.stopPropagation();
            removeBoard(e, b.id);
        });

        dock.appendChild(tab);
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'new-tab-btn';
    addBtn.innerText = '+';
    addBtn.onclick = () => openNameModal("New Board Name?", (name) => addNewBoard(name));
    dock.appendChild(addBtn);
}

// --- Board Management ---
function addNewBoard(name) {
    if (name) {
        pushToHistory();
        const newId = Date.now();
        boards.push({ id: newId, name: name, tasks: [] });
        activeBoardId = newId;
        saveAndRender();
    }
}

function removeBoard(e, id) {
    if (boards.length <= 1) return alert("You must have at least one board.");
    if (confirm(`Delete board? This cannot be undone.`)) {
        pushToHistory();
        boards = boards.filter(b => b.id !== id);
        if (activeBoardId === id) activeBoardId = boards[0].id;
        saveAndRender();
    }
}

function deleteActiveBoard() {
    if (boards.length <= 1) return alert("You must have at least one board.");
    if (confirm("Delete the CURRENT board? This cannot be undone.")) {
        pushToHistory();
        boards = boards.filter(b => b.id !== activeBoardId);
        activeBoardId = boards[0].id;
        saveAndRender();
    }
}

function deleteTask(id) {
    pushToHistory();
    const board = getActiveBoard();
    board.tasks = board.tasks.filter(t => t.id !== id);
    saveAndRender();
}

function clearBoard() {
    if (confirm("Clear all tasks on this board? This cannot be undone.")) {
        pushToHistory();
        getActiveBoard().tasks = [];
        saveAndRender();
    }
}


// --- Drag & Drop Reordering ---
function allowDrop(e) {
    e.preventDefault();
}

function drop(e) {
    e.preventDefault();
    const id = parseInt(e.dataTransfer.getData("text/plain"));
    const board = getActiveBoard();

    const taskIndex = board.tasks.findIndex(t => t.id === id);
    if (taskIndex === -1) return;
    const task = board.tasks[taskIndex];

    const list = e.target.closest('.task-list');
    if (!list) return;

    const newStatus = list.id;
    const afterElement = getDragAfterElement(list, e.clientY);

    pushToHistory();
    board.tasks.splice(taskIndex, 1);
    task.status = newStatus;

    if (afterElement == null) {
        board.tasks.push(task);
    } else {
        const afterId = parseInt(afterElement.dataset.id);
        const afterIndex = board.tasks.findIndex(t => t.id === afterId);
        board.tasks.splice(afterIndex, 0, task);
    }

    saveAndRender();
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.task-card:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// --- Persistence & Theme ---
function saveAndRender() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({
            orbit_boards: boards,
            orbit_active: activeBoardId,
            lastPriority: lastPriority
        });
    } else {
        localStorage.setItem('orbit_boards', JSON.stringify(boards));
        localStorage.setItem('orbit_active', activeBoardId);
        localStorage.setItem('lastPriority', lastPriority);
    }
    renderTabs();
    renderBoard();
}

function exportData() {
    const data = JSON.stringify(boards, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'orbit_kanban_backup.json';
    link.click();
}

function importData(input) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            boards = JSON.parse(e.target.result);
            if (boards.length > 0) activeBoardId = boards[0].id;
            saveAndRender();
            alert("Import successful! Board data has been loaded.");
        } catch (err) { alert("Invalid file format. Please use a valid JSON backup."); }
        input.value = '';
    };
    reader.readAsText(input.files[0]);
}

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const theme = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ orbit_theme: theme });
    } else {
        localStorage.setItem('orbit_theme', theme);
    }
}

// --- Keyboard Shortcuts ---
document.addEventListener('keydown', (e) => {
    const isModalOpen = document.getElementById('modalBackdrop').classList.contains('active');
    const isAddingTask = document.getElementById('addTaskModal').classList.contains('active');
    const isTyping = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';

    // Shortcut 'n' for New Task
    if (e.key.toLowerCase() === 'n' && !isModalOpen && !isTyping) {
        e.preventDefault();
        openModal();
    }

    // Shortcut 'b' for New Board
    if (e.key.toLowerCase() === 'b' && !isModalOpen && !isTyping) {
        e.preventDefault();
        openNameModal("New Board Name?", (name) => addNewBoard(name));
    }

    // Shortcut 's' for Settings
    if (e.key.toLowerCase() === 's' && !isModalOpen && !isTyping) {
        e.preventDefault();
        openSettings();
    }

    // Shortcut 'Esc' for Closing Modals
    if (e.key === 'Escape' && isModalOpen) {
        e.preventDefault();
        closeModal();
    }

    // Shortcut Ctrl+Z for Undo
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (!isTyping) {
            e.preventDefault();
            undo();
        }
    }

    // Shortcut 'Tab'
    if (e.key === 'Tab') {
        if (isAddingTask) {
            // Cycle Priority in Add Task Modal
            e.preventDefault();
            const priorities = ['Low', 'Medium', 'High'];
            const radios = document.getElementsByName('prio');
            let currentIndex = priorities.indexOf(lastPriority);
            let nextIndex = (currentIndex + 1) % priorities.length;
            let nextPriority = priorities[nextIndex];

            for (let r of radios) {
                if (r.value === nextPriority) {
                    r.checked = true;
                    lastPriority = nextPriority;
                    break;
                }
            }
        } else if (!isModalOpen && !isTyping) {
            // Cycle Boards globally
            e.preventDefault();
            if (boards.length > 1) {
                const currentIndex = boards.findIndex(b => b.id === activeBoardId);
                const nextIndex = (currentIndex + 1) % boards.length;
                activeBoardId = boards[nextIndex].id;
                saveAndRender();
            }
        }
    }
});

// --- High-level Event Listeners for Extension compatibility ---

// Expose functions to window if needed for global access, but better to use listeners.
// Since we removed all inline onclicks, we need to bind them.
document.addEventListener('DOMContentLoaded', () => {
    const settingsBtn = document.querySelector('.settings-btn');
    if (settingsBtn) settingsBtn.addEventListener('click', openSettings);

    const clearAllBtn = document.getElementById('clearAllBtn');
    if (clearAllBtn) clearAllBtn.addEventListener('click', () => { clearBoard(); closeModal(); });

    const toggleThemeBtn = document.getElementById('toggleThemeBtn');
    if (toggleThemeBtn) toggleThemeBtn.addEventListener('click', () => { toggleTheme(); closeModal(); });

    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) exportBtn.addEventListener('click', () => { exportData(); closeModal(); });

    const importTrigger = document.getElementById('importTrigger');
    if (importTrigger) importTrigger.addEventListener('click', () => document.getElementById('fileInput').click());

    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.addEventListener('change', (e) => importData(e.target));

    const nameInput = document.getElementById('nameInput');
    if (nameInput) nameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleNameSubmit();
    });

    const taskInput = document.getElementById('taskInput');
    if (taskInput) taskInput.addEventListener('keypress', handleEnter);

    const modalBackdrop = document.getElementById('modalBackdrop');
    if (modalBackdrop) modalBackdrop.addEventListener('click', closeModal);

    const newBoardBtn = document.getElementById('newBoardBtn');
    if (newBoardBtn) newBoardBtn.addEventListener('click', () => {
        closeModal();
        openNameModal("New Board Name?", (name) => addNewBoard(name));
    });

    const deleteBoardBtn = document.getElementById('deleteBoardBtn');
    if (deleteBoardBtn) deleteBoardBtn.addEventListener('click', () => {
        closeModal();
        deleteActiveBoard();
    });

    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', closeModal);

    const taskLists = document.querySelectorAll('.task-list');
    taskLists.forEach(list => {
        list.addEventListener('dragover', allowDrop);
        list.addEventListener('drop', drop);
    });
});
