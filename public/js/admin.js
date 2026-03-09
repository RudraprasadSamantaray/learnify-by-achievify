// Check authentication
checkAuth();

async function checkAuth() {
    try {
        const response = await fetch('/api/check-session');
        const data = await response.json();
        
        if (!data.loggedIn) {
            window.location.href = '/login.html';
            return;
        }
        
        if (!data.is_admin) {
            window.location.href = '/user-dashboard.html';
            return;
        }
        
        // Load initial data
        loadUsers();
        loadPDFs();
        loadSections();
    } catch (error) {
        console.error('Auth check error:', error);
        window.location.href = '/login.html';
    }
}

// Logout functionality
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
        
        // Update active tab button
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Show corresponding content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}Tab`).classList.add('active');
    });
});

// ==================== USER MANAGEMENT ====================

// Add user form submission
document.getElementById('addUserForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const mobileNumber = document.getElementById('mobileNumber').value.trim();
    
    // Validate mobile number
    if (!/^\d{10}$/.test(mobileNumber)) {
        showToast('Please enter a valid 10-digit mobile number', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/admin/add-user', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ mobile_number: mobileNumber })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast(data.message, 'success');
            document.getElementById('mobileNumber').value = '';
            loadUsers(); // Refresh user list
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        console.error('Add user error:', error);
        showToast('Failed to add user. Please try again.', 'error');
    }
});

// Load users
async function loadUsers() {
    const container = document.getElementById('usersList');
    
    try {
        const response = await fetch('/api/admin/users');
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message);
        }
        
        const users = data.users;
        
        if (users.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                    </svg>
                    <h3>No Users Yet</h3>
                    <p>Add mobile numbers to create user accounts.</p>
                </div>
            `;
            return;
        }
        
        let html = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Mobile Number</th>
                        <th>Password (First 4 Digits)</th>
                        <th>Created Date</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        users.forEach(user => {
            const createdDate = new Date(user.created_at).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            });
            
            const password = user.mobile_number.substring(0, 4);
            
            html += `
                <tr>
                    <td><strong>${escapeHtml(user.mobile_number)}</strong></td>
                    <td><code>${password}</code></td>
                    <td>${createdDate}</td>
                    <td>
                        <button class="btn-delete" onclick="deleteUser(${user.id}, '${escapeHtml(user.mobile_number)}')">
                            Delete
                        </button>
                    </td>
                </tr>
            `;
        });
        
        html += `
                </tbody>
            </table>
        `;
        
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading users:', error);
        container.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <h3>Error Loading Users</h3>
                <p>Unable to load users. Please refresh the page.</p>
            </div>
        `;
    }
}

// Delete user
async function deleteUser(userId, mobileNumber) {
    if (!confirm(`Are you sure you want to delete user ${mobileNumber}?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('User deleted successfully', 'success');
            loadUsers(); // Refresh list
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        console.error('Delete user error:', error);
        showToast('Failed to delete user. Please try again.', 'error');
    }
}

// Make deleteUser available globally
window.deleteUser = deleteUser;

// ==================== PDF MANAGEMENT ====================

// Load existing sections for autocomplete
async function loadSections() {
    try {
        const response = await fetch('/api/admin/sections');
        const data = await response.json();
        
        if (data.success && data.sections.length > 0) {
            const datalist = document.getElementById('existingSections');
            datalist.innerHTML = data.sections
                .map(section => `<option value="${escapeHtml(section)}">`)
                .join('');
        }
    } catch (error) {
        console.error('Error loading sections:', error);
    }
}

