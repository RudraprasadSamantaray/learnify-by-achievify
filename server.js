const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const fileUpload = require('express-fileupload');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(fileUpload({
    createParentPath: true,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
    abortOnLimit: true,
    responseOnLimit: 'File size limit exceeded',
    useTempFiles: false,
    debug: true // Enable debug mode
}));

app.use(session({
    secret: 'pdf-management-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// MySQL Connection - PDF Management
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'daitari@12584', 
    database: 'pdf_management_system'
});

// MySQL Connection - Study Management
const studyDb = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'daitari@12584', // CHANGE THIS
    database: 'study_management'
});

db.connect((err) => {
    if (err) {
        console.error('Database connection failed:', err);
        process.exit(1);
    }
    console.log('✓ MySQL Connected (PDF Management)');
    
    // Create admin user if not exists
    const adminPassword = bcrypt.hashSync('mobile', 10);
    db.query(
        'INSERT IGNORE INTO users (mobile_number, password, is_admin) VALUES (?, ?, ?)',
        ['mobile', adminPassword, true],
        (err) => {
            if (err) console.error('Error creating admin:', err);
            else console.log('✓ Admin user initialized');
        }
    );
});

studyDb.connect((err) => {
    if (err) {
        console.error('Study Database connection failed:', err);
        console.log('⚠ Study Management features will be disabled');
    } else {
        console.log('✓ MySQL Connected (Study Management)');
    }
});

// Create uploads directory - Force creation on startup
const uploadsDir = path.join(__dirname, 'uploads', 'pdfs');
if (!fs.existsSync(uploadsDir)) {
    console.log('Creating uploads directory...');
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('✓ uploads/pdfs directory created');
} else {
    console.log('✓ uploads/pdfs directory exists');
}

// ==================== AUTHENTICATION ROUTES ====================

// Login Route
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password required' });
    }

    // Check if admin login
    if (username === 'mobile' && password === 'mobile') {
        db.query('SELECT * FROM users WHERE mobile_number = ? AND is_admin = true', 
            [username], 
            (err, results) => {
                if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ success: false, message: 'Server error' });
                }

                if (results.length === 0) {
                    return res.status(401).json({ success: false, message: 'Invalid credentials' });
                }

                req.session.user = {
                    mobile_number: username,
                    is_admin: true
                };

                return res.json({ 
                    success: true, 
                    is_admin: true,
                    message: 'Admin login successful' 
                });
            }
        );
    } else {
        // User login - check if mobile exists and password is first 4 digits
        db.query('SELECT * FROM users WHERE mobile_number = ? AND is_admin = false', 
            [username], 
            (err, results) => {
                if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ success: false, message: 'Server error' });
                }

                if (results.length === 0) {
                    return res.status(401).json({ 
                        success: false, 
                        message: 'Mobile number not registered. Contact admin.' 
                    });
                }

                // Check if password matches first 4 digits
                const firstFourDigits = username.substring(0, 4);
                if (password !== firstFourDigits) {
                    return res.status(401).json({ 
                        success: false, 
                        message: 'Invalid password' 
                    });
                }

                req.session.user = {
                    mobile_number: username,
                    is_admin: false
                };

                return res.json({ 
                    success: true, 
                    is_admin: false,
                    message: 'User login successful' 
                });
            }
        );
    }
});

// Logout Route
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Logout failed' });
        }
        res.json({ success: true, message: 'Logged out successfully' });
    });
});

// Check Session
app.get('/api/check-session', (req, res) => {
    if (req.session.user) {
        res.json({ 
            loggedIn: true, 
            is_admin: req.session.user.is_admin,
            mobile_number: req.session.user.mobile_number
        });
    } else {
        res.json({ loggedIn: false });
    }
});

// ==================== ADMIN ROUTES ====================

// Middleware to check admin
const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.is_admin) {
        next();
    } else {
        res.status(403).json({ success: false, message: 'Admin access required' });
    }
};

