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
        
        if (data.is_admin) {
            window.location.href = '/admin-dashboard.html';
            return;
        }
        
        // Update user info
        document.getElementById('userInfo').textContent = `User: ${data.mobile_number}`;
        
        // Load PDFs
        loadPDFs();
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

// Load PDFs grouped by section
async function loadPDFs() {
    const container = document.getElementById('pdfSections');
    
    try {
        const response = await fetch('/api/user/pdfs');
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message);
        }
        
        const sections = data.sections;
        
        // Check if there are any PDFs
        if (Object.keys(sections).length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                    <h3>No PDFs Available</h3>
                    <p>No content has been uploaded yet. Please check back later.</p>
                </div>
            `;
            return;
        }
        
        // Create section boxes
        let html = '';
        
        for (const [sectionName, pdfs] of Object.entries(sections)) {
            html += `
                <div class="section-box">
                    <div class="section-header">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                        </svg>
                        <h3>${escapeHtml(sectionName)}</h3>
                    </div>
                    <div class="pdf-list">
            `;
            
            pdfs.forEach(pdf => {
                html += `
                    <div class="pdf-item" onclick="viewPDF(${pdf.id}, '${escapeHtml(pdf.name)}')">
                        <div class="pdf-info">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                                <line x1="16" y1="13" x2="8" y2="13"></line>
                                <line x1="16" y1="17" x2="8" y2="17"></line>
                                <polyline points="10 9 9 9 8 9"></polyline>
                            </svg>
                            <span>${escapeHtml(pdf.name)}</span>
                        </div>
                        <svg class="view-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        }
        
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
                <p>Unable to load content. Please refresh the page.</p>
            </div>
        `;
    }
}

// View PDF in modal
function viewPDF(pdfId, pdfName) {
    // Open in new window using our custom secure viewer
    const pdfUrl = `/pdf-viewer.html?id=${pdfId}&name=${encodeURIComponent(pdfName)}`;
    
    // Open in new window (more secure than iframe)
    const width = Math.min(1200, window.screen.width - 100);
    const height = Math.min(800, window.screen.height - 100);
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;
    
    window.open(
        pdfUrl, 
        'PDFViewer',
        `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=no`
    );
}

// Close modal
document.getElementById('closeModal').addEventListener('click', () => {
    const modal = document.getElementById('pdfModal');
    const pdfViewer = document.getElementById('pdfViewer');
    
    modal.style.display = 'none';
    pdfViewer.src = ''; // Clear PDF
});

// Close modal on background click
document.getElementById('pdfModal').addEventListener('click', (e) => {
    if (e.target.id === 'pdfModal') {
        const modal = document.getElementById('pdfModal');
        const pdfViewer = document.getElementById('pdfViewer');
        
        modal.style.display = 'none';
        pdfViewer.src = ''; // Clear PDF
    }
});

// Prevent right-click on the page
document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});

// Prevent keyboard shortcuts for downloading/printing
document.addEventListener('keydown', (e) => {
    // Prevent Ctrl+S (Save)
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        return false;
    }
    
    // Prevent Ctrl+P (Print)
    if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        return false;
    }
});

// Utility function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}