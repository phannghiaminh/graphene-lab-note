const firebaseConfig = {
  apiKey: "AIzaSyA85B_VnpMttdWRLgYfpB97ltz8YjKqmyI",
  authDomain: "graphene-lab-note.firebaseapp.com",
  projectId: "graphene-lab-note",
  storageBucket: "graphene-lab-note.firebasestorage.app",
  messagingSenderId: "583666224650",
  appId: "1:583666224650:web:1636a149f0f0eba98699f3",
  measurementId: "G-1FDW7LJLW6"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// State
let logsData = [];
let editingLogId = null;
let unsubscribeSnapshot = null;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    // Set default date to today
    document.getElementById('date').valueAsDate = new Date();
    
    // Auth State Observer
    auth.onAuthStateChanged((user) => {
        if (user) {
            // Logged in
            document.getElementById('login-container').style.display = 'none';
            document.getElementById('app-container').style.display = 'flex';
            initRealtimeUpdates();
        } else {
            // Logged out
            document.getElementById('app-container').style.display = 'none';
            document.getElementById('login-container').style.display = 'flex';
            if (unsubscribeSnapshot) {
                unsubscribeSnapshot();
                unsubscribeSnapshot = null;
            }
            logsData = [];
            document.getElementById('login-form').reset();
            document.getElementById('login-error').style.display = 'none';
        }
    });

    // Login Form Submit
    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const errorEl = document.getElementById('login-error');
        
        auth.signInWithEmailAndPassword(email, password)
            .catch(error => {
                errorEl.textContent = "Email hoặc mật khẩu không đúng!";
                errorEl.style.display = 'block';
            });
    });
    
    // Setup form submission
    document.getElementById('cvd-form').addEventListener('submit', handleFormSubmit);
});

function initRealtimeUpdates() {
    // Listen to Firestore real-time updates
    unsubscribeSnapshot = db.collection("logs").orderBy("createdAt", "asc").onSnapshot((querySnapshot) => {
        logsData = [];
        querySnapshot.forEach((doc) => {
            logsData.push(doc.data());
        });
        
        // Migrate local storage data if cloud is empty and local is not
        if (logsData.length === 0) {
            const localLogs = JSON.parse(localStorage.getItem('grapheneLogs'));
            if (localLogs && localLogs.length > 0) {
                localLogs.forEach(log => {
                    db.collection("logs").doc(log.id).set(log);
                });
            }
        }
        
        loadLogs();
        if (document.getElementById('compare-view').style.display !== 'none') {
            renderCompareLogList();
        }
    }, (error) => {
        console.error("Error listening to logs: ", error);
        alert("Có lỗi xảy ra khi đồng bộ dữ liệu từ server!");
    });
}

function logout() {
    auth.signOut();
}

// UI Navigation
function switchTab(tabId, isNew = false) {
    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.getElementById(`nav-${tabId}`).classList.add('active');

    // Update views
    document.querySelectorAll('.view-section').forEach(view => {
        view.style.display = 'none';
        view.classList.remove('active');
    });
    const activeView = document.getElementById(`${tabId}-view`);
    activeView.style.display = 'block';
    
    // Trigger reflow for animation
    void activeView.offsetWidth;
    activeView.classList.add('active');

    // Update Header Text
    const pageTitle = document.getElementById('page-title');
    const pageSubtitle = document.getElementById('page-subtitle');
    
    if(tabId === 'dashboard') {
        pageTitle.textContent = 'Dashboard';
        pageSubtitle.textContent = 'Tổng quan các mẻ thực nghiệm CVD';
        loadLogs(); // Refresh dashboard
    } else if (tabId === 'compare') {
        pageTitle.textContent = 'So Sánh Các Mẻ';
        pageSubtitle.textContent = 'Phân tích thông số chi tiết giữa các mẻ thực nghiệm';
        renderCompareLogList();
    } else {
        if (isNew) {
            editingLogId = null;
            document.getElementById('cvd-form').reset();
            document.getElementById('date').valueAsDate = new Date();
            resetHeatingSteps();
            document.querySelector('#cvd-form button[type="submit"]').innerHTML = '<i class="fa-solid fa-save"></i> Lưu Nhật Ký';
            pageTitle.textContent = 'Mẻ Thực Nghiệm Mới';
            pageSubtitle.textContent = 'Nhập số liệu thông số tổng hợp';
        } else if (editingLogId) {
            pageTitle.textContent = 'Sửa Mẻ Thực Nghiệm';
            pageSubtitle.textContent = 'Chỉnh sửa thông số mẻ thực nghiệm cũ';
        }
    }
}