// Add User (Mobile Number)
app.post('/api/admin/add-user', isAdmin, (req, res) => {
    const { mobile_number } = req.body;

    if (!mobile_number || mobile_number.length !== 10 || !/^\d+$/.test(mobile_number)) {
        return res.status(400).json({ 
            success: false, 
            message: 'Valid 10-digit mobile number required' 
        });
    }

    const password = mobile_number.substring(0, 4);

    db.query(
        'INSERT INTO users (mobile_number, password, is_admin) VALUES (?, ?, ?)',
        [mobile_number, password, false],
        (err) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(400).json({ 
                        success: false, 
                        message: 'Mobile number already exists' 
                    });
                }
                console.error('Database error:', err);
                return res.status(500).json({ success: false, message: 'Server error' });
            }

            res.json({ 
                success: true, 
                message: `User added. Password: ${password}` 
            });
        }
    );
});

// Get All Users
app.get('/api/admin/users', isAdmin, (req, res) => {
    db.query(
        'SELECT id, mobile_number, created_at FROM users WHERE is_admin = false ORDER BY created_at DESC',
        (err, results) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ success: false, message: 'Server error' });
            }
            res.json({ success: true, users: results });
        }
    );
});

// Delete User
app.delete('/api/admin/users/:id', isAdmin, (req, res) => {
    const userId = req.params.id;

    db.query('DELETE FROM users WHERE id = ? AND is_admin = false', [userId], (err, result) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ success: false, message: 'Server error' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.json({ success: true, message: 'User deleted successfully' });
    });
});

// Upload PDF
app.post('/api/admin/upload-pdf', isAdmin, (req, res) => {
    console.log('Upload request received');
    console.log('Files:', req.files);
    console.log('Body:', req.body);

    if (!req.files || !req.files.pdf) {
        console.error('No file uploaded');
        return res.status(400).json({ success: false, message: 'No PDF file uploaded. Please select a file.' });
    }

    const { section } = req.body;
    if (!section || section.trim() === '') {
        console.error('No section provided');
        return res.status(400).json({ success: false, message: 'Section name is required' });
    }

    const pdfFile = req.files.pdf;
    console.log('File details:', {
        name: pdfFile.name,
        size: pdfFile.size,
        mimetype: pdfFile.mimetype
    });

    if (pdfFile.mimetype !== 'application/pdf') {
        console.error('Invalid file type:', pdfFile.mimetype);
        return res.status(400).json({ success: false, message: 'Only PDF files are allowed' });
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(__dirname, 'uploads', 'pdfs');
    if (!fs.existsSync(uploadsDir)) {
        console.log('Creating uploads directory...');
        fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const filename = Date.now() + '-' + pdfFile.name.replace(/\s+/g, '-');
    const uploadPath = path.join(__dirname, 'uploads', 'pdfs', filename);
    
    console.log('Upload path:', uploadPath);

    pdfFile.mv(uploadPath, (err) => {
        if (err) {
            console.error('File upload error:', err);
            return res.status(500).json({ 
                success: false, 
                message: 'File upload failed: ' + err.message 
            });
        }

        console.log('File saved successfully, inserting into database...');

        db.query(
            'INSERT INTO pdfs (filename, original_name, section, file_path, uploaded_by) VALUES (?, ?, ?, ?, ?)',
            [filename, pdfFile.name, section, uploadPath, req.session.user.mobile_number],
            (err) => {
                if (err) {
                    console.error('Database error:', err);
                    // Delete file if DB insert fails
                    if (fs.existsSync(uploadPath)) {
                        fs.unlinkSync(uploadPath);
                    }
                    return res.status(500).json({ 
                        success: false, 
                        message: 'Database error: ' + err.message 
                    });
                }

                console.log('PDF uploaded successfully');
                res.json({ success: true, message: 'PDF uploaded successfully' });
            }
        );
    });
});

// Get All PDFs (Admin view)
app.get('/api/admin/pdfs', isAdmin, (req, res) => {
    db.query(
        'SELECT id, original_name, section, upload_date FROM pdfs ORDER BY upload_date DESC',
        (err, results) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ success: false, message: 'Server error' });
            }
            res.json({ success: true, pdfs: results });
        }
    );
});

