const API_URL = 'http://127.0.0.1:3000';

let APP_DATA = {
    inventory: [],
    sales: [],
    expenses: [],
    customers: [],
    invoices: [],
    settings: JSON.parse(localStorage.getItem('ebu_footer_settings')) || {}
};

async function apiFetch(endpoint, options = {}) {
    const token = localStorage.getItem('ebu_token');
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    try {
        const response = await fetch(`${API_URL}/api${endpoint}`, { ...options, headers });
        if (!response.ok) {
            if (response.status === 401) {
                localStorage.removeItem('ebu_current_user');
                localStorage.removeItem('ebu_token');
                window.location.href = 'login.html';
                return;
            }
            throw new Error(`API Error: ${response.statusText}`);
        }
        return await response.json();
    } catch (err) {
        console.error('Fetch Error:', err);
        return null;
    }
}

async function fetchAppData() {
    try {
        const [inventory, sales, expenses, customers, invoices] = await Promise.all([
            apiFetch('/inventory'),
            apiFetch('/sales'),
            apiFetch('/expenses'),
            apiFetch('/customers'),
            apiFetch('/invoices')
        ]);
        
        if (inventory) APP_DATA.inventory = inventory;
        if (sales) APP_DATA.sales = sales;
        if (expenses) APP_DATA.expenses = expenses;
        if (customers) APP_DATA.customers = customers;
        if (invoices) APP_DATA.invoices = invoices;
        
        console.log('App Data synced from Backend.');
    } catch (err) {
        console.error('Failed to sync data from backend.');
    }
}

function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Close modal when clicking outside
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', function(e) {
        if (e.target === this) {
            this.classList.remove('active');
        }
    });
});

let currentRow;

function openEditModal(button) {
    currentRow = button.closest('tr');
    const cells = currentRow.cells;
    
    document.getElementById('editProductName').value = cells[0].textContent;
    document.getElementById('editCategory').value = cells[1].textContent;
    document.getElementById('editSerial').value = cells[2].textContent === '-' ? '' : cells[2].textContent;
    document.getElementById('editBuyPrice').value = cells[3].textContent.replace('Rwf ', '').replace(/,/g, '');
    document.getElementById('editSellPrice').value = cells[4].textContent.replace('Rwf ', '').replace(/,/g, '');
    document.getElementById('editStock').value = cells[5].textContent;
    
    openModal('editProductModal');
}

function syncProductsTable() {
    const products = APP_DATA.inventory;
    const tableBody = document.getElementById('productsTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    products.forEach(p => {
        const row = tableBody.insertRow();
        row.dataset.id = p.id;
        const stockNum = parseInt(p.stock);
        const statusClass = stockNum <= 5 ? 'badge-danger' : 'badge-success';
        const statusText = stockNum <= 5 ? 'Low Stock' : 'In Stock';

        row.innerHTML = `
            <td>${p.name}</td>
            <td>${p.category}</td>
            <td>${p.serial}</td>
            <td>${p.buyPrice}</td>
            <td>${p.sellPrice}</td>
            <td>${p.stock}</td>
            <td><span class="badge ${statusClass}">${statusText}</span></td>
            <td>
                <button class="btn btn-edit btn-small" onclick="openEditModal(this)">Edit</button>
                <button class="btn btn-danger btn-small" onclick="deleteProduct(this)"><i class="fas fa-trash"></i></button>
            </td>
        `;
    });
}

// Helper to save products to backend
async function saveProductsToStorage() {
    const tableRows = document.querySelectorAll('#productsTableBody tr');
    if (tableRows.length === 0 && !document.getElementById('products')) return;

    // This UI-to-storage approach is messy, but I'll maintain it for compatibility
    // by ensuring every change in UI is followed by a full refresh.
    // Better: Add/Edit/Delete functions should call API individually.
    
    // For now, I'll update the 'addProduct' and 'updateProduct' logic instead.
}

// Helper to save sales to localStorage and Firebase
function saveSalesToStorage() {
    const tableBody = document.getElementById('salesTableBody');
    if (!tableBody) return;

    const tableRows = tableBody.querySelectorAll('tr');
    const sales = [];
    tableRows.forEach(row => {
        if (row.cells.length < 7) return;
        const sale = {
            id: row.dataset.id || null, // Keep existing ID if present
            date: row.cells[0].textContent,
            customer: row.cells[1].textContent,
            product: row.cells[2].textContent,
            qty: row.cells[3].textContent,
            total: row.cells[4].textContent,
            status: row.cells[5].textContent,
            balance: row.cells[6].textContent
        };
        sales.push(sale);
    });
    localStorage.setItem('sales', JSON.stringify(sales));

    syncDashboardStats();
}

// Helper to save expenses to localStorage and Firebase
function saveExpensesToStorage() {
    const tableBody = document.getElementById('expensesTableBody');
    if (!tableBody) return;

    const tableRows = tableBody.querySelectorAll('tr');
    const expenses = [];
    tableRows.forEach(row => {
        if (row.cells.length < 5) return;
        const expense = {
            id: row.dataset.id || null,
            date: row.cells[0].textContent,
            category: row.cells[1].textContent,
            description: row.cells[2].textContent,
            amount: row.cells[3].textContent,
            status: row.cells[4].textContent
        };
        expenses.push(expense);
    });
    localStorage.setItem('expenses', JSON.stringify(expenses));

    syncDashboardStats();
}

function syncExpensesTable() {
    const expenses = APP_DATA.expenses;
    const tableBody = document.getElementById('expensesTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    expenses.forEach(e => {
        if (e.is_deleted == 1) return;
        const row = tableBody.insertRow();
        if (e.id) row.dataset.id = e.id;
        
        let badgeClass = 'badge-success';
        let actionBtn = `<button class="btn btn-edit btn-small" onclick="openEditExpenseModal(this)">Edit</button>`;
        
        if (e.status === 'Pending') {
            badgeClass = 'badge-danger';
            actionBtn += ` <button class="btn btn-success btn-small" onclick="markExpenseAsPaid(this)">Mark Paid</button>`;
        } else if (e.status === 'Partial') {
            badgeClass = 'badge-warning';
            actionBtn += ` <button class="btn btn-success btn-small" onclick="markExpenseAsPaid(this)">Mark Paid</button>`;
        }
        actionBtn += ` <button class="btn btn-danger btn-small" onclick="deleteExpense(this)"><i class="fas fa-trash"></i></button>`;

        const totalNum = parseInt(e.amount.replace('Rwf ', '').replace(/,/g, '')) || 0;
        const balanceNum = parseInt((e.balance || '0').replace('Rwf ', '').replace(/,/g, '')) || 0;
        const paid = 'Rwf ' + (totalNum - balanceNum).toLocaleString();

        row.innerHTML = `
            <td>${e.date}</td>
            <td>${e.category}</td>
            <td>${e.description}</td>
            <td>${e.amount}</td>
            <td style="color: #27ae60;">${paid}</td>
            <td><span class="badge ${badgeClass}">${e.status}</span></td>
            <td style="color: ${balanceNum > 0 ? '#e74c3c' : '#27ae60'}; font-weight: 600;">${e.balance || 'Rwf 0'}</td>
            <td>${actionBtn}</td>
        `;
    });
}

function syncInvoicesTable() {
    const invoices = APP_DATA.invoices;
    const tableBody = document.getElementById('invoicesTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    invoices.forEach(inv => {
        const row = tableBody.insertRow();
        if (inv.id) row.dataset.id = inv.id;
        const badgeClass = inv.status === 'Paid' ? 'badge-success' : 'badge-danger';
        
        row.innerHTML = `
            <td>${inv.no}</td>
            <td>${inv.date}</td>
            <td>${inv.customer}</td>
            <td>${inv.amount}</td>
            <td><span class="badge ${badgeClass}">${inv.status}</span></td>
            <td>
                <button class="btn btn-secondary btn-small" onclick="viewInvoice(this)">View</button>
                <button class="btn btn-edit btn-small" onclick="openEditInvoiceModal(this)">Edit</button>
                <button class="btn btn-danger btn-small" onclick="deleteInvoice(this)"><i class="fas fa-trash"></i></button>
            </td>
        `;
    });
}