function toggleGrowthSection() {
    const isEnabled = document.getElementById('enable-growth').checked;
    const inputsContainer = document.getElementById('growth-inputs');
    const inputs = inputsContainer.querySelectorAll('input');
    
    if(isEnabled) {
        inputsContainer.style.opacity = '1';
        inputsContainer.style.pointerEvents = 'auto';
        inputs.forEach(input => {
            if(['growth-temp', 'growth-time', 'growth-pressure', 'growth-ch4', 'growth-h2'].includes(input.id)) {
                input.required = true;
            }
        });
    } else {
        inputsContainer.style.opacity = '0.5';
        inputsContainer.style.pointerEvents = 'none';
        inputs.forEach(input => {
            input.required = false;
            input.value = ''; // clear values
        });
    }
}

// Heating Steps Logic
let currentHeatingStep = 1;
const MAX_HEATING_STEPS = 5;

function addHeatingStep() {
    if (currentHeatingStep >= MAX_HEATING_STEPS) {
        alert("Đã đạt giới hạn tối đa 5 bước nâng nhiệt.");
        return;
    }
    currentHeatingStep++;
    const stepDiv = document.getElementById(`heating-step-${currentHeatingStep}`);
    if (stepDiv) {
        stepDiv.style.display = 'flex';
        // Make fields required when visible
        stepDiv.querySelector(`input[name="heatingTemp_${currentHeatingStep}"]`).required = true;
        stepDiv.querySelector(`input[name="heatingTime_${currentHeatingStep}"]`).required = true;
    }
}

function resetHeatingSteps() {
    for (let i = 2; i <= MAX_HEATING_STEPS; i++) {
        const stepDiv = document.getElementById(`heating-step-${i}`);
        if (stepDiv) {
            stepDiv.style.display = 'none';
            stepDiv.querySelector(`input[name="heatingTemp_${i}"]`).required = false;
            stepDiv.querySelector(`input[name="heatingTime_${i}"]`).required = false;
        }
    }
    currentHeatingStep = 1;
}

function handleFormSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    const logEntry = Object.fromEntries(formData.entries());
    
    if (editingLogId) {
        // Update existing log
        const index = logsData.findIndex(l => l.id === editingLogId);
        if (index !== -1) {
            logEntry.id = logsData[index].id;
            logEntry.createdAt = logsData[index].createdAt;
        } else {
            logEntry.id = editingLogId;
        }
        
        db.collection("logs").doc(logEntry.id).set(logEntry)
            .then(() => {
                editingLogId = null;
                form.querySelector('button[type="submit"]').innerHTML = '<i class="fa-solid fa-save"></i> Lưu Nhật Ký';
                alert("Đã cập nhật nhật ký thành công!");
                form.reset();
                document.getElementById('date').valueAsDate = new Date();
                resetHeatingSteps();
                switchTab('dashboard');
            })
            .catch((error) => console.error("Error updating log: ", error));
    } else {
        // Add unique ID and timestamp
        logEntry.id = Date.now().toString();
        logEntry.createdAt = new Date().toISOString();
        
        db.collection("logs").doc(logEntry.id).set(logEntry)
            .then(() => {
                alert("Đã lưu nhật ký mới thành công!");
                form.reset();
                document.getElementById('date').valueAsDate = new Date();
                resetHeatingSteps();
                switchTab('dashboard');
            })
            .catch((error) => console.error("Error adding log: ", error));
    }
}

// Dashboard Rendering
function loadLogs() {
    const tableBody = document.getElementById('logs-table-body');
    const emptyState = document.getElementById('empty-state');
    const tableContainer = document.querySelector('.logs-table');
    
    // Update Stats
    document.getElementById('total-logs').textContent = logsData.length;
    if (logsData.length > 0) {
        const lastLog = logsData[logsData.length - 1];
        document.getElementById('recent-temp').textContent = (lastLog.growthTemp ? lastLog.growthTemp : lastLog.annealTemp) + ' °C';
    } else {
        document.getElementById('recent-temp').textContent = '-- °C';
    }
    
    // Render Table
    if (logsData.length === 0) {
        tableContainer.style.display = 'none';
        emptyState.style.display = 'flex';
        document.getElementById('dashboard-chart-container').style.display = 'none';
    } else {
        tableContainer.style.display = 'table';
        emptyState.style.display = 'none';
        
        // Clear current
        tableBody.innerHTML = '';
        
        // Reverse array to show newest first
        const displayLogs = [...logsData].reverse();
        
        displayLogs.forEach(log => {
            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.onclick = (e) => {
                // Ignore clicks on action buttons
                if(e.target.closest('button')) return;
                
                // Highlight row
                document.querySelectorAll('#logs-table-body tr').forEach(row => row.classList.remove('selected-row'));
                tr.classList.add('selected-row');
                
                // Render dashboard chart
                renderDashboardChart(log);
            };
            
            tr.innerHTML = `
                <td><strong>${log.sampleId}</strong></td>
                <td>${log.date}</td>
                <td>${log.operator}</td>
                <td>${log.growthTemp ? log.growthTemp : (log.annealTemp + ' (Ủ)')}</td>
                <td><span style="background: rgba(255,255,255,0.1); padding: 4px 8px; border-radius: 4px; font-size: 0.8rem;">${log.substrate}</span></td>
                <td>${log.annealAr||0}:${log.annealH2||0}</td>
                <td>${log.growthAr||0}:${log.growthH2||0}:${log.growthCH4||0}</td>
                <td>
                    <button class="btn-icon" onclick="viewDetails('${log.id}')" title="Xem chi tiết"><i class="fa-solid fa-eye"></i></button>
                    <button class="btn-icon" onclick="editLog('${log.id}')" title="Sửa"><i class="fa-solid fa-pencil"></i></button>
                    <button class="btn-icon" onclick="deleteLog('${log.id}')" title="Xóa" style="color: #ef4444;"><i class="fa-solid fa-trash"></i></button>
                </td>
            `;
            tableBody.appendChild(tr);
        });
        
        // Show chart for the first item by default if none selected
        if (displayLogs.length > 0) {
            tableBody.firstChild.classList.add('selected-row');
            renderDashboardChart(displayLogs[0]);
        }
    }
}

