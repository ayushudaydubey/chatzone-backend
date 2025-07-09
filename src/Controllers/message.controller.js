import messageModel from "../Models/chat.models.js";
import { generateAIResponse } from "../Services/ai.service.js";
import mongoose from 'mongoose';

// Save regular messages (HTTP endpoint)


export const messageController = async (req, res) => {
  try {
    const {
      fromUser,
      toUser,
      message,
      messageType = 'text',
      fileInfo,
      timestamp,
      isAiBot = false
    } = req.body;

    if (!fromUser || !toUser || !message) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: fromUser, toUser, message"
      });
    }

    if (messageType === 'file' && (!fileInfo || typeof message !== 'string')) {
      return res.status(400).json({
        success: false,
        error: "fileInfo and a valid string message (URL) are required for file messages"
      });
    }

    const now = timestamp ? new Date(timestamp) : new Date();

    const messageData = {
      senderId: fromUser,
      receiverId: toUser,
      fromUser,
      toUser,
      message,
      messageType,
      fileInfo: fileInfo || null,
      timestamp: now,
      timeStamp: now,
      isAiBot,
      isError: false,
      isRead: fromUser === toUser || isAiBot
    };

    const newMessage = await messageModel.create(messageData);

    res.status(201).json({
      success: true,
      message: "Message saved successfully",
      data: {
        _id: newMessage._id,
        fromUser: newMessage.fromUser,
        toUser: newMessage.toUser,
        message: newMessage.message,
        messageType: newMessage.messageType,
        fileInfo: newMessage.fileInfo,
        timestamp: newMessage.timestamp,
        isAiBot: newMessage.isAiBot,
        isRead: newMessage.isRead
      }
    });
  } catch (error) {
    console.error("Error in messageController:", error.message, error.stack);
    res.status(500).json({
      success: false,
      error: "Failed to store message",
      details: error.message
    });
  }
};



// Save AI messages (HTTP endpoint for AI chats)
export const aiMessageSaveController = async (req, res) => {
  try {
    const { fromUser, toUser, message, timestamp, isAiBot = false, isError = false } = req.body;

    if (!fromUser || !toUser || !message) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: fromUser, toUser, message",
      });
    }

    const messageData = {
      senderId: fromUser,
      receiverId: toUser,
      fromUser,
      toUser,
      message,
      messageType: 'ai-chat',
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      timeStamp: timestamp ? new Date(timestamp) : new Date(),
      isAiBot,
      isError,
      isRead: false,
    };

    const savedMessage = await messageModel.create(messageData);

    res.status(201).json({
      success: true,
      message: "AI message saved successfully",
      data: savedMessage,
    });
  } catch (error) {
    console.error("Error in aiMessageSaveController:", error.message, error.stack);
    res.status(500).json({
      success: false,
      error: "Failed to save AI message",
      details: error.message,
    });
  }
};

// Get AI messages
export const getAiMessagesController = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID is required",
      });
    }

    const aiMessages = await messageModel
      .find({
        messageType: 'ai-chat',
        $or: [
          { senderId: userId, receiverId: 'Elva Ai' },
          { senderId: 'Elva Ai', receiverId: userId },
          { fromUser: userId, toUser: 'Elva Ai' },
          { fromUser: 'Elva Ai', toUser: userId },
        ],
      })
      .sort({ timestamp: 1 })
      .lean();

    console.log(`Fetched ${aiMessages.length} AI messages for user: ${userId}`);

    const transformedMessages = aiMessages.map(msg => ({
      fromUser: msg.fromUser || msg.senderId || userId,
      toUser: msg.toUser || msg.receiverId || 'Elva Ai',
      message: msg.message,
      timestamp: msg.timestamp || msg.timeStamp || msg.createdAt,
      messageType: msg.messageType || 'ai-chat',
      isAiBot: msg.isAiBot || msg.senderId === 'Elva Ai' || msg.fromUser === 'Elva Ai',
      isError: msg.isError || false,
      isRead: msg.isRead || false,
      _id: msg._id,
    }));

    res.status(200).json(transformedMessages);
  } catch (error) {
    console.error("Error in getAiMessagesController:", error.message, error.stack);
    res.status(500).json({
      success: false,
      error: "Failed to fetch AI messages",
      details: error.message,
    });
  }
};

// Get messages between two users
// Example fix for your getMessagesController in message.controller.js