// Delete PDF
app.delete('/api/admin/pdfs/:id', isAdmin, (req, res) => {
    const pdfId = req.params.id;

    db.query('SELECT file_path FROM pdfs WHERE id = ?', [pdfId], (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ success: false, message: 'Server error' });
        }

        if (results.length === 0) {
            return res.status(404).json({ success: false, message: 'PDF not found' });
        }

        const filePath = results[0].file_path;

        db.query('DELETE FROM pdfs WHERE id = ?', [pdfId], (err) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ success: false, message: 'Database error' });
            }

            // Delete physical file
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

            res.json({ success: true, message: 'PDF deleted successfully' });
        });
    });
});

// Get sections
app.get('/api/admin/sections', isAdmin, (req, res) => {
    db.query(
        'SELECT DISTINCT section FROM pdfs ORDER BY section',
        (err, results) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ success: false, message: 'Server error' });
            }
            const sections = results.map(r => r.section);
            res.json({ success: true, sections });
        }
    );
});

// ==================== USER ROUTES ====================

// Middleware to check user authentication
const isUser = (req, res, next) => {
    if (req.session.user && !req.session.user.is_admin) {
        next();
    } else {
        res.status(403).json({ success: false, message: 'User access required' });
    }
};

// Get PDFs for User (grouped by section)
app.get('/api/user/pdfs', isUser, (req, res) => {
    db.query(
        'SELECT id, original_name, section FROM pdfs ORDER BY section, upload_date DESC',
        (err, results) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ success: false, message: 'Server error' });
            }

            // Group by section
            const grouped = {};
            results.forEach(pdf => {
                if (!grouped[pdf.section]) {
                    grouped[pdf.section] = [];
                }
                grouped[pdf.section].push({
                    id: pdf.id,
                    name: pdf.original_name
                });
            });

            res.json({ success: true, sections: grouped });
        }
    );
});

// ==================== SECURE PDF VIEWER ROUTES ====================

// Serve the secure PDF viewer HTML
app.get('/pdf-viewer', isUser, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pdf-viewer-secure.html'));
});

// Serve PDF data (for the viewer) - Streaming endpoint with maximum security
app.get('/api/user/pdf-stream/:id', isUser, (req, res) => {
    const pdfId = req.params.id;

    db.query('SELECT file_path, original_name FROM pdfs WHERE id = ?', [pdfId], (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ success: false, message: 'Server error' });
        }

        if (results.length === 0) {
            return res.status(404).json({ success: false, message: 'PDF not found' });
        }

        const filePath = results[0].file_path;
        const originalName = results[0].original_name;

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: 'File not found on server' });
        }

        // Read file and send with MAXIMUM security headers
        const stat = fs.statSync(filePath);
        
        // Set strict headers to prevent download, caching, and any form of saving
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="document.pdf"'); // Generic name to hide original
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Accept-Ranges', 'bytes');
        
        // Aggressive anti-caching headers
        res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate, max-age=0, no-transform');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        
        // Security headers
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('X-Download-Options', 'noopen');
        res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
        
        // Content Security Policy - only allow our scripts and styles
        res.setHeader('Content-Security-Policy', 
            "default-src 'self'; " +
            "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data:; " +
            "font-src 'self'; " +
            "connect-src 'self'; " +
            "frame-ancestors 'self'; " +
            "form-action 'self';"
        );
        
        // Additional security headers
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('Permissions-Policy', 'downloads=()');
        
        // Create read stream and pipe to response
        const stream = fs.createReadStream(filePath);
        
        stream.on('error', (streamErr) => {
            console.error('Stream error:', streamErr);
            if (!res.headersSent) {
                res.status(500).json({ success: false, message: 'Error streaming PDF' });
            }
        });
        
        stream.pipe(res);
    });
});

// Legacy endpoint - redirect to new secure viewer (for backward compatibility)
app.get('/api/user/view-pdf/:id', isUser, (req, res) => {
    res.redirect(`/pdf-viewer?id=${req.params.id}`);
});

// ==================== STUDY MANAGEMENT ROUTES ====================

// ========== SUBJECTS ==========

