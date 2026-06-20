// Ban Wang Kradi Thong School - Project Tracking Dashboard Logic

// Google Sheets Visualization API JSONP Endpoint
const SPREADSHEET_JSONP_URL = "https://docs.google.com/spreadsheets/d/1zr741Uz6KacAdAySOfy5Wqymm1J7vaeXG3dy7gV0xUY/gviz/tq?tqx=responseHandler:handleGoogleSheetResponse";

// State management
let state = {
    projects: [],
    filteredProjects: [],
    departments: new Set(),
    charts: {
        status: null,
        dept: null
    },
    activeFilters: {
        search: "",
        department: "all",
        status: "all"
    }
};

// DOM Elements
const loadingScreen = document.getElementById("loadingScreen");
const refreshBtn = document.getElementById("refreshBtn");
const themeToggleBtn = document.getElementById("themeToggle");
const lastUpdatedSpan = document.getElementById("lastUpdated");
const tableBody = document.getElementById("tableBody");
const searchInput = document.getElementById("searchInput");
const deptFilterSelect = document.getElementById("deptFilter");
const statusFilterSelect = document.getElementById("statusFilter");

// Modal Elements
const detailModal = document.getElementById("detailModal");
const modalClose = document.getElementById("modalClose");
const modalDept = document.getElementById("modalDept");
const modalTitle = document.getElementById("modalTitle");
const modalId = document.getElementById("modalId");
const modalResponsible = document.getElementById("modalResponsible");
const modalStatus = document.getElementById("modalStatus");
const modalProgress = document.getElementById("modalProgress");
const modalBudgetTotal = document.getElementById("modalBudgetTotal");
const modalBudgetSpent = document.getElementById("modalBudgetSpent");
const modalBudgetRemain = document.getElementById("modalBudgetRemain");
const modalSpentBar = document.getElementById("modalSpentBar");
const modalRemainBar = document.getElementById("modalRemainBar");

// Application Initialization
window.addEventListener("DOMContentLoaded", () => {
    initTheme();
    loadDashboardData();
    setupEventListeners();
});

// Theme Management (Light / Dark Mode)
function initTheme() {
    const savedTheme = localStorage.getItem("dashboard-theme") || "dark";
    document.documentElement.setAttribute("data-theme", savedTheme);
    updateThemeToggleIcons(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("dashboard-theme", newTheme);
    updateThemeToggleIcons(newTheme);
    
    // Redraw charts with updated theme colors if data exists
    if (state.projects.length > 0) {
        renderCharts();
    }
}

function updateThemeToggleIcons(theme) {
    const moon = document.getElementById("themeMoon");
    const sun = document.getElementById("themeSun");
    if (theme === "dark") {
        moon.style.display = "block";
        sun.style.display = "none";
    } else {
        moon.style.display = "none";
        sun.style.display = "block";
    }
}

// Fetch and load dashboard data via JSONP (bypasses browser CORS constraints)
function loadDashboardData() {
    // Show loading overlay
    loadingScreen.classList.remove("hidden");
    const refreshIcon = refreshBtn.querySelector("svg");
    if (refreshIcon) refreshIcon.classList.add("spin");

    // Setup timeout handler for network issues
    const timeoutDuration = 8000; // 8 seconds
    const fetchTimeout = setTimeout(() => {
        // Clean up global function and script tag
        if (window.handleGoogleSheetResponse) {
            delete window.handleGoogleSheetResponse;
        }
        const existingScript = document.getElementById("sheetDataScript");
        if (existingScript) {
            existingScript.remove();
        }
        
        // Notify user
        alert("การดึงข้อมูลล่าช้าหรือล้มเหลว กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตของท่าน หรือสิทธิ์การเข้าถึงลิงก์ Google Sheets");
        loadingScreen.classList.add("hidden");
        if (refreshIcon) refreshIcon.classList.remove("spin");
    }, timeoutDuration);

    // Register global JSONP callback
    window.handleGoogleSheetResponse = function(response) {
        // Clear timeout
        clearTimeout(fetchTimeout);

        // Remove injected script tag
        const scriptTag = document.getElementById("sheetDataScript");
        if (scriptTag) scriptTag.remove();

        // Check response status
        if (response.status === "error") {
            console.error("Google Sheets API Error:", response.errors);
            alert(`ดึงข้อมูลผิดพลาด: ${response.errors[0].message}`);
            loadingScreen.classList.add("hidden");
            if (refreshIcon) refreshIcon.classList.remove("spin");
            return;
        }

        try {
            // Process retrieved data
            processJsonData(response.table);
            
            // Update filter list dropdown
            populateDepartmentFilter();
            
            // Render UI
            filterAndRender();
            
            // Log sync timestamp
            updateSyncTimestamp();

        } catch (err) {
            console.error("Error parsing JSON data structure:", err);
            alert("สัญญารูปแบบข้อมูลจาก Google Sheet มีการเปลี่ยนแปลง กรุณาตรวจสอบโครงสร้างคอลัมน์อีกครั้ง");
        } finally {
            // Hide loading overlay
            loadingScreen.classList.add("hidden");
            if (refreshIcon) refreshIcon.classList.remove("spin");
        }
    };

    // Inject script tag into DOM
    const script = document.createElement("script");
    script.id = "sheetDataScript";
    script.src = `${SPREADSHEET_JSONP_URL}&t=${Date.now()}`;
    script.onerror = function() {
        clearTimeout(fetchTimeout);
        if (window.handleGoogleSheetResponse) {
            delete window.handleGoogleSheetResponse;
        }
        script.remove();
        alert("ไม่สามารถเชื่อมต่อเครื่องเซิร์ฟเวอร์ Google Sheets ได้");
        loadingScreen.classList.add("hidden");
        if (refreshIcon) refreshIcon.classList.remove("spin");
    };

    document.body.appendChild(script);
}

// Process sheet rows and parse to clean JS Objects
function processJsonData(table) {
    const projects = [];
    state.departments.clear();

    const rows = table.rows;
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row.c) continue;
        const c = row.c;

        // Clean cell extraction helper
        const getVal = (idx, type, def) => {
            const cell = c[idx];
            if (!cell || cell.v === null || cell.v === undefined) return def;
            if (type === "number") {
                const num = parseFloat(cell.v);
                return isNaN(num) ? def : num;
            }
            return cell.v;
        };

        const id = getVal(0, "string", "").toString();
        const title = getVal(1, "string", "");
        const responsible = getVal(2, "string", "");
        const department = getVal(3, "string", "");
        const budget = getVal(4, "number", 0);
        const spent = getVal(5, "number", 0);
        const progress = getVal(7, "number", 0);
        const status = getVal(8, "string", "ยังไม่ดำเนินการ");

        if (department) {
            state.departments.add(department);
        }

        projects.push({
            id,
            title,
            responsible,
            department,
            budget,
            spent,
            remaining: budget - spent, // Recalculate remaining to ensure math is perfect
            progress,
            status
        });
    }

    state.projects = projects;
}

