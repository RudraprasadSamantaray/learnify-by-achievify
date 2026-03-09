// Check authentication
checkAuth();

// Global variables
let currentWeekOffset = 0;
let selectedDay = 'monday';
let selectedDate = new Date();
let currentMonth = new Date();
let attendanceData = {}; // Store attendance by date

async function checkAuth() {
    try {
        const response = await fetch('/api/check-session');
        const data = await response.json();
        
        if (!data.loggedIn) {
            window.location.href = '/login.html';
            return;
        }
        
        if (data.is_admin) {
            window.location.href = '/admin-dashboard.html';
            return;
        }
        
        document.getElementById('userInfo').textContent = `User: ${data.mobile_number}`;
        
        // Load all data
        loadAttendanceStats();
        setInitialDate();
        loadCalendar();
        loadLectures();
    } catch (error) {
        console.error('Auth check error:', error);
        window.location.href = '/login.html';
    }
}

// Logout
document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/login.html';
    } catch (error) {
        console.error('Logout error:', error);
        window.location.href = '/login.html';
    }
});

// ==================== ATTENDANCE STATISTICS ====================

async function loadAttendanceStats() {
    try {
        const response = await fetch('/api/atrack/stats');
        const data = await response.json();
        
        if (data.success) {
            const stats = data.stats;
            
            // Update summary numbers
            document.getElementById('totalLectures').textContent = stats.total_lectures;
            document.getElementById('presentCount').textContent = stats.present;
            document.getElementById('absentCount').textContent = stats.absent;
            document.getElementById('cancelledCount').textContent = stats.cancelled;
            
            // Update percentage
            const percentage = stats.percentage;
            document.getElementById('overallPercentage').textContent = percentage.toFixed(1) + '%';
            
            // Update progress circle
            updateProgressCircle(percentage);
        }
    } catch (error) {
        console.error('Load stats error:', error);
    }
}

function updateProgressCircle(percentage) {
    const circle = document.getElementById('progressCircle');
    const radius = 85;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percentage / 100) * circumference;
    
    circle.style.strokeDashoffset = offset;
    
    // Change color based on percentage
    if (percentage >= 75) {
        circle.style.stroke = '#10b981'; // Green
    } else if (percentage >= 60) {
        circle.style.stroke = '#f59e0b'; // Orange
    } else {
        circle.style.stroke = '#ef4444'; // Red
    }
}

// ==================== DATE & WEEK MANAGEMENT ====================

function setInitialDate() {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    // Map to our day names
    const dayMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    selectedDay = dayOfWeek === 0 ? 'monday' : dayMap[dayOfWeek];
    
    // Update selected date
    selectedDate = getDateForDay(selectedDay, currentWeekOffset);
    
    // Highlight active day
    document.querySelectorAll('.day-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.day === selectedDay);
    });
    
    updateCurrentDateDisplay();
}

function getDateForDay(day, weekOffset = 0) {
    const today = new Date();
    const currentDay = today.getDay();
    
    // Get start of current week (Monday)
    const monday = new Date(today);
    monday.setDate(today.getDate() - (currentDay === 0 ? 6 : currentDay - 1));
    
    // Add week offset
    monday.setDate(monday.getDate() + (weekOffset * 7));
    
    // Add day offset
    const dayOffsets = {
        'monday': 0,
        'tuesday': 1,
        'wednesday': 2,
        'thursday': 3,
        'friday': 4,
        'saturday': 5
    };
    
    const targetDate = new Date(monday);
    targetDate.setDate(monday.getDate() + dayOffsets[day]);
    
    return targetDate;
}

function updateCurrentDateDisplay() {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('currentDate').textContent = selectedDate.toLocaleDateString('en-US', options);
}

// Day selection
document.querySelectorAll('.day-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        selectedDay = btn.dataset.day;
        selectedDate = getDateForDay(selectedDay, currentWeekOffset);
        
        document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        updateCurrentDateDisplay();
        loadLectures();
    });
});

