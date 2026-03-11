const express = require('express');
const router = express.Router();
const { db } = require('../config/mysqldb');
const mongoose = require('mongoose');

// Import User model from MongoDB
const User = mongoose.model('User');

// Get all contacts (leads) from MySQL
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

// Get unassigned contacts
router.get('/unassigned/all', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT * FROM contacts 
      WHERE assigned_to IS NULL OR assigned_to = 0
      ORDER BY created_at DESC
    `);
    
    res.json({
      success: true,
      count: rows.length,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching unassigned contacts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching unassigned contacts',
      error: error.message
    });
  }
});

// Get available agents from MongoDB
router.get('/agents/available', async (req, res) => {
  try {
    const users = await User.find({ 
      role: { $in: ['opener', 'closer', 'admin'] } 
    }).select('name email role').sort('name');
    
    const agents = users.map(user => ({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role
    }));
    
    res.json({
      success: true,
      count: agents.length,
      data: agents
    });
    
  } catch (error) {
    console.error('Error fetching agents from MongoDB:', error);
    
    const dummyAgents = [
      { id: "1", name: "John Opener", email: "john@example.com", role: "opener" },
      { id: "2", name: "Jane Closer", email: "jane@example.com", role: "closer" },
      { id: "3", name: "Admin User", email: "admin@example.com", role: "admin" }
    ];
    
    res.json({
      success: true,
      count: dummyAgents.length,
      data: dummyAgents
    });
  }
});

// Bulk assign contacts to agents
router.post('/bulk-assign', async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    const { leadIds, agentId, assignedBy } = req.body;
    
    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of lead IDs'
      });
    }
    
    if (!agentId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide agent ID to assign'
      });
    }
    
    await connection.beginTransaction();
    
    const placeholders = leadIds.map(() => '?').join(',');
    const [updateResult] = await connection.query(
      `UPDATE contacts SET assigned_to = ? WHERE id IN (${placeholders})`,
      [agentId, ...leadIds]
    );
    
    try {
      const historyValues = leadIds.map(leadId => [leadId, agentId, assignedBy || null]);
      await connection.query(
        `INSERT INTO assignment_history (lead_id, agent_id, assigned_by) VALUES ?`,
        [historyValues]
      );
    } catch (historyError) {
      if (historyError.code === 'ER_NO_SUCH_TABLE') {
        console.log('Assignment history table not found, skipping history insert');
      } else {
        throw historyError;
      }
    }
    
    await connection.commit();
    
    res.json({
      success: true,
      message: `Successfully assigned ${updateResult.affectedRows} contacts`,
      assignedCount: updateResult.affectedRows
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error bulk assigning contacts:', error);
    res.status(500).json({
      success: false,
      message: 'Error bulk assigning contacts',
      error: error.message
    });
  } finally {
    connection.release();
  }
});

// Remove assignment from contacts
router.post('/bulk-unassign', async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    const { leadIds } = req.body;
    
    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of lead IDs'
      });
    }
    
    await connection.beginTransaction();
    
    const placeholders = leadIds.map(() => '?').join(',');
    
    const [currentAssignments] = await connection.query(
      `SELECT id, assigned_to FROM contacts WHERE id IN (${placeholders})`,
      leadIds
    );
    
    const [updateResult] = await connection.query(
      `UPDATE contacts SET assigned_to = NULL WHERE id IN (${placeholders})`,
      leadIds
    );
    
    try {
      for (const lead of currentAssignments) {
        if (lead.assigned_to) {
          await connection.query(
            `UPDATE assignment_history 
             SET removed_at = NOW() 
             WHERE lead_id = ? AND agent_id = ? AND removed_at IS NULL`,
            [lead.id, lead.assigned_to]
          );
        }
      }
    } catch (historyError) {
      if (historyError.code === 'ER_NO_SUCH_TABLE') {
        console.log('Assignment history table not found, skipping history update');
      } else {
        throw historyError;
      }
    }
    
    await connection.commit();
    
    res.json({
      success: true,
      message: `Successfully unassigned ${updateResult.affectedRows} contacts`,
      unassignedCount: updateResult.affectedRows
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error bulk unassigning contacts:', error);
    res.status(500).json({
      success: false,
      message: 'Error bulk unassigning contacts',
      error: error.message
    });
  } finally {
    connection.release();
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
       ORDER BY created_at DESC`,
      [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm]
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

// Get dashboard stats
router.get('/stats/summary', async (req, res) => {
  try {
    const [statusCounts] = await db.query(`
      SELECT status, COUNT(*) as count 
      FROM contacts 
      GROUP BY status
    `);
    
    const [agentCounts] = await db.query(`
      SELECT assigned_to, COUNT(*) as count 
      FROM contacts 
      WHERE assigned_to IS NOT NULL 
      GROUP BY assigned_to
    `);
    
    const [totalCount] = await db.query('SELECT COUNT(*) as total FROM contacts');
    
    const [newToday] = await db.query(`
      SELECT COUNT(*) as count 
      FROM contacts 
      WHERE DATE(created_at) = CURDATE()
    `);
    
    const [unassignedCount] = await db.query(`
      SELECT COUNT(*) as count 
      FROM contacts 
      WHERE assigned_to IS NULL OR assigned_to = 0
    `);
    
    const assignedAgentIds = agentCounts
      .map(item => item.assigned_to)
      .filter(id => id);
    
    let agentNames = {};
    if (assignedAgentIds.length > 0) {
      const agents = await User.find({ 
        _id: { $in: assignedAgentIds.map(id => mongoose.Types.ObjectId.isValid(id) ? id : null).filter(id => id) }
      }).select('name');
      
      agents.forEach(agent => {
        agentNames[agent._id.toString()] = agent.name;
      });
    }
    
    res.json({
      success: true,
      stats: {
        total_leads: totalCount[0].total,
        new_leads_today: newToday[0].count,
        unassigned_leads: unassignedCount[0].count,
        by_status: statusCounts,
        by_agent: agentCounts.map(item => ({
          agent_id: item.assigned_to,
          agent_name: agentNames[item.assigned_to] || `Agent ${item.assigned_to}`,
          count: item.count
        }))
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

// Get contacts with pagination
router.get('/page/:page/limit/:limit', async (req, res) => {
  try {
    const page = parseInt(req.params.page) || 1;
    const limit = parseInt(req.params.limit) || 50;
    const offset = (page - 1) * limit;
    
    const [countResult] = await db.query('SELECT COUNT(*) as total FROM contacts');
    const total = countResult[0].total;
    
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

// Get unassigned contacts with pagination
router.get('/unassigned/page/:page/limit/:limit', async (req, res) => {
  try {
    const page = parseInt(req.params.page) || 1;
    const limit = parseInt(req.params.limit) || 50;
    const offset = (page - 1) * limit;
    
    const [countResult] = await db.query(
      'SELECT COUNT(*) as total FROM contacts WHERE assigned_to IS NULL OR assigned_to = 0'
    );
    const total = countResult[0].total;
    
    const [rows] = await db.query(
      'SELECT * FROM contacts WHERE assigned_to IS NULL OR assigned_to = 0 ORDER BY created_at DESC LIMIT ? OFFSET ?',
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
    console.error('Error fetching paginated unassigned contacts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching unassigned contacts',
      error: error.message
    });
  }
});

// Get contacts assigned to specific agent with pagination (MY LEADS TAB)
router.get('/assigned-to/:agentId/page/:page/limit/:limit', async (req, res) => {
  try {
    const agentId = req.params.agentId;
    const page = parseInt(req.params.page) || 1;
    const limit = parseInt(req.params.limit) || 50;
    const offset = (page - 1) * limit;
    const statusFilter = req.query.status;

    let query = 'SELECT * FROM contacts WHERE assigned_to = ?';
    let countQuery = 'SELECT COUNT(*) as total FROM contacts WHERE assigned_to = ?';
    const params = [agentId];
    
    if (statusFilter && statusFilter !== 'all') {
      query += ' AND status = ?';
      countQuery += ' AND status = ?';
      params.push(statusFilter);
    }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    
    const [countResult] = await db.query(countQuery, params);
    const total = countResult[0].total;
    
    const [rows] = await db.query(
      query,
      [...params, limit, offset]
    );
    
    for (let contact of rows) {
      const [history] = await db.query(
        'SELECT assigned_at FROM assignment_history WHERE lead_id = ? AND agent_id = ? AND removed_at IS NULL ORDER BY assigned_at DESC LIMIT 1',
        [contact.id, agentId]
      );
      if (history.length > 0) {
        contact.assigned_at = history[0].assigned_at;
      }
    }
    
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
    console.error('Error fetching assigned contacts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching assigned contacts',
      error: error.message
    });
  }
});

// Get summary stats for agent
router.get('/assigned-to/:agentId/stats', async (req, res) => {
  try {
    const agentId = req.params.agentId;
    
    const [statusCounts] = await db.query(`
      SELECT status, COUNT(*) as count 
      FROM contacts 
      WHERE assigned_to = ?
      GROUP BY status
    `, [agentId]);
    
    const [totalCount] = await db.query(
      'SELECT COUNT(*) as total FROM contacts WHERE assigned_to = ?',
      [agentId]
    );
    
    res.json({
      success: true,
      stats: {
        total: totalCount[0].total,
        by_status: statusCounts
      }
    });
  } catch (error) {
    console.error('Error fetching agent stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching stats',
      error: error.message
    });
  }
});

// UPDATE LEAD RATING (Flagged or Decline)
router.post('/:id/rating', async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    const { id } = req.params;
    const { rating, updatedBy } = req.body;
    
    // Start transaction
    await connection.beginTransaction();
    
    if (rating === 'Decline') {
      // DECLINE: 
      // - Set rating to NULL
      // - Set status to 'Incompleted' 
      // - Set assigned_to to NULL (remove from agent)
      await connection.query(
        `UPDATE contacts SET 
         rating = NULL, 
         status = 'Incompleted',
         assigned_to = NULL,
         rating_updated_at = NOW() 
         WHERE id = ?`,
        [id]
      );
      
      // Update assignment history to mark as removed
      await connection.query(
        `UPDATE assignment_history 
         SET removed_at = NOW() 
         WHERE lead_id = ? AND removed_at IS NULL`,
        [id]
      );
      
      await connection.commit();
      
      res.json({
        success: true,
        message: 'Lead declined and removed from your list'
      });
    } 
    else if (rating === 'Flagged') {
      // FLAGGED: 
      // - Set rating to 'Flagged'
      // - Keep assigned_to as is (stays with agent)
      await connection.query(
        `UPDATE contacts SET 
         rating = 'Flagged', 
         rating_updated_at = NOW() 
         WHERE id = ?`,
        [id]
      );
      
      await connection.commit();
      
      res.json({
        success: true,
        message: 'Lead flagged successfully'
      });
    }
    else {
      return res.status(400).json({
        success: false,
        message: 'Invalid rating. Must be either "Decline" or "Flagged"'
      });
    }
  } catch (error) {
    await connection.rollback();
    console.error('Error updating rating:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating rating',
      error: error.message
    });
  } finally {
    connection.release();
  }
});

// GET MY LEADS (Active leads assigned to agent - not flagged)
router.get('/assigned-to/:agentId/my-leads/page/:page/limit/:limit', async (req, res) => {
  try {
    const agentId = req.params.agentId;
    const page = parseInt(req.params.page) || 1;
    const limit = parseInt(req.params.limit) || 50;
    const offset = (page - 1) * limit;
    const statusFilter = req.query.status;

    // Get leads assigned to this agent - we'll let the database handle the NULL check
    // and just get all leads - the "Flagged" value will be checked when it exists
    let query = 'SELECT * FROM contacts WHERE assigned_to = ?';
    let countQuery = 'SELECT COUNT(*) as total FROM contacts WHERE assigned_to = ?';
    const params = [agentId];
    
    if (statusFilter && statusFilter !== 'all') {
      query += ' AND status = ?';
      countQuery += ' AND status = ?';
      params.push(statusFilter);
    }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    
    const [countResult] = await db.query(countQuery, params);
    const total = countResult[0].total;
    
    const [rows] = await db.query(
      query,
      [...params, limit, offset]
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
    console.error('Error fetching my leads:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching your leads',
      error: error.message
    });
  }
});

// GET FLAGGED LEADS (rating = "Flagged", still assigned to agent)
router.get('/assigned-to/:agentId/flagged/page/:page/limit/:limit', async (req, res) => {
  try {
    const agentId = req.params.agentId;
    const page = parseInt(req.params.page) || 1;
    const limit = parseInt(req.params.limit) || 50;
    const offset = (page - 1) * limit;
    const statusFilter = req.query.status;

    // First, let's check what values exist in the rating column
    const [ratingValues] = await db.query('SELECT DISTINCT rating FROM contacts WHERE rating IS NOT NULL');
    console.log('Existing rating values:', ratingValues);
    
    // Initialize empty result
    let rows = [];
    let total = 0;
    
    // Only query for Flagged if we know it exists or we want to try
    // We'll use a try-catch to handle the error gracefully
    try {
      let query = 'SELECT * FROM contacts WHERE assigned_to = ? AND rating = ?';
      let countQuery = 'SELECT COUNT(*) as total FROM contacts WHERE assigned_to = ? AND rating = ?';
      const params = [agentId, 'Flagged'];
      
      if (statusFilter && statusFilter !== 'all') {
        query += ' AND status = ?';
        countQuery += ' AND status = ?';
        params.push(statusFilter);
      }
      
      query += ' ORDER BY rating_updated_at DESC LIMIT ? OFFSET ?';
      
      const [countResult] = await db.query(countQuery, params);
      total = countResult[0].total;
      
      [rows] = await db.query(
        query,
        [...params, limit, offset]
      );
    } catch (queryError) {
      // If the error is about unknown column 'Flagged', it means no records have this value yet
      // This is expected, so we just return empty array
      console.log('No flagged records found yet:', queryError.message);
      rows = [];
      total = 0;
    }
    
    res.json({
      success: true,
      data: rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1
      }
    });
  } catch (error) {
    console.error('Error fetching flagged leads:', error);
    // Return empty array instead of error
    res.json({
      success: true,
      data: [],
      pagination: {
        page: parseInt(req.params.page) || 1,
        limit: parseInt(req.params.limit) || 50,
        total: 0,
        pages: 1
      }
    });
  }
});

// GET DECLINED LEADS (history of leads this agent declined)
router.get('/assigned-to/:agentId/declined/page/:page/limit/:limit', async (req, res) => {
  try {
    const agentId = req.params.agentId;
    const page = parseInt(req.params.page) || 1;
    const limit = parseInt(req.params.limit) || 50;
    const offset = (page - 1) * limit;
    const statusFilter = req.query.status;

    // Check if assignment_history table exists and has records
    try {
      const [historyExists] = await db.query(
        'SELECT COUNT(*) as count FROM assignment_history WHERE agent_id = ? AND removed_at IS NOT NULL',
        [agentId]
      );
      
      let rows = [];
      let total = 0;
      
      if (historyExists[0].count > 0) {
        // Get leads that were declined by this agent
        let query = `
          SELECT c.* 
          FROM contacts c
          WHERE c.status = 'Incompleted' 
            AND c.assigned_to IS NULL
            AND EXISTS (
              SELECT 1 FROM assignment_history ah 
              WHERE ah.lead_id = c.id 
              AND ah.agent_id = ? 
              AND ah.removed_at IS NOT NULL
            )
        `;
        let countQuery = `
          SELECT COUNT(*) as total 
          FROM contacts c
          WHERE c.status = 'Incompleted' 
            AND c.assigned_to IS NULL
            AND EXISTS (
              SELECT 1 FROM assignment_history ah 
              WHERE ah.lead_id = c.id 
              AND ah.agent_id = ? 
              AND ah.removed_at IS NOT NULL
            )
        `;
        const params = [agentId];
        
        if (statusFilter && statusFilter !== 'all') {
          query += ' AND c.status = ?';
          countQuery += ' AND c.status = ?';
          params.push(statusFilter);
        }
        
        query += ' ORDER BY c.updated_at DESC LIMIT ? OFFSET ?';
        
        const [countResult] = await db.query(countQuery, params);
        total = countResult[0].total;
        
        [rows] = await db.query(
          query,
          [...params, limit, offset]
        );
      }
      
      res.json({
        success: true,
        data: rows,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit) || 1
        }
      });
    } catch (historyError) {
      // If assignment_history table doesn't exist, return empty array
      console.log('Assignment history table not found, returning empty declined list');
      res.json({
        success: true,
        data: [],
        pagination: {
          page,
          limit,
          total: 0,
          pages: 1
        }
      });
    }
  } catch (error) {
    console.error('Error fetching declined leads:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching declined leads',
      error: error.message
    });
  }
});

// Add comment to lead
router.post('/:id/comment', async (req, res) => {
  try {
    const { id } = req.params;
    const { comment, commentedBy, userName } = req.body;
    
    const [existing] = await db.query('SELECT comment FROM contacts WHERE id = ?', [id]);
    
    let newComment;
    if (existing[0]?.comment) {
      newComment = existing[0].comment + `\n\n[${new Date().toLocaleString()} - ${userName}]:\n${comment}`;
    } else {
      newComment = `[${new Date().toLocaleString()} - ${userName}]:\n${comment}`;
    }
    
    await db.query(
      `UPDATE contacts SET 
       comment = ?,
       updated_at = NOW() 
       WHERE id = ?`,
      [newComment, id]
    );
    
    res.json({
      success: true,
      message: 'Comment added successfully'
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding comment',
      error: error.message
    });
  }
});

// Transfer lead to another agent (sets transferred_to and flags the lead)
router.post('/:id/transfer', async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    const { id } = req.params;
    const { targetAgentId, reason, transferredBy } = req.body;
    
    if (!targetAgentId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide target agent ID'
      });
    }
    
    await connection.beginTransaction();
    
    // Get current lead info
    const [currentLead] = await connection.query(
      'SELECT assigned_to, name FROM contacts WHERE id = ?',
      [id]
    );
    const currentAgentId = currentLead[0]?.assigned_to;
    const leadName = currentLead[0]?.name;
    
    // Update the lead:
    // - Set rating to 'Flagged'
    // - Set transferred_to to target agent
    // - Set transferred_at to NOW
    // - Add transfer reason to comments
    // - Keep assigned_to as is (stays with original agent)
    await connection.query(
      `UPDATE contacts SET 
       rating = 'Flagged',
       rating_updated_at = NOW(),
       transferred_to = ?,
       transferred_at = NOW(),
       comment = CONCAT(IFNULL(comment, ''), ?)
       WHERE id = ?`,
      [targetAgentId, `\n[${new Date().toLocaleString()}]: Transferred/Referred to agent ${targetAgentId} - ${reason}`, id]
    );
    
    // Add to assignment history for the transfer
    try {
      await connection.query(
        `INSERT INTO assignment_history (lead_id, agent_id, action, action_reason, action_at) 
         VALUES (?, ?, 'transferred', ?, NOW())`,
        [id, transferredBy, `Transferred to ${targetAgentId}: ${reason}`]
      );
    } catch (historyError) {
      console.log('Assignment history error:', historyError.message);
      // Continue even if history fails
    }
    
    await connection.commit();
    
    res.json({
      success: true,
      message: 'Lead transferred and flagged successfully'
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error transferring lead:', error);
    res.status(500).json({
      success: false,
      message: 'Error transferring lead',
      error: error.message
    });
  } finally {
    connection.release();
  }
});