// Get all subjects for user
app.get('/api/study/subjects', isUser, (req, res) => {
    const userMobile = req.session.user.mobile_number;
    
    studyDb.query(
        'SELECT * FROM subjects WHERE user_mobile = ? ORDER BY created_at DESC',
        [userMobile],
        (err, results) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ success: false, message: 'Server error' });
            }
            res.json({ success: true, subjects: results });
        }
    );
});

// Add new subject
app.post('/api/study/subjects', isUser, (req, res) => {
    const userMobile = req.session.user.mobile_number;
    const { subject_name, color } = req.body;
    
    if (!subject_name) {
        return res.status(400).json({ success: false, message: 'Subject name required' });
    }
    
    studyDb.query(
        'INSERT INTO subjects (user_mobile, subject_name, color) VALUES (?, ?, ?)',
        [userMobile, subject_name, color || '#6366f1'],
        (err) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ success: false, message: 'Server error' });
            }
            res.json({ success: true, message: 'Subject added successfully' });
        }
    );
});

// Delete subject
app.delete('/api/study/subjects/:id', isUser, (req, res) => {
    const userMobile = req.session.user.mobile_number;
    const subjectId = req.params.id;
    
    studyDb.query(
        'DELETE FROM subjects WHERE id = ? AND user_mobile = ?',
        [subjectId, userMobile],
        (err, result) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ success: false, message: 'Server error' });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, message: 'Subject not found' });
            }
            res.json({ success: true, message: 'Subject deleted successfully' });
        }
    );
});

// ========== TASKS ==========

// Get all tasks for user
app.get('/api/study/tasks', isUser, (req, res) => {
    const userMobile = req.session.user.mobile_number;
    const status = req.query.status; // optional filter
    
    let query = `
        SELECT t.*, s.subject_name, s.color 
        FROM tasks t 
        LEFT JOIN subjects s ON t.subject_id = s.id 
        WHERE t.user_mobile = ?
    `;
    
    const params = [userMobile];
    
    if (status) {
        query += ' AND t.status = ?';
        params.push(status);
    }
    
    query += ' ORDER BY t.due_date ASC, t.priority DESC';
    
    studyDb.query(query, params, (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ success: false, message: 'Server error' });
        }
        res.json({ success: true, tasks: results });
    });
});

// Add new task
app.post('/api/study/tasks', isUser, (req, res) => {
    const userMobile = req.session.user.mobile_number;
    const { subject_id, task_title, task_description, due_date, priority } = req.body;
    
    if (!task_title) {
        return res.status(400).json({ success: false, message: 'Task title required' });
    }
    
    studyDb.query(
        'INSERT INTO tasks (user_mobile, subject_id, task_title, task_description, due_date, priority) VALUES (?, ?, ?, ?, ?, ?)',
        [userMobile, subject_id || null, task_title, task_description || '', due_date || null, priority || 'medium'],
        (err) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ success: false, message: 'Server error' });
            }
            res.json({ success: true, message: 'Task added successfully' });
        }
    );
});

// Update task status
app.patch('/api/study/tasks/:id', isUser, (req, res) => {
    const userMobile = req.session.user.mobile_number;
    const taskId = req.params.id;
    const { status } = req.body;
    
    const completedAt = status === 'completed' ? new Date() : null;
    
    studyDb.query(
        'UPDATE tasks SET status = ?, completed_at = ? WHERE id = ? AND user_mobile = ?',
        [status, completedAt, taskId, userMobile],
        (err, result) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ success: false, message: 'Server error' });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, message: 'Task not found' });
            }
            
            // Update study stats if completed
            if (status === 'completed') {
                updateStudyStats(userMobile, { tasks_completed: 1 });
            }
            
            res.json({ success: true, message: 'Task updated successfully' });
        }
    );
});

// Delete task
app.delete('/api/study/tasks/:id', isUser, (req, res) => {
    const userMobile = req.session.user.mobile_number;
    const taskId = req.params.id;
    
    studyDb.query(
        'DELETE FROM tasks WHERE id = ? AND user_mobile = ?',
        [taskId, userMobile],
        (err, result) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ success: false, message: 'Server error' });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, message: 'Task not found' });
            }
            res.json({ success: true, message: 'Task deleted successfully' });
        }
    );
});