// Week navigation
document.getElementById('prevWeek').addEventListener('click', () => {
    currentWeekOffset--;
    selectedDate = getDateForDay(selectedDay, currentWeekOffset);
    updateCurrentDateDisplay();
    loadLectures();
});

document.getElementById('nextWeek').addEventListener('click', () => {
    currentWeekOffset++;
    selectedDate = getDateForDay(selectedDay, currentWeekOffset);
    updateCurrentDateDisplay();
    loadLectures();
});

// ==================== CALENDAR INTEGRATION ====================

async function loadCalendar() {
    await loadMonthAttendance();
    renderCalendar();
}

async function loadMonthAttendance() {
    const year = currentMonth.getFullYear();
    const month = String(currentMonth.getMonth() + 1).padStart(2, '0');
    const startDate = `${year}-${month}-01`;
    const endDate = new Date(year, currentMonth.getMonth() + 1, 0);
    const endDateStr = endDate.toISOString().split('T')[0];
    
    try {
        // Get all days in month with attendance
        const promises = [];
        const currentDate = new Date(startDate);
        
        while (currentDate <= endDate) {
            const dateStr = currentDate.toISOString().split('T')[0];
            const dayOfWeek = currentDate.getDay();
            const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dayOfWeek];
            
            if (dayOfWeek !== 0) { // Skip Sundays
                promises.push(
                    fetch(`/api/atrack/timetable/${dayName}?date=${dateStr}`)
                        .then(res => res.json())
                        .then(data => ({ date: dateStr, lectures: data.lectures || [] }))
                );
            }
            
            currentDate.setDate(currentDate.getDate() + 1);
        }
        
        const results = await Promise.all(promises);
        
        // Build attendance data map
        attendanceData = {};
        results.forEach(result => {
            const { date, lectures } = result;
            if (lectures.length > 0) {
                const attended = lectures.filter(l => l.attendance_status === 'present').length;
                const total = lectures.filter(l => l.attendance_status !== null).length;
                const cancelled = lectures.filter(l => l.attendance_status === 'cancelled').length;
                
                attendanceData[date] = {
                    total: lectures.length,
                    attended,
                    marked: total,
                    cancelled,
                    lectures
                };
            }
        });
    } catch (error) {
        console.error('Load month attendance error:', error);
    }
}

function renderCalendar() {
    const container = document.getElementById('attendanceCalendar');
    const monthLabel = document.getElementById('currentMonthYear');
    
    monthLabel.textContent = currentMonth.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
    });
    
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    
    let html = '<div class="calendar-grid">';
    
    // Day headers
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayNames.forEach(day => {
        html += `<div class="calendar-day-header">${day}</div>`;
    });
    
    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
        html += `<div class="calendar-day other-month"></div>`;
    }
    
    // Days of month
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dateStr = date.toISOString().split('T')[0];
        const isToday = date.toDateString() === today.toDateString();
        const isSelected = date.toDateString() === selectedDate.toDateString();
        const dayOfWeek = date.getDay();
        
        // Skip Sundays
        if (dayOfWeek === 0) {
            html += `<div class="calendar-day other-month">${day}</div>`;
            continue;
        }
        
        const dayData = attendanceData[dateStr];
        let attendanceIndicator = '';
        let hasAttendance = '';
        
        if (dayData && dayData.marked > 0) {
            hasAttendance = 'has-attendance';
            const percentage = dayData.cancelled > 0 
                ? (dayData.attended / (dayData.marked - dayData.cancelled)) * 100
                : (dayData.attended / dayData.marked) * 100;
            
            let indicatorClass = 'calendar-day-attendance';
            if (percentage >= 75) {
                indicatorClass += '';
            } else if (percentage >= 50) {
                indicatorClass += ' partial';
            } else {
                indicatorClass += ' poor';
            }
            
            attendanceIndicator = `<div class="${indicatorClass}"></div>`;
        }
        
        html += `
            <div class="calendar-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${hasAttendance}" 
                 onclick="selectCalendarDate('${dateStr}')">
                <div class="calendar-day-number">${day}</div>
                ${attendanceIndicator}
            </div>
        `;
    }
    
    html += '</div>';
    container.innerHTML = html;
}

