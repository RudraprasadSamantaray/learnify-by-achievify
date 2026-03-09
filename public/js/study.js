// Check authentication
checkAuth();

// Global variables
let timerInterval = null;
let timeRemaining = 25 * 60; // seconds
let timerDuration = 25 * 60;
let timerType = 'focus';
let currentSessionId = null;
let currentFilter = 'all';
let currentMonth = new Date();

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
        loadDashboard();
        loadSubjects();
        loadTasks();
        loadCalendar();
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

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;
        
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}Tab`).classList.add('active');
        
        // Reload data for the active tab
        if (tabName === 'calendar') loadCalendar();
    });
});

// ==================== DASHBOARD ====================

async function loadDashboard() {
    try {
        const response = await fetch('/api/study/dashboard');
        const data = await response.json();
        
        if (data.success) {
            const stats = data.dashboard;
            document.getElementById('todayMinutes').textContent = stats.today_minutes || 0;
            document.getElementById('pendingTasks').textContent = stats.pending_tasks || 0;
            document.getElementById('upcomingEvents').textContent = stats.upcoming_events || 0;
            document.getElementById('weekPomodoros').textContent = stats.week_pomodoros || 0;
        }
    } catch (error) {
        console.error('Dashboard load error:', error);
    }
}

// ==================== POMODORO TIMER ====================

// Timer mode buttons
document.querySelectorAll('.timer-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (timerInterval) {
            showToast('Please stop the current timer first', 'error');
            return;
        }
        
        document.querySelectorAll('.timer-mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const duration = parseInt(btn.dataset.duration);
        const type = btn.dataset.type;
        
        timerDuration = duration * 60;
        timeRemaining = timerDuration;
        timerType = type;
        
        updateTimerDisplay();
        updateTimerProgress();
        
        document.getElementById('timerLabel').textContent = 
            type === 'focus' ? 'Focus Time' : 
            type === 'short_break' ? 'Short Break' : 'Long Break';
    });
});

// Start timer
document.getElementById('startTimer').addEventListener('click', async () => {
    const subjectId = document.getElementById('pomodoroSubject').value || null;
    
    // Start session in database
    try {
        const response = await fetch('/api/study/pomodoro/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subject_id: subjectId,
                duration_minutes: timerDuration / 60,
                session_type: timerType
            })
        });
        
        const data = await response.json();
        if (data.success) {
            currentSessionId = data.session_id;
            startTimer();
        }
    } catch (error) {
        console.error('Start session error:', error);
        startTimer(); // Start anyway
    }
});

function startTimer() {
    document.getElementById('startTimer').style.display = 'none';
    document.getElementById('pauseTimer').style.display = 'flex';
    
    timerInterval = setInterval(() => {
        timeRemaining--;
        
        if (timeRemaining <= 0) {
            completeTimer();
        }
        
        updateTimerDisplay();
        updateTimerProgress();
    }, 1000);
}

// Pause timer
document.getElementById('pauseTimer').addEventListener('click', () => {
    clearInterval(timerInterval);
    timerInterval = null;
    
    document.getElementById('startTimer').style.display = 'flex';
    document.getElementById('pauseTimer').style.display = 'none';
});

// Reset timer
document.getElementById('resetTimer').addEventListener('click', () => {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    
    timeRemaining = timerDuration;
    currentSessionId = null;
    
    document.getElementById('startTimer').style.display = 'flex';
    document.getElementById('pauseTimer').style.display = 'none';
    
    updateTimerDisplay();
    updateTimerProgress();
});

async function completeTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    
    // Complete session in database
    if (currentSessionId) {
        try {
            await fetch(`/api/study/pomodoro/complete/${currentSessionId}`, {
                method: 'POST'
            });
        } catch (error) {
            console.error('Complete session error:', error);
        }
    }
    
    // Play sound notification
    playNotificationSound();
    
    // Show notification
    showToast(
        timerType === 'focus' ? 
        '🎉 Focus session complete! Take a break!' : 
        '✨ Break is over! Ready to focus?',
        'success'
    );
    
    // Reset
    timeRemaining = timerDuration;
    currentSessionId = null;
    
    document.getElementById('startTimer').style.display = 'flex';
    document.getElementById('pauseTimer').style.display = 'none';
    
    updateTimerDisplay();
    updateTimerProgress();
    loadDashboard(); // Refresh stats
}

function updateTimerDisplay() {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    document.getElementById('timerDisplay').textContent = 
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function updateTimerProgress() {
    const progress = (timeRemaining / timerDuration) * 565.48;
    document.getElementById('timerProgress').style.strokeDashoffset = 565.48 - progress;
}

function playNotificationSound() {
    // Create simple beep sound
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
}

// ==================== SUBJECTS ====================

async function loadSubjects() {
    try {
        const response = await fetch('/api/study/subjects');
        const data = await response.json();
        
        if (data.success) {
            displaySubjects(data.subjects);
            populateSubjectSelects(data.subjects);
        }
    } catch (error) {
        console.error('Load subjects error:', error);
    }
}

function displaySubjects(subjects) {
    const container = document.getElementById('subjectsList');
    
    if (subjects.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                </svg>
                <h3>No Subjects Yet</h3>
                <p>Add your first subject to get started!</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    subjects.forEach(subject => {
        html += `
            <div class="subject-card" style="border-top-color: ${subject.color}">
                <div class="subject-name">${escapeHtml(subject.subject_name)}</div>
                <div class="subject-actions">
                    <button class="btn-subject-delete" onclick="deleteSubject(${subject.id})">
                        Delete
                    </button>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function populateSubjectSelects(subjects) {
    const selects = [
        document.getElementById('pomodoroSubject'),
        document.getElementById('taskSubject'),
        document.getElementById('eventSubject')
    ];
    
    selects.forEach(select => {
        const currentValue = select.value;
        select.innerHTML = '<option value="">Select Subject (Optional)</option>';
        
        subjects.forEach(subject => {
            const option = document.createElement('option');
            option.value = subject.id;
            option.textContent = subject.subject_name;
            option.style.color = subject.color;
            select.appendChild(option);
        });
        
        if (currentValue) select.value = currentValue;
    });
}