function syncDashboardStats() {
    const plArea = document.getElementById('plContentArea');
    const timeFilter = document.getElementById('plTimeFilter')?.value || 'all';
    
    // Update Dynamic Titles
    const plTitle = document.querySelector('#plContentArea h1');
    const dateSubText = document.getElementById('plDateRange');
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    let dateLabel = '';
    if (timeFilter === 'day') {
        dateLabel = `for Today (${now.toDateString()})`;
        if (plTitle) plTitle.textContent = 'Daily Profit & Loss';
    } else if (timeFilter === 'week') {
        const start = new Date(today); start.setDate(today.getDate() - today.getDay());
        dateLabel = `from ${start.toDateString()} to Today`;
        if (plTitle) plTitle.textContent = 'Weekly Profit & Loss';
    } else if (timeFilter === 'month') {
        dateLabel = `for ${now.toLocaleString('default', { month: 'long' })} ${now.getFullYear()}`;
        if (plTitle) plTitle.textContent = 'Monthly Profit & Loss';
    } else if (timeFilter === 'year') {
        dateLabel = `for the Year ${now.getFullYear()}`;
        if (plTitle) plTitle.textContent = 'Annual Profit & Loss';
    } else {
        dateLabel = 'for All Time';
        if (plTitle) plTitle.textContent = 'Business Intelligence: Profit & Loss';
    }
    
    if (dateSubText) dateSubText.textContent = dateLabel;
    if (plArea) plArea.setAttribute('data-date', new Date().toLocaleString());
    
    const rawSales = APP_DATA.sales;
    const rawExpenses = APP_DATA.expenses;
    const inventory = APP_DATA.inventory;
    
    const filterByTime = (dataDateStr) => {
        if (timeFilter === 'all') return true;
        const recordDate = new Date(dataDateStr);
        const recordDay = new Date(recordDate.getFullYear(), recordDate.getMonth(), recordDate.getDate());
        
        if (timeFilter === 'day') return recordDay.getTime() === today.getTime();
        if (timeFilter === 'week') {
            // Week starts on Sunday (0) and ends on Saturday (6)
            const startOfWeek = new Date(today);
            startOfWeek.setDate(today.getDate() - today.getDay());
            return recordDay >= startOfWeek && recordDay <= today;
        }
        if (timeFilter === 'month') return recordDate.getMonth() === today.getMonth() && recordDate.getFullYear() === today.getFullYear();
        if (timeFilter === 'year') return recordDate.getFullYear() === today.getFullYear();
        return true;
    };

    const sales = rawSales.filter(s => filterByTime(s.date));
    const expenses = rawExpenses.filter(e => filterByTime(e.date));

    // Calculate totals
    const totalSales = sales.reduce((sum, s) => sum + parseInt(s.total.replace('Rwf ', '').replace(/,/g, '')), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + parseInt(e.amount.replace('Rwf ', '').replace(/,/g, '')), 0);
    const totalProfit = totalSales - totalExpenses;
    
    const lowStockCount = inventory.filter(p => parseInt(p.stock) <= 5).length;
    const pendingPaymentCount = rawSales.filter(s => (s.status === 'Pending' || s.status === 'Partial') && s.is_deleted != 1).length;
    const pendingExpenseCount = rawExpenses.filter(e => e.status === 'Pending' && e.is_deleted != 1).length;
    const totalAlerts = lowStockCount + pendingPaymentCount + pendingExpenseCount;

    // Update Dashboard (index.html)
    const salesStat = document.querySelector('.card-sales .stat-value');
    if (salesStat) salesStat.textContent = 'Rwf ' + totalSales.toLocaleString();
    
    const profitStat = document.querySelector('.card-profit .stat-value');
    if (profitStat) profitStat.textContent = 'Rwf ' + totalProfit.toLocaleString();
    
    const productStat = document.querySelector('.card-products .stat-value');
    if (productStat) productStat.textContent = inventory.length;
    
    const alertStat = document.querySelector('.card-alerts .stat-value');
    if (alertStat) alertStat.textContent = totalAlerts;

    // Update Recent Transactions (index.html)
    const recentTableBody = document.getElementById('recentTransactionsBody');
    if (recentTableBody) {
        recentTableBody.innerHTML = '';
        // Sort by date (descending) and take top 5
        const recentSales = [...rawSales].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
        
        recentSales.forEach(sale => {
            const row = document.createElement('tr');
            let badgeClass = 'badge-success';
            if (sale.status === 'Pending') badgeClass = 'badge-danger';
            if (sale.status === 'Partial') badgeClass = 'badge-warning';

            const totalNum = parseInt(sale.total.replace('Rwf ', '').replace(/,/g, '')) || 0;
            const balanceNum = parseInt(sale.balance.replace('Rwf ', '').replace(/,/g, '')) || 0;
            const paid = 'Rwf ' + (totalNum - balanceNum).toLocaleString();

            row.innerHTML = `
                <td>${sale.date}</td>
                <td>${sale.product}</td>
                <td>${sale.qty}</td>
                <td>${sale.total}</td>
                <td style="color: #27ae60;">${paid}</td>
                <td style="color: ${balanceNum > 0 ? '#e74c3c' : '#27ae60'}; font-weight: 600;">${sale.balance}</td>
                <td><span class="badge ${badgeClass}">${sale.status}</span></td>
            `;
            recentTableBody.appendChild(row);
        });

        if (recentSales.length === 0) {
            recentTableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px; color: #64748b;">No recent transactions</td></tr>';
        }
    }

    // Update P&L (profitloss.html)
    const plIncome = document.querySelector('#profitloss .stat-card:nth-child(1) .stat-value');
    if (plIncome) plIncome.textContent = 'Rwf ' + totalSales.toLocaleString();
    
    const plExpenses = document.querySelector('#profitloss .stat-card:nth-child(2) .stat-value');
    if (plExpenses) plExpenses.textContent = 'Rwf ' + totalExpenses.toLocaleString();
    
    const plProfit = document.querySelector('#profitloss .stat-card:nth-child(3) .stat-value');
    if (plProfit) {
        plProfit.textContent = 'Rwf ' + totalProfit.toLocaleString();
        plProfit.style.color = totalProfit >= 0 ? '#27ae60' : '#e74c3c';
    }

    // --- Product-wise Profit Logic ---
    const productProfitTable = document.getElementById('productProfitTable');
    if (productProfitTable) {
        productProfitTable.innerHTML = '';
        const productStats = {};

        sales.forEach(s => {
            if (!productStats[s.product]) {
                productStats[s.product] = { qty: 0, revenue: 0, cost: 0 };
            }
            const qty = parseInt(s.qty);
            const revenue = parseInt(s.total.replace('Rwf ', '').replace(/,/g, ''));
            
            // Find cost from inventory
            const invItem = inventory.find(p => p.name === s.product);
            const unitCost = invItem ? parseInt(invItem.buyPrice.replace('Rwf ', '').replace(/,/g, '')) : 0;
            
            productStats[s.product].qty += qty;
            productStats[s.product].revenue += revenue;
            productStats[s.product].cost += (unitCost * qty);
        });

        Object.keys(productStats).forEach(name => {
            const stats = productStats[name];
            const profit = stats.revenue - stats.cost;
            const margin = stats.revenue > 0 ? ((profit / stats.revenue) * 100).toFixed(1) : 0;
            
            const invItem = inventory.find(p => p.name === name);
            const currentStock = invItem ? parseInt(invItem.stock) : 0;
            const originalStock = currentStock + stats.qty;
            
            const row = productProfitTable.insertRow();
            row.innerHTML = `
                <td>${name}</td>
                <td>${originalStock}</td>
                <td>${stats.qty}</td>
                <td><strong style="color: ${currentStock <= 5 ? '#e74c3c' : '#333'}">${currentStock}</strong></td>
                <td>Rwf ${stats.revenue.toLocaleString()}</td>
                <td>Rwf ${stats.cost.toLocaleString()}</td>
                <td style="color: ${profit >= 0 ? '#27ae60' : '#e74c3c'}">Rwf ${profit.toLocaleString()}</td>
                <td>${margin}%</td>
            `;
        });
    }

    // --- Monthly Summary Table Logic ---
    const monthlySummaryTable = document.getElementById('monthlySummaryTable');
    if (monthlySummaryTable) {
        monthlySummaryTable.innerHTML = '';
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const monthlyData = {};

        // Process all sales for the current year
        rawSales.filter(s => new Date(s.date).getFullYear() === today.getFullYear()).forEach(s => {
            const month = new Date(s.date).getMonth();
            if (!monthlyData[month]) monthlyData[month] = { revenue: 0, expenses: 0 };
            monthlyData[month].revenue += parseInt(s.total.replace('Rwf ', '').replace(/,/g, '')) || 0;
        });

        // Process all expenses for the current year
        rawExpenses.filter(e => new Date(e.date).getFullYear() === today.getFullYear()).forEach(e => {
            const month = new Date(e.date).getMonth();
            if (!monthlyData[month]) monthlyData[month] = { revenue: 0, expenses: 0 };
            monthlyData[month].expenses += parseInt(e.amount.replace('Rwf ', '').replace(/,/g, '')) || 0;
        });

        // Fill table (Sort by month index)
        Object.keys(monthlyData).sort((a, b) => b - a).forEach(monthIdx => {
            const m = monthlyData[monthIdx];
            const net = m.revenue - m.expenses;
            const row = monthlySummaryTable.insertRow();
            row.innerHTML = `
                <td>${monthNames[monthIdx]}</td>
                <td>Rwf ${m.revenue.toLocaleString()}</td>
                <td>Rwf ${m.expenses.toLocaleString()}</td>
                <td style="color: ${net >= 0 ? '#27ae60' : '#e74c3c'}; font-weight: 600;">Rwf ${net.toLocaleString()}</td>
                <td><span class="badge ${net >= 0 ? 'badge-success' : 'badge-danger'}">${net >= 0 ? 'Profit' : 'Loss'}</span></td>
            `;
        });
        
        if (Object.keys(monthlyData).length === 0) {
            monthlySummaryTable.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px; color: #64748b;">No monthly data found for this year</td></tr>';
        }
    }

}

