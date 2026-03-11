const express = require('express');
const router = express.Router();
const { db } = require('../config/mysqldb');

// Get all contacts (leads)
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT * FROM contacts 
      ORDER BY created_at DESC
    `);
    
    res.json({
      success: true,
      count: rows.length,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching contacts',
      error: error.message
    });
  }
});

// Get contact by ID
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM contacts WHERE id = ?',
      [req.params.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }
    
    res.json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error('Error fetching contact:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching contact',
      error: error.message
    });
  }
});

// Get contacts by status
router.get('/status/:status', async (req, res) => {
  try {
    const validStatuses = ['New', 'Contacted', 'In Progress', 'Closed', 'Completed', 'Incompleted', 'Transferred'];
    
    if (!validStatuses.includes(req.params.status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
      });
    }

    const [rows] = await db.query(
      'SELECT * FROM contacts WHERE status = ? ORDER BY created_at DESC',
      [req.params.status]
    );
    
    res.json({
      success: true,
      count: rows.length,
      status: req.params.status,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching contacts by status:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching contacts by status',
      error: error.message
    });
  }
});

// Get contacts by assigned agent
router.get('/assigned-to/:agentId', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM contacts WHERE assigned_to = ? ORDER BY created_at DESC',
      [req.params.agentId]
    );
    
    res.json({
      success: true,
      count: rows.length,
      assigned_to: req.params.agentId,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching contacts by agent:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching contacts by agent',
      error: error.message
    });
  }
});

// Search contacts
router.get('/search/:term', async (req, res) => {
  try {
    const searchTerm = `%${req.params.term}%`;
    const [rows] = await db.query(
      `SELECT * FROM contacts 
       WHERE name LIKE ? 
          OR email LIKE ? 
          OR phone LIKE ? 
          OR book_title LIKE ?
          OR publisher LIKE ?
          OR author LIKE ?
          OR comment LIKE ?
          OR street_address LIKE ?
          OR city LIKE ?
          OR state LIKE ?
          OR CAST(id AS CHAR) LIKE ?
       ORDER BY created_at DESC`,
      [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm]
    );
    
    res.json({
      success: true,
      count: rows.length,
      searchTerm: req.params.term,
      data: rows
    });
  } catch (error) {
    console.error('Error searching contacts:', error);
    res.status(500).json({
      success: false,
      message: 'Error searching contacts',
      error: error.message
    });
  }
});

// Get recent contacts
router.get('/recent/limit/:count', async (req, res) => {
  try {
    const limit = parseInt(req.params.count) || 10;
    const [rows] = await db.query(
      'SELECT * FROM contacts ORDER BY created_at DESC LIMIT ?',
      [limit]
    );
    
    res.json({
      success: true,
      count: rows.length,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching recent contacts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching recent contacts',
      error: error.message
    });
  }
});

// Get contacts with pagination
router.get('/page/:page/limit/:limit', async (req, res) => {
  try {
    const page = parseInt(req.params.page) || 1;
    const limit = parseInt(req.params.limit) || 10;
    const offset = (page - 1) * limit;
    
    // Get total count
    const [countResult] = await db.query('SELECT COUNT(*) as total FROM contacts');
    const total = countResult[0].total;
    
    // Get paginated data
    const [rows] = await db.query(
      'SELECT * FROM contacts ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );
    
    res.json({
      success: true,
      data: rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching paginated contacts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching contacts',
      error: error.message
    });
  }
});

// Get contacts by date range
router.get('/date-range', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both startDate and endDate (YYYY-MM-DD format)'
      });
    }
    
    const [rows] = await db.query(
      'SELECT * FROM contacts WHERE DATE(created_at) BETWEEN ? AND ? ORDER BY created_at DESC',
      [startDate, endDate]
    );
    
    res.json({
      success: true,
      count: rows.length,
      dateRange: { startDate, endDate },
      data: rows
    });
  } catch (error) {
    console.error('Error fetching contacts by date range:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching contacts by date range',
      error: error.message
    });
  }
});

// Get contacts by city
router.get('/city/:city', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM contacts WHERE city LIKE ? ORDER BY created_at DESC',
      [`%${req.params.city}%`]
    );
    
    res.json({
      success: true,
      count: rows.length,
      city: req.params.city,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching contacts by city:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching contacts by city',
      error: error.message
    });
  }
});

// Get contacts with assignment history
router.get('/:id/assignment-history', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT ah.*, c.name as lead_name, c.email as lead_email 
       FROM assignment_history ah
       LEFT JOIN contacts c ON ah.lead_id = c.id
       WHERE ah.lead_id = ?
       ORDER BY ah.assigned_at DESC`,
      [req.params.id]
    );
    
    res.json({
      success: true,
      lead_id: req.params.id,
      count: rows.length,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching assignment history:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching assignment history',
      error: error.message
    });
  }
});

// Get contacts by rating
router.get('/rating/:rating', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM contacts WHERE rating = ? ORDER BY rating_updated_at DESC',
      [req.params.rating]
    );
    
    res.json({
      success: true,
      count: rows.length,
      rating: req.params.rating,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching contacts by rating:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching contacts by rating',
      error: error.message
    });
  }
});

// Get transferred contacts
router.get('/transferred/all', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT * FROM contacts 
       WHERE transferred_to IS NOT NULL 
          OR transferred_to_gmail IS NOT NULL
       ORDER BY transferred_at DESC`
    );
    
    res.json({
      success: true,
      count: rows.length,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching transferred contacts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching transferred contacts',
      error: error.message
    });
  }
});

// Get contacts by payment status
router.get('/payment-status/:status', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM contacts WHERE payment_status LIKE ? ORDER BY created_at DESC',
      [`%${req.params.status}%`]
    );
    
    res.json({
      success: true,
      count: rows.length,
      payment_status: req.params.status,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching contacts by payment status:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching contacts by payment status',
      error: error.message
    });
  }
});

// Get dashboard stats
router.get('/stats/summary', async (req, res) => {
  try {
    // Total counts by status
    const [statusCounts] = await db.query(`
      SELECT status, COUNT(*) as count 
      FROM contacts 
      GROUP BY status
    `);
    
    // Total counts by assigned agent
    const [agentCounts] = await db.query(`
      SELECT assigned_to, COUNT(*) as count 
      FROM contacts 
      WHERE assigned_to IS NOT NULL 
      GROUP BY assigned_to
    `);
    
    // Recent assignments
    const [recentAssignments] = await db.query(`
      SELECT * FROM assignment_history 
      ORDER BY assigned_at DESC 
      LIMIT 10
    `);
    
    // Total leads count
    const [totalCount] = await db.query('SELECT COUNT(*) as total FROM contacts');
    
    // New leads today
    const [newToday] = await db.query(`
      SELECT COUNT(*) as count 
      FROM contacts 
      WHERE DATE(created_at) = CURDATE()
    `);
    
    res.json({
      success: true,
      stats: {
        total_leads: totalCount[0].total,
        new_leads_today: newToday[0].count,
        by_status: statusCounts,
        by_agent: agentCounts,
        recent_assignments: recentAssignments
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching stats',
      error: error.message
    });
  }
});

module.exports = router;