function selectCalendarDate(dateStr) {
    selectedDate = new Date(dateStr + 'T00:00:00');
    const dayOfWeek = selectedDate.getDay();
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    selectedDay = dayNames[dayOfWeek];
    
    // Update week offset based on selected date
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1));
    
    const selectedMonday = new Date(selectedDate);
    selectedMonday.setDate(selectedDate.getDate() - (selectedDate.getDay() === 0 ? 6 : selectedDate.getDay() - 1));
    
    const diffTime = selectedMonday - monday;
    const diffWeeks = Math.round(diffTime / (7 * 24 * 60 * 60 * 1000));
    currentWeekOffset = diffWeeks;
    
    // Update UI
    document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.day-btn').forEach(btn => {
        if (btn.dataset.day === selectedDay) {
            btn.classList.add('active');
        }
    });
    
    updateCurrentDateDisplay();
    renderCalendar();
    loadLectures();
}

window.selectCalendarDate = selectCalendarDate;

// Calendar navigation
document.getElementById('prevMonth').addEventListener('click', () => {
    currentMonth.setMonth(currentMonth.getMonth() - 1);
    loadCalendar();
});

document.getElementById('nextMonth').addEventListener('click', () => {
    currentMonth.setMonth(currentMonth.getMonth() + 1);
    loadCalendar();
});

// ==================== LECTURES ====================