// Helper to load products into Sales/Invoices dropdowns
function populateProductDropdowns() {
    const products = APP_DATA.inventory;
    const dropdowns = ['saleProduct', 'invProduct', 'editSaleProduct'];
    
    dropdowns.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            // Keep the first default option
            const firstOption = select.options[0];
            select.innerHTML = '';
            select.appendChild(firstOption);
            
            products.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.name;
                opt.textContent = p.name;
                select.appendChild(opt);
            });
        }
    });
}

function saveProduct() {
    if (!currentRow) return;
    
    const name = document.getElementById('editProductName').value;
    const category = document.getElementById('editCategory').value;
    const serial = document.getElementById('editSerial').value || '-';
    const buyPrice = document.getElementById('editBuyPrice').value;
    const sellPrice = document.getElementById('editSellPrice').value;
    const stock = document.getElementById('editStock').value;
    
    const cells = currentRow.cells;
    cells[0].textContent = name;
    cells[1].textContent = category;
    cells[2].textContent = serial;
    cells[3].textContent = 'Rwf ' + parseInt(buyPrice).toLocaleString();
    cells[4].textContent = 'Rwf ' + parseInt(sellPrice).toLocaleString();
    cells[5].textContent = stock;
    
    // Update status badge based on stock
    const statusBadge = cells[6].querySelector('.badge');
    if (stock <= 5) {
        statusBadge.className = 'badge badge-danger';
        statusBadge.textContent = 'Low Stock';
    } else {
        statusBadge.className = 'badge badge-success';
        statusBadge.textContent = 'In Stock';
    }
    
    saveProductsToStorage();
    closeModal('editProductModal');
}

async function addProduct() {
    const name = document.getElementById('addProductName').value;
    const category = document.getElementById('addCategory').value;
    const serial = document.getElementById('addSerial').value || '-';
    const buyPrice = document.getElementById('addBuyPrice').value;
    const sellPrice = document.getElementById('addSellPrice').value;
    const stock = document.getElementById('addStock').value;
    
    if (!name || !category || !buyPrice || !sellPrice || !stock) {
        alert('Please fill in all fields');
        return;
    }
    
    const product = { name, category, serial, buyPrice, sellPrice, stock };
    const result = await apiFetch('/inventory', {
        method: 'POST',
        body: JSON.stringify(product)
    });
    
    if (result) {
        await refreshAllUI();
        document.getElementById('addProductForm').reset();
        closeModal('addProductModal');
    }
}

async function saveProduct() {
    if (!currentRow) return;
    const id = currentRow.dataset.id;
    const name = document.getElementById('editProductName').value;
    const category = document.getElementById('editCategory').value;
    const serial = document.getElementById('editSerial').value || '-';
    const buyPrice = document.getElementById('editBuyPrice').value;
    const sellPrice = document.getElementById('editSellPrice').value;
    const stock = document.getElementById('editStock').value;

    const product = { name, category, serial, buyPrice, sellPrice, stock };
    const result = await apiFetch(`/inventory/${id}`, {
        method: 'PUT',
        body: JSON.stringify(product)
    });

    if (result) {
        await refreshAllUI();
        closeModal('editProductModal');
    }
}

async function deleteProduct(button) {
    if (confirm('Are you sure you want to delete this product?')) {
        const row = button.closest('tr');
        const id = row.dataset.id;
        const result = await apiFetch(`/inventory/${id}`, { method: 'DELETE' });
        if (result) await refreshAllUI();
    }
}

function openEditSaleModal(button) {
    currentRow = button.closest('tr');
    const cells = currentRow.cells;
    
    document.getElementById('editSaleDate').value = cells[0].textContent;
    document.getElementById('editSaleCustomer').value = cells[1].textContent;
    document.getElementById('editSaleProduct').value = cells[2].textContent;
    document.getElementById('editSaleQty').value = cells[3].textContent;
    const total = parseInt(cells[4].textContent.replace('Rwf ', '').replace(/,/g, ''));
    const balance = parseInt(cells[6].textContent.replace('Rwf ', '').replace(/,/g, ''));
    document.getElementById('editSaleTotal').value = total;
    document.getElementById('editSaleBalance').value = balance;
    document.getElementById('editSalePaidAmount').value = total - balance;
    
    const status = cells[5].textContent;
    document.getElementById('editSaleStatus').value = status;
    
    openModal('editSaleModal');
}