// ========== POMODORO ==========

// Start pomodoro session
app.post('/api/study/pomodoro/start', isUser, (req, res) => {
    const userMobile = req.session.user.mobile_number;
    const { subject_id, task_id, duration_minutes, session_type } = req.body;
    
    studyDb.query(
        'INSERT INTO pomodoro_sessions (user_mobile, subject_id, task_id, duration_minutes, session_type) VALUES (?, ?, ?, ?, ?)',
        [userMobile, subject_id || null, task_id || null, duration_minutes || 25, session_type || 'focus'],
        (err, result) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ success: false, message: 'Server error' });
            }
            res.json({ success: true, session_id: result.insertId });
        }
    );
});

// Complete pomodoro session
app.post('/api/study/pomodoro/complete/:id', isUser, (req, res) => {
    const userMobile = req.session.user.mobile_number;
    const sessionId = req.params.id;
    
    studyDb.query(
        'UPDATE pomodoro_sessions SET completed = TRUE, completed_at = NOW() WHERE id = ? AND user_mobile = ?',
        [sessionId, userMobile],
        (err, result) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ success: false, message: 'Server error' });
            }
            
            // Get session details to update stats
            studyDb.query(
                'SELECT duration_minutes, session_type FROM pomodoro_sessions WHERE id = ?',
                [sessionId],
                (err, sessions) => {
                    if (!err && sessions.length > 0) {
                        const session = sessions[0];
                        if (session.session_type === 'focus') {
                            updateStudyStats(userMobile, {
                                study_minutes: session.duration_minutes,
                                pomodoros_completed: 1
                            });
                        }
                    }
                }
            );
            
            res.json({ success: true, message: 'Session completed' });
        }
    );
});

// Get pomodoro statistics
app.get('/api/study/pomodoro/stats', isUser, (req, res) => {
    const userMobile = req.session.user.mobile_number;
    const days = parseInt(req.query.days) || 7;
    
    studyDb.query(
        `SELECT 
            DATE(started_at) as date,
            COUNT(*) as sessions,
            SUM(CASE WHEN completed = TRUE AND session_type = 'focus' THEN duration_minutes ELSE 0 END) as focus_minutes
        FROM pomodoro_sessions 
        WHERE user_mobile = ? AND started_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY DATE(started_at)
        ORDER BY date DESC`,
        [userMobile, days],
        (err, results) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ success: false, message: 'Server error' });
            }
            res.json({ success: true, stats: results });
        }
    );
});

// ========== CALENDAR ==========

// Get calendar events
app.get('/api/study/calendar', isUser, (req, res) => {
    const userMobile = req.session.user.mobile_number;
    const month = req.query.month; // YYYY-MM format
    
    let query = `
        SELECT e.*, s.subject_name, s.color 
        FROM calendar_events e 
        LEFT JOIN subjects s ON e.subject_id = s.id 
        WHERE e.user_mobile = ?
    `;
    
    const params = [userMobile];
    
    if (month) {
        query += ' AND DATE_FORMAT(e.event_date, "%Y-%m") = ?';
        params.push(month);
    }
    
    query += ' ORDER BY e.event_date ASC, e.event_time ASC';
    
    studyDb.query(query, params, (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ success: false, message: 'Server error' });
        }
        res.json({ success: true, events: results });
    });
});

// Add calendar event
app.post('/api/study/calendar', isUser, (req, res) => {
    const userMobile = req.session.user.mobile_number;
    const { subject_id, event_title, event_description, event_date, event_time, event_type } = req.body;
    
    if (!event_title || !event_date) {
        return res.status(400).json({ success: false, message: 'Event title and date required' });
    }
    
    studyDb.query(
        'INSERT INTO calendar_events (user_mobile, subject_id, event_title, event_description, event_date, event_time, event_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [userMobile, subject_id || null, event_title, event_description || '', event_date, event_time || null, event_type || 'other'],
        (err) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ success: false, message: 'Server error' });
            }
            res.json({ success: true, message: 'Event added successfully' });
        }
    );
});

