import express from 'express'
import { Server } from 'socket.io'
import { createServer } from 'http'
import cors from 'cors'
import dotenv from 'dotenv'
import multer from 'multer'
import ImageKit from 'imagekit'
dotenv.config()

import { toConnectDB } from './src/db/db.js'
import cookieParser from 'cookie-parser'
import routes from './src/Routes/user.routes.js'
import messageModel from './src/Models/chat.models.js'
import userModel from './src/Models/users.models.js'

const app = express()
const server = createServer(app)

// Initialize Socket.IO FIRST
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173','https://chatzone-pi.vercel.app'],
    methods: ["GET", "POST"],
    credentials: true
  }
})

// Initialize ImageKit
const imagekit = new ImageKit({
  publicKey: process.env.IMAGE_KIT_PUBLIC_KEY,
  privateKey: process.env.IMAGE_KIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGE_KIT_URL_END_POINT,
})

// Configure multer for memory storage
const storage = multer.memoryStorage()
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images and videos
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true)
    } else {
      cb(new Error('Only image and video files are allowed'), false)
    }
  }
})

// CORS setup
app.use(cors({
  origin: ['http://localhost:5173','https://chatzone-frontend.vercel.app/'],
  credentials: true
}))

app.use(express.json())
app.use(cookieParser())
0
// Home route
app.get("/", (req, res) => {
  res.send("Home")
})

// File upload endpoint
app.get("/user/messages", async (req, res) => {
  try {
    const { senderId, receiverId } = req.query
    
    if (!senderId || !receiverId) {
      return res.status(400).json({ error: "senderId and receiverId are required" })
    }

    console.log(`🔍 Loading messages between ${senderId} and ${receiverId}`)

    const messages = await messageModel.find({
      $or: [
        { senderId, receiverId },
        { senderId: receiverId, receiverId: senderId }
      ]
    }).sort({ timeStamp: 1 })

    console.log(`📨 Found ${messages.length} messages in database`)

    // ✅ FIXED: Properly format ALL messages including files
    const formattedMessages = messages.map(msg => {
      const formattedMsg = {
        _id: msg._id,
        fromUser: msg.senderId,        // ✅ Always use senderId as fromUser
        toUser: msg.receiverId,        // ✅ Always use receiverId as toUser  
        message: msg.message,
        messageType: msg.messageType || 'text',
        timestamp: msg.timeStamp,
        isRead: msg.isRead
      }

      // ✅ CRITICAL FIX: Include fileInfo for file messages
      if (msg.messageType === 'file' && msg.fileInfo) {
        formattedMsg.fileInfo = {
          fileName: msg.fileInfo.fileName,
          fileSize: msg.fileInfo.fileSize,
          mimeType: msg.fileInfo.mimeType,
          imageKitFileId: msg.fileInfo.imageKitFileId
        }
        console.log(`📎 File message formatted:`, {
          fileName: msg.fileInfo.fileName,
          url: msg.message
        })
      }

      return formattedMsg
    })

    console.log(`✅ Returning ${formattedMessages.length} formatted messages`)
    console.log(`📋 Sample message:`, formattedMessages[0])

    res.json({
      success: true,
      messages: formattedMessages 
    })

  } catch (err) {
    console.error('❌ Error fetching messages:', err)
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch messages',
      details: err.message 
    })
  }
})
app.get("/user/chat/:user1/:user2", async (req, res) => {
  try {
    const { user1, user2 } = req.params
    
    console.log(`🔍 Chat history requested: ${user1} <-> ${user2}`)

    const messages = await messageModel.find({
      $or: [
        { senderId: user1, receiverId: user2 },
        { senderId: user2, receiverId: user1 }
      ]
    }).sort({ timeStamp: 1 })

    const formattedMessages = messages.map(msg => ({
      _id: msg._id,
      fromUser: msg.senderId,
      toUser: msg.receiverId,
      message: msg.message,
      messageType: msg.messageType || 'text',
      fileInfo: msg.fileInfo || null,
      timestamp: msg.timeStamp,
      isRead: msg.isRead
    }))

    console.log(`✅ Chat history loaded: ${formattedMessages.length} messages`)

    res.json({
      success: true,
      messages: formattedMessages
    })

  } catch (error) {
    console.error('❌ Error in chat history:', error)
    res.status(500).json({ 
      success: false,
      error: 'Failed to load chat history' 
    })
  }
})
// Get all registered users
app.get("/user/all-users", async (req, res) => {
  try {
    const allUsers = await userModel.find({}, { name: 1, email: 1, _id: 0 })
    const userList = allUsers.map(user => user.name)
    res.json(userList)
  } catch (error) {
    console.error('Error fetching all users:', error)
    res.status(500).json({ error: 'Failed to fetch users' })
  }
})
// Add this endpoint to your backend server code (paste-2.txt)
// Place it with your other routes, before the socket.io connection handling