async function deleteSale(button) {
    if (confirm('Move to Recycle Bin?')) {
        const row = button.closest('tr');
        const id = row.dataset.id;
        const result = await apiFetch(`/sales/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ is_deleted: 1 })
        });
        if (result) await refreshAllUI();
    }
}

function calculateEditSaleTotal() {
    const productName = document.getElementById('editSaleProduct').value;
    const qty = document.getElementById('editSaleQty').value || 0;
    const products = APP_DATA.inventory;
    
    const product = products.find(p => p.name === productName);
    if (product) {
        const price = parseInt(product.sellPrice.replace('Rwf ', '').replace(/,/g, ''));
        const total = price * qty;
        document.getElementById('editSaleTotal').value = total;
        calculateEditBalance();
    }
}

function calculateSaleTotal() {
    const productName = document.getElementById('saleProduct').value;
    const qty = document.getElementById('saleQty').value || 0;
    const products = APP_DATA.inventory;
    
    const product = products.find(p => p.name === productName);
    if (product) {
        const price = parseInt(product.sellPrice.replace('Rwf ', '').replace(/,/g, ''));
        const total = price * qty;
        document.getElementById('saleTotal').value = total;
        
        // Auto-fill paid amount if status is 'Paid'
        const status = document.getElementById('saleStatus').value;
        if (status === 'Paid') {
            document.getElementById('saleAmountPaid').value = total;
        }
        
        calculateBalance();
    }
}

function calculateBalance() {
    const total = document.getElementById('saleTotal').value || 0;
    const paid = document.getElementById('saleAmountPaid').value || 0;
    const balance = total - paid;
    document.getElementById('saleBalance').value = balance > 0 ? balance : 0;
    
    // Auto-update status based on balance
    const statusSelect = document.getElementById('saleStatus');
    if (balance <= 0 && total > 0) {
        statusSelect.value = 'Paid';
    } else if (paid > 0) {
        statusSelect.value = 'Partial';
    } else {
        statusSelect.value = 'Pending';
    }
}

function updateBalanceFromPaid() {
    const total = document.getElementById('saleTotal').value || 0;
    const status = document.getElementById('saleStatus').value;
    const paidInput = document.getElementById('saleAmountPaid');
    const balanceInput = document.getElementById('saleBalance');
    
    if (status === 'Paid') {
        paidInput.value = total;
        balanceInput.value = 0;
    } else if (status === 'Pending') {
        paidInput.value = 0;
        balanceInput.value = total;
    }
}

function calculateEditBalance() {
    const total = document.getElementById('editSaleTotal').value || 0;
    const paid = document.getElementById('editSalePaidAmount').value || 0;
    const balance = total - paid;
    document.getElementById('editSaleBalance').value = balance > 0 ? balance : 0;
    
    // Auto-update status
    const statusSelect = document.getElementById('editSaleStatus');
    if (balance <= 0 && total > 0) {
        statusSelect.value = 'Paid';
    } else if (paid > 0) {
        statusSelect.value = 'Partial';
    } else {
        statusSelect.value = 'Pending';
    }
}

function updateEditBalanceFromPaid() {
    const total = document.getElementById('editSaleTotal').value || 0;
    const status = document.getElementById('editSaleStatus').value;
    const paidInput = document.getElementById('editSalePaidAmount');
    const balanceInput = document.getElementById('editSaleBalance');
    
    if (status === 'Paid') {
        paidInput.value = total;
        balanceInput.value = 0;
    } else if (status === 'Pending') {
        paidInput.value = 0;
        balanceInput.value = total;
    }
}

async function saveSale() {
    if (!currentRow) return;
    const id = currentRow.dataset.id;
    const date = document.getElementById('editSaleDate').value;
    const customer = document.getElementById('editSaleCustomer').value;
    const product = document.getElementById('editSaleProduct').value;
    const qty = document.getElementById('editSaleQty').value;
    const total = document.getElementById('editSaleTotal').value;
    let status = document.getElementById('editSaleStatus').value;
    let balance = document.getElementById('editSaleBalance').value || 0;

    if (status === 'Paid') balance = 0;

    const sale = { 
        date, 
        customer, 
        product, 
        qty, 
        total: 'Rwf ' + parseInt(total).toLocaleString(), 
        status, 
        balance: 'Rwf ' + parseInt(balance).toLocaleString() 
    };

    const result = await apiFetch(`/sales/${id}`, {
        method: 'PUT',
        body: JSON.stringify(sale)
    });

    if (result) {
        await refreshAllUI();
        closeModal('editSaleModal');
    }
}

async function addSale() {
    const productName = document.getElementById('saleProduct').value;
    const customer = document.getElementById('saleCustomer').value || 'Walk-in';
    const qty = parseInt(document.getElementById('saleQty').value);
    const date = document.getElementById('saleDate').value;
    const total = document.getElementById('saleTotal').value;
    const status = document.getElementById('saleStatus').value;
    const balance = document.getElementById('saleBalance').value || 0;
    
    if (productName === 'Select product' || !qty || !date || !total) {
        alert('Please fill in all required fields');
        return;
    }

    // Check stock before sale
    const product = APP_DATA.inventory.find(p => p.name === productName);
    if (product) {
        const availableStock = parseInt(product.stock);
        if (qty > availableStock) {
            alert(`⚠️ Warning: Not enough stock! \n\nAvailable: ${availableStock}\nRequested: ${qty}\n\nPlease reduce the quantity or restock the product.`);
            return;
        }
    }

    const sale = { date, customer, product: productName, qty, total: 'Rwf ' + parseInt(total).toLocaleString(), status, balance: 'Rwf ' + parseInt(balance).toLocaleString() };
    const result = await apiFetch('/sales', {
        method: 'POST',
        body: JSON.stringify(sale)
    });

    if (result) {
        // Also update stock in backend (This should ideally be a single atomic transaction in backend)
        const product = APP_DATA.inventory.find(p => p.name === productName);
        if (product) {
            const newStock = parseInt(product.stock) - qty;
            await apiFetch(`/inventory/${product.id}`, {
                method: 'PUT',
                body: JSON.stringify({ ...product, stock: newStock.toString() })
            });
        }
        await refreshAllUI();
        document.getElementById('addSalesForm').reset();
        closeModal('addSalesModal');
    }
}

function syncSalesTable() {
    const sales = APP_DATA.sales;
    const tableBody = document.getElementById('salesTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    sales.forEach(s => {
        if (s.is_deleted == 1) return;
        const row = tableBody.insertRow();
        if (s.id) row.dataset.id = s.id;
        
        let badgeClass = 'badge-success';
        let actionBtn = `<button class="btn btn-edit btn-small" onclick="openEditSaleModal(this)">Edit</button>`;
        
        if (s.status === 'Pending') {
            badgeClass = 'badge-danger';
            actionBtn += ` <button class="btn btn-success btn-small" onclick="markSaleAsPaid(this)">Mark Paid</button>`;
        } else if (s.status === 'Partial') {
            badgeClass = 'badge-warning';
            actionBtn += ` <button class="btn btn-success btn-small" onclick="markSaleAsPaid(this)">Mark Paid</button>`;
        }
        
        actionBtn += ` <button class="btn btn-danger btn-small" onclick="deleteSale(this)"><i class="fas fa-trash"></i></button>`;

        row.innerHTML = `
            <td>${s.date}</td>
            <td><a href="customers.html" style="color: #2563eb; text-decoration: none; font-weight: 500;">${s.customer}</a></td>
            <td><a href="products.html" style="color: #2563eb; text-decoration: none; font-weight: 500;">${s.product}</a></td>
            <td>${s.qty}</td>
            <td>${s.total}</td>
            <td><span class="badge ${badgeClass}">${s.status}</span></td>
            <td>${s.balance}</td>
            <td>${actionBtn}</td>
        `;
    });
}

function syncCustomerList() {
    const tableBody = document.getElementById('customerTableBody');
    if (!tableBody) return;

    const sales = APP_DATA.sales;
    const salesStats = {};
    sales.forEach(s => {
        if (s.customer === 'Walk-in' || !s.customer) return;
        if (!salesStats[s.customer]) salesStats[s.customer] = { spent: 0, history: [] };
        const amount = parseInt(s.total ? s.total.replace('Rwf ', '').replace(/,/g, '') : 0);
        salesStats[s.customer].spent += amount;
        const item = `${s.product} (${s.date})`;
        if (!salesStats[s.customer].history.includes(item)) salesStats[s.customer].history.push(item);
    });

    const customers = APP_DATA.customers;
    tableBody.innerHTML = '';
    
    customers.forEach(c => {
        const row = tableBody.insertRow();
        if (c.id) row.dataset.id = c.id;
        
        const stats = salesStats[c.name] || { spent: 0, history: [] };
        const spent = Math.max(parseInt(c.totalSpent ? c.totalSpent.replace('Rwf ', '').replace(/,/g, '') : 0), stats.spent);
        const history = stats.history.length > 0 ? stats.history.join(', ') : (c.history !== '-' ? c.history : '-');

        row.innerHTML = `
            <td>${c.name}</td>
            <td>${c.phone}</td>
            <td>${history}</td>
            <td>Rwf ${spent.toLocaleString()}</td>
            <td>
                <button class="btn btn-edit btn-small" onclick="openEditCustomerModal(this)">Edit</button>
                <button class="btn btn-danger btn-small" onclick="deleteCustomer(this)"><i class="fas fa-trash"></i></button>
            </td>
        `;
    });
}

async function markSaleAsPaid(button) {
    const row = button.closest('tr');
    const id = row.dataset.id;
    
    // We need the original sale data to keep other fields the same
    const sale = APP_DATA.sales.find(s => s.id == id);
    if (!sale) return;

    const updatedSale = { ...sale, status: 'Paid', balance: 'Rwf 0' };
    const result = await apiFetch(`/sales/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updatedSale)
    });
    
    if (result) await refreshAllUI();
}

