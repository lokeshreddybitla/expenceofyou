// Shared logic

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}

function getCategoryBadge(category) {
    const validCategories = ['Food', 'Transport', 'Shopping', 'Utilities', 'Health', 'Entertainment', 'Other'];
    const safeCategory = validCategories.includes(category) ? category : 'Other';
    return `<span class="badge badge-${safeCategory.toLowerCase()}">${safeCategory}</span>`;
}

// --- Settings Logic --- //
function initSettings() {
    const settingsBtn = document.getElementById('nav-settings');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettings = document.getElementById('close-settings');
    const settingsForm = document.getElementById('settings-form');
    const apiKeyInput = document.getElementById('api-key-input');

    if (settingsBtn && settingsModal) {
        settingsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            apiKeyInput.value = localStorage.getItem('anthropic_api_key') || '';
            settingsModal.classList.remove('hidden');
        });

        closeSettings.addEventListener('click', () => {
            settingsModal.classList.add('hidden');
        });

        settingsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const key = apiKeyInput.value.trim();
            if (key) {
                localStorage.setItem('anthropic_api_key', key);
            } else {
                localStorage.removeItem('anthropic_api_key');
            }
            settingsModal.classList.add('hidden');
            alert('Settings saved!');
        });
    }
}

document.addEventListener('DOMContentLoaded', initSettings);

// --- Dashboard Logic --- //

let allExpenses = [];

async function initDashboard() {
    if (!document.getElementById('expenses-table')) return;
    
    await fetchExpenses();
    setupDashboardEventListeners();
}

async function fetchExpenses() {
    try {
        const res = await fetch('/api/expenses');
        if (!res.ok) throw new Error('Failed to fetch expenses');
        allExpenses = await res.json();
        renderDashboard();
    } catch (e) {
        console.error(e);
    }
}

function renderDashboard() {
    const filterMonth = document.getElementById('filter-month').value;
    const filterCategory = document.getElementById('filter-category').value;
    
    let filtered = allExpenses;
    
    if (filterMonth) {
        filtered = filtered.filter(e => e.date.startsWith(filterMonth));
    }
    
    if (filterCategory && filterCategory !== 'All') {
        filtered = filtered.filter(e => e.category === filterCategory);
    }
    
    // Update Cards
    const total = filtered.reduce((sum, e) => sum + Number(e.amount), 0);
    document.getElementById('total-spent').textContent = formatCurrency(total);
    
    // This month total
    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthTotal = allExpenses
        .filter(e => e.date.startsWith(currentMonth))
        .reduce((sum, e) => sum + Number(e.amount), 0);
    document.getElementById('month-spent').textContent = formatCurrency(monthTotal);
    
    // Top category
    const catTotals = {};
    filtered.forEach(e => {
        catTotals[e.category] = (catTotals[e.category] || 0) + Number(e.amount);
    });
    const topCat = Object.keys(catTotals).sort((a, b) => catTotals[b] - catTotals[a])[0];
    document.getElementById('top-category').innerHTML = topCat ? getCategoryBadge(topCat) : '-';
    
    // Render Table
    const tbody = document.getElementById('expenses-tbody');
    const emptyState = document.getElementById('empty-state');
    
    tbody.innerHTML = '';
    
    if (filtered.length === 0) {
        emptyState.classList.remove('hidden');
    } else {
        emptyState.classList.add('hidden');
        filtered.forEach(e => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${e.date}</td>
                <td>
                    <div>${e.merchant}</div>
                    ${e.notes ? `<div style="font-size:0.75rem; color:var(--text-secondary)">${e.notes}</div>` : ''}
                </td>
                <td>${getCategoryBadge(e.category)}</td>
                <td class="amount-cell">${formatCurrency(e.amount)}</td>
                <td>
                    <button class="delete-btn" onclick="deleteExpense('${e.id}')">
                        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
}

function setupDashboardEventListeners() {
    document.getElementById('filter-month').addEventListener('change', renderDashboard);
    document.getElementById('filter-category').addEventListener('change', renderDashboard);
    
    const modal = document.getElementById('manual-modal');
    document.getElementById('btn-add-manual').addEventListener('click', () => {
        modal.classList.remove('hidden');
        document.getElementById('add-date').value = new Date().toISOString().slice(0, 10);
    });
    
    document.getElementById('close-modal').addEventListener('click', () => {
        modal.classList.add('hidden');
    });
    
    document.getElementById('add-expense-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const expense = {
            amount: parseFloat(document.getElementById('add-amount').value),
            merchant: document.getElementById('add-merchant').value,
            category: document.getElementById('add-category').value,
            date: document.getElementById('add-date').value,
            notes: document.getElementById('add-notes').value
        };
        
        try {
            const res = await fetch('/api/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(expense)
            });
            
            if (res.ok) {
                modal.classList.add('hidden');
                document.getElementById('add-expense-form').reset();
                await fetchExpenses();
            }
        } catch (err) {
            console.error('Error adding expense:', err);
        }
    });
}