app.post("/user/upload-file", upload.single('file'), async (req, res) => {
  try {
    const { senderId, receiverId } = req.body
    
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: "No file uploaded" 
      })
    }

    if (!senderId || !receiverId) {
      return res.status(400).json({ 
        success: false, 
        error: "senderId and receiverId are required" 
      })
    }

    console.log(`📎 File upload: ${req.file.originalname} from ${senderId} to ${receiverId}`)

    // Upload to ImageKit
    const uploadResponse = await imagekit.upload({
      file: req.file.buffer,
      fileName: req.file.originalname,
      folder: "/chat-files"
    })

    console.log(`✅ ImageKit upload successful: ${uploadResponse.url}`)

    // Create file message in database
    const fileMessage = new messageModel({
      senderId,
      receiverId,
      message: uploadResponse.url, // Store the file URL as message
      messageType: 'file',
      fileInfo: {
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        imageKitFileId: uploadResponse.fileId
      },
      timeStamp: new Date(),
      isRead: false
    })

    await fileMessage.save()

    // Prepare message data for socket emission
    const messageData = {
      fromUser: senderId,
      toUser: receiverId,
      message: uploadResponse.url,
      messageType: 'file',
      fileInfo: {
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        imageKitFileId: uploadResponse.fileId,
        fileUrl: uploadResponse.url
      },
      timestamp: new Date().toISOString()
    }

    // Emit to both sender and receiver via socket
    const allSockets = Array.from(io.sockets.sockets.values())
    allSockets.forEach(socket => {
      if (socket.username === senderId || socket.username === receiverId) {
        socket.emit("private-message", messageData)
      }
    })

    console.log(`📤 File message sent: ${req.file.originalname}`)

    res.json({
      success: true,
      message: "File uploaded successfully",
      fileUrl: uploadResponse.url,
      fileInfo: {
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype
      }
    })

  } catch (error) {
    console.error('❌ File upload error:', error)
    
    if (error.message.includes('File size too large')) {
      return res.status(413).json({ 
        success: false, 
        error: "File size exceeds 50MB limit" 
      })
    }
    
    if (error.message.includes('Invalid file type')) {
      return res.status(400).json({ 
        success: false, 
        error: "Only image and video files are allowed" 
      })
    }

    res.status(500).json({ 
      success: false, 
      error: "File upload failed", 
      details: error.message 
    })
  }
})
// Chat history endpoint
// app.get("/user/messages", async (req, res) => {
//   try {
//     const { senderId, receiverId } = req.query
    
//     if (!senderId || !receiverId) {
//       return res.status(400).json({ error: "senderId and receiverId are required" })
//     }

//     const messages = await messageModel.find({
//       $or: [
//         { senderId, receiverId },
//         { senderId: receiverId, receiverId: senderId }
//       ]
//     }).sort({ timeStamp: 1 })

//     // Format messages to match frontend expectations
//     const formattedMessages = messages.map(msg => ({
//       fromUser: msg.senderId,
//       toUser: msg.receiverId,
//       message: msg.message,
//       messageType: msg.messageType || 'text',
//       fileInfo: msg.fileInfo || null,
//       timestamp: msg.timeStamp
//     }))

//     res.json(formattedMessages)
//   } catch (err) {
//     console.error('Error fetching messages:', err)
//     res.status(500).json({ error: 'Failed to fetch messages' })
//   }
// })