function openEditCustomerModal(button) {
    currentRow = button.closest('tr');
    const cells = currentRow.cells;
    document.getElementById('editCustName').value = cells[0].textContent;
    document.getElementById('editCustPhone').value = cells[1].textContent;
    openModal('editCustomerModal');
}

async function saveCustomer() {
    if (!currentRow) return;
    const id = currentRow.dataset.id;
    const name = document.getElementById('editCustName').value;
    const phone = document.getElementById('editCustPhone').value;

    const customer = { name, phone };
    const result = await apiFetch(`/customers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(customer)
    });

    if (result) {
        closeModal('editCustomerModal');
        await refreshAllUI();
    }
}

async function addCustomer() {
    const name = document.getElementById('custName').value;
    const phone = document.getElementById('custPhone').value;
    
    if (!name || !phone) {
        alert('Please fill in name and phone number');
        return;
    }
    
    const customer = { name, phone, history: '-', totalSpent: 'Rwf 0' };
    const result = await apiFetch('/customers', {
        method: 'POST',
        body: JSON.stringify(customer)
    });
    
    if (result) {
        await refreshAllUI();
        document.getElementById('addCustomerForm').reset();
        closeModal('addCustomerModal');
    }
}

async function deleteCustomer(button) {
    if (confirm('Are you sure you want to delete this customer?')) {
        const row = button.closest('tr');
        const id = row.dataset.id;
        const result = await apiFetch(`/customers/${id}`, { method: 'DELETE' });
        if (result) await refreshAllUI();
    }
}

async function addExpense() {
    const category = document.getElementById('expCategory').value;
    const desc = document.getElementById('expDesc').value;
    const amount = document.getElementById('expAmount').value;
    const date = document.getElementById('expDate').value;
    const status = document.getElementById('expStatus').value;
    
    if (!desc || !amount || !date || !category) {
        alert('Please fill in all required fields');
        return;
    }
    
    const balance = document.getElementById('expBalance').value || 0;
    const expense = { 
        date, 
        category, 
        description: desc, 
        amount: 'Rwf ' + parseInt(amount).toLocaleString(), 
        status, 
        balance: 'Rwf ' + parseInt(balance).toLocaleString() 
    };
    const result = await apiFetch('/expenses', {
        method: 'POST',
        body: JSON.stringify(expense)
    });
    
    if (result) {
        await refreshAllUI();
        document.getElementById('addExpenseForm').reset();
        closeModal('addExpenseModal');
    }
}

function calculateExpBalance() {
    const total = document.getElementById('expAmount').value || 0;
    const paid = document.getElementById('expAmountPaid').value || 0;
    const balance = total - paid;
    document.getElementById('expBalance').value = balance > 0 ? balance : 0;
    
    const statusSelect = document.getElementById('expStatus');
    if (balance <= 0 && total > 0) statusSelect.value = 'Paid';
    else if (paid > 0) statusSelect.value = 'Partial';
    else statusSelect.value = 'Pending';
}

function updateExpBalanceFromPaid() {
    const total = document.getElementById('expAmount').value || 0;
    const status = document.getElementById('expStatus').value;
    const paidInput = document.getElementById('expAmountPaid');
    const balanceInput = document.getElementById('expBalance');
    if (status === 'Paid') { paidInput.value = total; balanceInput.value = 0; }
    else if (status === 'Pending') { paidInput.value = 0; balanceInput.value = total; }
}

function calculateEditExpBalance() {
    const total = document.getElementById('editExpAmount').value || 0;
    const paid = document.getElementById('editExpPaidAmount').value || 0;
    const balance = total - paid;
    document.getElementById('editExpBalance').value = balance > 0 ? balance : 0;
    
    const statusSelect = document.getElementById('editExpStatus');
    if (balance <= 0 && total > 0) statusSelect.value = 'Paid';
    else if (paid > 0) statusSelect.value = 'Partial';
    else statusSelect.value = 'Pending';
}

function updateEditExpBalanceFromPaid() {
    const total = document.getElementById('editExpAmount').value || 0;
    const status = document.getElementById('editExpStatus').value;
    const paidInput = document.getElementById('editExpPaidAmount');
    const balanceInput = document.getElementById('editExpBalance');
    if (status === 'Paid') { paidInput.value = total; balanceInput.value = 0; }
    else if (status === 'Pending') { paidInput.value = 0; balanceInput.value = total; }
}

function openEditExpenseModal(button) {
    currentRow = button.closest('tr');
    const cells = currentRow.cells;
    
    const total = parseInt(cells[3].textContent.replace('Rwf ', '').replace(/,/g, ''));
    const balance = parseInt(cells[5].textContent.replace('Rwf ', '').replace(/,/g, ''));
    
    document.getElementById('editExpDate').value = cells[0].textContent;
    document.getElementById('editExpCategory').value = cells[1].textContent;
    document.getElementById('editExpDesc').value = cells[2].textContent;
    document.getElementById('editExpAmount').value = total;
    document.getElementById('editExpPaidAmount').value = total - balance;
    document.getElementById('editExpBalance').value = balance;
    
    const status = cells[4].textContent;
    document.getElementById('editExpStatus').value = status;
    
    openModal('editExpenseModal');
}

async function saveExpense() {
    if (!currentRow) return;
    const id = currentRow.dataset.id;
    const date = document.getElementById('editExpDate').value;
    const category = document.getElementById('editExpCategory').value;
    const desc = document.getElementById('editExpDesc').value;
    const amount = document.getElementById('editExpAmount').value;
    let status = document.getElementById('editExpStatus').value;
    let balance = document.getElementById('editExpBalance').value || 0;

    if (status === 'Paid') balance = 0;

    const expense = { 
        date, 
        category, 
        description: desc, 
        amount: 'Rwf ' + parseInt(amount).toLocaleString(), 
        status, 
        balance: 'Rwf ' + parseInt(balance).toLocaleString() 
    };
    const result = await apiFetch(`/expenses/${id}`, {
        method: 'PUT',
        body: JSON.stringify(expense)
    });

    if (result) {
        await refreshAllUI();
        closeModal('editExpenseModal');
    }
}

async function deleteExpense(button) {
    if (confirm('Move to Recycle Bin?')) {
        const row = button.closest('tr');
        const id = row.dataset.id;
        const result = await apiFetch(`/expenses/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ is_deleted: 1 })
        });
        if (result) await refreshAllUI();
    }
}