async function deleteExpense(id) {
    if (!confirm('Are you sure you want to delete this expense?')) return;
    
    try {
        const res = await fetch(`/api/expense/${id}`, { method: 'DELETE' });
        if (res.ok) {
            await fetchExpenses();
        }
    } catch (e) {
        console.error('Failed to delete', e);
    }
}

// --- Upload Logic --- //

let aiExtractedItems = [];

function initUploadPage() {
    if (!document.getElementById('file-upload')) return;
    
    const fileInput = document.getElementById('file-upload');
    const uploadArea = document.getElementById('upload-area');
    
    fileInput.addEventListener('change', handleFileUpload);
    
    // Drag & Drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--accent)';
        uploadArea.style.background = 'rgba(59, 130, 246, 0.05)';
    });
    
    uploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--border)';
        uploadArea.style.background = 'rgba(0, 0, 0, 0.2)';
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--border)';
        uploadArea.style.background = 'rgba(0, 0, 0, 0.2)';
        
        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            handleFileUpload();
        }
    });
    
    // Confirm Form
    document.getElementById('confirm-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const expense = {
            amount: parseFloat(document.getElementById('preview-amount').value),
            merchant: document.getElementById('preview-merchant').value,
            category: document.getElementById('preview-category').value,
            date: document.getElementById('preview-date').value,
            notes: document.getElementById('preview-notes').value,
            items: aiExtractedItems
        };
        
        try {
            const res = await fetch('/api/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(expense)
            });
            
            if (res.ok) {
                window.location.href = '/';
            }
        } catch (err) {
            showError('Failed to save expense.');
        }
    });
    
    document.getElementById('btn-cancel').addEventListener('click', () => {
        resetUploadState();
    });
}

async function handleFileUpload() {
    const fileInput = document.getElementById('file-upload');
    const file = fileInput.files[0];
    if (!file) return;
    
    const uploadArea = document.getElementById('upload-area');
    const loadingState = document.getElementById('loading-state');
    const previewSection = document.getElementById('preview-section');
    const errorAlert = document.getElementById('error-alert');
    
    errorAlert.classList.add('hidden');
    uploadArea.classList.add('hidden');
    loadingState.classList.remove('hidden');
    previewSection.classList.add('hidden');
    
    const formData = new FormData();
    formData.append('file', file);
    
    const userApiKey = localStorage.getItem('anthropic_api_key');
    if (userApiKey) {
        formData.append('api_key', userApiKey);
    }
    
    try {
        const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.detail || 'Upload failed');
        }
        
        const data = await res.json();
        
        // Populate form
        document.getElementById('preview-amount').value = data.amount || '';
        document.getElementById('preview-merchant').value = data.merchant || '';
        document.getElementById('preview-date').value = data.date || new Date().toISOString().slice(0, 10);
        document.getElementById('preview-notes').value = data.notes || '';
        
        // Match category
        const select = document.getElementById('preview-category');
        const catValue = (data.category || '').charAt(0).toUpperCase() + (data.category || '').slice(1).toLowerCase();
        let matched = false;
        for (let i = 0; i < select.options.length; i++) {
            if (select.options[i].value === catValue) {
                select.selectedIndex = i;
                matched = true;
                break;
            }
        }
        if (!matched) select.value = 'Other';
        
        // Line items
        aiExtractedItems = data.items || [];
        const itemsContainer = document.getElementById('line-items-container');
        const itemsList = document.getElementById('line-items-list');
        itemsList.innerHTML = '';
        
        if (aiExtractedItems.length > 0) {
            itemsContainer.classList.remove('hidden');
            aiExtractedItems.forEach(item => {
                const li = document.createElement('li');
                li.innerHTML = `<span>${item.name || 'Item'}</span> <span>${formatCurrency(item.amount || 0)}</span>`;
                itemsList.appendChild(li);
            });
        } else {
            itemsContainer.classList.add('hidden');
        }
        
        loadingState.classList.add('hidden');
        previewSection.classList.remove('hidden');
        
    } catch (err) {
        console.error(err);
        loadingState.classList.add('hidden');
        showError(err.message || 'An error occurred while analyzing the bill.');
        uploadArea.classList.remove('hidden');
    }
    
    // Clear input
    fileInput.value = '';
}

function showError(msg) {
    const errorAlert = document.getElementById('error-alert');
    document.getElementById('error-text').textContent = msg;
    errorAlert.classList.remove('hidden');
}

function resetUploadState() {
    document.getElementById('upload-area').classList.remove('hidden');
    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('preview-section').classList.add('hidden');
    document.getElementById('error-alert').classList.add('hidden');
    aiExtractedItems = [];
}