// Actions
function deleteLog(id) {
    if(confirm('Bạn có chắc chắn muốn xóa mẻ thực nghiệm này không?')) {
        db.collection("logs").doc(id).delete()
            .then(() => {
                // UI will auto-update from onSnapshot
                const chartContainer = document.getElementById('dashboard-chart-container');
                if (chartContainer.style.display !== 'none') {
                    chartContainer.style.display = 'none';
                }
            })
            .catch((error) => console.error("Error removing log: ", error));
    }
}

function editLog(id) {
    const log = logsData.find(l => l.id === id);
    if(!log) return;
    
    editingLogId = id;
    switchTab('new-log', false);
    
    const form = document.getElementById('cvd-form');
    
    // Điền dữ liệu cơ bản
    for (const key in log) {
        if (form.elements[key]) {
            if (form.elements[key].type === 'checkbox') {
                form.elements[key].checked = log[key] === 'on' || log[key] === true;
            } else {
                form.elements[key].value = log[key];
            }
        }
    }
    
    // Khôi phục các bước nâng nhiệt
    resetHeatingSteps();
    for (let i = 2; i <= MAX_HEATING_STEPS; i++) {
        if (log[`heatingTemp_${i}`]) {
            addHeatingStep();
            form.elements[`heatingTemp_${i}`].value = log[`heatingTemp_${i}`];
            form.elements[`heatingTime_${i}`].value = log[`heatingTime_${i}`];
        }
    }
    
    // Bật/tắt Growth section
    const enableGrowth = document.getElementById('enable-growth');
    if (log.hasGrowth || log.hasGrowth === 'on') {
        enableGrowth.checked = true;
    } else {
        enableGrowth.checked = false;
    }
    toggleGrowthSection();
    
    // Đổi nút submit
    form.querySelector('button[type="submit"]').innerHTML = '<i class="fa-solid fa-save"></i> Cập Nhật Nhật Ký';
}