async function markExpenseAsPaid(button) {
    const row = button.closest('tr');
    const id = row.dataset.id;
    
    const expense = APP_DATA.expenses.find(e => e.id == id);
    if (!expense) return;

    const updatedExp = { ...expense, status: 'Paid', balance: 'Rwf 0' };
    const result = await apiFetch(`/expenses/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updatedExp)
    });
    
    if (result) await refreshAllUI();
}

function saveInvoicesToStorage() {
    const tableBody = document.getElementById('invoicesTableBody');
    if (!tableBody) return;

    const tableRows = tableBody.querySelectorAll('tr');
    const invoices = [];
    tableRows.forEach(row => {
        if (row.cells.length < 5) return;
        const invoice = {
            id: row.dataset.id || null,
            no: row.cells[0].textContent,
            date: row.cells[1].textContent,
            customer: row.cells[2].textContent,
            amount: row.cells[3].textContent,
            status: row.cells[4].textContent,
        };
        invoices.push(invoice);
    });
    localStorage.setItem('invoices', JSON.stringify(invoices));

    // Non-blocking Cloud Sync
    if (window.fbOps) {
        invoices.forEach(async (inv, index) => {
            const resultId = await window.fbOps.saveData("invoices", inv, inv.id);
            if (resultId && !inv.id) {
                const rows = tableBody.querySelectorAll('tr');
                if (rows[index]) rows[index].dataset.id = resultId;
                const currentInvs = JSON.parse(localStorage.getItem('invoices')) || [];
                if (currentInvs[index]) currentInvs[index].id = resultId;
                localStorage.setItem('invoices', JSON.stringify(currentInvs));
            }
        });
    }
}

// Helper to save customers to localStorage and Firebase
function saveCustomersToStorage() {
    const tableBody = document.getElementById('customerTableBody');
    if (!tableBody) return;

    const tableRows = tableBody.querySelectorAll('tr');
    const customers = [];
    tableRows.forEach(row => {
        if (row.cells.length < 4) return;
        const customer = {
            id: row.dataset.id || null,
            name: row.cells[0].textContent,
            phone: row.cells[1].textContent,
            history: row.cells[2].textContent,
            totalSpent: row.cells[3].textContent
        };
        customers.push(customer);
    });
    localStorage.setItem('customers', JSON.stringify(customers));

    // Non-blocking Cloud Sync
    if (window.fbOps) {
        customers.forEach(async (cust, index) => {
            const resultId = await window.fbOps.saveData("customers", cust, cust.id);
            if (resultId && !cust.id) {
                const rows = tableBody.querySelectorAll('tr');
                if (rows[index]) rows[index].dataset.id = resultId;
                const currentCusts = JSON.parse(localStorage.getItem('customers')) || [];
                if (currentCusts[index]) currentCusts[index].id = resultId;
                localStorage.setItem('customers', JSON.stringify(currentCusts));
            }
        });
    }
}


function viewInvoice(button) {
    const row = button.closest('tr');
    const cells = row.cells;
    
    document.getElementById('viewInvNo').textContent = cells[0].textContent;
    document.getElementById('viewInvDate').textContent = 'Date: ' + cells[1].textContent;
    document.getElementById('viewInvCustomer').textContent = cells[2].textContent;
    document.getElementById('viewInvTotal').textContent = cells[3].textContent;
    document.getElementById('viewInvSubtotal').textContent = cells[3].textContent;
    document.getElementById('viewInvGrandTotal').textContent = cells[3].textContent;
    
    // For a real app, we'd fetch product/qty from a storage object. 
    // Here we'll just set defaults or search sales if name matches.
    document.getElementById('viewInvProduct').textContent = "Business Transaction";
    document.getElementById('viewInvQty').textContent = "1";
    
    openModal('viewInvoiceModal');
}

function openEditInvoiceModal(button) {
    currentRow = button.closest('tr');
    const cells = currentRow.cells;
    
    document.getElementById('editInvCustomer').value = cells[2].textContent;
    document.getElementById('editInvDate').value = cells[1].textContent;
    document.getElementById('editInvAmount').value = cells[3].textContent.replace('Rwf ', '').replace(/,/g, '');
    document.getElementById('editInvStatus').value = cells[4].textContent;
    
    openModal('editInvoiceModal');
}

async function saveInvoice() {
    if (!currentRow) return;
    const id = currentRow.dataset.id;
    const customer = document.getElementById('editInvCustomer').value;
    const date = document.getElementById('editInvDate').value;
    const amount = document.getElementById('editInvAmount').value;
    const status = document.getElementById('editInvStatus').value;

    const invoice = { customer, date, amount: 'Rwf ' + parseInt(amount).toLocaleString(), status };
    const result = await apiFetch(`/invoices/${id}`, {
        method: 'PUT',
        body: JSON.stringify(invoice)
    });

    if (result) {
        await refreshAllUI();
        closeModal('editInvoiceModal');
    }
}

async function deleteInvoice(button) {
    if (confirm('Are you sure you want to delete this invoice?')) {
        const row = button.closest('tr');
        const id = row.dataset.id;
        const result = await apiFetch(`/invoices/${id}`, { method: 'DELETE' });
        if (result) await refreshAllUI();
    }
}

async function addInvoice() {
    const customer = document.getElementById('invCustomer').value;
    const product = document.getElementById('invProduct').value;
    const qty = document.getElementById('invQty').value;
    const date = document.getElementById('invDate').value;
    
    if (!customer || product === 'Select product' || !qty || !date) {
        alert('Please fill in all fields');
        return;
    }

    const pData = APP_DATA.inventory.find(p => p.name === product);
    const price = pData ? parseInt(pData.sellPrice.replace('Rwf ', '').replace(/,/g, '')) : 0;
    const total = price * qty;
    const invoiceNo = 'INV-' + Math.floor(100 + Math.random() * 900);

    const invoice = { invoiceNo, customer, date, amount: 'Rwf ' + total.toLocaleString(), status: 'Pending' };
    const result = await apiFetch('/invoices', {
        method: 'POST',
        body: JSON.stringify(invoice)
    });

    if (result) {
        await refreshAllUI();
        document.getElementById('addInvoiceForm').reset();
        closeModal('addInvoiceModal');
    }
}

async function changeAdminPassword() {
    const user = JSON.parse(localStorage.getItem('ebu_current_user'));
    if (!user) return alert('You must be logged in.');

    const newPass = prompt('Enter new password:');
    if (!newPass) return;
    const confirmPass = prompt('Confirm new password:');
    if (newPass !== confirmPass) return alert('Passwords do not match.');

    try {
        const response = await fetch(`${API_URL}/api/users/me/password`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('ebu_token')}`
            },
            body: JSON.stringify({ password: newPass })
        });
        const result = await response.json();
        if (result.success) {
            alert('Password updated successfully!');
        } else {
            alert('Error: ' + result.error);
        }
    } catch (err) {
        alert('Failed to connect to server.');
    }
}