export const getMessagesController = async (req, res) => {
  try {
    const { senderId, receiverId } = req.params;
    
    console.log('Fetching messages between:', senderId, 'and', receiverId);
    
    if (!senderId || !receiverId) {
      return res.status(400).json({
        success: false,
        error: 'SenderId and receiverId are required'
      });
    }

    // Fetch messages between the two users
    const messages = await messageModel.find({
      $or: [
        { fromUser: senderId, toUser: receiverId },
        { fromUser: receiverId, toUser: senderId }
      ]
    }).sort({ timestamp: 1 }); // Sort by timestamp ascending

    console.log(`Found ${messages.length} messages`);

    // Return messages directly as an array (not wrapped in an object)
    // This matches what your frontend expects
    return res.status(200).json(messages);

  } catch (error) {
    console.error('Error fetching messages:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Get unread messages and last messages
export const getUnreadMessagesController = async (req, res) => {
  try {
    const { username } = req.query;

    if (!username) {
      return res.status(400).json({
        success: false,
        error: "Username is required",
      });
    }

    // Get unread message counts
    const unreadCounts = {};
    const unreadMessages = await messageModel.find({
      $or: [
        { receiverId: username, isRead: false },
        { toUser: username, isRead: false },
      ],
    }).lean();

    unreadMessages.forEach(msg => {
      const sender = msg.senderId || msg.fromUser;
      if (sender && sender !== username) {
        unreadCounts[sender] = (unreadCounts[sender] || 0) + 1;
      }
    });

    // Get last messages for each conversation
    const lastMessages = {};
    const allConversations = await messageModel.aggregate([
      {
        $match: {
          $or: [
            { senderId: username },
            { receiverId: username },
            { fromUser: username },
            { toUser: username },
          ],
        },
      },
      {
        $addFields: {
          otherUser: {
            $cond: {
              if: { $eq: [{ $ifNull: ["$senderId", "$fromUser"] }, username] },
              then: { $ifNull: ["$receiverId", "$toUser"] },
              else: { $ifNull: ["$senderId", "$fromUser"] },
            },
          },
          sortTimestamp: {
            $ifNull: ["$timestamp", { $ifNull: ["$timeStamp", "$createdAt"] }],
          },
        },
      },
      {
        $sort: { sortTimestamp: -1 },
      },
      {
        $group: {
          _id: "$otherUser",
          lastMessage: { $first: "$$ROOT" },
        },
      },
    ]);

    allConversations.forEach(item => {
      if (item._id && item._id !== username && item.lastMessage) {
        const msg = item.lastMessage;
        lastMessages[item._id] = {
          message: msg.message,
          timestamp: msg.timestamp || msg.timeStamp || msg.createdAt,
          isFile: msg.messageType === 'file',
          messageType: msg.messageType || 'text',
        };
      }
    });

    res.status(200).json({
      success: true,
      unreadCounts,
      lastMessages,
    });
  } catch (error) {
    console.error("Error in getUnreadMessagesController:", error.message, error.stack);
    res.status(500).json({
      success: false,
      error: "Failed to fetch unread messages",
      details: error.message,
    });
  }
};

// Mark messages as read
export const markMessagesAsReadController = async (req, res) => {
  try {
    const { senderId, receiverId } = req.body;

    if (!senderId || !receiverId) {
      return res.status(400).json({
        success: false,
        error: "Both senderId and receiverId are required",
      });
    }

    const result = await messageModel.updateMany(
      {
        $or: [
          { senderId: senderId, receiverId: receiverId, isRead: false },
          { fromUser: senderId, toUser: receiverId, isRead: false },
        ],
      },
      { $set: { isRead: true } }
    );

    console.log(`Marked ${result.modifiedCount} messages as read from ${senderId} to ${receiverId}`);

    res.status(200).json({
      success: true,
      message: "Messages marked as read",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error in markMessagesAsReadController:", error.message, error.stack);
    res.status(500).json({
      success: false,
      error: "Failed to mark messages as read",
      details: error.message,
    });
  }
};

// Save regular messages (for Socket.IO or HTTP)

// Save regular messages (for Socket.IO or HTTP)
// Save regular messages (for Socket.IO or HTTP)
export const saveMessageController = async (req, res) => {
  try {
    const { _id, fromUser, toUser, message, timestamp, messageType = 'text', fileInfo, isAiBot = false } = req.body;
    
    if (!fromUser || !toUser || !message) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: fromUser, toUser, message'
      });
    }

    // Use frontend-provided _id if available
    const messageData = {
      _id: _id || undefined, // Only set if provided
      senderId: fromUser,
      receiverId: toUser,
      message,
      messageType,
      fileInfo: fileInfo || null,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      timeStamp: timestamp ? new Date(timestamp) : new Date(),
      isAiBot,
      isError: false,
      isRead: false,
      fromUser,
      toUser
    };

    // Save to database (Mongo will use _id if provided, else auto-generate)
    const savedMessage = await messageModel.create(messageData);
    
    res.status(201).json({
      success: true,
      message: 'Message saved successfully',
      data: savedMessage
    });

  } catch (error) {
    console.error('Error saving message:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save message',
      details: error.message
    });
  }
};

// Helper function to save messages
export async function saveMessage(messageData) {
  try {
    const savedMessage = await messageModel.create({
      ...messageData,
      timestamp: messageData.timestamp ? new Date(messageData.timestamp) : new Date(),
      timeStamp: messageData.timestamp ? new Date(messageData.timestamp) : new Date(),
    });
    return savedMessage;
  } catch (error) {
    console.error("Error in saveMessage helper:", error.message, error.stack);
    throw error;
  }
}

// Delete message by ID
export const deleteMessageController = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id; // From auth middleware
    
    // Validate message exists and belongs to user
    const message = await messageModel.findById(id);
    if (!message) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }
    
    if (message.fromUser !== userId) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }
    
    // Delete the message
    await messageModel.findByIdAndDelete(id);
    
    res.json({ success: true, message: 'Message deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}