function viewDetails(id) {
    const log = logsData.find(l => l.id === id);
    if(!log) return;
    
    const modalBody = document.getElementById('modal-body');
    modalBody.innerHTML = `
        <div class="detail-grid">
            <div class="detail-item detail-full" style="background: rgba(59, 130, 246, 0.1); border-left: 4px solid #3b82f6;">
                <div class="detail-label">Mã Mẫu</div>
                <div class="detail-value" style="font-size: 1.2rem;">${log.sampleId}</div>
            </div>
            
            <div class="detail-item">
                <div class="detail-label">Ngày / Người làm</div>
                <div class="detail-value">${log.date} - ${log.operator}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Đế (Substrate)</div>
                <div class="detail-value">${log.substrate}</div>
            </div>

            <!-- Giai đoạn Làm Sạch Lò (Purging) -->
            ${(log.purgeAr || log.purgeH2 || log.purgeGas) ? `
            <div class="detail-full mt-4" style="color: #38bdf8; font-weight: 600; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">
                <i class="fa-solid fa-wind"></i> Giai Đoạn Làm Sạch Lò
            </div>
            <div class="detail-item detail-full">
                <div class="detail-label">Lưu lượng và Áp suất khí làm sạch</div>
                <div class="detail-value">
                    ${log.purgeAr ? 'Ar: ' + log.purgeAr + ' sccm (Áp suất: ' + (log.purgeArPressure || 'N/A') + ' bar)<br>' : ''}
                    ${log.purgeH2 ? 'H2: ' + log.purgeH2 + ' sccm (Áp suất: ' + (log.purgeH2Pressure || 'N/A') + ' bar)<br>' : ''}
                    ${log.purgeGas ? '(Khí cũ: '+log.purgeGas+' - '+log.purgeFlow+'sccm)<br>' : ''}
                </div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Thời gian</div>
                <div class="detail-value">${log.purgeTime} phút</div>
            </div>
            ` : ''}

            <!-- Giai đoạn Nâng Nhiệt -->
            <div class="detail-full mt-4" style="color: #f59e0b; font-weight: 600; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">
                <i class="fa-solid fa-fire-flame-curved"></i> Giai Đoạn Nâng Nhiệt
            </div>
            <div class="detail-item detail-full">
                <div class="detail-label">Các bước nâng nhiệt (Nhiệt độ đích - Thời gian)</div>
                <div class="detail-value">
                    ${log.heatingTemp_1 ? 'Bước 1: ' + log.heatingTemp_1 + '°C - ' + log.heatingTime_1 + ' phút<br>' : ''}
                    ${log.heatingTemp_2 ? 'Bước 2: ' + log.heatingTemp_2 + '°C - ' + log.heatingTime_2 + ' phút<br>' : ''}
                    ${log.heatingTemp_3 ? 'Bước 3: ' + log.heatingTemp_3 + '°C - ' + log.heatingTime_3 + ' phút<br>' : ''}
                    ${log.heatingTemp_4 ? 'Bước 4: ' + log.heatingTemp_4 + '°C - ' + log.heatingTime_4 + ' phút<br>' : ''}
                    ${log.heatingTemp_5 ? 'Bước 5: ' + log.heatingTemp_5 + '°C - ' + log.heatingTime_5 + ' phút' : ''}
                </div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Khí sử dụng</div>
                <div class="detail-value">
                    ${log.heatingH2 ? 'H2: ' + log.heatingH2 + ' sccm (' + (log.heatingH2Pressure || 'N/A') + ' bar)<br>' : ''}
                    ${log.heatingAr ? 'Ar: ' + log.heatingAr + ' sccm (' + (log.heatingArPressure || 'N/A') + ' bar)' : ''}
                </div>
            </div>

            <!-- Giai đoạn Ủ -->
            <div class="detail-full mt-4" style="color: var(--accent-color); font-weight: 600; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">
                <i class="fa-solid fa-temperature-arrow-up"></i> Giai Đoạn Ủ
            </div>
            <div class="detail-item">
                <div class="detail-label">Nhiệt độ / Thời gian</div>
                <div class="detail-value">${log.annealTemp}°C / ${log.annealTime} phút</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Khí sử dụng</div>
                <div class="detail-value">
                    ${log.annealH2 ? 'H2: ' + log.annealH2 + ' sccm (' + (log.annealH2Pressure || 'N/A') + ' bar)<br>' : ''}
                    ${log.annealAr ? 'Ar: ' + log.annealAr + ' sccm (' + (log.annealArPressure || 'N/A') + ' bar)' : ''}
                </div>
            </div>

            <!-- Giai đoạn Nuôi -->
            ${log.growthTemp ? `
            <div class="detail-full mt-4" style="color: #10b981; font-weight: 600; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">
                <i class="fa-solid fa-leaf"></i> Giai Đoạn Nuôi Cấy
            </div>
            <div class="detail-item">
                <div class="detail-label">Nhiệt độ / Thời gian</div>
                <div class="detail-value">${log.growthTemp}°C / ${log.growthTime} phút</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Khí sử dụng</div>
                <div class="detail-value">
                    ${log.growthCh4 ? 'CH4: ' + log.growthCh4 + ' sccm (' + (log.growthCh4Pressure || 'N/A') + ' bar)<br>' : ''}
                    ${log.growthH2 ? 'H2: ' + log.growthH2 + ' sccm (' + (log.growthH2Pressure || 'N/A') + ' bar)<br>' : ''}
                    ${log.growthAr ? 'Ar: ' + log.growthAr + ' sccm (' + (log.growthArPressure || 'N/A') + ' bar)' : ''}
                </div>
            </div>
            ` : `
            <div class="detail-full mt-4" style="color: #6b7280; font-style: italic;">
                * Không có giai đoạn nuôi cấy
            </div>
            `}

            <!-- Giai đoạn Nguội -->
            <div class="detail-full mt-4" style="color: #8b5cf6; font-weight: 600; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">
                <i class="fa-solid fa-temperature-arrow-down"></i> Giai Đoạn Làm Nguội
            </div>
            <div class="detail-item">
                <div class="detail-label">Tốc độ làm nguội</div>
                <div class="detail-value">${log.coolingRate}°C/phút</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Khí sử dụng</div>
                <div class="detail-value">
                    ${log.coolingH2 ? 'H2: ' + log.coolingH2 + ' sccm (' + (log.coolingH2Pressure || 'N/A') + ' bar)<br>' : ''}
                    ${log.coolingAr ? 'Ar: ' + log.coolingAr + ' sccm (' + (log.coolingArPressure || 'N/A') + ' bar)' : ''}
                </div>
            </div>
            
            ${log.notes ? `
            <div class="detail-item detail-full mt-4" style="background: rgba(255, 193, 7, 0.1);">
                <div class="detail-label">Ghi chú</div>
                <div class="detail-value" style="font-weight: 400;">${log.notes}</div>
            </div>
            ` : ''}
            
            <div class="detail-full mt-4">
                <div class="detail-label" style="margin-bottom: 8px;"><i class="fa-solid fa-chart-line"></i> Đồ thị nhiệt độ theo thời gian</div>
                <div style="height: 300px; width: 100%; background: rgba(0,0,0,0.2); border-radius: 8px; padding: 10px;">
                    <canvas id="temperatureChart"></canvas>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('detail-modal').style.display = 'flex';
    
    // Slight delay to ensure modal is visible before rendering chart
    setTimeout(() => renderTemperatureChart(log), 50);
}

function closeModal() {
    document.getElementById('detail-modal').style.display = 'none';
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('detail-modal');
    if (event.target == modal) {
        closeModal();
    }
}

// Export Excel
function exportData() {
    if(logsData.length === 0) {
        alert("Không có dữ liệu để xuất!");
        return;
    }
    
    let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<style>
    table { font-family: 'Times New Roman', Times, serif; border-collapse: collapse; }
    td, th { border: 1px solid black; padding: 5px; text-align: center; vertical-align: middle; }
    th { background-color: #f2f2f2; font-weight: bold; }
</style>
</head>
<body>
<table>
    <thead>
        <tr>
            <th rowspan="2">Mã Mẫu</th>
            <th rowspan="2">Ngày Tháng</th>
            <th rowspan="2">Người Thực Hiện</th>
            <th rowspan="2">Loại Đế</th>
            <th colspan="5">Giai Đoạn Làm Sạch Lò</th>
            <th colspan="14">Giai Đoạn Nâng Nhiệt</th>
            <th colspan="6">Giai Đoạn Ủ</th>
            <th colspan="8">Giai Đoạn Nuôi Cấy</th>
            <th colspan="5">Giai Đoạn Làm Nguội</th>
            <th rowspan="2">Ghi Chú</th>
        </tr>
        <tr>
            <th>Ar (sccm)</th><th>P_Ar (bar)</th><th>H2 (sccm)</th><th>P_H2 (bar)</th><th>Thời gian (phút)</th>
            
            <th>Nhiệt độ 1 (°C)</th><th>Thời gian 1 (p)</th>
            <th>Nhiệt độ 2 (°C)</th><th>Thời gian 2 (p)</th>
            <th>Nhiệt độ 3 (°C)</th><th>Thời gian 3 (p)</th>
            <th>Nhiệt độ 4 (°C)</th><th>Thời gian 4 (p)</th>
            <th>Nhiệt độ 5 (°C)</th><th>Thời gian 5 (p)</th>
            <th>H2 (sccm)</th><th>P_H2 (bar)</th><th>Ar (sccm)</th><th>P_Ar (bar)</th>
            
            <th>Nhiệt độ (°C)</th><th>Thời gian (p)</th><th>H2 (sccm)</th><th>P_H2 (bar)</th><th>Ar (sccm)</th><th>P_Ar (bar)</th>
            
            <th>Nhiệt độ (°C)</th><th>Thời gian (p)</th><th>CH4 (sccm)</th><th>P_CH4 (bar)</th><th>H2 (sccm)</th><th>P_H2 (bar)</th><th>Ar (sccm)</th><th>P_Ar (bar)</th>
            
            <th>Tốc độ (°C/p)</th><th>H2 (sccm)</th><th>P_H2 (bar)</th><th>Ar (sccm)</th><th>P_Ar (bar)</th>
        </tr>
    </thead>
    <tbody>`;

    for(const log of logsData) {
        const rowData = [
            log.sampleId, log.date, log.operator, log.substrate,
            
            log.purgeAr, log.purgeArPressure, log.purgeH2, log.purgeH2Pressure, log.purgeTime,
            
            log.heatingTemp_1, log.heatingTime_1, log.heatingTemp_2, log.heatingTime_2, log.heatingTemp_3, log.heatingTime_3, log.heatingTemp_4, log.heatingTime_4, log.heatingTemp_5, log.heatingTime_5,
            log.heatingH2, log.heatingH2Pressure, log.heatingAr, log.heatingArPressure,
            
            log.annealTemp, log.annealTime, log.annealH2, log.annealH2Pressure, log.annealAr, log.annealArPressure,
            
            log.growthTemp, log.growthTime, log.growthCh4, log.growthCh4Pressure, log.growthH2, log.growthH2Pressure, log.growthAr, log.growthArPressure,
            
            log.coolingRate, log.coolingH2, log.coolingH2Pressure, log.coolingAr, log.coolingArPressure, 
            
            log.notes
        ];
        
        html += '<tr>';
        rowData.forEach(val => {
            const displayVal = (val !== undefined && val !== null && val !== '') ? String(val).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') : '';
            html += `<td>${displayVal}</td>`;
        });
        html += '</tr>';
    }

    html += `</tbody></table></body></html>`;
    
    // Create Blob and download
    const blob = new Blob(["\ufeff", html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Graphene_CVD_Log_${new Date().toISOString().slice(0,10)}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Global variable to keep track of chart instances
let tempChartInstance = null;
let dashboardChartInstance = null;
let dashboardGasChartInstance = null;
let dashboardPressureChartInstance = null;

function getTimeline(log) {
    let currentTime = 0;
    const timeline = [];

    // Purge
    if (log.purgeTime) {
        timeline.push({
            time: currentTime, duration: Number(log.purgeTime), phase: 'Làm sạch',
            arFlow: Number(log.purgeAr||0), arPress: Number(log.purgeArPressure||0),
            h2Flow: Number(log.purgeH2||0), h2Press: Number(log.purgeH2Pressure||0),
            ch4Flow: 0, ch4Press: 0
        });
        currentTime += Number(log.purgeTime);
    }
    
    // Heating
    for (let i = 1; i <= 5; i++) {
        if (log[`heatingTemp_${i}`] && log[`heatingTime_${i}`]) {
            const timeSpan = Number(log[`heatingTime_${i}`]);
            timeline.push({
                time: currentTime, duration: timeSpan, phase: `Nâng nhiệt bước ${i}`,
                arFlow: Number(log.heatingAr||0), arPress: Number(log.heatingArPressure||0),
                h2Flow: Number(log.heatingH2||0), h2Press: Number(log.heatingH2Pressure||0),
                ch4Flow: 0, ch4Press: 0
            });
            currentTime += timeSpan;
        }
    }

    // Annealing
    if (log.annealTime && log.annealTemp) {
        timeline.push({
            time: currentTime, duration: Number(log.annealTime), phase: 'Ủ',
            arFlow: Number(log.annealAr||0), arPress: Number(log.annealArPressure||0),
            h2Flow: Number(log.annealH2||0), h2Press: Number(log.annealH2Pressure||0),
            ch4Flow: 0, ch4Press: 0
        });
        currentTime += Number(log.annealTime);
    }
    
    // Growth
    if (log.growthTime && log.growthTemp) {
        timeline.push({
            time: currentTime, duration: Number(log.growthTime), phase: 'Nuôi cấy',
            arFlow: Number(log.growthAr||0), arPress: Number(log.growthArPressure||0),
            h2Flow: Number(log.growthH2||0), h2Press: Number(log.growthH2Pressure||0),
            ch4Flow: Number(log.growthCh4||0), ch4Press: Number(log.growthCh4Pressure||0)
        });
        currentTime += Number(log.growthTime);
    }

    // Cooling
    if (log.coolingRate && Number(log.coolingRate) > 0) {
        let maxTemp = 25;
        if (log.growthTemp) maxTemp = Number(log.growthTemp);
        else if (log.annealTemp) maxTemp = Number(log.annealTemp);
        else maxTemp = Number(log.heatingTemp_1 || 25);
        
        let tempDiff = maxTemp - 25;
        if (tempDiff > 0) {
            let coolingTime = tempDiff / Number(log.coolingRate);
            timeline.push({
                time: currentTime, duration: coolingTime, phase: 'Làm nguội',
                arFlow: Number(log.coolingAr||0), arPress: Number(log.coolingArPressure||0),
                h2Flow: Number(log.coolingH2||0), h2Press: Number(log.coolingH2Pressure||0),
                ch4Flow: 0, ch4Press: 0
            });
            currentTime += coolingTime;
        }
    }

    // Add a final point so stepped line can draw horizontal line to the end
    timeline.push({
        time: currentTime, duration: 0, phase: 'Kết thúc',
        arFlow: 0, arPress: 0, h2Flow: 0, h2Press: 0, ch4Flow: 0, ch4Press: 0
    });

    return timeline;
}

function extractGasDatasets(log, isPressure) {
    const timeline = getTimeline(log);
    const ar = [], h2 = [], ch4 = [];
    
    for (const step of timeline) {
        const arVal = isPressure ? step.arPress : step.arFlow;
        const h2Val = isPressure ? step.h2Press : step.h2Flow;
        const ch4Val = isPressure ? step.ch4Press : step.ch4Flow;
        
        // Point at start of phase
        ar.push({ x: step.time, y: arVal, phase: step.phase });
        h2.push({ x: step.time, y: h2Val, phase: step.phase });
        ch4.push({ x: step.time, y: ch4Val, phase: step.phase });

        // Point at end of phase to create the horizontal stepped line manually
        if (step.duration > 0) {
            ar.push({ x: step.time + step.duration, y: arVal, phase: step.phase });
            h2.push({ x: step.time + step.duration, y: h2Val, phase: step.phase });
            ch4.push({ x: step.time + step.duration, y: ch4Val, phase: step.phase });
        }
    }
    
    return { ar, h2, ch4 };
}

function getChartDataPoints(log) {
    let currentTime = 0;
    let currentTemp = 25; // Assume room temp
    
    const dataPoints = [];
    // Start point
    dataPoints.push({ x: currentTime, y: currentTemp, phase: 'Bắt đầu' });

    // 1. Purge (Làm sạch)
    if (log.purgeTime) {
        currentTime += Number(log.purgeTime);
        dataPoints.push({ x: currentTime, y: currentTemp, phase: 'Làm sạch' });
    }

    // 2. Heating (Nâng nhiệt)
    for (let i = 1; i <= 5; i++) {
        if (log[`heatingTemp_${i}`] && log[`heatingTime_${i}`]) {
            currentTime += Number(log[`heatingTime_${i}`]);
            currentTemp = Number(log[`heatingTemp_${i}`]);
            dataPoints.push({ x: currentTime, y: currentTemp, phase: `Nâng nhiệt bước ${i}` });
        }
    }

    // 3. Annealing (Ủ)
    if (log.annealTime && log.annealTemp) {
        if (currentTemp !== Number(log.annealTemp)) {
            currentTemp = Number(log.annealTemp);
            dataPoints.push({ x: currentTime, y: currentTemp, phase: 'Bắt đầu Ủ' });
        }
        currentTime += Number(log.annealTime);
        dataPoints.push({ x: currentTime, y: currentTemp, phase: 'Kết thúc Ủ' });
    }

    // 4. Growth (Nuôi cấy)
    if (log.growthTime && log.growthTemp) {
        if (currentTemp !== Number(log.growthTemp)) {
            currentTemp = Number(log.growthTemp);
            dataPoints.push({ x: currentTime, y: currentTemp, phase: 'Bắt đầu Nuôi cấy' });
        }
        currentTime += Number(log.growthTime);
        dataPoints.push({ x: currentTime, y: currentTemp, phase: 'Kết thúc Nuôi cấy' });
    }

    // 5. Cooling (Làm nguội)
    if (log.coolingRate) {
        const rate = Number(log.coolingRate);
        if (rate > 0) {
            const tempDiff = currentTemp - 25;
            if (tempDiff > 0) {
                const coolingTime = tempDiff / rate;
                currentTime += coolingTime;
                currentTemp = 25;
                dataPoints.push({ x: currentTime, y: currentTemp, phase: 'Làm nguội' });
            }
        }
    }
    
    return dataPoints;
}

function renderChart(log, canvasId, existingInstance) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    
    const ctx = canvas.getContext('2d');
    if (existingInstance) {
        existingInstance.destroy();
    }

    const dataPoints = getChartDataPoints(log);

    return new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Nhiệt độ (°C)',
                data: dataPoints,
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                borderWidth: 2,
                pointBackgroundColor: '#ef4444',
                pointBorderColor: '#fff',
                pointRadius: 5,
                pointHoverRadius: 7,
                showLine: true,
                fill: true,
                tension: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    title: {
                        display: true,
                        text: 'Thời gian (phút)',
                        color: 'rgba(255,255,255,0.7)',
                        font: { size: 14 }
                    },
                    ticks: { color: 'rgba(255,255,255,0.7)' },
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    min: 0
                },
                y: {
                    title: {
                        display: true,
                        text: 'Nhiệt độ (°C)',
                        color: 'rgba(255,255,255,0.7)',
                        font: { size: 14 }
                    },
                    ticks: { color: 'rgba(255,255,255,0.7)' },
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    beginAtZero: true
                }
            },
            plugins: {
                legend: {
                    labels: { color: 'rgba(255,255,255,0.9)' }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const dp = dataPoints[context.dataIndex];
                            return `${dp.phase}: ${dp.y}°C tại ${dp.x.toFixed(1)} phút`;
                        }
                    }
                }
            }
        }
    });
}