function generateReport(type) {
    let data = [];
    let filename = `EBU_Store_${type}_Report_${new Date().toISOString().split('T')[0]}.csv`;
    
    if (type === 'Sales') {
        data = APP_DATA.sales.map(s => ({
            Date: s.date,
            Customer: s.customer,
            Product: s.product,
            Qty: s.qty,
            Total: s.total,
            Status: s.status
        }));
    } else if (type === 'Inventory') {
        data = APP_DATA.inventory.map(p => ({
            Name: p.name,
            Category: p.category,
            Serial: p.serial,
            'Buy Price': p.buyPrice,
            'Sell Price': p.sellPrice,
            Stock: p.stock
        }));
    } else if (type === 'Expenses') {
        data = APP_DATA.expenses.map(e => ({
            Date: e.date,
            Category: e.category,
            Description: e.description,
            Amount: e.amount,
            Status: e.status
        }));
    }

    if (type === 'PL') {
        window.print();
        return;
    }

    if (data.length === 0) {
        alert('No data available for this report.');
        return;
    }

    // Convert to CSV
    const headers = Object.keys(data[0]);
    const csvContent = [
        headers.join(','),
        ...data.map(row => headers.map(h => `"${row[h]}"`).join(','))
    ].join('\n');

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function saveFooterSettings() {
    const settings = {
        footerDesc: document.getElementById('footerDesc').value,
        footerAddr: document.getElementById('footerAddr').value,
        footerPhone: document.getElementById('footerPhone').value,
        footerVer: document.getElementById('footerVer').value
    };
    
    const result = await apiFetch('/settings', {
        method: 'POST',
        body: JSON.stringify({ setting_key: 'footer', setting_value: JSON.stringify(settings) })
    });
    
    if (result) alert('Settings saved to MySQL!');
}

async function loadFooterSettings() {
    const result = await apiFetch('/settings/footer');
    if (result && result.setting_value) {
        const settings = JSON.parse(result.setting_value);
        document.getElementById('footerDesc').value = settings.footerDesc || '';
        document.getElementById('footerAddr').value = settings.footerAddr || '';
        document.getElementById('footerPhone').value = settings.footerPhone || '';
        document.getElementById('footerVer').value = settings.footerVer || '';
        
        // Update UI footers
        document.querySelectorAll('.footer-section p').forEach(p => p.textContent = settings.footerDesc);
        document.querySelectorAll('.footer-contact li:nth-child(1)').forEach(li => li.innerHTML = `<i class="fas fa-map-marker-alt"></i> ${settings.footerAddr}`);
        document.querySelectorAll('.footer-contact li:nth-child(2)').forEach(li => li.innerHTML = `<i class="fas fa-phone"></i> ${settings.footerPhone}`);
        document.querySelectorAll('.system-status span').forEach(span => span.textContent = `System Online: ${settings.footerVer}`);
    }
}

function syncReports() {
    const reportPage = document.getElementById('reportsPage');
    if (!reportPage) return;
    
    const timeFilter = document.getElementById('reportTimeFilter').value;
    const productFilter = document.getElementById('reportProductFilter').value;
    
    const rawSales = APP_DATA.sales;
    const expenses = APP_DATA.expenses;
    const inventory = APP_DATA.inventory;

    // 1. Populate Product Filter if empty
    const productDropdown = document.getElementById('reportProductFilter');
    if (productDropdown && productDropdown.options.length <= 1) {
        inventory.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.name;
            opt.textContent = p.name;
            productDropdown.appendChild(opt);
        });
    }

    const now = new Date();
    const filterByTime = (dataDateStr) => {
        if (timeFilter === 'all') return true;
        const date = new Date(dataDateStr);
        if (timeFilter === 'day') return date.toDateString() === now.toDateString();
        if (timeFilter === 'week') {
            const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
            return date >= startOfWeek;
        }
        if (timeFilter === 'month') return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        return true;
    };

    // Apply Filters
    const sales = rawSales.filter(s => {
        const matchesTime = filterByTime(s.date);
        const matchesProduct = productFilter === 'all' || s.product === productFilter;
        return matchesTime && matchesProduct;
    });

    const filteredExpenses = expenses.filter(e => filterByTime(e.date));

    // Financials
    const totalRevenue = sales.reduce((sum, s) => sum + parseInt(s.total.replace('Rwf ', '').replace(/,/g, '')), 0);
    const totalExpenses = productFilter === 'all' ? filteredExpenses.reduce((sum, e) => sum + parseInt(e.amount.replace('Rwf ', '').replace(/,/g, '')), 0) : 0;
    
    let totalCost = 0;
    const productStats = {};
    const customerStats = {};
    
    sales.forEach(s => {
        const qty = parseInt(s.qty);
        const revenue = parseInt(s.total.replace('Rwf ', '').replace(/,/g, ''));
        
        if (!productStats[s.product]) productStats[s.product] = { qty: 0, revenue: 0 };
        productStats[s.product].qty += qty;
        productStats[s.product].revenue += revenue;
        
        if (s.customer !== 'Walk-in') {
            if (!customerStats[s.customer]) customerStats[s.customer] = { orders: 0, spent: 0 };
            customerStats[s.customer].orders += 1;
            customerStats[s.customer].spent += revenue;
        }
        
        const invItem = inventory.find(p => p.name === s.product);
        if (invItem) {
            const unitCost = parseInt(invItem.buyPrice.replace('Rwf ', '').replace(/,/g, ''));
            totalCost += (unitCost * qty);
        }
    });

    const netProfit = totalRevenue - totalExpenses;
    const margin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : 0;

    // Update UI Cards
    document.getElementById('reportTotalSales').textContent = 'Rwf ' + totalRevenue.toLocaleString();
    document.getElementById('reportSalesCount').textContent = sales.length + ' Transactions';
    document.getElementById('reportTotalExpenses').textContent = 'Rwf ' + totalExpenses.toLocaleString();
    document.getElementById('reportExpenseCount').textContent = productFilter === 'all' ? filteredExpenses.length + ' Records' : 'N/A';
    document.getElementById('reportNetProfit').textContent = 'Rwf ' + netProfit.toLocaleString();
    document.getElementById('reportProfitMargin').textContent = margin + '% Margin';

    // Update Tables
    const topSellingTable = document.getElementById('topProductsBody');
    if (topSellingTable) {
        const sortedProducts = Object.keys(productStats).sort((a, b) => productStats[b].revenue - productStats[a].revenue);
        topSellingTable.innerHTML = sortedProducts.map(name => `
            <tr><td>${name}</td><td>${productStats[name].qty}</td><td>Rwf ${productStats[name].revenue.toLocaleString()}</td></tr>
        `).join('');
    }

    const topCustomersTable = document.getElementById('topCustomersTable');
    const sortedCustomers = Object.keys(customerStats).sort((a, b) => customerStats[b].spent - customerStats[a].spent);
    topCustomersTable.innerHTML = sortedCustomers.map(name => `
        <tr><td>${name}</td><td>${customerStats[name].orders}</td><td>Rwf ${customerStats[name].spent.toLocaleString()}</td></tr>
    `).join('');

    // Update Hidden Print Area
    document.getElementById('printTotalSales').textContent = 'Rwf ' + totalRevenue.toLocaleString();
    document.getElementById('printTotalCost').textContent = 'Rwf ' + totalCost.toLocaleString();
    document.getElementById('printTotalExpenses').textContent = 'Rwf ' + totalExpenses.toLocaleString();
    document.getElementById('printNetProfit').textContent = 'Rwf ' + netProfit.toLocaleString();
    document.getElementById('printSalesCount').textContent = sales.length;
    document.getElementById('printProductCount').textContent = productFilter === 'all' ? inventory.length : '1';
    document.getElementById('reportGeneratedDate').textContent = new Date().toLocaleString();
    
    const printProductPerformance = document.getElementById('printProductPerformance');
    printProductPerformance.innerHTML = sortedProducts.map(name => `
        <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">${name}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${productStats[name].qty}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">Rwf ${productStats[name].revenue.toLocaleString()}</td>
        </tr>
    `).join('');
}