// Upload PDF form submission
document.getElementById('uploadPdfForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const sectionName = document.getElementById('sectionName').value.trim();
    const pdfFile = document.getElementById('pdfFile').files[0];
    const uploadBtn = document.getElementById('uploadBtn');
    const btnText = uploadBtn.querySelector('.btn-text');
    const btnLoader = uploadBtn.querySelector('.btn-loader');
    const uploadProgress = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    
    if (!sectionName || !pdfFile) {
        showToast('Please fill all fields', 'error');
        return;
    }
    
    if (pdfFile.type !== 'application/pdf') {
        showToast('Please select a PDF file', 'error');
        return;
    }
    
    // Show progress
    uploadBtn.disabled = true;
    btnText.style.display = 'none';
    btnLoader.style.display = 'flex';
    uploadProgress.style.display = 'block';
    progressFill.style.width = '0%';
    progressText.textContent = 'Uploading...';
    
    const formData = new FormData();
    formData.append('pdf', pdfFile);
    formData.append('section', sectionName);
    
    try {
        // Simulate progress (since we can't track actual upload progress easily)
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress += 10;
            if (progress <= 90) {
                progressFill.style.width = progress + '%';
            }
        }, 200);
        
        const response = await fetch('/api/admin/upload-pdf', {
            method: 'POST',
            body: formData
        });
        
        clearInterval(progressInterval);
        progressFill.style.width = '100%';
        
        const data = await response.json();
        
        if (data.success) {
            progressText.textContent = 'Upload complete!';
            showToast('PDF uploaded successfully', 'success');
            
            // Reset form
            document.getElementById('sectionName').value = '';
            document.getElementById('pdfFile').value = '';
            
            setTimeout(() => {
                uploadProgress.style.display = 'none';
            }, 2000);
            
            loadPDFs(); // Refresh PDF list
            loadSections(); // Refresh sections
        } else {
            progressText.textContent = 'Upload failed';
            showToast(data.message, 'error');
        }
    } catch (error) {
        console.error('Upload error:', error);
        progressText.textContent = 'Upload failed';
        showToast('Failed to upload PDF. Please try again.', 'error');
    } finally {
        uploadBtn.disabled = false;
        btnText.style.display = 'block';
        btnLoader.style.display = 'none';
    }
});

// Load PDFs
async function loadPDFs() {
    const container = document.getElementById('pdfsList');
    
    try {
        const response = await fetch('/api/admin/pdfs');
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message);
        }
        
        const pdfs = data.pdfs;
        
        if (pdfs.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                    <h3>No PDFs Uploaded</h3>
                    <p>Upload your first PDF to get started.</p>
                </div>
            `;
            return;
        }
        
        let html = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>File Name</th>
                        <th>Section</th>
                        <th>Upload Date</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        pdfs.forEach(pdf => {
            const uploadDate = new Date(pdf.upload_date).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            html += `
                <tr>
                    <td><strong>${escapeHtml(pdf.original_name)}</strong></td>
                    <td><span style="background: rgba(79, 70, 229, 0.1); padding: 4px 12px; border-radius: 12px; font-size: 13px; color: var(--primary-color);">${escapeHtml(pdf.section)}</span></td>
                    <td>${uploadDate}</td>
                    <td>
                        <button class="btn-delete" onclick="deletePDF(${pdf.id}, '${escapeHtml(pdf.original_name)}')">
                            Delete
                        </button>
                    </td>
                </tr>
            `;
        });
        
        html += `
                </tbody>
            </table>
        `;
        
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading PDFs:', error);
        container.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <h3>Error Loading PDFs</h3>
                <p>Unable to load PDFs. Please refresh the page.</p>
            </div>
        `;
    }
}

// Delete PDF
async function deletePDF(pdfId, pdfName) {
    if (!confirm(`Are you sure you want to delete "${pdfName}"?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/pdfs/${pdfId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('PDF deleted successfully', 'success');
            loadPDFs(); // Refresh list
            loadSections(); // Refresh sections
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        console.error('Delete PDF error:', error);
        showToast('Failed to delete PDF. Please try again.', 'error');
    }
}

// Make deletePDF available globally
window.deletePDF = deletePDF;

// ==================== UTILITY FUNCTIONS ====================

// Show toast notification
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}