// Get unread messages endpoint - MOVED OUTSIDE SOCKET HANDLER
app.get("/user/unread-messages", async (req, res) => {
  try {
    const { username } = req.query // Get username from query params instead
    
    if (!username) {
      return res.status(400).json({ error: "Username is required" })
    }

    // Get all messages where user is receiver and message is unread
    const unreadMessages = await messageModel.aggregate([
      {
        $match: {
          receiverId: username,
          isRead: { $ne: true } // Messages that are not marked as read
        }
      },
      {
        $group: {
          _id: "$senderId",
          count: { $sum: 1 },
          lastMessage: {
            $last: {
              message: "$message",
              timestamp: "$timeStamp",
              messageType: "$messageType",
              fileInfo: "$fileInfo"
            }
          }
        }
      }
    ])

    // Also get last messages for all conversations
    const lastMessages = await messageModel.aggregate([
      {
        $match: {
          $or: [
            { senderId: username },
            { receiverId: username }
          ]
        }
      },
      {
        $sort: { timeStamp: -1 }
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ["$senderId", username] },
              "$receiverId",
              "$senderId"
            ]
          },
          lastMessage: {
            $first: {
              message: "$message",
              timestamp: "$timeStamp",
              messageType: "$messageType",
              fileInfo: "$fileInfo",
              senderId: "$senderId"
            }
          }
        }
      }
    ])

    // Format unread counts
    const unreadCounts = {}
    unreadMessages.forEach(item => {
      unreadCounts[item._id] = item.count
    })

    // Format last messages
    const lastMessagesFormatted = {}
    lastMessages.forEach(item => {
      lastMessagesFormatted[item._id] = {
        message: item.lastMessage.message,
        timestamp: item.lastMessage.timestamp,
        isFile: item.lastMessage.messageType === 'file'
      }
    })

    res.json({
      success: true,
      unreadCounts,
      lastMessages: lastMessagesFormatted
    })

  } catch (error) {
    console.error('Error fetching unread messages:', error)
    res.status(500).json({ error: 'Failed to fetch unread messages' })
  }
})

// Mark messages as read endpoint - MOVED OUTSIDE SOCKET HANDLER
app.post("/user/mark-read", async (req, res) => {
  try {
    const { senderId, receiverId } = req.body
    
    if (!senderId || !receiverId) {
      return res.status(400).json({ error: "senderId and receiverId are required" })
    }

    // Mark all messages from senderId to receiverId as read
    await messageModel.updateMany(
      {
        senderId: senderId,
        receiverId: receiverId,
        isRead: { $ne: true }
      },
      {
        $set: { isRead: true, readAt: new Date() }
      }
    )

    res.json({ success: true })

  } catch (error) {
    console.error('Error marking messages as read:', error)
    res.status(500).json({ error: 'Failed to mark messages as read' })
  }
})

const onlineUsers = new Map()

// Function to get all users with their online status
const getAllUsersWithStatus = async () => {
  try {
    const allUsers = await userModel.find({}, { name: 1, _id: 0 })
    const allUserNames = allUsers.map(user => user.name)
    const onlineUserNames = Array.from(onlineUsers.values())
    
    const usersWithStatus = allUserNames.map(username => ({
      username,
      isOnline: onlineUserNames.includes(username),
      lastSeen: onlineUserNames.includes(username) ? new Date() : null
    }))
    
    return usersWithStatus
  } catch (error) {
    console.error('Error getting users with status:', error)
    return []
  }
}

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("User connected:", socket.id)

  socket.on("register-user", async (username) => {
    onlineUsers.set(socket.id, username)
    socket.username = username

    const usersWithStatus = await getAllUsersWithStatus()
    io.emit("update-users", usersWithStatus)
    
    console.log(`${username} came online. Total users:`, usersWithStatus.length)
  })

  // SINGLE private-message handler with proper read status
  socket.on("private-message", async ({ fromUser, toUser, message }) => {
    try {
      const timestamp = new Date()
      
      // Check if receiver is online
      const receiverSocket = Array.from(io.sockets.sockets.values())
        .find(s => s.username === toUser)
      
      const newMessage = new messageModel({
        senderId: fromUser,
        receiverId: toUser,
        message,
        messageType: 'text',
        timeStamp: timestamp,
        isRead: false // Always start as unread
      })

      await newMessage.save()

      const messageData = {
        fromUser,
        toUser,
        message,
        messageType: 'text',
        timestamp: timestamp
      }

      const allSockets = Array.from(io.sockets.sockets.values())
      allSockets.forEach(s => {
        if (s.username === fromUser || s.username === toUser) {
          s.emit("private-message", messageData)
        }
      })

      console.log(`Private message from ${fromUser} to ${toUser} at ${timestamp.toLocaleTimeString()}: ${message}`)
    } catch (error) {
      console.error('Error handling private message:', error)
      socket.emit("message-error", { 
        error: "Failed to send message",
        originalMessage: { fromUser, toUser, message }
      })
    }
  })

  socket.on("disconnect", async () => {
    const username = onlineUsers.get(socket.id)
    onlineUsers.delete(socket.id)
    
    const usersWithStatus = await getAllUsersWithStatus()
    io.emit("update-users", usersWithStatus)
    
    if (username) {
      console.log(`${username} went offline. Remaining online:`, Array.from(onlineUsers.values()))
    }
  })

  socket.on("error", (error) => {
    console.error("Socket error:", error)
  })
})

// Routes
app.use("/user", routes)

server.listen(3000, () => {
  toConnectDB()
  console.log("Server is running on http://localhost:3000")
})