function renderMultiLineChart(log, canvasId, existingInstance, isPressure) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    
    const ctx = canvas.getContext('2d');
    if (existingInstance) {
        existingInstance.destroy();
    }

    const datasetsInfo = extractGasDatasets(log, isPressure);
    const unit = isPressure ? ' (bar)' : ' (sccm)';

    return new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [
                {
                    label: 'Ar' + unit,
                    data: datasetsInfo.ar,
                    borderColor: '#3b82f6', // blue
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    pointRadius: 2,
                    fill: false
                },
                {
                    label: 'H2' + unit,
                    data: datasetsInfo.h2,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 2,
                    pointRadius: 2,
                    fill: false
                },
                {
                    label: 'CH4' + unit,
                    data: datasetsInfo.ch4,
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    borderWidth: 2,
                    pointRadius: 2,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    title: {
                        display: true,
                        text: 'Thời gian (phút)',
                        color: 'rgba(255,255,255,0.7)',
                        font: { size: 14 }
                    },
                    ticks: { color: 'rgba(255,255,255,0.7)' },
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    min: 0
                },
                y: {
                    title: {
                        display: true,
                        text: isPressure ? 'Áp suất (bar)' : 'Lưu lượng (sccm)',
                        color: 'rgba(255,255,255,0.7)',
                        font: { size: 14 }
                    },
                    ticks: { color: 'rgba(255,255,255,0.7)' },
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    beginAtZero: true
                }
            },
            plugins: {
                legend: {
                    labels: { color: 'rgba(255,255,255,0.9)' }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const dp = context.raw;
                            return `${context.dataset.label}: ${dp.y} tại ${dp.phase} (${dp.x.toFixed(1)} phút)`;
                        }
                    }
                }
            }
        }
    });
}

