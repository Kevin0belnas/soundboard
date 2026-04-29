const mongoose = require('mongoose');
const Notification = require('../models/Notification');
 
async function createNotification(userId, type, message, referenceModel = null, referenceId = null) {
  try {
    const notification = new Notification({
      recipient: userId,
      type,
      message,
      referenceModel,
      referenceId,
      isRead: false
    });
    
    await notification.save();
    console.log(`Notification created for ${userId}: ${type}`);
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
  }
}

module.exports = { createNotification };