// Populate the department dropdown list filter dynamically
function populateDepartmentFilter() {
    // Clear existing options except the first one
    deptFilterSelect.innerHTML = '<option value="all">ทุกกลุ่มงาน</option>';
    
    // Add unique departments sorted alphabetically
    Array.from(state.departments).sort().forEach(dept => {
        const opt = document.createElement("option");
        opt.value = dept;
        opt.textContent = dept;
        deptFilterSelect.appendChild(opt);
    });
}

// Apply active search & filters, then update KPIs, Charts, and Table view
function filterAndRender() {
    const { search, department, status } = state.activeFilters;
    
    state.filteredProjects = state.projects.filter(p => {
        const matchesSearch = p.title.toLowerCase().includes(search.toLowerCase()) || 
                              p.responsible.toLowerCase().includes(search.toLowerCase()) || 
                              p.id.toLowerCase().includes(search.toLowerCase());
                              
        const matchesDept = department === "all" || p.department === department;
        const matchesStatus = status === "all" || p.status === status;
        
        return matchesSearch && matchesDept && matchesStatus;
    });

    renderKPIs();
    renderTable();
    renderCharts();
}

// Format number to currency Baht format
function formatCurrency(value) {
    return new Intl.NumberFormat('th-TH', {
        style: 'currency',
        currency: 'THB',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(value);
}

// Calculate and animate KPI Metrics
function renderKPIs() {
    const totalProjects = state.filteredProjects.length;
    let totalBudget = 0;
    let totalSpent = 0;
    let sumProgress = 0;

    state.filteredProjects.forEach(p => {
        totalBudget += p.budget;
        totalSpent += p.spent;
        sumProgress += p.progress;
    });

    const totalRemaining = totalBudget - totalSpent;
    const avgProgress = totalProjects > 0 ? (sumProgress / totalProjects) : 0;
    const spentPercent = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
    const remainPercent = totalBudget > 0 ? Math.round((totalRemaining / totalBudget) * 100) : 0;

    // Display counters
    animateValueCounter("kpiTotalProjects", totalProjects, false);
    animateValueCounter("kpiTotalBudget", totalBudget, true);
    animateValueCounter("kpiSpentBudget", totalSpent, true);
    animateValueCounter("kpiRemainingBudget", totalRemaining, true);
    animateValueCounter("kpiAvgProgress", avgProgress, false, "%");

    // Display sub-percentage footer values
    document.getElementById("spentPercentage").textContent = `${spentPercent}%`;
    document.getElementById("remainPercentage").textContent = `${remainPercent}%`;
}

// Dynamic counter animation
function animateValueCounter(elementId, targetValue, isCurrency, suffix = "") {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    // Quick directly set for 0
    if (targetValue === 0) {
        el.textContent = isCurrency ? "฿0" : `0${suffix}`;
        return;
    }

    const duration = 800; // ms
    const frameRate = 1000 / 60; // 60fps
    const totalFrames = Math.round(duration / frameRate);
    let frame = 0;

    const interval = setInterval(() => {
        frame++;
        const progress = frame / totalFrames;
        
        // Easing out quadratic
        const easeVal = progress * (2 - progress);
        const currentVal = Math.round(targetValue * easeVal);

        el.textContent = isCurrency ? formatCurrency(currentVal) : `${currentVal.toLocaleString()}${suffix}`;

        if (frame === totalFrames) {
            clearInterval(interval);
            el.textContent = isCurrency ? formatCurrency(targetValue) : `${targetValue.toLocaleString()}${suffix}`;
        }
    }, frameRate);
}

// Populate table rows based on filtered list
function renderTable() {
    tableBody.innerHTML = "";

    if (state.filteredProjects.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 32px; color: var(--text-muted);">
                    ไม่พบข้อมูลโครงการตามตัวกรองที่เลือก
                </td>
            </tr>
        `;
        return;
    }

    state.filteredProjects.forEach(p => {
        const tr = document.createElement("tr");
        tr.dataset.id = p.id;
        
        // Determine status badge style
        let badgeClass = "badge-inactive";
        if (p.status === "อยู่ระหว่างดำเนินการ") badgeClass = "badge-pending";
        else if (p.status === "ดำเนินการแล้ว") badgeClass = "badge-success";

        tr.innerHTML = `
            <td>${p.id}</td>
            <td class="project-title">${p.title}</td>
            <td>${p.responsible}</td>
            <td><span style="font-size: 0.85rem; padding: 2px 8px; border-radius: 4px; background: var(--card-border); color: var(--text-secondary);">${p.department}</span></td>
            <td style="text-align: right; font-weight: 500;">${formatCurrency(p.budget)}</td>
            <td style="text-align: right; color: var(--budget-spent);">${p.spent > 0 ? formatCurrency(p.spent) : "-"}</td>
            <td style="text-align: right; color: var(--budget-remain);">${formatCurrency(p.remaining)}</td>
            <td>
                <div class="table-progress-container">
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill" style="width: ${p.progress}%;"></div>
                    </div>
                    <span class="progress-text">${p.progress}%</span>
                </div>
            </td>
            <td>
                <span class="badge ${badgeClass}">${p.status}</span>
            </td>
        `;

        // Row click opens the detailed modal view
        tr.addEventListener("click", () => showProjectDetails(p.id));
        tableBody.appendChild(tr);
    });
}

// Visual updates for Chart.js
function renderCharts() {
    // Read theme colors dynamically from CSS Custom Properties
    const style = getComputedStyle(document.body);
    const gridColor = document.documentElement.getAttribute("data-theme") === "light" 
        ? "rgba(15, 23, 42, 0.08)" 
        : "rgba(255, 255, 255, 0.08)";
    const textColor = style.getPropertyValue('--text-secondary').trim();

    // --- CHART 1: Donut Chart (Status Distribution) ---
    const statusCounts = {
        "ยังไม่ดำเนินการ": 0,
        "อยู่ระหว่างดำเนินการ": 0,
        "ดำเนินการแล้ว": 0
    };

    state.filteredProjects.forEach(p => {
        if (statusCounts[p.status] !== undefined) {
            statusCounts[p.status]++;
        }
    });

    const statusCtx = document.getElementById("statusChart").getContext("2d");
    if (state.charts.status) {
        state.charts.status.destroy();
    }

    state.charts.status = new Chart(statusCtx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(statusCounts),
            datasets: [{
                data: Object.values(statusCounts),
                backgroundColor: [
                    'rgba(100, 116, 139, 0.8)', // slate
                    'rgba(245, 158, 11, 0.8)',  // amber
                    'rgba(16, 185, 129, 0.8)'   // emerald
                ],
                borderColor: [
                    '#64748b',
                    '#f59e0b',
                    '#10b981'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: textColor,
                        font: { family: 'Prompt', size: 12 }
                    }
                }
            },
            cutout: '65%'
        }
    });

    // --- CHART 2: Bar Chart (Budget by Department) ---
    const deptBudgets = {};
    
    state.filteredProjects.forEach(p => {
        if (!deptBudgets[p.department]) {
            deptBudgets[p.department] = { budget: 0, spent: 0, remain: 0 };
        }
        deptBudgets[p.department].budget += p.budget;
        deptBudgets[p.department].spent += p.spent;
        deptBudgets[p.department].remain += p.remaining;
    });

    const deptLabels = Object.keys(deptBudgets);
    const datasets = {
        budget: deptLabels.map(dept => deptBudgets[dept].budget),
        spent: deptLabels.map(dept => deptBudgets[dept].spent),
        remain: deptLabels.map(dept => deptBudgets[dept].remain)
    };

    const deptCtx = document.getElementById("deptChart").getContext("2d");
    if (state.charts.dept) {
        state.charts.dept.destroy();
    }

    state.charts.dept = new Chart(deptCtx, {
        type: 'bar',
        data: {
            labels: deptLabels,
            datasets: [
                {
                    label: 'งบประมาณโครงการทั้งหมด',
                    data: datasets.budget,
                    backgroundColor: 'rgba(59, 130, 246, 0.75)', // blue
                    borderColor: '#3b82f6',
                    borderWidth: 1.5,
                    borderRadius: 4
                },
                {
                    label: 'เบิกจ่ายใช้ไปแล้ว',
                    data: datasets.spent,
                    backgroundColor: 'rgba(236, 72, 153, 0.75)', // pink
                    borderColor: '#ec4899',
                    borderWidth: 1.5,
                    borderRadius: 4
                },
                {
                    label: 'งบประมาณคงเหลือ',
                    data: datasets.remain,
                    backgroundColor: 'rgba(16, 185, 129, 0.75)', // emerald
                    borderColor: '#10b981',
                    borderWidth: 1.5,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { color: 'transparent' },
                    ticks: {
                        color: textColor,
                        font: { family: 'Prompt', size: 11 }
                    }
                },
                y: {
                    grid: { color: gridColor },
                    ticks: {
                        color: textColor,
                        font: { family: 'Prompt', size: 10 },
                        callback: function(value) {
                            return (value / 1000) + 'k ฿';
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: textColor,
                        font: { family: 'Prompt', size: 11 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += formatCurrency(context.parsed.y);
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

// Display Project Detail Overlay Modal
function showProjectDetails(id) {
    const project = state.projects.find(p => p.id === id);
    if (!project) return;

    modalDept.textContent = project.department;
    modalTitle.textContent = project.title;
    modalId.textContent = project.id;
    modalResponsible.textContent = project.responsible;
    modalStatus.textContent = project.status;
    modalProgress.textContent = `${project.progress}%`;
    
    // Status text colors
    modalStatus.className = "info-value";
    if (project.status === "อยู่ระหว่างดำเนินการ") modalStatus.style.color = "var(--status-pending)";
    else if (project.status === "ดำเนินการแล้ว") modalStatus.style.color = "var(--status-success)";
    else modalStatus.style.color = "var(--status-inactive)";

    modalBudgetTotal.textContent = formatCurrency(project.budget);
    modalBudgetSpent.textContent = formatCurrency(project.spent);
    modalBudgetRemain.textContent = formatCurrency(project.remaining);

    // Calculate budget split percentages for dynamic layout gauge bar
    const spentPercent = project.budget > 0 ? (project.spent / project.budget) * 100 : 0;
    const remainPercent = project.budget > 0 ? (project.remaining / project.budget) * 100 : 0;

    modalSpentBar.style.width = `${spentPercent}%`;
    modalRemainBar.style.width = `${remainPercent}%`;

    // Active overlay display
    detailModal.classList.add("active");
}

function closeProjectDetails() {
    detailModal.classList.remove("active");
}

// Refresh status timestamp
function updateSyncTimestamp() {
    const d = new Date();
    const thaiMonths = [
        "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
        "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."
    ];
    
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const seconds = d.getSeconds().toString().padStart(2, '0');
    const formatted = `${d.getDate()} ${thaiMonths[d.getMonth()]} ${d.getFullYear() + 543} เวลา ${d.getHours()}:${minutes}:${seconds} น.`;
    
    lastUpdatedSpan.textContent = formatted;
}

// Setup Event Handlers
function setupEventListeners() {
    // Sync Action
    refreshBtn.addEventListener("click", loadDashboardData);

    // Theme toggle Action
    themeToggleBtn.addEventListener("click", toggleTheme);

    // Search filter input Action
    searchInput.addEventListener("input", (e) => {
        state.activeFilters.search = e.target.value;
        filterAndRender();
    });

    // Dropdown filters Action
    deptFilterSelect.addEventListener("change", (e) => {
        state.activeFilters.department = e.target.value;
        filterAndRender();
    });

    statusFilterSelect.addEventListener("change", (e) => {
        state.activeFilters.status = e.target.value;
        filterAndRender();
    });

    // Close Modal actions
    modalClose.addEventListener("click", closeProjectDetails);
    
    detailModal.addEventListener("click", (e) => {
        if (e.target === detailModal) {
            closeProjectDetails();
        }
    });

    // Close Modal on ESC key
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && detailModal.classList.contains("active")) {
            closeProjectDetails();
        }
    });
}