async function loadLectures() {
    const container = document.getElementById('lecturesList');
    
    try {
        const dateStr = selectedDate.toISOString().split('T')[0];
        const response = await fetch(`/api/atrack/timetable/${selectedDay}?date=${dateStr}`);
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message);
        }
        
        const lectures = data.lectures;
        
        if (lectures.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    <h3>No Lectures Scheduled</h3>
                    <p>Click "Add/Edit Timetable" to add lectures for this day.</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        lectures.forEach(lecture => {
            const status = lecture.attendance_status;
            
            html += `
                <div class="lecture-card">
                    <div class="lecture-header">
                        <div class="lecture-info">
                            <h3>${escapeHtml(lecture.subject_name)}</h3>
                            <div class="lecture-time">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <polyline points="12 6 12 12 16 14"></polyline>
                                </svg>
                                ${formatTime(lecture.start_time)} - ${formatTime(lecture.end_time)}
                            </div>
                        </div>
                        <div class="attendance-options">
                            <button class="attendance-btn present ${status === 'present' ? 'active' : ''}" 
                                    onclick="markAttendance(${lecture.id}, 'present')">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                                Present
                            </button>
                            <button class="attendance-btn absent ${status === 'absent' ? 'active' : ''}" 
                                    onclick="markAttendance(${lecture.id}, 'absent')">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                                Absent
                            </button>
                            <button class="attendance-btn cancelled ${status === 'cancelled' ? 'active' : ''}" 
                                    onclick="markAttendance(${lecture.id}, 'cancelled')">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <line x1="15" y1="9" x2="9" y2="15"></line>
                                    <line x1="9" y1="9" x2="15" y2="15"></line>
                                </svg>
                                Cancelled
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    } catch (error) {
        console.error('Load lectures error:', error);
        container.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <h3>Error Loading Lectures</h3>
                <p>Please refresh the page.</p>
            </div>
        `;
    }
}

// Mark attendance
async function markAttendance(timetableId, status) {
    const dateStr = selectedDate.toISOString().split('T')[0];
    
    try {
        const response = await fetch('/api/atrack/attendance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                timetable_id: timetableId,
                lecture_date: dateStr,
                status: status
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast(`Marked as ${status}`, 'success');
            loadLectures();
            loadAttendanceStats(); // Refresh overall stats
            loadCalendar(); // Refresh calendar
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        console.error('Mark attendance error:', error);
        showToast('Failed to mark attendance', 'error');
    }
}

window.markAttendance = markAttendance;

// ==================== TIMETABLE MANAGEMENT ====================

document.getElementById('editTimetableBtn').addEventListener('click', () => {
    document.getElementById('timetableModal').style.display = 'flex';
    loadTimetableList();
});

function closeTimetableModal() {
    document.getElementById('timetableModal').style.display = 'none';
}

window.closeTimetableModal = closeTimetableModal;

// Add lecture
document.getElementById('addLectureForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const day = document.getElementById('lectureDay').value;
    const subject = document.getElementById('lectureSubject').value.trim();
    const startTime = document.getElementById('lectureStartTime').value;
    const endTime = document.getElementById('lectureEndTime').value;
    
    try {
        const response = await fetch('/api/atrack/timetable', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                day_of_week: day,
                subject_name: subject,
                start_time: startTime,
                end_time: endTime
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Lecture added successfully - Will repeat every week!', 'success');
            document.getElementById('addLectureForm').reset();
            loadTimetableList();
            loadLectures(); // Refresh if current day
            loadCalendar(); // Refresh calendar
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        console.error('Add lecture error:', error);
        showToast('Failed to add lecture', 'error');
    }
});

async function loadTimetableList() {
    try {
        const response = await fetch('/api/atrack/timetable');
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message);
        }
        
        const container = document.getElementById('timetableList');
        const timetable = data.timetable;
        
        if (timetable.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No lectures in timetable yet.</p>';
            return;
        }
        
        // Group by day
        const grouped = {};
        timetable.forEach(lecture => {
            if (!grouped[lecture.day_of_week]) {
                grouped[lecture.day_of_week] = [];
            }
            grouped[lecture.day_of_week].push(lecture);
        });
        
        let html = '';
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        
        days.forEach(day => {
            if (grouped[day]) {
                html += `
                    <div class="timetable-day-group">
                        <div class="timetable-day-header">${capitalize(day)}</div>
                `;
                
                grouped[day].forEach(lecture => {
                    html += `
                        <div class="timetable-item">
                            <div class="timetable-item-info">
                                <div class="timetable-subject">
                                    ${escapeHtml(lecture.subject_name)}
                                    <span style="font-size: 11px; color: var(--text-secondary); margin-left: 8px;">🔁 Repeats weekly</span>
                                </div>
                                <div class="timetable-time">${formatTime(lecture.start_time)} - ${formatTime(lecture.end_time)}</div>
                            </div>
                            <div class="timetable-actions">
                                <button class="btn-icon-small" onclick="deleteLecture(${lecture.id})" title="Delete">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <polyline points="3 6 5 6 21 6"></polyline>
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    `;
                });
                
                html += '</div>';
            }
        });
        
        container.innerHTML = html;
    } catch (error) {
        console.error('Load timetable error:', error);
    }
}