function renderTemperatureChart(log) {
    tempChartInstance = renderChart(log, 'temperatureChart', tempChartInstance);
}

function renderDashboardChart(log) {
    document.getElementById('dashboard-chart-container').style.display = 'block';
    document.getElementById('dashboard-chart-title').textContent = log.sampleId;
    
    // Render Temperature
    dashboardChartInstance = renderChart(log, 'dashboardTemperatureChart', dashboardChartInstance);
    
    // Render Gas Flows
    dashboardGasChartInstance = renderMultiLineChart(log, 'dashboardGasChart', dashboardGasChartInstance, false);
    
    // Render Pressures
    dashboardPressureChartInstance = renderMultiLineChart(log, 'dashboardPressureChart', dashboardPressureChartInstance, true);
}

// Compare Mode Logic
let compareChartInstance = null;
const compareColors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f43f5e', '#6366f1'];

function renderCompareLogList() {
    const listContainer = document.getElementById('compare-log-list');
    listContainer.innerHTML = '';
    
    if (logsData.length === 0) {
        listContainer.innerHTML = '<p style="color: rgba(255,255,255,0.5);">Chưa có dữ liệu</p>';
        return;
    }

    const displayLogs = [...logsData].reverse();
    
    displayLogs.forEach((log, index) => {
        const item = document.createElement('label');
        item.className = 'compare-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = log.id;
        checkbox.onchange = updateCompareChart;
        
        // Auto-select first two for demonstration if available
        if (index < 2) checkbox.checked = true;
        
        item.appendChild(checkbox);
        item.appendChild(document.createTextNode(` ${log.sampleId} (${log.date})`));
        listContainer.appendChild(item);
    });
    
    updateCompareChart();
}