// Delete calendar event
app.delete('/api/study/calendar/:id', isUser, (req, res) => {
    const userMobile = req.session.user.mobile_number;
    const eventId = req.params.id;
    
    studyDb.query(
        'DELETE FROM calendar_events WHERE id = ? AND user_mobile = ?',
        [eventId, userMobile],
        (err, result) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ success: false, message: 'Server error' });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, message: 'Event not found' });
            }
            res.json({ success: true, message: 'Event deleted successfully' });
        }
    );
});

// ========== DASHBOARD/STATS ==========

// Get dashboard overview
app.get('/api/study/dashboard', isUser, (req, res) => {
    const userMobile = req.session.user.mobile_number;
    
    // Get multiple stats in parallel
    const stats = {};
    let completed = 0;
    const total = 5;
    
    const checkComplete = () => {
        completed++;
        if (completed === total) {
            res.json({ success: true, dashboard: stats });
        }
    };
    
    // Today's study time
    studyDb.query(
        `SELECT COALESCE(SUM(duration_minutes), 0) as minutes 
        FROM pomodoro_sessions 
        WHERE user_mobile = ? AND DATE(started_at) = CURDATE() AND completed = TRUE AND session_type = 'focus'`,
        [userMobile],
        (err, results) => {
            stats.today_minutes = err ? 0 : results[0].minutes;
            checkComplete();
        }
    );
    
    // Pending tasks
    studyDb.query(
        'SELECT COUNT(*) as count FROM tasks WHERE user_mobile = ? AND status != "completed"',
        [userMobile],
        (err, results) => {
            stats.pending_tasks = err ? 0 : results[0].count;
            checkComplete();
        }
    );
    
    // Upcoming events (next 7 days)
    studyDb.query(
        'SELECT COUNT(*) as count FROM calendar_events WHERE user_mobile = ? AND event_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)',
        [userMobile],
        (err, results) => {
            stats.upcoming_events = err ? 0 : results[0].count;
            checkComplete();
        }
    );
    
    // Total subjects
    studyDb.query(
        'SELECT COUNT(*) as count FROM subjects WHERE user_mobile = ?',
        [userMobile],
        (err, results) => {
            stats.total_subjects = err ? 0 : results[0].count;
            checkComplete();
        }
    );
    
    // This week's pomodoros
    studyDb.query(
        `SELECT COUNT(*) as count 
        FROM pomodoro_sessions 
        WHERE user_mobile = ? AND completed = TRUE AND session_type = 'focus' 
        AND started_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`,
        [userMobile],
        (err, results) => {
            stats.week_pomodoros = err ? 0 : results[0].count;
            checkComplete();
        }
    );
});

// Helper function to update study stats
function updateStudyStats(userMobile, updates) {
    const today = new Date().toISOString().split('T')[0];
    
    studyDb.query(
        'INSERT INTO study_stats (user_mobile, stat_date, total_study_minutes, pomodoros_completed, tasks_completed) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE total_study_minutes = total_study_minutes + VALUES(total_study_minutes), pomodoros_completed = pomodoros_completed + VALUES(pomodoros_completed), tasks_completed = tasks_completed + VALUES(tasks_completed)',
        [
            userMobile,
            today,
            updates.study_minutes || 0,
            updates.pomodoros_completed || 0,
            updates.tasks_completed || 0
        ],
        (err) => {
            if (err) console.error('Stats update error:', err);
        }
    );
}

// ==================== ATTENDANCE TRACKER (ATRACK) ROUTES ====================

// Get overall attendance statistics
app.get('/api/atrack/stats', isUser, (req, res) => {
    const userMobile = req.session.user.mobile_number;
    
    studyDb.query(
        `SELECT 
            COUNT(*) as total_lectures,
            SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present_count,
            SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent_count,
            SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count
        FROM attendance_records 
        WHERE user_mobile = ?`,
        [userMobile],
        (err, results) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ success: false, message: 'Server error' });
            }
            
            const stats = results[0];
            const conductedLectures = stats.total_lectures - stats.cancelled_count;
            const attendancePercentage = conductedLectures > 0 
                ? ((stats.present_count / conductedLectures) * 100).toFixed(2)
                : 0;
            
            res.json({
                success: true,
                stats: {
                    total_lectures: stats.total_lectures,
                    present: stats.present_count,
                    absent: stats.absent_count,
                    cancelled: stats.cancelled_count,
                    conducted: conductedLectures,
                    percentage: parseFloat(attendancePercentage)
                }
            });
        }
    );
});