// Add subject
document.getElementById('addSubjectForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('subjectName').value.trim();
    const color = document.getElementById('subjectColor').value;
    
    try {
        const response = await fetch('/api/study/subjects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject_name: name, color })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Subject added successfully', 'success');
            document.getElementById('subjectName').value = '';
            document.getElementById('subjectColor').value = '#6366f1';
            loadSubjects();
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        console.error('Add subject error:', error);
        showToast('Failed to add subject', 'error');
    }
});

// Delete subject
async function deleteSubject(id) {
    if (!confirm('Delete this subject? This will also remove it from related tasks and events.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/study/subjects/${id}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Subject deleted', 'success');
            loadSubjects();
            loadTasks(); // Refresh tasks
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        console.error('Delete subject error:', error);
        showToast('Failed to delete subject', 'error');
    }
}

window.deleteSubject = deleteSubject;

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

function formatDate(dateString) {
    if (!dateString) return 'No due date';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}
// ==================== TASKS ====================

async function loadTasks(status = null) {
    try {
        let url = '/api/study/tasks';
        if (status && status !== 'all') {
            url += `?status=${status}`;
        }
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.success) {
            displayTasks(data.tasks);
        }
    } catch (error) {
        console.error('Load tasks error:', error);
    }
}

function displayTasks(tasks) {
    const container = document.getElementById('tasksList');
    
    if (tasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 11l3 3L22 4"></path>
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                </svg>
                <h3>No Tasks Found</h3>
                <p>Add your first task or change the filter.</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    tasks.forEach(task => {
        const isCompleted = task.status === 'completed';
        const dueDate = task.due_date ? new Date(task.due_date) : null;
        const isOverdue = dueDate && dueDate < new Date() && !isCompleted;
        
        html += `
            <div class="task-item priority-${task.priority} ${isCompleted ? 'completed' : ''}">
                <div class="task-header">
                    <input 
                        type="checkbox" 
                        class="task-checkbox" 
                        ${isCompleted ? 'checked' : ''}
                        onchange="updateTaskStatus(${task.id}, this.checked ? 'completed' : 'pending')"
                    >
                    <div class="task-content">
                        <div class="task-title">${escapeHtml(task.task_title)}</div>
                        ${task.task_description ? `<p style="font-size: 13px; color: var(--text-secondary); margin: 4px 0;">${escapeHtml(task.task_description)}</p>` : ''}
                        <div class="task-meta">
                            ${task.subject_name ? `
                                <span style="color: ${task.color}">
                                    <svg style="width: 14px; height: 14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                                        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                                    </svg>
                                    ${escapeHtml(task.subject_name)}
                                </span>
                            ` : ''}
                            ${task.due_date ? `
                                <span class="${isOverdue ? 'text-danger' : ''}">
                                    <svg style="width: 14px; height: 14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                        <line x1="16" y1="2" x2="16" y2="6"></line>
                                        <line x1="8" y1="2" x2="8" y2="6"></line>
                                        <line x1="3" y1="10" x2="21" y2="10"></line>
                                    </svg>
                                    ${formatDate(task.due_date)} ${isOverdue ? '(Overdue)' : ''}
                                </span>
                            ` : ''}
                            <span style="text-transform: uppercase; font-weight: 600;">
                                ${task.priority}
                            </span>
                        </div>
                    </div>
                    <div class="task-actions">
                        ${!isCompleted ? `
                            <button class="btn-task-action" onclick="updateTaskStatus(${task.id}, 'in_progress')">
                                In Progress
                            </button>
                        ` : ''}
                        <button class="btn-task-action btn-task-delete" onclick="deleteTask(${task.id})">
                            Delete
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// Add task
document.getElementById('addTaskForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const title = document.getElementById('taskTitle').value.trim();
    const subjectId = document.getElementById('taskSubject').value || null;
    const dueDate = document.getElementById('taskDueDate').value || null;
    const priority = document.getElementById('taskPriority').value;
    const description = document.getElementById('taskDescription').value.trim();
    
    try {
        const response = await fetch('/api/study/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                task_title: title,
                subject_id: subjectId,
                due_date: dueDate,
                priority,
                task_description: description
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Task added successfully', 'success');
            document.getElementById('addTaskForm').reset();
            loadTasks(currentFilter);
            loadDashboard();
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        console.error('Add task error:', error);
        showToast('Failed to add task', 'error');
    }
});

// Update task status
async function updateTaskStatus(id, status) {
    try {
        const response = await fetch(`/api/study/tasks/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Task updated', 'success');
            loadTasks(currentFilter);
            loadDashboard();
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        console.error('Update task error:', error);
        showToast('Failed to update task', 'error');
    }
}

window.updateTaskStatus = updateTaskStatus;

// Delete task
async function deleteTask(id) {
    if (!confirm('Delete this task?')) return;
    
    try {
        const response = await fetch(`/api/study/tasks/${id}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Task deleted', 'success');
            loadTasks(currentFilter);
            loadDashboard();
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        console.error('Delete task error:', error);
        showToast('Failed to delete task', 'error');
    }
}

window.deleteTask = deleteTask;

// Task filters
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        currentFilter = btn.dataset.filter;
        loadTasks(currentFilter === 'all' ? null : currentFilter);
    });
});

// ==================== CALENDAR ====================

async function loadCalendar() {
    const month = currentMonth.toISOString().slice(0, 7); // YYYY-MM
    
    try {
        const response = await fetch(`/api/study/calendar?month=${month}`);
        const data = await response.json();
        
        if (data.success) {
            renderCalendar(data.events);
            displayEvents(data.events);
        }
    } catch (error) {
        console.error('Load calendar error:', error);
    }
}

function renderCalendar(events) {
    const container = document.getElementById('calendarView');
    const monthLabel = document.getElementById('currentMonth');
    
    monthLabel.textContent = currentMonth.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
    });
    
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    
    // Create event map
    const eventMap = {};
    events.forEach(event => {
        const date = event.event_date.split('T')[0];
        if (!eventMap[date]) eventMap[date] = 0;
        eventMap[date]++;
    });
    
    let html = '';
    
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
        const hasEvents = eventMap[dateStr] > 0;
        
        html += `
            <div class="calendar-day ${isToday ? 'today' : ''} ${hasEvents ? 'has-events' : ''}">
                ${day}
            </div>
        `;
    }
    
    container.innerHTML = html;
}

function displayEvents(events) {
    const container = document.getElementById('eventsList');
    
    if (events.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                <h3>No Events This Month</h3>
                <p>Add your first event above.</p>
            </div>
        `;
        return;
    }
    
    let html = '<h3 style="margin-top: 24px; margin-bottom: 16px;">Events This Month</h3>';
    
    events.forEach(event => {
        const date = new Date(event.event_date);
        const time = event.event_time || 'All day';
        
        html += `
            <div class="event-item type-${event.event_type}">
                <div class="event-header">
                    <div>
                        <div class="event-title">${escapeHtml(event.event_title)}</div>
                        ${event.event_description ? `<p style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">${escapeHtml(event.event_description)}</p>` : ''}
                    </div>
                    <button class="btn-task-action btn-task-delete" onclick="deleteEvent(${event.id})">
                        Delete
                    </button>
                </div>
                <div class="event-meta">
                    📅 ${formatDate(event.event_date)} 
                    ${event.event_time ? `• ⏰ ${time}` : ''}
                    ${event.subject_name ? `• 📚 ${escapeHtml(event.subject_name)}` : ''}
                    • 🏷️ ${event.event_type}
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// Add event
document.getElementById('addEventForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const title = document.getElementById('eventTitle').value.trim();
    const subjectId = document.getElementById('eventSubject').value || null;
    const date = document.getElementById('eventDate').value;
    const time = document.getElementById('eventTime').value || null;
    const type = document.getElementById('eventType').value;
    const description = document.getElementById('eventDescription').value.trim();
    
    try {
        const response = await fetch('/api/study/calendar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event_title: title,
                subject_id: subjectId,
                event_date: date,
                event_time: time,
                event_type: type,
                event_description: description
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Event added successfully', 'success');
            document.getElementById('addEventForm').reset();
            loadCalendar();
            loadDashboard();
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        console.error('Add event error:', error);
        showToast('Failed to add event', 'error');
    }
});

// Delete event
async function deleteEvent(id) {
    if (!confirm('Delete this event?')) return;
    
    try {
        const response = await fetch(`/api/study/calendar/${id}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Event deleted', 'success');
            loadCalendar();
            loadDashboard();
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        console.error('Delete event error:', error);
        showToast('Failed to delete event', 'error');
    }
}

window.deleteEvent = deleteEvent;

// Calendar navigation
document.getElementById('prevMonth').addEventListener('click', () => {
    currentMonth.setMonth(currentMonth.getMonth() - 1);
    loadCalendar();
});

document.getElementById('nextMonth').addEventListener('click', () => {
    currentMonth.setMonth(currentMonth.getMonth() + 1);
    loadCalendar();
});