function updateCompareChart() {
    const param = document.getElementById('compare-parameter').value;
    const checkboxes = document.querySelectorAll('#compare-log-list input[type="checkbox"]:checked');
    
    if (checkboxes.length > 10) {
        alert("Bạn đã chọn hơn 10 mẻ. Biểu đồ có thể hơi rối.");
    }
    
    const selectedIds = Array.from(checkboxes).map(cb => cb.value);
    const selectedLogs = logsData.filter(l => selectedIds.includes(l.id));
    
    const canvas = document.getElementById('compareChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (compareChartInstance) {
        compareChartInstance.destroy();
    }
    
    if (selectedLogs.length === 0) return;
    
    const datasets = [];
    
    let isStepped = false;
    let yAxisTitle = '';
    
    if (param === 'temp') {
        yAxisTitle = 'Nhiệt độ (°C)';
    } else if (param.startsWith('flow_')) {
        yAxisTitle = 'Lưu lượng (sccm)';
        isStepped = true;
    } else if (param.startsWith('pressure_')) {
        yAxisTitle = 'Áp suất (bar)';
        isStepped = true;
    }
    
    selectedLogs.forEach((log, index) => {
        let dataPoints = [];
        if (param === 'temp') {
            dataPoints = getChartDataPoints(log);
        } else {
            const isPressure = param.startsWith('pressure_');
            const gasInfo = extractGasDatasets(log, isPressure);
            if (param.endsWith('_ar')) dataPoints = gasInfo.ar;
            else if (param.endsWith('_h2')) dataPoints = gasInfo.h2;
            else if (param.endsWith('_ch4')) dataPoints = gasInfo.ch4;
        }
        
        const color = compareColors[index % compareColors.length];
        
        datasets.push({
            label: log.sampleId,
            data: dataPoints,
            borderColor: color,
            backgroundColor: color + '33', // 20% opacity
            borderWidth: 2,
            pointRadius: param === 'temp' ? 4 : 2,
            showLine: true,
            fill: false
        });
    });
    
    compareChartInstance = new Chart(ctx, {
        type: param === 'temp' ? 'scatter' : 'line',
        data: { datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: 'Thời gian (phút)', color: 'rgba(255,255,255,0.7)', font: { size: 14 } },
                    ticks: { color: 'rgba(255,255,255,0.7)' },
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    min: 0
                },
                y: {
                    title: { display: true, text: yAxisTitle, color: 'rgba(255,255,255,0.7)', font: { size: 14 } },
                    ticks: { color: 'rgba(255,255,255,0.7)' },
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    beginAtZero: true
                }
            },
            plugins: {
                legend: { labels: { color: 'rgba(255,255,255,0.9)' } },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const dp = context.raw;
                            if(param === 'temp') {
                                return `${context.dataset.label}: ${dp.y}°C tại ${dp.phase} (${dp.x.toFixed(1)} phút)`;
                            } else {
                                return `${context.dataset.label}: ${dp.y} tại ${dp.phase} (${dp.x.toFixed(1)} phút)`;
                            }
                        }
                    }
                }
            }
        }
    });
}