// Get timetable for a specific day
app.get('/api/atrack/timetable/:day', isUser, (req, res) => {
    const userMobile = req.session.user.mobile_number;
    const day = req.params.day.toLowerCase();
    const date = req.query.date; // Optional specific date
    
    studyDb.query(
        `SELECT * FROM timetable 
        WHERE user_mobile = ? AND day_of_week = ?
        ORDER BY start_time`,
        [userMobile, day],
        (err, timetableResults) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ success: false, message: 'Server error' });
            }
            
            // If date provided, get attendance records for that date
            if (date) {
                const timetableIds = timetableResults.map(t => t.id);
                if (timetableIds.length === 0) {
                    return res.json({ success: true, lectures: [] });
                }
                
                studyDb.query(
                    `SELECT * FROM attendance_records 
                    WHERE user_mobile = ? AND lecture_date = ? AND timetable_id IN (?)`,
                    [userMobile, date, timetableIds],
                    (err, attendanceResults) => {
                        if (err) {
                            console.error('Database error:', err);
                            return res.status(500).json({ success: false, message: 'Server error' });
                        }
                        
                        // Merge timetable with attendance
                        const lectures = timetableResults.map(t => {
                            const attendance = attendanceResults.find(a => a.timetable_id === t.id);
                            return {
                                ...t,
                                attendance_status: attendance ? attendance.status : null,
                                attendance_id: attendance ? attendance.id : null
                            };
                        });
                        
                        res.json({ success: true, lectures });
                    }
                );
            } else {
                res.json({ success: true, lectures: timetableResults });
            }
        }
    );
});

// Get all timetable
app.get('/api/atrack/timetable', isUser, (req, res) => {
    const userMobile = req.session.user.mobile_number;
    
    studyDb.query(
        'SELECT * FROM timetable WHERE user_mobile = ? ORDER BY day_of_week, start_time',
        [userMobile],
        (err, results) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ success: false, message: 'Server error' });
            }
            res.json({ success: true, timetable: results });
        }
    );
});

// Add timetable entry
app.post('/api/atrack/timetable', isUser, (req, res) => {
    const userMobile = req.session.user.mobile_number;
    const { day_of_week, subject_name, start_time, end_time } = req.body;
    
    if (!day_of_week || !subject_name || !start_time || !end_time) {
        return res.status(400).json({ success: false, message: 'All fields required' });
    }
    
    studyDb.query(
        'INSERT INTO timetable (user_mobile, day_of_week, subject_name, start_time, end_time) VALUES (?, ?, ?, ?, ?)',
        [userMobile, day_of_week.toLowerCase(), subject_name, start_time, end_time],
        (err) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ success: false, message: 'Server error' });
            }
            res.json({ success: true, message: 'Lecture added successfully' });
        }
    );
});

// Update timetable entry
app.put('/api/atrack/timetable/:id', isUser, (req, res) => {
    const userMobile = req.session.user.mobile_number;
    const lectureId = req.params.id;
    const { subject_name, start_time, end_time } = req.body;
    
    studyDb.query(
        'UPDATE timetable SET subject_name = ?, start_time = ?, end_time = ? WHERE id = ? AND user_mobile = ?',
        [subject_name, start_time, end_time, lectureId, userMobile],
        (err, result) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ success: false, message: 'Server error' });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, message: 'Lecture not found' });
            }
            res.json({ success: true, message: 'Lecture updated successfully' });
        }
    );
});

