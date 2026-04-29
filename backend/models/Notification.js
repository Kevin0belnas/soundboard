const mongoose = require('mongoose');
const { recompileSchema } = require('./AsteriskDevice');

const notificationSchema = new mongoose.Schema({
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['lead_assigned', 'lead_unassigned', 'lead_transfer', 'lead_declined', 'lead_flagged', 'comment_added', 'script_created', 'script_updated', 'script_deleted', 'audio_generation_failed', 'regenerate_audio_failed', 'new_user_registered', 'voice_clone_submitted', 'voice_clone_approved', 'voice_clone_rejected', 'voice_clone_removed'],
        required: true
    },
    message: {
        type: String,
        required: true
    },
    isRead: {
        type: Boolean,
        default: false
    },
    referenceId: {
        type: String
    },
    referenceModel: {
        type: String,
        enum: ['Lead', 'Script', 'User'] 
    },
    date: {
        type: Date,
        default: Date.now
    },
});

module.exports = mongoose.model("Notification", notificationSchema);