// Get transferred leads for an agent (leads where transferred_to = agentId)
router.get('/transferred-to/:agentId/page/:page/limit/:limit', async (req, res) => {
  try {
    const agentId = req.params.agentId;
    const page = parseInt(req.params.page) || 1;
    const limit = parseInt(req.params.limit) || 50;
    const offset = (page - 1) * limit;
    const statusFilter = req.query.status;

    // Get leads transferred to this agent
    let query = 'SELECT * FROM contacts WHERE transferred_to = ?';
    let countQuery = 'SELECT COUNT(*) as total FROM contacts WHERE transferred_to = ?';
    const params = [agentId];
    
    if (statusFilter && statusFilter !== 'all') {
      query += ' AND status = ?';
      countQuery += ' AND status = ?';
      params.push(statusFilter);
    }
    
    query += ' ORDER BY transferred_at DESC LIMIT ? OFFSET ?';
    
    const [countResult] = await db.query(countQuery, params);
    const total = countResult[0].total;
    
    const [rows] = await db.query(
      query,
      [...params, limit, offset]
    );
    
    res.json({
      success: true,
      data: rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1
      }
    });
  } catch (error) {
    console.error('Error fetching transferred leads:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching transferred leads',
      error: error.message
    });
  }
});

module.exports = router;