// Delete timetable entry
app.delete('/api/atrack/timetable/:id', isUser, (req, res) => {
    const userMobile = req.session.user.mobile_number;
    const lectureId = req.params.id;
    
    studyDb.query(
        'DELETE FROM timetable WHERE id = ? AND user_mobile = ?',
        [lectureId, userMobile],
        (err, result) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ success: false, message: 'Server error' });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, message: 'Lecture not found' });
            }
            res.json({ success: true, message: 'Lecture deleted successfully' });
        }
    );
});

// Mark attendance
app.post('/api/atrack/attendance', isUser, (req, res) => {
    const userMobile = req.session.user.mobile_number;
    const { timetable_id, lecture_date, status } = req.body;
    
    if (!timetable_id || !lecture_date || !status) {
        return res.status(400).json({ success: false, message: 'All fields required' });
    }
    
    studyDb.query(
        `INSERT INTO attendance_records (user_mobile, timetable_id, lecture_date, status) 
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE status = VALUES(status)`,
        [userMobile, timetable_id, lecture_date, status],
        (err) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ success: false, message: 'Server error' });
            }
            res.json({ success: true, message: 'Attendance marked successfully' });
        }
    );
});

// Get subject-wise attendance
app.get('/api/atrack/subject-wise', isUser, (req, res) => {
    const userMobile = req.session.user.mobile_number;
    
    studyDb.query(
        `SELECT 
            t.subject_name,
            COUNT(a.id) as total_lectures,
            SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) as present_count,
            SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) as absent_count,
            SUM(CASE WHEN a.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count
        FROM timetable t
        LEFT JOIN attendance_records a ON t.id = a.timetable_id AND a.user_mobile = ?
        WHERE t.user_mobile = ?
        GROUP BY t.subject_name
        ORDER BY t.subject_name`,
        [userMobile, userMobile],
        (err, results) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ success: false, message: 'Server error' });
            }
            
            const subjects = results.map(subject => {
                const conducted = subject.total_lectures - subject.cancelled_count;
                const percentage = conducted > 0 
                    ? ((subject.present_count / conducted) * 100).toFixed(2)
                    : 0;
                
                return {
                    subject_name: subject.subject_name,
                    total: subject.total_lectures,
                    present: subject.present_count,
                    absent: subject.absent_count,
                    cancelled: subject.cancelled_count,
                    conducted: conducted,
                    percentage: parseFloat(percentage)
                };
            });
            
            res.json({ success: true, subjects });
        }
    );
});

// Get weekly report
app.get('/api/atrack/weekly-report', isUser, (req, res) => {
    const userMobile = req.session.user.mobile_number;
    const weeks = parseInt(req.query.weeks) || 4; // Last 4 weeks by default
    
    studyDb.query(
        `SELECT 
            YEARWEEK(lecture_date, 1) as week_num,
            MIN(lecture_date) as week_start,
            MAX(lecture_date) as week_end,
            COUNT(*) as total_lectures,
            SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present_count,
            SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent_count,
            SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count
        FROM attendance_records
        WHERE user_mobile = ? AND lecture_date >= DATE_SUB(CURDATE(), INTERVAL ? WEEK)
        GROUP BY YEARWEEK(lecture_date, 1)
        ORDER BY week_num DESC`,
        [userMobile, weeks],
        (err, results) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ success: false, message: 'Server error' });
            }
            
            const weeklyData = results.map(week => {
                const conducted = week.total_lectures - week.cancelled_count;
                const percentage = conducted > 0 
                    ? ((week.present_count / conducted) * 100).toFixed(2)
                    : 0;
                
                return {
                    week_start: week.week_start,
                    week_end: week.week_end,
                    total: week.total_lectures,
                    present: week.present_count,
                    absent: week.absent_count,
                    cancelled: week.cancelled_count,
                    conducted: conducted,
                    percentage: parseFloat(percentage)
                };
            });
            
            res.json({ success: true, weekly_data: weeklyData });
        }
    );
});

// ==================== START SERVER ====================

app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║   PDF Management System Server Running               ║
║   URL: http://localhost:${PORT}                         ║
║   Admin Login: mobile / mobile                       ║
║   🔒 Secure PDF Viewer ENABLED                       ║
╚═══════════════════════════════════════════════════════╝
    `);
});