function syncAlerts() {
    const alertsContainer = document.getElementById('alerts');
    if (!alertsContainer) return;

    const inventory = APP_DATA.inventory;
    const sales = APP_DATA.sales;
    
    // Clear static alerts but keep the title
    alertsContainer.innerHTML = '<h2 style="margin-bottom: 20px;">Alerts & Notifications</h2>';

    let hasAlerts = false;

    // 1. Check for Low Stock
    inventory.forEach(p => {
        const stock = parseInt(p.stock);
        if (stock <= 5) {
            hasAlerts = true;
            const type = stock <= 2 ? 'danger' : 'warning';
            const icon = stock <= 2 ? 'fa-exclamation-circle' : 'fa-exclamation-triangle';
            const title = stock <= 2 ? 'CRITICAL STOCK: Restock Now!' : 'Low Stock Warning';
            const urgency = stock <= 2 ? 'Immediately' : 'Soon';
            
            const alertDiv = document.createElement('div');
            alertDiv.className = `alert alert-${type}`;
            alertDiv.innerHTML = `
                <i class="fas ${icon}" style="font-size: 24px; margin-top: 5px;"></i>
                <div>
                    <strong style="font-size: 16px;">${title}</strong>
                    <p style="margin-top: 5px;"><strong>${p.name}</strong> has only <strong>${stock}</strong> items left in your store. Please buy more items <strong>${urgency}</strong> to avoid losing sales.</p>
                </div>
            `;
            alertsContainer.appendChild(alertDiv);
        }
    });

    // 2. Check for Pending Payments (New)
    const pendingSales = sales.filter(s => (s.status === 'Pending' || s.status === 'Partial') && s.is_deleted != 1);
    pendingSales.forEach(s => {
        hasAlerts = true;
        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert alert-warning';
        alertDiv.innerHTML = `
            <i class="fas fa-money-bill-wave" style="font-size: 18px; margin-top: 2px;"></i>
            <div>
                <strong>Payment Pending: ${s.customer}</strong>
                <p>Payment for ${s.product} is still ${s.status}. Balance: ${s.balance}</p>
            </div>
        `;
        alertsContainer.appendChild(alertDiv);
    });

    // 3. Check for Pending Expenses
    const rawExpenses = APP_DATA.expenses;
    const pendingExpenses = rawExpenses.filter(e => e.status === 'Pending' && e.is_deleted != 1);
    pendingExpenses.forEach(e => {
        hasAlerts = true;
        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert alert-warning';
        alertDiv.innerHTML = `
            <i class="fas fa-hand-holding-usd" style="font-size: 18px; margin-top: 2px;"></i>
            <div>
                <strong>Expense Pending: ${e.category}</strong>
                <p>Payment for ${e.description} is still Pending. Amount: ${e.amount}</p>
            </div>
        `;
        alertsContainer.appendChild(alertDiv);
    });

    // 3. High Sales Alert
    const today = new Date().toISOString().split('T')[0];
    const todaySales = sales.filter(s => s.date === today);
    if (todaySales.length > 10) {
        hasAlerts = true;
        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert alert-success';
        alertDiv.innerHTML = `
            <i class="fas fa-check-circle" style="font-size: 18px; margin-top: 2px;"></i>
            <div>
                <strong>High Sales Activity</strong>
                <p>Today is a busy day! You have recorded ${todaySales.length} transactions already.</p>
            </div>
        `;
        alertsContainer.appendChild(alertDiv);
    }

    if (!hasAlerts) {
        alertsContainer.innerHTML += `
            <div class="alert alert-success" style="background: #f0fdf4; border-color: #bbf7d0; color: #166534;">
                <i class="fas fa-check-circle"></i>
                <div>
                    <strong>All Systems Clear</strong>
                    <p>No inventory alerts or critical notifications at this time.</p>
                </div>
            </div>
        `;
    }
}


function printFullReport() {
    const reportArea = document.getElementById('fullBusinessReportArea');
    if (!reportArea) return;

    // Temporalily show for printing
    reportArea.style.display = 'block';
    
    // Create a style element for report-specific print rules
    const style = document.createElement('style');
    style.innerHTML = `
        @media print {
            body * { visibility: hidden; }
            #fullBusinessReportArea, #fullBusinessReportArea * { visibility: visible; }
            #fullBusinessReportArea { position: absolute; left: 0; top: 0; width: 100%; }
        }
    `;
    document.head.appendChild(style);
    
    window.print();
    
    // Cleanup
    document.head.removeChild(style);
    reportArea.style.display = 'none';
}

function verifyAdminAccess(e) {
    if (e) e.preventDefault();
    const pass = prompt('Security Verification: Enter Admin Password to access Credentials:');
    if (pass === 'password') { // You can change this to your desired admin master password
        window.location.href = 'credentials.html';
    } else {
        alert('Access Denied: Incorrect Password');
    }
}

// --- Footer Settings Logic ---
function saveFooterSettings() {
    const descInput = document.getElementById('footerDesc');
    const addrInput = document.getElementById('footerAddr');
    const phoneInput = document.getElementById('footerPhone');
    const verInput = document.getElementById('footerVer');

    if (!descInput || !addrInput || !phoneInput || !verInput) return;

    const settings = {
        description: descInput.value,
        address: addrInput.value,
        phone: phoneInput.value,
        version: verInput.value
    };
    
    localStorage.setItem('ebu_footer_settings', JSON.stringify(settings));
    
    alert('System Configuration Updated Successfully');
    applyFooterSettings();
}

function loadFooterSettingsToForm() {
    const settings = JSON.parse(localStorage.getItem('ebu_footer_settings'));
    if (settings) {
        if (document.getElementById('footerDesc')) document.getElementById('footerDesc').value = settings.description || '';
        if (document.getElementById('footerAddr')) document.getElementById('footerAddr').value = settings.address || '';
        if (document.getElementById('footerPhone')) document.getElementById('footerPhone').value = settings.phone || '';
        if (document.getElementById('footerVer')) document.getElementById('footerVer').value = settings.version || '';
    }
}

function applyFooterSettings() {
    const settings = JSON.parse(localStorage.getItem('ebu_footer_settings'));
    if (!settings) return;

    const footerDesc = document.querySelector('.footer-brand p');
    if (footerDesc) footerDesc.textContent = settings.description || footerDesc.textContent;

    const footerContact = document.querySelector('.footer-contact');
    if (footerContact) {
        footerContact.innerHTML = `
            <li><i class="fas fa-map-marker-alt"></i> ${settings.address || 'Kigali, Rwanda'}</li>
            <li><i class="fas fa-phone"></i> ${settings.phone || '+250 788 000 000'}</li>
        `;
    }

    const footerVer = document.querySelector('.system-status span');
    if (footerVer) footerVer.textContent = 'System Online: ' + (settings.version || 'v2.4.0');
}

// Initialize on load with Cloud Sync
function handleLogout(e) {
    if (e) e.preventDefault();
    localStorage.removeItem('ebu_token');
    localStorage.removeItem('ebu_current_user');
    window.location.href = 'login.html';
}

function checkAuth() {
    const user = localStorage.getItem('ebu_current_user');
    const isLoginPage = window.location.pathname.includes('login.html');
    if (!user && !isLoginPage) {
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

// Security: Re-check auth on Back button / cache load
window.addEventListener('pageshow', (event) => {
    checkAuth();
});

document.addEventListener('DOMContentLoaded', async function() {
    if (!checkAuth()) return;

    // Attach Logout Logic
    document.querySelectorAll('.logout-link').forEach(link => {
        link.addEventListener('click', handleLogout);
    });

    await fetchAppData();
    await refreshAllUI();
    
    // Set Dynamic Date
    const dateEl = document.getElementById('currentDate');
    if (dateEl) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dateEl.textContent = new Date().toLocaleDateString('en-US', options);
    }
    
    // Chart Initialization
    const ctx = document.getElementById('salesChart');
    if (ctx) {
        const rawSales = APP_DATA.sales;
        const last7Days = [];
        const last7Data = [];
        
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
            
            last7Days.push(dayName);
            
            const daySales = rawSales.filter(s => s.date === dateStr);
            const dayTotal = daySales.reduce((sum, s) => {
                const amount = s.total ? parseInt(s.total.replace('Rwf ', '').replace(/,/g, '')) : 0;
                return sum + amount;
            }, 0);
            last7Data.push(dayTotal);
        }

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: last7Days,
                datasets: [{
                    label: 'Revenue (Rwf)',
                    data: last7Data,
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    tension: 0.4,
                    fill: true,
                    pointBackgroundColor: '#667eea',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) { return 'Rwf ' + value.toLocaleString(); }
                        }
                    }
                }
            }
        });
    }
});

async function refreshAllUI() {
    await fetchAppData();
    
    populateProductDropdowns();
    syncProductsTable();
    syncSalesTable();
    syncDashboardStats();
    syncCustomerList();
    syncExpensesTable();
    syncInvoicesTable();
    syncReports();
    syncAlerts();
    applyFooterSettings();

    if (window.location.pathname.includes('settings.html')) {
        loadFooterSettingsToForm();
    }
}

function autoFillCustomerInfo(name) {
    if (!name || name.length < 2) return;
    const customers = APP_DATA.customers || [];
    const match = customers.find(c => c.name.toLowerCase().includes(name.toLowerCase()));
    if (match) {
        const phoneInput = document.getElementById('invPhone');
        if (phoneInput) phoneInput.value = match.phone || '';
    }
}

async function clearAllSystemData() {
    if (!confirm('Are you sure? This will delete ALL data from your computer!')) return;
    localStorage.clear();
    window.location.reload();
}