async function deleteLecture(id) {
    if (!confirm('Delete this lecture from timetable?')) return;
    
    try {
        const response = await fetch(`/api/atrack/timetable/${id}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Lecture deleted from all weeks', 'success');
            loadTimetableList();
            loadLectures();
            loadCalendar();
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        console.error('Delete lecture error:', error);
        showToast('Failed to delete lecture', 'error');
    }
}

window.deleteLecture = deleteLecture;

// ==================== REPORTS ====================

// Weekly Report
document.getElementById('viewWeeklyReport').addEventListener('click', async () => {
    document.getElementById('weeklyReportModal').style.display = 'flex';
    
    try {
        const response = await fetch('/api/atrack/weekly-report?weeks=8');
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message);
        }
        
        const container = document.getElementById('weeklyReportContent');
        const weeks = data.weekly_data;
        
        if (weeks.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No attendance data yet.</p>';
            return;
        }
        
        let html = '';
        weeks.forEach(week => {
            html += `
                <div class="report-week">
                    <div class="report-week-header">
                        <div class="week-date-range">
                            ${formatDate(week.week_start)} - ${formatDate(week.week_end)}
                        </div>
                        <div class="week-percentage">${week.percentage.toFixed(1)}%</div>
                    </div>
                    <div class="week-stats">
                        <div class="week-stat">
                            <div class="week-stat-value">${week.conducted}</div>
                            <div class="week-stat-label">Conducted</div>
                        </div>
                        <div class="week-stat">
                            <div class="week-stat-value" style="color: #10b981">${week.present}</div>
                            <div class="week-stat-label">Present</div>
                        </div>
                        <div class="week-stat">
                            <div class="week-stat-value" style="color: #ef4444">${week.absent}</div>
                            <div class="week-stat-label">Absent</div>
                        </div>
                        <div class="week-stat">
                            <div class="week-stat-value" style="color: #f59e0b">${week.cancelled}</div>
                            <div class="week-stat-label">Cancelled</div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    } catch (error) {
        console.error('Load weekly report error:', error);
        document.getElementById('weeklyReportContent').innerHTML = 
            '<p style="text-align: center; color: var(--danger-color);">Error loading report.</p>';
    }
});

function closeWeeklyReportModal() {
    document.getElementById('weeklyReportModal').style.display = 'none';
}

window.closeWeeklyReportModal = closeWeeklyReportModal;

// Subject-wise Report
document.getElementById('viewSubjectWise').addEventListener('click', async () => {
    document.getElementById('subjectWiseModal').style.display = 'flex';
    
    try {
        const response = await fetch('/api/atrack/subject-wise');
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message);
        }
        
        const container = document.getElementById('subjectWiseContent');
        const subjects = data.subjects;
        
        if (subjects.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No subjects added yet.</p>';
            return;
        }
        
        let html = '';
        subjects.forEach(subject => {
            const percentage = subject.percentage;
            const color = percentage >= 75 ? '#10b981' : percentage >= 60 ? '#f59e0b' : '#ef4444';
            
            html += `
                <div class="subject-card" style="border-left-color: ${color}">
                    <div class="subject-header">
                        <div class="subject-name-large">${escapeHtml(subject.subject_name)}</div>
                        <div class="subject-percentage" style="color: ${color}">${percentage.toFixed(1)}%</div>
                    </div>
                    <div class="subject-stats">
                        <div class="subject-stat">
                            <div class="subject-stat-value">${subject.conducted}</div>
                            <div class="subject-stat-label">Conducted</div>
                        </div>
                        <div class="subject-stat">
                            <div class="subject-stat-value" style="color: #10b981">${subject.present}</div>
                            <div class="subject-stat-label">Present</div>
                        </div>
                        <div class="subject-stat">
                            <div class="subject-stat-value" style="color: #ef4444">${subject.absent}</div>
                            <div class="subject-stat-label">Absent</div>
                        </div>
                        <div class="subject-stat">
                            <div class="subject-stat-value" style="color: #f59e0b">${subject.cancelled}</div>
                            <div class="subject-stat-label">Cancelled</div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    } catch (error) {
        console.error('Load subject-wise error:', error);
        document.getElementById('subjectWiseContent').innerHTML = 
            '<p style="text-align: center; color: var(--danger-color);">Error loading data.</p>';
    }
});

function closeSubjectWiseModal() {
    document.getElementById('subjectWiseModal').style.display = 'none';
}

window.closeSubjectWiseModal = closeSubjectWiseModal;

// Close modals on background click
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
});

// ==================== UTILITY FUNCTIONS ====================

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(timeString) {
    if (!timeString) return '';
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}